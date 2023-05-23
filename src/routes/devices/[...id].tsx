import { useParams } from "@solidjs/router";
import { Show, onMount } from "solid-js";
import { headerMap } from "~/components/Header";
import { useDevice } from "~/contexts/Device";
function DeviceSettings() {
  const params = useParams();
  const context = useDevice();
  const device = () => {
    const device = context.devices.get(params.id);
    if (!device || !device.isConnected) return;
    return device;
  };
  onMount(() => {
    headerMap.set("/devices/" + params.id, ["Device Settings"]);
  });
  return (
    <>
      <section class="pb-bar pt-bar relative h-full">
        <Show when={device()}>
          {(dev) => <iframe class="h-full w-full" src={dev().url} />}
        </Show>
      </section>
    </>
  );
}

export default DeviceSettings;
