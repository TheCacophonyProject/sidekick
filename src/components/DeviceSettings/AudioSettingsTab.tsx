import type { AudioMode, DeviceId } from "~/contexts/Device";
import { useDevice } from "~/contexts/Device";
import { useLogsContext } from "~/contexts/LogsContext";
import {
	For,
	Show,
	Switch,
	Match,
	createEffect,
	createResource,
	createSignal,
	on,
	onCleanup,
	onMount,
} from "solid-js";
import { FaSolidSpinner, FaSolidPlay, FaSolidClock } from "solid-icons/fa";
import { FiCloudOff } from "solid-icons/fi";
import { RiArrowsArrowDownSLine } from "solid-icons/ri";
import FieldWrapper from "~/components/Field";

type SettingProps = { deviceId: DeviceId };

export function AudioSettingsTab(props: SettingProps) {
	// Simple test recording button
	const context = useDevice();
	const log = useLogsContext(); // Add this line
	const id = () => props.deviceId;

	const [audioFiles, { refetch: refetchAudioFiles }] = createResource(
		id,
		async (id) => {
			if (!id) return null;
			const res = await context.getAudioFiles(id);
			return res;
		},
	);
	const [audioStatus, { refetch: refetchAudioStatus }] = createResource(
		id,
		async (id) => {
			if (!id) return null;
			const res = await context.getAudioStatus(id);
			return res;
		},
	);
	const [currentStatusMonitor, setCurrentStatusMonitor] = createSignal();
	const monitorAudioStatus = () => {
		const currInterval = currentStatusMonitor();
		if (currInterval) {
			console.log("Clearing interval");
			clearInterval(currInterval as number);
		}
		const interval = setInterval(() => {
			if (audioStatus.loading) return;
			if (audioStatus()?.status === "ready") {
				if (!audioFiles.loading) {
					refetchAudioFiles();
				}
			}
			refetchAudioStatus();
		}, 10000);
		setCurrentStatusMonitor(interval);
	};

	onMount(() => {
		monitorAudioStatus();
	});

	const [audioMode, { refetch: refetchAudioMode }] = createResource(
		id,
		async (id) => {
			if (!id) return null;
			const device = context.devices.get(id);
			if (!device) return null;
			const res = await context.getAudioMode(device.url);
			return res;
		},
	);
	const [recording, setRecording] = createSignal(false);
	const [result, setResult] = createSignal<"failed" | "success" | null>(null);
	const createTestRecording = async () => {
		const res = await context.takeAudioRecording(id());
		setResult(res ? "success" : "failed");
		refetchAudioStatus();
	};

	const [config] = createResource(id, async (id) => {
		if (!id) return null;
		const res = await context.getDeviceConfig(id);
		return res;
	});

	function timeToMinutes(time: string): number {
		const [hours, minutes] = time.split(":").map(Number);
		return hours * 60 + minutes;
	}
	type PercentageRange = [number, number];
	function timeToPercentage(time: string): number {
		const [hours, minutes] = time.split(":").map(Number);
		const totalMinutes = hours * 60 + minutes;
		return Number.parseFloat(((totalMinutes / (24 * 60)) * 100).toFixed(2));
	}
	function calculateTimePercentagePoints(
		startTime: string,
		endTime: string,
	): [PercentageRange, PercentageRange | null] {
		const startPercentage = timeToPercentage(startTime);
		const endPercentage = timeToPercentage(endTime);

		if (startPercentage <= endPercentage) {
			return [[startPercentage, endPercentage], null];
		}
		return [
			[0, endPercentage],
			[startPercentage, 100],
		];
	}
	const thermalMode = (): [PercentageRange, PercentageRange | null] | null => {
		const windowConfig = config()?.values.windows;
		const windowDefaultConfig = config()?.defaults.windows;
		if (!windowConfig) return null;
		const startTime =
			(windowConfig.StartRecording
				? windowConfig.StartRecording
				: windowDefaultConfig?.StartRecording) ?? "-30m";
		const stopTime =
			(windowConfig.StopRecording
				? windowConfig.StopRecording
				: windowDefaultConfig?.StopRecording) ?? "+30m";
		if (startTime === "-30m" || startTime === "+30m")
			return [
				[0, 33],
				[66, 100],
			] as const;
		const res = calculateTimePercentagePoints(startTime, stopTime);
		return res;
	};
	const calcWidth = (range: PercentageRange) => {
		const [start, end] = range;
		const value = end - start;
		if (value === 0) return 100;
		return value;
	};
	const calcAudioWidth = (range: [PercentageRange, PercentageRange | null]) => {
		const [start, end] = range;
		let endWidth = 0;
		if (end) {
			endWidth = calcWidth(end);
		}
		const startWidth = calcWidth(start);
		const value = 100 - startWidth - endWidth;
		return value;
	};

	// --- Audio Seed Settings ---
	const [audioSettings, { refetch: refetchAudioSettings }] = createResource(
		id,
		async (id) => context.getAudioRecordingSettings(id),
	);
	const [seedValue, setSeed] = createSignal("");
	createEffect(
		on(audioSettings, (settings) => {
			setSeed(settings?.seed ?? "");
		}),
	);

	const [seedSaving, setSeedSaving] = createSignal(false);
	const saveSeed = async () => {
		const currentMode = audioMode();
		if (!currentMode || seedSaving()) return;

		setSeedSaving(true);
		await context.setAudioRecordingSettings(id(), currentMode, seedValue());
		await refetchAudioSettings();
		setSeedSaving(false);
	};

	// add debounce effect to auto-save after typing stops
	let seedSaveTimeout: ReturnType<typeof setTimeout>;
	const setSeedValue = (value: string) => {
		setSeed(value);
		clearTimeout(seedSaveTimeout);
		seedSaveTimeout = setTimeout(() => {
			// Do not save if the value is the same or if settings are still loading
			if (!audioSettings.loading && value !== audioSettings()?.seed) {
				saveSeed();
			}
		}, 5000);
	};

	onMount(() => {
		onCleanup(async () => {
			await saveSeed();
		});
	});

	// --- Long Recording Controls ---
	const [selectedDuration, setSelectedDuration] = createSignal<number | null>(
		300,
	); // Duration in seconds
	const [customSeconds, setCustomSeconds] = createSignal(60);
	const [initiatingLongRecording, setInitiatingLongRecording] =
		createSignal(false); // Tracks the API call itself
	const [lastLongRecordingDuration, setLastLongRecordingDuration] =
		createSignal<number | null>(null); // Stores the duration for result display
	const [longResult, setLongResult] = createSignal<"failed" | "success" | null>(
		null,
	);

	// Effect to show success/failure message when recording finishes
	createEffect(
		on(audioStatus, (currentStatus, prevStatus) => {
			// Check if the status transitioned *from* long_recording *to* ready
			if (
				prevStatus?.status === "long_recording" &&
				currentStatus?.status === "ready"
			) {
				// Assume success if the API call didn't explicitly fail
				if (longResult() !== "failed") {
					setLongResult("success");
				}
				// Show result message for a few seconds
				setTimeout(() => {
					setLongResult(null);
					setLastLongRecordingDuration(null);
				}, 5000);
			}
		}),
	);

	const startLongRecording = async () => {
		const duration = selectedDuration() ?? customSeconds();
		if (!duration) {
			log.logWarning({ message: "No duration selected for long recording." });
			return;
		}
		setInitiatingLongRecording(true);
		try {
			const success = await context.takeLongAudioRecording(id(), duration);
			if (success) {
				log.logSuccess({
					message: `Started long audio recording for ${duration / 60} minutes.`,
				});
				refetchAudioStatus();
			} else {
				log.logWarning({
					message: "Failed to start long audio recording.",
				});
			}
		} catch (error) {
			log.logError({
				message: "Error starting long audio recording",
				error,
			});
		} finally {
			setInitiatingLongRecording(false);
			// Also refresh status in case of failure or completion of the API call itself
			void context.getAudioStatus(id());
		}
	};

	createEffect(() => {
		console.log("Audio Status", audioStatus());
	});
	return (
		<section class="space-y-4 px-2 py-4">
			<div class="flex items-center  text-gray-800">
				<p class="pl-2">
					Audio recordings are made 32 times a day for one minute at random
					intervals.
				</p>
			</div>
			<h1 class="pl-2 font-medium text-gray-500">Settings</h1>
			<FieldWrapper type="custom" title="Audio Mode">
				<div class="flex w-full items-center">
					<select
						onChange={async (e) => {
							const value = e.currentTarget.value;
							await context.setAudioMode(id(), value as AudioMode);
							refetchAudioMode();
						}}
						value={audioMode() ?? "Loading..."}
						class="h-full w-full appearance-none bg-white pl-2"
					>
						<option value="Disabled">Disabled</option>
						<option value="AudioOnly">Audio Only</option>
						<option value="AudioAndThermal">Audio and Thermal</option>
						<option value="AudioOrThermal">Audio or Thermal</option>
					</select>
					<RiArrowsArrowDownSLine size={32} />
				</div>
			</FieldWrapper>
			<FieldWrapper type="custom" title="Audio Seed">
				<div class="flex w-full items-center">
					<input
						type="number"
						class="h-full w-full appearance-none bg-white pl-2"
						value={seedValue()}
						onInput={(e) => setSeedValue(e.currentTarget.value)}
						placeholder={audioSettings.loading ? "Loading..." : "Enter seed"}
						disabled={audioSettings.loading || seedSaving()}
					/>
				</div>
			</FieldWrapper>
			<div>
				<div class="flex items-center space-x-2 px-2">
					<div class="w-20" />
					<div class="flex w-full justify-between text-xs text-gray-500">
						<div>00:00</div>
						<div>12:00</div>
						<div>24:00</div>
					</div>
				</div>
				<div class="flex flex-col">
					<div class="flex items-center space-x-2 px-2">
						<Show when={thermalMode()}>
							{(thermalMode) => (
								<>
									<h2 class="w-20 text-gray-500">Thermal:</h2>
									<div class="relative flex h-5 w-full items-center rounded-full bg-gray-200 py-1">
										<Show when={audioMode() !== "AudioOnly"}>
											<div
												class="absolute h-3 rounded-full bg-green-300"
												style={{
													left: `${thermalMode()[0]}%`,
													width: `${calcWidth(thermalMode()[0])}%`,
												}}
											/>
											<Show when={thermalMode()[1]}>
												{(thermalMode) => (
													<div
														class="absolute h-3 rounded-full bg-green-300"
														style={{
															left: `${thermalMode()[0]}%`,
															width: `${calcWidth(thermalMode())}%`,
														}}
													/>
												)}
											</Show>
										</Show>
									</div>
								</>
							)}
						</Show>
					</div>

					<div class="flex items-center space-x-2 px-2">
						<Show when={thermalMode()}>
							{(thermalMode) => (
								<>
									<h2 class="w-20 text-gray-500">Audio:</h2>
									<div class="relative flex h-5 w-full items-center rounded-full bg-gray-200 py-1">
										<Switch>
											<Match
												when={
													audioMode() === "AudioOnly" ||
													audioMode() === "AudioAndThermal"
												}
											>
												<div
													class="absolute h-3 rounded-full bg-green-300"
													style={{
														width: "100%",
													}}
												/>
											</Match>
											<Match when={audioMode() === "AudioOrThermal"}>
												<div
													class="absolute h-3 rounded-full bg-green-300"
													style={{
														left: `${thermalMode()[0][1]}%`,
														width: `${calcAudioWidth(thermalMode())}%`,
													}}
												/>
											</Match>
										</Switch>
									</div>
								</>
							)}
						</Show>
					</div>
				</div>
			</div>
			<Show when={audioMode() !== "Disabled" && !audioMode.loading}>
				<div class="space-y-2 rounded-lg border p-3 pb-0 shadow-sm">
					<div class="flex items-center justify-between">
						<span class="block text-sm text-gray-600">Audio Recording</span>
						<p class="text-sm text-gray-500">
							<Switch>
								<Match
									when={
										audioStatus()?.status === "setting_up_long_recording" ||
										audioStatus()?.status === "pending" ||
										initiatingLongRecording()
									}
								>
									<span>Setting up...</span>
								</Match>
								<Match
									when={
										audioStatus()?.status === "long_recording" ||
										audioStatus()?.status === "test_recording"
									}
								>
									<span>Recording...</span>
								</Match>
								<Match when={audioStatus()?.status === "recording"}>
									<span>Busy with video...</span>
								</Match>
							</Switch>
						</p>
					</div>
					<div class="flex space-x-2">
						<button
							type="button"
							disabled={
								initiatingLongRecording() || audioStatus()?.status !== "ready"
							}
							class="col-span-1 rounded px-4 py-4 w-full text-sm transition bg-blue-500 text-white disabled:bg-gray-300 disabled:text-gray-500"
							onClick={() => {
								createTestRecording();
							}}
						>
							10 Sec
						</button>
						<Show when={context.devices.get(id())?.hasLongRecordingSupport}>
							<button
								type="button"
								disabled={
									initiatingLongRecording() || audioStatus()?.status !== "ready"
								}
								class="col-span-1 rounded px-4 py-4 w-full text-sm transition bg-blue-500 text-white disabled:bg-gray-300 disabled:text-gray-500"
								onClick={() => {
									startLongRecording();
								}}
							>
								5 min
							</button>
						</Show>
					</div>
					{/* Status/Result Display */}
					<div class=" text-center text-sm">
						{" "}
						{/* Added min-height */}
						<Show
							when={longResult() && audioStatus()?.status !== "long_recording"}
						>
							<span
								class={`${longResult() === "success" ? "text-green-600" : "text-red-600"}`}
							>
								{longResult() === "success"
									? `Recording (${lastLongRecordingDuration()}s) finished.`
									: `Recording (${lastLongRecordingDuration()}s) failed.`}
							</span>
						</Show>
					</div>
				</div>
			</Show>
		</section>
	);
}

