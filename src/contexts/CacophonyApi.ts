import { registerPlugin } from "@capacitor/core";
import { z } from "zod";
import { LocationSchema } from "~/database/Entities/Location";
import { Result } from ".";
import { logError } from "./Notification";

type AuthToken = {
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
  validateToken(token: AuthToken): Result<AuthToken>;
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
    token: string;
    station: string;
    fileKey: string;
  }): Result<JSONString>;
  deleteReferencePhoto(options: {
    token: string;
    station: string;
    fileKey: string;
  }): Result<{localDeleted: boolean, serverDeleted: boolean}>;
  createStation(options: {
    token: string;
    name: string;
    lat: number;
    lng: number;
    from: ISODateString;
  }): Result<JSONString>;
  setToProductionServer(): Result;
  setToTestServer(): Result;
  getAppVersion(): Result<string>;
}

export const CacophonyPlugin = registerPlugin<CacophonyPlugin>("Cacophony");

const SuccessResSchema = z.object({
  success: z.literal(true),
  messages: z.array(z.string()),
  stations: z.array(
    LocationSchema.omit({ coords: true, userId: true })
      .extend({
        location: z.object({ lat: z.number(), lng: z.number() }),
      })
      .transform((val) => ({
        ...val,
        coords: val.location,
      }))
  ),
});

const FailureResSchema = z.object({
  success: z.literal(false),
  messages: z.array(z.string()),
});

const LocationResSchema = z.discriminatedUnion("success", [
  SuccessResSchema,
  FailureResSchema,
]);

export async function getLocationsForUser(token: string) {
  const locationJson = await CacophonyPlugin.getStationsForUser({ token });
  if (locationJson.success) {
    const locationRes = LocationResSchema.parse(JSON.parse(locationJson.data));
    if (!locationRes.success) {
      throw new Error(locationRes.messages.join(", "));
    }

    return locationRes.stations;
  } else {
    logError({
      message: "Failed to get locations",
      details: locationJson.message,
    });
    return [];
  }
}
