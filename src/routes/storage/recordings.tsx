import { Browser } from "@capacitor/browser";
import { BsCameraVideoFill } from "solid-icons/bs";
import { FaSolidAngleDown } from "solid-icons/fa";
import { RiArrowsArrowRightSLine } from "solid-icons/ri";
import { For, Show, createMemo, createSignal, mergeProps } from "solid-js";
import ActionContainer from "~/components/ActionContainer";
import { useStorage } from "~/contexts/Storage";
import { UploadedRecording } from "~/database/Entities/Recording";
interface DeviceRecordingsProps {
  deviceId: string;
  recordings: UploadedRecording[];
  initialOpen?: boolean;
}

function DeviceRecordingsDisplay(props: DeviceRecordingsProps) {
  const merged = mergeProps({ open: false }, props);
  const [toggle, setToggle] = createSignal(merged.initialOpen);
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
        onClick={(e) => setToggle(!toggle())}
      >
        <h1 class="text-2xl font-bold ">{props.deviceId}</h1>
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
                    openRecording(recording.uploadId, recording.isProd)
                  }
                >
                  <RiArrowsArrowRightSLine size={32} />
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
  const Devices = createMemo(() => {
    const devices = new Set<string>(
      storage.uploadedRecordings().map((rec) => rec.deviceName)
    );
    return [...devices];
  });

  return (
    <section class="pb-bar pt-bar relative h-full space-y-2 overflow-y-auto bg-gray-200 px-2">
      <For each={Devices()}>
        {(device) => (
          <DeviceRecordingsDisplay
            deviceId={device}
            recordings={storage
              .uploadedRecordings()
              .filter((rec) => rec.deviceName === device)}
            {...(Devices().length === 1 && { initialOpen: true })}
          />
        )}
      </For>
    </section>
  );
}

export default Recordings;
