// Setup Notifcation Context
// This is using SolidJS's store to manage state
// and will be used to manage the state of the notifications
// such as error messages, success messages, and loading messages

import { FirebaseCrashlytics } from "@capacitor-community/firebase-crashlytics";
import { createSignal } from "solid-js";
import StackTrace from "stacktrace-js";

type NotifcationType = "error" | "warning" | "success" | "loading";
type NotificationID = string;
export type Notification = {
  id: NotificationID;
  message: string;
  details?: string;
  type: NotifcationType;
};

type TimeoutID = ReturnType<typeof setTimeout>;

const generateID = (): NotificationID => {
  return (Date.now() + Math.random()).toString(36).replace(".", "");
};

const [notifications, setNotifications] = createSignal<Notification[]>([]);
const timeoutIDs = new Map<NotificationID, TimeoutID>();
const defaultDuration = 3000;

const removeNotificationAfterDuration = (id: string, duration: number) =>
  setTimeout(() => {
    setNotifications(
      notifications().filter((notification) => notification.id !== id)
    );
  }, duration);

type LogDetails = {
  message: string;
  details?: string;
  timeout?: number;
};

type LogBase = {
  type: NotifcationType;
};

type Log = LogBase & LogDetails;

type ErrorLog = { type: "error"; error?: Error } & LogDetails;

type AnyLog = Log | ErrorLog;
function isErrorLog(log: AnyLog): log is ErrorLog {
  return log.type === "error";
}

const logAction = async (log: AnyLog) => {
  const id = generateID();
  const message = `message: ${log.message} details: ${log.details}`;
  if (isErrorLog(log)) {
    await FirebaseCrashlytics.recordException({ message });
  } else {
    console.warn(log);
  }
  setNotifications([
    ...notifications(),
    {
      id,
      message: log.message,
      details: JSON.stringify(log.details),
      type: log.type,
    },
  ]);
  hideNotification(id, log.timeout ?? defaultDuration);
  if (isErrorLog(log)) {
    console.log(log.message, log.details);
    const message = `message: ${log.message} details: ${log.details}`;
    if (log.error) {
      console.error(log.error);
      const stacktrace = await StackTrace.fromError(log.error);
      await FirebaseCrashlytics.recordException({
        message,
        stacktrace,
      });
    } else {
      await FirebaseCrashlytics.recordException({ message });
    }
  }
};

const logError = (errorLog: Omit<ErrorLog, "type">) =>
  logAction({ ...errorLog, type: "error" });
const logWarning = (warningLog: LogDetails) =>
  logAction({ ...warningLog, type: "warning" });
const logSuccess = (successLog: LogDetails) =>
  logAction({ ...successLog, type: "success" });
const logLoading = (loadingLog: LogDetails) =>
  logAction({ ...loadingLog, type: "loading" });

const hideNotification = (id: NotificationID, delay = defaultDuration) => {
  // find the notification and give new timeoutID
  if (timeoutIDs.has(id)) {
    clearTimeout(timeoutIDs.get(id));
  }
  const timeoutID = removeNotificationAfterDuration(id, delay);
  timeoutIDs.set(id, timeoutID);
};

const keepNotification = (id: NotificationID) => {
  if (timeoutIDs.has(id)) {
    clearTimeout(timeoutIDs.get(id));
  }
};

export {
  logError,
  logWarning,
  logSuccess,
  logLoading,
  keepNotification,
  hideNotification,
  notifications,
};
