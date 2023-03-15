import { BsCameraVideoFill } from "solid-icons/bs";
import { ImNotification } from "solid-icons/im";
import { RiSystemArrowRightSLine } from "solid-icons/ri";
import { Show, createEffect, createSignal, onMount } from "solid-js";
import { A } from "solid-start";
import ActionContainer from "~/components/ActionContainer";
import CircleButton from "~/components/CircleButton";
import { headerMap } from "~/components/Header";
import { Recording, useStorage } from "~/contexts/Storage";
import { FaRegularTrashCan } from "solid-icons/fa";
import { Dialog } from "@capacitor/dialog";
import { useUserContext } from "~/contexts/User";

interface StorageProps {
  // add props here
}

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
    if (!user.data()) {
      const { value } = await Dialog.confirm({
        title: "Login",
        message: "You are not currently logged in.\n Would you like to login?",
      });
      if (!value) return;
      await user.logout();
      return;
    }
    await user.validateCurrToken();
    if (!user.isAuthorized()) return;

    await storage.uploadItems();
  };
  const isProd = (rec: { isProd: boolean }) => rec.isProd;
  const isSame = (rec: { isProd: boolean }) => rec.isProd === user.isProd();
  const isDev = (rec: { isProd: boolean }) => !rec.isProd;
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
            Saved: {storage.UnuploadedRecordings().filter(isProd).length}{" "}
          </span>
          <span class="ml-2">
            Uploaded: {storage.UploadedRecordings().filter(isProd).length}
          </span>
        </A>
      </ActionContainer>
      <ActionContainer icon={ImNotification} header="Events">
        <p class="flex items-center text-gray-800">
          <span class="w-24">
            Saved: {storage.UnuploadedEvents().filter(isProd).length}{" "}
          </span>
          <span class="ml-2">
            Uploaded: {storage.UploadedEvents().filter(isProd).length}
          </span>
        </p>
      </ActionContainer>
      <Show when={!user.isProd()}>
        <ActionContainer
          icon={BsCameraVideoFill}
          header="Test Recordings"
          action={
            <A href="recordings" class="text-blue-500">
              <RiSystemArrowRightSLine size={32} />
            </A>
          }
        >
          <A href="recordings" class="flex items-center text-gray-800">
            <span class="w-24">
              Saved: {storage.UnuploadedRecordings().filter(isDev).length}{" "}
            </span>
            <span class="ml-2">
              Uploaded: {storage.UploadedRecordings().filter(isDev).length}
            </span>
          </A>
        </ActionContainer>
        <ActionContainer icon={ImNotification} header="Test Events">
          <p class="flex items-center text-gray-800">
            <span class="w-24">
              Saved: {storage.UnuploadedEvents().filter(isDev).length}{" "}
            </span>
            <span class="ml-2">
              Uploaded: {storage.UploadedEvents().filter(isDev).length}
            </span>
          </p>
        </ActionContainer>
      </Show>

      <div class="pb-bar fixed inset-x-0 bottom-[4vh] mx-auto flex justify-center">
        <CircleButton
          text={
            user.isProd() ? "Upload to Cacophony" : "Upload to Cacophony Test"
          }
          loadingText="Uploading..."
          onClick={upload}
          disabled={
            storage.isUploading() ||
            (storage.UnuploadedRecordings().filter(isSame).length === 0 &&
              storage.UnuploadedEvents().filter(isSame).length === 0)
          }
          loading={storage.isUploading()}
        />
      </div>
    </section>
  );
}
