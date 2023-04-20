import { registerPlugin } from '@capacitor/core';
import { Result } from '.';

type AuthToken = {
  token: string;
  refreshToken: string;
  expiry: string;
};

export type UserDetails = AuthToken & {
  id: string;
  email: string;
};

export type Settings = {
  referenceImages: string[];
}

export type Station = {
  id: number;
  name: string;
  location: Location;
  lastUpdatedById: number;
  createdAt: string;
  activeAt: string;
  retiredAt: string;
  lastThermalRecordingTime: string;
  lastAudioRecordingTime: string;
  lastActiveThermalTime: string;
  lastActiveAudioTime: string;
  automatic: boolean;
  settings: Settings;
  needsRename: boolean;
  updatedAt: string;
  groupId: number;
  groupName: string;
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
    type: 'thermalRaw' | 'audio';
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
  getStationsForUser(options: { token: string }): Result<Station[]>;
  setToProductionServer(): Result;
  setToTestServer(): Result;
  getAppVersion(): Result<string>;
}

export const CacophonyPlugin = registerPlugin<CacophonyPlugin>('Cacophony');
