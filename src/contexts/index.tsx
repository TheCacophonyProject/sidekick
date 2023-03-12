import { CapacitorHttp, HttpOptions } from "@capacitor/core";

export type CallbackId = string;
export type URL = string;
export type Success<T = {}> = { success: true; data: T };
export type Failure = { success: false; message: string };
export type Result<T = {}> = Success<T> | Failure;
export type PromiseResult<T = {}> = Promise<Result<T>>;
