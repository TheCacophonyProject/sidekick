import { HttpResponse, registerPlugin } from "@capacitor/core";
import { createEffect, createSignal, createResource } from "solid-js";
import { Geolocation } from "@capacitor/geolocation";
import { logError, logSuccess, logWarning } from "./Notification";
import { CallbackId, Res, Result, URL } from ".";
import { CapacitorHttp } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import { useStorage } from "./Storage";
import { ReactiveMap } from "@solid-primitives/map";
import { createContextProvider } from "@solid-primitives/context";
import { ReactiveSet } from "@solid-primitives/set";
import { z } from "zod";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { Coords, Location } from "~/database/Entities/Location";

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

type DeviceCoords<T extends string | number> = {
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
  // rebind & unbind are used when trying to use the phone's internet connection
  rebindConnection(): Promise<void>;
  unbindConnection(): Promise<void>;
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
  const deviceRecordings = new ReactiveMap<DeviceId, RecordingName[]>();
  const deviceEventKeys = new ReactiveMap<DeviceId, number[]>();

  const [isDiscovering, setIsDiscovering] = createSignal(false);
  const locationBeingSet = new ReactiveSet<string>();
  const devicesDownloading = new ReactiveSet<DeviceId>();

  // Callback ID is used to determine if the device is currently discovering
  const [callbackID, setCallbackID] = createSignal<string>();
  createEffect(() => {
    if (callbackID()) {
      setIsDiscovering(true);
    } else {
      setIsDiscovering(false);
    }
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
        group: info.data.groupName,
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
      return device;
    } else {
      // Use host ipv4 address if device is not found
      const url = `http://${host}`;
      const connection = await DevicePlugin.checkDeviceConnection({ url });
      if (connection.success) {
        const info = await DevicePlugin.getDeviceInfo({ url });
        if (!info.success) {
          return;
        }
        const id: DeviceId = info.data.deviceID.toString();
        const deviceDetails: DeviceDetails = {
          id,
          host: deviceName,
          name: info.data.deviceName,
          group: info.data.groupName,
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
        return device;
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
        try {
          const connectedDevice = await endpointToDevice(
            newDevice.endpoint,
            newDevice.host
          );

          if (connectedDevice) {
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
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
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
      if (error instanceof Error) {
        logError({
          message: "Could not get recordings",
          error,
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
          message: `Successfully set location for ${device.name}. Please reset the device.`,
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
      console.log(res);
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
          return location[0];
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

  return {
    devices,
    isDiscovering,
    devicesDownloading,
    stopSaveItems,
    locationBeingSet,
    deviceRecordings,
    deviceEventKeys,
    startDiscovery,
    stopDiscovery,
    setDeviceToCurrLocation,
    deleteUploadedRecordings,
    getLocationByDevice,
    getEvents,
    saveItems,
    getLocationCoords,
  };
});
const defineUseDevice = () => useDevice()!;
export { defineUseDevice as useDevice, DeviceProvider };
