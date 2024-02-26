import { Camera, CameraResultType } from "@capacitor/camera";
import { Dialog as Prompt } from "@capacitor/dialog";
import { debounce, leading } from "@solid-primitives/scheduled";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { AiFillEdit, AiOutlineInfoCircle } from "solid-icons/ai";
import {
	BiRegularCurrentLocation,
	BiRegularSave,
	BiRegularSignal1,
	BiRegularSignal2,
	BiRegularSignal3,
	BiRegularSignal4,
	BiRegularSignal5,
	BiSolidError,
} from "solid-icons/bi";
import { BsCameraVideoFill, BsWifiOff } from "solid-icons/bs";
import {
	FaRegularEye,
	FaRegularEyeSlash,
	FaRegularTrashCan,
	FaSolidCheck,
	FaSolidFileAudio,
	FaSolidLock,
	FaSolidLockOpen,
	FaSolidPlus,
	FaSolidSpinner,
	FaSolidStop,
	FaSolidVideo,
} from "solid-icons/fa";
import { FiCloudOff, FiDownload, FiMapPin } from "solid-icons/fi";
import {
	ImArrowLeft,
	ImArrowRight,
	ImCog,
	ImCross,
	ImNotification,
	ImSearch,
} from "solid-icons/im";
import { RiDeviceRouterFill, RiArrowsArrowRightSLine } from "solid-icons/ri";
import {
	TbCameraPlus,
	TbCurrentLocation,
	TbPlugConnectedX,
} from "solid-icons/tb";
import {
	For,
	JSX,
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
import { Portal } from "solid-js/web";
import ActionContainer from "~/components/ActionContainer";
import BackgroundLogo from "~/components/BackgroundLogo";
import CircleButton from "~/components/CircleButton";
import FieldWrapper from "~/components/Field";
import { GoToPermissions } from "~/components/GoToPermissions";
import { headerMap } from "~/components/Header";
import { WifiNetwork, useDevice } from "~/contexts/Device";
import { logError, logWarning } from "~/contexts/Notification";
import { useStorage } from "~/contexts/Storage";
import { BsWifi1, BsWifi2, BsWifi } from "solid-icons/bs";
import { useUserContext } from "~/contexts/User";
import { Effect, Stream, pipe } from "effect";
import { CameraInfo, Frame, Region, Track } from "~/contexts/Device/Camera";
import { VsArrowSwap } from "solid-icons/vs";
import { CapacitorHttp } from "@capacitor/core";
type CameraCanvas = HTMLCanvasElement | undefined;
const colours = ["#ff0000", "#00ff00", "#ffff00", "#80ffff"];

function AudioSettingsTab() {
	// Simple test recording button
	const context = useDevice();
	const [params] = useSearchParams();
	const id = () => params.deviceSettings;

	const [audioFiles, { refetch }] = createResource(id, async (id) => {
		if (!id) return null;
		const res = await context.getAudioFiles(id);
		return res;
	});
	const [recording, setRecording] = createSignal(false);
	const [result, setResult] = createSignal<"failed" | "success" | null>(null);
	const createTestRecording = async () => {
		setRecording(true);
		const res = await context.takeAudioRecording(id());
		setResult(res ? "success" : "failed");
		setRecording(false);
		refetch();
		setTimeout(() => setResult(null), 2000);
	};

	return (
		<section>
			<div class="flex items-center space-x-2 pl-2">
				<p class="text-sm text-slate-400">Audio Files:</p>
				<p>{audioFiles()?.length}</p>
			</div>
			<button
				class="flex w-full items-center justify-center space-x-2 rounded-lg bg-blue-500 py-3 text-white"
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
						<p>Failed</p>
						<ImCross size={12} />
					</Match>
					<Match when={!recording() && !result()}>
						<p>Test Recording</p>
						<FaSolidFileAudio size={24} />
					</Match>
				</Switch>
			</button>
		</section>
	);
}

type DualRangeProps = {
	lowerValue: number;
	upperValue: number;
	onLowerChange: (value: number) => void;
	onUpperChange: (value: number) => void;
	inverse: boolean;
};

function CameraSettingsTab() {
	const context = useDevice();

	const [params] = useSearchParams();
	const id = () => params.deviceSettings;
	const [config, { refetch }] = createResource(id, async (id) => {
		if (!id) return null;
		const res = await context.getDeviceConfig(id);
		return res;
	});
	createEffect(() => {
		console.log(config());
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
		let max = 0,
			min = 0,
			range = 0;
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
		context.strokeStyle = `rgba(0, 0, 0,  0.5)`;
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
	onMount(() => {
		const cam = camera();
		if (cam) {
			cam.toggle();
			cam.run();
			cam.setOnFrame(() => (frame) => {
				if (!isRecieving()) setIsRecieving(true);
				requestAnimationFrame(() => processFrame(frame));
			});
		}
	});
	onCleanup(() => camera()?.toggle());

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
		console.log(isDefault(), is24Hours());
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
			console.log(error);
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
			console.log(error);
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
				console.log("Success");
				refetch();
			}
		} catch (error) {
			console.log(error);
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

	return (
		<section>
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
				style="position: relative;display: none"
				type="button"
			>
				Trigger trap
			</button>
			<button
				class="flex w-full items-center justify-center space-x-2 rounded-b-lg bg-blue-500 py-3 text-white"
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
					<p class="flex pt-2 text-gray-600">
						<span class="inline-block">
							<AiOutlineInfoCircle size={22} />
						</span>
						<span class="text-ellipsis px-2">
							30 minutes before sunrise and 30 minutes after sunset based on the
							device's location and seasonal timing.
						</span>
					</p>
				</Show>
				<Show when={showCustom()}>
					<div>
						<div class="flex space-x-2 py-2 items-center justify-center py-4">
							<input
								id="lower"
								name="upper"
								type="time"
								class="rounded-l bg-slate-50 py-2 pl-2 text-sm text-gray-800 outline-none w-24"
								value={lowerTimeStr()}
								onChange={(e) => {
									const value = timeToPercent(e.target.value);
									setLowerTime(value);
								}}
							/>
							<div
								onClick={() => {
									const lower = lowerTime();
									const upper = upperTime();
									setLowerTime(upper);
									setUpperTime(lower);
								}}
								class="flex h-8 w-8 items-center justify-center rounded-full border border-2 border-slate-50 shadow-md"
							>
								<div class="p-2">
									<VsArrowSwap size={18} />
								</div>
							</div>
							<input
								id="upper"
								name="upper"
								type="time"
								class="rounded-r bg-slate-50 py-2 pl-2 text-sm text-gray-800 outline-none w-24"
								value={upperTimeStr()}
								onChange={(e) => {
									const value = timeToPercent(e.target.value);
									setUpperTime(value);
								}}
							/>
						</div>
						<button
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

function LocationSettingsTab() {
	const context = useDevice();
	const [params] = useSearchParams();
	const storage = useStorage();
	const [showLocationSettings, setShowLocationSettings] = createSignal(false);
	const id = () => params.deviceSettings;
	const groupName = () => context.devices.get(id())?.group ?? "";
	const isProd = () => context.devices.get(id())?.isProd ?? false;
	const shouldUpdateLocState = () => context.shouldDeviceUpdateLocation(id());

	createEffect((prev) => {
		const currUpdateLocState = shouldUpdateLocState();
		console.log("currUpdateLocState", currUpdateLocState);
		if (
			currUpdateLocState === "current" &&
			prev !== "current" &&
			prev !== "loading" &&
			context.devices.size === 1
		) {
			setShowLocationSettings(true);
		}
		if (currUpdateLocState !== "loading") {
			return currUpdateLocState;
		}
		return prev;
	}, "current");

	createEffect(() => {
		on(showLocationSettings, async (shown) => {
			if (!shown) return;
			await context?.setDeviceToCurrLocation(id());
		});
	});
	const [location, { refetch: refetchLocation }] = context.getLocationByDevice(
		id(),
	);

	createEffect(() => {
		on(
			() => shouldUpdateLocState(),
			async (shouldUpdate) => {
				if (shouldUpdate === "loading") return;
				refetchLocation();
			},
		);
	});

	const [LocationNameInput, setLocationNameInput] =
		createSignal<HTMLInputElement>();
	const [isEditing, setIsEditing] = createSignal(false);
	const toggleEditing = (state = !isEditing()) => {
		setIsEditing(state);
		if (isEditing()) {
			LocationNameInput()?.focus();
		} else {
			LocationNameInput()?.blur();
		}
	};

	const [newName, setNewName] = createSignal("");

	const [photoFilesToUpload, setPhotoFilesToUpload] = createSignal<
		{ file: string; url: string }[]
	>([]);

	const canSave = (): boolean =>
		location() === null
			? newName() !== ""
			: newName() !== "" || photoFilesToUpload().length > 0;

	const photos = () => [
		...(location()?.referencePhotos ?? []),
		...(location()?.uploadPhotos ?? []),
		...photoFilesToUpload(),
	];

	const addPhotoToDevice = async () => {
		try {
			const image = await Camera.getPhoto({
				quality: 100,
				allowEditing: false,
				resultType: CameraResultType.Uri,
				width: 500,
			});
			if (image.path && image.webPath) {
				setPhotoFilesToUpload((curr) => [
					...curr,
					{ file: image.path ?? "", url: image.webPath ?? "" },
				]);
				setPhotoIndex(photos().length - 1);
			}
		} catch (error) {
			logWarning({
				message: "Photo upload failed. Please check your device permissions.",
				action: <GoToPermissions />,
			});
		}
	};
	const [setting, setSetting] = createSignal(false);
	const saveLocationSettings = async () => {
		if (setting()) return;
		setSetting(true);
		const name = newName();
		const photoPaths = photoFilesToUpload();
		const deviceLocation = await context.getLocationCoords(id());
		const loc = location();
		if (!loc && deviceLocation.success) {
			await storage.createLocation({
				name,
				coords: {
					lat: deviceLocation.data.latitude,
					lng: deviceLocation.data.longitude,
				},
				groupName: groupName(),
				uploadPhotos: photoPaths.map((photo) => photo.file),
				isProd: isProd(),
			});
			await refetchLocation();
			setPhotoFilesToUpload([]);
			setNewName("");
			toggleEditing(false);
			setShowLocationSettings(false);
			setSetting(false);
			return;
		}
		if (name) {
			const loc = location();
			if (loc) {
				await storage.updateLocationName(loc, name);
				setNewName("");
			}
			await refetchLocation();
		}
		if (photoPaths.length > 0) {
			for (const { file } of photoPaths) {
				try {
					const loc = location();
					if (!loc) continue;
					await storage.updateLocationPhoto(loc, file);
					setPhotoFilesToUpload((curr) =>
						curr.filter((photo) => photo.file !== file),
					);
				} catch (error) {
					logError({
						message: "Could not save location photo",
						details: `Could not save photo ${file} for location ${loc}`,
						error,
					});
				}
			}
			await refetchLocation();
		}
		toggleEditing(false);
		setShowLocationSettings(false);
		setSetting(false);
	};

	const locationName = () => {
		const name = newName();
		if (name) return name;
		const loc = location();
		if (!loc) return "No Location Name";
		return loc.name;
	};

	const [photoIndex, setPhotoIndex] = createSignal(0);
	const hasPicture = () => photos().length > 0;

	// Server Side referencePhotos are first in the array
	const [photoReference] = createResource(
		() => [location(), photos(), photoIndex()] as const,
		async (values) => {
			const [loc, imgs, idx] = values;
			const img = imgs[idx];
			if (!img) return "";
			if (typeof img === "string") {
				if (!loc) return "";
				const data = await storage.getReferencePhotoForLocation(loc.id, img);
				return data ?? img;
			} else {
				return img.url;
			}
		},
	);

	const isImageToUpload = () => {
		const idx = photoIndex();
		const startOfUploads = (location()?.referencePhotos ?? []).length;
		return idx > startOfUploads;
	};

	const removePhotoReference = async () => {
		const idx = photoIndex();
		const image = photos()[idx];
		if (typeof image === "object") {
			setPhotoFilesToUpload((curr) => {
				return curr.filter((file) => file.file !== image.file);
			});
			setPhotoIndex((curr) => {
				if (curr > 0) return curr - 1;
				return 0;
			});
		} else {
			const loc = location();
			if (loc) {
				const prompt = await Prompt.confirm({
					title: "Confirm Deletion",
					message: "Are you sure you want to delete this photo?",
				});
				if (prompt.value) {
					const res = await storage.deleteReferencePhotoForLocation(loc, image);
					if (res) {
						setPhotoIndex((curr) => {
							if (curr > 0) return curr - 1;
							return 0;
						});
					}
				}
			}
		}
	};

	const [locCoords] = createResource(
		() => id(),
		async (id) => {
			const res = await context.getLocationCoords(id);
			if (res.success) return res.data;
			return null;
		},
	);
	const lat = () => locCoords()?.latitude ?? 0;
	const lng = () => locCoords()?.longitude ?? 0;

	return (
		<section class="px-4 py-4">
			<Show when={shouldUpdateLocState() === "needsUpdate"}>
				<div class="flex w-full flex-col items-center">
					<button
						class="my-2 flex space-x-2 self-center rounded-md bg-blue-500 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
						onClick={() => context.setDeviceToCurrLocation(id())}
					>
						<span class="text-sm">Update Location to Current</span>
						<FiMapPin size={18} />
					</button>
				</div>
			</Show>
			<Show
				when={
					(!location.loading && location()?.updateName) ||
					location()?.uploadPhotos?.length
				}
			>
				{(loc) => (
					<div class="mb-2 flex items-center justify-between space-x-2 rounded-lg border-2 border-blue-500 p-2">
						<div class="text-blue-600">
							<FiCloudOff size={18} />
						</div>
						<p class="flex space-x-2 text-sm text-blue-600">
							Location will be updated when you're logged in and connected to
							the internet.
						</p>
					</div>
				)}
			</Show>
			<div class="w-full">
				<div class="space-y-2">
					<p class="flex gap-x-2">
						<span class="text-slate-400">Lat:</span>
						<span>{lat()}</span>
						<span class="text-slate-400">Lng:</span>
						<span>{lng()}</span>
					</p>
					<div>
						<Show
							when={photoFilesToUpload().length && !newName() && !location()}
						>
							<p class="text-sm text-yellow-400">
								Add a name to save new location.
							</p>
						</Show>
						<p class="text-sm text-slate-400">Name:</p>
						<Show
							when={isEditing()}
							fallback={
								<div
									class="flex items-center justify-between"
									onClick={() => toggleEditing()}
								>
									<Show
										when={!location.loading && location()?.updateName}
										fallback={
											<>
												<h1 class="text-sm text-gray-800">{locationName()}</h1>
											</>
										}
									>
										{(loc) => (
											<h1 class="flex space-x-2 text-sm text-blue-600">
												{loc()}
											</h1>
										)}
									</Show>
									<button class="flex items-center rounded-lg bg-blue-600 px-2 py-1 text-white">
										{!location() ? "Add Location Name" : "Edit"}
										<AiFillEdit size={18} />
									</button>
								</div>
							}
						>
							<div class="flex">
								<input
									ref={setLocationNameInput}
									type="text"
									class="w-full rounded-l bg-slate-50 py-2 pl-2 text-sm text-gray-800 outline-none"
									placeholder={locationName() ?? "Location Name"}
									onInput={(e) =>
										setNewName((e.target as HTMLInputElement).value)
									}
								/>
								<button
									class="rounded-r bg-slate-50 px-4 py-2 text-gray-500"
									onClick={() => {
										setNewName("");
										toggleEditing();
									}}
								>
									<ImCross size={12} />
								</button>
							</div>
						</Show>
					</div>
					<div>
						<p class="text-sm text-slate-400">Photo Reference:</p>
						<div class="relative rounded-md bg-slate-100">
							<Show
								when={photoReference()}
								fallback={
									<button
										class="flex w-full flex-col items-center justify-center p-8  text-gray-700"
										onClick={() => addPhotoToDevice()}
									>
										<TbCameraPlus size={52} />
										<p class="text-sm text-gray-800">Add Photo</p>
									</button>
								}
							>
								<div class="absolute flex h-full w-full flex-col justify-between gap-2">
									<div class="flex w-full justify-between">
										<button
											class="flex h-10 w-10 items-center justify-center rounded-br-lg bg-slate-100 p-2 text-blue-500"
											onClick={() => addPhotoToDevice()}
										>
											<TbCameraPlus size={28} />
										</button>
										<button
											class="flex h-10 w-10 items-center justify-center rounded-bl-lg bg-slate-100 p-2 text-red-500"
											onClick={() => removePhotoReference()}
										>
											<FaRegularTrashCan size={22} />
										</button>
									</div>
									<div class="flex w-full justify-between">
										<button
											class="flex h-10 w-10 items-center justify-center rounded-r-full bg-slate-100 p-2 text-gray-500"
											onClick={() =>
												setPhotoIndex((i) =>
													i === 0 ? photos().length - 1 : i - 1,
												)
											}
										>
											<ImArrowLeft size={18} />
										</button>
										<button
											class="flex h-10 w-10 items-center justify-center rounded-l-full bg-slate-100 p-2 text-gray-500"
											onClick={() =>
												setPhotoIndex((i) =>
													i === photos().length - 1 ? 0 : i + 1,
												)
											}
										>
											<ImArrowRight size={18} />
										</button>
									</div>
									<div class="w-fit self-center rounded-lg bg-slate-50 p-1">
										{photoIndex() + 1}/{photos().length}
									</div>
								</div>
								<div
									classList={{
										"outline-blue-500 outline outline-2": isImageToUpload(),
									}}
									class="h-[18rem]"
								>
									<Show
										when={
											!photoReference.loading &&
											!photoReference.error &&
											photoReference()
										}
									>
										{(photo) => (
											<img
												src={photo()}
												class="h-[18rem] w-full rounded-md object-cover p-4"
											/>
										)}
									</Show>
								</div>
							</Show>
						</div>
					</div>
					<div
						classList={{
							hidden: !location() && !hasPicture() && !newName(),
						}}
						class="mt-4 flex justify-end space-x-2 text-gray-500"
					>
						<button
							classList={{
								"bg-blue-500 py-2 px-4 text-white rounded-md": canSave(),
								"bg-gray-200 py-2 px-4 text-gray-500 rounded-md": !canSave(),
							}}
							disabled={!canSave()}
							onClick={() => saveLocationSettings()}
						>
							<p>{location() ? "Update" : "Save"}</p>
						</button>
						<button
							class="text-gray-400"
							onClick={() => {
								setNewName("");
								setPhotoFilesToUpload([]);
								setShowLocationSettings(false);
							}}
							disabled={!canSave()}
						>
							<p>Cancel</p>
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}

function WifiSettingsTab() {
	const context = useDevice();
	const [params] = useSearchParams();
	const device = () => context.devices.get(params.deviceSettings);
	const [wifiNetworks, { refetch: refetchWifiNetowrks }] = createResource(
		() => [device(), context.apState()],
		async () => context.getWifiNetworks(device()?.id ?? ""),
	);
	const [currentWifi, { refetch }] = createResource(
		() => [device()],
		async () => context.getCurrentWifiNetwork(device()?.id ?? ""),
	);

	const [turnedOnModem] = createResource(async () => {
		const res = await context.turnOnModem(params.deviceSettings);
		return res;
	});

	const [savedWifi, { refetch: refetchSavedWifi }] = createResource(
		async () => {
			const saved = await context.getSavedWifiNetworks(device()?.id ?? "");
			console.log(saved);
			return saved;
		},
	);
	const [password, setPassword] = createSignal("");

	const getWifiIcon = (signal: number) => (
		<Switch>
			<Match when={signal <= 0}>
				<BsWifiOff size={28} />
			</Match>
			<Match when={signal < 34}>
				<BsWifi1 size={28} />
			</Match>
			<Match when={signal < 67}>
				<BsWifi2 size={28} />
			</Match>
			<Match when={signal >= 67}>
				<BsWifi size={28} />
			</Match>
		</Switch>
	);

	const sortWifi = (a: WifiNetwork, b: WifiNetwork) => {
		if (currentWifi()?.SSID === a.SSID) return -1;
		if (a.quality > b.quality) return -1;
		if (a.quality < b.quality) return 1;
		return 0;
	};

	const [openedNetwork, setOpenedNetwork] = createSignal<{
		SSID: string;
		quality: number;
		isSecured: boolean;
	} | null>(null);
	const [errorConnecting, setErrorConnecting] = createSignal<string | null>(
		null,
	);

	const [connecting, setConnecting] = createSignal<null | string>(null);
	const connectToWifi = async () => {
		setErrorConnecting(null);
		const wifi = openedNetwork();
		if (!wifi) return;
		setConnecting(wifi.SSID);
		const res = await context.connectToWifi(
			params.deviceSettings,
			wifi.SSID,
			password(),
		);
		setConnecting(null);
		if (res) {
			setPassword("");
			setOpenedNetwork(null);
		} else {
			setErrorConnecting("Could not connect to wifi. Please try again.");
		}
		context.searchDevice();
		refetch();
	};
	createEffect(() => {
		on(context.apState, () => {
			if (!connecting()) {
				refetch();
			}
		});
	});

	const [disconnected, setDisconnected] = createSignal(false);

	createEffect(() => {
		const state = context.apState();
		if (state === "connected") {
			setDisconnected(false);
		}
	});

	const disconnectFromWifi = async () => {
		setErrorConnecting(null);
		const res = await context.disconnectFromWifi(params.deviceSettings);
		refetch();
		if (res) {
			setDisconnected(true);
		} else {
			setErrorConnecting("Could not disconnect from wifi.\n Please try again.");
		}
		context.searchDevice();
	};

	const forgetWifi = async (ssid: string) => {
		setErrorConnecting(null);
		const res = await context.forgetWifi(params.deviceSettings, ssid);
		if (res) {
			if (currentWifi()?.SSID === ssid) {
				refetch();
				setDisconnected(true);
			}
		} else {
			setErrorConnecting("Could not forget wifi. Please try again.");
		}
		context.searchDevice();
	};

	let inputRef: HTMLInputElement | undefined;
	const [showPassword, setShowPassword] = createSignal(false);
	createEffect(() => {
		on(
			() => showPassword(),
			() => {
				inputRef?.focus();
			},
		);
	});

	createEffect(() => {
		on(wifiNetworks, () => {
			if (wifiNetworks() === null || wifiNetworks.error) {
				refetchWifiNetowrks();
			}
		});
	});

	// Interval check for current wifi
	onMount(() => {
		const interval = setInterval(() => {
			refetchWifiNetowrks();
			refetchSavedWifi();
			refetch();
		}, 10000);
		onCleanup(() => clearInterval(interval));
	});

	const [wifiConnectedToInternet] = createResource(
		() => [currentWifi()],
		async ([wifi]) => {
			if (!wifi) return "no-wifi";
			setErrorConnecting(null);
			const res = await context.checkDeviceWifiInternetConnection(
				params.deviceSettings,
			);
			return res ? "connected" : "disconnected";
		},
	);

	const [modem] = createResource(async () => {
		try {
			const res = await context.getModem(params.deviceSettings);
			console.log("MODEM", res);
			if (res === null) return null;
			if (typeof res === "number") return res / 5;
			return parseInt(res?.signal?.strength ?? "0") / 30;
		} catch (error) {
			console.log(error);
		}
	});

	const [modemConnectedToInternet] = createResource(
		() => [modem()],
		async ([currModem]) => {
			if (!currModem) return "no-modem";
			const res = await context.checkDeviceModemInternetConnection(
				params.deviceSettings,
			);
			return res ? "connected" : "disconnected";
		},
	);

	const [hasNetworkEndpoints] = createResource(async () => {
		const hasEndpoint = await context.hasNetworkEndpoints(
			params.deviceSettings,
		);
		console.log("HAS ENDPOINT", hasEndpoint);
		return hasEndpoint;
	});

	const LinkToNetwork = () => (
		<div class="flex w-full items-center justify-center py-2 text-lg text-blue-500">
			<A href={`/devices/${params.deviceSettings}/wifi-networks`}>
				Open Network Settings
			</A>
		</div>
	);

	const isSaved = (ssid: string) => {
		const saved = savedWifi();
		return saved?.includes(ssid);
	};
	const [showSaveNetwork, setShowSaveNetwork] = createSignal(false);
	const [ssid, setSsid] = createSignal("");
	const [saving, setSaving] = createSignal<"saving" | "saved" | "error" | null>(
		null,
	);
	const saveWifi = async () => {
		try {
			setSaving("saving");
			const res = await context.saveWifiNetwork(
				params.deviceSettings,
				ssid(),
				password(),
			);
			if (res) {
				setSaving("saved");
				refetchSavedWifi();
			} else {
				setSaving("error");
			}
			setTimeout(() => {
				setSaving(null);
			}, 3000);
		} catch (error) {
			console.log(error);
		}
	};

	return (
		<div class="flex w-full  flex-col space-y-2 px-2 py-2">
			<Show
				when={hasNetworkEndpoints.loading}
				fallback={
					<Show when={hasNetworkEndpoints()} fallback={LinkToNetwork()}>
						<section class="w-full space-y-2">
							<FieldWrapper
								type="custom"
								title={
									<div class="flex items-center justify-center gap-x-2">
										<div
											classList={{
												"bg-yellow-300": modemConnectedToInternet.loading,
												"bg-gray-400":
													modemConnectedToInternet() === "no-modem",
												"bg-green-500":
													modemConnectedToInternet() === "connected",
												"bg-red-500":
													modemConnectedToInternet() === "disconnected",
											}}
											class="h-2 w-2 rounded-full transition-colors"
										/>
										<p>Modem</p>
									</div>
								}
							>
								<div class="space-between flex h-full w-full items-center justify-between p-2">
									<Switch>
										<Match when={modemConnectedToInternet.loading}>
											<FaSolidSpinner class="animate-spin" />
										</Match>
										<Match when={modemConnectedToInternet() === "no-modem"}>
											<p>-</p>
										</Match>
										<Match when={modemConnectedToInternet() === "connected"}>
											<p>Internet Connection</p>
										</Match>
										<Match when={modemConnectedToInternet() === "disconnected"}>
											<p>No Mobile Data</p>
										</Match>
									</Switch>
									<Show when={modem()}>
										{(modem) => (
											<Switch>
												<Match when={modem() <= 0.2}>
													<BiRegularSignal1 size={28} />
												</Match>
												<Match when={modem() <= 0.4}>
													<BiRegularSignal2 size={28} />
												</Match>
												<Match when={modem() <= 0.6}>
													<BiRegularSignal3 size={28} />
												</Match>
												<Match when={modem() <= 0.8}>
													<BiRegularSignal4 size={28} />
												</Match>
												<Match when={modem() <= 1}>
													<BiRegularSignal5 size={28} />
												</Match>
											</Switch>
										)}
									</Show>
								</div>
							</FieldWrapper>
							<FieldWrapper
								type="custom"
								title={
									<div class="flex items-center justify-center gap-x-2">
										<div
											classList={{
												"bg-yellow-300": wifiConnectedToInternet.loading,
												"bg-gray-400": wifiConnectedToInternet() === "no-wifi",
												"bg-green-500":
													wifiConnectedToInternet() === "connected",
												"bg-red-500":
													wifiConnectedToInternet() === "disconnected",
											}}
											class="h-2 w-2 rounded-full transition-colors"
										/>
										<p>WiFi</p>
									</div>
								}
							>
								<div class="flex h-full w-full items-center justify-between p-2">
									<p>
										{currentWifi()?.SSID !== "" ? currentWifi()?.SSID : "-"}
									</p>
								</div>
							</FieldWrapper>
						</section>
						<Show
							when={currentWifi() || !currentWifi.loading || !currentWifi.error}
							fallback={
								<div class="flex w-full items-center justify-center">
									<FaSolidSpinner size={28} class="animate-spin" />
								</div>
							}
						>
							<section class="flex h-64 flex-col space-y-2 overflow-y-auto rounded-md bg-neutral-100 p-2">
								<For each={wifiNetworks()?.sort(sortWifi)}>
									{(val) => (
										<button
											classList={{
												"bg-white": currentWifi()?.SSID === val.SSID,
												"bg-gray-50": currentWifi()?.SSID !== val.SSID,
											}}
											class="flex w-full items-center justify-between rounded-md px-4 py-4"
											onClick={() => setOpenedNetwork(val)}
										>
											<div class="flex space-x-2">
												{getWifiIcon(val.quality)}
												<div class="flex flex-col items-start justify-center">
													<p class="text-start text-slate-900">{val.SSID}</p>
													<div class=" flex gap-x-1 text-xs text-slate-600">
														<Show when={val.SSID === currentWifi()?.SSID}>
															<Switch>
																<Match
																	when={
																		wifiConnectedToInternet() === "connected"
																	}
																>
																	<p>Internet Connection</p>
																</Match>
																<Match
																	when={
																		wifiConnectedToInternet() === "disconnected"
																	}
																>
																	<p>No Internet Connection</p>
																</Match>
															</Switch>
														</Show>
														<Show
															when={
																val.SSID === currentWifi()?.SSID &&
																isSaved(val.SSID)
															}
														>
															<p>|</p>
														</Show>
														<Show when={isSaved(val.SSID)}>
															<p>Saved</p>
														</Show>
													</div>
												</div>
											</div>
											<Show when={val.SSID !== currentWifi()?.SSID}>
												<Show
													when={val.isSecured}
													fallback={<FaSolidLockOpen />}
												>
													<div class="text-gray-800">
														<FaSolidLock />
													</div>
												</Show>
											</Show>
										</button>
									)}
								</For>
								<For
									each={savedWifi()?.filter(
										(val) =>
											val !== "" &&
											val !== currentWifi()?.SSID &&
											!wifiNetworks()?.some((wifi) => wifi.SSID === val) &&
											val.toLowerCase() !== "bushnet",
									)}
								>
									{(val) => (
										<button
											class="flex w-full items-center justify-between rounded-md bg-gray-50 px-4 py-4"
											onClick={() =>
												setOpenedNetwork({
													SSID: val,
													quality: 0,
													isSecured: false,
												})
											}
										>
											<div class="flex space-x-2 text-gray-600">
												<BiRegularSave size={28} />
												<div class="flex flex-col items-start justify-center">
													<p class="text-start text-slate-900">{val}</p>
												</div>
											</div>
										</button>
									)}
								</For>
							</section>
							<section>
								<button
									onClick={() => setShowSaveNetwork(true)}
									class="flex w-full items-center justify-center space-x-2 pb-3 pt-5 text-lg text-blue-700"
								>
									<p>Add Network</p>
									<FaSolidPlus size={20} />
								</button>
							</section>
						</Show>
					</Show>
				}
			>
				<div>
					<div class="flex w-full items-center justify-center">
						<FaSolidSpinner size={28} class="animate-spin" />
					</div>
				</div>
			</Show>
			<Portal>
				<Show when={openedNetwork()}>
					{(wifi) => (
						<div class="fixed left-1/2 top-1/2 z-40 h-auto w-11/12 -translate-x-1/2 -translate-y-1/2 transform rounded-xl border bg-white px-3 py-4  shadow-lg">
							<div class="flex justify-between px-4 pb-2">
								<div class="flex items-center space-x-4">
									{getWifiIcon(wifi().quality)}
									<h1 class="text-lg text-neutral-800">{wifi().SSID}</h1>
								</div>
								<button
									onClick={() => {
										setPassword("");
										setErrorConnecting(null);
										setOpenedNetwork(null);
									}}
									class="text-gray-500"
								>
									<ImCross size={12} />
								</button>
							</div>
							<p class="whitespace-pre-line px-3 py-2 text-red-500">
								{errorConnecting()}
							</p>
							<Show
								when={!currentWifi() || wifi().SSID !== currentWifi()?.SSID}
								fallback={
									<>
										<Show
											when={disconnected()}
											fallback={
												<div class="flex space-x-2">
													<button
														class="flex w-full items-center justify-center rounded-md bg-blue-500 py-3 text-white"
														onClick={() => {
															disconnectFromWifi();
															context.searchDevice();
														}}
													>
														<p>Disconnect</p>
													</button>
													<Show
														when={
															wifi().SSID.toLowerCase() !== "bushnet" &&
															isSaved(wifi().SSID)
														}
													>
														<button
															class="flex w-full items-center justify-center rounded-md bg-blue-500 py-3 text-white"
															onClick={() => {
																forgetWifi(wifi().SSID);
																context.searchDevice();
															}}
														>
															<p>Forget</p>
														</button>
													</Show>
												</div>
											}
										>
											<div>
												<p class="whitespace-pre-line pb-2 text-green-500">
													Successfully disconnected from WiFi.\n Would you like
													to try to connect to it?
												</p>
												<button
													class="flex w-full items-center justify-center rounded-md bg-blue-500 py-3 text-white"
													onClick={async () => {
														context.connectToDeviceAP();
													}}
													disabled={context.apState() === "loading"}
												>
													{context.apState() === "loading"
														? "Connecting..."
														: "Connect to Device"}
												</button>
											</div>
										</Show>
									</>
								}
							>
								<Show when={connecting() === wifi().SSID}>
									<p class="px-2 pb-2">
										To continue accessing this device, please ensure you are
										connected to the same WiFi network.
									</p>
								</Show>
								<div class="flex w-full flex-col items-center space-y-2 px-2">
									<Show
										when={
											wifi().isSecured &&
											!isSaved(wifi().SSID) &&
											connecting() !== wifi().SSID
										}
									>
										<div class="flex w-full items-center space-x-2">
											<input
												class="w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
												type={showPassword() ? "text" : "password"}
												ref={inputRef}
												placeholder="Password"
												required
												value={password()}
												onInput={(e) =>
													setPassword((e.target as HTMLInputElement).value)
												}
											/>
											<button
												type="button"
												class="px-2 text-neutral-500"
												onClick={() => setShowPassword(!showPassword())}
											>
												<Show
													when={!showPassword()}
													fallback={<FaRegularEye size={24} />}
												>
													<FaRegularEyeSlash size={24} />
												</Show>
											</button>
										</div>
									</Show>
									<div class="flex w-full items-center space-x-2">
										<button
											type="submit"
											class="flex w-full items-center justify-center space-x-2 rounded-md bg-blue-500 py-3 text-white"
											disabled={
												(showPassword() && password().length < 8) ||
												connecting() === wifi().SSID
											}
											onClick={(e) => {
												e.preventDefault();
												connectToWifi();
											}}
										>
											<Show
												when={connecting() === wifi().SSID}
												fallback={<p>Connect</p>}
											>
												<p>Connecting...</p>
											</Show>
										</button>
										<Show
											when={
												wifi().SSID.toLowerCase() !== "bushnet" &&
												isSaved(wifi().SSID)
											}
										>
											<button
												class="flex w-full items-center justify-center rounded-md bg-blue-500 py-3 text-white"
												onClick={() => {
													forgetWifi(wifi().SSID);
													context.searchDevice();
												}}
											>
												<p>Forget</p>
											</button>
										</Show>
									</div>
								</div>
							</Show>
						</div>
					)}
				</Show>
			</Portal>
			<Portal>
				<Show when={showSaveNetwork()}>
					<div class="fixed left-1/2 top-1/2 z-40 h-auto w-11/12 -translate-x-1/2 -translate-y-1/2 transform rounded-xl border bg-white px-3 py-4  shadow-lg">
						<div class="flex justify-between px-4 pb-2">
							<h1 class="text-lg text-neutral-800">Save Network</h1>
							<button
								onClick={() => {
									setShowSaveNetwork(false);
								}}
								class="text-gray-500"
							>
								<ImCross size={12} />
							</button>
						</div>
						<p class="whitespace-pre-line px-3 py-2 text-red-500">
							{errorConnecting()}
						</p>
						<form class="flex w-full flex-col items-center space-y-2 px-2">
							<input
								type="text"
								value={ssid()}
								class="w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
								placeholder="SSID"
								min={1}
								disabled={["saved", "saving"].includes(saving() ?? "")}
								onInput={(e) => setSsid((e.target as HTMLInputElement).value)}
							/>
							<div class="flex w-full items-center space-x-2">
								<input
									class="w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
									type={showPassword() ? "text" : "password"}
									placeholder="Password"
									required
									value={password()}
									min={8}
									max={64}
									onInput={(e) =>
										setPassword((e.target as HTMLInputElement).value)
									}
								/>
								<button
									type="button"
									class="px-2 text-neutral-500"
									onClick={() => setShowPassword(!showPassword())}
								>
									<Show
										when={!showPassword()}
										fallback={<FaRegularEye size={24} />}
									>
										<FaRegularEyeSlash size={24} />
									</Show>
								</button>
							</div>
							<button
								class="flex w-full items-center justify-center space-x-2 rounded-md bg-blue-500 py-3 text-white"
								onClick={(e) => {
									e.preventDefault();
									saveWifi();
								}}
							>
								<p>
									{saving() === "saving"
										? "Saving..."
										: saving() === "error"
										  ? "Failed Saved..."
										  : saving() === "saved"
											  ? "Saved"
											  : "Save"}
								</p>
							</button>
						</form>
					</div>
				</Show>
			</Portal>
		</div>
	);
}

function GeneralSettingsTab() {
	const user = useUserContext();
	const context = useDevice();
	const [params] = useSearchParams();
	const device = () => context.devices.get(params.deviceSettings);
	const id = () => device()?.id ?? "";
	const saltId = () => device()?.saltId ?? "";
	const name = () => device()?.name ?? "";
	const groupName = () => device()?.group ?? "";
	createEffect(() => {
		console.log("DEVICE", device());
	});
	const setGroup = async (v: string) => {
		if (!user.groups()?.some((g) => g.groupName === v)) {
			const res = await user.createGroup(v);
			if (!res.success) {
				throw new Error(res.messages.join("\n"));
			}
		}
		const res = await context.changeGroup(id(), v);
	};
	const [canUpdate, { refetch }] = createResource(async () => {
		const res = await context.canUpdateDevice(id());
		return res;
	});

	onMount(() => {
		user.refetchGroups();
	});

	createEffect(() => {
		if (!canUpdate.loading) {
			if (!canUpdate()) {
				setTimeout(() => {
					refetch();
				}, 5000);
			}
		}
	});

	const [canChangeGroup] = createResource(async () => {
		const res = await context.checkDeviceWifiInternetConnection(
			params.deviceSettings,
		);
		return res;
	});

	const message = () =>
		canChangeGroup() === false
			? "Device must be connected to WiFi to change group"
			: "";

	const softwareUpdateMessage = () => {
		if (canUpdate.loading) return "Checking for update...";
		if (context.isDeviceUpdating(id())) return "Updating...";
		if (context.didDeviceUpdate(id()) === false) return "Failed to Update";
		if (context.didDeviceUpdate(id()) === true) return "Update Complete";
		if (canUpdate()) return "Software Update";
		return "No Update Available";
	};

	const onOpenGroups = async () => {
		const currUser = await user.getUser();
		if (!currUser) {
			// Prompt to login
			const res = await Prompt.confirm({
				title: "Login Required",
				message:
					"To modify the group, you must be logged in. Would you like to login?",
			});
			if (res) {
				user.logout();
				return false;
			}
		}
		user.refetchGroups();
		return true;
	};
	return (
		<div class="flex w-full flex-col space-y-2 px-2 py-4">
			<FieldWrapper type="text" value={name()} title="Name" />
			<FieldWrapper
				type="dropdown"
				value={groupName()}
				title="Group"
				onChange={setGroup}
				shouldOpen={onOpenGroups}
				options={user.groups()?.map(({ groupName }) => groupName) ?? []}
				disabled={canChangeGroup.loading || !canChangeGroup()}
				message={message()}
			/>
			<FieldWrapper type="text" value={saltId() ?? id()} title="ID" />
			<button
				classList={{
					"bg-blue-500 py-2 px-4 text-white rounded-md": Boolean(canUpdate?.()),
					"bg-gray-400 py-2 px-4 text-gray-500 rounded-md": !canUpdate(),
				}}
				disabled={!canUpdate?.()}
				class="flex w-full items-center justify-center space-x-2 rounded-md bg-blue-500 px-4 py-3 text-white "
				onClick={() => context.updateDevice(id())}
			>
				{softwareUpdateMessage()}
			</button>
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

function DeviceSettingsModal() {
	const context = useDevice();
	const user = useUserContext();
	const [params, setParams] = useSearchParams();
	const currTab = () => params.tab ?? "Camera";
	const navItems = () => {
		const items = ["Camera", "General", "Network", "Location"] as const;
		if (user.dev()) {
			return [...items, "Audio"] as const;
		} else {
			return items;
		}
	};
	const isConnected = () =>
		context.devices.get(params.deviceSettings)?.isConnected;
	const show = () => Boolean(params.deviceSettings);

	const clearParams = () => {
		setParams({ deviceSettings: undefined, tab: undefined });
	};

	const setCurrNav = (nav: ReturnType<typeof navItems>[number]) => {
		console.log(nav);
		setParams({ tab: nav });
	};

	const deviceName = () => {
		const deviceName = context.devices.get(params.deviceSettings)?.name;
		if (!deviceName) {
			clearParams();
		}
		return deviceName;
	};

	return (
		<Show when={show()}>
			<div class="fixed left-1/2 top-24 z-40 h-auto w-11/12 -translate-x-1/2 transform rounded-xl border bg-white shadow-lg">
				<header class="flex justify-between px-4">
					<div class="flex items-center py-4">
						<Show
							when={!isConnected()}
							fallback={<BsCameraVideoFill size={32} />}
						>
							<TbPlugConnectedX size={32} />
						</Show>
						<h1 class="pl-2 text-lg font-medium text-slate-600">
							{deviceName()}
						</h1>
					</div>
					<button onClick={() => clearParams()} class="text-gray-500">
						<ImCross size={12} />
					</button>
				</header>
				<nav class="flex w-full justify-between">
					<For each={navItems()}>
						{(nav) => (
							<button
								classList={{
									"text-green-400": currTab() === nav,
									"bg-gray-100 text-slate-400": currTab() !== nav,
								}}
								class="w-full px-2 py-4"
								onClick={() => setCurrNav(nav)}
							>
								{nav}
							</button>
						)}
					</For>
				</nav>
				<Switch>
					<Match when={currTab() === "General"}>
						<GeneralSettingsTab />
					</Match>
					<Match when={currTab() === "Network"}>
						<WifiSettingsTab />
					</Match>
					<Match when={currTab() === "Location"}>
						<LocationSettingsTab />
					</Match>
					<Match when={currTab() === "Camera"}>
						<CameraSettingsTab />
					</Match>
					<Match when={currTab() === "Audio" && user.dev()}>
						<AudioSettingsTab />
					</Match>
				</Switch>
			</div>
		</Show>
	);
}

interface DeviceDetailsProps {
	id: string;
	name: string;
	groupName: string;
	isConnected: boolean;
	url?: string;
	isProd: boolean;
}

function DeviceDetails(props: DeviceDetailsProps) {
	const context = useDevice();
	const storage = useStorage();
	const savedRecs = () =>
		storage
			.savedRecordings()
			.filter((rec) => rec.device === props.id && !rec.isUploaded);
	const deviceRecs = () => context.deviceRecordings.get(props.id) ?? [];
	const savedEvents = () =>
		storage
			.savedEvents()
			.filter((event) => event.device === props.id && !event.isUploaded);
	const eventKeys = () => context.deviceEventKeys.get(props.id) ?? [];
	const disabledDownload = () => {
		const hasRecsToDownload =
			deviceRecs().length > 0 && deviceRecs().length !== savedRecs().length;
		const hasEventsToDownload =
			eventKeys().length > 0 && savedEvents().length !== eventKeys().length;
		return !hasRecsToDownload && !hasEventsToDownload;
	};
	const [params, setParams] = useSearchParams();

	const navigate = useNavigate();
	const openDeviceInterface = leading(
		debounce,
		() => {
			if (!props.isConnected) return;
			setParams({ deviceSettings: props.id });
		},
		800,
	);

	const [showTooltip, setShowTooltip] = createSignal(false);

	const updateLocState = () => context.shouldDeviceUpdateLocation(props.id);

	return (
		<ActionContainer
			disabled={!props.isConnected}
			action={
				<Show when={props.isConnected}>
					<button class="text-blue-500" onClick={() => openDeviceInterface()}>
						<RiArrowsArrowRightSLine size={32} />
					</button>
				</Show>
			}
		>
			<div class=" flex items-center justify-between px-2">
				<div class="w-full" onClick={() => openDeviceInterface()} role="button">
					<div class="flex items-center space-x-2 ">
						<Show when={!props.isProd}>
							<ImCog size={20} />
						</Show>
						<h1 class="break-all text-left sm:text-lg">{props.name}</h1>
					</div>
					<div class="mt-2 flex w-full items-center space-x-2 text-slate-700">
						<BsCameraVideoFill size={20} />
						<p class="text-sm">
							Recordings Saved: {savedRecs().length}/{deviceRecs().length}{" "}
						</p>
					</div>
					<div class="mt-2 flex w-full items-center space-x-2 text-slate-700">
						<ImNotification size={20} />
						<p class="text-sm">
							Events Saved:{" "}
							{
								storage.savedEvents().filter((val) => val.device === props.id)
									.length
							}
							/{context.deviceEventKeys.get(props.id)?.length ?? 0}{" "}
						</p>
					</div>
				</div>
				<Show
					when={props.isConnected}
					fallback={
						<div class="px-8 text-neutral-700">
							<TbPlugConnectedX size={32} />
						</div>
					}
				>
					<div class=" flex items-center space-x-6 px-2 text-blue-500">
						<Show
							when={!context.devicesDownloading.has(props.id)}
							fallback={
								<button
									class="text-red-500"
									onClick={() => context.stopSaveItems(props.id)}
								>
									<FaSolidStop size={28} />
								</button>
							}
						>
							<button
								class={`${
									disabledDownload() ? "text-slate-300" : "text-blue-500"
								}`}
								disabled={disabledDownload()}
								onClick={() => context.saveItems(props.id)}
							>
								<FiDownload size={28} />
							</button>
						</Show>
						<button
							class="relative text-blue-500"
							disabled={
								context.locationBeingSet.has(props.id) ||
								["loading", "unavailable"].includes(updateLocState())
							}
							title={
								updateLocState() === "unavailable"
									? "Please enable permissions in your settings."
									: ""
							}
							onClick={() => {
								openDeviceInterface();
								setParams({ tab: "Location" });
							}}
							onTouchStart={() =>
								updateLocState() === "unavailable" && setShowTooltip(true)
							}
							onTouchEnd={() => setShowTooltip(false)}
							onMouseEnter={() =>
								updateLocState() === "unavailable" && setShowTooltip(true)
							}
							onMouseLeave={() => setShowTooltip(false)}
						>
							<Show when={showTooltip()}>
								<div class="relative">
									<div class="absolute bottom-full right-0 mb-2 -translate-x-0.5 transform whitespace-nowrap rounded bg-gray-700 p-1 text-xs text-white">
										Please enable permissions in your settings.
									</div>
								</div>
							</Show>
							<Switch>
								<Match
									when={
										updateLocState() === "loading" ||
										context.locationBeingSet.has(props.id)
									}
								>
									<FaSolidSpinner size={28} class="animate-spin" />
								</Match>
								<Match when={updateLocState() === "current"}>
									<BiRegularCurrentLocation size={28} />
								</Match>
								<Match when={updateLocState() === "unavailable"}>
									<div class="text-gray-200">
										<BiRegularCurrentLocation size={28} />
									</div>
								</Match>
								<Match when={updateLocState() === "needsUpdate"}>
									<div class="text-yellow-400">
										<TbCurrentLocation size={28} />
									</div>
								</Match>
							</Switch>
						</button>
					</div>
				</Show>
			</div>
		</ActionContainer>
	);
}

export function isKeyOfObject<T extends object>(
	key: string | number | symbol,
	obj: T,
): key is keyof T {
	return key in obj;
}

function Devices() {
	const context = useDevice();
	const devices = () => [...context.devices.values()];
	const [locPromptCancelled, setPromptCancel] = createSignal(false);

	onMount(() => {
		// Add delete button to header
		const header = headerMap.get("/devices");
		if (!header || header?.[1]) return;
		headerMap.set("/devices", [
			header[0],
			() => (
				<Show
					when={context.apState() !== "loading" && context.apState()}
					fallback={
						<span class="text-blue-500">
							<FaSolidSpinner size={28} class="animate-spin" />
						</span>
					}
				>
					{(state) => (
						<button
							onClick={async () => {
								if (state() === "connected") {
									const dialog = await Prompt.confirm({
										title: "Disconnect from Device",
										message:
											"You are currently connected to the device's WiFi network. Disconnect from the device to connect to another network?",
									});
									if (dialog.value) {
										context.disconnectFromDeviceAP();
									}
								} else {
									context.connectToDeviceAP();
								}
							}}
							classList={{
								"text-blue-500": state() === "default",
								"text-highlight": state() === "connected",
								"text-red-500": state() === "disconnected",
							}}
						>
							<RiDeviceRouterFill size={28} />
						</button>
					)}
				</Show>
			),
		]);
	});

	onMount(async () => {
		context.searchDevice();
		const search = setInterval(
			() => {
				context.searchDevice();
			},
			60 * 1000 * 1,
		);

		onCleanup(() => {
			clearInterval(search);
		});
	});

	const [, setParams] = useSearchParams();
	const [isDialogOpen, setIsDialogOpen] = createSignal(false);
	createEffect(
		on(
			() => {
				if (context.devicesLocToUpdate.loading) return false;
				return [context.devicesLocToUpdate(), context.isDiscovering()] as const;
			},
			async (sources) => {
				if (!sources) return;
				const [devices, isDiscovering] = sources;
				if (!devices || isDiscovering) return;

				const devicesToUpdate = devices.filter(
					(val) => !context.locationBeingSet.has(val),
				);
				if (
					devicesToUpdate.length === 0 ||
					locPromptCancelled() ||
					isDialogOpen()
				)
					return;
				if (isDialogOpen()) return;
				const message =
					devicesToUpdate.length === 1
						? `${
								context.devices.get(devicesToUpdate[0])?.name
						  } has a different location stored. Would you like to update it to your current location?`
						: `${devicesToUpdate
								.map((val) => context.devices.get(val)?.name)
								.join(
									", ",
								)} have different location stored. Would you like to update them to the current location?`;

				setIsDialogOpen(true);
				const { value } = await Prompt.confirm({
					title: "Update Location",
					message,
				});
				setIsDialogOpen(false);
				if (value) {
					for (const device of devicesToUpdate) {
						await context.setDeviceToCurrLocation(device);
					}
					setParams({ deviceSettings: devicesToUpdate[0], tab: "Location" });
				} else {
					setPromptCancel(true);
				}
			},
		),
	);

	return (
		<>
			<section class="pb-bar pt-bar relative z-20 space-y-2 overflow-y-auto px-2">
				<For
					each={devices().sort((dev) =>
						dev.isConnected ? -1 : dev.isProd ? 1 : 0,
					)}
				>
					{(device) => (
						<DeviceDetails
							id={device.id}
							name={device.name}
							url={device.isConnected ? device.url : undefined}
							isProd={device.isProd}
							isConnected={device.isConnected}
							groupName={device.group}
						/>
					)}
				</For>
				<div class="h-32" />
				<Portal>
					<div class="pb-bar fixed inset-x-0 bottom-2 z-20 mx-auto flex justify-center">
						<CircleButton
							onClick={context.searchDevice}
							disabled={context.isDiscovering()}
							loading={context.isDiscovering()}
							text="Search Devices"
							loadingText="Searching..."
						>
							<div class="text-blue-500">
								<ImSearch size={28} />
							</div>
						</CircleButton>
					</div>
				</Portal>
				<Portal>
					<DeviceSettingsModal />
				</Portal>
			</section>
			<div class="pt-bar fixed inset-0 z-0 flex flex-col pb-32">
				<div class="my-auto">
					<BackgroundLogo />
					<div class="flex h-32 w-full justify-center">
						<Show when={context.devices.size <= 0}>
							<p class="mt-4 max-w-sm px-4 text-center text-neutral-600">
								No devices detected.
								<br /> To access a device, press the device's power button, then
								press the
								<span class="mx-1 inline-block text-blue-500">
									<RiDeviceRouterFill />
								</span>
								button.
							</p>
						</Show>
					</div>
				</div>
			</div>
		</>
	);
}

export default Devices;
