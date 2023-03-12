import { Browser } from "@capacitor/browser";
import { BsCameraVideoFill } from "solid-icons/bs";
import {
  createEffect,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
  untrack,
  useContext,
} from "solid-js";
import ActionContainer from "~/components/ActionContainer";
import { Device, useDevice } from "~/contexts/Device";
import { RiSystemArrowRightSLine } from "solid-icons/ri";
import { BiRegularCurrentLocation } from "solid-icons/bi";
import { Dialog } from "@capacitor/dialog";
import { FaSolidSpinner } from "solid-icons/fa";
import CircleButton from "~/components/CircleButton";
import { Geolocation, Position } from "@capacitor/geolocation";
import { TbCurrentLocation } from "solid-icons/tb";
import { FiDownload } from "solid-icons/fi";
import {
  Recording,
  Event,
  SavedEvents,
  SavedRecordings,
} from "~/contexts/Storage";
import { ReactiveSet } from "@solid-primitives/set";
import { ImNotification } from "solid-icons/im";

interface DeviceDetailsProps {
  device: Device;
  shouldUpdateLocation: boolean | undefined;
}

function DeviceDetails(props: DeviceDetailsProps) {
  const context = useDevice();
  const [savedRecs, setSavedRecs] = createSignal<Recording[]>([]);
  const [deviceRecs, setDeviceRecs] = createSignal<string[]>([]);
  const [savedEvents, setSavedEvents] = createSignal<Event[]>([]);
  const [eventKeys, setEventKeys] = createSignal<number[]>([]);

  const [disabledDownload, setDisabledDownload] = createSignal(false);
  createEffect(() => {
    const hasRecsToDownload =
      deviceRecs().length > 0 || deviceRecs().length !== savedRecs().length;
    const hasEventsToDownload =
      eventKeys().length > 0 || savedEvents().length !== eventKeys().length;
    setDisabledDownload(!hasRecsToDownload && !hasEventsToDownload);
  });

  createEffect(() => {
    const saved = SavedEvents().filter(
      (event) => event.device === props.device.id && !event.isUploaded
    );
    const device = [...(context.deviceEventKeys.get(props.device.id) ?? [])];

    setSavedEvents(saved);
    setEventKeys(device);
  });

  createEffect(() => {
    const saved = SavedRecordings().filter(
      (rec) => rec.device === props.device.id && !rec.isUploaded
    );
    const device = [...(context.deviceRecordings.get(props.device.id) ?? [])];
    setSavedRecs(saved);
    setDeviceRecs(device);
  });

  const openDeviceInterface = (device: Device) => {
    if (device.isConnected) {
      Browser.open({ url: device.url });
    }
  };

  const setLocationForDevice = async (device: Device) => {
    const { value } = await Dialog.confirm({
      title: "Confirm",
      message: `Are you sure you want to set device ${device.name} to your current location?`,
    });

    if (!value) return;
    if (!device.isConnected) return;
    await context?.setDeviceToCurrLocation(device);
  };

  const donwload = async (device: Device) => {
    const { value } = await Dialog.confirm({
      title: "Confirm",
      message: `Are you sure you want to download all recordings and events from ${device.name}?`,
    });
    if (!value) return;
    if (!device.isConnected) return;
    context.saveRecordings(device);
    context.saveEvents(device);
  };

  return (
    <ActionContainer
      action={
        <button
          class="text-blue-500"
          onClick={() => openDeviceInterface(props.device)}
        >
          <RiSystemArrowRightSLine size={32} />
        </button>
      }
    >
      <div class="flex items-center justify-between px-2">
        <div onClick={() => openDeviceInterface(props.device)} role="button">
          <h1 class="break-all text-left text-lg">{props.device.name}</h1>

          <div class="mt-2 flex w-full items-center space-x-2 text-slate-700">
            <BsCameraVideoFill size={20} />
            <p class="text-sm">
              Recordings Saved: {savedRecs().length}/{deviceRecs().length}{" "}
            </p>
          </div>
          <div class="mt-2 flex w-full items-center space-x-2 text-slate-700">
            <ImNotification size={20} />
            <p class="text-sm">
              Events Saved:{" "}
              {
                SavedEvents().filter((val) => val.device === props.device.id)
                  .length
              }
              /{context.deviceEventKeys.get(props.device.id)?.length ?? 0}{" "}
            </p>
          </div>
        </div>
        <div class="flex items-center space-x-6 px-2">
          <button
            class={`${disabledDownload() ? "text-slate-300" : "text-blue-500"}`}
            disabled={disabledDownload()}
            onClick={() => donwload(props.device)}
          >
            <FiDownload size={28} />
          </button>
          <button
            class="text-blue-500"
            disabled={context.locationBeingSet.has(props.device.id)}
            onClick={() => setLocationForDevice(props.device)}
          >
            <Show
              when={!context.locationBeingSet.has(props.device.id)}
              fallback={<FaSolidSpinner size={28} class="animate-spin" />}
            >
              <Show
                when={!props.shouldUpdateLocation}
                fallback={
                  <div class="text-yellow-400">
                    <TbCurrentLocation size={28} />
                  </div>
                }
              >
                <BiRegularCurrentLocation size={28} />
              </Show>
            </Show>
          </button>
        </div>
      </div>
    </ActionContainer>
  );
}

function Devices() {
  const context = useDevice();
  const searchDevice = () => {
    context.startDiscovery();
    setTimeout(() => {
      context.stopDiscovery();
    }, 5000);
  };
  const deviceLocToUpdate = new ReactiveSet<string>();
  const [pos, setPos] = createSignal<Position>();
  const [cancel, setCancel] = createSignal(false);

  onMount(async () => {
    searchDevice();
    const search = setInterval(() => {
      searchDevice();
    }, 60 * 1000 * 1);

    onCleanup(() => {
      clearInterval(search);
    });

    setPos(
      await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
      })
    );
  });

  createEffect(() => {
    const devices = context.devices.values();
    untrack(async () => {
      for (const device of devices) {
        if (!device.isConnected) return;
        const locationRes = await context.getLocation(device);
        if (locationRes.success) {
          const loc = locationRes.data;
          const currPos = pos();
          if (!currPos) return deviceLocToUpdate.delete(device.id);

          const diffLat = Math.abs(loc.latitude - currPos.coords.latitude);
          const diffLong = Math.abs(loc.longitude - currPos.coords.longitude);
          // if more than 100m away, show set location button
          if (diffLat > 0.001 || diffLong > 0.001) {
            deviceLocToUpdate.add(device.id);
          } else {
            deviceLocToUpdate.delete(device.id);
          }
        }
      }
    });
  });

  createEffect(() => {
    const isDiscovering = context.isDiscovering();
    if (isDiscovering) return;
    const devices = deviceLocToUpdate.values();
    untrack(async () => {
      const shouldUpdate =
        [...devices].filter((val) => !context.locationBeingSet.has(val))
          .length > 0;
      if (shouldUpdate && !cancel()) {
        const { value } = await Dialog.confirm({
          title: "Update Locations",
          message: `Some devices are not at your current location. Would you like to update their locations?`,
        });
        if (value) {
          for (const device of context.devices.values()) {
            if (deviceLocToUpdate.has(device.id) && device.isConnected) {
              await context.setDeviceToCurrLocation(device);
            }
          }
        } else {
          setCancel(true);
        }
      }
    });
    if (context.isDiscovering()) return;
  });
  return (
    <section class="pb-bar pt-bar relative h-full space-y-2 overflow-y-auto bg-gray-200 px-2">
      <For each={[...context.devices.values()]}>
        {(device) =>
          device && (
            <DeviceDetails
              device={device}
              shouldUpdateLocation={deviceLocToUpdate.has(device.id)}
            />
          )
        }
      </For>
      <div class="h-32 bg-gray-200"></div>
      <div class="pb-bar fixed inset-x-0 bottom-[4vh] mx-auto flex justify-center">
        <CircleButton
          onClick={searchDevice}
          disabled={context?.isDiscovering()}
          loading={context?.isDiscovering()}
          text="Search Devices"
          loadingText="Searching..."
        />
      </div>
    </section>
  );
}

export default Devices;
