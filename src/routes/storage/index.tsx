import { BsCameraVideoFill } from "solid-icons/bs";
import { ImLocation, ImNotification } from "solid-icons/im";
import { RiArrowsArrowRightSLine } from "solid-icons/ri";
import { Show, onMount } from "solid-js";
import { A } from "@solidjs/router";
import ActionContainer from "~/components/ActionContainer";
import CircleButton from "~/components/CircleButton";
import { headerMap } from "~/components/Header";
import { useStorage } from "~/contexts/Storage";
import { FaRegularTrashCan, FaSolidStop } from "solid-icons/fa";
import { Dialog } from "@capacitor/dialog";
import { useUserContext } from "~/contexts/User";
import { FiUploadCloud } from "solid-icons/fi";

export default function Storage() {
  const storage = useStorage();
  const user = useUserContext();

  const deleteSaved = async () => {
    const { value } = await Dialog.confirm({
      title: "Delete Saved",
      message:
        "Are you sure you want to delete all saved items? Note: Uploaded items will not be deleted, until the device is notified",
    });
    if (!value) return;
    await storage.deleteRecordings();
    await storage.deleteEvents({ uploaded: false });
    await storage.deleteSyncLocations();
  };

  onMount(() => {
    // Add delete button to header
    const header = headerMap.get("/storage");
    if (!header) return;

    headerMap.set("/storage", [
      header[0],
      () => (
        <button type="button" onClick={deleteSaved} class="text-red-400">
          <FaRegularTrashCan size={28} />
        </button>
      ),
    ]);
  });

  const toggleUpload = async () => {
    if (storage.isUploading()) {
      storage.stopUploading();
      return;
    }
    if (!user.data()) {
      const { value } = await Dialog.confirm({
        title: "Login",
        message: "You are not currently logged in.\n Would you like to login?",
      });
      if (!value) return;
      await user.logout();
      return;
    }

    await storage.uploadItems();
  };

  const isProd = (rec: { isProd: boolean }) => rec.isProd;
  const isTest = (rec: { isProd: boolean }) => !rec.isProd;

  return (
    <section class="pb-bar pt-bar relative h-full space-y-2 overflow-y-auto bg-gray-200 px-2">
      <ActionContainer
        icon={BsCameraVideoFill}
        header="Recordings"
        action={
          <A href="recordings" class="text-blue-500">
            <RiArrowsArrowRightSLine size={32} />
          </A>
        }
      >
        <A href="recordings" class="flex items-center text-gray-800">
          <span class="w-28">
            Saved: {storage.unuploadedRecordings().filter(isProd).length}{" "}
          </span>
          <span class="ml-2">
            Uploaded: {storage.uploadedRecordings().filter(isProd).length}
          </span>
        </A>
      </ActionContainer>
      <ActionContainer icon={ImNotification} header="Events">
        <p class="flex items-center text-gray-800">
          <span class="w-28">
            Saved: {storage.unuploadedEvents().filter(isProd).length}{" "}
          </span>
          <span class="ml-2">
            Uploaded: {storage.uploadedEvents().filter(isProd).length}
          </span>
        </p>
      </ActionContainer>
      <Show when={!user.isProd()}>
        <ActionContainer
          icon={BsCameraVideoFill}
          header="Test Recordings"
          action={
            <A href="recordings" class="text-blue-500">
              <RiArrowsArrowRightSLine size={32} />
            </A>
          }
        >
          <A href="recordings" class="flex items-center text-gray-800">
            <span class="w-28">
              Saved: {storage.unuploadedRecordings().filter(isTest).length}{" "}
            </span>
            <span class="ml-2">
              Uploaded: {storage.uploadedRecordings().filter(isTest).length}
            </span>
          </A>
        </ActionContainer>
        <ActionContainer icon={ImNotification} header="Test Events">
          <p class="flex items-center text-gray-800">
            <span class="w-28">
              Saved: {storage.unuploadedEvents().filter(isTest).length}{" "}
            </span>
            <span class="ml-2">
              Uploaded: {storage.uploadedEvents().filter(isTest).length}
            </span>
          </p>
        </ActionContainer>
      </Show>
      <ActionContainer icon={ImLocation} header="Locations">
        <p class="flex items-center text-gray-800">
          <span class="w-32">
            Needs to Sync:{" "}
            {storage
              .savedLocations()
              ?.filter(
                (loc) =>
                  loc.isProd &&
                  (loc.deletePhotos?.length ||
                    loc.updateName ||
                    loc.uploadPhotos?.length)
              ).length ?? 0}{" "}
          </span>
        </p>
      </ActionContainer>
      <ActionContainer icon={ImLocation} header="Test Locations">
        <p class="flex items-center text-gray-800">
          <span class="w-32">
            Needs to Sync:{" "}
            {storage
              .savedLocations()
              ?.filter(
                (loc) =>
                  loc.deletePhotos?.length ||
                  loc.updateName ||
                  loc.uploadPhotos?.length
              ).length ?? 0}{" "}
          </span>
        </p>
      </ActionContainer>

      <div class="pb-bar fixed inset-x-0 bottom-2 mx-auto flex justify-center">
        <CircleButton
          text={
            user.isProd() ? "Upload to Cacophony" : "Upload to Cacophony Test"
          }
          loadingText="Uploading..."
          onClick={toggleUpload}
          disabled={false}
          loading={storage.isUploading()}
          loadingIcon={
            <div class="text-red-500">
              <FaSolidStop size={36} />
            </div>
          }
        >
          <div class="text-blue-500">
            <FiUploadCloud size={36} />
          </div>
        </CircleButton>
      </div>
    </section>
  );
}
