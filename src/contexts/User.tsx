import {
  createEffect,
  createResource,
  createSignal,
  on,
  onMount,
} from "solid-js";
import { createContextProvider } from "@solid-primitives/context";
import { Preferences } from "@capacitor/preferences";
import { logSuccess, logWarning } from "./Notification";
import { Result } from ".";
import { z } from "zod";
import { AuthToken, CacophonyPlugin } from "./CacophonyApi";
import { useNavigate } from "@solidjs/router";
import { FirebaseCrashlytics } from "@capacitor-community/firebase-crashlytics";
import { DevicePlugin, unbindAndRebind } from "./Device";
import { CapacitorHttp } from "@capacitor/core";

const UserSchema = z.object({
  token: z.string(),
  id: z.string(),
  email: z.string(),
  expiry: z.string().optional(),
  refreshToken: z.string(),
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
        setServer(user.prod ? "prod" : "test");
        const validUser = await getValidUser(user);

        return validUser;
      }
    } catch (error) {
      console.error("Error getting user data:", error);
    }
    return null;
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
    } catch (error) {
      console.error("Error saving user data:", error);
      logWarning({
        message: "Failed to save user data",
      });
    }
  });

  async function logout() {
    // print stack trace
    console.trace();
    await Preferences.set({ key: "user", value: "" });
    await Preferences.set({ key: "skippedLogin", value: "false" });
    mutateSkip(false);
    await refetch();
  }

  async function login(email: string, password: string) {
    try {
      await DevicePlugin.disconnectFromDeviceAP();

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
      const { token, refreshToken, expiry } = authUser.data;
      const user: User = {
        token,
        id: authUser.data.id,
        email,
        refreshToken,
        expiry,
        prod: isProd(),
      };
      Preferences.set({ key: "skippedLogin", value: "false" });
      Preferences.set({
        key: "user",
        value: JSON.stringify(user),
      });
      mutateUser(user);
      mutateSkip(false);
    } catch (e) {
      console.error(e);
    }
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

  interface JwtTokenPayload<
    T =
      | "user"
      | "device"
      | "reset-password"
      | "confirm-email"
      | "join-group"
      | "invite-new-user"
      | "invite-existing-user"
      | "refresh"
  > {
    exp: number;
    iat: number;
    _type: T;
    createdAt: Date;
    expiresAt: Date;
  }

  const decodeJWT = (jwtString: string): JwtTokenPayload | null => {
    const parts = jwtString.split(".");
    if (parts.length !== 3) {
      return null;
    }
    try {
      const decodedToken = JSON.parse(atob(parts[1]));
      return {
        ...decodedToken,
        expiresAt: new Date(decodedToken.exp * 1000),
        createdAt: new Date(decodedToken.iat * 1000),
      };
    } catch (e) {
      return null;
    }
  };

  async function getValidUser(user: User): Promise<User | null> {
    try {
      const { token, refreshToken, email, id } = user;
      const decodedToken = decodeJWT(token);
      if (!decodedToken) return null;
      const now = new Date();
      if (decodedToken.expiresAt.getTime() < now.getTime() + 5000) {
        return await unbindAndRebind(async () => {
          const result = await CacophonyPlugin.validateToken({ refreshToken });

          if (result.success) {
            const user: User = {
              token: result.data.token,
              refreshToken: result.data.refreshToken,
              id,
              email,
              expiry: result.data.expiry,
              prod: isProd(),
            };
            Preferences.set({
              key: "user",
              value: JSON.stringify(user),
            });
            return user;
          } else {
            if (result.message.includes("Failed")) {
              await logout();
            }
            return null;
          }
        });
      } else {
        return user;
      }
    } catch (error) {
      console.error("Error in validateCurrToken:", error);
      return null;
    }
  }

  const CreateGroupResSchema = z.object({
    success: z.boolean(),
    messages: z.array(z.string()),
  });

  async function createGroup(groupName: string) {
    const user = await getUser();
    if (!user) {
      throw new Error("User not found");
    }
    const res = await unbindAndRebind(async () => {
      return await CapacitorHttp.request({
        method: "POST",
        url: `${getServerUrl()}/api/v1/groups`,
        headers: {
          Authorization: user.token,
          "Content-Type": "application/json",
        },
        data: {
          groupName,
        },
      });
    });
    const result = CreateGroupResSchema.parse(res.data);
    return result;
  }

  async function getUser(warn = false): Promise<User | undefined | null> {
    try {
      if (data.loading) return;
      const user = data();
      if (!user) {
        return;
      }
      const validUser = await getValidUser(user);
      if (validUser) {
        mutateUser(validUser);
        return validUser;
      }
    } catch (error) {
      console.error("Error in validateCurrToken:", error);
    }
  }

  function skip() {
    Preferences.set({ key: "skippedLogin", value: "true" });
    nav("/devices");
    mutateSkip(true);
  }

  async function requestDeletion(): Result<string> {
    const user = await getUser();
    if (!user) throw new Error("User not found");
    const value = await CacophonyPlugin.requestDeletion({
      token: user.token,
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

  const GroupsResSchema = z.discriminatedUnion("success", [
    z.object({
      success: z.literal(true),
      messages: z.array(z.string()),
      groups: z.array(
        z.object({
          id: z.number(),
          groupName: z.string(),
        })
      ),
    }),
    z.object({
      success: z.literal(false),
      messages: z.array(z.string()),
    }),
  ]);
  const [groups, { refetch: refetchGroups }] = createResource(
    () => [data(), getServerUrl()] as const,
    async ([_, url]) => {
      const user = await getUser();
      if (!url || !user) return [];
      const res = await unbindAndRebind(async () => {
        const res = await CapacitorHttp.request({
          method: "GET",
          url: `${url}/api/v1/groups`,
          headers: {
            Authorization: user.token,
          },
        });
        return res;
      });
      if (!res) return [];
      const result = GroupsResSchema.safeParse(res.data);
      if (!result.success || result.data.success === false) {
        console.error("Error getting groups:", result);
        return [];
      }
      await Preferences.set({
        key: "groups",
        value: JSON.stringify(result.data.groups),
      });
      return result.data.groups;
    }
  );

  const [dev, setDev] = createSignal(false);
  onMount(async () => {
    const dev = await Preferences.get({ key: "dev" });
    if (dev.value === "true") {
      setDev(true);
    }
  });

  const toggleDev = () => {
    setDev(!dev());
    Preferences.set({ key: "dev", value: dev() ? "true" : "false" });
  };

  return {
    data,
    groups,
    refetchGroups,
    skippedLogin,
    getUser,
    isProd,
    login,
    logout,
    skip,
    createGroup,
    requestDeletion,
    toggleServer,
    getServerUrl,
    dev,
    toggleDev,
  };
});

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const defineUserContext = () => useUserContext()!;

export { UserProvider, defineUserContext as useUserContext };
