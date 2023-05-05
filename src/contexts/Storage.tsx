import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  onMount,
} from "solid-js";
import { DeviceDetails, DeviceId } from "./Device";
import { useUserContext } from "./User";
import { createContextProvider } from "@solid-primitives/context";
import {
  CacophonyPlugin,
  getLocationsForUser,
  UserDetails,
} from "./CacophonyApi";
import { DevicePlugin } from "./Device";
import { logError, logWarning } from "./Notification";
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
} from "../database/Entities/Recording";
import type {
  Recording,
  UploadedRecording,
} from "../database/Entities/Recording";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { openConnection } from "../database";
import {
  createLocationSchema,
  deleteLocation,
  getLocations,
  insertLocation,
  Location,
  updateLocation,
} from "~/database/Entities/Location";

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
  // Recordings
  const [savedRecordings, setSavedRecordings] = createSignal<Recording[]>([]);
  const uploadedRecordings = createMemo(
    () =>
      savedRecordings().filter((rec) => rec.isUploaded) as UploadedRecording[]
  );
  const unuploadedRecordings = createMemo(() =>
    savedRecordings().filter((rec) => !rec.isUploaded)
  );
  // Events
  const [savedEvents, setSavedEvents] = createSignal<Event[]>([]);
  const uploadedEvents = createMemo(() =>
    savedEvents().filter((event) => event.isUploaded)
  );
  const unuploadedEvents = createMemo(() =>
    savedEvents().filter((event) => !event.isUploaded)
  );
  // locations
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
      await db.execute(createLocationSchema);

      setDb(db);

      const recs = await getSavedRecordings();
      setSavedRecordings(recs);
      const events = await getSavedEvents();
      setSavedEvents(events);
    } catch (e) {
      if (e instanceof Error) {
        logError({ message: "Failed to open database", error: e });
      } else {
        logError({
          message: "Failed to open database",
          details: "Unknown error: " + e,
        });
      }
    }
  });

  const getSavedLocations = async () => {
    const currdb = db();
    if (!currdb) return [];
    return getLocations(currdb)();
  };

  const getUserLocations = async () => {
    const userData = userContext.data();
    if (!userData) return [];
    const user = await userContext.validateCurrToken();
    if (!user) return [];
    const locations = await getLocationsForUser(user.token);
    return locations;
  };

  const getSyncedLocations = () => async () => {
    const currdb = db();
    if (!currdb) return [];
    const locations = await getUserLocations();
    try {
      const savedLocations = await getSavedLocations();
      const locationsToInsert = locations.filter(
        (location) =>
          !savedLocations.some(
            (savedLocation) => savedLocation.id === location.id
          )
      );
      const locationsToUpdate = savedLocations.filter((savedLocation) =>
        locations.some(
          (location) =>
            savedLocation.id === location.id &&
            savedLocation.updatedAt !== location.updatedAt
        )
      );
      const locationsToDelete = savedLocations.filter(
        (savedLocation) =>
          !locations.some((location) => location.id === savedLocation.id)
      );

      await Promise.all([
        ...locationsToInsert.map((location) =>
          insertLocation(currdb)(location)
        ),
        ...locationsToUpdate.map((location) =>
          updateLocation(currdb)(location)
        ),
        ...locationsToDelete.map((location) =>
          deleteLocation(currdb)(location)
        ),
      ]);
      return getSavedLocations();
    } catch (e) {
      if (e instanceof Error) {
        logError({ message: "Failed to sync locations:", error: e });
        return [];
      } else {
        logWarning({
          message: "Failed to sync locations",
        });
        return [];
      }
    }
  };

  const [savedLocations, { mutate }] = createResource(
    () => [userContext.data(), db()],
    getSyncedLocations()
  );

  const syncLocationName = async (id: number, name: string) => {
    const user = await userContext.validateCurrToken();
    if (!user) return;
    const currdb = db();
    if (!currdb) return;
    try {
      await CacophonyPlugin.updateStation({
        token: user.token,
        id,
        name,
      });
      await updateLocation(currdb)({
        id,
        updateName: false,
      });
    } catch (e) {
      await updateLocation(currdb)({
        id,
        updateName: true,
      });
    }
  };

  createEffect(() => {
    on(savedLocations, async (locations) => {
      console.log("locations to update", locations);
      if (!locations) return;
      await Promise.all(
        locations
          .filter((loc) => loc.updateName)
          .map((location) => {
            return syncLocationName(location.id, location.name);
          })
      );
      mutate((locations) =>
        locations?.map((loc) => ({ ...loc, updateName: false }))
      );
    });
  });

  const updateLocationName = async (location: Location, newName: string) => {
    const currdb = db();
    if (!currdb) return;
    const updatedLocation = { ...location, name: newName, updateName: true };

    await updateLocation(currdb)(updatedLocation);
    mutate((locations) =>
      locations?.map((loc) => (loc.id === location.id ? updatedLocation : loc))
    );
  };

  const findRecording = async (
    options: { id: string } | { name: string; device: string }
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
      const existingRecording = await findRecording({ id });
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
      const savedRecording = await findRecording({
        name: filename,
        device: id,
      });

      if (!savedRecording) {
        throw new Error("Failed to find recording");
      }
      setSavedRecordings((prev) => [...prev, savedRecording]);
      return savedRecording;
    } catch (e) {
      if (e instanceof Error) {
        logError({
          message: "Failed to save recording",
          details: e.message,
          error: e,
        });
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
    const detailString = details.replace(/\\/g, "\\\\");
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
    let events = unuploadedEvents().filter(
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
        if (res.message.includes("AuthError")) {
          logWarning({
            message: "Your account does not have access to upload events",
            details: res.message,
          });
          events = events.filter((e) => e.device !== event.device);
        } else {
          errors.push(res.message);
        }
      }
    }
    if (errors.length > 0) {
      logWarning({
        message: "Failed to upload events",
        details: errors.join(", "),
      });
    }
  };

  const deleteEvent = async (event: Event) => {
    const currdb = db();
    if (!currdb) return;
    await deleteEventFromDb(currdb)(event);
    setSavedEvents(savedEvents().filter((e) => e.key !== event.key));
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
        logError({
          message: "Failed to delete events",
          details: e.message,
          error: e,
        });
      } else {
        logError({
          message: "Failed to delete events",
          details: JSON.stringify(e),
        });
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
      logWarning({
        message: "Failed to delete recording",
        details: res.message,
      });
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
      logWarning({
        message: "Failed to delete recordings",
        details: res.message,
      });
      return;
    }
    // Delete all recordings from the database apart from uploaded ones
    // as the device may not have internet access
    const recs = savedRecordings().filter((r) => !r.isUploaded);
    await deleteRecordingsFromDb(currdb)(recs);
    setSavedRecordings(savedRecordings().filter((r) => r.isUploaded));
  };

  const uploadRecordings = async () => {
    const currdb = db();
    if (!currdb) return;
    const user = userContext.data();
    if (!user || !userContext.isAuthorized) return;
    let recordings = unuploadedRecordings().filter(
      (rec) => rec.isProd === userContext.isProd()
    );
    for (let i = 0; i < recordings.length; i++) {
      const recording = recordings[i];
      const res = await CacophonyPlugin.uploadRecording({
        token: user.token,
        type: "thermalRaw",
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
        if (res.message.includes("AuthError")) {
          logWarning({
            message: "Your account does not have access to upload recordings",
            details: res.message,
          });
          const otherRecordings = recordings.filter(
            (r) => r.device !== recording.device
          );
          recordings = otherRecordings;
        } else {
          logWarning({
            message: "Failed to upload recording",
            details: res.message,
          });
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
    savedRecordings,
    unuploadedRecordings,
    uploadedRecordings,
    savedEvents,
    uploadedEvents,
    unuploadedEvents,
    savedLocations,
    saveRecording,
    deleteRecording,
    deleteRecordings,
    uploadRecordings,
    getSavedRecordings,
    saveEvent,
    updateLocationName,
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
