import { BsCameraVideoFill } from "solid-icons/bs";
import { ImNotification } from "solid-icons/im";
import { RiSystemArrowRightSLine } from "solid-icons/ri";
import { createEffect, createSignal, onMount } from "solid-js";
import { A } from "solid-start";
import ActionContainer from "~/components/ActionContainer";
import CircleButton from "~/components/CircleButton";
import { headerMap } from "~/components/Header";
import {
  Recording,
  useStorage,
  SavedRecordings,
  SavedEvents,
} from "~/contexts/Storage";
import { FaRegularTrashCan } from "solid-icons/fa";
import { Dialog } from "@capacitor/dialog";

interface StorageProps {
  // add props here
}

export default function Storage() {
  const storage = useStorage();
  const [uploading, setUploading] = createSignal(false);

  const deleteSaved = async () => {
    const { value } = await Dialog.confirm({
      title: "Delete Recordings",
      message:
        "Are you sure you want to delete all saved items? Note: Uploaded items will not be deleted, until the device is notified",
    });
    if (!value) return;
    await storage.deleteRecordings();
    await storage.deleteEvents({ uploaded: false });
  };

  onMount(() => {
    // Add delete button to header
    const header = headerMap.get("/storage");
    if (!header) return;

    headerMap.set("/storage", [
      header[0],
      <button onClick={deleteSaved} class="text-red-400">
        <FaRegularTrashCan size={32} />
      </button>,
    ]);
    console.log(headerMap.get("/storage"));
  });
  const upload = async () => {
    setUploading(true);
    try {
      await storage.uploadRecordings();
      await storage.uploadEvents();
      setUploading(false);
    } catch (e) {
      setUploading(false);
    }
  };
  return (
    <section class="pb-bar pt-bar relative h-full space-y-2 overflow-y-auto bg-gray-200 px-2">
      <ActionContainer
        icon={BsCameraVideoFill}
        header="Recordings"
        action={
          <A href="recordings" class="text-blue-500">
            <RiSystemArrowRightSLine size={32} />
          </A>
        }
      >
        <A href="recordings" class="flex items-center text-gray-800">
          <span class="w-24">
            Saved:{" "}
            {SavedRecordings().filter(({ isUploaded }) => !isUploaded).length}{" "}
          </span>
          <span class="ml-2">
            Uploaded:{" "}
            {SavedRecordings().filter(({ isUploaded }) => isUploaded).length}
          </span>
        </A>
      </ActionContainer>
      <ActionContainer icon={ImNotification} header="Events">
        <p class="flex items-center text-gray-800">
          <span class="w-24">
            Saved:{" "}
            {SavedEvents().filter(({ isUploaded }) => !isUploaded).length}{" "}
          </span>
          <span class="ml-2">
            Uploaded:{" "}
            {SavedEvents().filter(({ isUploaded }) => isUploaded).length}
          </span>
        </p>
      </ActionContainer>

      <div class="pb-bar fixed inset-x-0 bottom-[4vh] mx-auto flex justify-center">
        <CircleButton
          text="Upload to Cacophony"
          loadingText="Uploading..."
          onClick={upload}
          disabled={uploading()}
          loading={uploading()}
        />
      </div>
    </section>
  );
}
