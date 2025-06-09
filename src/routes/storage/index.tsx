import { BsCameraVideoFill } from "solid-icons/bs";
import { ImLocation, ImNotification } from "solid-icons/im";
import { RiArrowsArrowRightSLine } from "solid-icons/ri";
import { Match, Show, Switch, onMount } from "solid-js";
import { A } from "@solidjs/router";
import ActionContainer from "~/components/ActionContainer";
import CircleButton from "~/components/CircleButton";
import { useHeaderContext } from "~/components/Header";
import { useStorage } from "~/contexts/Storage";
import { FaRegularTrashCan, FaSolidStop } from "solid-icons/fa";
import { Dialog } from "@capacitor/dialog";
import { useUserContext } from "~/contexts/User";
import { FiPause, FiUploadCloud } from "solid-icons/fi";
import { useDevice } from "~/contexts/Device";

export default function Storage() {
  const storage = useStorage();
  const user = useUserContext();
  const device = useDevice();

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
    await storage.deleteUnuploadedPhotos();
  };
  const headerContext = useHeaderContext();

  onMount(() => {
    // Add delete button to header
    const header = headerContext?.headerMap.get("/storage");
    if (!header) return;

    headerContext?.headerMap.set("/storage", [
      header[0],
      () => (
        <button
          type="button"
          onClick={deleteSaved}
          class="flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-white shadow-md transition-all hover:bg-red-600 hover:shadow-lg active:scale-95"
          aria-label="Delete all saved items"
        >
          <FaRegularTrashCan size={20} />
          <span class="hidden font-medium sm:inline">Clear Saved</span>
          <span class="font-medium sm:hidden">Clear</span>
        </button>
      ),
    ]);
  });

  const toggleUpload = async () => {
    if (!storage.hasItemsToUpload()) return;
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
        <Show when={user.dev()}>
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
      </Show>
      <ActionContainer icon={ImLocation} header="Locations & Reference Image">
        <p class="flex items-center text-gray-800">
          <span class="w-32">
            Needs to Sync:{" "}
            {(storage
              .savedLocations()
              ?.filter((loc) => loc.isProd && loc.updateName).length ?? 0) +
              (storage
                .deviceImages()
                ?.filter(
                  (image) =>
                    image.serverStatus === "pending-upload" ||
                    image.serverStatus === "pending-deletion"
                ).length ?? 0)}{" "}
          </span>
        </p>
      </ActionContainer>
      <Show when={!user.isProd()}>
        <ActionContainer icon={ImLocation} header="Test Locations">
          <p class="flex items-center text-gray-800">
            <span class="w-32">
              Needs to Sync:{" "}
              {storage.savedLocations()?.filter((loc) => loc.updateName)
                .length ?? 0}{" "}
            </span>
          </p>
        </ActionContainer>
      </Show>

      <div class="pb-bar fixed inset-x-0 bottom-2 mx-auto flex justify-center">
        <button
          class="flex items-center justify-center space-x-2 rounded-md bg-white px-4 py-4 disabled:text-gray-400"
          onClick={toggleUpload}
          disabled={!storage.hasItemsToUpload() || device.apState() === "connected"}
        >
          <Switch>
            <Match when={!storage.isUploading()}>
              <div
                class="text-blue-500"
              >
                <FiUploadCloud size={28} />
              </div>
              <p>Upload</p>
            </Match>
            <Match when={storage.isUploading()}>
              <div class="text-red-500">
                <FaSolidStop size={28} />
              </div>
              <p>Pause Upload</p>
            </Match>
          </Switch>
        </button>
      </div>
    </section>
  );
}
