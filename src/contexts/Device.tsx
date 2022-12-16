import { registerPlugin } from "@capacitor/core";
import { Accessor, createContext, createEffect, createSignal, JSX } from "solid-js";
import { createStore, Store } from "solid-js/store";

type DeviceType = "thermal" | "audio"
type CallbackId = string

export type Device = {
  id: string;
  endpoint: string
  name: string;
  type: DeviceType;
  url: string;
}



export interface DevicePlugin {
  discoverDevices(onFoundDevice: (device: { endpoint: string }) => void): Promise<CallbackId>;
  stopDiscoverDevices(options: { id: CallbackId }): Promise<void>;
  getDeviceHost(options: { name: string }, onHostFound: (device: { host: string, port: string }) => void): Promise<void>;
}

const DevicePlugin = registerPlugin<DevicePlugin>("Device");

type DeviceState = Store<{ devices: Device[], isDiscovering: boolean }>

interface DeviceActions {
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  getDeviceHost(device: Device): Promise<{ host: string, port: string }>;
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

  const startDiscovery = async () => {
    const id = await DevicePlugin.discoverDevices(async (device) => {
      const newDevice = await endpointToDevice(device.endpoint)
      setState("devices", [...state.devices.filter((device) => device.endpoint !== newDevice.endpoint), newDevice])
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

  const getDeviceHost = (device: { name: string }): Promise<{ host: string, port: string }> => new Promise((resolve, reject) => {
    try {
      DevicePlugin.getDeviceHost(device, (device) => {
        resolve(device)
      })
    } catch (error) {
      reject(error)
    }
  })

  const getDeviceInterfaceUrl = (host: string, port: string): string => { return `http://${host}:${port}` }
  const endpointToDevice = async (endpoint: string): Promise<Device> => {
    const [device] = endpoint.split(".")
    const url = await getDeviceHost({ name: device })
    return {
      id: device,
      endpoint,
      name: device,
      type: "thermal",
      url: getDeviceInterfaceUrl(url.host, url.port)
    }
  }
  return (
    <DeviceContext.Provider value={[state, { startDiscovery, stopDiscovery, getDeviceHost, getDeviceInterfaceUrl }]}>
      {props.children}
    </DeviceContext.Provider>
  )
}