import { Camera, CameraResultType } from "@capacitor/camera";
import { Dialog as Prompt } from "@capacitor/dialog";
import { debounce, leading } from "@solid-primitives/scheduled";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { AiFillEdit } from "solid-icons/ai";
import { BiRegularCurrentLocation, BiSolidError } from "solid-icons/bi";
import { BsCameraVideoFill } from "solid-icons/bs";
import {
  FaRegularEye,
  FaRegularEyeSlash,
  FaRegularTrashCan,
  FaSolidCheck,
  FaSolidLock,
  FaSolidLockOpen,
  FaSolidSpinner,
  FaSolidStop,
  FaSolidVideo,
} from "solid-icons/fa";
import { FiDownload, FiMapPin } from "solid-icons/fi";
import {
  ImArrowLeft,
  ImArrowRight,
  ImCog,
  ImCross,
  ImNotification,
  ImSearch,
} from "solid-icons/im";
import { RiDeviceRouterFill, RiArrowsArrowRightSLine } from "solid-icons/ri";
import { TbCameraPlus, TbCurrentLocation } from "solid-icons/tb";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import ActionContainer from "~/components/ActionContainer";
import BackgroundLogo from "~/components/BackgroundLogo";
import CircleButton from "~/components/CircleButton";
import FieldWrapper from "~/components/Field";
import { GoToPermissions } from "~/components/GoToPermissions";
import { headerMap } from "~/components/Header";
import { WifiNetwork, useDevice } from "~/contexts/Device";
import { logError, logWarning } from "~/contexts/Notification";
import { useStorage } from "~/contexts/Storage";
import { BsWifi1, BsWifi2, BsWifi } from "solid-icons/bs";
import { useUserContext } from "~/contexts/User";

type CameraCanvas =
  | HTMLCanvasElement
  | ((el: HTMLCanvasElement) => void)
  | undefined;

function CameraSettingsTab() {
  const context = useDevice();
  const [params] = useSearchParams();
  const id = () => params.deviceSettings;
  const [recording, setRecording] = createSignal(false);
  const [result, setResult] = createSignal<"failed" | "success" | null>(null);
  const createTestRecording = async () => {
    setRecording(true);
    const res = await context.takeTestRecording(id());
    setResult(res ? "success" : "failed");
    setRecording(false);
    setTimeout(() => setResult(null), 2000);
  };

  let frameCanvas: CameraCanvas;
  let trackCanvas: CameraCanvas;

  return (
    <section>
      <canvas
        ref={frameCanvas}
        id="frameCanvas"
        width="160"
        height="120"
        class="w-full"
      />
      <canvas
        ref={trackCanvas}
        id="trackCanvas"
        width="160"
        height="120"
        class="absolute z-10 w-full"
      />
      <button
        class="flex w-full items-center justify-center space-x-2 rounded-md bg-blue-500 py-3 text-white"
        onClick={() => createTestRecording()}
        disabled={recording()}
      >
        <Switch>
          <Match when={recording()}>
            <p>Recording...</p>
            <FaSolidSpinner class="animate-spin" size={24} />
          </Match>
          <Match when={result() === "success"}>
            <p>Success!</p>
            <FaSolidCheck size={24} />
          </Match>
          <Match when={result() === "failed"}>
            <ImCross size={12} />
          </Match>
          <Match when={!recording() && !result()}>
            <p>Test Recording</p>
            <FaSolidVideo size={24} />
          </Match>
        </Switch>
      </button>
    </section>
  );
}

function LocationSettingsTab() {
  const context = useDevice();
  const [params] = useSearchParams();
  const storage = useStorage();
  const [showLocationSettings, setShowLocationSettings] = createSignal(false);
  const id = () => params.deviceSettings;
  const groupName = () => context.devices.get(id())?.group ?? "";
  const isProd = () => context.devices.get(id())?.isProd ?? false;
  const shouldUpdateLocState = () => context.shouldDeviceUpdateLocation(id());

  createEffect((prev) => {
    const currUpdateLocState = shouldUpdateLocState();
    if (
      currUpdateLocState === "current" &&
      prev !== "current" &&
      prev !== "loading" &&
      context.devices.size === 1
    ) {
      setShowLocationSettings(true);
    }
    if (currUpdateLocState !== "loading") {
      return currUpdateLocState;
    }
    return prev;
  }, "current");

  createEffect(() => {
    on(showLocationSettings, async (shown) => {
      if (!shown) return;
      await context?.setDeviceToCurrLocation(id());
    });
  });
  const [location, { refetch: refetchLocation }] = context.getLocationByDevice(
    id()
  );

  createEffect(() => {
    on(
      () => shouldUpdateLocState(),
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

  const [photoFilesToUpload, setPhotoFilesToUpload] = createSignal<
    { file: string; url: string }[]
  >([]);

  const canSave = (): boolean =>
    location() === null
      ? newName() !== ""
      : newName() !== "" || photoFilesToUpload().length > 0;

  const photos = () => [
    ...(location()?.referencePhotos ?? []),
    ...(location()?.uploadPhotos ?? []),
    ...photoFilesToUpload(),
  ];

  const addPhotoToDevice = async () => {
    try {
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
        setPhotoIndex(photos().length - 1);
      }
    } catch (error) {
      logWarning({
        message: "Photo upload failed. Please check your device permissions.",
        action: <GoToPermissions />,
      });
    }
  };
  const [setting, setSetting] = createSignal(false);
  const saveLocationSettings = async () => {
    if (setting()) return;
    setSetting(true);
    const name = newName();
    const photoPaths = photoFilesToUpload();
    const deviceLocation = await context.getLocationCoords(id());
    const loc = location();
    if (!loc && deviceLocation.success) {
      await storage.createLocation({
        name,
        coords: {
          lat: deviceLocation.data.latitude,
          lng: deviceLocation.data.longitude,
        },
        groupName: groupName(),
        uploadPhotos: photoPaths.map((photo) => photo.file),
        isProd: isProd(),
      });
      await refetchLocation();
      setPhotoFilesToUpload([]);
      setNewName("");
      toggleEditing(false);
      setShowLocationSettings(false);
      setSetting(false);
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
        } catch (error) {
          logError({
            message: "Could not save location photo",
            details: `Could not save photo ${file} for location ${loc}`,
            error,
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
  const hasPicture = () => photos().length > 0;

  // Server Side referencePhotos are first in the array
  const [photoReference] = createResource(
    () => [location(), photos(), photoIndex()] as const,
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
    const startOfUploads = (location()?.referencePhotos ?? []).length;
    return idx >= startOfUploads;
  };

  const removePhotoReference = async () => {
    const idx = photoIndex();
    const image = photos()[idx];
    if (typeof image === "object") {
      setPhotoFilesToUpload((curr) => {
        return curr.filter((file) => file.file !== image.file);
      });
      setPhotoIndex((curr) => {
        if (curr > 0) return curr - 1;
        return 0;
      });
    } else {
      const loc = location();
      if (loc) {
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
    <section class="px-4 py-4">
      <Show when={shouldUpdateLocState() === "needsUpdate"}>
        <div class="flex w-full flex-col items-center">
          <button
            class="my-2 flex space-x-2 self-center rounded-md bg-blue-500 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => context.setDeviceToCurrLocation(id())}
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
                        <h1 class="text-sm text-gray-800">{locationName()}</h1>
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
                  onInput={(e) =>
                    setNewName((e.target as HTMLInputElement).value)
                  }
                />
                <button
                  class="rounded-r bg-slate-50 px-4 py-2 text-gray-500"
                  onClick={() => {
                    setNewName("");
                    toggleEditing();
                  }}
                >
                  <ImCross size={12} />
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
                      <FaRegularTrashCan size={22} />
                    </button>
                  </div>
                  <div class="flex w-full justify-between">
                    <button
                      class="flex h-10 w-10 items-center justify-center rounded-r-full bg-slate-100 p-2 text-gray-500"
                      onClick={() =>
                        setPhotoIndex((i) =>
                          i === 0 ? photos().length - 1 : i - 1
                        )
                      }
                    >
                      <ImArrowLeft size={18} />
                    </button>
                    <button
                      class="flex h-10 w-10 items-center justify-center rounded-l-full bg-slate-100 p-2 text-gray-500"
                      onClick={() =>
                        setPhotoIndex((i) =>
                          i === photos().length - 1 ? 0 : i + 1
                        )
                      }
                    >
                      <ImArrowRight size={18} />
                    </button>
                  </div>
                  <div class="w-fit self-center rounded-lg bg-slate-50 p-1">
                    {photoIndex() + 1}/{photos().length}
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
    </section>
  );
}

function WifiSettingsTab() {
  const context = useDevice();
  const [params] = useSearchParams();
  const device = () => context.devices.get(params.deviceSettings);
  const [wifiNetworks, { refetch: refetchWifiNetowrks }] = createResource(
    async () => context.getWifiNetworks(device()?.id ?? "")
  );
  const [currentWifi, { refetch }] = createResource(async () =>
    context.getCurrentWifiNetwork(device()?.id ?? "")
  );
  const [hasModem, { refetch: refetchHasModem }] = createResource(async () => {
    const interfaces = await context.getDeviceInterfaces(device()?.id ?? "");
    console.log(interfaces);
    return interfaces.find((iface) => iface.name === "usb0") !== undefined;
  });
  const [password, setPassword] = createSignal("");

  createEffect(() => {
    console.log("wifiNetworks", wifiNetworks());
  });

  const getWifiIcon = (signal: number) => (
    <Switch>
      <Match when={signal < 34}>
        <BsWifi1 size={28} />
      </Match>
      <Match when={signal < 67}>
        <BsWifi2 size={28} />
      </Match>
      <Match when={signal >= 67}>
        <BsWifi size={28} />
      </Match>
    </Switch>
  );

  const sortWifi = (a: WifiNetwork, b: WifiNetwork) => {
    if (currentWifi()?.SSID === a.SSID) return -1;
    if (a.quality > b.quality) return -1;
    if (a.quality < b.quality) return 1;
    return 0;
  };

  const [openedNetwork, setOpenedNetwork] = createSignal<WifiNetwork | null>(
    null
  );
  const [errorConnecting, setErrorConnecting] = createSignal<string | null>(
    null
  );

  const [connecting, setConnecting] = createSignal(false);
  const connectToWifi = async () => {
    setErrorConnecting(null);
    const wifi = openedNetwork();
    if (!wifi) return;
    setConnecting(true);
    const res = await context.connectToWifi(
      params.deviceSettings,
      wifi.SSID,
      password()
    );
    setConnecting(false);
    if (res) {
      setPassword("");
      setOpenedNetwork(null);
    } else {
      setErrorConnecting("Could not connect to wifi. Please try again.");
    }
    context.searchDevice();
    refetch();
  };

  const [disconnected, setDisconnected] = createSignal(false);

  const disconnectFromWifi = async () => {
    setErrorConnecting(null);
    const res = await context.disconnectFromWifi(params.deviceSettings);
    refetch();
    if (res) {
      setDisconnected(true);
      setTimeout(() => setOpenedNetwork(null), 5000);
    } else {
      setErrorConnecting("Could not disconnect from wifi.\n Please try again.");
    }
    context.searchDevice();
  };

  const [showPassword, setShowPassword] = createSignal(false);

  const checkInternetConnection = async () => {
    try {
      const res = await context.checkDeviceWifiInternetConnection(
        params.deviceSettings
      );
      console.log(res);
    } catch (error) {
      console.log(error);
    }
  };

  // Interval check for current wifi
  onMount(() => {
    const interval = setInterval(() => {
      refetchWifiNetowrks();
      refetch();
    }, 10000);
    onCleanup(() => clearInterval(interval));
  });

  const [
    wifiConnectedToInternet,
    { refetch: checkDeviceWifiInternetConnection },
  ] = createResource(
    () => currentWifi(),
    async (wifi) => {
      if (!wifi) return "no-wifi";
      const res = await context.checkDeviceWifiInternetConnection(
        params.deviceSettings
      );
      return res ? "connected" : "disconnected";
    }
  );

  const [modemConnectedToInternet] = createResource(
    () => hasModem(),
    async (modem) => {
      if (!modem) return "no-modem";
      const res = await context.checkDeviceModemInternetConnection(
        params.deviceSettings
      );
      return res ? "connected" : "disconnected";
    }
  );

  return (
    <div class="flex w-full  flex-col space-y-2 px-2 py-2">
      <section class="w-full space-y-2">
        <FieldWrapper
          type="custom"
          title={
            <div class="flex items-center justify-center gap-x-2">
              <div
                classList={{
                  "bg-yellow-300": modemConnectedToInternet.loading,
                  "bg-gray-400": modemConnectedToInternet() === "no-modem",
                  "bg-green-500": modemConnectedToInternet() === "connected",
                  "bg-red-500": modemConnectedToInternet() === "disconnected",
                }}
                class="h-2 w-2 rounded-full transition-colors"
              />
              <p>Modem</p>
            </div>
          }
        >
          <div class="flex h-full w-full items-center justify-between p-2">
            <p>{hasModem() ? "Connected" : "-"}</p>{" "}
          </div>
        </FieldWrapper>
        <FieldWrapper
          type="custom"
          title={
            <div class="flex items-center justify-center gap-x-2">
              <div
                classList={{
                  "bg-yellow-300": wifiConnectedToInternet.loading,
                  "bg-gray-400": wifiConnectedToInternet() === "no-wifi",
                  "bg-green-500": wifiConnectedToInternet() === "connected",
                  "bg-red-500": wifiConnectedToInternet() === "disconnected",
                }}
                class="h-2 w-2 rounded-full transition-colors"
              />
              <p>WiFi</p>
            </div>
          }
        >
          <div class="flex h-full w-full items-center justify-between p-2">
            <p>{currentWifi()?.SSID ?? "-"}</p>{" "}
          </div>
        </FieldWrapper>
      </section>
      <Show
        when={currentWifi() || !currentWifi.loading || !currentWifi.error}
        fallback={
          <div class="flex w-full items-center justify-center">
            <FaSolidSpinner size={28} class="animate-spin" />
          </div>
        }
      >
        <section class="flex h-64 flex-col space-y-2 overflow-y-auto rounded-md bg-neutral-100 p-2">
          <For each={wifiNetworks()?.sort(sortWifi)}>
            {(val) => (
              <button
                classList={{
                  "bg-white": currentWifi()?.SSID === val.SSID,
                  "bg-gray-50": currentWifi()?.SSID !== val.SSID,
                }}
                class="flex w-full items-center justify-between rounded-md px-4 py-4"
                onClick={() => setOpenedNetwork(val)}
              >
                <div class="flex items-center space-x-2">
                  {getWifiIcon(val.quality)}
                  <span class="">
                    <h1 class="text-slate-900">{val.SSID}</h1>
                    <Show when={val.SSID === currentWifi()?.SSID}>
                      <p class="text-xs text-slate-600">Connected</p>
                    </Show>
                  </span>
                </div>
                <Show when={val.SSID !== currentWifi()?.SSID}>
                  <Show when={val.isSecured} fallback={<FaSolidLockOpen />}>
                    <div class="text-gray-800">
                      <FaSolidLock />
                    </div>
                  </Show>
                </Show>
              </button>
            )}
          </For>
        </section>
      </Show>
      <Portal>
        <Show when={openedNetwork()}>
          {(ssid) => (
            <div class="fixed left-1/2 top-1/2 z-50 h-auto w-11/12 -translate-x-1/2 -translate-y-1/2 transform rounded-xl border bg-white px-3 py-4  shadow-lg">
              <div class="flex justify-between px-4 pb-2">
                <div class="flex items-center space-x-4">
                  {getWifiIcon(ssid().quality)}
                  <h1 class="text-lg text-neutral-800">{ssid().SSID}</h1>
                </div>
                <button
                  onClick={() => {
                    setPassword("");
                    setOpenedNetwork(null);
                  }}
                  class="text-gray-500"
                >
                  <ImCross size={12} />
                </button>
              </div>
              <p class="whitespace-pre-line px-3 py-2 text-red-500">
                {errorConnecting()}
              </p>
              <Show
                when={!currentWifi() || ssid().SSID !== currentWifi()?.SSID}
                fallback={
                  <Show
                    when={disconnected()}
                    fallback={
                      <div>
                        <button
                          class="flex w-full items-center justify-center rounded-md bg-blue-500 py-3 text-white"
                          onClick={() => {
                            disconnectFromWifi();
                          }}
                        >
                          <p>Disconnect</p>
                        </button>
                      </div>
                    }
                  >
                    <div>
                      <p class="whitespace-pre-line text-green-500">
                        Device has successfully been disconnected from wifi.\n
                        Would you like to try to connect to it?
                      </p>
                      <button
                        class="flex w-full items-center justify-center rounded-md bg-blue-500 py-3 text-white"
                        onClick={() => {
                          context.connectToDeviceAP();
                        }}
                      >
                        Connect to Device
                      </button>
                    </div>
                  </Show>
                }
              >
                <Show when={connecting()}>
                  <p class="px-2 pb-2">
                    To continue accessing this device, please ensure you are
                    connected to the same WiFi network.
                  </p>
                </Show>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    connectToWifi();
                  }}
                  class="flex w-full flex-col items-center space-y-2 px-2"
                >
                  <Show when={ssid().isSecured}>
                    <div class="flex w-full items-center space-x-2">
                      <input
                        class="w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                        type={showPassword() ? "text" : "password"}
                        placeholder="Password"
                        required
                        value={password()}
                        onInput={(e) =>
                          setPassword((e.target as HTMLInputElement).value)
                        }
                      />
                      <button
                        type="button"
                        class="px-2 text-neutral-500"
                        onClick={() => setShowPassword(!showPassword())}
                      >
                        <Show
                          when={!showPassword()}
                          fallback={<FaRegularEye size={24} />}
                        >
                          <FaRegularEyeSlash size={24} />
                        </Show>
                      </button>
                    </div>
                  </Show>
                  <button
                    type="submit"
                    class="flex w-full items-center justify-center space-x-2 rounded-md bg-blue-500 py-3 text-white"
                    disabled={
                      (showPassword() && password().length < 8) ||
                      Boolean(connecting())
                    }
                  >
                    <Show when={connecting()} fallback={<p>Connect</p>}>
                      <p>Connecting...</p>
                    </Show>
                  </button>
                </form>
              </Show>
            </div>
          )}
        </Show>
      </Portal>
    </div>
  );
}

function GeneralSettingsTab() {
  const user = useUserContext();
  const context = useDevice();
  const [params] = useSearchParams();
  const device = () => context.devices.get(params.deviceSettings);
  const id = () => device()?.id ?? "";
  const name = () => device()?.name ?? "";
  const groupName = () => device()?.group ?? "";
  return (
    <div class="flex w-full flex-col space-y-2 px-2 py-4">
      <FieldWrapper type="text" value={id()} title="Id" />
      <FieldWrapper type="text" value={name()} title="Name" />
      <FieldWrapper
        type="dropdown"
        value={groupName()}
        title="Group"
        onChange={(val) => {
          console.log(val);
        }}
        options={
          user.groups.loading
            ? []
            : (user.groups()?.map(({ groupName }) => groupName) as string[])
        }
      />
      <A
        class="flex w-full items-center justify-center py-2 text-center text-lg text-blue-600"
        href={`/devices/${id()}`}
      >
        <span>Advanced</span>
        <RiArrowsArrowRightSLine size={26} />
      </A>
    </div>
  );
}

function DeviceSettingsModal() {
  const context = useDevice();
  const [params, setParams] = useSearchParams();
  const currTab = () => params.tab ?? "General";
  const navItems = [
    "General",
    "Network",
    "Location",
    "Camera",
    "Audio",
  ] as const;
  const show = () => Boolean(params.deviceSettings);

  const clearParams = () => {
    setParams({ deviceSettings: undefined, tab: undefined });
  };

  const setCurrNav = (nav: (typeof navItems)[number]) => {
    console.log(nav);
    setParams({ tab: nav });
  };

  const deviceName = () => {
    const deviceName = context.devices.get(params.deviceSettings)?.name;
    if (!deviceName) {
      clearParams();
    }
    return deviceName;
  };

  return (
    <Show when={show()}>
      <div class="fixed left-1/2 top-1/2 z-50 h-auto w-11/12 -translate-x-1/2 -translate-y-1/2 transform rounded-xl border bg-white shadow-lg">
        <header class="flex justify-between px-4">
          <div class="flex items-center py-4">
            <BsCameraVideoFill size={32} />
            <h1 class="pl-2 text-lg font-medium text-slate-600">
              {deviceName()}
            </h1>
          </div>
          <button onClick={() => clearParams()} class="text-gray-500">
            <ImCross size={12} />
          </button>
        </header>
        <nav class="flex w-full justify-between">
          <For each={navItems}>
            {(nav) => (
              <button
                classList={{
                  "text-green-400": currTab() === nav,
                  "bg-gray-100 text-slate-400": currTab() !== nav,
                }}
                class="w-full px-2 py-4"
                onClick={() => setCurrNav(nav)}
              >
                {nav}
              </button>
            )}
          </For>
        </nav>
        <Switch>
          <Match when={currTab() === "General"}>
            <GeneralSettingsTab />
          </Match>
          <Match when={currTab() === "Network"}>
            <WifiSettingsTab />
          </Match>
          <Match when={currTab() === "Location"}>
            <LocationSettingsTab />
          </Match>
          <Match when={currTab() === "Camera"}>
            <CameraSettingsTab />
          </Match>
        </Switch>
      </div>
    </Show>
  );
}

interface DeviceDetailsProps {
  id: string;
  name: string;
  groupName: string;
  url?: string;
  isProd: boolean;
}

function DeviceDetails(props: DeviceDetailsProps) {
  const context = useDevice();
  const storage = useStorage();
  const savedRecs = () =>
    storage
      .savedRecordings()
      .filter((rec) => rec.device === props.id && !rec.isUploaded);
  const deviceRecs = () => context.deviceRecordings.get(props.id) ?? [];
  const savedEvents = () =>
    storage
      .savedEvents()
      .filter((event) => event.device === props.id && !event.isUploaded);
  const eventKeys = () => context.deviceEventKeys.get(props.id) ?? [];
  const disabledDownload = () => {
    const hasRecsToDownload =
      deviceRecs().length > 0 && deviceRecs().length !== savedRecs().length;
    const hasEventsToDownload =
      eventKeys().length > 0 && savedEvents().length !== eventKeys().length;
    return !hasRecsToDownload && !hasEventsToDownload;
  };
  const [params, setParams] = useSearchParams();

  const navigate = useNavigate();
  const openDeviceInterface = leading(
    debounce,
    () => {
      setParams({ deviceSettings: props.id });
      console.log(params.deviceSettings);
    },
    800
  );

  const [showTooltip, setShowTooltip] = createSignal(false);

  const updateLocState = () => context.shouldDeviceUpdateLocation(props.id);

  return (
    <ActionContainer
      action={
        <button class="text-blue-500" onClick={() => openDeviceInterface()}>
          <RiArrowsArrowRightSLine size={32} />
        </button>
      }
    >
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
            class="relative text-blue-500"
            disabled={
              context.locationBeingSet.has(props.id) ||
              ["loading", "unavailable"].includes(updateLocState())
            }
            title={
              updateLocState() === "unavailable"
                ? "Please enable permissions in your settings."
                : ""
            }
            onClick={() => navigate(`#location`)}
            onTouchStart={() =>
              updateLocState() === "unavailable" && setShowTooltip(true)
            }
            onTouchEnd={() => setShowTooltip(false)}
            onMouseEnter={() =>
              updateLocState() === "unavailable" && setShowTooltip(true)
            }
            onMouseLeave={() => setShowTooltip(false)}
          >
            <Show when={showTooltip()}>
              <div class="relative">
                <div class="absolute bottom-full right-0 mb-2 -translate-x-0.5 transform whitespace-nowrap rounded bg-gray-700 p-1 text-xs text-white">
                  Please enable permissions in your settings.
                </div>
              </div>
            </Show>
            <Switch>
              <Match
                when={
                  updateLocState() === "loading" ||
                  context.locationBeingSet.has(props.id)
                }
              >
                <FaSolidSpinner size={28} class="animate-spin" />
              </Match>
              <Match when={updateLocState() === "current"}>
                <BiRegularCurrentLocation size={28} />
              </Match>
              <Match when={updateLocState() === "unavailable"}>
                <div class="text-gray-200">
                  <BiRegularCurrentLocation size={28} />
                </div>
              </Match>
              <Match when={updateLocState() === "needsUpdate"}>
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
      return [...context.devices.values()];
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
  const [locPromptCancelled, setPromptCancel] = createSignal(false);

  onMount(() => {
    // Add delete button to header
    const header = headerMap.get("/devices");
    if (!header || header?.[1]) return;
    headerMap.set("/devices", [
      header[0],
      () => (
        <Show
          when={context.apState() !== "loading" && context.apState()}
          fallback={
            <span class="text-blue-500">
              <FaSolidSpinner size={28} class="animate-spin" />
            </span>
          }
        >
          {(state) => (
            <button
              onClick={context.connectToDeviceAP}
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
    context.searchDevice();
    const search = setInterval(() => {
      context.searchDevice();
    }, 60 * 1000 * 1);

    onCleanup(() => {
      clearInterval(search);
    });
  });

  const [isDialogOpen, setIsDialogOpen] = createSignal(false);
  createEffect(
    on(
      () => {
        if (context.devicesLocToUpdate.loading) return false;
        return [context.devicesLocToUpdate(), context.isDiscovering()] as const;
      },
      async (sources) => {
        if (!sources) return;
        const [devices, isDiscovering] = sources;
        if (!devices || isDiscovering) return;

        const devicesToUpdate = devices.filter(
          (val) => !context.locationBeingSet.has(val)
        );
        if (
          devicesToUpdate.length === 0 ||
          locPromptCancelled() ||
          isDialogOpen()
        )
          return;
        if (isDialogOpen()) return;
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

        setIsDialogOpen(true);
        const { value } = await Prompt.confirm({
          title: "Update Location",
          message,
        });
        setIsDialogOpen(false);
        if (value) {
          for (const device of devicesToUpdate) {
            await context.setDeviceToCurrLocation(device);
          }
          if (devicesToUpdate.length === 1) {
            return devicesToUpdate[0];
          }
        } else {
          setPromptCancel(true);
        }
      }
    )
  );

  createEffect(() => {
    console.log(devices());
  });

  return (
    <>
      <section class="pb-bar pt-bar relative z-20 space-y-2 overflow-y-auto px-2">
        <For
          each={devices().sort((dev) =>
            dev.isConnected ? -1 : dev.isProd ? 1 : 0
          )}
        >
          {(device) => (
            <DeviceDetails
              id={device.id}
              name={device.name}
              url={device.isConnected ? device.url : undefined}
              isProd={device.isProd}
              groupName={device.group}
            />
          )}
        </For>
        <div class="h-32" />
        <Portal>
          <div class="pb-bar fixed inset-x-0 bottom-2 z-20 mx-auto flex justify-center">
            <CircleButton
              onClick={context.searchDevice}
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
        <Portal>
          <DeviceSettingsModal />
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
