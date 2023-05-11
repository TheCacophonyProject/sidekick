import { Browser } from "@capacitor/browser";
import { BsCameraVideoFill } from "solid-icons/bs";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import ActionContainer from "../components/ActionContainer";
import {
  ConnectedDevice,
  Device,
  DeviceId,
  DevicePlugin,
  useDevice,
} from "../contexts/Device";
import { RiSystemArrowRightSLine } from "solid-icons/ri";
import { BiRegularCurrentLocation } from "solid-icons/bi";
import { Dialog as Prompt } from "@capacitor/dialog";
import { debounce, leading } from "@solid-primitives/scheduled";
import { FaSolidSpinner } from "solid-icons/fa";
import CircleButton from "../components/CircleButton";
import { Geolocation } from "@capacitor/geolocation";
import { TbCurrentLocation } from "solid-icons/tb";
import { FiDownload } from "solid-icons/fi";
import { useStorage } from "../contexts/Storage";
import { ImCheckmark, ImCog, ImCross, ImNotification } from "solid-icons/im";
import { headerMap } from "../components/Header";
import { FaSolidWifi } from "solid-icons/fa";
import BackgroundLogo from "../components/BackgroundLogo";
import { Recording } from "~/database/Entities/Recording";
import { Event } from "~/database/Entities/Event";
import { Portal } from "solid-js/web";
import Dialog from "~/components/Dialog";
import { logWarning } from "~/contexts/Notification";
import { AiFillEdit } from "solid-icons/ai";
import { TbCameraPlus } from "solid-icons/tb";
import { Camera, CameraResultType } from "@capacitor/camera";
import { isKeyObject } from "util/types";

interface DeviceDetailsProps {
  id: DeviceId;
  name: string;
  groupName: string;
  url: string;
  isProd: boolean;
  shouldUpdateLocation: boolean | undefined;
}

function DeviceDetails(props: DeviceDetailsProps) {
  createEffect(() => {
    console.log(props);
  });
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
      .savedEvents()
      .filter((event) => event.device === props.id && !event.isUploaded);
    const device = [...(context.deviceEventKeys.get(props.id) ?? [])];

    setSavedEvents(saved);
    setEventKeys(device);
  });

  createEffect(() => {
    const saved = storage
      .savedRecordings()
      .filter((rec) => rec.device === props.id && !rec.isUploaded);
    const device = [...(context.deviceRecordings.get(props.id) ?? [])];
    setSavedRecs(saved);
    setDeviceRecs(device);
  });

  const openDeviceInterface = leading(
    debounce,
    () => {
      Browser.open({ url: props.url });
    },
    800
  );

  const [showLocationSettings, setShowLocationSettings] = createSignal(false);
  createEffect(() => {
    on(showLocationSettings, async (shown) => {
      if (!shown) return;
      await context?.setDeviceToCurrLocation(props.id);
    });
  });

  const download = async () => {
    const { value } = await Prompt.confirm({
      title: "Confirm",
      message: `Are you sure you want to download all recordings and events from ${props.name}?`,
    });
    if (!value) return;
    await context.saveItems(props.id);
  };

  // eslint-disable-next-line solid/reactivity
  const [location] = context.getLocationByDevice(props.id);
  createEffect(() => {
    console.log(location()?.name);
  });

  let LocationNameInput: HTMLInputElement;
  const [isEditing, setIsEditing] = createSignal(false);
  const toggleEditing = () => {
    setIsEditing(!isEditing());
    if (isEditing()) {
      LocationNameInput.focus();
    } else {
      LocationNameInput.blur();
    }
  };

  const [newName, setNewName] = createSignal("");
  createEffect(() => {
    console.log("new", newName());
  });
  const saveLocationName = async () => {
    const newName = LocationNameInput.value;
    if (!newName) return;
    setNewName(newName);
    toggleEditing();
  };

  const [pictureUrl, setPictureUrl] = createSignal("");
  const [pictureFilepath, setPictureFilepath] = createSignal("");
  const hasPicture = () => pictureUrl() !== "";
  const canSave = (): boolean =>
    newName() !== "" || (location() !== null && hasPicture());

  const addPhotoToDevice = async () => {
    const image = await Camera.getPhoto({
      quality: 50,
      allowEditing: false,
      resultType: CameraResultType.Uri,
    });

    if (image.webPath) setPictureUrl(image.webPath);
    if (image.path) setPictureFilepath(image.path);
  };
  createEffect(() => {
    console.log(location());
  });

  const saveLocationSettings = async () => {
    debugger;
    const name = newName();
    const picture = pictureFilepath();
    const loc = location();
    if (loc) {
      if (name) {
        await storage.updateLocationName(loc, name);
      }
      if (picture) {
        debugger;
        await storage.updateLocationImage(loc, picture);
      }
    } else {
      const deviceLocation = await context.getLocationCoords(props.id);
      if (!deviceLocation.success) {
        logWarning({
          message: "Could not get device location",
          details: deviceLocation.message,
        });
        return;
      }
      await storage.saveLocation({
        name,
        coords: {
          lat: deviceLocation.data.latitude,
          lng: deviceLocation.data.longitude,
        },
        groupName: props.groupName,
        isProd: props.isProd,
      });
    }
    // await storage.updateLocationPicture(loc, pictureUrl());
    toggleEditing();
  };

  const locationName = () => {
    const name = newName();
    if (name) return name;
    const loc = location();
    if (!loc) return "No Location Found";
    return loc.name;
  };

  return (
    <ActionContainer
      action={
        <button class="text-blue-500" onClick={() => openDeviceInterface()}>
          <RiSystemArrowRightSLine size={32} />
        </button>
      }
    >
      <Dialog
        show={showLocationSettings()}
        onShowChange={setShowLocationSettings}
      >
        <div class="flex w-full justify-between">
          <h1 class="text-xl font-bold text-slate-600">Location Settings</h1>
          <button
            onClick={() => setShowLocationSettings(false)}
            class="text-gray-500"
          >
            <ImCross size={12} />
          </button>
        </div>
        <div class="w-full">
          <div class="space-y-4">
            <div>
              <Show when={pictureUrl() && !newName() && !location()}>
                <p class="text-sm text-yellow-400">
                  Add a name to save new location.
                </p>
              </Show>
              <p class="text-sm text-slate-400">Name:</p>
              <Show
                when={isEditing()}
                fallback={
                  <div
                    class="flex justify-between"
                    onClick={() => toggleEditing()}
                  >
                    <h1 class="text-sm text-gray-800">{locationName()}</h1>
                    <button class="text-blue-600">
                      <AiFillEdit size={18} />
                    </button>
                  </div>
                }
              >
                <div class="flex">
                  <input
                    ref={LocationNameInput}
                    type="text"
                    class="w-full rounded-l bg-slate-50 py-2 pl-2 text-sm text-gray-800 outline-none"
                    placeholder={locationName()}
                  />
                  <button
                    class="rounded-r bg-slate-50 px-4 py-2 text-gray-500"
                    onClick={toggleEditing}
                  >
                    <ImCross size={12} />
                  </button>
                  <button
                    class="pl-4 pr-2 text-green-400"
                    onClick={saveLocationName}
                  >
                    <ImCheckmark size={18} />
                  </button>
                </div>
              </Show>
            </div>
            <div>
              <p class="text-sm text-slate-400">Photo Reference:</p>
              <div class="rounded-md bg-slate-100">
                <Show
                  when={pictureUrl()}
                  fallback={
                    <button
                      class="flex w-full flex-col items-center justify-center p-8  text-gray-700"
                      onClick={() => addPhotoToDevice()}
                    >
                      <TbCameraPlus size={52} />
                      <p class="text-sm text-gray-800">Add Photo</p>
                    </button>
                  }
                >
                  <img
                    src={pictureUrl()}
                    class="max-h-[18rem] w-full rounded-md object-cover p-4"
                  />
                </Show>
              </div>
            </div>
            <div
              classList={{
                hidden: !location() && !hasPicture() && !newName(),
              }}
              class="mt-4 flex justify-end space-x-2 text-gray-500"
            >
              <button
                classList={{
                  "bg-blue-500 py-2 px-4 text-white rounded-md": canSave(),
                  "bg-gray-200 py-2 px-4 text-gray-500 rounded-md": !canSave(),
                }}
                disabled={!canSave()}
                onClick={() => saveLocationSettings()}
              >
                <p>{location() ? "Update" : "Save"}</p>
              </button>
              <button
                class="text-gray-400"
                onClick={() => {
                  setNewName("");
                  setPictureUrl("");
                  setPictureFilepath("");
                  setShowLocationSettings(false);
                }}
              >
                <p>Cancel</p>
              </button>
            </div>
          </div>
        </div>
      </Dialog>
      <div class=" flex items-center justify-between px-2">
        <div onClick={() => openDeviceInterface()} role="button">
          <div class="flex items-center space-x-2 ">
            <Show when={!props.isProd}>
              <ImCog size={20} />
            </Show>
            <h1 class="break-all text-left sm:text-lg">{props.name}</h1>
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
                storage.savedEvents().filter((val) => val.device === props.id)
                  .length
              }
              /{context.deviceEventKeys.get(props.id)?.length ?? 0}{" "}
            </p>
          </div>
        </div>
        <div class=" flex items-center space-x-6 px-2 text-blue-500">
          <Show
            when={!context.devicesDownloading.has(props.id)}
            fallback={<FaSolidSpinner size={28} class="animate-spin" />}
          >
            <button
              class={`${
                disabledDownload() ? "text-slate-300" : "text-blue-500"
              }`}
              disabled={disabledDownload()}
              onClick={() => download()}
            >
              <FiDownload size={28} />
            </button>
          </Show>
          <button
            class="text-blue-500"
            disabled={context.locationBeingSet.has(props.id)}
            onClick={() => setShowLocationSettings(true)}
          >
            <Switch>
              <Match
                when={
                  props.shouldUpdateLocation === undefined ||
                  context.locationBeingSet.has(props.id)
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
export function isKeyOfObject<T extends object>(
  key: string | number | symbol,
  obj: T
): key is keyof T {
  return key in obj;
}
function Devices() {
  const context = useDevice();
  const devices = createMemo(
    () => {
      const devices = [...context.devices.values()];
      return devices.filter((dev): dev is ConnectedDevice => dev.isConnected);
    },
    [],
    {
      equals: (prev, next) => {
        // check all objects in array are equal
        if (prev.length !== next.length) return false;
        prev.forEach((val) => {
          next.forEach((val2) => {
            Object.keys(val).forEach((key) => {
              if (!isKeyOfObject(key, val) && !isKeyOfObject(key, val2))
                return false;
              if (val[key] !== val2[key]) return false;
            });
          });
        });
        return true;
      },
    }
  );
  const [cancel, setCancel] = createSignal(false);

  const connectToBushnet = async () => {
    const { value } = await Prompt.confirm({
      title: "Connecting to Device",
      message: `Please turn on the device and wait at least 2 minutes for the device to setup its Wi-Fi then press "OK".\n Alternatively: connect to the device's wifi "bushnet" password "feathers" when available`,
    });

    if (!value) return;
    await DevicePlugin.connectToDeviceAP();
  };

  const searchDevice = () => {
    context.startDiscovery();
    setTimeout(() => {
      context.stopDiscovery();
    }, 6000);
  };

  onMount(() => {
    // Add delete button to header
    const header = headerMap.get("/devices");
    if (!header) return;

    headerMap.set("/devices", [
      header[0],
      <button
        onClick={connectToBushnet}
        class="block rounded-lg p-2 text-blue-500 outline outline-2 outline-slate-200"
      >
        <FaSolidWifi size={28} />
      </button>,
    ]);
  });
  const [pos] = createResource(async () => {
    try {
      return await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
      });
    } catch (e) {
      if (e instanceof Error) {
        logWarning(e);
      } else {
        logWarning({ message: "Error getting current location" });
      }
    }
  });

  onMount(async () => {
    searchDevice();
    const search = setInterval(() => {
      searchDevice();
    }, 60 * 1000 * 1);

    onCleanup(() => {
      clearInterval(search);
    });
  });

  const [devicesLocToUpdate] = createResource(
    () => {
      if (pos.loading) return false;

      return [[...context.devices.values()], pos()] as const;
    },
    async (sources) => {
      try {
        if (!sources) return [];
        const [devices, pos] = sources;
        if (!pos) return [];
        const devicesToUpdate: string[] = [];
        for (const device of devices.values()) {
          if (!device.isConnected) continue;
          const locationRes = await context.getLocationCoords(device.id);
          if (!locationRes.success) continue;
          const loc = locationRes.data;
          const diffLat = Math.abs(loc.latitude - pos.coords.latitude);
          const diffLong = Math.abs(loc.longitude - pos.coords.longitude);
          if (diffLat > 0.001 || diffLong > 0.001) {
            devicesToUpdate.push(device.id);
          }
        }
        return devicesToUpdate;
      } catch (e) {
        if (e instanceof Error) {
          logWarning(e);
        } else if (typeof e === "string") {
          logWarning({
            message: "Error updating device locations",
            details: e,
          });
        }

        return [];
      }
    }
  );

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

      const { value } = await Prompt.confirm({
        title: "Update Location",
        message,
      });
      if (value) {
        for (const device of context.devices.values()) {
          if (devices.includes(device.id)) {
            await context.setDeviceToCurrLocation(device.id);
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

  createEffect(() => {
    console.log(devices());
  });

  return (
    <>
      <section class="pb-bar pt-bar relative z-20 space-y-2 overflow-y-auto px-2">
        <For each={devices()}>
          {(device) => (
            <DeviceDetails
              id={device.id}
              name={device.name}
              url={device.url}
              isProd={device.isProd}
              groupName={device.group}
              shouldUpdateLocation={shouldDeviceUpdateLocation(device)}
            />
          )}
        </For>
        <div class="h-32" />
        <Portal>
          <div class="pb-bar fixed inset-x-0 bottom-[4vh] z-20 mx-auto flex justify-center">
            <CircleButton
              onClick={searchDevice}
              disabled={context.isDiscovering()}
              loading={context.isDiscovering()}
              text="Search Devices"
              loadingText="Searching..."
            />
          </div>
        </Portal>
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
