import { createSignal, createMemo, onMount } from "solid-js";
import { db } from ".";
import { CacophonyPlugin } from "../CacophonyApi";
import { DeviceId, DevicePlugin, unbindAndRebind } from "../Device";
import { logWarning, logError } from "../Notification";
import {
  type Event,
  createEventSchema,
  getEvents,
  insertEvent,
  deleteEvents as deleteEventsFromDb,
  deleteEvent as deleteEventFromDb,
  updateEvent,
} from "../../database/Entities/Event";
import { useUserContext } from "../User";

export function useEventStorage() {
  const userContext = useUserContext();
  const [savedEvents, setSavedEvents] = createSignal<Event[]>([]);
  const uploadedEvents = createMemo(() =>
    savedEvents().filter((event) => event.isUploaded)
  );
  const unuploadedEvents = createMemo(() =>
    savedEvents().filter((event) => !event.isUploaded)
  );
  const [shouldUpload, setShouldUpload] = createSignal(false);
  const stopUploading = () => setShouldUpload(false);
  const saveEvent = async (options: {
    key: number;
    type: string;
    details: string;
    timestamp: string;
    device: DeviceId;
    isProd: boolean;
  }) => {
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
    await insertEvent(db)(event);

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
    const events = await getEvents(db)(options);
    return events;
  };

  const uploadEvents = async () => {
    const user = await userContext.getUser();
    if (!user) return;
    setShouldUpload(true);
    let events = unuploadedEvents().filter(
      (e) => e.isProd === userContext.isProd()
    );
    const errors: string[] = [];
    await unbindAndRebind(async () => {
      for (let i = 0; i < events.length; i++) {
        if (!shouldUpload()) return;
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
          await updateEvent(db)(event);
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
    });
    if (errors.length > 0) {
      logWarning({
        message: "Failed to upload events",
        details: errors.join(", "),
      });
    }
  };

  const deleteEvent = async (event: Event) => {
    await deleteEventFromDb(db)(event);
    setSavedEvents(savedEvents().filter((e) => e.key !== event.key));
  };

  const deleteEvents = async (options?: {
    uploaded?: boolean;
    events?: Event[];
  }) => {
    try {
      const events = options?.events
        ? options.events
        : await getSavedEvents(
          options?.uploaded !== undefined
            ? { uploaded: options.uploaded }
            : {}
        );
      await deleteEventsFromDb(db)(events);
      const currEvents = await getSavedEvents();
      setSavedEvents(currEvents);
    } catch (error) {
      logError({
        message: "Failed to delete events",
        error,
      });
    }
  };

  const hasItemsToUpload = createMemo(() => unuploadedEvents().length > 0);

  onMount(async () => {
    try {
      await db.execute(createEventSchema);
      setSavedEvents(await getSavedEvents());
    } catch (error) {
      logError({
        message: "Failed to get events",
        error,
      });
    }
  });

  return {
    savedEvents,
    stopUploading,
    uploadedEvents,
    unuploadedEvents,
    saveEvent,
    getSavedEvents,
    uploadEvents,
    deleteEvent,
    deleteEvents,
    hasItemsToUpload,
  };
}
