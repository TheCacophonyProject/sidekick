import { HttpResponse, registerPlugin } from "@capacitor/core";
import { createEffect, createSignal } from "solid-js";
import { Geolocation } from "@capacitor/geolocation";
import { logError, logWarning } from "./Notification";
import { CallbackId, Result, URL } from ".";
import { CapacitorHttp } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import { useStorage } from "./Storage";
import { ReactiveMap } from "@solid-primitives/map";
import { createContextProvider } from "@solid-primitives/context";
import { ReactiveSet } from "@solid-primitives/set";
import { z } from "zod";
import { KeepAwake } from "@capacitor-community/keep-awake";

export type DeviceId = string;
export type DeviceName = string;
export type DeviceHost = string;
export type DeviceType = "thermal" | "audio";
export type DeviceUrl = { url: URL };
export type RecordingName = string;

export type DeviceDetails = {
  id: DeviceId;
  host: DeviceHost;
  name: DeviceName;
  group: string;
  type: DeviceType;
  endpoint: string;
  isProd: boolean;
};

type Location<T extends string | number> = {
  latitude: T;
  longitude: T;
  altitude: T;
  accuracy: T;
  timestamp: string;
};

export type ConnectedDevice = DeviceDetails &
  DeviceUrl & {
    isConnected: true;
    locationSet: boolean;
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
  getDeviceInfo(options: DeviceUrl): Result<DeviceInfo>;
  getDeviceConfig(options: DeviceUrl): Result<string>;
  getDeviceLocation(options: DeviceUrl): Result<string>;
  setDeviceLocation(options: DeviceUrl & Location<string>): Result;
  getRecordings(options: DeviceUrl): Result<string[]>;
  getEventKeys(options: DeviceUrl): Result<number[]>;
  getEvents(options: DeviceUrl & { keys: string }): Result<string>;
  deleteEvents(options: DeviceUrl & { keys: string }): Result;
  deleteRecording(options: { recordingPath: string }): Result;
  deleteRecordings(): Result;
  downloadRecording(
    options: DeviceUrl & { recordingPath: string }
  ): Result<{ path: string; size: number }>;
  connectToDeviceAP(): Result;
  getTestText(): Promise<{ text: string }>;
}

export const DevicePlugin = registerPlugin<DevicePlugin>("Device");

// Device Action Outputs
export type DeviceInfo = {
  serverURL: string;
  groupName: string;
  deviceName: string;
  deviceID: number;
};

const [DeviceProvider, useDevice] = createContextProvider(() => {
  const storage = useStorage();
  const devices = new ReactiveMap<DeviceId, Device>();
  const [isDiscovering, setIsDiscovering] = createSignal(false);
  const locationBeingSet = new ReactiveSet<string>();
  const devicesDownloading = new ReactiveSet<DeviceId>();
  const deviceRecordings = new ReactiveMap<string, RecordingName[]>();
  const deviceEventKeys = new ReactiveMap<string, number[]>();

  // Callback ID is used to determine if the device is currently discovering
  const [callbackID, setCallbackID] = createSignal<string>();
  createEffect(() => {
    if (callbackID()) {
      setIsDiscovering(true);
    } else {
      setIsDiscovering(false);
    }
  });

  const clearUploaded = async (device: ConnectedDevice) => {
    const setCurrRec = async (device: ConnectedDevice) =>
      deviceRecordings.set(device.id, await getRecordings(device));
    const setCurrEvents = async (device: ConnectedDevice) =>
      deviceEventKeys.set(device.id, await getEventKeys(device));
    await Promise.all([
      deleteUploadedRecordings(device),
      deleteUploadedEvents(device),
    ]);
    await Promise.all([setCurrRec(device), setCurrEvents(device)]);
  };

  const endpointToDevice = async (
    endpoint: string,
    host: string
  ): Promise<ConnectedDevice | undefined> => {
    const [deviceName] = endpoint.split(".");
    const [, group] = deviceName.split("-");
    const url = `http://${deviceName}.local`;
    const info = await DevicePlugin.getDeviceInfo({ url });
    const connection = await DevicePlugin.checkDeviceConnection({ url });
    if (connection.success && info.success) {
      const id: DeviceId = info.data.deviceID.toString();
      const deviceDetails: DeviceDetails = {
        id,
        host: deviceName,
        name: info.data.deviceName,
        group,
        type: "thermal",
        endpoint,
        isProd: !info.data.serverURL.includes("test"),
      };
      const device: ConnectedDevice = {
        ...deviceDetails,
        url,
        isConnected: true,
        locationSet: false,
      };
      clearUploaded(device);
      return device;
    } else {
      // Use host ipv4 address if device is not found
      const url = `http://${host}`;
      const connection = await DevicePlugin.checkDeviceConnection({ url });
      const info = await DevicePlugin.getDeviceInfo({ url });
      if (connection.success && info.success) {
        const id: DeviceId = info.data.deviceID.toString();
        const deviceDetails: DeviceDetails = {
          id,
          host: deviceName,
          name: info.data.deviceName,
          group,
          type: "thermal",
          endpoint,
          isProd: !info.data.serverURL.includes("test"),
        };
        const device: ConnectedDevice = {
          ...deviceDetails,
          url,
          isConnected: true,
          locationSet: false,
        };
        clearUploaded(device);
        return device;
      } else {
        console.log(connection, info, host);
      }
    }
  };

  const startDiscovery = async () => {
    if (isDiscovering()) return;
    setIsDiscovering(true);
    const connectedDevices: ConnectedDevice[] = [];
    for (const device of devices.values()) {
      if (!device.isConnected) continue;
      const connection = await DevicePlugin.checkDeviceConnection({
        url: device.url,
      });
      if (connection.success && device.isConnected) {
        clearUploaded(device);
        connectedDevices.push(device);
      } else {
        devices.delete(device.id);
      }
    }

    const id = await DevicePlugin.discoverDevices(async (newDevice) => {
      if (
        !newDevice ||
        connectedDevices.some(
          (d) => d.endpoint.split("-")[0] === newDevice.endpoint
        )
      )
        return;

      for (let i = 0; i < 3; i++) {
        const connectedDevice = await endpointToDevice(
          newDevice.endpoint,
          newDevice.host
        );

        if (connectedDevice) {
          if (!devices.has(connectedDevice.id))
            devices.set(connectedDevice.id, connectedDevice);
          return;
        }
      }
      logError({
        message: `Unable to connect to discovered device`,
        details: JSON.stringify(newDevice),
      });
    });
    setCallbackID(id);
  };

  const stopDiscovery = async () => {
    const id = callbackID();
    if (id) {
      await DevicePlugin.stopDiscoverDevices({ id });
      setCallbackID();
      setIsDiscovering(false);
    }
  };

  const Authorization = "Basic YWRtaW46ZmVhdGhlcnM=";
  const headers = { Authorization: Authorization };

  const getRecordings = async (device: ConnectedDevice): Promise<string[]> => {
    try {
      if ((await Filesystem.checkPermissions()).publicStorage === "denied") {
        const permission = await Filesystem.requestPermissions();
        if (permission.publicStorage === "denied") {
          return [];
        }
      }
      const { url } = device;
      const res: HttpResponse = await CapacitorHttp.get({
        url: `${url}/api/recordings`,
        headers,
        webFetchExtra: {
          credentials: "include",
        },
      });
      if (res.status !== 200) return [];
      const recordings = JSON.parse(res.data) as string[];
      return recordings;
    } catch (error) {
      if (error instanceof Error) {
        logError({
          message: "Could not get recordings",
          details: error.message,
        });
      }
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
          error: error,
        });
      } else {
        logError({
          message: "Could not delete recordings",
          details: JSON.stringify(error),
        });
      }
    }
  };

  const saveRecordings = async (device: ConnectedDevice) => {
    const recs = deviceRecordings.get(device.id);
    const savedRecs = storage.SavedRecordings();
    if (!recs) return;
    // Filter out recordings that have already been saved
    for (const rec of recs.filter(
      (r) => !savedRecs.find((s) => s.name === r)
    )) {
      const res = await DevicePlugin.downloadRecording({
        url: device.url,
        recordingPath: rec,
      });
      if (!res.success) return;
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
      if (error instanceof Error) {
        logError({
          message: "Could not delete events",
          error: error,
        });
      } else {
        logError({
          message: "Could not delete events",
          details: JSON.stringify(error),
        });
      }
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
      if (error instanceof Error) {
        logError({
          message: "Could not get events",
          details: error.message,
          error,
        });
      } else {
        logError({
          message: "Could not get events",
          details: JSON.stringify(error),
        });
      }
      return [];
    }
  };

  const saveEvents = async (device: ConnectedDevice) => {
    const eventKeys = await getEventKeys(device);
    deviceEventKeys.set(device.id, eventKeys);
    if (!eventKeys) return;
    const savedEvents = storage.SavedEvents();
    const events = await getEvents(
      device,
      eventKeys.filter(
        (key) => !savedEvents.find((event) => event.key === key.toString())
      )
    );
    for (const event of events) {
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

  const saveItems = async (device: ConnectedDevice) => {
    const { id } = device;
    const isSupported = await KeepAwake.isSupported();
    if (isSupported) {
      await KeepAwake.keepAwake();
    }
    devicesDownloading.add(id);
    await Promise.all([saveRecordings(device), saveEvents(device)]);
    devicesDownloading.delete(id);
    if (isSupported) {
      await KeepAwake.allowSleep();
    }
  };

  const setDeviceToCurrLocation = async (device: ConnectedDevice) => {
    try {
      const { url } = device;
      locationBeingSet.add(device.id);
      const { timestamp, coords } = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
      });
      const locationSchema = z.object({
        latitude: z.number().transform((val) => val.toString()),
        longitude: z.number().transform((val) => val.toString()),
        altitude: z.number().transform((val) => val.toString()),
        accuracy: z.number().transform((val) => Math.round(val).toString()),
        timestamp: z.number().transform((val) => val.toString()),
      });
      const location = locationSchema.safeParse({ ...coords, timestamp });
      if (!location.success) {
        logWarning({
          message: "Could not set device location",
          details: location.error.message,
        });
        return;
      }
      const options = {
        url,
        ...location.data,
      };
      const res = await DevicePlugin.setDeviceLocation(options);
      if (res.success) {
        devices.set(device.id, {
          ...device,
          locationSet: true,
        });
      }
      locationBeingSet.delete(device.id);
    } catch (error) {
      if (error instanceof Error) {
        logError({
          message: "Could not set device location",
          details: error.message,
          error,
        });
      }
      locationBeingSet.delete(device.id);
    }
  };

  const getLocation = async (
    device: ConnectedDevice
  ): Result<Location<number>> => {
    try {
      const { url } = device;
      const locationSchema = z.object({
        latitude: z.number(),
        longitude: z.number(),
        altitude: z.number(),
        accuracy: z.number(),
        timestamp: z.string(),
      });
      const res = await CapacitorHttp.get({
        url: `${url}/api/location`,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      });
      if (res.status === 200) {
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
      if (error instanceof Error) {
        logWarning({
          message: "Could not get location",
          details: error.message,
        });
      }
      return {
        success: false,
        message: "Could not get location",
      };
    }
  };

  return {
    devices,
    isDiscovering,
    devicesDownloading,
    locationBeingSet,
    deviceRecordings,
    deviceEventKeys,
    startDiscovery,
    stopDiscovery,
    setDeviceToCurrLocation,
    deleteUploadedRecordings,
    getEvents,
    saveItems,
    getLocation,
  };
});
const defineUseDevice = () => useDevice()!;
export { defineUseDevice as useDevice, DeviceProvider };
