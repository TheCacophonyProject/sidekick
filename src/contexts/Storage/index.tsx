import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { createSignal } from "solid-js";
import { createContextProvider } from "@solid-primitives/context";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { openConnection } from "../../database";
import { useRecordingStorage } from "./recording";
import { useLocationStorage } from "./location";
import { useEventStorage } from "./event";

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
    await Promise.all([recording.uploadRecordings(), event.uploadEvents()]);
    if (await KeepAwake.isSupported()) {
      await KeepAwake.allowSleep();
    }
    setIsUploading(false);
  };

  return {
    ...recording,
    ...location,
    ...event,
    uploadItems,
    isUploading,
  };
});
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const definiteUseStorage = () => useStorage()!;
export { StorageProvider, definiteUseStorage as useStorage };
