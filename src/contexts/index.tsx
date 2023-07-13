export type CallbackId = string;
export type URL = string;
export type Success<T = object | string> = { success: true; data: T };
export type Failure = { success: false; message: string };
export type Res<T = object | string> = Success<T> | Failure;
export type Result<T = object | string> = Promise<Res<T>>;
