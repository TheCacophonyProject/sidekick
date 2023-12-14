import { KeepAwake } from "@capacitor-community/keep-awake";
import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { createContextProvider } from "@solid-primitives/context";
import { createSignal } from "solid-js";
import { openConnection } from "../../database";
import { useEventStorage } from "./event";
import { useLocationStorage } from "./location";
import { useRecordingStorage } from "./recording";

const DatabaseName = "Cacophony";

const driver = new SQLiteConnection(CapacitorSQLite);
export const db = await openConnection(
  driver,
  DatabaseName,
  false,
  "no-encryption",
  2
);

const [StorageProvider, useStorage] = createContextProvider(() => {
  const [isUploading, setIsUploading] = createSignal(false);
  const recording = useRecordingStorage();
  const location = useLocationStorage();
  const event = useEventStorage();
  const uploadItems = async () => {
    if (isUploading()) return;
    setIsUploading(true);
    if (await KeepAwake.isSupported()) {
      await KeepAwake.keepAwake();
    }
    await event.uploadEvents();
    await recording.uploadRecordings();
    await location.resyncLocations();
    if (await KeepAwake.isSupported()) {
      await KeepAwake.allowSleep();
    }
    setIsUploading(false);
  };

  const stopUploading = () => {
    recording.stopUploading();
    event.stopUploading();
  };

  const hasItemsToUpload = () => {
    return (
      recording.hasItemsToUpload() ||
      event.hasItemsToUpload() ||
      location.hasItemsToUpload()
    );
  };

  return {
    ...recording,
    ...location,
    ...event,
    uploadItems,
    stopUploading,
    isUploading,
    hasItemsToUpload,
  };
});
const definiteUseStorage = () => useStorage()!;
export { StorageProvider, definiteUseStorage as useStorage };
