import {
  Chunk,
  Console,
  Context,
  Effect,
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
  Model: z.string().or(z.number()),
  FPS: z.number(),
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
  AppVersion: z.string(),
  BinaryVersion: z.string(),
  Camera: CameraInfoSchema,
  Tracks: z.nullable(z.array(TrackSchema)),
});
export type FrameInfo = z.infer<typeof FrameInfoSchema>;
export type Frame = {
  frameInfo: FrameInfo;
  frame: Uint16Array;
};

type ConnectedWebSocket = {
  send: (message: Message) => Effect.Effect<never, never, void>;
  listen: Stream.Stream<never, Event, MessageEvent<unknown>>;
};

const WS = Context.Tag<WebSocket>();
const ConnectedWS = Context.Tag<ConnectedWebSocket>();

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
    const listen = Stream.async<never, Event, MessageEvent<unknown>>((emit) => {
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
  return Effect.async<never, Event, WebSocket>((resolve) => {
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
  const processFrame = (frame: Blob) => {
    const stream = Effect.promise(() => frame.arrayBuffer());
    return Effect.gen(function* (_) {
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
      const onF = onFrame();
      if (onF) {
        onF({ frameInfo, frame });
      }
      return on();
    });
  };
  // random 13 digit number
  const id = Math.floor(Math.random() * 10000000000000);
  const applyHeartbeat = (connectedWS: ConnectedWebSocket) => {
    const heartbeatSchedule = Schedule.spaced("5 seconds");
    const isOn = Schedule.recurWhile(on);
    return Effect.repeat(
      connectedWS.send({ type: "Heartbeat", uuid: id }),
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
    console.log("connected");
    yield* _(Effect.fork(applyHeartbeat(connectedWS)));
    yield* _(
      connectedWS.listen.pipe(
        Stream.filterMap(filterBlobFromMessage),
        Stream.run(Sink.forEachWhile(processFrame))
      )
    );
  });

  const run = () =>
    Effect.runPromise(
      Effect.provide(intializeCameraSocket, openWSConnection()).pipe(
        Effect.scoped
      )
    );

  return { run, on: () => setOn(true), toggle: () => setOn(!on()), setOnFrame };
}
