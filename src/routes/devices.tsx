import { Browser } from "@capacitor/browser";
import { BsCameraVideoFill } from "solid-icons/bs";
import { createEffect, For, Show, useContext } from "solid-js";
import ActionContainer from "~/components/ActionContainer";
import { Device, DeviceContext } from "~/contexts/Device";
import { RiSystemArrowRightSLine } from 'solid-icons/ri'
import { Motion, Presence } from "@motionone/solid"
import { animate } from "motion";

function Devices() {
  const [state, { startDiscovery, stopDiscovery, getDeviceInterfaceUrl }] = useContext(DeviceContext)
  const openDeviceInterface = (device: Device) => {
    if (device.isConnected) {
      Browser.open({ url: device.url })
    }
  }
  const searchDevice = () => {
    startDiscovery()
    setTimeout(() => {
      stopDiscovery()
    }, 5000)
  }
  return (
    <section class="h-full bg-gray-200 p-2 space-y-2 relative">
      <For each={state.devices}>
        {(device) => (
          <ActionContainer icon={BsCameraVideoFill} >
            <button onClick={() => openDeviceInterface(device)} class="flex items-center w-full justify-between">
              <h1 class="text-lg break-all text-left">{device.name}</h1>
              <RiSystemArrowRightSLine size={28} />
            </button>
          </ActionContainer>
        )}
      </For>
      <div class="flex flex-col items-center absolute bottom-20 inset-x-0">
        <button disabled={state.isDiscovering} class="rounded-full bg-white shadow-mda p-4 mb-2" onClick={searchDevice}>
          <Presence exitBeforeEnter>
            <Show when={state.isDiscovering} fallback={<Motion.div initial={{ opacity: 1 }} exit={{ opacity: [1, 0] }} transition={{ duration: 0.1 }} class="border-2 border-blue-400 p-4 rounded-full" />
            }>
              <Motion.div
                animate={{ scale: [0.2, 1.2], opacity: [0, 1, 0] }}
                class="border-2 border-blue-400 p-4 rounded-full"
                transition={{ repeat: Infinity, duration: 1, easing: "ease-in-out" }}
              />
            </Show>
          </Presence>
        </button>
        <p class="test-gray-600">
          {state.isDiscovering ? "Searching..." : "Search Devices"}
        </p>
      </div>
    </section>
  )
}

export default Devices;