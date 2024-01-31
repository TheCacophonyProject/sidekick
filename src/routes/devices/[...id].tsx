import { useLocation, useNavigate, useParams } from "@solidjs/router";
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
  const location = useLocation();
  const childPath = () => {
    const path = location.pathname.split("/");
    const id = path.filter((p) => !isNaN(parseInt(p)) && p.length > 0)[0];

    const childPath = path.slice(path.indexOf(id) + 1)[0];
    return [parseInt(id), childPath] as const;
  };
  const url = () =>
    (childPath()[1] ? device()?.url + "/" + childPath()[1] : device()?.url) ??
    "/devices";
  onMount(() => {
    headerMap.set(location.pathname, [
      "Device Settings",
      undefined,
      `/devices?deviceSettings=${childPath()[0]}`,
    ]);
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
          {(dev) => {
            return <iframe class="h-full w-full max-w-[100vw]" src={url()} />;
          }}
        </Show>
      </section>
    </>
  );
}

export default DeviceSettings;
