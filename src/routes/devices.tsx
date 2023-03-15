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
import { Device, DevicePlugin, useDevice } from "~/contexts/Device";
import { RiSystemArrowRightSLine } from "solid-icons/ri";
import { BiRegularCurrentLocation } from "solid-icons/bi";
import { Dialog } from "@capacitor/dialog";
import { FaSolidSpinner } from "solid-icons/fa";
import CircleButton from "~/components/CircleButton";
import { Geolocation, Position } from "@capacitor/geolocation";
import { TbCurrentLocation } from "solid-icons/tb";
import { FiDownload } from "solid-icons/fi";
import { Recording, Event, useStorage } from "~/contexts/Storage";
import { ReactiveSet } from "@solid-primitives/set";
import { ImCog, ImNotification } from "solid-icons/im";
import { headerMap } from "~/components/Header";
import { FaSolidWifi } from "solid-icons/fa";
import CacaophonyLogo from "~/components/CacaophonyLogo";
import BackgroundLogo from "~/components/BackgroundLogo";

interface DeviceDetailsProps {
  device: Device;
  shouldUpdateLocation: boolean | undefined;
}

function DeviceDetails(props: DeviceDetailsProps) {
  const context = useDevice();
  const storage = useStorage();
  const [savedRecs, setSavedRecs] = createSignal<Recording[]>([]);
  const [deviceRecs, setDeviceRecs] = createSignal<string[]>([]);
  const [savedEvents, setSavedEvents] = createSignal<Event[]>([]);
  const [eventKeys, setEventKeys] = createSignal<number[]>([]);

  const [disabledDownload, setDisabledDownload] = createSignal(false);
  createEffect(() => {
    const hasRecsToDownload =
      deviceRecs().length > 0 && deviceRecs().length !== savedRecs().length;
    const hasEventsToDownload =
      eventKeys().length > 0 && savedEvents().length !== eventKeys().length;
    setDisabledDownload(!hasRecsToDownload && !hasEventsToDownload);
  });

  createEffect(() => {
    const saved = storage
      .SavedEvents()
      .filter((event) => event.device === props.device.id && !event.isUploaded);
    const device = [...(context.deviceEventKeys.get(props.device.id) ?? [])];

    setSavedEvents(saved);
    setEventKeys(device);
  });

  createEffect(() => {
    const saved = storage
      .SavedRecordings()
      .filter((rec) => rec.device === props.device.id && !rec.isUploaded);
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

  const download = async (device: Device) => {
    const { value } = await Dialog.confirm({
      title: "Confirm",
      message: `Are you sure you want to download all recordings and events from ${device.name}?`,
    });
    if (!value) return;
    if (!device.isConnected) return;
    await context.saveItems(device);
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
      <div class="z-30 flex items-center justify-between px-2">
        <div onClick={() => openDeviceInterface(props.device)} role="button">
          <div class="flex items-center space-x-2 ">
            <Show when={!props.device.isProd}>
              <ImCog size={20} />
            </Show>
            <h1 class="break-all text-left text-lg">{props.device.name}</h1>
          </div>
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
                storage
                  .SavedEvents()
                  .filter((val) => val.device === props.device.id).length
              }
              /{context.deviceEventKeys.get(props.device.id)?.length ?? 0}{" "}
            </p>
          </div>
        </div>
        <div class="z-30 flex items-center space-x-6 px-2 text-blue-500">
          <Show
            when={!context.devicesDownloading.has(props.device.id)}
            fallback={<FaSolidSpinner size={28} class="animate-spin" />}
          >
            <button
              class={`${
                disabledDownload() ? "text-slate-300" : "text-blue-500"
              }`}
              disabled={disabledDownload()}
              onClick={() => download(props.device)}
            >
              <FiDownload size={28} />
            </button>
          </Show>
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
  const deviceLocToUpdate = new ReactiveSet<string>();
  const [pos, setPos] = createSignal<Position>();
  const [cancel, setCancel] = createSignal(false);

  const connectToBushnet = async () => {
    const { value } = await Dialog.confirm({
      title: "Connecting to Device",
      message: `Please turn on the device and wait at least 2 mintues for the device to setup it's Wi-Fi then press "Ok".\n Alternatively: connect to the device's wifi "bushnet" password "feathers" when available`,
    });

    if (!value) return;
    await DevicePlugin.connectToDeviceAP();
  };

  const searchDevice = () => {
    context.startDiscovery();
    setTimeout(() => {
      context.stopDiscovery();
    }, 5000);
  };

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

    // Add delete button to header
    const header = headerMap.get("/devices");
    if (!header) return;

    headerMap.set("/devices", [
      header[0],
      <button onClick={connectToBushnet} class="text-blue-500">
        <FaSolidWifi size={28} />
      </button>,
    ]);
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
      const devicesToUpdate = [...devices].filter(
        (val) => !context.locationBeingSet.has(val)
      );
      const shouldUpdate = devicesToUpdate.length > 0;
      if (shouldUpdate && !cancel()) {
        const message =
          devicesToUpdate.length === 1
            ? `${
                context.devices.get(devicesToUpdate[0])?.name
              } has a different location stored. Would you like to update it to your current location?`
            : `${devicesToUpdate
                .map((val) => context.devices.get(val)?.name)
                .join(
                  ", "
                )} have different location stored. Would you like to update them to the current location?`;

        const { value } = await Dialog.confirm({
          title: "Update Location",
          message,
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
    <section class="pb-bar pt-bar h-full space-y-2 overflow-y-auto bg-gray-200 px-2">
      <For
        each={[...context.devices.values()].filter((dev) => dev.isConnected)}
      >
        {(device) =>
          device && (
            <DeviceDetails
              device={device}
              shouldUpdateLocation={deviceLocToUpdate.has(device.id)}
            />
          )
        }
      </For>
      <div class="pb-bar fixed inset-x-0 bottom-[4vh] z-20 mx-auto flex justify-center">
        <CircleButton
          onClick={searchDevice}
          disabled={context.isDiscovering()}
          loading={context.isDiscovering()}
          text="Search Devices"
          loadingText="Searching..."
        />
      </div>
      <div class="pt-bar absolute inset-0 flex flex-col pb-32">
        <div class="my-auto">
          <BackgroundLogo />
          <div class="flex h-32 w-full justify-center">
            <Show when={context.devices.size <= 0}>
              <p class="mt-6 max-w-sm px-4 text-center text-neutral-600">
                No devices detected.
                <br /> To access a device please turn it on, wait for 2 mintues,
                then press{" "}
                <span class="inline-block">
                  <FaSolidWifi />
                </span>{" "}
                to connect to the device's Wi-Fi
              </p>
            </Show>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Devices;
