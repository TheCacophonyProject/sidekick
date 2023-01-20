import { registerPlugin } from "@capacitor/core";
import { createContext, createEffect, createSignal, JSX } from "solid-js";
import { createStore, Store } from "solid-js/store";
import { Geolocation } from '@capacitor/geolocation';
import Devices from "~/routes/devices";
import { logError, logSuccess } from "./Notification";

export type DeviceName = string
export type DeviceType = "thermal" | "audio"
type CallbackId = string
type URL = string
type Result<T> = { result: "success", data: T } | { result: "error", error: string }
export type Host = { url: URL }

export type DeviceDetails = {
  id: DeviceName;
  name: DeviceName;
  type: DeviceType;
  endpoint: string;
}

type Location = {
  latitude: string;
  longitude: string;
  altitude: string;
  accuracy: string;
  timestamp: string;
}

export type ConnectedDevice = DeviceDetails & Host & {
  url: URL;
  isConnected: true;
  locationSet: boolean;
}

export type DisconnectedDevice = DeviceDetails & {
  isConnected: false;
}

export type Device = ConnectedDevice | DisconnectedDevice

// Make a strict type that takes that only accepts the keys of T and not any other keys using a utility type
type PluginOptions<T> = Record<keyof T, T[keyof T]>
export interface DevicePlugin {
  discoverDevices(onFoundDevice: (device: PluginOptions<{ endpoint: string } | undefined>) => void): Promise<CallbackId>;
  stopDiscoverDevices(options: { id: CallbackId }): Promise<void>;
  getDeviceConnection(options: { name: DeviceName }): Promise<Result<{ host: string, port: string }>>;
  getDeviceInfo(options: Host): Promise<DeviceInfo>;
  getDeviceConfig(options: Host): Promise<String>;
  setDeviceLocation(options: Host & Location): Promise<void>;
  getRecordings(options: Host): Promise<String[]>;
  getTestText(): Promise<{ text: string }>;
}

export const DevicePlugin = registerPlugin<DevicePlugin>("Device");

// Device Action Outputs
type DeviceState = Store<{ devices: Device[], isDiscovering: boolean }>
export type DeviceInfo = { serverURL: string, groupName: string, deviceName: string, deviceID: string }
export interface DeviceActions {
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  getDeviceInterfaceUrl(host: string, port: string): string;
  getDeviceInfo(device: ConnectedDevice): Promise<DeviceInfo>;
  getDeviceConfig(device: ConnectedDevice): Promise<String>;
  setDeviceToCurrLocation(device: ConnectedDevice): Promise<void>;
  getRecordings(device: ConnectedDevice): Promise<String[]>;
}

type DeviceContext = [DeviceState, DeviceActions]

export const DeviceContext = createContext<DeviceContext>()

interface DeviceProviderProps {
  children: JSX.Element
}

export function DeviceProvider(props: DeviceProviderProps) {
  const [callbackID, setCallbackID] = createSignal<string>()
  const [state, setState] = createStore<DeviceState>({ devices: [], isDiscovering: false })

  createEffect(() => {
    if (callbackID()) {
      setState("isDiscovering", true)
    } else {
      setState("isDiscovering", false)
    }
  }
  )

  const getDeviceInterfaceUrl = (name: string): string => { return `http://${name}.local` }

  const endpointToDevice = async (endpoint: string): Promise<ConnectedDevice | Device> => {
    const [name] = endpoint.split(".")
    const device: DeviceDetails = {
      id: name,
      endpoint,
      name,
      type: "thermal",
    }
    const url = await DevicePlugin.getDeviceConnection({ name })
    return url.result === "success" ? {
      ...device,
      ...url.data,
      url: getDeviceInterfaceUrl(name),
      isConnected: true,
      locationSet: false
    } : {
      ...device,
      isConnected: false
    }
  }

  const getConnectedDevices = (devices: { endpoint: string }[]) =>
    devices.reduce(async (connectedDevices, device) => {
      const connectedDevice = await endpointToDevice(device.endpoint)
      if (connectedDevice.isConnected) {
        return [connectedDevice, ...await connectedDevices]
      } else {
        return [...await connectedDevices]
      }
    }, Promise.resolve([] as ConnectedDevice[]))


  const startDiscovery = async () => {
    if (state.isDiscovering) return
    setState("isDiscovering", true)
    const currentDevices = await getConnectedDevices(state.devices)
    const setOriginalLocation = (device: Device) => {
      const currentDevice = state.devices.find((currDevice) => currDevice.endpoint === device.endpoint)
      if (!currentDevice || !currentDevice.isConnected) return device
      return {
        ...device,
        locationSet: currentDevice.locationSet
      }
    }
    const sortByEndpoint = (a: Device, b: Device) => a.endpoint.localeCompare(b.endpoint)
    setState("devices", currentDevices.map(setOriginalLocation).sort(sortByEndpoint))
    const id = await DevicePlugin.discoverDevices(async (newDevice) => {
      if (!newDevice) return
      const connectedDevice = await (await getConnectedDevices([newDevice])).map(setOriginalLocation)
      setState("devices", [...state.devices.filter((currDevice) => currDevice.endpoint !== newDevice.endpoint), ...connectedDevice].sort(sortByEndpoint))
    })
    setCallbackID(id)
  }

  const stopDiscovery = async () => {
    const id = callbackID()
    if (id) {
      await DevicePlugin.stopDiscoverDevices({ id })
      setCallbackID()
    }
  }

  const getDeviceInfo = (device: ConnectedDevice) => {
    try {
      const { url } = device
      return DevicePlugin.getDeviceInfo({ url })
    } catch (error) {
      logError("Could not get device info", error)
    }
  }

  const getDeviceConfig = (device: ConnectedDevice) => {
    try {
      const { url } = device
      return DevicePlugin.getDeviceConfig({ url })
    } catch (error) {
      logError("Could not get device config", error)
    }
  }

  const getRecordings = async (device: ConnectedDevice) => {
    try {
      const { url } = device
      const recordings = await DevicePlugin.getRecordings({ url })
      logSuccess("Got recordings", JSON.stringify(recordings))
      return recordings
    } catch (error) {
      logError("Could not get device recordings", error)
    }
  }

  const setDeviceToCurrLocation = async (device: ConnectedDevice) => {
    try {
      const { url } = device
      const { timestamp, coords: { latitude, longitude, altitude, accuracy } } = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
      const options = {
        url,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        altitude: altitude.toString(),
        // Make sure to convert to Int
        accuracy: Math.round(accuracy).toString(),
        timestamp: timestamp.toString()
      }
      await DevicePlugin.setDeviceLocation(options)
      setState("devices", state.devices.map((currDevice) => {
        if (currDevice.endpoint === device.endpoint) {
          return {
            ...currDevice,
            locationSet: true
          }
        } else {
          return currDevice
        }
      }))
    } catch (error) {
      logError("Could not set device location", error)
    }

  }


  return (
    <DeviceContext.Provider value={[state, {
      startDiscovery,
      stopDiscovery,
      getDeviceInterfaceUrl,
      getDeviceInfo,
      getDeviceConfig,
      setDeviceToCurrLocation,
      getRecordings
    }]}>
      {props.children}
    </DeviceContext.Provider>
  )
}