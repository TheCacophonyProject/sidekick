import { registerPlugin } from "@capacitor/core";
import { z } from "zod";
import { Result } from ".";
import { logError } from "./Notification";
import { DevicePlugin } from "./Device";

export type AuthToken = {
  token: string;
  refreshToken: string;
  expiry: string;
};

export type UserDetails = AuthToken & {
  id: string;
  email: string;
};

type JSONString = string;

type ISODateString = string;

export interface CacophonyPlugin {
  authenticateUser(user: { email: string; password: string }): Result<{
    token: string;
    id: string;
    email: string;
    refreshToken: string;
  }>;
  requestDeletion(user: { token: string }): Result<string>;
  validateToken(options: { refreshToken: string }): Result<AuthToken>;
  uploadRecording(options: {
    token: string;
    type: "thermalRaw" | "audio";
    device: string;
    filename: string;
  }): Result<{ recordingId: string; messages: string }>;
  uploadEvent(options: {
    token: string;
    device: string;
    eventId: string;
    type: string;
    details: string;
    timeStamp: string;
  }): Result<{ recordingId: string; messages: string }>;
  getDeviceById(options: { token: string; id: string }): Result<{
    deviceName: string;
    groupName: string;
    groupId: number;
    deviceId: number;
    saltId: number;
    active: boolean;
    admin: boolean;
    type: string;
    public: boolean;
    lastConnectionTime: string;
    lastRecordingTime: string;
    location: {
      lat: number;
      lng: number;
    };
    users: {
      userName: string;
      userId: number;
      admin: boolean;
    }[];
  }>;
  getStationsForUser(options: { token: string }): Result<JSONString>;
  updateStation(options: {
    token: string;
    id: string;
    name: string;
  }): Result<JSONString>;
  uploadReferencePhoto(options: {
    token: string;
    station: string;
    filename: string;
  }): Result<JSONString>;
  getReferencePhoto(options: {
    token?: string;
    station: string;
    fileKey: string;
  }): Result<string>;
  deleteReferencePhoto(options: {
    token?: string;
    station: string;
    fileKey: string;
  }): Result<{ localDeleted: boolean; serverDeleted: boolean }>;
  createStation(options: {
    token: string;
    name: string;
    lat: string;
    lng: string;
    groupName: string;
    fromDate: ISODateString;
  }): Result<JSONString>;
  setToProductionServer(): Result;
  setToTestServer(): Result;
  getAppVersion(): Result<string>;
}

export const CacophonyPlugin = registerPlugin<CacophonyPlugin>("Cacophony");

const SettingsSchema = z.object({
  referenceImages: z.array(z.string()).nullish(),
});

const ApiLocationSchema = z
  .object({
    id: z.number().positive(),
    name: z.string(),
    updatedAt: z.string(),
    groupName: z.string(),
    settings: SettingsSchema.nullish(),
    location: z.object({ lat: z.number(), lng: z.number() }),
    needsRename: z.boolean().default(false),
  })
  .transform((data) => {
    const { settings, location, ...rest } = data;
    return {
      ...rest,
      referencePhotos: settings?.referenceImages ?? [],
      coords: location,
    };
  });

export type ApiLocation = z.infer<typeof ApiLocationSchema>;

const SuccessResSchema = z.object({
  success: z.literal(true),
  messages: z.array(z.string()),
  stations: z.array(ApiLocationSchema),
});

const FailureResSchema = z.object({
  success: z.literal(false),
  messages: z.array(z.string()),
});

const LocationResSchema = z.discriminatedUnion("success", [
  SuccessResSchema,
  FailureResSchema,
]);

export async function getLocationsForUser(
  token: string
): Promise<ApiLocation[]> {
  await DevicePlugin.unbindConnection();
  const locationJson = await CacophonyPlugin.getStationsForUser({ token });
  await DevicePlugin.rebindConnection();
  if (locationJson.success) {
    const json = JSON.parse(locationJson.data);
    const locationRes = LocationResSchema.parse(json);
    if (!locationRes.success) {
      throw new Error(locationRes.messages.join(", "));
    }
    return locationRes.stations;
  } else {
    logError({
      message:
        "Unable to get locations. Please check internet and you are logged in",
      details: locationJson.message,
    });
    return [];
  }
}
