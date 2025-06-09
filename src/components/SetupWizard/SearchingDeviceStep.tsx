import { createSignal, createEffect, onMount, onCleanup, Show, For } from "solid-js";
import { Motion } from "solid-motionone";
import { BsCameraVideoFill } from "solid-icons/bs";
import { RiArrowsArrowRightSLine } from "solid-icons/ri";
import type { Device } from "~/contexts/Device";

interface SearchingDeviceStepProps {
  Title: (props: { title: string; back?: any }) => any;
  devices: () => Device[];
  openDevice: (device: Device) => void;
  Additional: () => any;
}

export const SearchingDeviceStep = (props: SearchingDeviceStepProps) => {
  const [scanTime, setScanTime] = createSignal(0);
  const [showHelp, setShowHelp] = createSignal(false);

  const connectedDevices = () => props.devices().filter((device) => device.isConnected);
  const [highlightNew, setHighlightNew] = createSignal(true);

  // Flash animation for new devices
  createEffect(() => {
    if (connectedDevices().length > 0) {
      setHighlightNew(true);
      const timeout = setTimeout(() => setHighlightNew(false), 3000);
      return () => clearTimeout(timeout);
    }
  });

  // Auto-show help after 10 seconds if no devices found
  createEffect(() => {
    if (scanTime() > 10 && connectedDevices().length === 0) {
      setShowHelp(true);
    }
  });

  onMount(() => {
    const interval = setInterval(() => setScanTime((prev) => prev + 1), 1000);
    onCleanup(() => clearInterval(interval));
  });

  const FoundDevices = () => (
    <div class="space-y-1 rounded-lg bg-gray-200 p-1">
      <Show
        when={connectedDevices().length > 0}
        fallback={
          <div class="flex flex-col items-center py-8 text-gray-500">
            <div class="mb-2">
              <BsCameraVideoFill size={32} class="opacity-20" />
            </div>
            <p class="text-sm font-medium">No devices found yet</p>
            <p class="text-xs">Devices will appear here automatically</p>
          </div>
        }
      >
        <For each={connectedDevices()}>
          {(device, index) => (
            <Motion.button
              onClick={() => props.openDevice(device)}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index() * 0.1 }}
              class={`flex w-full items-center justify-between rounded-md border-2 bg-white p-3 transition-all sm:p-4 ${
                highlightNew() && device.group === "new"
                  ? "animate-pulse border-green-500 shadow-lg"
                  : "border-blue-400"
              }`}
            >
              <div class="flex items-center gap-x-3">
                <div
                  class={`${
                    highlightNew() && device.group === "new" ? "text-green-500" : "text-blue-400"
                  }`}
                >
                  <BsCameraVideoFill size={24} />
                </div>
                <div class="text-left">
                  <p class="font-semibold text-gray-800">{device.name}</p>
                  <Show when={device.group === "new"}>
                    <p class="text-xs text-green-600">New device - tap to setup!</p>
                  </Show>
                </div>
              </div>
              <Show
                when={device.group === "new"}
                fallback={
                  <div class="text-blue-400">
                    <RiArrowsArrowRightSLine size={24} class="sm:h-7 sm:w-7" />
                  </div>
                }
              >
                <div class="flex items-center gap-x-1 rounded-full bg-green-500 px-3 py-1 text-white">
                  <span class="text-xs font-medium sm:text-sm">Setup</span>
                  <RiArrowsArrowRightSLine size={20} />
                </div>
              </Show>
            </Motion.button>
          )}
        </For>
      </Show>
    </div>
  );

  return (
    <>
      <props.Title title="Searching For Device" />

      {/* Active scanning indicator */}
      <div class="mb-3 flex justify-center">
        <div class="flex items-center space-x-2 rounded-full bg-blue-50 px-4 py-2">
          <div class="flex space-x-1">
            <div
              class="h-2 w-2 animate-bounce rounded-full bg-blue-500"
              style="animation-delay: 0ms"
            />
            <div
              class="h-2 w-2 animate-bounce rounded-full bg-blue-500"
              style="animation-delay: 150ms"
            />
            <div
              class="h-2 w-2 animate-bounce rounded-full bg-blue-500"
              style="animation-delay: 300ms"
            />
          </div>
          <span class="text-xs font-medium text-blue-700 sm:text-sm">Scanning network...</span>
        </div>
      </div>

      <FoundDevices />

      {/* Progressive help text */}
      <Show when={showHelp() || scanTime() > 5}>
        <Motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          class="mt-3 rounded-lg bg-amber-50 p-3"
        >
          <p class="mb-2 text-xs font-medium text-amber-900 sm:text-sm">Need help connecting?</p>
          <div class="space-y-2 text-xs text-amber-800 sm:text-sm">
            <div class="flex items-start">
              <span class="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold">
                1
              </span>
              <span>
                Connect to WiFi network: <strong>bushnet</strong>
              </span>
            </div>
            <div class="flex items-start">
              <span class="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold">
                2
              </span>
              <span>
                Password: <strong>feathers</strong>
              </span>
            </div>
            <div class="flex items-start">
              <span class="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold">
                3
              </span>
              <span>
                Device light should be <strong class="text-yellow-600">yellow</strong>
              </span>
            </div>
          </div>
        </Motion.div>
      </Show>

      <props.Additional />
    </>
  );
};