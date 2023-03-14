import { Browser } from "@capacitor/browser";
import {
  BsCameraVideoFill,
  BsCaretDown,
  BsCaretDownFill,
} from "solid-icons/bs";
import { RiSystemArrowRightSLine } from "solid-icons/ri";
import { FaSolidAngleDown } from "solid-icons/fa";
import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import ActionContainer from "~/components/ActionContainer";
import { useDevice } from "~/contexts/Device";
import { Recording, useStorage } from "~/contexts/Storage";
import { useUserContext } from "~/contexts/User";
interface DeviceRecordingsProps {
  deviceId: string;
  recordings: Recording[];
}

function DeviceRecordingsDisplay(props: DeviceRecordingsProps) {
  const device = useDevice();
  const [toggle, setToggle] = createSignal(false);
  const openRecording = (id: string, isProd: boolean) => {
    Browser.open({
      url: `https://browse${
        isProd ? "" : "-test"
      }.cacophony.org.nz/recording/${id}`,
    });
  };
  return (
    <div class="mt-2 rounded-lg bg-slate-50 px-2">
      <div
        class="flex items-center  justify-between px-4 py-4 text-slate-800"
        onClick={() => setToggle(!toggle())}
      >
        <h1 class="text-2xl font-bold ">
          {device.devices.get(props.deviceId)?.name}
        </h1>
        <FaSolidAngleDown
          size={24}
          class={`${toggle() ? "rotate-180 transform" : ""}`}
        />
      </div>
      <Show when={toggle()}>
        <For each={props.recordings}>
          {(recording) => (
            <ActionContainer
              icon={BsCameraVideoFill}
              action={
                <button
                  class="text-blue-500"
                  onClick={() =>
                    openRecording(recording.uploadId!, recording.isProd)
                  }
                >
                  <RiSystemArrowRightSLine size={32} />
                </button>
              }
            >
              {recording.uploadId}
            </ActionContainer>
          )}
        </For>
      </Show>
    </div>
  );
}

function Recordings() {
  const storage = useStorage();
  const DeviceRecordings = createMemo(() => {
    // Group recordings by device as [[device, [recording, recording, recording],[device, [recording, recording, recording]]]
    const recordings = storage.UploadedRecordings();
    const devices = new Map<string, Recording[]>();
    recordings.forEach((recording) => {
      const device = recording.device;
      if (!devices.has(device)) {
        devices.set(device, []);
      }
      devices.get(device)!.push(recording);
    });
    return devices;
  });

  return (
    <section class="pb-bar pt-bar relative h-full space-y-2 overflow-y-auto bg-gray-200 px-2">
      <For each={[...DeviceRecordings().entries()]}>
        {([deviceId, recordings]) => (
          <DeviceRecordingsDisplay
            deviceId={deviceId}
            recordings={recordings}
          />
        )}
      </For>
    </section>
  );
}

export default Recordings;
