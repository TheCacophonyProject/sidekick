import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { createMemo, createResource, createSignal, onMount } from "solid-js";
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
} from "~/database/Entities/Event";
import type { Event } from "~/database/Entities/Event";
import {
  createRecordingSchema,
  getRecordings,
  deleteRecording as deleteRecordingFromDb,
  deleteRecordings as deleteRecordingsFromDb,
  updateRecording as updateRecordingInDb,
  insertRecording,
} from "~/database/Entities/Recording";
import type { Recording } from "~/database/Entities/Recording";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { openConnection } from "~/database";

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
  const [devicesDownloading, setDevicesDownloading] = createSignal<DeviceId[]>(
    []
  );
  const UploadedRecordings = createMemo(() =>
    SavedRecordings().filter((rec) => rec.isUploaded)
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
      console.log("Opened database");
      await db.execute(createRecordingSchema);
      await db.execute(createEventSchema);

      setDb(db);
      const recs = await getSavedRecordings();
      const events = await getSavedEvents();
      console.log(events);
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
        console.error(e);
        logError("Failed to save recording", e.message);
      }
    }
  };

  const getSavedRecordings = async (options?: {
    device?: string;
    uploaded?: boolean;
  }): Promise<Recording[]> => {
    const currdb = await db();
    if (!currdb) return [];
    return getRecordings(currdb)(options);
  };

  const saveEvent = async (options: {
    key: number;
    type: string;
    details: Object;
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
    for (const event of UnuploadedEvents().filter(
      (e) => e.isProd === userContext.isProd()
    )) {
      try {
        const res = await CacophonyPlugin.uploadEvent({
          token: user.token,
          device: event.device,
          eventId: event.key,
          type: event.type,
          details: event.details,
          timeStamp: event.timestamp,
        });
        console.log(res);
        if (res.success) {
          event.isUploaded = true;
          await updateEvent(currdb)(event);
          setSavedEvents((prev) => {
            return [...prev.filter((e) => e.key !== event.key), event];
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const deleteEvent = async (event: Event) => {
    try {
      const currdb = await db();
      if (!currdb) return;
      await deleteEventFromDb(currdb)(event);
      setSavedEvents(SavedEvents().filter((e) => e.key !== event.key));
    } catch (e) {
      throw e;
    }
  };

  const deleteEvents = async (options?: {
    uploaded?: boolean;
    events?: Event[];
  }) => {
    try {
      const currdb = await db();
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
    try {
      const currdb = await db();
      if (!currdb) return;
      const name = recording.name;
      await Filesystem.deleteFile({
        path: `recordings/${name}`,
        directory: Directory.Documents,
      });

      await deleteRecordingFromDb(currdb)(recording);
      await setSavedRecordings((prev) => prev.filter((r) => r.name !== name));
    } catch (e) {
      throw e;
    }
  };

  const deleteRecordings = async () => {
    try {
      const currdb = await db();
      if (!currdb) return;
      await Filesystem.deleteFile({
        path: "recordings",
        directory: Directory.Documents,
      });
      // Delete all recordings from the database apart from uploaded ones
      // as the device may not have internet access
      const savedRecordings = SavedRecordings().filter((r) => !r.isUploaded);
      await deleteRecordingsFromDb(currdb)(savedRecordings);
      setSavedRecordings(SavedRecordings().filter((r) => r.isUploaded));
    } catch (e) {
      throw e;
    }
  };

  const uploadRecordings = async () => {
    const currdb = await db();
    if (!currdb) return;
    const user = userContext.data();
    if (!user || !userContext.isAuthorized) return;
    const recordings = UnuploadedRecordings().filter(
      (rec) => rec.isProd === userContext.isProd()
    );
    for (const recording of recordings) {
      try {
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
        }
      } catch (e) {
        if (e instanceof Error) {
          logError(`Unable to upload ${recording.name}`, e?.message);
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
export { Recording, Event, StorageProvider, definiteUseStorage as useStorage };
