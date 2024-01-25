// Setup Notifcation Context
// This is using SolidJS's store to manage state
// and will be used to manage the state of the notifications
// such as error messages, success messages, and loading messages

import { FirebaseCrashlytics } from "@capacitor-community/firebase-crashlytics";
import { JSX, createSignal } from "solid-js";
import StackTrace from "stacktrace-js";

type NotifcationType = "error" | "warning" | "success" | "loading";
type NotificationID = string;
export type Notification = {
	id: NotificationID;
	message: string;
	details?: string;
	type: NotifcationType;
	timeout?: number;
	action?: JSX.Element;
};

type TimeoutID = ReturnType<typeof setTimeout>;

const generateID = (): NotificationID => {
	return (Date.now() + Math.random()).toString(36).replace(".", "");
};

const [notifications, setNotifications] = createSignal<Notification[]>([]);
const timeoutIDs = new Map<NotificationID, TimeoutID>();
const defaultDuration = 3000;

const removeNotificationAfterDuration = (id: string, duration: number) => {
	return setTimeout(() => {
		setNotifications(
			notifications().filter((notification) => notification.id !== id),
		);
	}, duration);
};

type LogDetails = {
	message: string;
	details?: string;
	timeout?: number;
	action?: JSX.Element;
};

type LogBase = {
	type: NotifcationType;
};

type Log = LogBase & LogDetails;

type ErrorLog = { type: "error"; error: unknown | Error } & LogDetails;

type AnyLog = Log | ErrorLog;
function isErrorLog(log: AnyLog): log is ErrorLog {
	return log.type === "error";
}

const logAction = async (log: AnyLog) => {
	// Remove duplicate notifications
	if (
		notifications().find(
			(notification) =>
				notification.message === log.message ||
				notification.details === log.details,
		)
	)
		return;

	const id = generateID();
	const details = `${log.details ? `${log.details}\n` : ""}${
		isErrorLog(log) ? `${log.error}` : ""
	}`;
	console.debug(`[${log.type}] ${log.message} ${details}`);
	console.trace();
	setNotifications([
		...notifications(),
		{
			id,
			message: log.message,
			details,
			type: log.type,
			timeout: log.timeout,
			action: log.action,
		},
	]);

	if (log.type === "success" || log.type === "loading" || log.timeout) {
		hideNotification(id, log.timeout ?? defaultDuration);
	}

	if (isErrorLog(log)) {
		const message = `message: ${log.message} details: ${log.details}`;
		if (log.error && log.error instanceof Error) {
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
	// log call stack
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
