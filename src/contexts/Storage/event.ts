import { createSignal, createMemo, onMount } from "solid-js";
import { db } from ".";
import { CapacitorHttp } from "@capacitor/core";
import type { DeviceId } from "../Device";
import {
	type Event,
	createEventSchema,
	getEvents,
	insertEvent,
	deleteEvents as deleteEventsFromDb,
	deleteEvent as deleteEventFromDb,
	updateEvent,
	updateEvents,
} from "../../database/Entities/Event";
import { useUserContext } from "../User";
import { useLogsContext } from "../LogsContext";

// Number of events to batch in a single upload
const BATCH_SIZE = 20;

export function useEventStorage() {
	const log = useLogsContext();
	const userContext = useUserContext();
	const [savedEvents, setSavedEvents] = createSignal<Event[]>([]);
	const uploadedEvents = createMemo(() =>
		savedEvents().filter((event) => event.isUploaded),
	);
	const unuploadedEvents = createMemo(() =>
		savedEvents().filter((event) => !event.isUploaded),
	);
	const [shouldUpload, setShouldUpload] = createSignal(false);
	const [isUploading, setIsUploading] = createSignal(false);

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
				val.key === key.toString() ? val.device !== device : true,
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

	/**
	 * True batch upload of events to the server matching the Go implementation
	 * Groups events by type and details, then sends a single request per group
	 *
	 * @param events Array of events to upload
	 * @param token Authentication token
	 * @param device Device ID
	 * @returns Object with success status and message
	 */
	const batchUploadEvents = async (
		events: Event[],
		token: string,
		device: string,
	): Promise<{ success: boolean; message: string; uploadedKeys: string[] }> => {
		try {
			if (events.length === 0) {
				return {
					success: true,
					message: "No events to upload",
					uploadedKeys: [],
				};
			}

			const eventGroups: Record<string, { events: Event[]; times: string[] }> =
				{};

			for (const event of events) {
				let detailsForGrouping: any;
				try {
					// Attempt to parse event.details
					detailsForGrouping = JSON.parse(event.details);
				} catch (e) {
					console.warn(
						`Event (key: ${event.key}, type: ${event.type}) details are not valid JSON. Using raw string for grouping. Error: ${e instanceof Error ? e.message : String(e)}. Details (first 100 chars): "${event.details.substring(0, 100)}..."`,
					);
					detailsForGrouping = event.details; // Fallback to the raw string
				}

				// Create a unique key based on event type and the (parsed or raw) details
				const descriptionObjForGrouping = {
					type: event.type,
					details: detailsForGrouping,
				};
				const descriptionKey = JSON.stringify(descriptionObjForGrouping);

				if (!eventGroups[descriptionKey]) {
					eventGroups[descriptionKey] = {
						events: [],
						times: [],
					};
				}

				eventGroups[descriptionKey].events.push(event);
				eventGroups[descriptionKey].times.push(event.timestamp);
			}

			const results = await Promise.all(
				Object.entries(eventGroups).map(async ([descriptionKey, group]) => {
					try {
						const descriptionObjParsed = JSON.parse(descriptionKey);

						const payload = {
							description: {
								type: descriptionObjParsed.type,
								details: descriptionObjParsed.details,
							},
							dateTimes: group.times,
						};

						const response = await CapacitorHttp.post({
							url: `${userContext.getServerUrl()}/api/v1/events/device/${device}`, // Reverted to use userContext
							headers: {
								Authorization: token,
								"Content-Type": "application/json",
							},
							data: payload,
						});

						if (response.status >= 200 && response.status < 300) {
							return {
								success: true,
								message: "Events uploaded successfully",
								uploadedKeys: group.events.map((e) => e.key),
							};
						}
						return {
							success: false,
							message:
								(typeof response.data === "object" && response.data?.message) ||
								`HTTP Error: ${response.status}`,
							uploadedKeys: [],
						};
					} catch (error) {
						return {
							success: false,
							message: error instanceof Error ? error.message : String(error),
							uploadedKeys: [],
						};
					}
				}),
			);

			// Combine all results
			const allUploaded = results.every((r) => r.success);
			const allMessages = results
				.map((r) => r.message)
				.filter((v, i, a) => a.indexOf(v) === i)
				.join("; ");
			const allUploadedKeys = results.flatMap((r) => r.uploadedKeys);

			return {
				success: allUploaded,
				message:
					allMessages || "No events processed or all failed individually.",
				uploadedKeys: allUploadedKeys,
			};
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : String(error),
				uploadedKeys: [],
			};
		}
	};

	const uploadEvents = async () => {
		const user = await userContext.getUser();
		if (!user) return;

		setShouldUpload(true);
		setIsUploading(true);

		try {
			const events = unuploadedEvents().filter(
				(e) => e.isProd === userContext.isProd(),
			);

			const errors: string[] = [];
			const deviceGroups: Record<string, Event[]> = {};

			// Group events by device
			for (const event of events) {
				if (!deviceGroups[event.device]) {
					deviceGroups[event.device] = [];
				}
				deviceGroups[event.device].push(event);
			}

			// Process each device's events in batches
			for (const [device, deviceEvents] of Object.entries(deviceGroups)) {
				if (!shouldUpload()) break;

				// Process in batches
				for (let i = 0; i < deviceEvents.length; i += BATCH_SIZE) {
					if (!shouldUpload()) break;

					const batch = deviceEvents.slice(i, i + BATCH_SIZE);
					const result = await batchUploadEvents(batch, user.token, device);

					if (result.success && result.uploadedKeys.length > 0) {
						// Mark uploaded events as uploaded
						const eventsToUpdate = batch
							.filter((e) => result.uploadedKeys.includes(e.key))
							.map((e) => ({
								...e,
								isUploaded: true,
							}));

						// Update the database
						await updateEvents(db)(eventsToUpdate);

						// Update the state
						setSavedEvents((prev) => {
							const updated = [...prev];
							for (const event of eventsToUpdate) {
								const index = updated.findIndex((e) => e.key === event.key);
								if (index !== -1) {
									updated[index] = event;
								}
							}
							return updated;
						});
					} else {
						if (result.message.includes("AuthError")) {
							// Check if this is specifically a device access issue
							if (
								result.message.includes("Could not find a device") &&
								result.message.includes("for user")
							) {
								// Extract device ID from error message: "Could not find a device with an id of '3430' for user"
								const deviceIdMatch = result.message.match(
									/device with an id of '(\d+)'/,
								);
								const deviceId = deviceIdMatch ? deviceIdMatch[1] : "";

								if (deviceId) {
									// Use device ID if we can extract it
									userContext.setUserNeedsGroupAccess({
										deviceId: deviceId,
										deviceName: device,
										groupName: "",
									});
								} else {
									// Fallback: we only have device name, no group name
									// This will fail the API call but at least shows the popup
									userContext.setUserNeedsGroupAccess({
										deviceId: "",
										deviceName: device,
										groupName: "",
									});
								}

								log.logWarning({
									message: `Device access required for ${device}`,
									details: `You need access to device ${device} to upload events`,
									warn: false,
								});
							} else {
								log.logWarning({
									message: `Your account does not have access to upload events for device ${device}`,
									details: result.message,
									warn: false,
								});
							}
							// Skip remaining events for this device
							break;
						}
						errors.push(result.message);
					}
				}
			}

			if (errors.length > 0) {
				log.logWarning({
					message: "Failed to upload some events",
					details: errors.join(", "),
				});
			}
		} catch (error) {
			log.logError({
				message: "Failed to upload events",
				error,
			});
		} finally {
			setIsUploading(false);
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
							: {},
					);
			await deleteEventsFromDb(db)(events);
			const currEvents = await getSavedEvents();
			setSavedEvents(currEvents);
		} catch (error) {
			log.logError({
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
			log.logError({
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
		isUploading,
	};
}
