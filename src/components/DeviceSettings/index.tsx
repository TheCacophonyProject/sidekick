import { useSearchParams } from "@solidjs/router";
import { BsCameraVideoFill } from "solid-icons/bs";
import {
    FaSolidStop,
} from "solid-icons/fa";
import { FiDownload } from "solid-icons/fi";
import { ImCross } from "solid-icons/im";
import { TbPlugConnectedX } from "solid-icons/tb";
import {
    For,
    Match,
    Show,
    Switch,
    createEffect,
    createMemo,
    createSignal,
} from "solid-js";
import { useDevice } from "~/contexts/Device";
import { useStorage } from "~/contexts/Storage";
import { AudioSettingsTab } from "./AudioSettingsTab";
import { CameraSettingsTab } from "./CameraSettingsTab";
import { LocationSettingsTab } from "./LocationSettingsTab";
import { WifiSettingsTab } from "./WifiSettingsTab";
import { GeneralSettingsTab } from "./GeneralSettingsTab";

export { AudioSettingsTab } from "./AudioSettingsTab";
export { CameraSettingsTab } from "./CameraSettingsTab";
export { LocationSettingsTab } from "./LocationSettingsTab";
export { WifiSettingsTab } from "./WifiSettingsTab";
export { GeneralSettingsTab, GroupSelect } from "./GeneralSettingsTab";

export default function DeviceSettingsModal() {
    const context = useDevice();
    const storage = useStorage();
    const [params, setParams] = useSearchParams();
    const currTab = () => params.tab ?? "Camera";
    const device = () => context.devices.get(params.deviceSettings);
    const navItems = () => {
        const items = ["Camera", "General", "Network", "Location"] as const;
        console.log("Current test Device", device());
        if (device()?.hasAudioCapabilities) {
            return [...items, "Audio"] as const;
        }
        return items;
    };

    // Prevent rapid tab switching by debouncing the tab change
    const [isTabSwitching, setIsTabSwitching] = createSignal(false);

    const setCurrNav = (nav: ReturnType<typeof navItems>[number]) => {
        if (isTabSwitching()) return;

        setIsTabSwitching(true);
        console.log("Setting Nav Params", nav);
        setParams({ tab: nav, deviceSettings: params.deviceSettings });

        // Reset the switching state after a small delay
        setTimeout(() => setIsTabSwitching(false), 300);
    };

    const textSizeClass = createMemo(() => {
        const numItems = navItems().length;
        if (numItems <= 4) {
            return "text-base";
        }
        if (numItems === 5) {
            return "text-sm";
        }
        if (numItems >= 6) {
            return "text-xs";
        }
    });

    const isConnected = () =>
        context.devices.get(params.deviceSettings)?.isConnected;

    const deviceName = () => {
        const device = context.devices.get(params.deviceSettings);
        const deviceName = device?.name ?? device?.id;
        return deviceName;
    };

    const show = () => !params.step && params.deviceSettings;

    const clearParams = () => {
        console.log("Clearing Params");
        setParams({ deviceSettings: null, tab: null });
    };

    const savedRecs = createMemo(() =>
        storage
            .savedRecordings()
            .filter((rec) => rec.device === params.deviceSettings && !rec.isUploaded),
    );
    const deviceRecs = createMemo(
        () => context.deviceRecordings.get(params.deviceSettings) ?? [],
    );

    const disabledDownload = createMemo(() => {
        const hasRecsToDownload =
            deviceRecs().length > 0 && deviceRecs().length !== savedRecs().length;
        return !hasRecsToDownload;
    });

    createEffect(() => {
        if (!context.devices.has(params.deviceSettings)) {
            console.log("Device not found, clearing params");
            clearParams();
        }
    });

    createEffect(() => {
        // path
        console.log(
            "Location Settings Tab",
            params.step,
            params.deviceSettings,
            show(),
        );
    });
    return (
        <Show when={show()}>
            {(id) => {
                return (
                    <div class="fixed left-1/2 top-[70px] z-40 h-auto w-11/12 -translate-x-1/2 transform rounded-xl border bg-white shadow-lg ">
                        <header class="flex justify-between px-4">
                            <div class="flex items-center py-4">
                                <Show
                                    when={!isConnected()}
                                    fallback={<BsCameraVideoFill size={32} />}
                                >
                                    <TbPlugConnectedX size={32} />
                                </Show>
                                <div class="flex flex-col">
                                    <h1 class="pl-2 text-sm md:text-lg font-medium text-slate-600">
                                        {deviceName()}
                                    </h1>
                                    <p class="pl-2 text-sm text-slate-700">
                                        Recordings: {savedRecs().length}/{deviceRecs().length}
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center space-x-2">
                                <Show
                                    when={!context.devicesDownloading.has(id())}
                                    fallback={
                                        <button
                                            class="p-2 text-red-500"
                                            onClick={() => context.stopSaveItems(id())}
                                        >
                                            <FaSolidStop size={28} />
                                        </button>
                                    }
                                >
                                    <button
                                        class={`${disabledDownload() ? "text-slate-300" : "text-blue-500"
                                            } p-2`}
                                        disabled={disabledDownload()}
                                        onClick={() => context.saveItems(id())}
                                    >
                                        <FiDownload size={28} />
                                    </button>
                                </Show>
                                <button onClick={() => clearParams()} class="text-gray-500">
                                    <ImCross size={12} />
                                </button>
                            </div>
                        </header>
                        <nav class={`flex w-full justify-between ${textSizeClass()}`}>
                            <For each={navItems()}>
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
                        <div class="max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                            <Switch>
                                <Match when={currTab() === "General"}>
                                    <GeneralSettingsTab deviceId={id()} />
                                </Match>
                                <Match when={currTab() === "Network"}>
                                    <WifiSettingsTab deviceId={id()} />
                                </Match>
                                <Match when={currTab() === "Location"}>
                                    <LocationSettingsTab deviceId={id()} />
                                </Match>
                                <Match when={currTab() === "Camera"}>
                                    <CameraSettingsTab deviceId={id()} />
                                </Match>
                                <Match
                                    when={currTab() === "Audio" && device()?.hasAudioCapabilities}
                                >
                                    <AudioSettingsTab deviceId={id()} />
                                </Match>
                            </Switch>
                        </div>
                    </div>
                );
            }}
        </Show>
    );
}