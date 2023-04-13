import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { createMemo, createSignal, onMount } from 'solid-js';
import { DeviceDetails, DeviceId } from './Device';
import { useUserContext } from './User';
import { createContextProvider } from '@solid-primitives/context';
import { CacophonyPlugin } from './CacophonyApi';
import { DevicePlugin } from './Device';
import { logError } from './Notification';
import {
  createEventSchema,
  getEvents,
  insertEvent,
  deleteEvents as deleteEventsFromDb,
  deleteEvent as deleteEventFromDb,
  updateEvent,
} from '../database/Entities/Event';
import type { Event } from '../database/Entities/Event';
import {
  createRecordingSchema,
  getRecordings,
  deleteRecording as deleteRecordingFromDb,
  deleteRecordings as deleteRecordingsFromDb,
  updateRecording as updateRecordingInDb,
  insertRecording,
} from '../database/Entities/Recording';
import type { Recording, UploadedRecording } from '../database/Entities/Recording';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { openConnection } from '../database';

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

  const DatabaseName = 'Cacophony';
  onMount(async () => {
    try {
      const db = await openConnection(
        driver,
        DatabaseName,
        false,
        'no-encryption',
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
    options: { id: string } | { name: string, device: string }
  ): Promise<Recording | undefined> => {
    const currdb = db();
    if (!currdb) return;
    const recordings = await getRecordings(currdb)(options);
    const recording = recordings[0];
    return recording;
  };

  const saveRecording = async ({
    id, // Device ID
    name, // Group name
    group,
    path,
    filename,
    size,
    isProd,
  }: DeviceDetails & RecordingFile) => {
    try {
      const currdb = db();
      if (!currdb) return;
      const existingRecording = await findRecording({id});
      if (existingRecording) {
        return existingRecording;
      }
      const recording = {
        name: filename,
        path,
        groupName: group,
        device: id,
        deviceName: name,
        size: size.toString(),
        isProd,
        isUploaded: false,
      };

      await insertRecording(currdb)(recording);
      const savedRecording = await findRecording({name: filename, device: id});

      if (!savedRecording) {
        throw new Error('Failed to find recording');
      }
      setSavedRecordings((prev) => [...prev,savedRecording]);
    } catch (e) {
      if (e instanceof Error) {
        logError('Failed to save recording', e.message);
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
    // add backlash to backslashes
    const detailString = details.replace(/\\/g, '\\\\');
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
    let events = UnuploadedEvents().filter(
      (e) => e.isProd === userContext.isProd()
    );
    const errors = [];
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
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
        if (res.message.includes('AuthError')) {
          logError("Your account does not have access to upload events for this device", res.message)
          events = events.filter((e) => e.device !== event.device);
        } else {
          errors.push(res.message);
        }
      }
    }
    if (errors.length > 0) {
      logError('Failed to upload events', errors.join(', '));
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
    const res = await DevicePlugin.deleteRecording({
      recordingPath: recording.name,
    });
    if (!res.success) {
      console.error(res.message);
      return;
    }
    await deleteRecordingFromDb(currdb)(recording);
    setSavedRecordings((prev) => prev.filter((r) => r.id !== recording.id));
  };

  const deleteRecordings = async () => {
    const currdb = db();
    if (!currdb) return;
    const res = await DevicePlugin.deleteRecordings();
    if (!res.success) {
      console.error(res.message);
      return;
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
    let recordings = UnuploadedRecordings().filter(
      (rec) => rec.isProd === userContext.isProd()
    );
    for (let i = 0; i < recordings.length; i++) {
      const recording = recordings[i];
      const res = await CacophonyPlugin.uploadRecording({
        token: user.token,
        type: 'thermalRaw',
        device: recording.device,
        filename: recording.name,
      });

      if (res.success) {
        recording.isUploaded = true;
        recording.uploadId = res.data.recordingId;
        await updateRecordingInDb(currdb)(recording);
        setSavedRecordings((prev) => {
          return [...prev.filter((r) => r.name !== recording.name), recording];
        });
        const deletion = await DevicePlugin.deleteRecording({
          recordingPath: recording.name,
        });
        if (!deletion.success) {
          console.error(deletion.message);
        }
      } else {
        if (res.message.includes('AuthError')) {
          logError("Your account does not have access to upload recordings for this device", res.message);
          const otherRecordings = recordings.filter((r) => r.device !== recording.device);
          recordings = otherRecordings;
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
