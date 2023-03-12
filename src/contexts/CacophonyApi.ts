import { registerPlugin } from "@capacitor/core";
import { Result } from ".";

type AuthToken = {
  token: string;
  refreshToken: string;
  expiry: string;
};

export type UserDetails = AuthToken & {
  id: string;
  email: string;
};

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
    file: string;
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
  setToProductionServer(): Result;
  setToTestServer(): Result;
}

export const CacophonyPlugin = registerPlugin<CacophonyPlugin>("Cacophony");
