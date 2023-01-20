import { Browser } from "@capacitor/browser";
import { BsCameraVideoFill } from "solid-icons/bs";
import { createEffect, createSignal, For, onMount, Show, untrack, useContext } from "solid-js";
import ActionContainer from "~/components/ActionContainer";
import { Device, DeviceContext, DeviceName } from "~/contexts/Device";
import { RiSystemArrowRightSLine } from 'solid-icons/ri'
import { Motion, Presence } from "@motionone/solid"
import { animate } from "motion";
import { setHeaderButton } from "~/components/Header";
import { BiRegularCurrentLocation, BiSolidEditLocation, BiSolidLocationPlus } from 'solid-icons/bi'
import { Dialog } from '@capacitor/dialog';
import { FaSolidSpinner } from "solid-icons/fa";

function Devices() {
  const [state, { startDiscovery, stopDiscovery, setDeviceToCurrLocation, getRecordings }] = useContext(DeviceContext)
  const [deviceBeingSet, setDeviceBeingSet] = createSignal<{ [key: DeviceName]: boolean }>({})
  const [settingAll, setSettingAll] = createSignal(false)

  const setAllDevicesLocations = async () => {
    const { value } = await Dialog.confirm({
      title: "Confirm",
      message: "Are you sure you want to set all devices to your current location?",
    })
    if (!value) return
    setSettingAll(true)
    state.devices.forEach(async (device) => {
      if (deviceBeingSet()[device.id]) return
      await setLocation(device)
    }
    )

    setSettingAll(false)
  }

  const setLocationForDevice = async (device: Device) => {
    const { value } = await Dialog.confirm({
      title: "Confirm",
      message: `Are you sure you want to set device ${device.name} to your current location?`,
    })
    if (!value) return
    await setLocation(device)
  }

  const setLocation = async (device: Device) => {
    setDeviceBeingSet({ ...deviceBeingSet(), [device.id]: true })
    if (!device.isConnected) return
    await setDeviceToCurrLocation(device)
    setDeviceBeingSet({ ...deviceBeingSet(), [device.id]: false })
  }
  const SetLocationAllDevices = <Motion.button disabled={settingAll()} animate={{ opacity: 1 }} exit={{ opacity: 0 }} class={settingAll() ? "text-gray-200" : "text-blue-500"} onClick={setAllDevicesLocations}><BiSolidEditLocation size={38} /></Motion.button>

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

  const [gettingRecordings, setGettingRecordings] = createSignal(false)

  const getRecordingsList = async () => {
    setGettingRecordings(true)
    state.devices.forEach(async (device) => {
      if (!device.isConnected) return
      const recordings = await getRecordings(device)
      console.log(recordings)
    })
    setGettingRecordings(false)
  }

  createEffect(() => {
    if (state.devices.length > 0) {
      setHeaderButton(SetLocationAllDevices)
    }
  })

  return (
    <section class="h-full bg-gray-200 px-2 pb-bar pt-bar space-y-2 relative mt-16">
      <For each={state.devices}>
        {(device) => (
          <ActionContainer icon={BsCameraVideoFill} >
            <div class="flex items-center w-full justify-between">
              <h1 onClick={() => openDeviceInterface(device)} role="button" class="text-lg break-all text-left w-full">{device.name}</h1>
              <div class="flex space-x-5 items-center" >
                <button class="text-blue-500" disabled={deviceBeingSet()[device.id]} onClick={() => setLocationForDevice(device)}>
                  {deviceBeingSet()[device.id] ? <FaSolidSpinner size={32} class="animate-spin" /> : device.isConnected && !device.locationSet ?
                    <BiSolidLocationPlus size={32} /> : <BiRegularCurrentLocation size={32} />}
                </button>
                < RiSystemArrowRightSLine onClick={() => openDeviceInterface(device)} size={28} />
              </div>
            </div>
          </ActionContainer>
        )}
      </For>
      <div class="flex justify-center absolute inset-x-0 mx-auto bottom-[8%] pb-bar">
        <div class="flex flex-col items-center">
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
      </div>
    </section>
  )
}

export default Devices;