import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { createMemo, createSignal, onMount } from "solid-js";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { DeviceDetails, DeviceId } from "./Device";
import { useUserContext } from "./User";
import { createContextProvider } from "@solid-primitives/context";
import { CacophonyPlugin } from "./CacophonyApi";
import { logError } from "./Notification";
import {
  createEventSchema,
  getEvents,
  insertEvent,
  deleteEvents as deleteEventsFromDb,
  deleteEvent as deleteEventFromDb,
  updateEvent,
} from "../database/Entities/Event";
import type { Event } from "../database/Entities/Event";
import {
  createRecordingSchema,
  getRecordings,
  deleteRecording as deleteRecordingFromDb,
  deleteRecordings as deleteRecordingsFromDb,
  updateRecording as updateRecordingInDb,
  insertRecording,
  UploadedRecording,
} from "../database/Entities/Recording";
import type { Recording } from "../database/Entities/Recording";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { openConnection } from "../database";

type RecordingFile = {
  filename: string;
  path: string;
  size: number;
  isProd: boolean;
};

const [StorageProvider, useStorage] = createContextProvider(() => {
  const userContext = useUserContext();
  const driver = new SQLiteConnection(CapacitorSQLite);
  const [db, setDb] = createSignal<SQLiteDBConnection>();
  const [SavedRecordings, setSavedRecordings] = createSignal<Recording[]>([]);
  const UploadedRecordings = createMemo(
    () =>
      SavedRecordings().filter((rec) => rec.isUploaded) as UploadedRecording[]
  );
  const UnuploadedRecordings = createMemo(() =>
    SavedRecordings().filter((rec) => !rec.isUploaded)
  );
  const [SavedEvents, setSavedEvents] = createSignal<Event[]>([]);
  const UploadedEvents = createMemo(() =>
    SavedEvents().filter((event) => event.isUploaded)
  );
  const UnuploadedEvents = createMemo(() =>
    SavedEvents().filter((event) => !event.isUploaded)
  );
  const [isUploading, setIsUploading] = createSignal(false);

  const DatabaseName = "Cacophony";
  onMount(async () => {
    try {
      const db = await openConnection(
        driver,
        DatabaseName,
        false,
        "no-encryption",
        2
      );
      await db.execute(createRecordingSchema);
      await db.execute(createEventSchema);

      setDb(db);
      const recs = await getSavedRecordings();
      const events = await getSavedEvents();
      setSavedRecordings(recs);
      setSavedEvents(events);
    } catch (e) {
      console.error(e);
    }
  });

  const findRecording = async (
    name: string
  ): Promise<Recording | undefined> => {
    const currdb = db();
    if (!currdb) return;
    const recordings = await getRecordings(currdb)({ name });
    const recording = recordings[0];
    return recording;
  };

  const saveRecording = async ({
    id,
    name,
    group,
    path,
    filename,
    size,
    isProd,
  }: DeviceDetails & RecordingFile) => {
    try {
      const currdb = db();
      if (!currdb) return;
      const existingRecording = await findRecording(filename);
      if (existingRecording) {
        return existingRecording;
      }
      const recording: Recording = {
        name: filename,
        path,
        groupName: group,
        device: id,
        deviceName: name,
        size: size.toString(),
        isProd,
        isUploaded: false,
      };

      const savedRecording = await insertRecording(currdb)(recording);
      setSavedRecordings((prev) => [...prev, recording]);
      return savedRecording;
    } catch (e) {
      if (e instanceof Error) {
        logError("Failed to save recording", e.message);
      }
    }
  };

  const getSavedRecordings = async (options?: {
    device?: string;
    uploaded?: boolean;
  }): Promise<Recording[]> => {
    const currdb = db();
    if (!currdb) return [];
    return getRecordings(currdb)(options);
  };

  const saveEvent = async (options: {
    key: number;
    type: string;
    details: string;
    timestamp: string;
    device: DeviceId;
    isProd: boolean;
  }) => {
    const currdb = db();
    if (!currdb) return;
    const { key, type, details, timestamp, device, isProd } = options;
    const detailString = JSON.stringify(details);
    console.log(detailString);
    const event: Event = {
      key: key.toString(),
      type,
      details: detailString,
      timestamp,
      device,
      isUploaded: false,
      isProd,
    };
    await insertEvent(currdb)(event);

    setSavedEvents((prev) => [
      ...prev.filter((val) =>
        val.key === key.toString() ? val.device !== device : true
      ),
      event,
    ]);
  };

  const getSavedEvents = async (options?: {
    device?: string;
    uploaded?: boolean;
  }) => {
    const currdb = db();
    if (!currdb) return [];
    const events = await getEvents(currdb)(options);
    return events;
  };

  const uploadEvents = async () => {
    const currdb = db();
    if (!currdb) return;
    const user = userContext.data();
    if (!user || !userContext.isAuthorized) return;
    const eventsByDevice = UnuploadedEvents().filter(
      (e) => e.isProd === userContext.isProd()
    ).reduce((acc, curr) => {
      if (!acc.has(curr.device)) {
        acc.set(curr.device, []);
      }
      acc.get(curr.device)?.push(curr);
      return acc;
    }, new Map<string, Event[]>());

    for (const [device, events] of eventsByDevice) {
      const deviceDetials = await CacophonyPlugin.getDeviceById({
        token: user.token,
        id: device,
      });
      if (!deviceDetials.success) {
        logError("Failed upload events for device", deviceDetials.message);
        continue;
      }
      for (const event of events) {
        const res = await CacophonyPlugin.uploadEvent({
          token: user.token,
          device: event.device,
          eventId: event.key,
          type: event.type,
          details: event.details,
          timeStamp: event.timestamp,
        });
        if (res.success) {
          event.isUploaded = true;
          await updateEvent(currdb)(event);
          setSavedEvents((prev) => {
            return [...prev.filter((e) => e.key !== event.key), event];
          });
        } else {
          console.error(res.message);
        }
      }
    }
  };

  const deleteEvent = async (event: Event) => {
    const currdb = db();
    if (!currdb) return;
    await deleteEventFromDb(currdb)(event);
    setSavedEvents(SavedEvents().filter((e) => e.key !== event.key));
  };

  const deleteEvents = async (options?: {
    uploaded?: boolean;
    events?: Event[];
  }) => {
    try {
      const currdb = db();
      if (!currdb) return;
      const events = options?.events
        ? options.events
        : await getSavedEvents(
          options?.uploaded !== undefined
            ? { uploaded: options.uploaded }
            : {}
        );
      await deleteEventsFromDb(currdb)(events);
      const currEvents = await getSavedEvents();
      setSavedEvents(currEvents);
    } catch (e) {
      if (e instanceof Error) {
        logError(e.message, e.stack);
      }
    }
  };

  const deleteRecording = async (recording: Recording) => {
    const currdb = db();
    if (!currdb) return;
    const name = recording.name;
    try {
      await Filesystem.deleteFile({
        path: `recordings/${name}`,
        directory: Directory.Documents,
      });
    } catch (e) {
      if (e instanceof Error) {
        if (e.message !== "File does not exist") {
          return;
        }
      }
    }

    await deleteRecordingFromDb(currdb)(recording);
    setSavedRecordings((prev) => prev.filter((r) => r.name !== name));
  };

  const deleteRecordings = async () => {
    const currdb = db();
    if (!currdb) return;
    try {
      await Filesystem.deleteFile({
        path: "recordings",
        directory: Directory.Documents,
      });
    } catch (e) {
      if (e instanceof Error) {
        if (e.message !== "File does not exist") {
          return;
        }
      }
    }
    // Delete all recordings from the database apart from uploaded ones
    // as the device may not have internet access
    const savedRecordings = SavedRecordings().filter((r) => !r.isUploaded);
    await deleteRecordingsFromDb(currdb)(savedRecordings);
    setSavedRecordings(SavedRecordings().filter((r) => r.isUploaded));
  };

  const uploadRecordings = async () => {
    const currdb = db();
    if (!currdb) return;
    const user = userContext.data();
    if (!user || !userContext.isAuthorized) return;
    const recordingsByDevice = UnuploadedRecordings().filter(
      (rec) => rec.isProd === userContext.isProd()
    ).reduce((acc, curr) => {
      if (!acc.has(curr.device)) {
        acc.set(curr.device, []);
      }
      acc.get(curr.device)?.push(curr);
      return acc;
    }, new Map<DeviceId, Recording[]>());

    for (const [device, recordings] of recordingsByDevice) {
      const deviceDetials = await CacophonyPlugin.getDeviceById({
        token: user.token,
        id: device,
      });
      if (!deviceDetials.success) {
        logError(`Failed to upload recording on device: ${recordings[0].deviceName}`, deviceDetials.message);
        continue;
      }
      for (const recording of recordings) {
        const res = await CacophonyPlugin.uploadRecording({
          token: user.token,
          type: "thermalRaw",
          file: recording.path,
          device: recording.device,
          filename: recording.name,
        });

        if (res.success) {
          recording.isUploaded = true;
          recording.uploadId = res.data.recordingId;
          await updateRecordingInDb(currdb)(recording);
          setSavedRecordings((prev) => {
            return [
              ...prev.filter((r) => r.name !== recording.name),
              recording,
            ];
          });
          const path = `recordings/${recording.name}`;
          await Filesystem.deleteFile({
            path,
            directory: Directory.Documents,
          });
        } else {
          console.error(res.message);
        }
      }
    }
  };

  const uploadItems = async () => {
    if (isUploading()) return;
    setIsUploading(true);
    if (await KeepAwake.isSupported()) {
      await KeepAwake.keepAwake();
    }
    await Promise.all([uploadRecordings(), uploadEvents()]);
    if (await KeepAwake.isSupported()) {
      await KeepAwake.allowSleep();
    }
    setIsUploading(false);
  };

  return {
    SavedRecordings,
    UnuploadedRecordings,
    UploadedRecordings,
    UploadedEvents,
    SavedEvents,
    UnuploadedEvents,
    saveRecording,
    deleteRecording,
    deleteRecordings,
    uploadRecordings,
    getSavedRecordings,
    saveEvent,
    uploadEvents,
    uploadItems,
    isUploading,
    getSavedEvents,
    deleteEvents,
    deleteEvent,
  };
});
const definiteUseStorage = () => useStorage()!;
export { StorageProvider, definiteUseStorage as useStorage };
