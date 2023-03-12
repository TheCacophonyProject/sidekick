import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { createResource, createSignal, onMount } from "solid-js";
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
  updateEvent,
} from "~/database/Event";
import type { Event } from "~/database/Event";
import {
  createRecordingSchema,
  getRecordings,
  deleteRecording as deleteRecordingFromDb,
  deleteRecordings as deleteRecordingsFromDb,
  updateRecording as updateRecordingInDb,
  insertRecording,
} from "~/database/Recording";
import type { Recording } from "~/database/Recording";
import { openConnection } from "~/database";

type RecordingFile = {
  filename: string;
  path: string;
  size: number;
  isProd: boolean;
};
const [SavedRecordings, setSavedRecordings] = createSignal<Recording[]>([]);
const [SavedEvents, setSavedEvents] = createSignal<Event[]>([]);

const [StorageProvider, useStorage] = createContextProvider(() => {
  const userContext = useUserContext();
  const driver = new SQLiteConnection(CapacitorSQLite);
  const [db, setDb] = createSignal<SQLiteDBConnection>();

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
        size: size.toString(),
        isProd,
      };

      const savedRecording = await insertRecording(currdb)(recording);
      setSavedRecordings((prev) => [...prev, recording]);
      return savedRecording;
    } catch (e) {
      console.error(e);
      throw e;
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
  }) => {
    const currdb = db();
    if (!currdb) return;
    const { key, type, details, timestamp, device } = options;
    const event: Event = {
      key: key.toString(),
      type,
      details: JSON.stringify(details),
      timestamp,
      device,
      isUploaded: false,
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
    if (!userContext?.isAuthorized) return;
    const events = SavedEvents().filter((e) => !e.isUploaded);
    await userContext.validateCurrToken();
    const user = userContext.data();
    if (!user) return;
    await Promise.all(
      events.map(async (event) => {
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
      })
    );
  };

  const deleteEvent = async (event: Event) => {
    try {
      const currdb = await db();
      if (!currdb) return;
      await deleteEventsFromDb(currdb)([event]);
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
      const name = recording.name;
      await Filesystem.deleteFile({
        path: `recordings/${name}`,
        directory: Directory.Documents,
      });
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
      // Delete all recordings from the database
      const savedRecordings = SavedRecordings().filter((r) => !r.isUploaded);
      await deleteRecordingsFromDb(currdb)(savedRecordings);
      setSavedRecordings(SavedRecordings().filter((r) => r.isUploaded));
    } catch (e) {
      throw e;
    }
  };

  const uploadRecordings = async () => {
    if (!userContext) return;
    if (!userContext.isAuthorized) return;
    const currdb = await db();
    if (!currdb) return;
    await userContext.validateCurrToken();
    const user = userContext.data();
    if (!user) return;
    const recordings = SavedRecordings().filter((r) => !r.isUploaded);
    await Promise.all(
      recordings.map(async (recording) => {
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
      })
    );
  };

  return {
    saveRecording,
    deleteRecording,
    deleteRecordings,
    uploadRecordings,
    getSavedRecordings,
    saveEvent,
    uploadEvents,
    getSavedEvents,
    deleteEvents,
    deleteEvent,
  };
});
const definiteUseStorage = () => useStorage()!;
export {
  Recording,
  Event,
  SavedRecordings,
  SavedEvents,
  StorageProvider,
  definiteUseStorage as useStorage,
};
