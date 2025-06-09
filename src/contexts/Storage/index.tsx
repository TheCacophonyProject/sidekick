import { KeepAwake } from "@capacitor-community/keep-awake";
import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { createContextProvider } from "@solid-primitives/context";
import { createEffect, createSignal, on, onMount, onCleanup, createMemo } from "solid-js";
import { openConnection } from "../../database";
import { useEventStorage } from "./event";
import { useLocationStorage } from "./location";
import { useRecordingStorage } from "./recording";
import { Network } from "@capacitor/network";
import { useLogsContext } from "../LogsContext";
import { useDeviceImagesStorage } from "./deviceImages";
import {
	LocalNotifications,
	type PermissionStatus,
} from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import type {
	CancelOptions,
	LocalNotificationSchema,
} from "@capacitor/local-notifications";
import { debounce } from "@solid-primitives/scheduled";

const DatabaseName = "Cacophony";

// Notification IDs
const UPLOAD_REMINDER_1H_ID = 1001;
const UPLOAD_REMINDER_6H_ID = 1002;
const UPLOAD_REMINDER_12H_ID = 1003;
const LOCATION_SYNC_REMINDER_ID = 1004;
const ALL_REMINDER_IDS = [
	UPLOAD_REMINDER_1H_ID,
	UPLOAD_REMINDER_6H_ID,
	UPLOAD_REMINDER_12H_ID,
	LOCATION_SYNC_REMINDER_ID,
];

const driver = new SQLiteConnection(CapacitorSQLite);
export const db = await openConnection(
	driver,
	DatabaseName,
	false,
	"no-encryption",
	2,
);

const [StorageProvider, useStorage] = createContextProvider(() => {
	const [isUploading, setIsUploading] = createSignal(false);
	const [autoUploadEnabled, setAutoUploadEnabled] = createSignal(true);
	const recording = useRecordingStorage();
	const location = useLocationStorage();
	const deviceImages = useDeviceImagesStorage();
	const event = useEventStorage();
	const log = useLogsContext();
	const cancelAllReminders = async () => {
		try {
			debugger;
			const cancelOptions: CancelOptions = {
				notifications: ALL_REMINDER_IDS.map((id) => ({ id })),
			};
			await LocalNotifications.cancel(cancelOptions);
		} catch (error) {
			log.logError({
				message: "Failed to cancel reminder notifications",
				error,
			});
		}
	};

	onMount(async () => {
		// Clear any stale notifications on app start
		await cancelAllReminders();

		if (Capacitor.getPlatform() === "android") {
			let permStatus: PermissionStatus =
				await LocalNotifications.checkPermissions();
			if (
				permStatus.display === "prompt" ||
				permStatus.display === "prompt-with-rationale"
			) {
				permStatus = await LocalNotifications.requestPermissions();
			}
			if (permStatus.display !== "granted") {
				log.logWarning({
					message:
						"Notification permission not granted. Upload reminders will not be shown.",
				});
			}
		}
	});

	// Set up network status listener
	let networkListener: { remove: () => void } | null = null;

	onMount(async () => {
		// Listen for network status changes
		networkListener = await Network.addListener('networkStatusChange', async (status) => {
			log.logSync({
				message: `Network status changed: ${status.connectionType}`,
				warn: false,
			});

			// Check if WiFi is connected and we have items to upload
			if (status.connected && status.connectionType === 'wifi' && hasItemsToUpload() && !isUploading() && autoUploadEnabled()) {
				log.logSync({
					message: "WiFi connected, starting automatic upload",
					warn: false,
				});
				await uploadItems(false, false); // warn=false, isManual=false
			}
		});

		// Clean up listener on unmount
		onCleanup(() => {
			if (networkListener) {
				networkListener.remove();
			}
		});
	});


	const uploadItems = async (warn = true, isManual = true) => {

		// Prevent multiple concurrent uploads
		if (isUploading()) {
			log.logWarning({
				message: "Upload already in progress",
				warn: false,
			});
			return;
		}

		// If this is a manual upload, re-enable auto-upload
		if (isManual) {
			setAutoUploadEnabled(true);
		}

		setIsUploading(true);

		try {
			// Cancel reminders before starting upload
			await cancelAllReminders();
			if (await KeepAwake.isSupported()) {
				await KeepAwake.keepAwake();
			}

			// Start the uploads - they will check shouldUpload() regularly
			await event.uploadEvents();
			await recording.uploadRecordings(warn);
			await location.resyncLocations();
			await deviceImages.syncPendingPhotos();
		} catch (error) {
			log.logError({
				message: "Error during uploading events/recordings/locations",
				error,
			});
		} finally {
			setIsUploading(false);
			if (await KeepAwake.isSupported()) {
				await KeepAwake.allowSleep();
			}
		}
	};

	const stopUploading = async () => {
		// First stop the individual upload processes
		recording.stopUploading();
		event.stopUploading();
		location.stopUploading();
		deviceImages.stopUploading();

		// Then update the upload state
		setIsUploading(false);

		// Disable auto-upload to prevent new uploads from starting
		setAutoUploadEnabled(false);

		// Cancel reminders when stopping upload
		await cancelAllReminders();

		// Wait a bit to ensure any pending operations see the updated flags
		await new Promise(resolve => setTimeout(resolve, 100));
	};

	const hasItemsToUpload = createMemo(() => {
		return (
			recording.hasItemsToUpload() ||
			event.hasItemsToUpload() ||
			location.hasItemsToUpload() ||
			deviceImages.hasItemsToUpload()
		);
	});

	// Helper function to schedule notifications
	const scheduleUploadReminders = async () => {
		try {
			let permStatus: PermissionStatus =
				await LocalNotifications.checkPermissions();

			// Request permission if needed
			if (
				permStatus.display === "prompt" ||
				permStatus.display === "prompt-with-rationale"
			) {
				permStatus = await LocalNotifications.requestPermissions();
			}

			if (permStatus.display !== "granted") {
				log.logWarning({
					message:
						"Cannot schedule upload notification: Permission not granted.",
				});
				return;
			}

			// Clear existing reminders before scheduling new ones
			await cancelAllReminders();

			const recordingsCount = recording.unuploadedRecordings().length;
			const eventsCount = event.unuploadedEvents().length;
			const locationsToSync = location.hasItemsToUpload();
			const photosCount = deviceImages.itemsToUpload().length;

			const notifications: LocalNotificationSchema[] = [];
			const now = Date.now();
			const oneHour = now + 60 * 60 * 1000;
			const sixHours = now + 6 * 60 * 60 * 1000;
			const twelveHours = now + 12 * 60 * 60 * 1000;

			let uploadBody = "Items ready to upload: ";
			const parts: string[] = [];
			if (recordingsCount > 0) parts.push(`${recordingsCount} recordings`);
			if (eventsCount > 0) parts.push(`${eventsCount} events`);
			if (photosCount > 0) parts.push(`${photosCount} photos`);

			if (parts.length > 0) {
				uploadBody += `${parts.join(", ")}.`;

				// Schedule 1-hour reminder
				notifications.push({
					id: UPLOAD_REMINDER_1H_ID,
					title: "Upload Reminder",
					body: uploadBody,
					schedule: { at: new Date(oneHour) },
					smallIcon: "ic_stat_notify_upload",
					autoCancel: true,
				});

				// Schedule 6-hour reminder
				notifications.push({
					id: UPLOAD_REMINDER_1H_ID,
					title: "Upload Reminder",
					body: uploadBody,
					schedule: { at: new Date(sixHours) },
					smallIcon: "ic_stat_notify_upload",
					autoCancel: true,
				});

				// Schedule 12-hour reminder
				notifications.push({
					id: UPLOAD_REMINDER_12H_ID,
					title: "Upload Reminder",
					body: uploadBody,
					schedule: { at: new Date(twelveHours) },
					smallIcon: "ic_stat_notify_upload",
					autoCancel: true,
				});
			}

			// Separate notification for location sync
			if (locationsToSync) {
				notifications.push({
					id: LOCATION_SYNC_REMINDER_ID,
					title: "Location Sync Pending",
					body: "Device location data is ready to be synced.",
					schedule: { at: new Date(oneHour) }, // Schedule alongside the first upload reminder
					smallIcon: "ic_stat_notify_sync", // Consider a different icon
					autoCancel: true,
				});
			}

			if (notifications.length > 0) {
				await LocalNotifications.schedule({ notifications });
			}
		} catch (error) {
			log.logError({
				message: "Error scheduling upload reminders",
				error,
			});
		}
	};
	const scheduleLocationSyncReminder = async (hasItems: boolean) => {
		try {
			if (hasItems) {
				await scheduleUploadReminders();
			} else {
				// If no items, cancel all reminders
				await cancelAllReminders();
			}
		} catch (error) {
			log.logError({
				message: "Error handling upload notifications",
				error,
			});
		}
	}
	const throttleScheduleReminders = debounce(
		scheduleLocationSyncReminder,
		5000, // 1 second debounce
	);
	createEffect(
		on(hasItemsToUpload, throttleScheduleReminders),
	);


	// Check initial network status when storage is ready
	let hasTriedAutoUpload = false;
	createEffect(
		on([hasItemsToUpload, isUploading, autoUploadEnabled], async ([hasItems, uploading, autoEnabled]) => {
			if (hasItems && !uploading && autoEnabled) {
				const currentStatus = await Network.getStatus();
				if (currentStatus.connected && currentStatus.connectionType === 'wifi' && !hasTriedAutoUpload) {
					hasTriedAutoUpload = true;
					log.logSync({
						message: "WiFi detected, starting automatic upload",
						warn: false,
					});
					await uploadItems(false, false); // warn=false, isManual=false
				}
			}
		})
	);
	return {
		...recording,
		...location,
		...event,
		...deviceImages,
		uploadItems,
		stopUploading,
		isUploading,
		hasItemsToUpload,
	};
});

// Provide a safe useStorage hook that ensures the context is available
function useStorageSafe() {
	const context = useStorage();
	if (!context) {
		throw new Error("useStorage must be used within StorageProvider");
	}
	return context;
}

export { StorageProvider, useStorageSafe as useStorage };
