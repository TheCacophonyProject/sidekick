import {
  Recording,
  UploadedRecording,
  createRecordingSchema,
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
import { DeviceDetails, DevicePlugin, unbindAndRebind } from "../Device";
import { logError, logWarning } from "../Notification";
import { createMemo, createSignal, onMount } from "solid-js";
import { useUserContext } from "../User";

type RecordingFile = {
  filename: string;
  path: string;
  size: number;
  isProd: boolean;
};

export function useRecordingStorage() {
  const userContext = useUserContext();
  const [savedRecordings, setSavedRecordings] = createSignal<Recording[]>([]);
  const uploadedRecordings = createMemo(
    () =>
      savedRecordings().filter((rec) => rec.isUploaded) as UploadedRecording[]
  );
  const unuploadedRecordings = createMemo(() =>
    savedRecordings().filter((rec) => !rec.isUploaded)
  );

  const [shouldUpload, setShouldUpload] = createSignal(false);
  const stopUploading = () => setShouldUpload(false);

  const getSavedRecordings = async (options?: {
    device?: string;
    uploaded?: boolean;
  }): Promise<Recording[]> => getRecordings(db)(options);

  const deleteRecording = async (recording: Recording) => {
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
    await deleteRecordingFromDb(db)(recording);
    setSavedRecordings((prev) => prev.filter((r) => r.id !== recording.id));
  };

  const deleteRecordings = async () => {
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
    await deleteRecordingsFromDb(db)(recs);
    setSavedRecordings(savedRecordings().filter((r) => r.isUploaded));
  };

  const uploadRecordings = async () => {
    setShouldUpload(true);
    let recordings = unuploadedRecordings().filter(
      (rec) => rec.isProd === userContext.isProd()
    );
    for (let i = 0; i < recordings.length; i++) {
      if (!shouldUpload()) return;
      const user = await userContext.getUser();
      if (!user) return;
      const recording = recordings[i];
      const res = await unbindAndRebind(() =>
        CacophonyPlugin.uploadRecording({
          token: user.token,
          type: "thermalRaw",
          device: recording.device,
          filename: recording.name,
        })
      );

      if (res.success) {
        recording.isUploaded = true;
        recording.uploadId = res.data.recordingId;
        await updateRecordingInDb(db)(recording);
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

  const findRecording = async (
    options: { id: string } | { name: string; device: string }
  ): Promise<Recording | undefined> => {
    const recordings = await getRecordings(db)(options);
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
        logError({
          message: "Failed to save recording",
          details: e.message,
          error: e,
        });
      }
    }
  };

  const hasItemsToUpload = createMemo(() => {
    return unuploadedRecordings().length > 0;
  });

  onMount(async () => {
    try {
      await db.execute(createRecordingSchema);
      setSavedRecordings(await getSavedRecordings());
    } catch (error) {
      logError({
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
  };
}
