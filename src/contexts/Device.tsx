import { registerPlugin } from "@capacitor/core";
import { createContext, createEffect, createSignal, JSX } from "solid-js";
import { createStore, Store } from "solid-js/store";

type DeviceName = string
type DeviceType = "thermal" | "audio"
type CallbackId = string

export type DeviceDetails = {
  id: DeviceName;
  name: DeviceName;
  type: DeviceType;
  endpoint: string;
}

export type ConnectedDevice = DeviceDetails & {
  url: string;
  isConnected: true;
}

export type DisconnectedDevice = DeviceDetails & {
  isConnected: false;
}

export type Device = ConnectedDevice | DisconnectedDevice

export interface DevicePlugin {
  discoverDevices(onFoundDevice: (device: { endpoint: string }) => void): Promise<CallbackId>;
  stopDiscoverDevices(options: { id: CallbackId }): Promise<void>;
  getDeviceConnection(options: { name: DeviceName }, onHostFound: (device: { host: string, port: string }) => void): Promise<void>;
}

const DevicePlugin = registerPlugin<DevicePlugin>("Device");

type DeviceState = Store<{ devices: Device[], isDiscovering: boolean }>

interface DeviceActions {
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  getDeviceConnection(device: Device): Promise<{ host: string, port: string }>;
  getDeviceInterfaceUrl(host: string, port: string): string;
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

  const getDeviceConnection = (device: { name: string }): Promise<{ host: string, port: string }> => new Promise((resolve, reject) => {
    try {
      DevicePlugin.getDeviceConnection(device, (device) => {
        resolve(device)
      })
    } catch (error) {
      reject(error)
    }
  })

  const endpointToDevice = async (endpoint: string): Promise<ConnectedDevice | Device> => {
    const [name] = endpoint.split(".")
    const device: DeviceDetails = {
      id: name,
      endpoint,
      name,
      type: "thermal",
    }
    try {
      const url = await getDeviceConnection({ name })
      return {
        ...device,
        url: getDeviceInterfaceUrl(url.host, url.port),
        isConnected: true
      }
    } catch (error) {
      return {
        ...device,
        isConnected: false
      }
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
    }, Promise.resolve([] as Device[]))

  const getDeviceInterfaceUrl = (host: string, port: string): string => { return `http://${host}:${port}` }

  const startDiscovery = async () => {
    if (state.isDiscovering) return
    setState("isDiscovering", true)
    setState("devices", await getConnectedDevices(state.devices))
    const id = await DevicePlugin.discoverDevices(async (newDevice) => {
      setState("devices", await getConnectedDevices([...state.devices.filter((currDevice) => currDevice.endpoint !== newDevice.endpoint), newDevice]))
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
  return (
    <DeviceContext.Provider value={[state, { startDiscovery, stopDiscovery, getDeviceConnection, getDeviceInterfaceUrl }]}>
      {props.children}
    </DeviceContext.Provider>
  )
}