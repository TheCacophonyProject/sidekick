import { createEffect, createResource, createSignal, on } from "solid-js";
import { createContextProvider } from "@solid-primitives/context";
import { Preferences } from "@capacitor/preferences";
import { logSuccess, logWarning } from "./Notification";
import { Result } from ".";
import { z } from "zod";
import { CacophonyPlugin } from "./CacophonyApi";
import { useNavigate } from "@solidjs/router";
import { FirebaseCrashlytics } from "@capacitor-community/firebase-crashlytics";
const UserSchema = z.object({
  token: z.string(),
  id: z.string(),
  email: z.string(),
  refreshToken: z.string(),
  expiry: z.string(),
  prod: z.boolean(),
});

const [UserProvider, useUserContext] = createContextProvider(() => {
  const nav = useNavigate();
  const [data, { mutate: mutateUser, refetch }] = createResource(async () => {
    try {
      const storedUser = await Preferences.get({ key: "user" });
      if (storedUser.value) {
        const json = JSON.parse(storedUser.value);
        // check json is not an empty object
        if (json && Object.keys(json).length === 0) {
          return null;
        }
        const user = UserSchema.parse(JSON.parse(storedUser.value));
        return user;
      }
    } catch (error) {
      console.log(error);
      return null;
    }
  });

  const [skippedLogin, { mutate: mutateSkip }] = createResource(async () => {
    const skippedLogin = await Preferences.get({ key: "skippedLogin" });
    if (skippedLogin.value) {
      const json = JSON.parse(skippedLogin.value);
      if (json) {
        return json as boolean;
      }
    }
    return false;
  });

  createEffect(() => {
    on(data, async (data) => {
      if (data) {
        await FirebaseCrashlytics.setUserId({ userId: data.id });
      } else {
        await FirebaseCrashlytics.setUserId({ userId: "" });
      }
    });
  });

  createEffect(() => {
    try {
      const user = data();
      if (!user) return;
      const currUser = UserSchema.parse(user);
      setServer(currUser.prod ? "prod" : "test");
      const { token, id, email, refreshToken, prod } = currUser;
      Preferences.set({
        key: "user",
        value: JSON.stringify({
          token,
          id,
          email,
          expiry: currUser.expiry,
          refreshToken,
          prod,
        }),
      });
    } catch (error) {
      console.log(error);
    }
  });

  async function logout() {
    await Preferences.set({ key: "user", value: "" });
    await Preferences.set({ key: "skippedLogin", value: "false" });
    mutateSkip(false);
    await refetch();
  }

  const [server, setServer] = createSignal<"test" | "prod">("prod");
  const isProd = () => server() === "prod";

  const [changeServer] = createResource(server, async (server) => {
    if (server === "prod") {
      const res = await CacophonyPlugin.setToProductionServer();
      if (!res.success) {
        logWarning({
          message: "Failed to change server",
          details: res.message,
        });
      }
    } else {
      const res = await CacophonyPlugin.setToTestServer();
      if (res.success) {
        logSuccess({ message: "Server changed to test" });
      } else {
        logWarning({
          message: "Failed to change server",
          details: res.message,
        });
      }
    }
  });

  async function validateCurrToken() {
    const user = data();
    if (user) {
      const { token, refreshToken, expiry, email, id } = user;
      if (new Date(expiry).getTime() > Date.now()) return;
      const result = await CacophonyPlugin.validateToken({
        token,
        refreshToken,
        expiry,
      });
      if (result.success) {
        const { token, refreshToken, expiry } = result.data;
        mutateUser({ id, email, token, refreshToken, expiry, prod: isProd() });
        console.log("Token refreshed");
      } else {
        logWarning({
          message: "Please check your internet connection, or try relogging.",
          details: result.message,
        });
      }
    }
  }
  const isAuthorized = () => data() && data() !== null;

  return {
    data,
    isAuthorized,
    skippedLogin,
    validateCurrToken,
    isProd,
    async login(email: string, password: string) {
      const authUser = await CacophonyPlugin.authenticateUser({
        email,
        password,
      });
      if (!authUser.success) {
        logWarning({
          message: "Login failed",
          details: authUser.message,
        });
        return;
      }
      const { token, id, refreshToken } = authUser.data;
      Preferences.set({ key: "skippedLogin", value: "false" });
      mutateUser({
        token,
        id,
        email,
        refreshToken,
        expiry: new Date().toISOString(),
        prod: isProd(),
      });
      mutateSkip(false);
    },
    logout,
    skip() {
      Preferences.set({ key: "skippedLogin", value: "true" });
      nav("/devices");
      mutateSkip(true);
    },
    async requestDeletion(): Result<string> {
      const usr = data();
      if (!usr) return Promise.reject("No user to delete");
      await validateCurrToken();
      const value = await CacophonyPlugin.requestDeletion({
        token: usr.token,
      });
      logSuccess({
        message: "Account deletion requested.",
      });
      return value;
    },
    toggleServer() {
      if (changeServer.loading) return;
      if (isProd()) {
        setServer("test");
      } else {
        setServer("prod");
      }
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const defineUserContext = () => useUserContext()!;

export { UserProvider, defineUserContext as useUserContext };
