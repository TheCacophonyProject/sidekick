import { CapacitorHttp, HttpOptions } from "@capacitor/core";

export type CallbackId = string;
export type URL = string;
export type Success<T = object | string> = { success: true; data: T };
export type Failure = { success: false; message: string };
export type Result<T = object | string> = Promise<Success<T> | Failure>;
