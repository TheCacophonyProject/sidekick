import { BsCameraVideoFill, BsFileEarmarkImageFill } from "solid-icons/bs";
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
import ActionContainer from "../../components/ActionContainer";
import {
  ConnectedDevice,
  Device,
  DevicePlugin,
  useDevice,
} from "../../contexts/Device";
import { RiDeviceRouterFill, RiSystemArrowRightSLine } from "solid-icons/ri";
import { BiRegularCurrentLocation, BiSolidError } from "solid-icons/bi";
import { AiFillEdit } from "solid-icons/ai";
import { Dialog as Prompt } from "@capacitor/dialog";
import { debounce, leading } from "@solid-primitives/scheduled";
import { FaSolidSpinner, FaSolidStop } from "solid-icons/fa";
import CircleButton from "../../components/CircleButton";
import { Geolocation } from "@capacitor/geolocation";
import { TbCameraPlus, TbCurrentLocation } from "solid-icons/tb";
import { FiDownload, FiMapPin } from "solid-icons/fi";
import { useStorage } from "../../contexts/Storage";
import {
  ImArrowLeft,
  ImArrowRight,
  ImCheckmark,
  ImCog,
  ImCross,
  ImNotification,
  ImSearch,
} from "solid-icons/im";
import { headerMap } from "../../components/Header";
import BackgroundLogo from "../../components/BackgroundLogo";
import { Recording } from "~/database/Entities/Recording";
import { Event } from "~/database/Entities/Event";
import { useNavigate } from "@solidjs/router";
import { logWarning } from "~/contexts/Notification";
import { Portal } from "solid-js/web";
import { Camera, CameraResultType } from "@capacitor/camera";
import Dialog from "~/components/Dialog";

interface DeviceDetailsProps {
  id: string;
  name: string;
  groupName: string;
  url: string;
  isProd: boolean;
  updateLocState: "loading" | "current" | "needsUpdate" | "unavailable";
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
  const navigate = useNavigate();
  const openDeviceInterface = leading(
    debounce,
    () => {
      navigate(`/devices/${props.id}`);
    },
    800
  );

  const [showLocationSettings, setShowLocationSettings] = createSignal(false);
  createEffect((prev) => {
    if (
      props.updateLocState === "current" &&
      prev !== "current" &&
      prev !== "loading" &&
      context.devices.size === 1
    ) {
      setShowLocationSettings(true);
    }
    if (props.updateLocState !== "loading") {
      return props.updateLocState;
    }
    return prev;
  }, "current");
  createEffect(() => {
    on(showLocationSettings, async (shown) => {
      if (!shown) return;
      await context?.setDeviceToCurrLocation(props.id);
    });
  });
  const [location, { refetch: refetchLocation }] = context.getLocationByDevice(
    props.id
  );

  createEffect(() => {
    on(
      () => props.updateLocState,
      async (shouldUpdate) => {
        if (shouldUpdate === "loading") return;
        refetchLocation();
      }
    );
  });

  const [LocationNameInput, setLocationNameInput] =
    createSignal<HTMLInputElement>();
  const [isEditing, setIsEditing] = createSignal(false);
  const toggleEditing = (state = !isEditing()) => {
    setIsEditing(state);
    if (isEditing()) {
      LocationNameInput()?.focus();
    } else {
      LocationNameInput()?.blur();
    }
  };

  const [newName, setNewName] = createSignal("");
  const saveLocationName = async () => {
    const newName = LocationNameInput()?.value;
    if (!newName) return;
    setNewName(newName);
    toggleEditing();
  };

  const [photoFilesToUpload, setPhotoFilesToUpload] = createSignal<
    { file: string; url: string }[]
  >([]);

  const canSave = (): boolean =>
    location() === null
      ? newName() !== ""
      : newName() !== "" || photoFilesToUpload().length > 0;

  const images = () => [
    ...(location()?.referenceImages ?? []),
    ...(location()?.uploadImages ?? []),
    ...photoFilesToUpload(),
  ];

  const addPhotoToDevice = async () => {
    const image = await Camera.getPhoto({
      quality: 100,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      width: 500,
    });

    if (image.path && image.webPath) {
      setPhotoFilesToUpload((curr) => [
        ...curr,
        { file: image.path ?? "", url: image.webPath ?? "" },
      ]);
      setPhotoIndex(images().length - 1);
    }
  };

  const [setting, setSetting] = createSignal(false);
  const saveLocationSettings = async () => {
    if (setting()) return;
    setSetting(true);
    const name = newName();
    const photoPaths = photoFilesToUpload();
    const deviceLocation = await context.getLocationCoords(props.id);
    const loc = location();
    if (!loc && deviceLocation.success) {
      await storage.createLocation({
        name,
        coords: {
          lat: deviceLocation.data.latitude,
          lng: deviceLocation.data.longitude,
        },
        groupName: props.groupName,
        referenceImages: photoPaths.map((photo) => photo.file),
        isProd: props.isProd,
      });
      await refetchLocation();
      setNewName("");
      return;
    }
    if (name) {
      const loc = location();
      if (loc) {
        await storage.updateLocationName(loc, name);
        setNewName("");
      }
      await refetchLocation();
    }
    if (photoPaths.length > 0) {
      for (const { file } of photoPaths) {
        try {
          const loc = location();
          if (!loc) continue;
          await storage.updateLocationPhoto(loc, file);
          setPhotoFilesToUpload((curr) =>
            curr.filter((photo) => photo.file !== file)
          );
        } catch {
          logWarning({
            message: "Could not save location photo",
            details: `Could not save photo ${file} for location ${loc}`,
          });
        }
      }
      await refetchLocation();
    }
    toggleEditing(false);
    setShowLocationSettings(false);
    setSetting(false);
  };

  const locationName = () => {
    const name = newName();
    if (name) return name;
    const loc = location();
    if (!loc) return "No Location Found";
    return loc.name;
  };

  const [photoIndex, setPhotoIndex] = createSignal(0);
  const hasPicture = () => images().length > 0;

  // Server Side referenceImages are first in the array
  const [photoReference] = createResource(
    () => [location(), images(), photoIndex()] as const,
    async (values) => {
      const [loc, imgs, idx] = values;
      const img = imgs[idx];
      if (!img) return "";
      if (typeof img === "string") {
        if (!loc) return "";
        const data = await storage.getReferencePhotoForLocation(loc.id, img);
        return data ?? img;
      } else {
        return img.url;
      }
    }
  );

  const isImageToUpload = () => {
    const idx = photoIndex();
    const startOfUploads = (location()?.referenceImages ?? []).length;
    return idx >= startOfUploads;
  };

  const removePhotoReference = async () => {
    const idx = photoIndex();
    const image = images()[idx];
    if (typeof image === "object") {
      setPhotoFilesToUpload((curr) => {
        const newFiles = [...curr].filter((file) => file.file !== image.file);
        return newFiles;
      });
    } else {
      const loc = location();
      if (loc && loc.referenceImages?.length) {
        const prompt = await Prompt.confirm({
          title: "Confirm Deletion",
          message: "Are you sure you want to delete this photo?",
        });
        if (prompt.value) {
          const res = await storage.deleteReferencePhotoForLocation(loc, image);
          if (res) {
            setPhotoIndex((curr) => {
              if (curr > 0) return curr - 1;
              return 0;
            });
          }
        }
      }
    }
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
        <div class="flex w-full content-center justify-between">
          <h1 class="text-xl font-bold text-slate-600">Location Settings</h1>
          <button
            onClick={() => setShowLocationSettings(false)}
            class="text-gray-500"
          >
            <ImCross size={12} />
          </button>
        </div>
        <Show when={props.updateLocState === "needsUpdate"}>
          <div class="flex w-full flex-col items-center">
            <button
              class="my-2 flex space-x-2 self-center rounded-md bg-blue-500 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => context.setDeviceToCurrLocation(props.id)}
            >
              <span class="text-sm">Update Location to Current</span>
              <FiMapPin size={18} />
            </button>
          </div>
        </Show>
        <div class="w-full">
          <div class="space-y-4">
            <div>
              <Show
                when={photoFilesToUpload().length && !newName() && !location()}
              >
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
                    <Show
                      when={!location.loading && location()?.updateName}
                      fallback={
                        <>
                          <h1 class="text-sm text-gray-800">
                            {locationName()}
                          </h1>
                        </>
                      }
                    >
                      {(loc) => (
                        <h1 class="flex space-x-2 text-sm text-yellow-600">
                          <BiSolidError size={18} />
                          {loc()}
                        </h1>
                      )}
                    </Show>
                    <button class="text-blue-600">
                      <AiFillEdit size={18} />
                    </button>
                  </div>
                }
              >
                <div class="flex">
                  <input
                    ref={setLocationNameInput}
                    type="text"
                    class="w-full rounded-l bg-slate-50 py-2 pl-2 text-sm text-gray-800 outline-none"
                    placeholder={locationName() ?? "Location Name"}
                  />
                  <button
                    class="rounded-r bg-slate-50 px-4 py-2 text-gray-500"
                    onClick={() => toggleEditing()}
                  >
                    <ImCross size={12} />
                  </button>
                  <button
                    class="pl-4 pr-2 text-highlight"
                    onClick={saveLocationName}
                  >
                    <ImCheckmark size={18} />
                  </button>
                </div>
              </Show>
            </div>
            <div>
              <p class="text-sm text-slate-400">Photo Reference:</p>
              <div class="relative rounded-md bg-slate-100">
                <Show
                  when={photoReference()}
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
                  <div class="absolute flex h-full w-full flex-col justify-between gap-2">
                    <div class="flex w-full justify-between">
                      <button
                        class="flex h-10 w-10 items-center justify-center rounded-br-lg bg-slate-100 p-2 text-blue-500"
                        onClick={() => addPhotoToDevice()}
                      >
                        <TbCameraPlus size={28} />
                      </button>
                      <button
                        class="flex h-10 w-10 items-center justify-center rounded-bl-lg bg-slate-100 p-2 text-red-500"
                        onClick={() => removePhotoReference()}
                      >
                        <ImCross size={18} />
                      </button>
                    </div>
                    <div class="flex w-full justify-between">
                      <button
                        class="flex h-10 w-10 items-center justify-center rounded-r-full bg-slate-100 p-2 text-gray-500"
                        onClick={() =>
                          setPhotoIndex((i) =>
                            i === 0 ? images().length - 1 : i - 1
                          )
                        }
                      >
                        <ImArrowLeft size={18} />
                      </button>
                      <button
                        class="flex h-10 w-10 items-center justify-center rounded-l-full bg-slate-100 p-2 text-gray-500"
                        onClick={() =>
                          setPhotoIndex((i) =>
                            i === images().length - 1 ? 0 : i + 1
                          )
                        }
                      >
                        <ImArrowRight size={18} />
                      </button>
                    </div>
                    <div class="w-fit self-center rounded-lg bg-slate-50 p-1">
                      {photoIndex() + 1}/{images().length}
                    </div>
                  </div>
                  <div
                    classList={{
                      "outline-yellow-500 outline outline-2": isImageToUpload(),
                    }}
                    class="h-[18rem]"
                  >
                    <Show
                      when={
                        !photoReference.loading &&
                        !photoReference.error &&
                        photoReference()
                      }
                    >
                      {(photo) => (
                        <img
                          src={photo()}
                          class="h-[18rem] w-full rounded-md object-cover p-4"
                        />
                      )}
                    </Show>
                  </div>
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
                  setPhotoFilesToUpload([]);
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
            fallback={
              <button
                class="text-red-500"
                onClick={() => context.stopSaveItems(props.id)}
              >
                <FaSolidStop size={28} />
              </button>
            }
          >
            <button
              class={`${
                disabledDownload() ? "text-slate-300" : "text-blue-500"
              }`}
              disabled={disabledDownload()}
              onClick={() => context.saveItems(props.id)}
            >
              <FiDownload size={28} />
            </button>
          </Show>
          <button
            class="text-blue-500"
            disabled={
              context.locationBeingSet.has(props.id) ||
              ["loading", "unavailable"].includes(props.updateLocState)
            }
            onClick={() => setShowLocationSettings(true)}
          >
            <Switch>
              <Match
                when={
                  props.updateLocState === "loading" ||
                  context.locationBeingSet.has(props.id)
                }
              >
                <FaSolidSpinner size={28} class="animate-spin" />
              </Match>
              <Match when={props.updateLocState === "current"}>
                <BiRegularCurrentLocation size={28} />
              </Match>
              <Match when={props.updateLocState === "unavailable"}>
                <div class="text-gray-200">
                  <BiRegularCurrentLocation size={28} />
                </div>
              </Match>
              <Match when={props.updateLocState === "needsUpdate"}>
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

  const searchDevice = () => {
    refetchLocation();
    context.startDiscovery();
    setTimeout(() => {
      context.stopDiscovery();
    }, 6000);
  };

  const [apState, setApState] = createSignal<
    "connected" | "disconnected" | "loading" | "default"
  >("default");

  const connectToDeviceAP = leading(
    debounce,
    () => {
      setApState("loading");
      DevicePlugin.connectToDeviceAP((res) => {
        console.log("AP CONNECTION", res);
        if (res.success) {
          searchDevice();
          setApState(res.data);
          if (res.data === "disconnected") {
            setTimeout(() => {
              setApState("default");
            }, 4000);
          }
        } else {
          logWarning({
            message: "Please ensure wifi is enabled and try again",
          });
          setApState("default");
        }
      });
    },
    800
  );
  onMount(() => {
    // Add delete button to header
    const header = headerMap.get("/devices");
    if (!header || header?.[1]) return;
    headerMap.set("/devices", [
      header[0],
      () => (
        <Show
          when={apState() !== "loading" && apState()}
          fallback={
            <span class="text-blue-500">
              <FaSolidSpinner size={28} class="animate-spin" />
            </span>
          }
        >
          {(state) => (
            <button
              onClick={connectToDeviceAP}
              classList={{
                "text-blue-500": state() === "default",
                "text-highlight": state() === "connected",
                "text-red-500": state() === "disconnected",
              }}
            >
              <RiDeviceRouterFill size={28} />
            </button>
          )}
        </Show>
      ),
    ]);
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
      try {
        if (!devices) return [];
        try {
          let permission = await Geolocation.checkPermissions();
          if (
            permission.location === "denied" ||
            permission.location === "prompt"
          ) {
            permission = await Geolocation.requestPermissions();
            if (permission.location === "prompt-with-rationale") {
              permission = await Geolocation.checkPermissions();
            } else {
              return [];
            }
          }
          if (permission.location !== "granted") return [];
        } catch (e) {
          return [];
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
        });
        const devicesToUpdate: string[] = [];
        for (const device of devices.values()) {
          if (!device.isConnected) continue;
          const locationRes = await context.getLocationCoords(device.id);
          if (!locationRes.success) continue;
          const loc = locationRes.data;
          const newLoc: [number, number] = [
            pos.coords.latitude,
            pos.coords.longitude,
          ];
          console.log(loc, newLoc);

          const withinRange = isWithinRange(
            [loc.latitude, loc.longitude],
            newLoc
          );
          console.log(withinRange);
          if (!withinRange) {
            devicesToUpdate.push(device.id);
          }
          return devicesToUpdate;
        }
      } catch (e) {
        if (e instanceof Error) {
          logWarning({
            message: "Error updating device locations",
            details: e.message,
          });
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
      if (dialogOpen()) return;
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

      setDialogOpen(true);
      const { value } = await Prompt.confirm({
        title: "Update Location",
        message,
      });
      setDialogOpen(false);
      if (value) {
        for (const device of devicesToUpdate) {
          await context.setDeviceToCurrLocation(device);
        }
        if (devicesToUpdate.length === 1) {
          return devicesToUpdate[0];
        }
      } else {
        setCancel(true);
      }
    }
  );

  const shouldDeviceUpdateLocation = (device: Device) => {
    if (devicesLocToUpdate.loading) return "loading";
    const devicesToUpdate = devicesLocToUpdate();
    if (!devicesToUpdate) return "unavailable";
    return devicesToUpdate
      ? devicesToUpdate.includes(device.id)
        ? "needsUpdate"
        : "current"
      : "loading";
  };

  return (
    <>
      <section class="pb-bar pt-bar pt-[ relative z-20 space-y-2 overflow-y-auto px-2">
        <For
          each={devices().filter(
            (dev): dev is ConnectedDevice => dev.isConnected
          )}
        >
          {(device) => (
            <DeviceDetails
              id={device.id}
              name={device.name}
              url={device.url}
              isProd={device.isProd}
              groupName={device.group}
              updateLocState={shouldDeviceUpdateLocation(device)}
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
            >
              <div class="text-blue-500">
                <ImSearch size={28} />
              </div>
            </CircleButton>
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
                <br /> To access a device, press the device's power button, then
                press the
                <span class="mx-1 inline-block text-blue-500">
                  <RiDeviceRouterFill />
                </span>
                button.
              </p>
            </Show>
          </div>
        </div>
      </div>
    </>
  );
}

export default Devices;
