import { Browser } from "@capacitor/browser";
import { BsCameraVideoFill } from "solid-icons/bs";
import { RiSystemArrowRightSLine } from "solid-icons/ri";
import { For, onMount } from "solid-js";
import ActionContainer from "~/components/ActionContainer";
import { SavedRecordings } from "~/contexts/Storage";
import { useUserContext } from "~/contexts/User";

function Recordings() {
  const openRecording = (id: string, isProd: boolean) => {
    Browser.open({
      url: `https://browse${
        isProd ? "" : "-test"
      }.cacophony.org.nz/recording/${id}`,
    });
  };
  return (
    <section class="pb-bar pt-bar relative h-full space-y-2 overflow-y-auto bg-gray-200 px-2">
      <For
        each={SavedRecordings().filter(
          (val) => val.isUploaded && val.uploadId !== undefined
        )}
      >
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
    </section>
  );
}

export default Recordings;
