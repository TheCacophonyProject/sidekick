import { HttpResponse, registerPlugin } from "@capacitor/core";
import { createEffect, createSignal } from "solid-js";
import { Geolocation } from "@capacitor/geolocation";
import { logError } from "./Notification";
import { CallbackId, PromiseResult, Result, URL } from ".";
import { CapacitorHttp } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import { SavedEvents, SavedRecordings, useStorage } from "./Storage";
import { ReactiveMap } from "@solid-primitives/map";
import { useUserContext } from "./User";
import { createContextProvider } from "@solid-primitives/context";
import { ReactiveSet } from "@solid-primitives/set";
import { z } from "zod";

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
    onFoundDevice: (device: { endpoint: string } | undefined) => void
  ): Promise<CallbackId>;
  stopDiscoverDevices(options: { id: CallbackId }): Promise<void>;
  getDeviceConnection(options: {
    host: DeviceHost;
  }): Result<{ ip: string; port: string }>;
  getDeviceInfo(options: DeviceUrl): Result<DeviceInfo>;
  getDeviceConfig(options: DeviceUrl): Result<string>;
  getDeviceLocation(options: DeviceUrl): Result<string>;
  setDeviceLocation(options: DeviceUrl & Location<string>): Result;
  getRecordings(options: DeviceUrl): Result<string[]>;
  getEventKeys(options: DeviceUrl): Result<number[]>;
  getEvents(options: DeviceUrl & { keys: string }): Result<string>;
  deleteEvents(options: DeviceUrl & { keys: string }): Result;
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
  const storageContext = useStorage();
  const userContext = useUserContext();
  const devices = new ReactiveMap<DeviceId, Device>();
  const [isDiscovering, setIsDiscovering] = createSignal(false);
  const locationBeingSet = new ReactiveSet<string>();
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

  const getDeviceInterfaceUrl = (name: string): string => {
    return `http://${name}.local`;
  };

  const endpointToDevice = async (
    endpoint: string
  ): Promise<ConnectedDevice | Device> => {
    const [host] = endpoint.split(".");
    const [name, group] = host.split("-");
    const url = getDeviceInterfaceUrl(host);
    const info = await DevicePlugin.getDeviceInfo({ url });
    const id: DeviceId = info.success ? info.data.deviceID.toString() : host;
    const deviceDetails: DeviceDetails = {
      id,
      host,
      name: info.success ? info.data.deviceName : name,
      group,
      type: "thermal",
      endpoint,
      isProd: info.success ? !info.data.serverURL.includes("test") : true,
    };
    const connection = await DevicePlugin.getDeviceConnection({
      host,
    });
    const device: Device = connection.success
      ? {
          ...deviceDetails,
          url,
          isConnected: true,
          locationSet: false,
        }
      : {
          ...deviceDetails,
          isConnected: false,
        };

    if (device.isConnected) {
      await deleteUploadedRecordings(device);
      await deleteUploadedEvents(device);
      deviceRecordings.set(device.id, await getRecordings(device));
      const keys = await getEventKeys(device);
      deviceEventKeys.set(device.id, keys);
    }
    return device;
  };

  const startDiscovery = async () => {
    if (isDiscovering()) return;
    setIsDiscovering(true);
    devices.forEach(async (device) => {
      const newDevice = await endpointToDevice(device.endpoint);
      if (newDevice.isConnected) {
        devices.set(device.id, {
          ...newDevice,
          locationSet: device.isConnected ? device.locationSet : false,
        });
      } else {
        devices.delete(device.id);
      }
    });

    const id = await DevicePlugin.discoverDevices(async (newDevice) => {
      if (!newDevice) return;
      const connectedDevice = await await endpointToDevice(newDevice.endpoint);
      devices.set(connectedDevice.id, connectedDevice);
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

  const getDeviceConfig = (device: ConnectedDevice) => {
    try {
      const { url } = device;
      return DevicePlugin.getDeviceConfig({ url });
    } catch (error) {
      if (error instanceof Error) {
        logError("Could not get device config", error.message);
      }
      throw error;
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
        logError("Could not get recordings", error.message);
      }
      throw error;
    }
  };

  const deleteUploadedRecordings = async (device: ConnectedDevice) => {
    try {
      const { url } = device;
      const currDeviceRecordings = await getRecordings(device);
      const uploadedRecordings = await storageContext.getSavedRecordings({
        device: device.id,
        uploaded: true,
      });
      for (const rec of uploadedRecordings) {
        if (currDeviceRecordings.includes(rec.name)) {
          const res: HttpResponse = await CapacitorHttp.delete({
            url: `${url}/api/recording/${rec.name}`,
            headers,
            webFetchExtra: {
              credentials: "include",
            },
          });
          if (res.status !== 200) return;
        }
        await storageContext.deleteRecording(rec);
      }
    } catch (error) {
      logError(
        "Could not delete recordings",
        error instanceof Error
          ? error.message
          : "Unknown error: during recording delete"
      );
    }
  };

  const saveRecordings = async (device: ConnectedDevice) => {
    const recs = deviceRecordings.get(device.id);
    const savedRecs = SavedRecordings();
    if (!recs) return;
    for (const rec of recs) {
      if (savedRecs.find((saved) => saved.name === rec)) return;
      const res = await DevicePlugin.downloadRecording({
        url: device.url,
        recordingPath: rec,
      });
      if (!res.success) return;
      const data = await storageContext?.saveRecording({
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
        logError("Could not get events", error.message);
      }
      return [];
    }
  };

  const deleteUploadedEvents = async (device: ConnectedDevice) => {
    try {
      const { url } = device;
      const currEvents = await getEventKeys(device);
      const uploadedEvents = await storageContext.getSavedEvents({
        device: device.id,
        uploaded: true,
      });
      const eventsToDel = uploadedEvents.filter((event) =>
        currEvents.includes(Number(event.key))
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
        ...uploadedEvents.filter(
          (event) => !currEvents.includes(Number(event.key))
        ),
        ...eventsToDel,
      ];
      await storageContext.deleteEvents({ events: deletedEvents });
    } catch (error) {
      logError(
        "Could not delete events",
        error instanceof Error
          ? error.message
          : "Unknown error: during event delete"
      );
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
      const events = eventSchema.parse(json);
      // map over the events and add the device id to the event
      const eventsWithDevice = Object.entries(events).map(([key, value]) => ({
        ...value.event,
        key,
        device: device.id,
      }));
      return eventsWithDevice;
    } catch (error) {
      if (error instanceof Error) {
        logError("Could not get events", error.message);
      }
      return [];
    }
  };

  const saveEvents = async (device: ConnectedDevice) => {
    const eventKeys = await getEventKeys(device);
    deviceEventKeys.set(device.id, eventKeys);
    if (!eventKeys) return;
    const savedEvents = await SavedEvents();
    const events = await getEvents(
      device,
      eventKeys.filter(
        (key) => !savedEvents.find((event) => event.key === key.toString())
      )
    );
    return Promise.all(
      events.map(async (event) =>
        storageContext?.saveEvent({
          key: parseInt(event.key),
          device: device.id,
          type: event.Type,
          timestamp: event.Timestamp,
          details: JSON.stringify(event.Details),
        })
      )
    );
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
        throw new Error("Invalid location");
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
        logError("Could not set device location", error.message);
      }
      locationBeingSet.delete(device.id);
      throw error;
    }
  };

  const getLocation = async (
    device: ConnectedDevice
  ): PromiseResult<Location<number>> => {
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
        logError("Could not get device location", error.message);
      }
      throw error;
    }
  };

  return {
    devices,
    isDiscovering,
    locationBeingSet,
    deviceRecordings,
    deviceEventKeys,
    startDiscovery,
    stopDiscovery,
    getDeviceInterfaceUrl,
    setDeviceToCurrLocation,
    deleteUploadedRecordings,
    getEvents,
    saveRecordings,
    saveEvents,
    getLocation,
  };
});
const defineUseDevice = () => useDevice()!;
export { defineUseDevice as useDevice, DeviceProvider };
