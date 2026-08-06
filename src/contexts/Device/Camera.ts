import {
  Chunk,
  Console,
  Context,
  Effect,
  Fiber,
  Layer,
  Option,
  Schedule,
  Sink,
  Stream,
  pipe,
} from "effect";
import { createSignal } from "solid-js";
import { z } from "zod";

const TelemetrySchema = z.object({
  TimeOn: z.number(),
  FFCState: z.string(),
  FrameCount: z.number(),
  FrameMean: z.number(),
  TempC: z.number(),
  LastFFCTempC: z.number(),
  LastFFCTime: z.number(),
});
export type Telemetry = z.infer<typeof TelemetrySchema>;

const CameraInfoSchema = z.object({
  Brand: z.string().or(z.number()).optional(),
  Model: z.string().or(z.number()).optional(),
  FPS: z.number().optional(),
  ResX: z.number(),
  ResY: z.number(),
  Firmware: z.string().optional(),
  CameraSerial: z.number().optional(),
});
export type CameraInfo = z.infer<typeof CameraInfoSchema>;

const PredictionSchema = z.object({
  label: z.string(),
  confidence: z.number(),
  clairty: z.number(),
});
export type Prediction = z.infer<typeof PredictionSchema>;

const RegionSchema = z.object({
  mass: z.number(),
  frame_number: z.number(),
  pixel_variance: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type Region = z.infer<typeof RegionSchema>;

const TrackSchema = z.object({
  predictions: z.array(PredictionSchema),
  positions: z.array(RegionSchema),
});
export type Track = z.infer<typeof TrackSchema>;

const FrameInfoSchema = z.object({
  Telemetry: TelemetrySchema,
  AppVersion: z.string().optional(),
  BinaryVersion: z.string().optional(),
  Camera: CameraInfoSchema,
  Tracks: z.nullable(z.array(TrackSchema)),
});
export type FrameInfo = z.infer<typeof FrameInfoSchema>;
export type Frame = {
  frameInfo: FrameInfo;
  frame: Uint16Array;
};

type ConnectedWebSocket = {
  send: (message: Message) => Effect.Effect<void, never, never>;
  listen: Stream.Stream<MessageEvent<unknown>, Event, never>;
};

class WS extends Context.Tag("WS")<WS, WebSocket>() {}
class ConnectedWS extends Context.Tag("CWS")<
  ConnectedWS,
  ConnectedWebSocket
>() {}

const sendWsMessage = (ws: WebSocket) => (options: Message) => {
  const { type, uuid, ...rest } = options;
  const message = JSON.stringify({ type, uuid, ...rest });
  return Effect.sync(() => ws.send(message));
};

const listener = Layer.effect(
  ConnectedWS,
  Effect.gen(function* (_) {
    const ws = yield* _(WS);
    yield* _(Effect.addFinalizer(() => Effect.sync(() => ws.close())));
    const send = sendWsMessage(ws);
    const listen = Stream.async<MessageEvent<unknown>, Event, never>((emit) => {
      ws.onmessage = (event) => emit(Effect.succeed(Chunk.of(event)));
      ws.onerror = (error) => emit(Effect.fail(Option.some(error)));
      ws.onclose = () => emit(Effect.fail(Option.none()));
    });
    return {
      send,
      listen,
    } satisfies ConnectedWebSocket;
  })
);

function openWebSocketConnection(host: string) {
  return Effect.async<WebSocket, Event, never>((resolve) => {
    const ws = new WebSocket(`ws://${host}/ws`);
    ws.onopen = () => resolve(Effect.succeed(ws));
    ws.onerror = (error) => resolve(Effect.fail(error));
  });
}

type MessageOptions = {
  type: "Register" | "Heartbeat";
  uuid: number;
};

type Message = MessageOptions &
  (
    | {
        type: "Register";
        data: string;
      }
    | {
        type: "Heartbeat";
      }
  );

type OnFrame = (value: {
  frame: Uint16Array;
  frameInfo: z.infer<typeof FrameInfoSchema>;
}) => void;

const filterBlobFromMessage = (
  message: MessageEvent<unknown>
): Option.Option<Blob> => {
  const { data } = message;
  if (data instanceof Blob) {
    return Option.some(data);
  }
  return Option.none();
};

export default function DeviceCamera(host: string) {
  const [on, setOn] = createSignal(false);
  const [onFrame, setOnFrame] = createSignal<OnFrame | null>(null);
  const [connectionActive, setConnectionActive] = createSignal(false);
  const [reconnecting, setReconnecting] = createSignal(false);
  const [preloaded, setPreloaded] = createSignal(false);
  const [lastActivity, setLastActivity] = createSignal(Date.now());
  let reconnectTimeout: number | null = null;

  function processFrame(frame: Blob) {
    const stream = Effect.promise(() => frame.arrayBuffer());

    return Effect.gen(function* (_) {
      try {
        const arrayBuffer = yield* _(stream);
        const frameInfoLength = new Uint16Array(arrayBuffer.slice(0, 2))[0];
        const offset = 2;
        const frameInfoOffset = offset + frameInfoLength;

        const frameInfoView = arrayBuffer.slice(2, frameInfoOffset);

        const decoder = new TextDecoder();
        const text = decoder.decode(frameInfoView);
        const frameInfo = FrameInfoSchema.parse(JSON.parse(text));

        const frameSizeInBytes =
          frameInfo.Camera.ResX * frameInfo.Camera.ResY * 2;
        const frame = new Uint16Array(
          arrayBuffer.slice(frameInfoOffset, frameInfoOffset + frameSizeInBytes)
        );

        if (reconnecting()) {
          setReconnecting(false);
        }

        setLastActivity(Date.now());

        setConnectionActive(true);

        const onF = onFrame();
        if (onF) {
          onF({ frameInfo, frame });
        }

        return true;
      } catch (error) {
        console.error("Error processing frame:", error);

        return true;
      }
    });
  }

  // random 13 digit number
  const id = Math.floor(Math.random() * 10000000000000);

  const applyHeartbeat = (connectedWS: ConnectedWebSocket) => {
    const heartbeatSchedule = Schedule.spaced("2 seconds");
    const isOn = Schedule.recurWhile(() => on());
    return Effect.repeat(
      Effect.gen(function* (_) {
        yield* _(connectedWS.send({ type: "Heartbeat", uuid: id }));
        // Update connection active state
        setConnectionActive(true);
      }),
      Schedule.compose(heartbeatSchedule, isOn)
    );
  };

  const openWSConnection = () => {
    const ws = Layer.effect(WS, openWebSocketConnection(host));
    const connectedWSLayer = listener.pipe(Layer.provide(ws));
    return connectedWSLayer;
  };

  const intializeCameraSocket = Effect.gen(function* (_) {
    const connectedWS = yield* _(ConnectedWS);

    yield* _(
      connectedWS.send({
        type: "Register",
        uuid: id,
        data: navigator.userAgent,
      })
    );

    console.log("connected to camera websocket");
    setConnectionActive(true);
    setPreloaded(true);

    const getWebSocketInstance = Effect.sync(() => {
      window.addEventListener("offline", () => {
        console.log("Network offline, marking connection as inactive");
        setConnectionActive(false);
        attemptReconnect();
      });

      const checkInterval = setInterval(() => {
        if (!connectionActive() && on()) {
          console.log("Connection appears inactive, attempting reconnect");
          attemptReconnect();
        }

        const inactivityPeriod = 10 * 60 * 1000; // 10 minutes instead of 5
        if (
          connectionActive() &&
          !onFrame() &&
          Date.now() - lastActivity() > inactivityPeriod
        ) {
          console.log("Camera inactive, conserving resources");
          setConnectionActive(false);
        }
      }, 10000);

      return Effect.sync(() => {
        window.removeEventListener("offline", attemptReconnect);
        clearInterval(checkInterval);
      });
    });

    yield* _(Effect.acquireRelease(getWebSocketInstance, (cleanup) => cleanup));

    const heartbeatFiber = yield* _(Effect.fork(applyHeartbeat(connectedWS)));

    yield* _(
      Effect.addFinalizer(() => Fiber.interrupt(heartbeatFiber))
    );

    yield* _(
      connectedWS.listen.pipe(
        Stream.filterMap(filterBlobFromMessage),
        Stream.run(Sink.forEachWhile(processFrame))
      )
    );
  });

  const attemptReconnect = () => {
    if (reconnecting() || !on()) return;

    setReconnecting(true);
    console.log("Attempting to reconnect to camera feed...");

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }

    reconnectTimeout = setTimeout(() => {
      if (on()) {
        run();
      }
      reconnectTimeout = null;
    }, 2000) as unknown as number;
  };

  const run = () => {
    console.log("Starting/reconnecting camera feed");

    return Effect.runPromise(
      Effect.provide(intializeCameraSocket, openWSConnection()).pipe(
        Effect.scoped
      )
    ).catch((error) => {
      console.error("Error in camera connection:", error);
      setConnectionActive(false);

      if (on()) {
        attemptReconnect();
      }
    });
  };

  const toggle = () => {
    const newValue = !on();
    setOn(newValue);
    if (!newValue) {
      setConnectionActive(false);
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    } else if (newValue && !connectionActive()) {
      run();
    }
    return newValue;
  };

  const preload = () => {
    if (!on() && !preloaded()) {
      console.log("Preloading camera connection");
      setOn(true);
      run();
    }
  };

  const isReady = () => {
    return preloaded() && connectionActive();
  };

  return {
    run,
    on: () => {
      setOn(true);
      return true;
    },
    toggle,
    setOnFrame,
    isConnected: () => connectionActive(),
    preload,
    isReady,
  };
}

export const preloadedCameras = new Map<
  string,
  ReturnType<typeof DeviceCamera>
>();

export function preloadCamera(host: string) {
  if (!preloadedCameras.has(host)) {
    const camera = DeviceCamera(host);
    camera.preload();
    preloadedCameras.set(host, camera);
  }
  return preloadedCameras.get(host)!;
}

export function getDeviceCamera(host: string) {
  if (preloadedCameras.has(host)) {
    return preloadedCameras.get(host)!;
  }
  const camera = DeviceCamera(host);
  preloadedCameras.set(host, camera);
  return camera;
}
