import type { AudioMode, DeviceId } from "~/contexts/Device";
import { useDevice } from "~/contexts/Device";
import type { Frame, Region, Track } from "~/contexts/Device/Camera";
import {
	Show,
	Switch,
	Match,
	createEffect,
	createMemo,
	createResource,
	createSignal,
	on,
	onCleanup,
	onMount,
} from "solid-js";
import {
	FaSolidCheck,
	FaSolidVideo,
	FaSolidSpinner,
} from "solid-icons/fa";
import { ImCross } from "solid-icons/im";
import { VsArrowSwap } from "solid-icons/vs";
import FieldWrapper from "~/components/Field";

type CameraCanvas = HTMLCanvasElement | undefined;
const colours = ["#ff0000", "#00ff00", "#ffff00", "#80ffff"];
type SettingProps = { deviceId: DeviceId };

export function CameraSettingsTab(props: SettingProps) {
	const context = useDevice();
	const device = () => context.devices.get(props.deviceId);
	const [audioStatus, { refetch: refetchAudioStatus }] = createResource(
		props.deviceId,
		async (id) => {
			if (!id) return null;
			const res = await context.getAudioStatus(id);
			console.log("Audio Status: ", res);
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
			refetchAudioStatus();
		}, 10000);
		setCurrentStatusMonitor(interval);
	};

	onMount(() => {
		monitorAudioStatus();
		onCleanup(() => {
			const currInterval = currentStatusMonitor();
			if (currInterval) {
				clearInterval(currInterval as number);
			}
		});
	});
	const id = () => props.deviceId;
	const [config, { refetch }] = createResource(id, async (id) => {
		if (!id) return null;
		const res = await context.getDeviceConfig(id);
		return res;
	});
	const [recording, setRecording] = createSignal(false);
	const [result, setResult] = createSignal<"failed" | "success" | null>(null);
	const createTestRecording = async () => {
		setRecording(true);
		const res = await context.takeTestRecording(id());
		setResult(res ? "success" : "failed");
		setRecording(false);
		setTimeout(() => setResult(null), 2000);
	};
	let frameCanvas: CameraCanvas;
	let trackCanvas: CameraCanvas;
	let triggerTrap: HTMLButtonElement | undefined;
	async function processFrame(frame: Frame) {
		if (!frameCanvas || !trackCanvas) {
			return;
		}
		updateCanvasSize(
			frameCanvas,
			frame.frameInfo.Camera.ResX,
			frame.frameInfo.Camera.ResY,
		);
		//updateCanvasSize(
		//  trackCanvas,
		//  frame.frameInfo.Camera.ResX,
		//  frame.frameInfo.Camera.ResY
		//);

		const context = frameCanvas.getContext("2d", {
			willReadFrequently: true,
		}) as CanvasRenderingContext2D;
		processImageData(context, frame);

		//const trackContext = trackCanvas.getContext(
		//  "2d"
		//) as CanvasRenderingContext2D;
		//trackContext.clearRect(0, 0, trackCanvas.width, trackCanvas.height);
		//renderTracks(trackContext, frame.frameInfo.Tracks);
	}

	function updateCanvasSize(
		canvas: HTMLCanvasElement,
		width: number,
		height: number,
	) {
		if (canvas.width !== width) {
			canvas.width = width;
		}
		if (canvas.height !== height) {
			canvas.height = height;
		}
	}

	function processImageData(context: CanvasRenderingContext2D, frame: Frame) {
		const imgData = context.getImageData(
			0,
			0,
			frame.frameInfo.Camera.ResX,
			frame.frameInfo.Camera.ResY,
		);
		const irCamera = frame.frameInfo.Camera.ResX >= 640;
		if (triggerTrap) triggerTrap.style.display = irCamera ? "" : "none";
		let max = 0;
		let min = 0;
		let range = 0;
		if (!irCamera) {
			[min, max] = calculateMinMax(frame.frame);
			range = max - min;
		}
		const scale = 255.0 / range;

		for (let i = 0; i < frame.frame.length; i++) {
			const pix = irCamera
				? frame.frame[i]
				: Math.min(255, (frame.frame[i] - min) * scale);
			const index = i * 4;
			imgData.data[index] = pix;
			imgData.data[index + 1] = pix;
			imgData.data[index + 2] = pix;
			imgData.data[index + 3] = 255;
		}
		context.putImageData(imgData, 0, 0);
	}

	function calculateMinMax(data: Uint16Array): [number, number] {
		let min = data[0];
		let max = data[0];

		for (let i = 1; i < data.length; i++) {
			if (data[i] < min) min = data[i];
			if (data[i] > max) max = data[i];
		}

		return [min, max];
	}

	function scalePixel(pixel: number, min: number, range: number): number {
		return Math.min(255, ((pixel - min) / range) * 255.0);
	}

	function renderTracks(
		context: CanvasRenderingContext2D,
		tracks: Track[] | null,
	) {
		if (!tracks) return;
		for (let index = 0; index < tracks.length; index++) {
			const track = tracks[index];
			const label = track.predictions?.[0]?.label || null;
			drawRectWithText(
				context,
				track.positions[track.positions.length - 1],
				label,
				index,
			);
		}
	}
	function drawRectWithText(
		context: CanvasRenderingContext2D,
		region: Region,
		what: string | null,
		trackIndex: number,
	): void {
		const lineWidth = 1;
		const outlineWidth = lineWidth + 4;
		const halfOutlineWidth = outlineWidth / 2;

		const x = Math.max(
			halfOutlineWidth,
			Math.round(region.x) - halfOutlineWidth,
		);
		const y = Math.max(
			halfOutlineWidth,
			Math.round(region.y) - halfOutlineWidth,
		);
		const width = Math.round(
			Math.min(context.canvas.width - region.x, Math.round(region.width)),
		);
		const height = Math.round(
			Math.min(context.canvas.height - region.y, Math.round(region.height)),
		);
		context.lineJoin = "round";
		context.lineWidth = outlineWidth;
		context.strokeStyle = "rgba(0, 0, 0,  0.5)";
		context.beginPath();
		context.strokeRect(x, y, width, height);
		context.strokeStyle = colours[trackIndex % colours.length];
		context.lineWidth = lineWidth;
		context.beginPath();
		context.strokeRect(x, y, width, height);
		// If exporting, show all the best guess animal tags, if not unknown
		if (what !== null) {
			const text = what;
			const textHeight = 9;
			const textWidth = context.measureText(text).width;
			const marginX = 2;
			const marginTop = 2;
			let textX =
				Math.min(context.canvas.width, region.x) - (textWidth + marginX);
			let textY = region.y + region.height + textHeight + marginTop;
			// Make sure the text doesn't get clipped off if the box is near the frame edges
			if (textY + textHeight > context.canvas.height) {
				textY = region.y - textHeight;
			}
			if (textX < 0) {
				textX = region.x + marginX;
			}
			context.font = "13px sans-serif";
			context.lineWidth = 4;
			context.strokeStyle = "rgba(0, 0, 0, 0.5)";
			context.strokeText(text, textX, textY);
			context.fillStyle = "white";
			context.fillText(text, textX, textY);
		}
	}

	const camera = createMemo(() => context.getDeviceCamera(id()));
	const [isRecieving, setIsRecieving] = createSignal(false);

	// Detect user activity to keep the feed active
	const [userActive, setUserActive] = createSignal(true);
	let userActivityTimeout: number | null = null;

	// Function to refresh user activity status
	const refreshUserActivity = () => {
		setUserActive(true);
		if (userActivityTimeout) {
			clearTimeout(userActivityTimeout);
		}

		// Reset timeout after 60 seconds of inactivity
		userActivityTimeout = setTimeout(() => {
			setUserActive(false);
		}, 60000) as unknown as number;
	};

	// Setup activity listeners
	onMount(() => {
		// Track user activity
		const activityEvents = [
			"mousemove",
			"mousedown",
			"keypress",
			"touchstart",
			"scroll",
		];
		const handleActivity = () => refreshUserActivity();

		// Add all event listeners
		for (const event of activityEvents) {
			document.addEventListener(event, handleActivity);
		}

		// Start with active status
		refreshUserActivity();

		const cam = camera();
		if (cam) {
			cam.toggle();
			cam.run();
			cam.setOnFrame(() => (frame) => {
				if (!isRecieving()) setIsRecieving(true);
				requestAnimationFrame(() => processFrame(frame));
			});
		}

		// Monitor connection status
		const connectionInterval = setInterval(() => {
			const cam = camera();
			// If user is active but connection isn't active, reconnect
			if (userActive() && cam && !cam.isConnected()) {
				console.log(
					"Camera feed disconnected but user is active, reconnecting...",
				);
				cam.run();
			}
		}, 5000);

		onCleanup(() => {
			// Remove all event listeners
			for (const event of activityEvents) {
				document.removeEventListener(event, handleActivity);
			}

			// Clear all timeouts and intervals
			if (userActivityTimeout) {
				clearTimeout(userActivityTimeout);
			}

			clearInterval(connectionInterval);
		});
	});

	const isDefault = () => {
		const windows = config()?.values.windows;
		const windowsDefault = config()?.defaults.windows;
		if (!windows || !windowsDefault) return false;
		if (
			!windows.PowerOn &&
			!windows.PowerOff &&
			!windows.StartRecording &&
			!windows.StopRecording
		)
			return true;
		if (
			windows.StartRecording === windowsDefault.StartRecording &&
			windows.StopRecording === windowsDefault.StopRecording &&
			windows.PowerOn === windowsDefault.PowerOn &&
			windows.PowerOff === windowsDefault.PowerOff
		) {
			return true;
		}
		return false;
	};

	const is24Hours = () => {
		const start = "12:00";
		const stop = "12:00";
		const windows = config()?.values.windows;
		if (!windows) return false;
		if (windows.PowerOn === start && windows.PowerOff === stop) return true;
		return false;
	};

	const isCustom = () => {
		return config.loading ? false : !isDefault() && !is24Hours();
	};

	const setTo24Hours = async () => {
		try {
			setShowCustom(false);
			const on = "12:00";
			const off = "12:00";
			const res = await context.setRecordingWindow(id(), on, off);
			refetch();
		} catch (error) {
			console.error("Set 24 Hour Error: ", error);
		}
	};

	const setToDefault = async () => {
		try {
			setShowCustom(false);
			const defaults = config()?.defaults;
			if (!defaults) return;
			const on = defaults.windows?.PowerOn ?? "-30min";
			const off = defaults.windows?.PowerOff ?? "+30min";
			const res = await context.setRecordingWindow(id(), on, off);
			refetch();
		} catch (error) {
			console.error(error);
		}
	};

	const [lowerTime, setLowerTime] = createSignal(0);
	const [upperTime, setUpperTime] = createSignal(100);
	const lowerTimeStr = () => percentToTime(lowerTime());
	const upperTimeStr = () => percentToTime(upperTime());
	const [showCustom, setShowCustom] = createSignal(false);
	createEffect(() => {
		const conf = config();
		if (config.loading || config.error || !conf?.values.windows) return;
		if (isCustom()) {
			setShowCustom(true);
			setLowerTime(timeToPercent(conf.values.windows.PowerOn));
			setUpperTime(timeToPercent(conf.values.windows.PowerOff));
		}
	});
	const percentToTime = (percent: number): string => {
		if (typeof percent !== "number" || percent < 0 || percent > 100) {
			return "Invalid input";
		}

		const totalMinutes = Math.round((percent / 100) * 1440);
		let hours = Math.floor(totalMinutes / 60);
		if (hours === 24) {
			hours = 0;
		}
		const mins = totalMinutes % 60;

		const formattedHours = hours.toString().padStart(2, "0");
		const formattedMinutes = mins.toString().padStart(2, "0");
		return `${formattedHours}:${formattedMinutes}`;
	};

	const [saving, setSaving] = createSignal(false);
	const saveCustomWindow = async () => {
		try {
			const on = lowerTimeStr();
			const off = upperTimeStr();
			setSaving(true);
			const res = await context.setRecordingWindow(id(), on, off);
			if (res) {
				refetch();
			}
		} catch (error) {
			console.error(error);
		}
		setSaving(false);
	};

	const timeToPercent = (time: string): number => {
		const [hours, mins] = time.split(":");
		const minutes = Number(hours) * 60 + Number(mins);
		return (minutes / 1440) * 100;
	};

	const saveIsDisabled = () => {
		const conf = config();
		if (config.loading || config.error || !conf?.values?.windows) return true;

		if (lowerTime() !== timeToPercent(conf.values.windows.PowerOn))
			return false;
		if (upperTime() !== timeToPercent(conf.values.windows.PowerOff))
			return false;
		return true;
	};

	const [audioMode] = createResource(async () => {
		try {
			const device = context.devices.get(id());
			if (!device) return null;
			const res = await context.getAudioMode(device.url);
			return res;
		} catch (error) {
			console.error(error);
			return null;
		}
	});

	createEffect(() => {
		console.log("Audio Status: ", audioStatus());
		console.log("Audio Mode: ", audioMode());
	});

	return (
		<section>
			<Switch>
				<Match when={audioMode() === "AudioOnly"}>
					<p class="w-full p-8 text-center text-2xl text-neutral-600">
						Preview not available in audio only mode.
					</p>
				</Match>
				<Match
					when={audioStatus() === null || audioStatus()?.status === "ready"}
				>
					<Show
						when={isRecieving()}
						fallback={
							<div
								style={{
									height: "269px",
								}}
								class="flex h-full items-center justify-center gap-x-2 bg-slate-50"
							>
								<FaSolidSpinner class="animate-spin" size={32} />
								<p>Starting Camera...</p>
							</div>
						}
					>
						<div class="relative">
							<canvas
								ref={frameCanvas}
								id="frameCanvas"
								width="160"
								height="120"
								class="w-full"
							/>
							<canvas
								ref={trackCanvas}
								id="trackCanvas"
								width="160"
								height="120"
								class="absolute left-0 top-0 z-10 w-full"
							/>
						</div>
					</Show>
					<button
						ref={triggerTrap}
						style={{ position: "relative", display: "none" }}
						type="button"
					>
						Trigger trap
					</button>
					<button
						class="flex w-full items-center justify-center space-x-2 rounded-b-lg bg-blue-500 py-3 text-white"
						type="button"
						onClick={() => createTestRecording()}
						disabled={recording()}
					>
						<Switch>
							<Match when={recording()}>
								<p>Recording...</p>
								<FaSolidSpinner class="animate-spin" size={24} />
							</Match>
							<Match when={result() === "success"}>
								<p>Success!</p>
								<FaSolidCheck size={24} />
							</Match>
							<Match when={result() === "failed"}>
								<ImCross size={12} />
							</Match>
							<Match when={!recording() && !result()}>
								<p>Test Recording</p>
								<FaSolidVideo size={24} />
							</Match>
						</Switch>
					</button>
				</Match>
				<Match
					when={
						audioStatus() &&
						audioStatus()?.status !== "ready" &&
						audioMode() !== "Disabled"
					}
				>
					<p class="w-full p-8 text-center text-2xl text-neutral-600">
						Camera not available due to audio recording.
					</p>
				</Match>
			</Switch>
			<div class="px-6 py-2">
				<h1 class="font-semibold text-gray-800">Recording Window</h1>
				<div class="flex w-full justify-between">
					<div class="flex items-center gap-x-2">
						<input
							id="default"
							type="radio"
							name="recording-window"
							value="default"
							checked={isDefault()}
							onChange={() => setToDefault()}
						/>
						<label for="default">Default</label>
					</div>
					<div class="flex items-center gap-x-2">
						<input
							id="24-hours"
							type="radio"
							name="recording-window"
							value="24-hours"
							checked={is24Hours()}
							onChange={() => setTo24Hours()}
						/>
						<label for="24-hours">24 Hours</label>
					</div>
					<div class="flex items-center gap-x-2">
						<input
							id="custom"
							type="radio"
							name="recording-window"
							value="custom"
							checked={isCustom()}
							onChange={() => setShowCustom(true)}
						/>
						<label for="custom">Custom</label>
					</div>
				</div>
				<Show when={isDefault() && !showCustom()}>
					<p class="flex pt-2 text-sm text-gray-600">
						<span class="text-xs md:text-md px-2">
							30 minutes before sunset and 30 minutes after sunrise based on the
							device's location and seasonal timing.
						</span>
					</p>
				</Show>
				<Show when={showCustom()}>
					<div>
						<div class="flex items-center justify-center space-x-2 py-2">
							<input
								id="lower"
								name="upper"
								type="time"
								class="w-24 rounded-l bg-slate-50 py-2 pl-2 text-sm text-gray-800 outline-none"
								value={lowerTimeStr()}
								onChange={(e) => {
									const value = timeToPercent(e.target.value);
									setLowerTime(value);
								}}
							/>
							<button
								type="button"
								onClick={() => {
									const lower = lowerTime();
									const upper = upperTime();
									setLowerTime(upper);
									setUpperTime(lower);
								}}
								class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-50 shadow-md"
							>
								<div class="p-2">
									<VsArrowSwap size={18} />
								</div>
							</button>
							<input
								id="upper"
								name="upper"
								type="time"
								class="w-24 rounded-r bg-slate-50 py-2 pl-2 text-sm text-gray-800 outline-none"
								value={upperTimeStr()}
								onChange={(e) => {
									const value = timeToPercent(e.target.value);
									setUpperTime(value);
								}}
							/>
						</div>
						<button
							type="button"
							classList={{
								"bg-blue-500 py-2 px-4 text-white": !saveIsDisabled(),
								"bg-gray-400 py-2 px-4 text-gray-500": saveIsDisabled(),
							}}
							class="flex w-full items-center justify-center space-x-2 rounded-lg  py-3 text-white"
							onClick={() => saveCustomWindow()}
							disabled={saveIsDisabled()}
						>
							{saving() ? "Saving..." : "Save"}
						</button>
					</div>
				</Show>
			</div>
		</section>
	);
}