import {
	createEffect,
	createResource,
	createSignal,
	on,
	onMount,
} from "solid-js";

import { createContextProvider } from "@solid-primitives/context";
import { Preferences } from "@capacitor/preferences";
import type { Result } from ".";
import { z } from "zod";
import { CacophonyPlugin } from "./CacophonyApi";
import { useNavigate } from "@solidjs/router";
import { CapacitorHttp } from "@capacitor/core";
import { useLogsContext } from "./LogsContext";
import { Effect, Either } from "effect";
import { createTokenService, type User, UserSchema } from "./TokenService";
import { createStore } from "solid-js/store";

// Response schema definitions
export type UserAuthResponse = z.infer<typeof UserAuthResponseSchema>;

const UserAuthResponseSchema = z.object({
	success: z.boolean(),
	messages: z.array(z.string()).optional(),
	token: z.string().optional(),
	refreshToken: z.string().optional(),
	expiry: z.string().optional(),
	userData: z
		.object({
			email: z.string(),
			globalPermission: z.string(),
			endUserAgreement: z.number().nullable(),
			emailConfirmed: z.boolean(),
			settings: z
				.object({
					displayMode: z.record(z.unknown()),
					lastKnownTimezone: z.string(),
					currentSelectedGroup: z
						.object({
							groupName: z.string(),
							id: z.number(),
						})
						.optional(),
				})
				.partial()
				.optional(),
			userName: z.string(),
			id: z.number(),
		})
		.optional(),
});

export type EUAResponse = z.infer<typeof EUAResponseSchema>;

const EUAResponseSchema = z.object({
	success: z.boolean(),
	messages: z.array(z.string()),
	euaVersion: z.number().optional(),
});

// Add ResetPassword response schema
const ResetPasswordResponseSchema = z.object({
	success: z.boolean(),
	messages: z.array(z.string()),
});

export type LoginResult =
	| { _tag: "Success"; user: User }
	| { _tag: "NeedsAgreement"; authToken: string }
	| { _tag: "Failed"; message: string };

const [UserProvider, useUserContext] = createContextProvider(() => {
	const log = useLogsContext();
	const nav = useNavigate();
	const ValidUrl = z.string().url();

	// Initialize token service
	const tokenService = createTokenService({
		logger: log,
		bufferTimeMs: 60000, // 1 minute buffer before token expiry
		offlineGracePeriodMs: 3600000, // 1 hour grace period when offline
		maxRetries: 2,
		retryDelayMs: 1000,
	});

	// Server URL management
	const [
		customServer,
		{ refetch: refetchCustomServer, mutate: mutateCustomServer },
	] = createResource<string | undefined>(async () => {
		const pref = ValidUrl.safeParse(
			(await Preferences.get({ key: "customServer" })).value,
		);
		console.log(`Custom server: ${pref.success ? pref.data : "none"}`);
		if (pref.success) {
			await CacophonyPlugin.setToCustomServer({ url: pref.data });
		}
		return pref.success ? pref.data : undefined;
	});

	// Server type state management
	const [server, setServer] = createSignal<"test" | "prod" | "custom">("prod");
	const isProd = () => server() === "prod" || server() === "custom";

	const getServerUrl = () => {
		if (customServer.loading) return undefined;
		const currCustomServer = customServer();
		if (currCustomServer) {
			return currCustomServer;
		}
		return isProd()
			? "https://api.cacophony.org.nz"
			: "https://api-test.cacophony.org.nz";
	};

	// User data resource with enhanced error handling
	const [data, { mutate: mutateUser, refetch }] = createResource(
		getServerUrl,
		async (server) => {
			try {
				if (!server) {
					return null;
				}

				// Add slightly longer delay to ensure loading screen appears first
				await new Promise((resolve) => setTimeout(resolve, 500));

				const storedUser = await Preferences.get({ key: "user" });
				if (!storedUser.value) return null;

				try {
					const json = JSON.parse(storedUser.value);
					if (!json || Object.keys(json).length === 0) return null;

					const user = UserSchema.parse(json);
					const validatedUser = await tokenService.validateToken(user);

					if (validatedUser === null && !navigator.onLine) {
						log.logWarning({
							message:
								"Token validation failed offline, retaining user session.",
							details:
								"User token might be expired, but keeping session active due to offline status.",
							warn: true,
						});
						return user;
					}

					return validatedUser;
				} catch (error) {
					log.logError({
						message: "User data validation failed",
						error,
						details: error instanceof Error ? error.message : "Unknown error",
					});
					return null;
				}
			} catch (error) {
				log.logError({ message: "User fetch failed", error });
				return null;
			}
		},
		{
			initialValue: undefined,
			// Add SSR option to prevent hydration mismatch
			ssrLoadFrom: "initial",
		},
	);

	// Update logger user context when user data changes
	createEffect(() => {
		const user = data();
		if (user) {
			log.setUser(user);
		} else {
			log.setUser(null);
		}
	});

	// Skipped login state management
	const [skippedLogin, { mutate: mutateSkip }] = createResource<boolean>(
		async () => {
			try {
				const skippedLogin = await Preferences.get({ key: "skippedLogin" });
				if (skippedLogin.value) {
					return JSON.parse(skippedLogin.value) as boolean;
				}
			} catch (error) {
				log.logError({
					message: "Failed to retrieve skipped login status",
					error,
				});
			}
			return false;
		},
	);

	// Logout functionality
	async function logout() {
		try {
			await tokenService.clearUser();
			await Preferences.set({ key: "skippedLogin", value: "false" });
			mutateSkip(false);
			await refetch();
			log.logSuccess({ message: "Successfully logged out" });
		} catch (error) {
			log.logError({ message: "Logout failed", error });
		}
	}

	// Login functionality
	async function login(email: string, password: string): Promise<LoginResult> {
		try {
			// First get the latest EUA version
			const euaResponse = await CapacitorHttp.request({
				method: "GET",
				url: `${getServerUrl()}/api/v1/end-user-agreement/latest`,
				headers: {
					"Content-Type": "application/json",
				},
			});

			const euaResult = EUAResponseSchema.safeParse(euaResponse.data);
			if (
				!euaResult.success ||
				!euaResult.data.success ||
				!euaResult.data.euaVersion
			) {
				log.logWarning({
					message: "Failed to get latest agreement version",
					warn: false,
				});
				return { _tag: "Failed", message: "System error" };
			}

			const latestEuaVersion = euaResult.data.euaVersion;

			// Normal authentication flow
			const authResponse = await CapacitorHttp.request({
				method: "POST",
				url: `${getServerUrl()}/authenticate_user`,
				headers: {
					"Content-Type": "application/json",
				},
				data: {
					email,
					password,
				},
			});

			const authResult = UserAuthResponseSchema.safeParse(authResponse.data);

			if (
				!authResult.success ||
				!authResult.data.success ||
				!authResult.data.userData ||
				!authResult.data.token
			) {
				log.logWarning({
					message: "Authentication failed",
					details: authResult.success
						? authResult.data.messages?.join(", ")
						: `Invalid response format: ${JSON.stringify(
								authResult.error,
							)}, ${JSON.stringify(authResult.data)}`,
				});
				return { _tag: "Failed", message: "Invalid credentials" };
			}

			// Check if user needs to accept latest agreement
			const userEuaVersion = authResult.data.userData.endUserAgreement;
			if (!userEuaVersion || userEuaVersion < latestEuaVersion) {
				log.logWarning({
					message: "User agreement needed",
					details: `User version: ${userEuaVersion}, Latest version: ${latestEuaVersion}`,
					warn: false,
				});
				return {
					_tag: "NeedsAgreement",
					authToken: authResult.data.token, // Removed non-null assertion
				};
			}

			// Create user object
			const user: User = {
				token: authResult.data.token, // Removed non-null assertion
				id: authResult.data.userData.id.toString(),
				email,
				refreshToken: authResult.data.refreshToken || "", // Provide empty string as fallback
				expiry: authResult.data.expiry,
				prod: isProd(),
			};

			await Preferences.set({ key: "skippedLogin", value: "false" });
			await tokenService.saveUser(user);
			mutateUser(user);
			mutateSkip(false);
			log.logSuccess({ message: "Login successful" });

			return { _tag: "Success", user };
		} catch (error) {
			log.logError({ message: "Login process failed", error });
			return { _tag: "Failed", message: "Login process failed" };
		}
	}

	// Server change management
	const [changeServer] = createResource(
		() => [server(), customServer()] as const,
		async ([server, customServer]) => {
			try {
				if (customServer) {
					await CacophonyPlugin.setToCustomServer({ url: customServer });
					return;
				}
				const res =
					server === "prod"
						? await CacophonyPlugin.setToProductionServer()
						: await CacophonyPlugin.setToTestServer();

				if (!res.success) {
					log.logWarning({
						message: "Server switch failed",
						details: res.message,
					});
					throw new Error(`Failed to switch to ${server} server`);
				}
				console.info({
					message: `Switched to ${server} server successfully`,
				});
			} catch (error) {
				log.logError({ message: "Error changing server", error });
			}
		},
	);

	// Get user with token validation
	async function getUser(): Promise<User | null | undefined> {
		try {
			if (data.loading) return undefined;
			const user = data();
			if (!user) {
				return null;
			}
			return user;
		} catch (error) {
			log.logError({ message: "Failed to retrieve user", error });
			return null;
		}
	}

	// Group schema definition
	const GroupSchema = z.array(
		z.object({
			id: z.number(),
			groupName: z.string(),
		}),
	);

	const GroupsResSchema = z.discriminatedUnion("success", [
		z.object({
			success: z.literal(true),
			messages: z.array(z.string()),
			groups: GroupSchema,
		}),
		z.object({
			success: z.literal(false),
			messages: z.array(z.string()),
		}),
	]);

	// Groups cache management
	const getCachedGroups = async (): Promise<(typeof GroupSchema)["_type"]> => {
		try {
			const cached = await Preferences.get({ key: "groups" });
			const parsed = GroupSchema.safeParse(JSON.parse(cached.value ?? "[]"));
			console.info("Using cached groups", parsed);
			return parsed.success ? parsed.data : [];
		} catch (error) {
			log.logError({ message: "Failed to retrieve cached groups", error });
			return [];
		}
	};

	// Groups resource
	const [groups, { refetch: refetchGroups, mutate: mutateGroups }] =
		createResource(
			() => [data(), getServerUrl()] as const,
			async ([_, url]) => {
				try {
					const user = await getUser();
					const groups = await getCachedGroups();
					if (!url || !user) {
						console.warn({
							message: "Cannot fetch groups without server URL or user",
						});
						return groups;
					}

					CapacitorHttp.request({
						method: "GET",
						url: `${url}/api/v1/groups`,
						headers: {
							Authorization: user.token,
						},
					}).then(async (res) => {
						const result = GroupsResSchema.safeParse(res.data);
						if (
							!result.success ||
							!result.data.success ||
							result.data.groups.length === 0
						) {
							console.warn({
								message: "Failed to fetch groups, using cached data",
							});
							return;
						}
						mutateGroups(result.data.groups);

						await Preferences.set({
							key: "groups",
							value: JSON.stringify(result.data.groups),
						});
					});

					console.info("Groups fetched successfully");
					return groups;
				} catch (e) {
					log.logError({ message: "Error fetching groups", error: e });
					return await getCachedGroups();
				}
			},
		);

	// Skip login
	function skip() {
		try {
			Preferences.set({ key: "skippedLogin", value: "true" });
			nav("/devices");
			mutateSkip(true);
			log.logSuccess({ message: "Skipped login successfully" });
		} catch (error) {
			log.logError({ message: "Failed to skip login", error });
		}
	}

	// Create group
	async function createGroup(groupName: string) {
		try {
			const user = await getUser();
			if (!user) {
				log.logWarning({
					message: "Attempted to create group without a valid user",
				});
				throw new Error("User not authenticated");
			}

			const res = await CapacitorHttp.request({
				method: "POST",
				url: `${getServerUrl()}/api/v1/groups`,
				headers: {
					Authorization: user.token,
					"Content-Type": "application/json",
				},
				data: { groupName },
			});

			const CreateGroupResSchema = z.object({
				success: z.boolean(),
				messages: z.array(z.string()),
			});

			const parsed = CreateGroupResSchema.safeParse(res.data);
			if (!parsed.success || !parsed.data.success) {
				log.logWarning({
					message: "Group creation failed",
					details: parsed.success
						? parsed.data.messages.join(", ")
						: "Invalid response format",
				});
				throw new Error("Failed to create group");
			}

			log.logSuccess({ message: "Group created successfully" });
			return parsed.data;
		} catch (error) {
			log.logError({ message: "Error creating group", error });
			throw error;
		}
	}

	// Check group access
	async function hasAccessToGroup(name: string): Promise<boolean> {
		try {
			const user = await getUser();
			if (!user) {
				log.logWarning({ message: "Access check without valid user" });
				return false;
			}
			const currGroups = groups();
			if (!currGroups) {
				log.logWarning({ message: "No groups available for access check" });
				return false;
			}
			return currGroups.some((group) => group.groupName === name);
		} catch (error) {
			log.logError({ message: "Error checking group access", error });
			return false;
		}
	}

	// Request account deletion
	async function requestDeletion(): Result<string> {
		try {
			const user = await getUser();
			if (!user) {
				log.logWarning({ message: "Deletion requested without a valid user" });
				throw new Error("User not authenticated");
			}
			const value = await CacophonyPlugin.requestDeletion({
				token: user.token,
			});
			log.logSuccess({ message: "Account deletion requested successfully" });
			return value;
		} catch (error) {
			log.logError({ message: "Failed to request account deletion", error });
			throw error;
		}
	}

	// Toggle server
	function toggleServer() {
		if (changeServer.loading) {
			log.logWarning({ message: "Server switch already in progress" });
			return;
		}
		const newServer = isProd() ? (customServer() ? "custom" : "test") : "prod";
		setServer(newServer);
		log.logSuccess({ message: `Server toggled to ${newServer}` });
	}

	// Dev mode management
	const [dev, setDev] = createSignal(false);
	onMount(async () => {
		try {
			const devPref = await Preferences.get({ key: "dev" });
			if (devPref.value === "true") {
				setDev(true);
			}
		} catch (error) {
			log.logError({
				message: "Failed to load development mode preference",
				error,
			});
		}
	});

	// Set custom server
	const setToCustomServer = async (customUrl: string) => {
		try {
			const valid = ValidUrl.safeParse(customUrl);
			if (valid.success) {
				await Preferences.set({
					key: "customServer",
					value: customUrl,
				});
				await refetchCustomServer();
			}
		} catch (error) {
			log.logError({ message: "Failed to set custom server", error });
		}
	};

	// Toggle dev mode
	const toggleDev = async () => {
		try {
			const newDevState = !dev();
			setDev(newDevState);
			await Preferences.set({
				key: "dev",
				value: newDevState ? "true" : "false",
			});
			log.logSuccess({
				message: `Development mode ${newDevState ? "enabled" : "disabled"}`,
			});
		} catch (error) {
			log.logError({ message: "Failed to toggle development mode", error });
		}
	};

	// Check if user is logged in
	const isLoggedIn = () => {
		return !!data();
	};

	// Update user agreement
	async function updateUserAgreement(authToken: string) {
		try {
			// Get the latest EUA version
			const euaResponse = await CapacitorHttp.request({
				method: "GET",
				url: `${getServerUrl()}/api/v1/end-user-agreement/latest`,
				headers: {
					Authorization: authToken,
				},
			});

			const euaResult = EUAResponseSchema.safeParse(euaResponse.data);
			if (
				!euaResult.success ||
				!euaResult.data.success ||
				!euaResult.data.euaVersion
			) {
				return Either.left("Failed to get latest agreement version");
			}

			// Update user's agreement version
			const updateResponse = await CapacitorHttp.request({
				method: "PATCH",
				url: `${getServerUrl()}/api/v1/users`,
				headers: {
					Authorization: authToken,
					"Content-Type": "application/json",
				},
				data: {
					endUserAgreement: euaResult.data.euaVersion,
				},
			});

			const updateResult = z
				.object({
					success: z.boolean(),
					messages: z.array(z.string()),
				})
				.safeParse(updateResponse.data);

			if (!updateResult.success || !updateResult.data.success) {
				return Either.left("Failed to update user agreement");
			}

			log.logSuccess({ message: "User agreement updated successfully" });
			return Either.right(true);
		} catch (error) {
			log.logError({ message: "Error updating user agreement", error });
			return Either.left("Error updating user agreement");
		}
	}

	async function resetPassword(email: string) {
		try {
			const response = await CapacitorHttp.request({
				method: "POST",
				url: `${getServerUrl()}/api/v1/users/reset-password`,
				headers: {
					"Content-Type": "application/json",
					Host: isProd()
						? "browse-next.cacophony.co.nz"
						: "browse-next-test.cacophony.org.nz",
				},
				data: { email },
			});
			const parse = ResetPasswordResponseSchema.safeParse(response.data);
			if (parse.success) {
				return parse.data;
			}
			log.logWarning({
				message: "Invalid reset password response format",
				details: JSON.stringify(parse.error),
			});
			return { success: false, messages: ["Invalid response from server"] };
		} catch (error) {
			log.logError({ message: "Reset password failed", error });
			return { success: false, messages: ["Reset password request failed"] };
		}
	}

	// Clear custom server
	const clearCustomServer = async () => {
		try {
			await Preferences.remove({ key: "customServer" });
			mutateCustomServer(undefined);
			setServer("prod");
			log.logSuccess({
				message: "Custom server cleared. Reverted to production server.",
			});
			await logout();
		} catch (error) {
			log.logError({ message: "Failed to clear custom server", error });
		}
	};

	// Sync server type with user data
	createEffect(() => {
		const user = data();
		if (customServer()) {
			setServer("custom");
		} else if (user && !user.prod) {
			setServer("test");
		} else {
			setServer("prod");
		}
	});

	const [userNeedsGroupAccess, setUserNeedsGroupAccess] = createStore({
		deviceId: "",
		deviceName: "",
		groupName: "",
	});

	// Request device access function - supports both deviceId and deviceName+groupName
	async function requestDeviceAccess(
		params: { deviceId: string } | { deviceName: string; groupName: string },
		adminEmail?: string
	): Promise<boolean> {
		try {
			const user = await getUser();
			if (!user) {
				log.logError({
					message: "User not logged in",
					error: new Error("User not authenticated"),
				});
				return false;
			}

			// Build payload based on provided parameters
			const payload: { 
				deviceId?: string; 
				deviceName?: string; 
				groupName?: string; 
				groupAdminEmail?: string;
			} = {};

			if ("deviceId" in params) {
				if (!params.deviceId) {
					log.logError({
						message: "Device ID is required for access request",
						error: new Error("Missing device ID"),
					});
					return false;
				}
				payload.deviceId = params.deviceId;
			} else {
				if (!params.deviceName || !params.groupName) {
					log.logError({
						message: "Device name and group name are required for access request",
						error: new Error("Missing device name or group name"),
					});
					return false;
				}
				payload.deviceName = params.deviceName;
				payload.groupName = params.groupName;
			}

			if (adminEmail) {
				payload.groupAdminEmail = adminEmail;
			}

			const response = await CapacitorHttp.post({
				url: `${getServerUrl()}/api/v1/users/request-device-access`,
				headers: {
					Authorization: user.token,
					"Content-Type": "application/json",
				},
				data: payload,
			});

			if (response.status >= 200 && response.status < 300) {
				const deviceInfo = "deviceId" in params ? 
					`device ID ${params.deviceId}` : 
					`device ${params.deviceName} in group ${params.groupName}`;
				log.logSuccess({
					message: "Device access request sent successfully",
					details: `Request for ${deviceInfo} has been sent`,
				});
				return true;
			} else {
				const errorMessage =
					(response.data as { message?: string })?.message ||
					`HTTP Error: ${response.status}`;
				log.logError({
					message: "Failed to send device access request",
					error: new Error(errorMessage),
					details: errorMessage,
				});
				return false;
			}
		} catch (err) {
			log.logError({
				message: "Exception during device access request",
				error: err instanceof Error ? err : new Error(String(err)),
			});
			return false;
		}
	}

	// Return context value
	return {
		data,
		groups,
		refetchGroups,
		skippedLogin,
		userNeedsGroupAccess,
		setUserNeedsGroupAccess,
		requestDeviceAccess,
		getUser,
		isProd,
		login,
		logout,
		skip,
		createGroup,
		hasAccessToGroup,
		requestDeletion,
		toggleServer,
		getServerUrl,
		dev,
		toggleDev,
		setToCustomServer,
		isLoggedIn,
		updateUserAgreement,
		resetPassword,
		clearCustomServer,
	};
});

// Helper to access user context with non-null assertion
const defineUserContext = () => useUserContext()!;

export { UserProvider, defineUserContext as useUserContext };
