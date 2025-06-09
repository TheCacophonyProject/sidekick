import { KeepAwake } from "@capacitor-community/keep-awake";
import {
	type HttpResponse,
	type PluginListenerHandle,
	registerPlugin,
	Capacitor, // Added Capacitor import
} from "@capacitor/core";
import { CapacitorHttp } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import { Geolocation } from "@capacitor/geolocation";
import { createContextProvider } from "@solid-primitives/context";
import { ReactiveMap } from "@solid-primitives/map";
import { debounce, leading } from "@solid-primitives/scheduled";
import { ReactiveSet } from "@solid-primitives/set";
import {
	batch,
	createEffect,
	createResource,
	createSignal,
	on,
	onCleanup,
	onMount,
} from "solid-js";
import { z } from "zod";
import { GoToPermissions } from "~/components/GoToPermissions";
import type { Location } from "~/database/Entities/Location";
import type { Result, URL } from "..";
import { useStorage } from "../Storage";
import { isWithinRange } from "../Storage/location";
import DeviceCamera from "./Camera";
import { Effect } from "effect";
import { useLogsContext } from "../LogsContext";
import { useSearchParams } from "@solidjs/router";
import { useUserContext } from "../User";
import { Network } from "@capacitor/network";
// Use a fixed threshold for location update checks (in meters)
const UPDATE_DISTANCE_THRESHOLD_METERS = 25;

const WifiNetwork = z
	.object({
		SSID: z.string(),
		Quality: z.string(),
		"Signal Level": z.string().optional(),
		Security: z.string().optional(),
	})
	.transform((val) => {
		// Quality is a string of the form "xx/70" where xx is the signal level
		const quality = Math.round((Number.parseInt(val.Quality) / 70) * 100);
		const isSecured = !val.Security || val.Security !== "Unknown";
		return {
			SSID: val.SSID,
			quality,
			signalLevel: val["Signal Level"],
			isSecured,
		};
	});
export type WifiNetwork = z.infer<typeof WifiNetwork>;
export const asInt = z
	.union([z.string(), z.number()])
	.transform((val) => (typeof val === "string" ? Number.parseInt(val) : val));
export const tc2ModemSchema = z
	.object({
		failedToFindModem: z.boolean().optional(),
		failedToFindSimCard: z.boolean().optional(),
		modem: z
			.object({
				atReady: z.boolean(),
				connectedTime: z.string(),
				manufacturer: z.string(),
				model: z.string(),
				name: z.string(),
				netdev: z.string(),
				serial: z.string(),
				temp: asInt,
				vendor: z.string(),
				voltage: asInt,
				apn: z.string().optional(),
			})
			.partial(),
		onOffReason: z.string(),
		powered: z.boolean(),
		signal: z
			.object({
				accessTechnology: z.string(),
				band: z.string(),
				provider: z.string(),
				strength: z.string(),
			})
			.partial()
			.optional(),
		simCard: z
			.object({
				ICCID: z.string(),
				provider: z.string(),
				simCardStatus: z.string(),
			})
			.partial()
			.optional(),
		timestamp: z.string(),
	})
	.partial();
export type Modem = z.infer<typeof tc2ModemSchema>;

const AudioModeSchema = z.union([
	z.literal("Disabled" as const),
	z.literal("AudioOnly" as const),
	z.literal("AudioOrThermal" as const),
	z.literal("AudioAndThermal" as const),
]);

const AudioStatusSchema = z.union([
	z.literal(1).transform(() => "ready" as const),
	z.literal(2).transform(() => "pending" as const),
	z
		.literal(3)
		.transform(() => "test_recording" as const), // Short test recording
	z
		.literal(4)
		.transform(() => "recording" as const), // Busy with video
	z
		.literal(5)
		.transform(() => "long_recording" as const), // Long audio recording
	z
		.literal(6)
		.transform(() => "setting_up_long_recording" as const), // Setting up long recording
]);
const AudioModeResSchema = z.object({
	"audio-mode": AudioModeSchema,
});
const AudioStatusResSchema = z.object({
	mode: z.union([
		z.literal(0).transform(() => "Disabled" as const),
		z.literal(1).transform(() => "AudioOnly" as const),
		z.literal(2).transform(() => "AudioOrThermal" as const),
		z.literal(3).transform(() => "AudioAndThermal" as const),
	]),
	status: AudioStatusSchema,
});
const AudioRecordingResSchema = z.object({
	"audio-mode": AudioModeSchema,
	"audio-seed": z
		.union([z.string(), z.number()])
		.transform((val) => val.toString()),
});
export type AudioMode = z.infer<typeof AudioModeSchema>;
export type DeviceId = string;
export type DeviceName = string;
export type DeviceHost = string;
export type DeviceType = "pi" | "tc2";
export type DeviceUrl = { url: string };
export type RecordingName = string;

export type DeviceDetails = {
	id: DeviceId;
	saltId?: string;
	host: DeviceHost;
	name: DeviceName;
	group: string;
	endpoint: string;
	isProd: boolean;
	timeFound: Date;
	locationSet: boolean;
	url: string;
	type: "pi" | "tc2";
	hasAudioCapabilities: boolean;
	hasLongRecordingSupport?: boolean; // Add this flag
	lastUpdated?: Date;
	batteryPercentage?: string;
};

type DeviceCoords<T extends string | number> = {
	latitude: T;
	longitude: T;
	altitude: T;
	accuracy: T;
	timestamp: string;
};

export type ConnectedDevice = DeviceDetails & {
	isConnected: true;
};

export type DisconnectedDevice = DeviceDetails & {
	isConnected: false;
};

export type Device = ConnectedDevice | DisconnectedDevice;

type DeviceService = {
	host: string;
	endpoint: string;
};

export interface DevicePlugin {
	addListener(
		call: "onServiceResolved",
		callback: (res: DeviceService) => void,
	): Promise<PluginListenerHandle>;
	addListener(
		call: "onServiceResolveFailed",
		callback: (res: {
			endpoint: string;
			message: string;
			errorCode: string;
		}) => void,
	): Promise<PluginListenerHandle>;
	addListener(
		call: "onServiceLost",
		callback: (res: { endpoint: string }) => void,
	): Promise<PluginListenerHandle>;
	addListener(
		call: "onDiscoveryStateChanged",
		callback: (res: { state: string }) => void,
	): Promise<PluginListenerHandle>;
	addListener(
		call: "onDiscoveryError",
		callback: (res: { error: string; fatal: boolean }) => void,
	): Promise<PluginListenerHandle>;
	addListener(
		call: "onAPConnectionStateChanged",
		callback: (res: { state: string }) => void,
	): Promise<PluginListenerHandle>;
	addListener(
		call: "onAPConnected",
		callback: (res: { status: string }) => void,
	): Promise<PluginListenerHandle>;
	addListener(
		call: "onAPDisconnected",
		callback: (res: { status: string }) => void,
	): Promise<PluginListenerHandle>;
	addListener(
		call: "onAPConnectionFailed",
		callback: (res: {
			status: string;
			error: string;
			canRetry: boolean;
		}) => void,
	): Promise<PluginListenerHandle>;
	addListener(
		call: "onAPConnectionLost",
		callback: (res: { status: string }) => void,
	): Promise<PluginListenerHandle>;
	connectToDeviceAP(): Promise<{
		status: "connected" | "disconnected" | "error" | "connecting";
		error?: string;
	}>;
	discoverDevices(): Promise<void>;
	stopDiscoverDevices(): Promise<void>;
	checkDeviceConnection(options: DeviceUrl): Result;
	getDeviceInfo(options: DeviceUrl): Result<string>;
	getDeviceConfig(options: DeviceUrl): Result<string>;
	setDeviceConfig(options: {
		url: string;
		section: string;
		config: string;
	}): Result<string>;
	setLowPowerMode(options: DeviceUrl & { enabled: string }): Result;
	updateRecordingWindow(
		options: DeviceUrl & { on: string; off: string },
	): Result;
	checkIsAPConnected(): Promise<{ connected: boolean }>;
	getDeviceLocation(options: DeviceUrl): Result<string>;
	setDeviceLocation(options: DeviceUrl & DeviceCoords<string>): Result;
	getRecordings(options: DeviceUrl): Result<string[]>;
	getEventKeys(options: DeviceUrl): Result<number[]>;
	getEvents(options: DeviceUrl & { keys: string }): Result<string>;
	deleteEvents(options: DeviceUrl & { keys: string }): Result;
	deleteRecording(options: { recordingPath: string }): Result;
	deleteRecordings(): Result;
	downloadRecording(
		options: DeviceUrl & { recordingPath: string },
	): Result<{ path: string; size: number }>;
	disconnectFromDeviceAP(): Promise<Result<"disconnected">>;
	reregisterDevice(
		options: DeviceUrl & { group: string; device: string },
	): Result;
	updateWifi(options: DeviceUrl & { ssid: string; password: string }): Result;
	turnOnModem(options: DeviceUrl & { minutes: string }): Result;
	hasConnection(): Result;
	getTestText(): Promise<{ text: string }>;
	checkPermissions(): Promise<{ granted: boolean }>;
}

export const DevicePlugin = registerPlugin<DevicePlugin>("Device");

const DeviceInfoSchema = z.object({
	serverURL: z.string(),
	groupname: z.string(),
	devicename: z.string(),
	deviceID: z.number(),
	saltID: z.string().optional(),
	type: z.literal("pi").or(z.literal("tc2")).or(z.literal("")).nullish(),
	lastUpdated: z.string().optional(),
});
type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

const [DeviceProvider, useDevice] = createContextProvider(() => {
	const storage = useStorage();
	const log = useLogsContext();
	const user = useUserContext();

	const devices = new ReactiveMap<DeviceId, Device>();
	const deviceRecordings = new ReactiveMap<DeviceId, RecordingName[] | null>();
	const deviceEventKeys = new ReactiveMap<DeviceId, number[]>();
	const connectingDevices = new ReactiveMap<
		string,
		{
			host: string;
			endpoint: string;
			timestamp: number;
		}
	>();

	const locationBeingSet = new ReactiveSet<string>();
	const devicesDownloading = new ReactiveSet<DeviceId>();

	const [listeners, setListeners] = createSignal<PluginListenerHandle[]>([]);
	const [isDiscovering, setIsDiscovering] = createSignal(false);

	const internetConnectionCache = new ReactiveMap<
		DeviceId,
		{ status: boolean; timestamp: number }
	>();
	const INTERNET_CACHE_DURATION_MS = 60 * 1000; // 1 minute

	const availableWifiNetworksCache = new ReactiveMap<
		DeviceId,
		{ networks: WifiNetwork[] | null; timestamp: number }
	>();
	const currentWifiNetworkCache = new ReactiveMap<
		DeviceId,
		{ network: { SSID: string } | null; timestamp: number }
	>();
	const modemDetailsCache = new ReactiveMap<
		DeviceId,
		{ modem: Modem | null; timestamp: number }
	>();
	const savedWifiNetworksCache = new ReactiveMap<
		DeviceId,
		{ networks: string[] | null; timestamp: number }
	>();
	const wifiInternetConnectionCache = new ReactiveMap<
		DeviceId,
		{ connected: boolean; timestamp: number }
	>();
	const modemInternetConnectionCache = new ReactiveMap<
		DeviceId,
		{ connected: boolean; timestamp: number }
	>();
	const NETWORK_DATA_CACHE_DURATION_MS = 20 * 1000; // 20 seconds

	const setCurrRecs = async (device: ConnectedDevice) =>
		deviceRecordings.set(device.id, await getRecordings(device));

	const setCurrEvents = async (device: ConnectedDevice) =>
		deviceEventKeys.set(device.id, (await getEventKeys(device)) ?? []);

	const clearUploaded = async (device: ConnectedDevice) => {
		if (devicesDownloading.has(device.id)) return;
		await deleteUploadedRecordings(device);
		await deleteUploadedEvents(device);
		await setCurrRecs(device);
		await setCurrEvents(device);
	};

	const DEVICE_POLL_INTERVAL = 100000; // 10 seconds
	onMount(() => {
		const interval = setInterval(async () => {
			for (const device of devices.values()) {
				await storage.syncWithServer(device.id, device.isProd);
				if (device.isConnected) {
					await clearUploaded(device);
					await refreshCheckAudioCapabilities(device);
				}
			}
		}, DEVICE_POLL_INTERVAL);

		const cleanupInterval = setInterval(cleanUpConnectionAttempts, 60000);

		onCleanup(() => {
			clearInterval(interval);
			clearInterval(cleanupInterval);
		});
	});

	function cleanUpConnectionAttempts() {
		const now = Date.now();
		for (const [endpoint, data] of connectingDevices.entries()) {
			if (now - data.timestamp > 120000) {
				connectingDevices.delete(endpoint);
			}
		}
	}

	const fetchDeviceInfo = async (url: string): Promise<DeviceInfo> => {
		try {
			const infoRes = await Effect.runPromise(
				Effect.retry(
					Effect.tryPromise<HttpResponse>(() =>
						CapacitorHttp.get({
							url: `${url}/api/device-info`,
							headers,
							webFetchExtra: {
								credentials: "include",
							},
						}),
					),
					{ times: 3 },
				),
			);

			if (!infoRes || infoRes.status !== 200) {
				throw new Error(
					`Could not get device info from ${url}, status: ${infoRes?.status}`,
				);
			}

			const info = DeviceInfoSchema.parse(JSON.parse(infoRes.data));
			return info;
		} catch (error) {
			throw new Error(`Failed to fetch device info from ${url}: ${error}`);
		}
	};

	// Function to check if the long recording endpoint exists
	const checkLongRecordingSupport = async (url: string): Promise<boolean> => {
		try {
			const res = await CapacitorHttp.request({
				method: "GET",
				url: `${url}/api/audio/long-recording`,
				headers,
				connectTimeout: 3000,
				readTimeout: 3000,
			});
			// Status 200 OK or 405 Method Not Allowed likely mean the endpoint exists
			return res.status === 200 || res.status === 405;
		} catch (error: unknown) {
			// A 404 error means the endpoint doesn't exist
			if (error instanceof Error && "status" in error && error.status === 404) {
				return false;
			}
			// Other errors might indicate network issues, but assume no support for safety
			console.warn(`Error checking long recording support for ${url}:`, error);
			return false;
		}
	};

	const createDevice = async (url: string) => {
		if (!url) throw new Error("No URL provided to create device");

		try {
			const info = await fetchDeviceInfo(url);
			const id: DeviceId = info.deviceID.toString();
			const type = info.type || "pi";

			return {
				id,
				saltId: info.saltID,
				name: info.devicename || "New Device",
				group: info.groupname,
				type,
				isProd: !info.serverURL.includes("test"),
				locationSet: false,
				timeFound: new Date(),
				url,
				isConnected: true as const,
				lastUpdated: info.lastUpdated ? new Date(info.lastUpdated) : undefined,
			};
		} catch (error) {
			throw new Error(`Could not create device from URL ${url}: ${error}`);
		}
	};

	const refreshCheckAudioCapabilities = async (device: ConnectedDevice) => {
		try {
			const hasAudio = await hasAudioCapabilities(device.url);
			if (hasAudio) {
				device.hasAudioCapabilities = true;
				devices.set(device.id, device);
			}
		} catch (error) {
			log.logError({
				message: "Error checking audio capabilities",
				error,
			});
		}
	};

	const endpointToDevice = async (
		endpoint: string,
		host: string,
	): Promise<ConnectedDevice | undefined> => {
		try {
			const [deviceName] = endpoint.split(".");
			const url1 = `http://${deviceName}.local`;
			const url2 = `http://${host}`;

			const device = await Promise.any([
				createDevice(url1),
				createDevice(url2),
			]);

			if (!device) throw new Error("Failed to connect to device");

			const [batteryPercentage, hasAudio, hasLongRecording] = await Promise.all(
				[
					getBattery(device.url).catch(() => undefined),
					hasAudioCapabilities(device.url).catch(() => false),
					checkLongRecordingSupport(device.url).catch(() => false),
				],
			);

			return {
				...device,
				host,
				endpoint,
				batteryPercentage: batteryPercentage?.mainBattery,
				hasAudioCapabilities: hasAudio,
				hasLongRecordingSupport: hasLongRecording,
			};
		} catch (error) {
			console.error("Error in endpointToDevice:", error);
			return undefined;
		}
	};

	const manageModemIntervals = () => {
		const modemOnIntervals = new ReactiveMap<DeviceId, NodeJS.Timeout>();

		createEffect(
			on(
				() => devices,
				(devicesMap) => {
					for (const device of devicesMap.values()) {
						const interval = modemOnIntervals.get(device.id);

						if (device.isConnected) {
							if (!interval) {
								const id = setInterval(() => {
									DevicePlugin.turnOnModem({ url: device.url, minutes: "5" });
								}, 300000); // Every 5 minutes
								modemOnIntervals.set(device.id, id);
							}
						} else {
							if (interval) {
								clearInterval(interval);
								modemOnIntervals.delete(device.id);
							}
						}
					}
				},
			),
		);
	};

	function shouldConnectToDevice(newDevice: DeviceService): boolean {
		if (!newDevice) return false;

		if (connectingDevices.has(newDevice.endpoint)) {
			return false;
		}

		const existingDevice = [...devices.values()].find(
			(d) =>
				d.endpoint === newDevice.endpoint &&
				d.host === newDevice.host &&
				d.isConnected,
		);

		if (existingDevice) return false;

		return true;
	}

	async function verifyDeviceConnection(url: string): Promise<boolean> {
		try {
			const deviceInfoResult = await Effect.runPromise(
				Effect.retry(
					Effect.tryPromise(() => DevicePlugin.getDeviceInfo({ url })),
					{ times: 2, delay: 1000 },
				),
			).catch(() => ({ success: false }));

			return deviceInfoResult.success;
		} catch (error) {
			console.error("Connection verification failed:", error);
			return false;
		}
	}

	async function connectToDevice(newDevice: DeviceService) {
		try {
			const existingInProgressDevice = connectingDevices.get(
				newDevice.endpoint,
			);
			if (existingInProgressDevice) {
				console.log("Connection attempt in progress for this device");
				return;
			}

			connectingDevices.set(newDevice.endpoint, {
				host: newDevice.host,
				endpoint: newDevice.endpoint,
				timestamp: Date.now(),
			});

			const connectedDevice = await Effect.runPromise(
				Effect.retry(
					Effect.tryPromise<ConnectedDevice | undefined>(async () => {
						const device = await endpointToDevice(
							newDevice.endpoint,
							newDevice.host,
						);

						if (device) {
							const isReachable = await verifyDeviceConnection(device.url);
							if (!isReachable) {
								connectingDevices.delete(newDevice.endpoint);
								throw new Error("Device connection failed verification");
							}

							try {
								const [batteryInfo, hasAudio] = await Promise.all([
									getBattery(device.url),
									hasAudioCapabilities(device.url),
								]);

								return {
									...device,
									batteryPercentage: batteryInfo?.mainBattery,
									hasAudioCapabilities: hasAudio,
								};
							} catch (error) {
								connectingDevices.delete(newDevice.endpoint);
								throw error;
							}
						}
						return undefined;
					}),
					{ times: 3, delay: 2000 },
				),
			);

			connectingDevices.delete(newDevice.endpoint);

			if (connectedDevice) {
				await addConnectedDevice(connectedDevice);
				return connectedDevice;
			}
		} catch (error) {
			connectingDevices.delete(newDevice.endpoint);
			log.logError({
				error,
				message: `Unable to connect to discovered device: ${JSON.stringify(
					newDevice,
				)}`,
			});
		}
	}

	async function updateDeviceTypeAndLocation(
		device: ConnectedDevice,
		token: string,
	) {
		try {
			const typeRes = await CapacitorHttp.get({
				url: `${user.getServerUrl()}/api/v1/devices/${device.id}/type`,
				headers: { Authorization: token },
			});

			const typeData = z
				.object({ type: deviceTypes.optional() })
				.safeParse(typeRes.data);
			const currentType = typeData.success ? typeData.data.type : undefined;

			if (
				!currentType ||
				currentType === "unknown" ||
				(currentType === "thermal" && device.hasAudioCapabilities)
			) {
				const deviceLocation = await getLocationCoords(device.id);
				const updateData = {
					type: device.hasAudioCapabilities
						? "hybrid-thermal-audio"
						: "thermal",
					...(deviceLocation.success && {
						location: {
							lat: deviceLocation.data.latitude,
							lng: deviceLocation.data.longitude,
						},
					}),
				};

				await CapacitorHttp.post({
					url: `${user.getServerUrl()}/api/v1/devices/${device.id}/settings`,
					headers: {
						Authorization: token,
						"Content-Type": "application/json",
					},
					data: updateData,
				});
			}
		} catch (error) {
			console.error("Error updating device type/location:", error);
		}
	}

	const handleServiceResolved = async (newDevice: DeviceService) => {
		console.log("Found Device", newDevice);

		if (!shouldConnectToDevice(newDevice)) {
			console.log(
				"Not connecting to device - already connected or in progress",
				newDevice,
			);
			return undefined;
		}

		console.log("Connecting to device", newDevice);

		const device = await connectToDevice(newDevice);

		if (device?.isConnected) {
			const userData = user.data();
			if (userData?.token && apState() !== "connected") {
				await updateDeviceTypeAndLocation(device, userData.token);
			}
			return device;
		}

		return undefined;
	};

	const removeDeviceBySaltId = (saltId: string) => {
		for (const device of devices.values()) {
			if (device.saltId === saltId) {
				devices.delete(device.id);
				break;
			}
		}
	};

	const addConnectedDevice = async (connectedDevice: ConnectedDevice) => {
		if (connectedDevice.saltId) {
			for (const device of devices.values()) {
				if (
					device.saltId === connectedDevice.saltId &&
					device.id !== connectedDevice.id
				) {
					console.log(
						`Removing duplicate device with salt ID ${connectedDevice.saltId}`,
					);
					devices.delete(device.id);
					break;
				}
			}
		}

		const existingDevice = devices.get(connectedDevice.id);
		if (existingDevice) {
			devices.set(connectedDevice.id, {
				...existingDevice,
				...connectedDevice,
				isConnected: true,
				timeFound: existingDevice.timeFound || new Date(),
			});
		} else {
			devices.set(connectedDevice.id, connectedDevice);
		}

		log.logEvent("device_found", {
			name: connectedDevice.name,
			saltId: connectedDevice.saltId,
			group: connectedDevice.group,
		});

		await Promise.all([
			clearUploaded(connectedDevice),
			turnOnModem(connectedDevice.id),
			deviceHasInternet(connectedDevice.id), // Proactively populate internet connection cache
			preloadNetworkData(connectedDevice.id), // Proactively populate WiFi and modem data cache
		]);
	};

	const handleServiceLost = async (lostDevice: { endpoint: string }) => {
		const device = [...devices.values()].find(
			(d) => d.endpoint === lostDevice.endpoint && d.isConnected,
		);

		if (device) {
			// Check both URL and host connections before disconnecting
			const [urlReachable, hostReachable] = await Promise.all([
				verifyDeviceConnection(device.url),
				verifyDeviceConnection(`http://${device.host}`),
			]);

			// Only disconnect if both connection methods fail
			if (!urlReachable && !hostReachable) {
				devices.set(device.id, {
					...device,
					isConnected: false,
				});
				internetConnectionCache.delete(device.id); // Clear cache entry
				wifiInternetConnectionCache.delete(device.id); // Clear WiFi internet cache
				modemInternetConnectionCache.delete(device.id); // Clear modem internet cache

				log.logEvent("device_lost", {
					name: device.name,
					saltId: device.saltId,
					group: device.group,
				});
			} else {
				// Device is still reachable via one of the methods
				console.log(`Device ${device.name} reported as lost but still reachable via ${urlReachable ? 'URL' : 'host'}`);
			}
		}
	};

	const handleServiceResolvedFailed = (service: {
		errorCode: string;
		endpoint: string;
		message: string;
	}) => {
		console.log("FAILED SERVICE", service);
		log.logWarning({
			message:
				"Found device but unable to connect. Please restart the device or contact support if it persists.",
			details: `${service.endpoint} - Error Code: ${service.errorCode} - Details: ${service.message}`,
			warn: false,
		});
	};

	const [checkingAP, setCheckingAP] = createSignal(false);

	// Remove the polling mechanism and rely on native event listeners
	const monitorAPConnection = async () => {
		// Initial check to set the correct state at startup
		try {
			const res = await DevicePlugin.checkIsAPConnected();
			// Always initialize to "default" if not connected to enable the Connect button
			setApState(res.connected ? "connected" : "default");
		} catch (error) {
			// Always initialize to "default" on error to enable the Connect button
			setApState("default");
		}
		// No need to set up interval - native plugin now handles monitoring
	};

	const handleDiscoveryStateChanged = (res: { state: string }) => {
		console.log(`Discovery state changed: ${res.state}`);
		if (res.state === "ACTIVE") {
			setIsDiscovering(true);
		} else if (["INACTIVE", "FAILED"].includes(res.state)) {
			setIsDiscovering(false);
		}
	};

	const handleDiscoveryError = (res: { error: string; fatal: boolean }) => {
		log.logWarning({
			message: `Discovery error: ${res.error}`,
			warn: !res.fatal,
		});

		if (res.fatal) {
			setIsDiscovering(false);
		}
	};

	const handleAPStateChanged = (res: { state: string }) => {
		console.log(`AP connection state changed: ${res.state}`);
		switch (res.state) {
			case "CONNECTING":
				setApState("loadingConnect");
				break;
			case "CONNECTED":
				setApState("connected");
				break;
			case "DISCONNECTING":
				setApState("loadingDisconnect");
				break;
			case "DISCONNECTED":
				setApState("disconnected");
				break;
			default:
				setApState("default");
				break;
		}
	};

	const handleAPConnected = (res: { status: string }) => {
		log.logEvent("AP_connected");
		setApState("connected");
		searchDevice();
	};

	const handleAPDisconnected = (res: { status: string }) => {
		log.logEvent("AP_disconnect");
		setApState("disconnected");
	};

	const handleAPConnectionFailed = (res: {
		status: string;
		error: string;
		canRetry: boolean;
	}) => {
		log.logEvent("AP_failed");
		log.logWarning({
			message:
				res.error ||
				"Please try again, or connect to 'bushnet' with password 'feathers' in your wifi settings. Alternatively, set up a hotspot named 'bushnet' password: 'feathers'.",
			warn: false,
		});
		setApState("default");
	};

	const handleAPConnectionLost = (res: { status: string }) => {
		log.logEvent("AP_lost");
		log.logWarning({
			message: "Connection to device was lost. Please try reconnecting.",
			warn: false,
		});
		setApState("disconnected");
	};

	const setupListeners = async () => {
		const serviceResolvedListener = await DevicePlugin.addListener(
			"onServiceResolved",
			handleServiceResolved,
		);
		const serviceResolveFailedListener = await DevicePlugin.addListener(
			"onServiceResolveFailed",
			handleServiceResolvedFailed,
		);
		const serviceLostListener = await DevicePlugin.addListener(
			"onServiceLost",
			handleServiceLost,
		);

		const discoveryStateListener = await DevicePlugin.addListener(
			"onDiscoveryStateChanged",
			handleDiscoveryStateChanged,
		);
		const discoveryErrorListener = await DevicePlugin.addListener(
			"onDiscoveryError",
			handleDiscoveryError,
		);

		const apStateChangedListener = await DevicePlugin.addListener(
			"onAPConnectionStateChanged",
			handleAPStateChanged,
		);
		const apConnectedListener = await DevicePlugin.addListener(
			"onAPConnected",
			handleAPConnected,
		);
		const apDisconnectedListener = await DevicePlugin.addListener(
			"onAPDisconnected",
			handleAPDisconnected,
		);
		const apConnectionFailedListener = await DevicePlugin.addListener(
			"onAPConnectionFailed",
			handleAPConnectionFailed,
		);
		const apConnectionLostListener = await DevicePlugin.addListener(
			"onAPConnectionLost",
			handleAPConnectionLost,
		);

		setListeners([
			serviceResolvedListener,
			serviceLostListener,
			serviceResolveFailedListener,
			discoveryStateListener,
			discoveryErrorListener,
			apStateChangedListener,
			apConnectedListener,
			apDisconnectedListener,
			apConnectionFailedListener,
			apConnectionLostListener,
		]);
	};

	const removeAllListeners = () => {
		for (const listener of listeners()) {
			listener.remove();
		}
		setListeners([]);
	};

	const cleanupListeners = () => {
		removeAllListeners();
	};

	const clearOldDevices = () => {
		const now = Date.now();
		for (const device of devices.values()) {
			const timeDiff = now - device.timeFound.getTime();
			if (!device.isConnected && timeDiff > 60 * 1000 * 1) {
				devices.delete(device.id);
			}
		}
	};

	const getDeviceInfo = (url: string) =>
		Effect.tryPromise({
			try: () => DevicePlugin.getDeviceInfo({ url }),
			catch: (unknown) =>
				new Error(`Could not get device information: ${unknown}`),
		});

	const [searchParams, setSearchParams] = useSearchParams();
	const CONNECTION_CHECK_INTERVAL = 15000;
	const CONNECTION_RETRY_ATTEMPTS = 5;
	const CONNECTION_RETRY_DELAY = 2000;
	const DISCOVERY_INTERVAL = 30000;

	const checkDeviceConnection = async (
		device: Device,
	): Promise<ConnectedDevice | undefined> => {
		if (!device.isConnected) {
			return undefined;
		}
		if (device.url === "fakeHost") {
			return device;
		}

		const isConnected = await verifyDeviceConnection(device.url);

		if (isConnected) {
			try {
				const deviceInfo = await Effect.runPromise(
					Effect.retry(getDeviceInfo(device.url), {
						times: CONNECTION_RETRY_ATTEMPTS,
						delay: CONNECTION_RETRY_DELAY,
					}),
				);

				if (deviceInfo.success) {
					const data = JSON.parse(deviceInfo.data);
					const info = DeviceInfoSchema.safeParse(data);

					if (info.success) {
						const [battery, hasAudio, hasLongRecording] = await Promise.all([
							getBattery(device.url).catch(() => undefined),
							hasAudioCapabilities(device.url).catch(
								() => device.hasAudioCapabilities,
							),
							checkLongRecordingSupport(device.url).catch(
								() => device.hasLongRecordingSupport ?? false,
							),
						]);

						const newId = info.data.deviceID.toString();
						if (newId !== device.id) {
							devices.delete(device.id);

							if (searchParams.deviceSettings === device.id) {
								setSearchParams({ deviceSettings: newId });
							} else if (searchParams.setupDevice === device.id) {
								setSearchParams({ setupDevice: newId });
							}
						}

						const updatedDevice: ConnectedDevice = {
							...device,
							id: newId,
							name: info.data.devicename,
							lastUpdated: info.data.lastUpdated
								? new Date(info.data.lastUpdated)
								: device.lastUpdated,
							batteryPercentage: battery?.mainBattery,
							isConnected: true,
							hasAudioCapabilities: hasAudio,
							hasLongRecordingSupport: hasLongRecording,
						};

						devices.set(newId, updatedDevice);
						return updatedDevice;
					}
				}
			} catch (error) {
				console.error("Error refreshing device info:", error);
			}
		}

		if (device.isConnected) {
			devices.set(device.id, { ...device, isConnected: false });
			log.logEvent("device_disconnected", {
				name: device.name,
				saltId: device.saltId,
				group: device.group,
			});
		}

		return undefined;
	};

	const hasAudioCapabilities = async (url: string) => {
		try {
			const res = await getAudioMode(url);
			if (res !== null) return true;
		} catch (error) {
			console.error(error);
			return false;
		}
		return false;
	};

	const startDiscovery = async () => {
		if (isDiscovering()) {
			console.log("Discovery already in progress");
			return;
		}

		try {
			// Check for local network permissions before starting discovery
			if (Capacitor.getPlatform() === "ios") {
				const perm = await DevicePlugin.checkPermissions();
				if (!perm.granted) {
					console.warn(
						"Local Network permission not granted. Device discovery will not start.",
					);
					// Optionally, notify the user or update a state here
					// For now, just prevent discovery.
					setIsDiscovering(false); // Ensure state reflects discovery is not active
					return;
				}
			}

			await DevicePlugin.discoverDevices();
			setIsDiscovering(true);

			clearOldDevices();

			// Focus only on checking existing devices individually
			const existingDevices = [...devices.values()];
			for (const device of existingDevices) {
				await checkDeviceConnection(device);
			}
		} catch (error) {
			console.error("Error starting discovery:", error);
			setIsDiscovering(false);
			log.logError({
				error,
				message: "Error during device discovery",
				warn: false,
			});
		}
	};

	const stopDiscovery = async () => {
		try {
			await DevicePlugin.stopDiscoverDevices();
		} catch (e) {
			console.error("Error stopping discovery:", e);
			if (e instanceof Error && e.message.includes("listener not registered")) {
				await setupListeners();
			}
		}
	};

	let isSearching = false;
	const searchDevice = async () => {
		if (isSearching) return;
		try {
			isSearching = true;
			await stopDiscovery();

			// Add a small delay to ensure proper cleanup before restarting discovery
			await new Promise((resolve) => setTimeout(resolve, 200));

			await startDiscovery();
		} catch (e) {
			console.error(e);
		} finally {
			isSearching = false;
		}
	};

	manageModemIntervals();

	onMount(async () => {
		await setupListeners();
		await monitorAPConnection(); // Just does the initial check now
		await searchDevice();
		const searchInterval = setInterval(searchDevice, DISCOVERY_INTERVAL);

		onCleanup(() => {
			clearInterval(searchInterval);
			cleanupListeners();
		});
	});

	const Authorization = "Basic YWRtaW46ZmVhdGhlcnM=";
	const headers = { Authorization: Authorization };

	const getRecordings = async (
		device: ConnectedDevice,
	): Promise<string[] | null> => {
		try {
			if ((await Filesystem.checkPermissions()).publicStorage === "denied") {
				const permission = await Filesystem.requestPermissions();
				if (permission.publicStorage === "denied") {
					return null;
				}
			}
			const { url } = device;
			const res = await DevicePlugin.getRecordings({ url });
			const audioRes = await fetch(`${url}/api/audio/recordings`, {
				method: "GET",
				headers,
			});
			const thermalRecordings = res.success ? res.data : null;
			const audioRecordings = audioRes.ok
				? ((await audioRes.json().catch(() => null)) ?? null)
				: null;
			return thermalRecordings === null && audioRecordings !== null
				? audioRecordings
				: thermalRecordings !== null && audioRecordings === null
					? thermalRecordings
					: thermalRecordings !== null && audioRecordings !== null
						? thermalRecordings.concat(audioRecordings)
						: null;
		} catch (error) {
			log.logError({
				message: "Could not get recordings",
				error,
			});
			return null;
		}
	};

	const deleteUploadedRecordings = async (device: ConnectedDevice) => {
		try {
			const { url } = device;
			if (!device.isConnected) return;
			const currDeviceRecordings = await getRecordings(device);
			const savedRecordings = await storage.getSavedRecordings({
				device: device.id,
			});
			if (currDeviceRecordings === null) return;
			for (const rec of savedRecordings) {
				if (currDeviceRecordings?.includes(rec.name)) {
					if (rec.isUploaded) {
						const res: HttpResponse = await CapacitorHttp.delete({
							url: `${url}/api/recording/${rec.name}`,
							headers,
							webFetchExtra: {
								credentials: "include",
							},
						});
						if (res.status !== 200) continue;
						await storage.deleteRecording(rec);
					}
				} else {
					await storage.deleteRecording(rec);
				}
			}
		} catch (error) {
			if (error instanceof Error) {
				log.logError({
					message: "Could not delete recordings",
					error,
				});
			} else {
				log.logWarning({
					message: "Could not delete recordings",
					details: JSON.stringify(error),
				});
			}
		}
	};

	const saveRecordings = async (device: ConnectedDevice) => {
		const recs = deviceRecordings.get(device.id);
		const savedRecs = storage.savedRecordings();
		if (!recs) return;
		const nonSavedRecs = recs.filter(
			(r) => !savedRecs.find((s) => s.name === r && s.device === device.id),
		);
		if (!nonSavedRecs.length) return;

		for (const rec of nonSavedRecs) {
			if (!devicesDownloading.has(device.id)) return;
			const res = await DevicePlugin.downloadRecording({
				url: device.url,
				recordingPath: rec,
			});
			if (!res.success) {
				log.logWarning({
					message: "Could not download recording",
					details: res.message,
					warn: false,
				});
				continue;
			}
			const data = await storage?.saveRecording({
				...device,
				filename: rec,
				path: res.data.path,
				size: res.data.size,
				isProd: device.isProd,
			});
			if (!data) continue;
		}
		await setCurrRecs(device);
		const recordings = storage
			.savedRecordings()
			.filter((rec) => rec.device === device.id && !rec.isUploaded);
		if (recordings) {
			saveRecordings(device);
		}
	};

	const getEventKeys = async (device: ConnectedDevice) => {
		try {
			const { url } = device;
			const res = await DevicePlugin.getEventKeys({ url });
			if (!res.success) return [];
			const events = res.data;
			return events;
		} catch (error) {
			if (error instanceof Error) {
				log.logError({
					message: "Could not get events",
					details: error.message,
					error,
				});
			}
			return null;
		}
	};

	const deleteUploadedEvents = async (device: ConnectedDevice) => {
		try {
			const { url } = device;
			const currEvents = await getEventKeys(device);
			if (currEvents === null) return;
			const savedEvents = await storage.getSavedEvents({
				device: device.id,
			});
			const eventsToDel = savedEvents.filter(
				(event) => currEvents.includes(Number(event.key)) && event.isUploaded,
			);
			const keys = eventsToDel.map((event) => Number(event.key));
			if (keys.length !== 0) {
				const res = await DevicePlugin.deleteEvents({
					url,
					keys: JSON.stringify(keys),
				});
				if (!res.success) return;
			}

			const deletedEvents = [
				...savedEvents.filter(
					(event) => !currEvents.includes(Number(event.key)),
				),
				...eventsToDel,
			];
			await storage.deleteEvents({ events: deletedEvents });
		} catch (error) {
			log.logError({
				message: "Could not delete events",
				error,
			});
		}
	};

	const eventSchema = z.record(
		z.string(),
		z.object({
			event: z.object({
				Type: z.string(),
				Timestamp: z.string(),
				Details: z.any(),
			}),
			success: z.boolean(),
		}),
	);

	const getEvents = async (device: ConnectedDevice, keys: number[]) => {
		try {
			const { url } = device;
			const res = await DevicePlugin.getEvents({
				url,
				keys: JSON.stringify(keys),
			});
			if (!res.success) return [];
			const json = JSON.parse(res.data);
			const events = eventSchema.safeParse(json);
			if (!events.success) return [];

			const eventsWithDevice = Object.entries(events.data).map(
				([key, value]) => ({
					...value.event,
					key,
					device: device.id,
					isProd: device.isProd,
				}),
			);
			return eventsWithDevice;
		} catch (error) {
			log.logError({
				message: "Could not get events",
				error,
			});
			return [];
		}
	};

	const saveEvents = async (device: ConnectedDevice) => {
		const eventKeys = await getEventKeys(device);
		deviceEventKeys.set(device.id, eventKeys ?? []);
		if (!eventKeys) return;
		const savedEvents = storage.savedEvents();
		const events = await getEvents(
			device,
			eventKeys.filter(
				(key) => !savedEvents.find((event) => event.key === key.toString()),
			),
		);
		for (const event of events) {
			storage?.saveEvent({
				key: Number.parseInt(event.key),
				device: device.id,
				isProd: device.isProd,
				type: event.Type,
				timestamp: event.Timestamp,
				details: JSON.stringify(event.Details),
			});
		}
	};

	const saveItems = async (deviceId: DeviceId) => {
		const device = devices.get(deviceId);
		if (!device || !device.isConnected) return;
		const { id } = device;
		const isSupported = await KeepAwake.isSupported();
		if (isSupported) {
			await KeepAwake.keepAwake();
		}
		devicesDownloading.add(id);
		await Promise.all([setCurrRecs(device), setCurrEvents(device)]);
		await Promise.all([saveRecordings(device), saveEvents(device)]);
		log.logSuccess({
			message: `Successfully saved recordings and events for ${device.name}.`,
		});
		devicesDownloading.delete(id);
		if (isSupported) {
			await KeepAwake.allowSleep();
		}
	};

	const stopSaveItems = async (deviceId: DeviceId) => {
		devicesDownloading.delete(deviceId);
	};

	// Accept both string and number for lat/lng/alt/accuracy, and transform to number
	const numish = z
		.union([z.string(), z.number()])
		.transform((v) => (typeof v === "string" ? Number.parseFloat(v) : v));
	const locationSchema = z.object({
		latitude: numish,
		longitude: numish,
		altitude: numish.optional().default(0),
		// treat missing / 0 / NaN accuracy as “unknown” = 100 m
		accuracy: numish
			.optional()
			.transform((v) => (v && v > 0 ? v : 100))
			.default(100),
		timestamp: z
			.string()
			.or(z.number())
			.transform((v) => (typeof v === "number" ? Math.round(v).toString() : v)),
	});

	const LOCATION_ERROR =
		"Please ensure location is enabled, and permissions are granted";
	const setDeviceToCurrLocation = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return;
			let permission = await Geolocation.requestPermissions();
			if (permission.location === "prompt-with-rationale") {
				permission = await Geolocation.checkPermissions();
			}
			if (permission.location !== "granted") return;
			locationBeingSet.add(device.id);
			const { timestamp, coords } = await Geolocation.getCurrentPosition({
				enableHighAccuracy: true,
			});
			// Clamp accuracy to a minimum of 5m so we never pass 0 down
			const safeCoords = {
				...coords,
				accuracy: coords.accuracy && coords.accuracy > 5 ? coords.accuracy : 5,
			};
			const location = locationSchema.safeParse({ ...safeCoords, timestamp });
			if (!location.success) {
				locationBeingSet.delete(device.id);
				log.logWarning({
					message: LOCATION_ERROR,
					details: location.error.message,
				});
				return;
			}
			// Ensure all fields are strings for DevicePlugin.setDeviceLocation
			const options = {
				url: device.url,
				latitude: location.data.latitude.toString(),
				longitude: location.data.longitude.toString(),
				altitude: location.data.altitude?.toString() ?? "0",
				accuracy: location.data.accuracy?.toString() ?? "100",
				timestamp: location.data.timestamp,
			};
			const res = await DevicePlugin.setDeviceLocation(options);
			if (res.success) {
				tryUpdateServerLocation(deviceId, {
					lat: Number(location.data.latitude),
					lng: Number(location.data.longitude),
				});
				devices.set(device.id, {
					...device,
					locationSet: true,
				});
				log.logSuccess({
					message: `Successfully set location for ${device.name}.`,
					timeout: 6000,
				});
			}
			locationBeingSet.delete(device.id);
		} catch (error) {
			if (error instanceof Error) {
				log.logWarning({
					message: LOCATION_ERROR,
					details: error.message,
				});
			}
			locationBeingSet.delete(deviceId);
		}
	};

	const tryUpdateServerLocation = async (
		deviceId: string,
		location: { lat: number; lng: number },
	) => {
		// Skip server update if connected to device AP (no internet)
		if (apState() === "connected") {
			console.log("Skipping server location update - connected to device AP");
			return;
		}

		try {
			const updateData = { location };
			const userData = user.data();
			if (userData) {
				const url = user.getServerUrl();
				await CapacitorHttp.post({
					url: `${url}/api/v1/devices/${deviceId}/settings`,
					method: "POST",
					headers: {
						Authorization: userData.token,
						"Content-Type": "application/json",
					},
					data: updateData,
				});
			}
		} catch (e) {
			console.error(e);
		}
	};

	const getLocationCoords = async (
		device: DeviceId,
	): Result<DeviceCoords<number>> => {
		try {
			const deviceObj = devices.get(device);

			if (!deviceObj || !deviceObj.isConnected) {
				return {
					success: false,
					message: "Device is not connected",
				};
			}

			const { url } = deviceObj;

			// Use the same relaxed schema as above
			const numish = z
				.union([z.string(), z.number()])
				.transform((v) => (typeof v === "string" ? Number.parseFloat(v) : v));
			const locationSchema = z.object({
				latitude: numish,
				longitude: numish,
				altitude: numish.optional().default(0),
				accuracy: numish
					.optional()
					.transform((v) => (v && v > 0 ? v : 100))
					.default(100),
				timestamp: z.string(),
			});

			const res = await DevicePlugin.getDeviceLocation({ url });

			if (res.success) {
				const location = locationSchema.safeParse(JSON.parse(res.data));
				if (!location.success) {
					return {
						success: false,
						message: location.error.message,
					};
				}
				tryUpdateServerLocation(device, {
					lat: location.data.latitude,
					lng: location.data.longitude,
				});
				return {
					success: true,
					data: location.data,
				};
			}
			return {
				success: false,
				message: "Could not get location",
			};
		} catch (error) {
			return {
				success: false,
				message: "Could not get location",
			};
		}
	};

	const getLocationByDevice = (deviceId: DeviceId) =>
		createResource(
			() => [storage.savedLocations(), devices.get(deviceId)] as const,
			async (data): Promise<Location | null> => {
				try {
					const [locations, device] = data;
					if (!device || !locations?.length || !device.isConnected) return null;
					const deviceLocation = await getLocationCoords(device.id);
					if (!deviceLocation.success) return null;
					const sameGroupLocations = locations.filter(
						(loc) =>
							loc.groupName === device.group && loc.isProd === device.isProd,
					);
					const location = sameGroupLocations.filter((loc) =>
						isWithinRange(
							[loc.coords.lat, loc.coords.lng],
							[deviceLocation.data.latitude, deviceLocation.data.longitude],
							deviceLocation.data.accuracy,
						),
					);

					if (!location.length) return null;
					return location.sort(
						(a, b) =>
							new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
					)[0];
				} catch (error) {
					if (error instanceof Error) {
						log.logError({
							message: "Could not get location",
							details: error.message,
							error,
						});
					} else {
						log.logWarning({
							message: "Could not get location",
							details: `${error}`,
						});
					}
					return null;
				}
			},
		);

	const [permission, { refetch: refetchLocationPermission }] = createResource(
		async () => {
			try {
				let permission = await Geolocation.checkPermissions();
				if (
					permission.location === "denied" ||
					permission.location === "prompt" ||
					permission.location === "prompt-with-rationale"
				) {
					permission = await Geolocation.requestPermissions();
					if (permission.location === "prompt-with-rationale") {
						permission = await Geolocation.checkPermissions();
					}
				}
				return permission.location;
			} catch (e) {
				return "denied";
			}
		},
	);

	const [locationDisabled, setLocationDisabled] = createSignal(false);
	const [devicesLocToUpdate, { refetch: refetchDeviceLocToUpdate }] =
		createResource(
			() => {
				// Add locationBeingSet to dependencies by spreading into a new Set
				return [
					[...devices.values()],
					permission(),
					new Set(locationBeingSet),
				] as const;
			},
			async ([deviceList, perm, currentlySettingLocations]) => {
				try {
					const devicesToFilter = deviceList.filter(
						({ isConnected }) => isConnected,
					);
					if (!devicesToFilter || devicesToFilter.length === 0 || !perm)
						return [];
					if (perm === "denied") return [];
					const pos = await Geolocation.getCurrentPosition({
						enableHighAccuracy: true,
					}).catch((e) => {
						console.log("Error", e);
						if (e instanceof Error && e.message === "location disabled") {
							setLocationDisabled(true);
						}
						return null;
					});
					if (!pos) return [];
					setLocationDisabled(false);

					const devicesToUpdate: string[] = [];
					for (const device of devicesToFilter) {
						if (!device.isConnected) continue;
						// Skip if location is currently being set for this device
						if (currentlySettingLocations.has(device.id)) {
							continue;
						}
						const locationRes = await getLocationCoords(device.id);
						if (!locationRes.success) continue;
						const loc = locationRes.data;
						const newLoc: [number, number] = [
							pos.coords.latitude,
							pos.coords.longitude,
						];

						const withinRange = isWithinRange(
							[loc.latitude, loc.longitude],
							newLoc,
							UPDATE_DISTANCE_THRESHOLD_METERS,
						);
						if (!withinRange) {
							devicesToUpdate.push(device.id);
						}
					}
					return devicesToUpdate;
				} catch (error) {
					if (error instanceof Error) {
						log.logWarning({
							message:
								"Could not update device locations. Check location permissions and try again.",
							action: <GoToPermissions />,
						});
					} else if (typeof error === "string") {
						log.logWarning({
							message: "Could not update device locations",
							details: error,
						});
					}

					return [];
				}
			},
		);

	type DeviceLocationStatus =
		| "loading"
		| "current"
		| "needsUpdate"
		| "unavailable";
	const shouldDeviceUpdateLocation = (
		deviceId: DeviceId,
	): DeviceLocationStatus => {
		const devicesToUpdate = devicesLocToUpdate();
		if (!devicesToUpdate?.length)
			return permission() === "denied" ? "unavailable" : "current";
		const updateDevice = devicesToUpdate.includes(deviceId)
			? "needsUpdate"
			: "current";
		return updateDevice;
	};

	const preloadNetworkData = async (deviceId: DeviceId) => {
		// Proactively fetch and cache WiFi networks, current WiFi, saved networks, modem data, and internet connectivity
		// This prevents the UI from showing loading states when the user opens network settings
		try {
			await Promise.allSettled([
				getWifiNetworks(deviceId),
				getCurrentWifiNetwork(deviceId),
				getSavedWifiNetworks(deviceId),
				getModem(deviceId),
				checkDeviceWifiInternetConnection(deviceId),
				checkDeviceModemInternetConnection(deviceId),
			]);
		} catch (error) {
			console.error("Error preloading network data:", error);
		}
	};

	const backgroundRefreshNetworkData = async (deviceId: DeviceId) => {
		// Background refresh without invalidating cache - "stale-while-revalidate" pattern
		// UI continues showing cached data while fresh data loads in background
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return;

			// Make fresh API calls that will update cache if data has changed
			// These will bypass cache timeouts but won't clear existing cache first
			const { url } = device;
			
			// Fetch fresh data in parallel
			await Promise.allSettled([
				// Force fresh network data by making direct API calls
				CapacitorHttp.get({ url: `${url}/api/network/wifi`, headers, webFetchExtra: { credentials: "include" } })
					.then(res => res.status === 200 ? WifiNetwork.array().parse(JSON.parse(res.data)) : [])
					.then(networks => {
						const processedNetworks = networks
							.filter(network => network.SSID)
							.reduce((acc, curr) => {
								const found = acc.find(a => a.SSID === curr.SSID);
								if (!found) acc.push(curr);
								return acc;
							}, [] as WifiNetwork[]);
						availableWifiNetworksCache.set(deviceId, { networks: processedNetworks, timestamp: Date.now() });
					})
					.catch(() => {}),

				// Fresh current WiFi status
				CapacitorHttp.get({ url: `${url}/api/network/wifi/current`, headers, webFetchExtra: { credentials: "include" } })
					.then(res => res.status === 200 ? z.object({ SSID: z.string() }).parse(JSON.parse(res.data)) : null)
					.then(network => currentWifiNetworkCache.set(deviceId, { network, timestamp: Date.now() }))
					.catch(() => {}),

				// Fresh modem data
				CapacitorHttp.get({ url: `${url}/api/modem`, headers, webFetchExtra: { credentials: "include" } })
					.then(res => res.status === 200 ? tc2ModemSchema.parse(res.data) : null)
					.then(modem => modemDetailsCache.set(deviceId, { modem, timestamp: Date.now() }))
					.catch(() => {}),

				// Fresh WiFi internet connectivity
				CapacitorHttp.get({ url: `${url}/api/wifi-check`, headers, webFetchExtra: { credentials: "include" } })
					.then(res => {
						let connected = false;
						if (res.status === 200) {
							const parsedData = JSON.parse(res.data);
							if (typeof parsedData.connected === "boolean") {
								connected = parsedData.connected;
							}
						}
						wifiInternetConnectionCache.set(deviceId, { connected, timestamp: Date.now() });
					})
					.catch(() => {}),

				// Fresh modem internet connectivity
				CapacitorHttp.get({ url: `${url}/api/modem-check`, headers, webFetchExtra: { credentials: "include" } })
					.then(res => res.status === 200 ? JSON.parse(res.data).connected : false)
					.then(connected => modemInternetConnectionCache.set(deviceId, { connected, timestamp: Date.now() }))
					.catch(() => {}),
			]);
		} catch (error) {
			console.error("Error in background network refresh:", error);
		}
	};

	const getWifiNetworks = async (
		deviceId: DeviceId,
	): Promise<WifiNetwork[] | null> => {
		const cached = availableWifiNetworksCache.get(deviceId);
		if (
			cached &&
			Date.now() - cached.timestamp < NETWORK_DATA_CACHE_DURATION_MS
		) {
			return cached.networks;
		}
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return []; // Keep returning [] for this case for now
			const { url } = device;
			const res = await CapacitorHttp.get({
				url: `${url}/api/network/wifi`,
				headers,
				webFetchExtra: {
					credentials: "include",
				},
				connectTimeout: 5000, // Added timeout
				readTimeout: 5000, // Added timeout
			});
			if (res.status !== 200) {
				availableWifiNetworksCache.set(deviceId, {
					networks: null,
					timestamp: Date.now(),
				});
				return null;
			}
			const networks = WifiNetwork.array().parse(JSON.parse(res.data));
			const processedNetworks = networks
				? networks
					.filter((network) => network.SSID)
					.reduce((acc, curr) => {
						const found = acc.find((a) => a.SSID === curr.SSID);
						if (!found) {
							acc.push(curr);
						}
						return acc;
					}, [] as WifiNetwork[])
				: [];
			availableWifiNetworksCache.set(deviceId, {
				networks: processedNetworks,
				timestamp: Date.now(),
			});
			return processedNetworks;
		} catch (e) {
			console.error("Error in getWifiNetworks:", e);
			availableWifiNetworksCache.set(deviceId, {
				networks: [],
				timestamp: Date.now(),
			}); // Cache empty on error
			return []; // Keep returning [] for this case for now
		}
	};

	const getCurrentWifiNetwork = async (
		deviceId: DeviceId,
	): Promise<{ SSID: string } | null> => {
		const cached = currentWifiNetworkCache.get(deviceId);
		if (
			cached &&
			Date.now() - cached.timestamp < NETWORK_DATA_CACHE_DURATION_MS
		) {
			return cached.network;
		}
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return null;
			const { url } = device;

			const res = await CapacitorHttp.get({
				url: `${url}/api/network/wifi/current`,
				headers,
				webFetchExtra: { credentials: "include" },
				connectTimeout: 3000,
				readTimeout: 3000,
			});

			if (res.status !== 200) {
				currentWifiNetworkCache.set(deviceId, {
					network: null,
					timestamp: Date.now(),
				});
				return null;
			}

			const network = z
				.object({ SSID: z.string() })
				.safeParse(JSON.parse(res.data));

			const result = network.success ? network.data : null;
			currentWifiNetworkCache.set(deviceId, {
				network: result,
				timestamp: Date.now(),
			});
			return result;
		} catch (error) {
			console.error("Error in getCurrentWifiNetwork:", error);
			currentWifiNetworkCache.set(deviceId, {
				network: null,
				timestamp: Date.now(),
			});
			return null;
		}
	};

	const saveWifiNetwork = async (
		deviceId: DeviceId,
		ssid: string,
		password: string,
	) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return false;
			const { url } = device;
			log.logEvent("device_wifi_connect");
			const res = await CapacitorHttp.post({
				url: `${url}/api/network/wifi/save`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
				data: { ssid, password },
			});
			const success = res.status === 200;
			if (success) {
				savedWifiNetworksCache.delete(deviceId);
				// Optionally, also invalidate currentWifiNetworkCache and availableWifiNetworksCache
				// if saving a network implies it might become the current one or appear in the list.
				// For now, just savedWifiNetworksCache as it's the most direct impact.
			}
			return success;
		} catch (error) {
			console.error("Error in saveWifiNetwork:", error);
			return false;
		}
	};

	const saveAPN = async (deviceId: DeviceId, apn: string) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return false;
			const { url } = device;
			const res = await CapacitorHttp.post({
				url: `${url}/api/modem/apn`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
				data: { apn },
			});
			const success = res.status === 200;
			if (success) {
				internetConnectionCache.delete(deviceId);
				modemDetailsCache.delete(deviceId); // APN affects modem behavior
				modemInternetConnectionCache.delete(deviceId); // Invalidate modem internet cache
			}
			return success;
		} catch (error) {
			console.error("Error in saveAPN:", error);
			return false;
		}
	};

	const AP_CHECK_RETRIES = 3;
	const AP_CHECK_RETRY_DELAY = 20000;

	const LimePercent = [
		0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
		21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
		40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58,
		59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77,
		78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96,
		97, 98, 99, 100,
	];
	const LimeVoltage = [
		30.0, 30.1, 30.2, 30.4, 30.5, 30.6, 30.7, 30.8, 31.0, 31.1, 31.2, 31.3,
		31.4, 31.6, 31.7, 31.8, 31.9, 32.0, 32.2, 32.3, 32.4, 32.5, 32.6, 32.8,
		32.9, 33.0, 33.1, 33.2, 33.4, 33.5, 33.6, 33.7, 33.8, 34.0, 34.1, 34.2,
		34.3, 34.4, 34.6, 34.7, 34.8, 34.9, 35.0, 35.2, 35.3, 35.4, 35.5, 35.6,
		35.8, 35.9, 36.0, 36.1, 36.2, 36.4, 36.5, 36.6, 36.7, 36.8, 37.0, 37.1,
		37.2, 37.3, 37.4, 37.6, 37.7, 37.8, 37.9, 38.0, 38.2, 38.3, 38.4, 38.5,
		38.6, 38.8, 38.9, 39.0, 39.1, 39.2, 39.4, 39.5, 39.6, 39.7, 39.8, 40.0,
		40.1, 40.2, 40.3, 40.4, 40.6, 40.7, 40.8, 40.9, 41.0, 41.2, 41.3, 41.4,
		41.5, 41.6, 41.8, 41.9, 42.0,
	];

	function interpolateVoltageToPercentage(
		voltage: number,
		voltageArray: number[],
		percentageArray: number[],
	): number {
		if (voltage <= voltageArray[0]) return percentageArray[0];
		if (voltage >= voltageArray[voltageArray.length - 1])
			return percentageArray[percentageArray.length - 1];

		for (let i = 0; i < voltageArray.length - 1; i++) {
			if (voltage >= voltageArray[i] && voltage <= voltageArray[i + 1]) {
				const voltageRange = voltageArray[i + 1] - voltageArray[i];
				const percentageRange = percentageArray[i + 1] - percentageArray[i];
				const voltageOffset = voltage - voltageArray[i];
				return (
					percentageArray[i] + (voltageOffset / voltageRange) * percentageRange
				);
			}
		}

		throw new Error("Unable to interpolate voltage to percentage");
	}

	const dataSchema = z
		.object({
			time: z.string(),
			mainBattery: z.string(),
			mainBatteryLow: z.string(),
			rtcBattery: z.string(),
		})
		.transform((data) => ({
			time: new Date(data.time),
			mainBattery: Number(
				interpolateVoltageToPercentage(
					Number(data.mainBattery.replace(/\s/g, "")),
					LimeVoltage,
					LimePercent,
				),
			).toFixed(0),
			mainBatteryLow: Number(data.mainBatteryLow),
			rtcBattery: Number(data.rtcBattery),
		}));

	const getBattery = async (url: URL) => {
		try {
			const res = await CapacitorHttp.get({
				url: `${url}/api/battery`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
			});
			if (res.status !== 200) return;
			const parsedBattery = dataSchema.safeParse(JSON.parse(res.data)).data;
			return parsedBattery;
		} catch (e) {
			console.error(e);
			return;
		}
	};

	const devicesConnectingToWifi = new ReactiveMap();
	const disconnectFromWifi = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return false;
			const { url } = device;
			log.logEvent("device_wifi_disconnect");
			const res = await CapacitorHttp.delete({
				url: `${url}/api/network/wifi/current`,
				headers,
				webFetchExtra: {
					credentials: "include",
				},
			});
			const success = res.status === 200;
			if (success) {
				internetConnectionCache.delete(deviceId); // Invalidate cache
				wifiInternetConnectionCache.delete(deviceId); // Invalidate WiFi internet cache
			}
			return success;
		} catch (error) {
			console.error("Error in disconnectFromWifi:", error);
			return false;
		}
	};

	const forgetWifi = async (deviceId: DeviceId, ssid: string) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return false;
			const { url } = device;
			const res = await CapacitorHttp.delete({
				url: `${url}/api/network/wifi/forget`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
				data: { ssid },
			});
			return res.status === 200;
		} catch (error) {
			return false;
		}
	};

	const connectToWifi = async (
		deviceId: DeviceId,
		ssid: string,
		password?: string,
	) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return false;
			const { url } = device;
			CapacitorHttp.post({
				url: `${url}/api/network/wifi`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
				data: { ssid, password },
				connectTimeout: 10000,
				readTimeout: 10000,
			});

			let tries = 0;
			const connected = await new Promise((resolve) => {
				const interval = setInterval(async () => {
					searchDevice();
					tries++;
					if (tries > 10) {
						clearInterval(interval);
						resolve(false);
						return;
					}
					try {
						const res = await CapacitorHttp.get({
							url: `${url}/api/network/wifi/current`,
							headers,
							webFetchExtra: {
								credentials: "include",
							},
							connectTimeout: 20000,
							readTimeout: 20000,
						});
						if (res.status === 200) {
							const currentSsidData = z
								.object({ SSID: z.string() })
								.safeParse(JSON.parse(res.data));
							if (
								currentSsidData.success &&
								currentSsidData.data.SSID === ssid
							) {
								resolve(true);
								clearInterval(interval);
							}
						}
					} catch (e) {
						// Ignore errors, wait for successful connection or timeout
						console.error("Error checking wifi current during connect:", e);
					}
				}, 5000);
			});

			if (connected) {
				internetConnectionCache.delete(deviceId); // Invalidate cache
				wifiInternetConnectionCache.delete(deviceId); // Invalidate WiFi internet cache
			}
			return connected;
		} catch (error) {
			console.error("Error in connectToWifi:", error);
			return false;
		}
	};

	const ConnectionRes = z.object({
		connected: z.boolean(),
	});

	const checkDeviceWifiInternetConnection = async (deviceId: DeviceId) => {
		const cached = wifiInternetConnectionCache.get(deviceId);
		if (
			cached &&
			Date.now() - cached.timestamp < NETWORK_DATA_CACHE_DURATION_MS
		) {
			return cached.connected;
		}
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) {
				wifiInternetConnectionCache.set(deviceId, {
					connected: false,
					timestamp: Date.now(),
				});
				return false;
			}
			const { url } = device;
			const res = await CapacitorHttp.get({
				url: `${url}/api/wifi-check`,
				headers,
				webFetchExtra: {
					credentials: "include",
				},
			});
			let connected = false;
			if (res.status === 200) {
				// Check if 'connected' field exists, default to false if not (for older TC2s)
				const parsedData = JSON.parse(res.data);
				if (typeof parsedData.connected === "boolean") {
					connected = ConnectionRes.parse(parsedData).connected;
				}
				// If 'connected' field is missing, assume false for internet check
			}
			// For any other status, including 404 (endpoint not found),
			// we cannot confirm internet via this WiFi check.
			wifiInternetConnectionCache.set(deviceId, {
				connected,
				timestamp: Date.now(),
			});
			return connected;
		} catch (error) {
			console.error("Error in checkDeviceWifiInternetConnection:", error);
			wifiInternetConnectionCache.set(deviceId, {
				connected: false,
				timestamp: Date.now(),
			});
			return false;
		}
	};

	const checkDeviceModemInternetConnection = async (deviceId: DeviceId) => {
		const cached = modemInternetConnectionCache.get(deviceId);
		if (
			cached &&
			Date.now() - cached.timestamp < NETWORK_DATA_CACHE_DURATION_MS
		) {
			return cached.connected;
		}
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) {
				modemInternetConnectionCache.set(deviceId, {
					connected: false,
					timestamp: Date.now(),
				});
				return false;
			}
			const { url } = device;
			const res = await CapacitorHttp.get({
				url: `${url}/api/modem-check`,
				headers,
				webFetchExtra: {
					credentials: "include",
				},
			});
			const connected = ConnectionRes.parse(JSON.parse(res.data)).connected;
			modemInternetConnectionCache.set(deviceId, {
				connected,
				timestamp: Date.now(),
			});
			return connected;
		} catch (error) {
			console.error("Connection Error:", error);
			modemInternetConnectionCache.set(deviceId, {
				connected: false,
				timestamp: Date.now(),
			});
			return false;
		}
	};

	const getModem = async (deviceId: DeviceId): Promise<Modem | null> => {
		const cached = modemDetailsCache.get(deviceId);
		if (
			cached &&
			Date.now() - cached.timestamp < NETWORK_DATA_CACHE_DURATION_MS
		) {
			return cached.modem;
		}
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return null;
			const { url } = device;
			const res = await CapacitorHttp.get({
				url: `${url}/api/modem`,
				headers,
				webFetchExtra: {
					credentials: "include",
				},
				connectTimeout: 5000, // Added timeout
				readTimeout: 5000, // Added timeout
			});
			const modemData =
				res.status === 200 ? tc2ModemSchema.parse(res.data) : null;
			modemDetailsCache.set(deviceId, {
				modem: modemData,
				timestamp: Date.now(),
			});
			return modemData;
		} catch (error) {
			console.error("Error in getModem:", error);
			modemDetailsCache.set(deviceId, { modem: null, timestamp: Date.now() });
			return null;
		}
	};

	const turnOnModem = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return false;
			const { url } = device;
			const res = await DevicePlugin.turnOnModem({ url, minutes: "5" });
			if (res.success) {
				internetConnectionCache.delete(deviceId);
				modemDetailsCache.delete(deviceId); // Modem state changed
				modemInternetConnectionCache.delete(deviceId); // Invalidate modem internet cache
			}
			return res.success;
		} catch (error) {
			console.error("Turn On Error: ", error);
			return false;
		}
	};

	const hasNetworkEndpoints = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return false;
			const { url } = device;
			const res = await Effect.runPromise(
				Effect.retry(
					Effect.tryPromise<HttpResponse>(() => {
						return CapacitorHttp.get({
							url: `${url}/api/network/wifi/current`,
							headers,
							webFetchExtra: {
								credentials: "include",
							},
						});
					}),
					{ times: 3 },
				),
			);
			return res.status === 200;
		} catch (error) {
			return false;
		}
	};

	const getModemSignalStrength = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return null;
			const { url } = device;
			let res = await CapacitorHttp.get({
				url: `${url}/api/signal-strength`,
				headers,
				webFetchExtra: {
					credentials: "include",
				},
			});
			if (res.status !== 200) throw Error("No Modem");
			res = JSON.parse(res.data);
			return tc2ModemSchema.parse(res);
		} catch (error) {
			console.error(error);
			return null;
		}
	};

	const getSavedWifiNetworks = async (
		deviceId: DeviceId,
	): Promise<string[] | null> => {
		const cached = savedWifiNetworksCache.get(deviceId);
		if (
			cached &&
			Date.now() - cached.timestamp < NETWORK_DATA_CACHE_DURATION_MS
		) {
			return cached.networks;
		}
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return []; // Keep returning [] for now
			const { url } = device;
			const savedNetworksRes = await CapacitorHttp.get({
				url: `${url}/api/network/wifi/saved`,
				headers,
				webFetchExtra: {
					credentials: "include",
				},
				connectTimeout: 5000, // Added timeout
				readTimeout: 5000, // Added timeout
			});
			if (savedNetworksRes.status !== 200) {
				savedWifiNetworksCache.set(deviceId, {
					networks: null,
					timestamp: Date.now(),
				});
				return null;
			}
			const networks = z
				.array(
					z
						.string()
						.or(z.object({ SSID: z.string() }).transform((val) => val.SSID)),
				)
				.parse(JSON.parse(savedNetworksRes.data));
			savedWifiNetworksCache.set(deviceId, { networks, timestamp: Date.now() });
			return networks;
		} catch (error) {
			console.error("Error in getSavedWifiNetworks:", error);
			savedWifiNetworksCache.set(deviceId, {
				networks: [],
				timestamp: Date.now(),
			}); // Cache empty on error
			return []; // Keep returning [] for now
		}
	};

	const InterfaceSchema = z.object({
		name: z.string(),
		addresses: z.array(z.string()).nullable(),
		mtu: z.number(),
		macAddress: z.string(),
		flags: z.string(),
	});

	const getDeviceInterfaces = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return [];
			const { url } = device;
			const res = await CapacitorHttp.get({
				url: `${url}/api/network/interfaces`,
				headers,
				webFetchExtra: {
					credentials: "include",
				},
			});
			const interfaces = InterfaceSchema.array().parse(JSON.parse(res.data));
			return res.status === 200 ? interfaces : [];
		} catch (error) {
			console.error(error);
			return [];
		}
	};

	const [apState, setApState] = createSignal<
		| "connected"
		| "disconnected"
		| "loadingDisconnect"
		| "loadingConnect"
		| "default"
	>("default");

	createEffect(
		on(
			() => [...devices.values()],
			(currDevices, prev) => {
				if ((prev?.length ?? 0) > 0 && currDevices.length === 0) {
					if (apState() === "connected") {
						DevicePlugin.hasConnection().then((res) => {
							if (!res.success) {
								log.logEvent("AP_disconnect");
								setApState("disconnected");
							}
						});
					}
				}
				return currDevices;
			},
		),
	);

	const connectToDeviceAP = leading(
		debounce,
		async () => {
			if (["loadingConnect", "connected"].includes(apState())) {
				console.log("AP connection already in progress or connected");
				return;
			}

			// Always start from a clean state when initiating a connection
			setApState("loadingConnect");

			const connectTimeout = setTimeout(() => {
				if (apState() === "loadingConnect") {
					setApState("default");
				}
			}, 120000); // 2 minute timeout

			try {
				log.logEvent("AP_connect");
				const res = await DevicePlugin.connectToDeviceAP();

				if (res.status === "connecting") {
					console.log("AP connection process started");
				} else if (res.status === "connected") {
					log.logEvent("AP_connected");
					setApState("connected");
					clearTimeout(connectTimeout);
					searchDevice();
				} else if (res.status === "error") {
					log.logEvent("AP_failed");
					log.logWarning({
						message:
							res.error ||
							"Please try again, or connect to 'bushnet' with password 'feathers' in your wifi settings. Alternatively, set up a hotspot named 'bushnet' password: 'feathers'.",
					});
					setApState("default");
					clearTimeout(connectTimeout);
				}
			} catch (err) {
				log.logEvent("AP_failed");
				setApState("default");
				clearTimeout(connectTimeout);
			}
		},
		800,
	);

	const disconnectFromDeviceAP = async () => {
		try {
			setApState("loadingDisconnect");

			const disconnectTimeout = setTimeout(() => {
				if (apState() === "loadingDisconnect") {
					setApState("disconnected");
				}
			}, 30000); // 30 second timeout

			const res = await DevicePlugin.disconnectFromDeviceAP();

			if (!res.success) {
				log.logWarning({
					message: `Failed to disconnect: ${res.message}`,
					warn: true,
				});
				setApState("default");
				clearTimeout(disconnectTimeout);
			}

			return res.success;
		} catch (error) {
			setApState("default");
			return false;
		}
	};

	const takeTestRecording = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return false;
			const { url } = device;
			const res = await CapacitorHttp.put({
				url: `${url}/api/camera/snapshot-recording`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
			});
			return res.status === 200;
		} catch (error) {
			return false;
		}
	};

	const takeAudioRecording = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return false;
			const { url } = device;
			const res = await CapacitorHttp.put({
				url: `${url}/api/audio/test-recording`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
			});
			return res.status === 200;
		} catch (error) {
			return false;
		}
	};

	const getAudioMode = async (url: string) => {
		try {
			const res = await CapacitorHttp.get({
				url: `${url}/api/audiorecording`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
			});
			return res.status === 200
				? AudioRecordingResSchema.parse(JSON.parse(res.data))["audio-mode"]
				: null;
		} catch (error) {
			console.error(error);
			return null;
		}
	};

	const getAudioStatus = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return null;
			const { url } = device;
			const res = await CapacitorHttp.get({
				url: `${url}/api/audio/audio-status`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
			});
			return res.status === 200
				? AudioStatusResSchema.parse(JSON.parse(res.data))
				: null;
		} catch (error) {
			console.error(error);
			return null;
		}
	};

	const setAudioMode = async (deviceId: DeviceId, type: AudioMode) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return false;
			const { url } = device;
			const res = await CapacitorHttp.post({
				url: `${url}/api/audiorecording?audio-mode=${type}`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
			});
			return res.status === 200;
		} catch (e) {
			console.error(e);
			return false;
		}
	};

	const getAudioFiles = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return [];
			const { url } = device;
			const res = await CapacitorHttp.get({
				url: `${url}/api/audio/recordings`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
			});
			return res.status === 200 ? JSON.parse(res.data) : [];
		} catch (error) {
			console.log(error);
			return [];
		}
	};

	const getAudioRecordingSettings = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return null;
			const res = await CapacitorHttp.get({
				url: `${device.url}/api/audiorecording`,
				headers,
				webFetchExtra: { credentials: "include" },
			});
			if (res.status !== 200) return null;
			const data = AudioRecordingResSchema.parse(JSON.parse(res.data));
			return { mode: data["audio-mode"], seed: data["audio-seed"] };
		} catch (error) {
			console.error(error);
			return null;
		}
	};

	const setAudioRecordingSettings = async (
		deviceId: DeviceId,
		mode: AudioMode,
		seed: string,
	) => {
		const device = devices.get(deviceId);
		if (!device || !device.isConnected) return false;
		const res = await CapacitorHttp.post({
			url: `${device.url}/api/audiorecording?audio-mode=${mode}&audio-seed=${seed}`,
			headers: {
				...headers,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			webFetchExtra: { credentials: "include" },
		});
		return res.status === 200;
	};

	const takeLongAudioRecording = async (
		deviceId: DeviceId,
		seconds: number,
	) => {
		const device = devices.get(deviceId);
		if (!device || !device.isConnected) return false;
		const res = await CapacitorHttp.put({
			url: `${device.url}/api/audio/long-recording?seconds=${seconds}`,
			headers: { ...headers, "Content-Type": "application/json" },
			webFetchExtra: { credentials: "include" },
			connectTimeout: 5000, // Add timeouts
			readTimeout: 5000,
		});
		// Refetch status immediately after initiating the request
		getAudioStatus(deviceId); // No need to await, let it run in background
		return res.status === 200;
	};

	const getDeviceCamera = (deviceId: DeviceId) => {
		const device = devices.get(deviceId);
		if (!device || !device.isConnected) return null;
		const { url } = device;
		return DeviceCamera(url.split("http://")[1]);
	};

	const InGroupDeviceSchema = z.object({
		success: z.boolean(),
		messages: z.array(z.string()).optional(),
		device: z
			.object({
				deviceName: z.string(),
				groupName: z.string(),
				groupId: z.number(),
				id: z.number(),
				saltId: z.number().nullable().optional(),
				active: z.boolean(),
				admin: z.boolean(),
				type: z.string(),
				isHealthy: z.boolean(),
				public: z.boolean(),
				lastConnectionTime: z.string().nullable().optional(),
				lastRecordingTime: z.string().nullable().optional(),
				location: z
					.object({
						lat: z.number().nullable().optional(),
						lng: z.number().nullable().optional(),
					})
					.nullable()
					.optional(),
				scheduleId: z.number().nullable().optional(),
				users: z
					.array(
						z.object({
							userName: z.string(),
							userId: z.number(),
							admin: z.boolean(),
						}),
					)
					.optional(),
			})
			.partial(),
	});

	const getDeviceFromGroup = async ({
		deviceName,
		groupIdOrName,
	}: {
		deviceName: string;
		groupIdOrName: string;
	}) => {
		const serverUrl = user.getServerUrl();
		const userData = await user.getUser();
		if (!userData) return null;
		const fullUrl = `${serverUrl}/api/v1/devices/${deviceName}/in-group/${groupIdOrName}?only-active=true`;

		const response = await CapacitorHttp.get({
			url: fullUrl,
			headers: {
				Authorization: userData.token,
				"Content-Type": "application/json",
			},
			webFetchExtra: { credentials: "include" },
		});

		if (response.status !== 200) {
			throw new Error(
				`Could not fetch device from group. Got status ${response.status}`,
			);
		}

		const parsed = InGroupDeviceSchema.safeParse(response.data);
		if (!parsed.success) {
			throw new Error(
				`Failed to parse /in-group API response: ${parsed.error.message}`,
			);
		}

		return parsed.data.device;
	};

	const changeGroup = async (
		deviceId: DeviceId,
		group: string,
		token: string,
	): Promise<[DeviceId, boolean]> => {
		const device = devices.get(deviceId);
		if (!device || !device.isConnected) return [deviceId, false];
		const { url } = device;
		const res = await CapacitorHttp.post({
			url: `${url}/api/reregister-authorized`,
			headers: { ...headers, "Content-Type": "application/json" },
			webFetchExtra: {
				credentials: "include",
			},
			data: {
				newGroup: group,
				authorizedUser: token,
			},
		});

		if (res.status === 200) {
			const deviceFromApi = await getDeviceFromGroup({
				deviceName: device.name,
				groupIdOrName: group,
			});

			if (deviceFromApi?.id) {
				const id: DeviceId = deviceFromApi.id.toString();
				batch(() => {
					devices.delete(deviceId);
					devices.set(id, {
						...device,
						id,
						group,
					});
				});
				return [id, true];
			}
		} else if (res.status === 404 || res.status === 400) {
			const res = await DevicePlugin.reregisterDevice({
				url,
				group,
				device: deviceId,
			});
			if (res.success) {
				const deviceFromApi = await getDeviceFromGroup({
					deviceName: device.name,
					groupIdOrName: group,
				});

				if (deviceFromApi?.id) {
					const id: DeviceId = deviceFromApi.id.toString();
					batch(() => {
						devices.delete(deviceId);
						devices.set(id, {
							...device,
							id,
							group,
						});
					});
					return [id, true];
				}
			}
		}
		throw new Error("Could not change group");
	};

	const configDefaultsSchema = z.object({
		windows: z
			.object({
				StartRecording: z.string(),
				StopRecording: z.string(),
				PowerOn: z.string(),
				PowerOff: z.string(),
			})
			.partial(),
		"thermal-recorder": z
			.object({
				UseLowPowerMode: z.boolean(),
			})
			.partial()
			.optional(),
	});

	const configValueSchema = z
		.object({
			windows: z.object({
				StartRecording: z.string(),
				StopRecording: z.string(),
				PowerOn: z.string(),
				PowerOff: z.string(),
			}),
			thermalRecorder: z
				.object({
					UseLowPowerMode: z.boolean(),
				})
				.partial(),
		})
		.partial();

	const configSchema = z.object({
		defaults: configDefaultsSchema,
		values: configValueSchema,
	});

	const getDeviceConfig = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return null;
			const { url } = device;
			const res = await DevicePlugin.getDeviceConfig({ url });
			if (!res.success) return null;
			const config = configSchema.parse(JSON.parse(res.data));
			return config;
		} catch (error) {
			console.error("Get Config Error", error);
			return null;
		}
	};

	const setRecordingWindow = async (
		deviceId: DeviceId,
		on: string,
		off: string,
	) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return null;
			const { url } = device;
			const res = await DevicePlugin.updateRecordingWindow({ url, on, off });
			return res.success;
		} catch (error) {
			return null;
		}
	};

	const SaltStatusSchema = z.object({
		RunningUpdate: z.boolean(),
		RunningArgs: z
			.union([z.string(), z.number(), z.boolean(), z.array(z.any()), z.null()])
			.optional(),
		LastCallOut: z.string().optional(),
		LastCallSuccess: z.boolean().optional(),
		LastCallNodegroup: z.string().optional(),
		LastCallArgs: z.array(z.string()).optional(),
		LastUpdate: z.string().datetime({ offset: true }).optional(),
		UpdateProgressPercentage: z.number().int().optional(),
		UpdateProgressStr: z.string().optional(),
	});

	type SaltStatus = z.infer<typeof SaltStatusSchema>;

	const updatingDevice = new ReactiveMap<
		DeviceId,
		{
			pending?: boolean;
			interval?: NodeJS.Timeout;
		} & Partial<SaltStatus>
	>();

	const runUpdateCheck = leading(debounce, (deviceId: DeviceId) => {
		if (updatingDevice.has(deviceId)) return;
		const device = devices.get(deviceId);
		if (!device || !device.isConnected) return;
		const { url } = device;
		updatingDevice.set(deviceId, { pending: true });
		const interval = setInterval(async () => {
			try {
				const res = await CapacitorHttp.get({
					url: `${url}/api/salt-update`,
					headers: { ...headers, "Content-Type": "application/json" },
					webFetchExtra: {
						credentials: "include",
					},
				});
				if (res.status === 200) {
					const statusRes = SaltStatusSchema.safeParse(JSON.parse(res.data));
					if (statusRes.success) {
						const { data } = statusRes;
						updatingDevice.set(deviceId, { pending: false, interval, ...data });
						if (data.RunningUpdate === false) {
							clearInterval(interval);
							updatingDevice.delete(deviceId);
						}
					} else {
						console.error("Check Updating Error", statusRes.error, res.data);
					}
				}
			} catch (error) {
				console.error("Check Updating Error", error);
				updatingDevice.delete(deviceId);
			}
		}, 5000);
	});

	const updateDevice = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return null;
			const { url } = device;
			const existing = updatingDevice.get(deviceId);

			if (existing) {
				if (existing.RunningUpdate) return null;
				clearInterval(existing.interval);
				updatingDevice.delete(deviceId);
			}
			const res = await CapacitorHttp.post({
				url: `${url}/api/salt-update`,
				headers: { ...headers, "Content-Type": "application/json" },
				webFetchExtra: {
					credentials: "include",
				},
				data: { force: true },
			});

			if (res.status === 200) {
				runUpdateCheck(deviceId);
				log.logEvent("Trigged update for device", {
					id: device.id,
				});
				return true;
			}
		} catch (error) {
			console.error(error);
			log.logError({ message: "Failed to update for device", error });
		}
		return false;
	};

	const getUpdateError = (deviceId: DeviceId) => {
		const device = devices.get(deviceId);
		if (!device || !device.isConnected) return null;
		const existing = updatingDevice.get(deviceId);
		if (!existing?.RunningUpdate) return null;
		const lastCallOut = existing?.LastCallOut;
		if (lastCallOut?.includes("accepted?"))
			return "Contact support to accept your device.";
	};

	const parseSaltStatusHasUpdate = (
		data: z.infer<typeof SaltStatusSchema>,
	): boolean => {
		if (
			data.UpdateProgressStr?.includes("No update available") ||
			data.UpdateProgressStr?.includes("Finished")
		)
			return false;
		return true;
	};

	const checkDeviceUpdate = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return null;
			const { url } = device;
			const res = await CapacitorHttp.get({
				url: `${url}/api/salt-update`,
				headers,
				webFetchExtra: {
					credentials: "include",
				},
			});
			const data =
				res.status === 200
					? SaltStatusSchema.safeParse(JSON.parse(res.data)).data
					: null;

			console.log("Check Update", data);
			if (!data) return null;
			return parseSaltStatusHasUpdate(data);
		} catch (error) {
			console.error(error);
			return null;
		}
	};

	const isDeviceUpdating = (deviceId: DeviceId) => {
		const device = updatingDevice.get(deviceId);
		return (
			device?.pending ||
			(device?.RunningUpdate && device?.LastCallSuccess !== false)
		);
	};

	const didDeviceUpdate = (deviceId: DeviceId): boolean | null => {
		const foundDevice = updatingDevice.get(deviceId);
		return foundDevice?.LastCallSuccess ?? null;
	};

	const getDeviceUpdating = (deviceId: DeviceId) => {
		return updatingDevice.get(deviceId);
	};

	const setLowPowerMode = async (deviceId: DeviceId, enabled: boolean) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return null;
			const { url } = device;
			const res = await DevicePlugin.setDeviceConfig({
				url,
				section: "thermal-recorder",
				config: JSON.stringify({ "use-low-power-mode": enabled }),
			});

			return res.success ? enabled : !enabled;
		} catch (error) {
			console.error(error);
			return null;
		}
	};

	const rebootDevice = async (deviceId: DeviceId) => {
		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) return null;
			const { url } = device;
			const res = await CapacitorHttp.post({
				url: `${url}/api/reboot`,
				headers,
				webFetchExtra: {
					credentials: "include",
				},
			});
			return res.status === 200;
		} catch (error) {
			console.error(error);
			return null;
		}
	};

	const deviceHasInternet = async (deviceId: DeviceId): Promise<boolean> => {
		const cachedEntry = internetConnectionCache.get(deviceId);
		if (
			cachedEntry &&
			Date.now() - cachedEntry.timestamp < INTERNET_CACHE_DURATION_MS
		) {
			return cachedEntry.status;
		}

		try {
			const device = devices.get(deviceId);
			if (!device || !device.isConnected) {
				internetConnectionCache.set(deviceId, {
					status: false,
					timestamp: Date.now(),
				});
				return false;
			}

			let hasInternet = false;
			// Check WiFi internet connection first
			const wifiNetwork = await getCurrentWifiNetwork(deviceId);
			if (wifiNetwork?.SSID && wifiNetwork.SSID !== "") {
				hasInternet = await checkDeviceWifiInternetConnection(deviceId);
			}

			// If not connected via WiFi or WiFi check failed/returned false, check modem
			if (!hasInternet) {
				hasInternet = await checkDeviceModemInternetConnection(deviceId);
			}

			internetConnectionCache.set(deviceId, {
				status: hasInternet,
				timestamp: Date.now(),
			});
			return hasInternet;
		} catch (error) {
			console.error(
				"Error in deviceHasInternet while checking device internet:",
				error,
			);
			internetConnectionCache.set(deviceId, {
				status: false,
				timestamp: Date.now(),
			});
			return false;
		}
	};

	const deviceTypes = z.enum([
		"audio",
		"thermal",
		"trailcam",
		"trapcam",
		"hybrid-thermal-audio",
		"unknown",
	]);

	return {
		devices,
		isDiscovering,
		devicesDownloading,
		deviceHasInternet,
		stopSaveItems,
		deviceRecordings,
		deviceEventKeys,
		startDiscovery,
		stopDiscovery,
		setRecordingWindow,
		deleteUploadedRecordings,
		getDeviceConfig,
		getEvents,
		saveItems,
		setCurrEvents,
		saveEvents,
		changeGroup,
		rebootDevice,
		// Location
		locationDisabled,
		locationPermission: permission,
		refetchLocationPermission,
		refetchDeviceLocToUpdate,
		setDeviceToCurrLocation,
		locationBeingSet,
		getLocationCoords,
		getLocationByDevice,
		devicesLocToUpdate,
		shouldDeviceUpdateLocation,
		// Wifi
		getDeviceInterfaces,
		getWifiNetworks,
		getCurrentWifiNetwork,
		connectToWifi,
		disconnectFromWifi,
		forgetWifi,
		checkDeviceWifiInternetConnection,
		saveWifiNetwork,
		getSavedWifiNetworks,
		hasNetworkEndpoints,
		// Modem
		getModemSignalStrength,
		getModem,
		turnOnModem,
		checkDeviceModemInternetConnection,
		// Access point
		connectToDeviceAP,
		disconnectFromDeviceAP,
		apState,
		setApState,
		searchDevice,
		// Camera
		takeTestRecording,
		getDeviceCamera,
		setLowPowerMode,
		//Audio
		getAudioMode,
		getAudioStatus,
		setAudioMode,
		getAudioFiles,
		hasAudioCapabilities,
		getAudioRecordingSettings,
		setAudioRecordingSettings,
		takeAudioRecording,
		takeLongAudioRecording,
		// Update
		checkDeviceUpdate,
		updateDevice,
		getDeviceUpdating,
		getUpdateError,
		isDeviceUpdating,
		didDeviceUpdate,
		saveAPN,
		getBattery,
		devicesConnectingToWifi,
		backgroundRefreshNetworkData,
	};
});

// biome-ignore lint/style/noNonNullAssertion: this should no fail if provider is used correctly
const defineUseDevice = () => useDevice()!;
export { defineUseDevice as useDevice, DeviceProvider };
