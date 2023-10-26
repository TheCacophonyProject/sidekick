import { useNavigate, useParams } from "@solidjs/router";
import { Show, onMount } from "solid-js";
import { headerMap } from "~/components/Header";
import { useDevice } from "~/contexts/Device";
import { App } from "@capacitor/app";
function DeviceSettings() {
  const params = useParams();
  const context = useDevice();
  const nav = useNavigate();
  const device = () => {
    const device = context.devices.get(params.id);
    if (!device || !device.isConnected) {
      nav("/devices");
      return;
    }
    return device;
  };
  onMount(() => {
    headerMap.set("/devices/" + params.id, ["Device Settings"]);
    App.addListener("appStateChange", async (state) => {
      const currDevice = device();
      if (state.isActive && currDevice && currDevice.isConnected) {
        // App has been brought back to the foreground
        const isConnected = await context.isDeviceConnected(currDevice);
        if (!isConnected) {
          nav("/devices");
        }
      }
    });
  });
  return (
    <>
      <section class="pb-bar pt-bar relative h-full">
        <Show when={device()}>
          {(dev) => (
            <iframe class="h-full w-full max-w-[100vw]" src={dev().url} />
          )}
        </Show>
      </section>
    </>
  );
}

export default DeviceSettings;
