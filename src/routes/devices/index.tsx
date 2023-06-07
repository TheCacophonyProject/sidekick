import { Browser } from "@capacitor/browser";
import { BsCameraVideoFill } from "solid-icons/bs";
import {
  createEffect,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import ActionContainer from "../../components/ActionContainer";
import { Device, DevicePlugin, useDevice } from "../../contexts/Device";
import { RiSystemArrowRightSLine } from "solid-icons/ri";
import { BiRegularCurrentLocation } from "solid-icons/bi";
import { Dialog } from "@capacitor/dialog";
import { debounce, leading } from "@solid-primitives/scheduled";
import { FaSolidSpinner } from "solid-icons/fa";
import CircleButton from "../../components/CircleButton";
import { Geolocation } from "@capacitor/geolocation";
import { TbCurrentLocation } from "solid-icons/tb";
import { FiDownload } from "solid-icons/fi";
import { useStorage } from "../../contexts/Storage";
import { ImCog, ImNotification } from "solid-icons/im";
import { headerMap } from "../../components/Header";
import { FaSolidWifi } from "solid-icons/fa";
import BackgroundLogo from "../../components/BackgroundLogo";
import { Recording } from "~/database/Entities/Recording";
import { Event } from "~/database/Entities/Event";
import { useNavigate } from "@solidjs/router";
import { logWarning } from "~/contexts/Notification";

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
  const navigate = useNavigate();
  const openDeviceInterface = leading(
    debounce,
    (device: Device) => {
      if (device.isConnected) {
        navigate(`/devices/${device.id}`);
      }
    },
    800
  );

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
      <div class=" flex items-center justify-between px-2">
        <div onClick={() => openDeviceInterface(props.device)} role="button">
          <div class="flex items-center space-x-2 ">
            <Show when={!props.device.isProd}>
              <ImCog size={20} />
            </Show>
            <h1 class="break-all text-left sm:text-lg">{props.device.name}</h1>
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
        <div class=" flex items-center space-x-6 px-2 text-blue-500">
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
            <Switch>
              <Match
                when={
                  props.shouldUpdateLocation === undefined ||
                  context.locationBeingSet.has(props.device.id)
                }
              >
                <FaSolidSpinner size={28} class="animate-spin" />
              </Match>
              <Match when={props.shouldUpdateLocation === false}>
                <BiRegularCurrentLocation size={28} />
              </Match>
              <Match when={props.shouldUpdateLocation === true}>
                <div class="text-yellow-400">
                  <TbCurrentLocation size={28} />
                </div>
              </Match>
            </Switch>
          </button>
        </div>
      </div>
    </ActionContainer>
  );
}

function Devices() {
  const context = useDevice();
  const [cancel, setCancel] = createSignal(false);

  const searchDevice = () => {
    refetchLocation();
    context.startDiscovery();
    setTimeout(() => {
      context.stopDiscovery();
    }, 5000);
  };
  const connectToDeviceAP = leading(
    debounce,
    async () => {
      const res = await DevicePlugin.connectToDeviceAP();
      if (res.success) {
        searchDevice();
      } else {
        logWarning({
          message: "Please ensure wifi is enabled and try again",
        });
      }
    },
    800
  );

  onMount(() => {
    // Add delete button to header
    const header = headerMap.get("/devices");
    if (!header) return;

    headerMap.set("/devices", [
      header[0],
      <button onClick={connectToDeviceAP} class="text-blue-500">
        <FaSolidWifi size={28} />
      </button>,
    ]);
  });

  const [pos, { refetch: refetchPos }] = createResource(async () => {
    try {
      const res = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
      });
      return res;
    } catch (e) {
      return null;
    }
  });

  onMount(() => {
    searchDevice();
    const search = setInterval(() => {
      searchDevice();
    }, 60 * 1000 * 1);

    onCleanup(() => {
      clearInterval(search);
    });
  });
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

  const isWithinRange = (
    prevLoc: [number, number],
    newLoc: [number, number],
    range = MAX_DISTANCE_FROM_STATION_FOR_RECORDING
  ) => {
    const [lat, lng] = prevLoc;
    const [latitude, longitude] = newLoc;
    const inRange = isWithinRadius(lat, lng, latitude, longitude, range);
    return inRange;
  };

  const [devicesLocToUpdate, { refetch: refetchLocation }] = createResource(
    () => {
      return [...context.devices.values()] as const;
    },
    async (devices) => {
      if (!devices) return [];
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
      });
      const devicesToUpdate: string[] = [];
      for (const device of devices.values()) {
        if (!device.isConnected) continue;
        const locationRes = await context.getLocation(device);
        if (!locationRes.success) continue;
        const loc = locationRes.data;
        const newLoc: [number, number] = [
          pos.coords.latitude,
          pos.coords.longitude,
        ];

        const withinRange = isWithinRange(
          [loc.latitude, loc.longitude],
          newLoc
        );
        console.log(withinRange);
        if (!withinRange) {
          devicesToUpdate.push(device.id);
        }
      }

      return devicesToUpdate;
    }
  );

  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [updatingDeviceLocations] = createResource(
    () => {
      if (devicesLocToUpdate.loading) return false;
      return [devicesLocToUpdate(), context.isDiscovering()] as const;
    },
    async (sources) => {
      if (!sources) return;
      const [devices, isDiscovering] = sources;
      if (isDiscovering) return;
      if (!devices) return;

      const devicesToUpdate = devices.filter(
        (val) => !context.locationBeingSet.has(val)
      );
      if (devicesToUpdate.length === 0 || cancel()) return;
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
      if (dialogOpen()) return;
      setDialogOpen(true);
      const { value } = await Dialog.confirm({
        title: "Update Location",
        message,
      });
      setDialogOpen(false);
      if (value) {
        for (const device of context.devices.values()) {
          if (devices.includes(device.id) && device.isConnected) {
            await context.setDeviceToCurrLocation(device);
          }
        }
      } else {
        setCancel(true);
      }
    }
  );

  const shouldDeviceUpdateLocation = (device: Device) => {
    if (devicesLocToUpdate.loading) return undefined;
    const updated = devicesLocToUpdate();
    const shouldUpdateLocation =
      updated !== undefined ? updated.includes(device.id) : undefined;
    return shouldUpdateLocation;
  };

  return (
    <>
      <section class="pb-bar pt-bar relative z-20 mt-1 space-y-2 overflow-y-auto px-2">
        <For
          each={[...context.devices.values()].filter((dev) => dev.isConnected)}
        >
          {(device) => (
            <DeviceDetails
              device={device}
              shouldUpdateLocation={shouldDeviceUpdateLocation(device)}
            />
          )}
        </For>
        <div class="h-32" />
        <div class="pb-bar fixed inset-x-0 bottom-[4vh] z-20 mx-auto flex justify-center">
          <CircleButton
            onClick={searchDevice}
            disabled={context.isDiscovering()}
            loading={context.isDiscovering()}
            text="Search Devices"
            loadingText="Searching..."
          />
        </div>
      </section>
      <div class="pt-bar fixed inset-0 z-0 flex flex-col pb-32">
        <div class="my-auto">
          <BackgroundLogo />
          <div class="flex h-32 w-full justify-center">
            <Show when={context.devices.size <= 0}>
              <p class="mt-4 max-w-sm px-4 text-center text-neutral-600">
                No devices detected.
                <br /> To access a device please turn it on, wait for 2 minutes,
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
    </>
  );
}

export default Devices;
