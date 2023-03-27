// Setup Notifcation Context
// This is using SolidJS's store to manage state
// and will be used to manage the state of the notifications
// such as error messages, success messages, and loading messages

import { createSignal } from "solid-js";

type NotifcationType = "error" | "success" | "loading";
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

const logAction =
  (type: NotifcationType) =>
  (message: string, details?: string, duration = defaultDuration) => {
    const id = generateID();
    setNotifications([
      ...notifications(),
      { id, message, details: JSON.stringify(details), type },
    ]);
    hideNotification(id, duration);
    console.log(message, details);
  };

const logError = logAction("error");

const logSuccess = logAction("success");

const logLoading = logAction("loading");

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
    console.log("clearing timeout", timeoutIDs.get(id));
    clearTimeout(timeoutIDs.get(id));
  }
};

export {
  logError,
  logSuccess,
  logLoading,
  keepNotification,
  hideNotification,
  notifications,
};
