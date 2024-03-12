import { KeepAwake } from "@capacitor-community/keep-awake";
import { HttpResponse, registerPlugin } from "@capacitor/core";
import { CapacitorHttp } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import { Geolocation } from "@capacitor/geolocation";
import { createContextProvider } from "@solid-primitives/context";
import { ReactiveMap, ReactiveWeakMap } from "@solid-primitives/map";
import { createStore } from "solid-js/store";
import { debounce, leading } from "@solid-primitives/scheduled";
import { ReactiveSet } from "@solid-primitives/set";
import { createEffect, createResource, createSignal } from "solid-js";
import { z } from "zod";
import { GoToPermissions } from "~/components/GoToPermissions";
import { Coords, Location } from "~/database/Entities/Location";
import { CallbackId, Res, Result, URL } from "..";
import { logError, logSuccess, logWarning } from "../Notification";
import { useStorage } from "../Storage";
import { isWithinRange } from "../Storage/location";
import DeviceCamera from "./Camera";

const WifiNetwork = z
  .object({
    SSID: z.string(),
    Quality: z.string(),
    "Signal Level": z.string().optional(),
    Security: z.string().optional(),
  })
  .transform((val) => {
    // Quality is a string of the form "xx/70" where xx is the signal level
    const quality = Math.round((parseInt(val.Quality) / 70) * 100);
    const isSecured = !val.Security || val.Security !== "Unknown";
    return {
      SSID: val.SSID,
      quality,
      signalLevel: val["Signal Level"],
      isSecured,
    };
  });
export type WifiNetwork = z.infer<typeof WifiNetwork>;

export type DeviceId = string;
export type DeviceName = string;
export type DeviceHost = string;
export type DeviceType = "pi" | "tc2";
export type DeviceUrl = { url: URL };
export type RecordingName = string;

export type DeviceDetails = {
  id: DeviceId;
  saltId?: string;
  host: DeviceHost;
  name: DeviceName;
  group: string;
  endpoint: string;
  isProd: boolean;
  timeFound: Date;
  locationSet: boolean;
  url: URL;
  type: "pi" | "tc2";
};

type DeviceCoords<T extends string | number> = {
  latitude: T;
  longitude: T;
  altitude: T;
  accuracy: T;
  timestamp: string;
};

export type ConnectedDevice = DeviceDetails & {
  isConnected: true;
};

export type DisconnectedDevice = DeviceDetails & {
  isConnected: false;
};

export type Device = ConnectedDevice | DisconnectedDevice;

export interface DevicePlugin {
  discoverDevices(
    onFoundDevice: (
      device: { endpoint: string; host: string } | undefined
    ) => void
  ): Promise<CallbackId>;
  stopDiscoverDevices(options: { id: CallbackId }): Promise<void>;
  checkDeviceConnection(options: DeviceUrl): Result;
  getDeviceInfo(options: DeviceUrl): Result<string>;
  getDeviceConfig(options: DeviceUrl): Result<string>;
  updateRecordingWindow(
    options: DeviceUrl & { on: string; off: string }
  ): Result;
  getDeviceLocation(options: DeviceUrl): Result<string>;
  setDeviceLocation(options: DeviceUrl & DeviceCoords<string>): Result;
  getRecordings(options: DeviceUrl): Result<string[]>;
  getEventKeys(options: DeviceUrl): Result<number[]>;
  getEvents(options: DeviceUrl & { keys: string }): Result<string>;
  deleteEvents(options: DeviceUrl & { keys: string }): Result;
  deleteRecording(options: { recordingPath: string }): Result;
  deleteRecordings(): Result;
  downloadRecording(
    options: DeviceUrl & { recordingPath: string }
  ): Result<{ path: string; size: number }>;
  connectToDeviceAP(
    callback: (res: Res<"connected" | "disconnected">) => void
  ): Promise<CallbackId>;
  disconnectFromDeviceAP(): Promise<void>;
  reregisterDevice(
    options: DeviceUrl & { group: string; device: string }
  ): Result;
  updateWifi(options: DeviceUrl & { ssid: string; password: string }): Result;
  // rebind & unbind are used when trying to use the phone's internet connection
  turnOnModem(options: DeviceUrl & { minutes: string }): Result;
  rebindConnection(): Promise<void>;
  unbindConnection(): Promise<void>;
  hasConnection(): Result;
  getTestText(): Promise<{ text: string }>;
}

export const DevicePlugin = registerPlugin<DevicePlugin>("Device");

/**
 * Helper function to unbind and rebind connection to device hotspot.
 * @param callback The callback to execute between unbinding and rebinding.
 * @returns The return value from the callback.
 */
export function unbindAndRebind<T>(callback: () => Promise<T>): Promise<T> {
  return DevicePlugin.unbindConnection()
    .then(() => callback())
    .then((result) => {
      return DevicePlugin.rebindConnection().then(() => result);
    });
}

const DeviceInfoSchema = z.object({
  serverURL: z.string(),
  groupname: z.string(),
  devicename: z.string(),
  deviceID: z.number(),
  saltID: z.string().optional(),
  type: z.literal("pi").or(z.literal("tc2")).optional(),
});

const [DeviceProvider, useDevice] = createContextProvider(() => {
  const storage = useStorage();

  const devices = new ReactiveMap<DeviceId, Device>();
  const deviceRecordings = new ReactiveMap<DeviceId, RecordingName[]>();
  const deviceEventKeys = new ReactiveMap<DeviceId, number[]>();

  const [isDiscovering, setIsDiscovering] = createSignal(false);
  const locationBeingSet = new ReactiveSet<string>();
  const devicesDownloading = new ReactiveSet<DeviceId>();

  // Callback ID is used to determine if the device is currently discovering
  const [callbackID, setCallbackID] = createSignal<string>();
  createEffect(() => {
    setIsDiscovering(!!callbackID());
  });

  const setCurrRecs = async (device: ConnectedDevice) =>
    deviceRecordings.set(device.id, await getRecordings(device));
  const setCurrEvents = async (device: ConnectedDevice) =>
    deviceEventKeys.set(device.id, await getEventKeys(device));

  const clearUploaded = async (device: ConnectedDevice) => {
    await Promise.all([
      deleteUploadedRecordings(device),
      deleteUploadedEvents(device),
    ]);
    await Promise.all([setCurrRecs(device), setCurrEvents(device)]);
  };
  const createDevice = async (
    deviceName: string,
    endpoint: string,
    url: string
  ): Promise<ConnectedDevice | undefined> => {
    try {
      const infoRes = await CapacitorHttp.get({
        url: `${url}/api/device-info`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      if (infoRes.status !== 200) {
        return;
      }
      const info = DeviceInfoSchema.parse(JSON.parse(infoRes.data));
      const id: DeviceId = info.deviceID.toString();
      const type = info.type ?? "pi";

      return {
        id,
        saltId: info.saltID,
        host: deviceName,
        name: info.devicename,
        group: info.groupname,
        type,
        endpoint,
        isProd: !info.serverURL.includes("test"),
        locationSet: false,
        timeFound: new Date(),
        url,
        isConnected: true,
      };
    } catch (error) {
      console.log("error", error);
      return;
    }
  };

  const endpointToDevice = async (
    endpoint: string,
    host: string
  ): Promise<ConnectedDevice | undefined> => {
    try {
      const [deviceName] = endpoint.split(".");
      const url = `http://${deviceName}.local`;
      const device = await createDevice(deviceName, endpoint, url);
      if (device) {
        return device;
      }
      const ipDevice = await createDevice(
        deviceName,
        endpoint,
        `http://${host}`
      );
      if (ipDevice) {
        return ipDevice;
      }
    } catch (error) {
      console.log("error", error);
    }
  };

  // Create an effect to always turning on modem for 5 minutes
  const modemOnIntervals = new ReactiveMap<DeviceId, NodeJS.Timeout>();
  createEffect(() => {
    for (const [, device] of devices) {
      const interval = modemOnIntervals.get(device.id);
      if (!interval) {
        const id = setInterval(() => {
          unbindAndRebind(() =>
            DevicePlugin.turnOnModem({ url: device.url, minutes: "5" })
          );
        }, 300000);
        modemOnIntervals.set(device.id, id);
      } else {
        if (!device.isConnected) {
          clearInterval(interval);
          modemOnIntervals.delete(device.id);
        }
      }
    }
  });

  const [connectingToDevice, setConnectingToDevice] = createSignal<string[]>(
    []
  );

  const startDiscovery = async () => {
    if (isDiscovering()) return;
    setIsDiscovering(true);
    const connectedDevices: ConnectedDevice[] = [];
    // Clear devices that have been connected for more than 10 minutes
    for (const device of devices.values()) {
      const timeDiff = new Date().getTime() - device.timeFound.getTime();
      const tenMinutes = 600000;
      if (timeDiff > tenMinutes) {
        devices.delete(device.id);
      }
    }

    // Check if devices are still connected
    for (const device of devices.values()) {
      const deviceInfo = await DevicePlugin.getDeviceInfo({ url: device.url });
      if (deviceInfo.success) {
        const info = DeviceInfoSchema.safeParse(JSON.parse(deviceInfo.data));
        if (info.success) {
          if (info.data.deviceID.toString() === device.id) {
            const currDevice = {
              ...device,
              isConnected: true,
            } satisfies ConnectedDevice;
            devices.set(device.id, currDevice);
            clearUploaded(currDevice);
            connectedDevices.push(currDevice);
            continue;
          }
        }
      }

      // modify device to be disconnected
      devices.set(device.id, {
        ...device,
        isConnected: false,
      });
    }

    const currId = callbackID();
    if (currId) {
      try {
        await DevicePlugin.stopDiscoverDevices({ id: currId });
      } catch (e) {
        console.log("Error stopping discovery");
      }
    }
    const id = await DevicePlugin.discoverDevices(async (newDevice) => {
      if (
        !newDevice ||
        connectedDevices.some(
          (d) =>
            d.endpoint.split("-")[0] === newDevice.endpoint &&
            d.host === newDevice.host
        )
      )
        return;

      if (connectingToDevice().includes(newDevice.endpoint)) return;

      for (let i = 0; i < 3; i++) {
        try {
          setConnectingToDevice([...connectingToDevice(), newDevice.endpoint]);
          const connectedDevice = await endpointToDevice(
            newDevice.endpoint,
            newDevice.host
          );

          if (connectedDevice) {
            // Remove any devices with the same saltId
            for (const device of devices.values()) {
              if (
                !device.isConnected &&
                device.saltId === connectedDevice.saltId
              ) {
                devices.delete(device.id);
                break;
              }
            }
            setConnectingToDevice(
              connectingToDevice().filter((d) => d !== newDevice.endpoint)
            );
            devices.set(connectedDevice.id, connectedDevice);
            clearUploaded(connectedDevice);
            return;
          }
        } catch (e) {
          logWarning({
            message: `Unable to connect to discovered device`,
            details: JSON.stringify(newDevice),
          });
        }
      }
      setConnectingToDevice(
        connectingToDevice().filter((d) => d !== newDevice.endpoint)
      );
    });
    setCallbackID(id);
  };

  const stopDiscovery = async () => {
    const id = callbackID();
    if (id) {
      try {
        await DevicePlugin.stopDiscoverDevices({ id });
      } catch (e) {
        console.log(e);
      }
      setCallbackID();
    }
    setIsDiscovering(false);
  };

  const searchDevice = () => {
    startDiscovery();
    setTimeout(async () => {
      stopDiscovery();
    }, 10000);
  };

  const Authorization = "Basic YWRtaW46ZmVhdGhlcnM=";
  const headers = { Authorization: Authorization };

  const getRecordings = async (device: ConnectedDevice): Promise<string[]> => {
    try {
      await DevicePlugin.rebindConnection();
      if ((await Filesystem.checkPermissions()).publicStorage === "denied") {
        const permission = await Filesystem.requestPermissions();
        if (permission.publicStorage === "denied") {
          return [];
        }
      }
      const { url } = device;
      const res = await DevicePlugin.getRecordings({ url });
      return res.success ? res.data : [];
    } catch (error) {
      logError({
        message: "Could not get recordings",
        error,
      });
      return [];
    }
  };

  const deleteUploadedRecordings = async (device: ConnectedDevice) => {
    try {
      const { url } = device;
      const currDeviceRecordings = await getRecordings(device);
      const savedRecordings = await storage.getSavedRecordings({
        device: device.id,
      });
      for (const rec of savedRecordings) {
        if (currDeviceRecordings.includes(rec.name)) {
          if (rec.isUploaded) {
            const res: HttpResponse = await CapacitorHttp.delete({
              url: `${url}/api/recording/${rec.name}`,
              headers,
              webFetchExtra: {
                credentials: "include",
              },
            });
            if (res.status !== 200) return;
          } else {
            return;
          }
        }
        await storage.deleteRecording(rec);
      }
    } catch (error) {
      if (error instanceof Error) {
        logError({
          message: "Could not delete recordings",
          error,
        });
      } else {
        logWarning({
          message: "Could not delete recordings",
          details: JSON.stringify(error),
        });
      }
    }
  };

  const saveRecordings = async (device: ConnectedDevice) => {
    const recs = deviceRecordings.get(device.id);
    const savedRecs = storage.savedRecordings();
    if (!recs) return;
    // Filter out recordings that have already been saved
    for (const rec of recs.filter(
      (r) => !savedRecs.find((s) => s.name === r)
    )) {
      if (!devicesDownloading.has(device.id)) return;
      const res = await DevicePlugin.downloadRecording({
        url: device.url,
        recordingPath: rec,
      });
      if (!res.success) {
        logWarning({
          message: "Could not download recording",
          details: res.message,
        });
        continue;
      }
      const data = await storage?.saveRecording({
        ...device,
        filename: rec,
        path: res.data.path,
        size: res.data.size,
        isProd: device.isProd,
      });
      if (!data) return;
    }
  };

  const getEventKeys = async (device: ConnectedDevice) => {
    try {
      const { url } = device;
      const res = await DevicePlugin.getEventKeys({ url });
      if (!res.success) return [];
      const events = res.data;
      return events;
    } catch (error) {
      if (error instanceof Error) {
        logError({
          message: "Could not get events",
          details: error.message,
          error,
        });
      }
      return [];
    }
  };

  const deleteUploadedEvents = async (device: ConnectedDevice) => {
    try {
      const { url } = device;
      const currEvents = await getEventKeys(device);
      const savedEvents = await storage.getSavedEvents({
        device: device.id,
      });
      const eventsToDel = savedEvents.filter(
        (event) => currEvents.includes(Number(event.key)) && event.isUploaded
      );
      const keys = eventsToDel.map((event) => Number(event.key));
      if (keys.length !== 0) {
        const res = await DevicePlugin.deleteEvents({
          url,
          keys: JSON.stringify(keys),
        });
        if (!res.success) return;
      }
      // Delete events if they are not on the device, or if they were deleted on the device
      const deletedEvents = [
        ...savedEvents.filter(
          (event) => !currEvents.includes(Number(event.key))
        ),
        ...eventsToDel,
      ];
      await storage.deleteEvents({ events: deletedEvents });
    } catch (error) {
      logError({
        message: "Could not delete events",
        error,
      });
    }
  };

  // Zod schema for event, is an object with a key as a number and a value is an object with
  // {event: {Type: string, Details: object, Timestamp: string}, success: boolean}
  const eventSchema = z.record(
    z.string(),
    z.object({
      event: z.object({
        Type: z.string(),
        Timestamp: z.string(),
        Details: z.any(),
      }),
      success: z.boolean(),
    })
  );

  const getEvents = async (device: ConnectedDevice, keys: number[]) => {
    try {
      const { url } = device;
      const res = await DevicePlugin.getEvents({
        url,
        keys: JSON.stringify(keys),
      });
      if (!res.success) return [];
      const json = JSON.parse(res.data);
      const events = eventSchema.safeParse(json);
      if (!events.success) return [];
      // map over the events and add the device id to the event
      const eventsWithDevice = Object.entries(events.data).map(
        ([key, value]) => ({
          ...value.event,
          key,
          device: device.id,
          isProd: device.isProd,
        })
      );
      return eventsWithDevice;
    } catch (error) {
      logError({
        message: "Could not get events",
        error,
      });
      return [];
    }
  };

  const saveEvents = async (device: ConnectedDevice) => {
    const eventKeys = await getEventKeys(device);
    deviceEventKeys.set(device.id, eventKeys);
    if (!eventKeys) return;
    const savedEvents = storage.savedEvents();
    const events = await getEvents(
      device,
      eventKeys.filter(
        (key) => !savedEvents.find((event) => event.key === key.toString())
      )
    );
    for (const event of events) {
      if (!devicesDownloading.has(device.id)) return;
      storage?.saveEvent({
        key: parseInt(event.key),
        device: device.id,
        isProd: device.isProd,
        type: event.Type,
        timestamp: event.Timestamp,
        details: JSON.stringify(event.Details),
      });
    }
  };

  const saveItems = async (deviceId: DeviceId) => {
    const device = devices.get(deviceId);
    if (!device || !device.isConnected) return;
    const { id } = device;
    const isSupported = await KeepAwake.isSupported();
    if (isSupported) {
      await KeepAwake.keepAwake();
    }
    devicesDownloading.add(id);
    await Promise.all([setCurrRecs(device), setCurrEvents(device)]);
    await Promise.all([saveRecordings(device), saveEvents(device)]);
    devicesDownloading.delete(id);
    if (isSupported) {
      await KeepAwake.allowSleep();
    }
  };

  const stopSaveItems = async (deviceId: DeviceId) => {
    devicesDownloading.delete(deviceId);
  };

  const locationSchema = z.object({
    latitude: z.number().transform((val) => val.toString()),
    longitude: z.number().transform((val) => val.toString()),
    altitude: z.number().transform((val) => val.toString()),
    accuracy: z.number().transform((val) => Math.round(val).toString()),
    timestamp: z.number().transform((val) => val.toString()),
  });

  const LOCATION_ERROR =
    "Please ensure location is enabled, and permissions are granted";
  const setDeviceToCurrLocation = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return;
      let permission = await Geolocation.requestPermissions();
      if (permission.location === "prompt-with-rationale") {
        permission = await Geolocation.checkPermissions();
      }
      if (permission.location !== "granted") return;
      locationBeingSet.add(device.id);
      const { timestamp, coords } = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
      });
      const location = locationSchema.safeParse({ ...coords, timestamp });
      if (!location.success) {
        locationBeingSet.delete(device.id);
        logWarning({
          message: LOCATION_ERROR,
          details: location.error.message,
        });
        return;
      }
      const options = {
        url: device.url,
        ...location.data,
      };
      const res = await DevicePlugin.setDeviceLocation(options);
      if (res.success) {
        devices.set(device.id, {
          ...device,
          locationSet: true,
        });
        logSuccess({
          message: `Successfully set location for ${device.name}.`,
          timeout: 6000,
        });
      }
      locationBeingSet.delete(device.id);
    } catch (error) {
      if (error instanceof Error) {
        logWarning({
          message: LOCATION_ERROR,
          details: error.message,
        });
      }
      locationBeingSet.delete(deviceId);
    }
  };

  const getLocationCoords = async (
    device: DeviceId
  ): Result<DeviceCoords<number>> => {
    try {
      const deviceObj = devices.get(device);

      // If device is not connected, return error.
      if (!deviceObj || !deviceObj.isConnected) {
        return {
          success: false,
          message: "Device is not connected",
        };
      }

      const { url } = deviceObj;

      // Define the shape of the response data.
      const locationSchema = z.object({
        latitude: z.number(),
        longitude: z.number(),
        altitude: z.number(),
        accuracy: z.number(),
        timestamp: z.string(),
      });

      // Make the request to the device.
      const res = await DevicePlugin.getDeviceLocation({ url });

      // If the request was successful, return the data.
      if (res.success) {
        const location = locationSchema.safeParse(JSON.parse(res.data));
        if (!location.success) {
          return {
            success: false,
            message: location.error.message,
          };
        }
        return {
          success: true,
          data: location.data,
        };
      } else {
        return {
          success: false,
          message: "Could not get location",
        };
      }
    } catch (error) {
      return {
        success: false,
        message: "Could not get location",
      };
    }
  };

  const MIN_STATION_SEPARATION_METERS = 60;
  // The radius of the station is half the max distance between stations: any recording inside the radius can
  // be considered to belong to that station.
  const MAX_DISTANCE_FROM_STATION_FOR_RECORDING =
    MIN_STATION_SEPARATION_METERS / 2;

  function haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180; // Convert latitude from degrees to radians
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Returns the distance in meters
  }

  function isWithinRadius(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
    radius: number
  ): boolean {
    const distance = haversineDistance(lat1, lon1, lat2, lon2);
    return distance <= radius;
  }

  const withinRange = (
    loc: Coords,
    deviceCoords: DeviceCoords<number>,
    range = MAX_DISTANCE_FROM_STATION_FOR_RECORDING
  ) => {
    const { latitude, longitude } = deviceCoords;
    const { lat, lng } = loc;
    const inRange = isWithinRadius(lat, lng, latitude, longitude, range);
    return inRange;
  };

  const getLocationByDevice = (deviceId: DeviceId) =>
    createResource(
      () => [storage.savedLocations(), devices.get(deviceId)] as const,
      async (data): Promise<Location | null> => {
        try {
          const [locations, device] = data;
          if (!device || !locations?.length || !device.isConnected) return null;
          const deviceLocation = await getLocationCoords(device.id);
          if (!deviceLocation.success) return null;
          const sameGroupLocations = locations.filter(
            (loc) =>
              loc.groupName === device.group && loc.isProd === device.isProd
          );
          const location = sameGroupLocations.filter((loc) =>
            withinRange(loc.coords, deviceLocation.data)
          );
          if (!location.length) return null;
          return location.sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )[0];
        } catch (error) {
          if (error instanceof Error) {
            logError({
              message: "Could not get location",
              details: error.message,
              error,
            });
          } else {
            logWarning({
              message: "Could not get location",
              details: `${error}`,
            });
          }
          return null;
        }
      }
    );

  const isDeviceConnected = async (device: ConnectedDevice) => {
    const { url } = device;
    const res = await DevicePlugin.checkDeviceConnection({ url });
    return res.success;
  };

  const [permission] = createResource(async () => {
    try {
      let permission = await Geolocation.checkPermissions();
      if (
        permission.location === "denied" ||
        permission.location === "prompt" ||
        permission.location === "prompt-with-rationale"
      ) {
        permission = await Geolocation.requestPermissions();
        if (permission.location === "prompt-with-rationale") {
          permission = await Geolocation.checkPermissions();
        }
      }
      return permission.location;
    } catch (e) {
      return "denied";
    }
  });

  const [devicesLocToUpdate] = createResource(
    () => {
      return [[...devices.values()], permission()] as const;
    },
    async ([devices, permission]) => {
      try {
        if (!devices || !permission) return [];
        if (permission === "denied") return [];
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
        }).catch(() => {
          return null;
        });
        if (!pos) return [];

        const devicesToUpdate: string[] = [];
        for (const device of devices) {
          if (!device.isConnected) continue;
          const locationRes = await getLocationCoords(device.id);
          if (!locationRes.success) continue;
          const loc = locationRes.data;
          const newLoc: [number, number] = [
            pos.coords.latitude,
            pos.coords.longitude,
          ];

          const withinRange = isWithinRange(
            [loc.latitude, loc.longitude],
            newLoc
          );
          if (!withinRange) {
            devicesToUpdate.push(device.id);
          }
        }
        return devicesToUpdate;
      } catch (error) {
        if (error instanceof Error) {
          logWarning({
            message:
              "Could not update device locations. Check location permissions and try again.",
            action: <GoToPermissions />,
          });
        } else if (typeof error === "string") {
          logWarning({
            message: "Could not update device locations",
            details: error,
          });
        }

        return [];
      }
    }
  );

  type DeviceLocationStatus =
    | "loading"
    | "current"
    | "needsUpdate"
    | "unavailable";
  const shouldDeviceUpdateLocation = (
    deviceId: DeviceId
  ): DeviceLocationStatus => {
    if (devicesLocToUpdate.loading) return "loading";
    const devicesToUpdate = devicesLocToUpdate();
    if (!devicesToUpdate?.length)
      return permission() === "denied" ? "unavailable" : "current";
    return devicesToUpdate
      ? devicesToUpdate.includes(deviceId)
        ? "needsUpdate"
        : "current"
      : "loading";
  };
  const getWifiNetworks = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return [];
      const { url } = device;
      const res = await CapacitorHttp.get({
        url: `${url}/api/network/wifi`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      console.log("NETWORKS Result", res.data);
      if (res.status !== 200) {
        return null;
      }
      console.log("NETWORKS", res.data);
      const networks = WifiNetwork.array().parse(JSON.parse(res.data));
      return networks
        ? networks
            .filter((network) => network.SSID)
            // remove duplicate networks
            .reduce((acc, curr) => {
              const found = acc.find((a) => a.SSID === curr.SSID);
              if (!found) {
                acc.push(curr);
              }
              return acc;
            }, [] as WifiNetwork[])
        : [];
    } catch (e) {
      console.log(e);
      return [];
    }
  };

  const getCurrentWifiNetwork = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return null;
      const { url } = device;
      const res = await CapacitorHttp.get({
        url: `${url}/api/network/wifi/current`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      if (res.status !== 200) return null;
      const network = z
        .object({ SSID: z.string() })
        .safeParse(JSON.parse(res.data));
      return network.success ? network.data : null;
    } catch (error) {
      return null;
    }
  };

  const saveWifiNetwork = async (
    deviceId: DeviceId,
    ssid: string,
    password: string
  ) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return false;
      const { url } = device;
      const res = await CapacitorHttp.post({
        url: `${url}/api/network/wifi/save`,
        headers: { ...headers, "Content-Type": "application/json" },
        webFetchExtra: {
          credentials: "include",
        },
        data: { ssid, password },
      });
      return res.status === 200;
    } catch (error) {
      console.log(error);
      return false;
    }
  };

  const disconnectFromWifi = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return false;
      const { url } = device;
      const res = await CapacitorHttp.delete({
        url: `${url}/api/network/wifi/current`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      return res.status === 200;
    } catch (error) {
      return false;
    }
  };

  const forgetWifi = async (deviceId: DeviceId, ssid: string) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return false;
      const { url } = device;
      const res = await CapacitorHttp.delete({
        url: `${url}/api/network/wifi/forget`,
        headers: { ...headers, "Content-Type": "application/json" },
        webFetchExtra: {
          credentials: "include",
        },
        data: { ssid },
      });
      return res.status === 200;
    } catch (error) {
      return false;
    }
  };

  // Connect post req /network/wifi
  const connectToWifi = async (
    deviceId: DeviceId,
    ssid: string,
    password?: string
  ) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return false;
      const { url } = device;
      CapacitorHttp.post({
        url: `${url}/api/network/wifi`,
        headers: { ...headers, "Content-Type": "application/json" },
        webFetchExtra: {
          credentials: "include",
        },
        data: { ssid, password },
        connectTimeout: 20000,
        readTimeout: 20000,
      });
      let tries = 0;
      const connected = await new Promise((resolve) => {
        const interval = setInterval(async () => {
          searchDevice();
          tries++;
          if (tries > 10) {
            clearInterval(interval);
            resolve(false);
            return;
          }
          try {
            const res = await CapacitorHttp.get({
              url: `${url}/api/network/wifi/current`,
              headers,
              webFetchExtra: {
                credentials: "include",
              },
              connectTimeout: 20000,
              readTimeout: 20000,
            });
            if (res.status === 200) {
              resolve(true);
              clearInterval(interval);
            }
          } catch (e) {
            console.log(e);
          }
        }, 5000);
      });
      console.log("Connected", connected);
      return connected;
    } catch (error) {
      return false;
    }
  };

  const ConnectionRes = z.object({
    connected: z.boolean(),
  });

  const checkDeviceWifiInternetConnection = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return false;
      const { url } = device;
      const res = await CapacitorHttp.get({
        url: `${url}/api/wifi-check`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      console.log("INTERNET", res);
      const connection =
        res.status === 200
          ? ConnectionRes.parse(JSON.parse(res.data)).connected
          : false;
      return connection;
    } catch (error) {
      console.log(error);
      return false;
    }
  };

  const checkDeviceModemInternetConnection = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return false;
      const { url } = device;
      const res = await CapacitorHttp.get({
        url: `${url}/api/modem-check`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      return ConnectionRes.parse(JSON.parse(res.data)).connected;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  // {
  //    "modem": {
  //        "connectedTime": "Wed, 28 Feb 2024 15:59:51 +1300",
  //        "manufacturer": "SIMCOM INCORPORATED",
  //        "model": "LE20B04SIM7600G22",
  //        "name": "Qualcomm",
  //        "netdev": "usb0",
  //        "serial": "862636052211156",
  //        "temp": 42,
  //        "vendor": "1e0e:9011",
  //        "voltage": 3.964
  //    },
  //    "onOffReason": "Modem should be on because it was requested to stay on until 2024-02-28 16:25:03.",
  //    "powered": true,
  //    "signal": {
  //        "accessTechnology": "4G",
  //        "band": "EUTRAN-BAND3",
  //        "provider": "Spark NZ Spark NZ",
  //        "strength": "23"
  //    },
  //    "simCard": {
  //        "ICCID": "8964050087216926142",
  //        "provider": "Spark NZ",
  //        "simCardStatus": "READY"
  //    },
  //    "timestamp": "Wed, 28 Feb 2024 16:20:41 +1300"
  //}
  const asInt = z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === "string" ? parseInt(val) : val));
  const tc2ModemSchema = z
    .object({
      modem: z.object({
        connectedTime: z.string(),
        manufacturer: z.string(),
        model: z.string(),
        name: z.string(),
        netdev: z.string(),
        serial: z.string(),
        // parse as number even if it's a string
        temp: asInt,
        vendor: z.string(),
        voltage: asInt,
      }),
      onOffReason: z.string(),
      powered: z.boolean(),
      signal: z.object({
        accessTechnology: z.string(),
        band: z.string(),
        provider: z.string(),
        strength: z.string(),
      }),
      simCard: z.object({
        ICCID: z.string(),
        provider: z.string(),
        simCardStatus: z.string(),
      }),
      timestamp: z.string(),
    })
    .partial();

  const getModem = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return null;
      const { url } = device;
      const res = await CapacitorHttp.get({
        url: `${url}/api/modem`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      console.log("MODEM", res);
      return res.status === 200 ? tc2ModemSchema.parse(res.data) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  };

  const turnOnModem = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return false;
      const { url } = device;
      const res = await DevicePlugin.turnOnModem({ url, minutes: "5" });
      console.log("TURN ON", res);
      return res.success;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const hasNetworkEndpoints = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return false;
      const { url } = device;
      const res = await CapacitorHttp.get({
        url: `${url}/api/network/wifi/current`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      return res.status === 200;
    } catch (error) {
      return false;
    }
  };

  const getModemSignalStrength = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return null;
      const { url } = device;
      const res = await CapacitorHttp.get({
        url: `${url}/api/signal-strength`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      return res.status === 200 ? JSON.parse(res.data) : null;
    } catch (error) {
      return null;
    }
  };

  const getSavedWifiNetworks = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return [];
      const { url } = device;
      const savedNetworks = await CapacitorHttp.get({
        url: `${url}/api/network/wifi/saved`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      console.log("SAVED", savedNetworks);
      if (savedNetworks.status !== 200) return [];
      return z
        .array(
          z
            .string()
            .or(z.object({ SSID: z.string() }).transform((val) => val.SSID))
        )
        .parse(JSON.parse(savedNetworks.data));
    } catch (error) {
      return [];
    }
  };

  const InterfaceSchema = z.object({
    name: z.string(),
    addresses: z.array(z.string()).nullable(),
    mtu: z.number(),
    macAddress: z.string(),
    flags: z.string(),
  });

  const getDeviceInterfaces = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return [];
      const { url } = device;
      const res = await CapacitorHttp.get({
        url: `${url}/api/network/interfaces`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      const interfaces = InterfaceSchema.array().parse(JSON.parse(res.data));
      console.log("INTER", interfaces);
      return res.status === 200 ? interfaces : [];
    } catch (error) {
      console.log(error);
      return [];
    }
  };

  // Access point

  const [apState, setApState] = createSignal<
    "connected" | "disconnected" | "loading" | "default"
  >("default");

  createEffect(
    (prev: Device[]) => {
      const currDevices = [...devices.values()];
      if (prev.length > 0 && currDevices.length === 0) {
        if (apState() === "connected") {
          DevicePlugin.hasConnection().then((res) => {
            if (!res.success) {
              setApState("disconnected");
            }
          });
        }
      }
      return currDevices;
    },
    [...devices.values()]
  );

  const connectToDeviceAP = leading(
    debounce,
    async () => {
      setApState("loading");
      DevicePlugin.connectToDeviceAP((res) => {
        if (res.success) {
          searchDevice();
          setApState(res.data);
          if (res.data === "disconnected") {
            setTimeout(() => {
              setApState("default");
            }, 4000);
          }
        } else {
          logWarning({
            message:
              "Please try again, or connect to 'bushnet' with password 'feathers' in your wifi settings. Alternatively, set up a hotspot named 'bushnet' password: 'feathers'.",
          });
          setApState("default");
        }
      });
    },
    800
  );

  const disconnectFromDeviceAP = async () => {
    try {
      setApState("loading");
      await DevicePlugin.disconnectFromDeviceAP();
      searchDevice();
      setApState("disconnected");
      return true;
    } catch (error) {
      return false;
    }
  };

  const takeTestRecording = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return false;
      const { url } = device;
      const res = await CapacitorHttp.put({
        url: `${url}/api/camera/snapshot-recording`,
        headers: { ...headers, "Content-Type": "application/json" },
        webFetchExtra: {
          credentials: "include",
        },
      });
      return res.status === 200;
    } catch (error) {
      return false;
    }
  };

  const takeAudioRecording = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return false;
      const { url } = device;
      const res = await CapacitorHttp.post({
        url: `${url}/api/audio/record`,
        headers: { ...headers, "Content-Type": "application/json" },
        webFetchExtra: {
          credentials: "include",
        },
      });
      return res.status === 200;
    } catch (error) {
      return false;
    }
  };

  const getAudioFiles = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return [];
      const { url } = device;
      const res = await CapacitorHttp.get({
        url: `${url}/api/audio/files`,
        headers: { ...headers, "Content-Type": "application/json" },
        webFetchExtra: {
          credentials: "include",
        },
      });
      return res.status === 200 ? JSON.parse(res.data) : [];
    } catch (error) {
      return [];
    }
  };

  const getDeviceCamera = (deviceId: DeviceId) => {
    const device = devices.get(deviceId);
    if (!device || !device.isConnected) return null;
    const { url } = device;
    return DeviceCamera(url.split("http://")[1]);
  };

  const changeGroup = async (deviceId: DeviceId, group: string) => {
    const device = devices.get(deviceId);
    if (!device || !device.isConnected) return false;
    const { url } = device;
    const res = await DevicePlugin.reregisterDevice({
      url,
      group,
      device: device.name,
    });
    if (!res.success) {
      throw new Error("Could not change group");
    }
    devices.set(deviceId, {
      ...device,
      group,
    });
    return true;
  };

  const configDefaultsSchema = z.object({
    // Config is much larger, but only these fields are used
    windows: z.object({
      StartRecording: z.string(),
      StopRecording: z.string(),
      PowerOn: z.string(),
      PowerOff: z.string(),
    }),
  });
  // Make optional version of configDefaultsSchema
  const configValueSchema = configDefaultsSchema.partial();

  const configSchema = z.object({
    defaults: configDefaultsSchema,
    values: configValueSchema,
  });

  const getDeviceConfig = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return null;
      const { url } = device;
      const res = await DevicePlugin.getDeviceConfig({ url });
      if (!res.success) return null;
      return configSchema.parse(JSON.parse(res.data));
    } catch (error) {
      console.log(error);
      return null;
    }
  };

  const setRecordingWindow = async (
    deviceId: DeviceId,
    on: string,
    off: string
  ) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return null;
      const { url } = device;
      const res = await DevicePlugin.updateRecordingWindow({ url, on, off });
      return res.success;
    } catch (error) {
      console.log(error);
      return null;
    }
  };

  const [updatingDevice, setUpdatingDevice] = createStore<
    {
      id: DeviceId;
      isUpdating: boolean;
      interval: NodeJS.Timeout;
      success: boolean | null;
    }[]
  >([]);
  // Update
  const updateDevice = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return null;
      const { url } = device;
      const res = await CapacitorHttp.post({
        url: `${url}/api/salt-update`,
        headers: { ...headers, "Content-Type": "application/json" },
        webFetchExtra: {
          credentials: "include",
        },
      });
      if (res.status === 200) {
        const existing = updatingDevice.find((d) => d.id === deviceId);
        if (existing) {
          if (existing.isUpdating) return null;
          setUpdatingDevice((prev) => prev.filter((d) => d.id !== deviceId));
        }
        const interval = setInterval(async () => {
          const res = await CapacitorHttp.get({
            url: `${url}/api/salt-update`,
            headers: { ...headers, "Content-Type": "application/json" },
            webFetchExtra: {
              credentials: "include",
            },
          });
          if (res.status === 200) {
            const data = UpdateStatusSchema.parse(JSON.parse(res.data));
            if (data.RunningUpdate === false) {
              clearInterval(interval);
              setUpdatingDevice((prev) =>
                prev.map((d) =>
                  d.id === deviceId
                    ? {
                        ...d,
                        isUpdating: false,
                        success: data.LastCallSuccess ?? false,
                      }
                    : d
                )
              );
            }
          }
        }, 5000);
        setUpdatingDevice((prev) => [
          ...prev,
          { id: deviceId, isUpdating: true, interval, success: null },
        ]);
        setTimeout(() => {
          const existing = updatingDevice.find((d) => d.id === deviceId);
          if (existing && existing.isUpdating) {
            clearInterval(existing.interval);
            setUpdatingDevice((prev) =>
              prev.map((d) =>
                d.id === deviceId
                  ? { ...d, isUpdating: false, success: false }
                  : d
              )
            );
            setTimeout(() => {
              setUpdatingDevice((prev) =>
                prev.filter((d) => d.id !== deviceId)
              );
            }, 8000);
          }
        }, 5 * 60 * 1000);

        return true;
      }
    } catch (error) {
      console.log(error);
    }
    return false;
  };

  const canUpdateDevice = async (deviceId: DeviceId) => {
    try {
      const device = devices.get(deviceId);
      if (!device || !device.isConnected) return null;
      const { url } = device;
      const res = await CapacitorHttp.get({
        url: `${url}/api/check-salt-connection`,
        headers: { ...headers },
        webFetchExtra: {
          credentials: "include",
        },
      });
      return res.status === 200;
    } catch (error) {
      console.log(error);
      return null;
    }
  };

  const UpdateStatusSchema = z.object({
    RunningUpdate: z.boolean(),
    LastCallSuccess: z.boolean().optional(),
  });

  const isDeviceUpdating = (deviceId: DeviceId) => {
    return updatingDevice.find((d) => d.id === deviceId)?.isUpdating ?? false;
  };

  const didDeviceUpdate = (deviceId: DeviceId): boolean | null => {
    return updatingDevice.find((d) => d.id === deviceId)?.success ?? null;
  };

  return {
    devices,
    isDiscovering,
    devicesDownloading,
    stopSaveItems,
    deviceRecordings,
    deviceEventKeys,
    startDiscovery,
    stopDiscovery,
    isDeviceConnected,
    setRecordingWindow,
    deleteUploadedRecordings,
    getDeviceConfig,
    getEvents,
    saveItems,
    changeGroup,
    // Location
    setDeviceToCurrLocation,
    locationBeingSet,
    getLocationCoords,
    getLocationByDevice,
    devicesLocToUpdate,
    shouldDeviceUpdateLocation,
    // Wifi
    getDeviceInterfaces,
    getWifiNetworks,
    getCurrentWifiNetwork,
    connectToWifi,
    disconnectFromWifi,
    forgetWifi,
    checkDeviceWifiInternetConnection,
    saveWifiNetwork,
    getSavedWifiNetworks,
    hasNetworkEndpoints,
    // Modem
    getModemSignalStrength,
    getModem,
    turnOnModem,
    checkDeviceModemInternetConnection,
    // Access point
    connectToDeviceAP,
    disconnectFromDeviceAP,
    apState,
    searchDevice,
    // Camera
    takeTestRecording,
    getDeviceCamera,
    //Audio
    takeAudioRecording,
    getAudioFiles,
    // Update
    canUpdateDevice,
    updateDevice,
    isDeviceUpdating,
    didDeviceUpdate,
  };
});
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const defineUseDevice = () => useDevice()!;
export { defineUseDevice as useDevice, DeviceProvider };
