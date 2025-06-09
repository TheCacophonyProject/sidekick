import { Dialog as Prompt } from "@capacitor/dialog";
import { debounce, leading } from "@solid-primitives/scheduled";
import { useSearchParams } from "@solidjs/router";
import { AiOutlineUnorderedList } from "solid-icons/ai";
import { BiRegularCurrentLocation } from "solid-icons/bi";
import { BsCameraVideoFill } from "solid-icons/bs";
import {
  FaSolidBatteryFull,
  FaSolidSpinner,
  FaSolidStop,
} from "solid-icons/fa";
import { FiDownload } from "solid-icons/fi";
import { ImCog, ImSearch } from "solid-icons/im";
import { RiDeviceRouterFill, RiArrowsArrowRightSLine } from "solid-icons/ri";
import { TbCurrentLocation, TbPlugConnectedX } from "solid-icons/tb";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  createResource,
  on,
  onCleanup,
  onMount,
  createMemo,
} from "solid-js";
import { Portal } from "solid-js/web";
import ActionContainer from "~/components/ActionContainer";
import BackgroundLogo from "~/components/BackgroundLogo";
import DeviceSettingsModal from "~/components/DeviceSettings";
import { useHeaderContext } from "~/components/Header";
import SetupWizard from "~/components/SetupWizard";
import { type Device, useDevice } from "~/contexts/Device";
import { useLogsContext } from "~/contexts/LogsContext";
import { useStorage } from "~/contexts/Storage";
import { useUserContext } from "~/contexts/User";
import { DevicePlugin } from "../../contexts/Device";
import { NativeSettings } from "capacitor-native-settings/dist/esm";
import { IOSSettings } from "capacitor-native-settings/dist/esm";
import { AndroidSettings } from "capacitor-native-settings/dist/esm";
import { App } from "@capacitor/app/dist/esm";
import { Capacitor } from "@capacitor/core";

interface DeviceDetailsProps {
  id: string;
  name: string;
  groupName: string;
  isConnected: boolean;
  url?: string;
  isProd: boolean;
  batteryPercentage?: string;
}

function DeviceDetails(props: DeviceDetailsProps) {
  const context = useDevice();
  const log = useLogsContext();
  const storage = useStorage();
  const userContext = useUserContext();
  const savedRecs = () =>
    storage
      .savedRecordings()
      .filter((rec) => rec.device === props.id && !rec.isUploaded);
  const device = () => context.devices.get(props.id);
  const needsSetup = () => device()?.group === "new";
  const deviceRecs = () => context.deviceRecordings.get(props.id) ?? [];
  const savedEvents = () =>
    storage
      .savedEvents()
      .filter((event) => event.device === props.id && !event.isUploaded);
  const eventKeys = createMemo(
    () => context.deviceEventKeys.get(props.id) ?? []
  );
  const disabledDownload = () => {
    const hasRecsToDownload =
      deviceRecs().length > 0 && deviceRecs().length !== savedRecs().length;
    const hasEventsToDownload =
      eventKeys().length > 0 && savedEvents().length !== eventKeys().length;
    return (
      !hasRecsToDownload ||
      (userContext.dev() && !hasEventsToDownload && !hasRecsToDownload)
    );
  };
  const [, setParams] = useSearchParams();

  const openDeviceInterface = leading(
    debounce,
    () => {
      if (!props.isConnected) return;
      if (!userContext.dev() && needsSetup()) {
        setParams({
          setupDevice: props.id,
          step: "wifiSetup",
        });
        console.info("device_setup", { device_id: props.id });
      } else {
        setParams({ deviceSettings: props.id });
        console.info("device_settings", { device_id: props.id });
      }
    },
    800
  );

  const [showTooltip, setShowTooltip] = createSignal(false);

  const updateLocState = createMemo(() =>
    context.shouldDeviceUpdateLocation(props.id)
  );
  const user = useUserContext();

  const hasEventsToDownload = createMemo(
    () => eventKeys().length > 0 && savedEvents().length !== eventKeys().length
  );
  createEffect(
    on(hasEventsToDownload, async (hasEventsToDownload) => {
      if (hasEventsToDownload) {
        const device = context.devices.get(props.id);
        if (!device || !device.isConnected) return;
        await context.saveEvents(device);
      }
    })
  );

  return (
    <ActionContainer
      disabled={!props.isConnected}
      action={
        <Show when={props.isConnected}>
          <button
            class="flex items-center text-blue-500"
            onClick={() => openDeviceInterface()}
          >
            <Show when={needsSetup()}>
              <p>Setup</p>
            </Show>
            <RiArrowsArrowRightSLine size={32} />
          </button>
        </Show>
      }
    >
      <div class=" flex items-center justify-between">
        <div class="w-full" onClick={() => openDeviceInterface()} role="button">
          <div class="flex items-center space-x-1 ">
            <Show when={!props.isProd}>
              <ImCog size={20} />
            </Show>
            <h1 class="break-all text-left text-sm">{props.name}</h1>
          </div>
          <Show
            when={
              props.batteryPercentage !== "0" &&
              props.batteryPercentage !== "" &&
              props.batteryPercentage
            }
          >
            {(percentage) => (
              <div class="mt-2 flex w-full items-center space-x-2 text-slate-700">
                <FaSolidBatteryFull size={20} />
                <p class="text-sm">Battery: {percentage()}%</p>
              </div>
            )}
          </Show>
          <div class="mt-2 flex w-full items-center space-x-2 text-slate-700">
            <BsCameraVideoFill size={20} />
            <p class="text-sm">
              Recordings Saved: {savedRecs().length}/{deviceRecs().length}{" "}
            </p>
          </div>
          <div class="mt-2 flex w-full items-center space-x-2 text-slate-700">
            <AiOutlineUnorderedList size={20} />
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
        <Show
          when={props.isConnected}
          fallback={
            <div class="px-8 text-neutral-700">
              <TbPlugConnectedX size={32} />
            </div>
          }
        >
          <div class=" flex items-center text-blue-500">
            <Show
              when={!context.devicesDownloading.has(props.id)}
              fallback={
                <button
                  class="p-2 text-red-500"
                  onClick={() => context.stopSaveItems(props.id)}
                >
                  <FaSolidStop size={28} />
                </button>
              }
            >
              <button
                class={`${disabledDownload() ? "text-slate-300" : "text-blue-500"
                  } p-2`}
                disabled={disabledDownload()}
                onClick={() => context.saveItems(props.id)}
              >
                <FiDownload size={28} />
              </button>
            </Show>
            <button
              class="relative p-2 text-blue-500"
              disabled={
                context.locationBeingSet.has(props.id) ||
                ["loading", "unavailable"].includes(updateLocState())
              }
              title={
                updateLocState() === "unavailable"
                  ? "Please enable permissions in your settings."
                  : ""
              }
              onClick={() => {
                openDeviceInterface();
                setParams({ tab: "Location" });
              }}
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
        </Show>
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

/**
 * Performs a deep comparison between two arrays of Device objects
 * @param arr1 First array of Device objects
 * @param arr2 Second array of Device objects
 * @returns boolean indicating whether the arrays are deeply equal
 */
export function compareDeviceArrays(arr1: Device[], arr2: Device[]): boolean {
  if (arr1.length !== arr2.length) return false;

  // Sort arrays by device ID to ensure consistent comparison
  const sortedArr1 = [...arr1].sort((a, b) => a.id.localeCompare(b.id));
  const sortedArr2 = [...arr2].sort((a, b) => a.id.localeCompare(b.id));

  return sortedArr1.every((device1, index) => {
    const device2 = sortedArr2[index];
    return deepCompareDevices(device1, device2);
  });
}

/**
 * Performs a deep comparison between two Device objects
 * @param device1 First Device object
 * @param device2 Second Device object
 * @returns boolean indicating whether the devices are deeply equal
 */
function deepCompareDevices(device1: Device, device2: Device): boolean {
  // Compare basic properties
  const basicPropsEqual =
    device1.id === device2.id &&
    device1.host === device2.host &&
    device1.name === device2.name &&
    device1.group === device2.group &&
    device1.endpoint === device2.endpoint &&
    device1.isProd === device2.isProd &&
    device1.locationSet === device2.locationSet &&
    device1.url === device2.url &&
    device1.type === device2.type &&
    device1.isConnected === device2.isConnected;

  if (!basicPropsEqual) return false;

  // Compare optional properties
  const optionalPropsEqual =
    device1.saltId === device2.saltId &&
    device1.batteryPercentage === device2.batteryPercentage &&
    compareDates(device1.timeFound, device2.timeFound) &&
    compareOptionalDates(device1.lastUpdated, device2.lastUpdated);

  return basicPropsEqual && optionalPropsEqual;
}

/**
 * Compares two Date objects for equality
 * @param date1 First Date object
 * @param date2 Second Date object
 * @returns boolean indicating whether the dates are equal
 */
function compareDates(date1: Date, date2: Date): boolean {
  return date1.getTime() === date2.getTime();
}

/**
 * Compares two optional Date objects for equality
 * @param date1 First optional Date object
 * @param date2 Second optional Date object
 * @returns boolean indicating whether the dates are equal
 */
function compareOptionalDates(date1?: Date, date2?: Date): boolean {
  if (!date1 && !date2) return true;
  if (!date1 || !date2) return false;
  return date1.getTime() === date2.getTime();
}
function Devices() {
  const context = useDevice();
  const userContext = useUserContext();
  const devices = createMemo(() => [...context.devices.values()], [], {
    equals: compareDeviceArrays,
  });
  const [groupPromptCancelled, setGroupCancelledPrompt] = createSignal(false);
  const [locPromptCancelled, setPromptCancel] = createSignal(false);
  const headerContext = useHeaderContext();
  const log = useLogsContext();
  const [tryDisconnect, setTryDisconnect] = createSignal(false);
  const [showButtonTooltip, setShowButtonTooltip] = createSignal(false);
  let tooltipTimeout: NodeJS.Timeout;

  onMount(() => {
    // Add delete button to header
    const header = headerContext?.headerMap.get("/devices");
    if (!header || header?.[1]) return;
    headerContext?.headerMap.set("/devices", [
      header[0],
      () => (
        <button
          onClick={async () => {
            // Prevent clicks during loading states
            if (["loadingConnect", "loadingDisconnect"].includes(context.apState())) return;

            console.log(
              "AP button clicked, current state:",
              context.apState()
            );
            try {
              if (context.apState() === "connected") {
                if (tryDisconnect()) return;
                setTryDisconnect(true);
                const dialog = await Prompt.confirm({
                  title: "Disconnect from Device",
                  message:
                    "You are currently connected to the device's WiFi network. Disconnect from the device to connect to another network?",
                });
                if (dialog.value) {
                  await context.disconnectFromDeviceAP();
                }
              } else {
                context.connectToDeviceAP();
              }
            } catch (error) {
              console.error(
                "Error in connecting/disconnecting from device",
                error
              );
              log.logError({
                message: "Error connecting/disconnecting",
                error,
              });
            } finally {
              setTryDisconnect(false);
            }
          }}
          onTouchStart={() => {
            // Show tooltip on touch for mobile
            clearTimeout(tooltipTimeout);
            setShowButtonTooltip(true);
            // Hide after 2 seconds
            tooltipTimeout = setTimeout(() => {
              setShowButtonTooltip(false);
            }, 2000);
          }}
          class="group relative flex items-center gap-2 rounded-lg px-3 py-2 shadow-md transition-all active:scale-95"
          classList={{
            "bg-blue-500 text-white hover:bg-blue-600 hover:shadow-lg":
              context.apState() === "default" ||
              context.apState() === "disconnected",
            "bg-orange-500 text-white hover:bg-orange-600 hover:shadow-lg":
              context.apState() === "connected",
            "bg-blue-400 text-white cursor-wait":
              context.apState() === "loadingConnect",
            "bg-orange-400 text-white cursor-wait":
              context.apState() === "loadingDisconnect",
          }}
          disabled={["loadingConnect", "loadingDisconnect"].includes(context.apState())}
          title={getButtonTitle(context.apState())}
        >
          <Show
            when={!["loadingConnect", "loadingDisconnect"].includes(context.apState())}
            fallback={
              <FaSolidSpinner size={20} class="animate-spin" />
            }
          >
            <RiDeviceRouterFill size={24} />
          </Show>
          <span class="hidden font-medium sm:inline">
            <Switch>
              <Match when={context.apState() === "connected"}>
                Disconnect Device
              </Match>
              <Match when={context.apState() === "disconnected"}>
                Connect to Device
              </Match>
              <Match when={context.apState() === "loadingConnect"}>
                Connecting...
              </Match>
              <Match when={context.apState() === "loadingDisconnect"}>
                Disconnecting...
              </Match>
              <Match when={context.apState() === "default"}>
                Connect to Device
              </Match>
            </Switch>
          </span>
          <span class="font-medium sm:hidden">
            <Switch>
              <Match when={context.apState() === "connected"}>
                Disconnect
              </Match>
              <Match when={context.apState() === "disconnected"}>
                Connect
              </Match>
              <Match when={context.apState() === "loadingConnect"}>
                Connecting
              </Match>
              <Match when={context.apState() === "loadingDisconnect"}>
                Disconnecting
              </Match>
              <Match when={context.apState() === "default"}>
                Connect
              </Match>
            </Switch>
          </span>
          {/* Mobile-friendly tooltip */}
          <Show when={showButtonTooltip()}>
            <div class="pointer-events-none absolute top-full right-0 mt-2 w-max animate-fade-in rounded bg-gray-800 px-2 py-1 text-xs text-white shadow-lg sm:hidden">
              {getButtonTitle(context.apState())}
            </div>
          </Show>
        </button>
      ),
    ]);
  });

  // Add this helper function to get an appropriate tooltip for the button
  function getButtonTitle(state: string | undefined): string {
    switch (state) {
      case "connected":
        return "Disconnect from device network";
      case "disconnected":
        return "Connect directly to device";
      case "default":
        return "Connect directly to device";
      case "loadingConnect":
        return "Connecting to device...";
      case "loadingDisconnect":
        return "Disconnecting from device...";
      default:
        return "Device connection";
    }
  }

  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = createSignal(false);
  createEffect(
    on(
      () => {
        if (context.devicesLocToUpdate.loading) return false;
        return [context.devicesLocToUpdate()] as const;
      },
      async (sources) => {
        if (!sources) return;
        const [devices] = sources;
        if (!devices) return;

        const devicesToUpdate = devices.filter(
          (val) => !context.locationBeingSet.has(val)
        );
        if (
          devicesToUpdate.length === 0 ||
          locPromptCancelled() ||
          isDialogOpen() ||
          searchParams.setupDevice
        )
          return;
        if (devicesToUpdate.length === 1) {
          const device = context.devices.get(devicesToUpdate[0]);
          if (device) {
            // if it's new and not in the setup wizard prompt the user to do so.
            if (device.group === "new") {
              if (groupPromptCancelled()) return;
              const message = `Looks like ${device.name} needs to be setup. Would you like to setup the group and location?`;
              setIsDialogOpen(true);
              const { value } = await Prompt.confirm({
                title: "Setup Device",
                message,
              });
              if (value) {
                setSearchParams({
                  ...searchParams,
                  setupDevice: devicesToUpdate[0],
                  step: "wifiSetup",
                });
              } else {
                setGroupCancelledPrompt(true);
              }
              setIsDialogOpen(false);
            } else {
              const message = `${context.devices.get(devicesToUpdate[0])?.name
                } has a different location stored. Would you like to update it to your current location?`;

              setIsDialogOpen(true);
              const { value } = await Prompt.confirm({
                title: "Update Location",
                message,
              });

              if (value) {
                await context.setDeviceToCurrLocation(devicesToUpdate[0]);
                setSearchParams({
                  ...searchParams,
                  deviceSettings: devicesToUpdate[0],
                  tab: "Location",
                });
              } else {
                setPromptCancel(true);
              }
              setIsDialogOpen(false);
            }
          }
        } else {
          const message = `${devicesToUpdate
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
            setSearchParams({
              ...searchParams,
              deviceSettings: devicesToUpdate[0],
              tab: "Location",
            });
          } else {
            setPromptCancel(true);
          }
        }
      }
    )
  );

  const findDevice = () => {
    log.logEvent("Find Device");
    setSearchParams({
      ...searchParams,
      step: "chooseDevice",
    });
  };

  // DEV only: add a fake device for testing
  function createFakeDevice() {
    const id = `fake-${Math.random().toString(36).substr(2, 5)}`;
    const device = {
      id,
      host: "fakeHost",
      endpoint: id,
      name: "Fake Device",
      group: "new",
      isConnected: true,
      isProd: false,
      locationSet: false,
      url: "",
      type: "tc2" as const,
      hasAudioCapabilities: true,
      timeFound: new Date(),
    };
    context.devices.set(id, device);
    context.deviceRecordings.set(id, []);
    context.deviceEventKeys.set(id, []);
  }

  const [promptedPermission, setPromptedPermission] = createSignal(false);
  const [permission, { refetch }] = createResource(async () => {
    try {
      if (Capacitor.getPlatform() === "android") return true;
      const res = await DevicePlugin.checkPermissions();
      console.log("PERMISSIONS", res.granted);
      if (!res.granted && !promptedPermission()) {
        try {
          const promptRes = await Prompt.confirm({
            title: "Network Permssions",
            message:
              "You don't have local network permissions for sidekick which is essential for app functionality. Would you like open settings to change the permission?",
          });
          if (promptRes.value) {
            NativeSettings.open({
              optionAndroid: AndroidSettings.ApplicationDetails,
              optionIOS: IOSSettings.App,
            });
          }
        } catch (e) {
          console.error("Permssions Error", e);
        }
        setPromptedPermission(true);
      }
      return res.granted;
    } catch (error) {
      console.error("Permissions Error:", error);
      return null;
    }
  });

  onMount(() => {
    App.addListener("appStateChange", () => {
      refetch();
    });
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
              url={device.isConnected ? device.url : ""}
              isProd={device.isProd}
              isConnected={device.isConnected}
              groupName={device.group}
              batteryPercentage={device.batteryPercentage}
            />
          )}
        </For>
        <div class="h-32" />
        <Portal>
          <div class="pb-bar fixed inset-x-0 bottom-2 z-20 mx-auto flex justify-center">
            <button
              class="flex rounded-md bg-white px-4 py-4"
              onClick={findDevice}
            >
              <div class="text-blue-500 pr-1">
                <ImSearch size={28} />
              </div>
              <p>Find Device</p>
            </button>
            <Show when={userContext.dev()}>
              <button
                class="ml-2 flex rounded-md bg-white px-4 py-4"
                onClick={createFakeDevice}
              >
                <div class="text-blue-500">
                  <ImSearch size={28} />
                </div>
                <p>Test Device</p>
              </button>
            </Show>
          </div>
        </Portal>
        <Portal>
          <>
            <SetupWizard />
            <DeviceSettingsModal />
          </>
        </Portal>
      </section>
      <div class="pt-bar fixed inset-0 z-0 flex flex-col pb-32">
        <div class="my-auto">
          <BackgroundLogo />
          <div class="flex h-32 w-full justify-center">
            <Show when={context.devices.size <= 0}>
              <p class="mt-4 max-w-sm px-4 text-center text-sm text-neutral-600">
                No devices detected.
                <Show when={permission() === false}>
                  <br />
                  <p class="text-md font-medium text-neutral-800">
                    Cannot access local network. Please check "Local Network"
                    permission is enabled.
                  </p>
                  <button
                    class={"text-blue-600"}
                    onClick={() => {
                      NativeSettings.open({
                        optionAndroid: AndroidSettings.ApplicationDetails,
                        optionIOS: IOSSettings.App,
                      });
                    }}
                  >
                    Open Permission Settings
                  </button>
                </Show>
                <br />
                Follow the instructions in "Find Device" below. You can connect
                to a device using the top right
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
