import { createEffect, createResource, createSignal, on } from "solid-js";
import { createContextProvider } from "@solid-primitives/context";
import { Preferences } from "@capacitor/preferences";
import { logSuccess, logWarning } from "./Notification";
import { Result } from ".";
import { z } from "zod";
import { AuthToken, CacophonyPlugin } from "./CacophonyApi";
import { useNavigate } from "@solidjs/router";
import { FirebaseCrashlytics } from "@capacitor-community/firebase-crashlytics";
import { DevicePlugin } from "./Device";

const UserSchema = z.object({
  token: z.string(),
  id: z.string(),
  email: z.string(),
  refreshToken: z.string(),
  expiry: z.string(),
  prod: z.boolean(),
});

export type User = z.infer<typeof UserSchema>;

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
      logWarning({
        message: "Failed to save user data",
      });
    }
  });

  async function logout() {
    await Preferences.set({ key: "user", value: "" });
    await Preferences.set({ key: "skippedLogin", value: "false" });
    mutateSkip(false);
    await refetch();
  }
  async function login(email: string, password: string) {
    await DevicePlugin.unbindConnection();
    const authUser = await CacophonyPlugin.authenticateUser({
      email,
      password,
    });
    if (!authUser.success) {
      logWarning({
        message: "Login failed",
        details: authUser.message,
      });
      await DevicePlugin.rebindConnection();
      return;
    }
    const result = await CacophonyPlugin.validateToken({
      refreshToken: authUser.data.refreshToken,
    });
    await DevicePlugin.rebindConnection();
    if (!result.success) {
      logWarning({
        message: "Login failed",
        details: result.message,
      });
      return;
    }
    const { token, refreshToken, expiry } = result.data;
    Preferences.set({ key: "skippedLogin", value: "false" });
    mutateUser({
      token,
      id: authUser.data.id,
      email,
      refreshToken,
      expiry,
      prod: isProd(),
    });
    mutateSkip(false);
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
      if (!res.success) {
        logWarning({
          message: "Failed to change server",
          details: res.message,
        });
      }
    }
  });

  async function validateCurrToken(warn = true): Promise<User | undefined> {
    try {
      const user = data();
      if (!user) return;

      const { refreshToken, expiry, email, id } = user;
      const expiryDate = new Date(expiry).getTime();

      // Check if token is still valid for at least TOKEN_REFRESH_THRESHOLD milliseconds
      if (expiryDate > Date.now()) return user;

      await unbindAndRebind(async () => {
        const result = await CacophonyPlugin.validateToken({ refreshToken });

        if (result.success) {
          updateUser(result.data, { id, email });
        } else if (warn) {
          logWarning({
            message:
              "Could not validate user. Check your internet connection, or try relogging.",
            details: result.message,
          });
        }
      });
      return data() ?? undefined;
    } catch (error) {
      console.error("Error in validateCurrToken:", error);
    }
  }

  /**
   * Helper function to unbind and rebind connection.
   * @param callback The callback to execute between unbinding and rebinding.
   */
  async function unbindAndRebind(callback: () => Promise<void>) {
    await DevicePlugin.unbindConnection();
    await callback();
    await DevicePlugin.rebindConnection();
  }

  /**
   * Updates the user data.
   * @param data The new data to update.
   * @param user The current user data.
   */
  function updateUser(data: AuthToken, user: { id: string; email: string }) {
    const { token, refreshToken, expiry } = data;
    const updatedUser = {
      ...user,
      token,
      refreshToken,
      expiry,
      prod: isProd(),
    };
    mutateUser(updatedUser);
  }
  const isAuthorized = () => data() && data() !== null;

  function skip() {
    Preferences.set({ key: "skippedLogin", value: "true" });
    nav("/devices");
    mutateSkip(true);
  }

  async function requestDeletion(): Result<string> {
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
  }

  function toggleServer() {
    if (changeServer.loading) return;
    if (isProd()) {
      setServer("test");
    } else {
      setServer("prod");
    }
  }

  function getServerUrl() {
    return isProd()
      ? "https://api.cacophony.org.nz"
      : "https://api-test.cacophony.org.nz";
  }

  return {
    data,
    isAuthorized,
    skippedLogin,
    validateCurrToken,
    isProd,
    login,
    logout,
    skip,
    requestDeletion,
    toggleServer,
    getServerUrl,
  };
});

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const defineUserContext = () => useUserContext()!;

export { UserProvider, defineUserContext as useUserContext };
