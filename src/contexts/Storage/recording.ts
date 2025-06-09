import {
	createRecordingSchema,
	type Recording,
	type UploadedRecording,
} from "~/database/Entities/Recording";
import {
	getRecordings,
	deleteRecording as deleteRecordingFromDb,
	deleteRecordings as deleteRecordingsFromDb,
	updateRecording as updateRecordingInDb,
	insertRecording,
} from "~/database/Entities/Recording";
import { db } from ".";
import { CacophonyPlugin } from "../CacophonyApi";
import { type DeviceDetails, DevicePlugin } from "../Device";
import { createMemo, createSignal, onMount } from "solid-js";
import { useUserContext } from "../User";
import { useLogsContext } from "../LogsContext";

type RecordingFile = {
	filename: string;
	path: string;
	size: number;
	isProd: boolean;
};

export function useRecordingStorage() {
	const log = useLogsContext();
	const userContext = useUserContext();
	const [savedRecordings, setSavedRecordings] = createSignal<Recording[]>([]);
	const uploadedRecordings = createMemo(
		() =>
			savedRecordings().filter((rec) => rec.isUploaded) as UploadedRecording[],
	);
	const unuploadedRecordings = createMemo(() =>
		savedRecordings().filter((rec) => !rec.isUploaded),
	);
	const unuploadedThermalRecordings = createMemo(() =>
		unuploadedRecordings().filter((rec) => rec.name.endsWith("cptv")),
	);
	const unuploadedAudioRecordings = createMemo(() =>
		unuploadedRecordings().filter((rec) => rec.name.endsWith("aac")),
	);

	const [shouldUpload, setShouldUpload] = createSignal(false);
	const stopUploading = () => setShouldUpload(false);

	const getSavedRecordings = async (options?: {
		device?: string;
		uploaded?: boolean;
	}): Promise<Recording[]> => getRecordings(db)(options);

	const deleteRecording = async (recording: Recording) => {
		console.log("Deleting recording", recording);
		const res = await DevicePlugin.deleteRecording({
			recordingPath: recording.name,
		});
		if (!res.success) {
			log.logWarning({
				message: "Failed to delete recording",
				details: res.message,
			});
			return;
		}
		await deleteRecordingFromDb(db)(recording);
		setSavedRecordings((prev) => prev.filter((r) => r.id !== recording.id));
	};

	const deleteRecordings = async () => {
		console.log("Deleting all recordings");
		const res = await DevicePlugin.deleteRecordings();
		if (!res.success) {
			log.logWarning({
				message: "Failed to delete recordings",
				details: res.message,
			});
			return;
		}
		// Delete all recordings from the database apart from uploaded ones
		// as the device may not have internet access
		const recs = savedRecordings().filter((r) => !r.isUploaded);
		await deleteRecordingsFromDb(db)(recs);
		setSavedRecordings(savedRecordings().filter((r) => r.isUploaded));
	};

	const uploadRecordings = async (warn = true) => {
		setShouldUpload(true);
		const userProd = userContext.isProd();
		const recs = unuploadedRecordings();
		let recordings = recs.filter((rec) => rec.isProd === userProd);
		for (let i = 0; i < recordings.length; i++) {
			const shouldCancel = !shouldUpload();
			if (shouldCancel) return;
			const user = await userContext.getUser();
			if (!user) return;
			const recording = recordings[i];
			const type = recording.name.endsWith("cptv") ? "thermalRaw" : "audio";
			const res = await CacophonyPlugin.uploadRecording({
				token: user.token,
				type,
				device: recording.device,
				filename: recording.path.split("/").pop() ?? recording.name,
			});

			if (res.success) {
				recording.isUploaded = true;
				recording.uploadId = res.data.recordingId;
				await updateRecordingInDb(db)(recording);
				setSavedRecordings((prev) => {
					return [...prev.filter((r) => r.name !== recording.name), recording];
				});
				console.log("Deleting uploaded recording", recording);
				const deletion = await DevicePlugin.deleteRecording({
					recordingPath: recording.name,
				});
				if (!deletion.success) {
					console.error(deletion.message);
				}
			} else if (
				res.message.includes("FileNotFoundException") ||
				res.message.includes("ENOENT")
			) {
				// File doesn't exist on device, remove DB record
				log.logWarning({
					message: `Recording file not found on device: ${recording.name}. Removing record.`,
					details: res.message,
					warn: false, // Don't show popup for this internal cleanup
				});
				await deleteRecordingFromDb(db)(recording);
				setSavedRecordings((prev) => prev.filter((r) => r.id !== recording.id));
				// No need to try deleting from device again, it's already gone.
			} else if (res.message.includes("AuthError")) {
				// Check if this is specifically a device access issue
				if (
					res.message.includes("Could not find a device") &&
					res.message.includes("for user")
				) {
					// Trigger device access request popup using deviceName + groupName
					userContext.setUserNeedsGroupAccess({
						deviceId: "",
						deviceName: recording.deviceName,
						groupName: recording.groupName,
					});

					log.logWarning({
						message: `Device access required for ${recording.deviceName} in group ${recording.groupName}`,
						details: `You need access to device ${recording.deviceName} to upload recordings`,
						warn: false,
					});
				} else {
					log.logWarning({
						message: "Your account does not have access to upload recordings",
						details: res.message,
						warn,
					});
				}
				const otherRecordings = recordings.filter(
					(r) => r.device !== recording.device,
				);
				recordings = otherRecordings;
			} else if (res.message.includes("Failed to verify JWT")) {
				log.logWarning({
					message:
						"Failed to upload recording, please try again or log in again",
					details: `${recording.name} - ${res.message}`,
					warn,
				});
			} else if (res.message.includes("recordingDateTime")) {
				// This is a temporary fix for the issue where the audio file is corrupted, simply mark it as uploaded
				recording.isUploaded = true;
				recording.uploadId = null;
				await updateRecordingInDb(db)(recording);
				setSavedRecordings((prev) => {
					return [...prev.filter((r) => r.name !== recording.name), recording];
				});
				console.warn("Corrupted recording, marking as uploaded");
				const deletion = await DevicePlugin.deleteRecording({
					recordingPath: recording.name,
				});
				if (!deletion.success) {
					console.error(deletion.message);
				}
			} else {
				log.logWarning({
					message: "Failed to upload recording",
					details: `${recording.name} - ${res.message}`,
					warn,
				});
			}
		}
	};

	const findRecording = async (
		options: { id: string } | { name: string; device: string },
	): Promise<Recording | undefined> => {
		const recordings = await getRecordings(db)(options);
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

			await insertRecording(db)(recording);
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
				log.logError({
					message: "Failed to save recording",
					details: e.message,
					error: e,
					warn: false,
				});
			}
		}
	};

	const hasItemsToUpload = createMemo(() => {
		return unuploadedRecordings().length > 0;
	});

	const deleteUploadedRecordings = async (deviceId: string) => {
		try {
			const toDelete = savedRecordings().filter(
				(r) => r.isUploaded && r.device === deviceId,
			);
			if (!toDelete.length) return;

			for (const rec of toDelete) {
				const res = await DevicePlugin.deleteRecording({
					recordingPath: rec.name,
				});
				if (!res.success) {
					log.logWarning({
						message: `Failed to delete uploaded recording ${rec.name}`,
						details: res.message,
					});
				}
			}

			// Delete from the DB
			await deleteRecordingsFromDb(db)(toDelete);

			// Remove from our local signal
			setSavedRecordings((prev) =>
				prev.filter((r) => !(r.isUploaded && r.device === deviceId)),
			);
		} catch (error) {
			log.logError({
				message: "Failed to delete uploaded recordings",
				error,
			});
		}
	};
	onMount(async () => {
		try {
			await db.execute(createRecordingSchema);
			setSavedRecordings(await getSavedRecordings());
		} catch (error) {
			log.logError({
				message: "Failed to create recording schema",
				error,
			});
		}
	});

	return {
		savedRecordings,
		saveRecording,
		stopUploading,
		uploadedRecordings,
		unuploadedRecordings,
		deleteRecording,
		deleteRecordings,
		uploadRecordings,
		getSavedRecordings,
		hasItemsToUpload,
		deleteUploadedRecordings,
	};
}
