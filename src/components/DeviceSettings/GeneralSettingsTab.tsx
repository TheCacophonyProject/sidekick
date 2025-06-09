import { A, useSearchParams } from "@solidjs/router";
import { Dialog as Prompt } from "@capacitor/dialog";
import { AiOutlineInfoCircle } from "solid-icons/ai";
import {
	RiArrowsArrowRightSLine,
} from "solid-icons/ri";
import {
	Match,
	Show,
	Switch,
	createEffect,
	createMemo,
	createResource,
	createSignal,
	on,
	onCleanup,
	onMount,
} from "solid-js";
import FieldWrapper from "~/components/Field";
import type { DeviceId } from "~/contexts/Device";
import { useDevice } from "~/contexts/Device";
import { useUserContext } from "~/contexts/User";
import { useLogsContext } from "~/contexts/LogsContext";

type SettingProps = { deviceId: DeviceId };

export function GroupSelect(props: SettingProps) {
	const log = useLogsContext();
	const user = useUserContext();
	const context = useDevice();
	const id = () => props.deviceId;
	const device = () => context.devices.get(id());
	const groupName = () =>
		(device()?.group ?? "-") === "new" ? "-" : (device()?.group ?? "-");
	onMount(() => {
		try {
			const interval = setInterval(async () => {
				await user.refetchGroups();
			}, 5000);
			onCleanup(() => {
				clearInterval(interval);
			});
		} catch (e) {
			console.error(e);
		}
	});
	const [params, setSearchParams] = useSearchParams();
	const setGroup = async (v: string) => {
		if (!user.groups()?.some((g) => g.groupName === v)) {
			const res = await user.createGroup(v);
			if (!res.success) {
				throw new Error(res.messages.join("\n"));
			}
			log.logEvent("group_create", { name: v });
		}
		const token = (await user.getUser())?.token;
		if (token) {
			log.logEvent("group_change", { name: v });
			const [currId, success] = await context.changeGroup(id(), v, token);
			if (params.deviceSettings) {
				setSearchParams({ deviceSettings: currId, tab: params.tab });
			}
			if (params.setupDevice) {
				setSearchParams({ setupDevice: currId, step: params.step });
			}
		}
	};

	const [canChangeGroup] = createResource(async () =>
		context.deviceHasInternet(id()),
	);

	const message = () =>
		canChangeGroup() === false
			? "Device must have an internet connection to change group"
			: "";

	const onOpenGroups = async () => {
		try {
			const userIsProd = user.isProd();
			const deviceIsProd = device()?.isProd ?? true;
			const sameServer = deviceIsProd === userIsProd;
			const notifyUser = !user.isLoggedIn() || !sameServer;
			if (notifyUser) {
				// Prompt to login
				const message =
					user.isLoggedIn() && !sameServer
						? "You must be logged in the same server as device. Would you like to login?"
						: !user.isLoggedIn()
							? "You must be logged in to change group. Would you like to login?"
							: "";
				const res = await Prompt.confirm({
					title: "Login Required",
					message,
				});
				if (res.value) {
					await user.logout();
					return false;
				}
				return false;
			}
			return true;
		} catch (e) {
			console.error(e);
			return true;
		}
	};

	return (
		<FieldWrapper
			type="dropdown"
			value={groupName()}
			title="Group"
			onChange={setGroup}
			shouldOpen={onOpenGroups}
			options={user.groups()?.map(({ groupName }) => groupName) ?? []}
			disabled={!canChangeGroup.loading && !canChangeGroup()}
			message={message()}
		/>
	);
}

export function GeneralSettingsTab(props: SettingProps) {
	const user = useUserContext();
	const context = useDevice();
	const device = () => context.devices.get(props.deviceId);
	const id = () => props.deviceId;
	const saltId = () => device()?.saltId ?? "";
	const name = () => device()?.name ?? "";

	// Use stable primitive values to prevent rendering loops
	const [deviceIdState] = createSignal(props.deviceId);

	// Avoid accessing reactive props directly in resource dependencies
	const [updateStatus, { refetch }] = createResource(
		deviceIdState,
		async (deviceId) => {
			if (!deviceId) return null;
			try {
				const res = await context.checkDeviceUpdate(deviceId);
				return res;
			} catch (error) {
				console.error("Error checking device update:", error);
				return null;
			}
		},
		{
			initialValue: null,
		},
	);

	// Implement safer interval checking with proper cleanup
	let updateCheckTimer: number | undefined;

	const [hasInternetConnection] = createResource<boolean>(
		async () => {
			try {
				return await context.deviceHasInternet(deviceIdState());
			} catch (error) {
				console.error("Error checking internet connection:", error);
				return false;
			}
		},
		{ initialValue: false }, // Add an initialValue to avoid undefined state
	);

	const scheduleUpdateCheck = () => {
		// Clear any existing timer
		if (updateCheckTimer) {
			clearTimeout(updateCheckTimer);
			updateCheckTimer = undefined;
		}

		// Only schedule if we're not already updating
		if (!context.isDeviceUpdating(deviceIdState())) {
			updateCheckTimer = window.setTimeout(() => {
				const internetAvailable = hasInternetConnection();
				if (internetAvailable !== false) {
					refetch();
				}
				scheduleUpdateCheck(); // Reschedule for next check
			}, 30000);
		}
	};

	onMount(() => {
		// Initial check
		scheduleUpdateCheck();

		// Cleanup
		onCleanup(() => {
			if (updateCheckTimer) {
				clearTimeout(updateCheckTimer);
				updateCheckTimer = undefined;
			}
		});
	});

	// Precompute values to avoid recalculation in render function
	const updateError = createMemo(() => context.getUpdateError(deviceIdState()));

	const canUpdate = createMemo(() => {
		const internet = hasInternetConnection();
		const status = updateStatus();
		console.log("UPDATE STATUS", status, internet);
		if ((internet !== undefined && internet === false) || !status) return false;
		return true;
	}, false);

	const softwareUpdateMessage = createMemo(() => {
		if (context.isDeviceUpdating(deviceIdState())) return "Updating...";
		if (context.didDeviceUpdate(deviceIdState()) === false) {
			return "Failed to Update";
		}
		if (context.didDeviceUpdate(deviceIdState()) === true) {
			return "Update Complete";
		}
		if (canUpdate()) return "Software Update";
		return "No Update Available";
	});

	const [lowPowerMode, setLowPowerMode] = createSignal<boolean | null>(null);

	onMount(async () => {
		try {
			const res = await context.getDeviceConfig(deviceIdState());
			if (res) {
				setLowPowerMode(
					res.values.thermalRecorder?.UseLowPowerMode ??
					res.defaults["thermal-recorder"]?.UseLowPowerMode ??
					null,
				);
			}
		} catch (error) {
			console.error("Error loading device config:", error);
		}
	});

	onMount(async () => {
		user.refetchGroups();
	});

	// refetch the device update status when device finishes updating
	createEffect(
		on(
			() => context.isDeviceUpdating(deviceIdState()),
			(curr, prev) => {
				if (prev && !curr) {
					refetch();
				}
			},
		),
	);
	const showProgress = createMemo(() => {
		const internet = hasInternetConnection();
		const isUpdating = context.isDeviceUpdating(deviceIdState());
		const hasPercentage =
			context.getDeviceUpdating(deviceIdState())?.UpdateProgressPercentage !==
			undefined;
		return internet && isUpdating && hasPercentage;
	});

	const turnOnLowPowerMode = async (v: boolean) => {
		try {
			setLowPowerMode(v);
			const res = await context.setLowPowerMode(deviceIdState(), v);
			if (res === null) {
				console.error("Failed to set low power mode");
			}
		} catch (error) {
			console.error("Error setting power mode:", error);
		}
	};

	return (
		<div class="flex w-full flex-col space-y-2 px-2 py-4">
			<FieldWrapper type="text" value={name()} title="Name" />
			<GroupSelect deviceId={id()} />
			<FieldWrapper type="text" value={saltId()} title="ID" />

			<Show when={lowPowerMode() !== null}>
				<FieldWrapper type="custom" title={"Power Mode"}>
					<div class="flex w-full items-center gap-x-2 bg-gray-100 px-1">
						<button
							onClick={() => turnOnLowPowerMode(false)}
							classList={{
								"bg-white outline outline-2 outline-green-500":
									lowPowerMode() === false,
								"bg-gray-100": lowPowerMode() !== false,
							}}
							class="flex w-full appearance-none items-center justify-center rounded-lg p-1"
						>
							High
						</button>
						<button
							classList={{
								"bg-white outline outline-2 outline-green-500":
									lowPowerMode() === true,
								"bg-gray-100": lowPowerMode() !== true,
							}}
							onClick={() => turnOnLowPowerMode(true)}
							class="flex w-full appearance-none items-center justify-center rounded-lg bg-white p-1"
						>
							Low
						</button>
					</div>
				</FieldWrapper>
				<div class="flex items-center space-x-2 px-2 text-sm text-gray-500">
					<AiOutlineInfoCircle size={18} />
					<Switch>
						<Match when={lowPowerMode() === true}>
							<p>Low power mode only uploads once per day.</p>
						</Match>
						<Match when={lowPowerMode() === false}>
							<p>High power mode uploads after every recording.</p>
						</Match>
					</Switch>
				</div>
			</Show>

			<Show when={device()?.lastUpdated}>
				{(lastUpdated) => (
					<p class="flex gap-x-2 px-2 text-sm">
						<span class="text-gray-500">Last Updated:</span>
						<span>{lastUpdated().toLocaleString()}</span>
					</p>
				)}
			</Show>

			<Show when={updateError()}>
				{(error) => <p class="text-red-500">{error()}</p>}
			</Show>

			<div>
				<Show when={showProgress()}>
					{(percentage) => (
						<div class="relative flex h-6 w-full items-center rounded-t-md bg-gray-400">
							<div
								class="transition-width m-1 h-4 rounded-full bg-blue-500 duration-500"
								style={{
									width: `${context.getDeviceUpdating(id())?.UpdateProgressPercentage
										}%`,
								}}
							/>
							<span class="absolute left-1/2 top-1 -translate-x-1/2 transform text-xs text-white">
								{context.getDeviceUpdating(id())?.UpdateProgressPercentage}%
							</span>
						</div>
					)}
				</Show>
				<button
					classList={{
						"bg-blue-500 py-2 px-4 text-white ": canUpdate(),
						"bg-gray-400 py-2 px-4 text-gray-500 ": !canUpdate(),
						"rounded-md": !showProgress(),
						"rounded-b-md": showProgress() !== false,
					}}
					disabled={!canUpdate?.() || canUpdate() === undefined}
					class="flex w-full items-center justify-center space-x-2 bg-blue-500 px-4 py-3 text-white "
					onClick={() => context.updateDevice(id())}
				>
					{softwareUpdateMessage()}
				</button>
			</div>
			<A
				class="flex w-full items-center justify-center py-2 text-center text-lg text-blue-600"
				href={`/devices/${device()?.id}`}
			>
				<span>Advanced</span>
				<RiArrowsArrowRightSLine size={26} />
			</A>
		</div>
	);
}