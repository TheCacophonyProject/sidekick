import { Camera, CameraResultType } from "@capacitor/camera";
import { Dialog as Prompt } from "@capacitor/dialog";
import {
	Show,
	Switch,
	Match,
	createEffect,
	createMemo,
	createResource,
	createSignal,
	onMount,
	onCleanup,
} from "solid-js";
import {
	FaSolidSpinner,
	FaRegularTrashCan,
	FaSolidClock,
	FaSolidCheck,
	FaSolidWifi,
} from "solid-icons/fa";
import { FiCloud, FiCloudOff, FiMapPin } from "solid-icons/fi";
import { ImCross } from "solid-icons/im";
import { TbCameraPlus } from "solid-icons/tb";
import {
	AndroidSettings,
	IOSSettings,
	NativeSettings,
} from "capacitor-native-settings";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { z } from "zod";
import { debounce } from "@solid-primitives/scheduled";
import FieldWrapper from "~/components/Field";
import { GoToPermissions } from "~/components/GoToPermissions";
import type { DeviceId } from "~/contexts/Device";
import { useDevice } from "~/contexts/Device";
import { useStorage } from "~/contexts/Storage";
import { useLogsContext } from "~/contexts/LogsContext";
import type { Location } from "~/database/Entities/Location";

type SettingProps = { deviceId: DeviceId };

// Helper component for item upload status
const ItemUploadStatus = (props: { status: "pending" | "uploaded" | "uploading" | "error", type: string }) => (
	<div class="flex items-center space-x-1">
		<Switch>
			<Match when={props.status === "pending"}>
				<FaSolidClock size={12} class="text-orange-500" />
				<span class="text-xs text-orange-600">Saved</span>
			</Match>
			<Match when={props.status === "uploaded"}>
				<FaSolidCheck size={12} class="text-green-500" />
				<span class="text-xs text-green-600">Synced</span>
			</Match>
			<Match when={props.status === "uploading"}>
				<FaSolidSpinner size={12} class="animate-spin text-blue-500" />
				<span class="text-xs text-blue-600">Syncing</span>
			</Match>
			<Match when={props.status === "error"}>
				<ImCross size={10} class="text-red-500" />
				<span class="text-xs text-red-600">Failed</span>
			</Match>
		</Switch>
	</div>
);

export function LocationSettingsTab(props: SettingProps) {
	const log = useLogsContext();
	const context = useDevice();
	const storage = useStorage();

	const id = () => props.deviceId;
	const groupName = () => context.devices.get(id())?.group ?? "";
	const isProd = () => context.devices.get(id())?.isProd ?? false;
	const shouldUpdateLocState = () => context.shouldDeviceUpdateLocation(id());

	// Location state management
	const [locationRes, { refetch: refetchLocation }] =
		context.getLocationByDevice(id());
	const location = createMemo(() => locationRes());
	const [newName, setNewName] = createSignal("");
	const [photoFileToUpload, setPhotoFileToUpload] = createSignal<{
		url: string;
		path?: string;
	} | null>();

	// Photo management
	const [currentPhoto, { refetch: refetchPhoto }] = createResource(
		() => storage.deviceImages(),
		async () => {
			const device = context.devices.get(id());
			const photo = device ? await storage.getDevicePhoto(device) : null;
			console.log("Current Photo: ", photo);
			return photo;
		},
	);

	// Location coordinates handling
	// Accept both string and number for lat/lng/alt/accuracy, and transform to number
	const numish = z
		.union([z.string(), z.number()])
		.transform((v: string | number) =>
			typeof v === "string" ? Number.parseFloat(v) : v,
		);
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
	const [locCoords] = createResource(
		() => [id(), shouldUpdateLocState()] as const,
		async ([id]) => {
			const res = await context.getLocationCoords(id);
			if (res.success) {
				// Validate and normalize location fields for preview
				const parsed = locationSchema.safeParse(res.data);
				return parsed.success ? parsed.data : null;
			}
			return null;
		},
	);

	const [isSyncing, setIsSyncing] = createSignal(false);

	// Status helper functions
	const getLocationStatus = () => {
		const loc = location();
		if (isSyncing() && (loc?.needsCreation || loc?.updateName || newName())) return "uploading";
		if (loc?.needsCreation || loc?.updateName || newName()) return "pending";
		return "uploaded";
	};

	const getPhotoStatus = () => {
		if (isSyncing() && (photoFileToUpload() || currentPhoto()?.serverStatus === "pending-upload")) return "uploading";
		if (photoFileToUpload() || currentPhoto()?.serverStatus === "pending-upload") return "pending";
		if (currentPhoto()?.serverStatus === "pending-deletion") return "pending";
		return "uploaded";
	};

	// Mobile-friendly status messages  
	const getUploadStatusMessage = () => {
		const items = [];
		const loc = location();

		if (loc?.needsCreation || loc?.updateName || newName()) items.push("location");
		if (photoFileToUpload() || currentPhoto()?.serverStatus === "pending-upload") items.push("photo");

		if (items.length === 0) return null;

		const itemsText = items.length === 2 ? "changes" : items[0];
		const isOnline = context.apState() !== "connected";

		if (isSyncing()) return `Syncing ${itemsText}`;
		if (isOnline) return `${itemsText.charAt(0).toUpperCase() + itemsText.slice(1)} ready`;
		return "Changes will upload when next online.";
	};

	// Save location data and handle photo upload
	const saveLocationSettings = async () => {
		try {
			setIsSyncing(true);
			const deviceLocation = await context.getLocationCoords(id());
			const loc = location();
			const photo = photoFileToUpload();

			// Validate device location
			if (!deviceLocation.success) {
				log.logWarning({
					message: "No device location found.",
				});
				return;
			}

			let savedLocation: Location | undefined;
			const locationCoords = deviceLocation.data;
			locationCoords.latitude = Number.parseFloat(
				locationCoords.latitude.toFixed(6),
			);
			locationCoords.longitude = Number.parseFloat(
				locationCoords.longitude.toFixed(6),
			);

			// Create/update location with proper error handling
			if (!loc) {
				savedLocation = await storage.createLocation(
					{
						name: newName(),
						coords: {
							lat: locationCoords.latitude,
							lng: locationCoords.longitude,
						},
						groupName: groupName(),
						isProd: isProd(),
					},
					context.apState() === "connected",
				);
			} else if (newName()) {
				await storage.updateLocationName(
					loc,
					newName(),
					context.apState() === "connected",
				);
				savedLocation = loc;
			}

			// Handle photo upload with location validation
			if (photo?.path) {
				await storage.uploadDevicePhoto(
					id(),
					isProd(),
					photo.path,
					"pov",
					context.apState() === "connected",
					savedLocation?.coords || {
						// Use saved location or device location
						lat: locationCoords.latitude,
						lng: locationCoords.longitude,
					},
				);
			}

			// Update state only after successful operations
			setNewName("");
			setPhotoFileToUpload(null);
			refetchLocation();
			refetchPhoto();
		} catch (error) {
			log.logError({
				message: "Error saving location settings",
				error,
			});
		} finally {
			setIsSyncing(false);
		}
	};

	// Debounced auto-save for name changes
	const debouncedSave = debounce(saveLocationSettings, 4000);

	// Auto-save when name changes
	createEffect(() => {
		const name = newName();
		if (name && name.trim() !== "") {
			debouncedSave();
		}
	});

	async function centerCropImage(
		webPath: string,
		outWidth: number,
		outHeight: number,
	): Promise<{ url: string; filePath: string }> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = async () => {
				try {
					// Create an offscreen canvas
					const canvas = document.createElement("canvas");
					canvas.width = outWidth;
					canvas.height = outHeight;
					const ctx = canvas.getContext("2d");
					if (!ctx) {
						reject("Could not get 2D context from canvas.");
						return;
					}

					// Original image width/height
					const imgWidth = img.width;
					const imgHeight = img.height;
					// Desired aspect ratio we want to crop to
					const desiredAspect = outWidth / outHeight;
					// Original aspect ratio
					const imgAspect = imgWidth / imgHeight;

					let renderWidth: number;
					let renderHeight: number;
					let offsetX: number;
					let offsetY: number;

					if (imgAspect > desiredAspect) {
						// Image is relatively wider than our desired aspect → match height
						renderHeight = outHeight;
						renderWidth = imgWidth * (renderHeight / imgHeight);
						offsetX = -(renderWidth - outWidth) / 2;
						offsetY = 0;
					} else {
						// Image is relatively taller or same ratio → match width
						renderWidth = outWidth;
						renderHeight = imgHeight * (renderWidth / imgWidth);
						offsetX = 0;
						offsetY = -(renderHeight - outHeight) / 2;
					}

					// Draw to canvas
					ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);

					// Convert to blob
					canvas.toBlob(
						async (blob) => {
							if (!blob) {
								reject("Failed converting canvas to Blob.");
								return;
							}

							// Convert Blob → base64, so we can save via Capacitor Filesystem
							const base64Data = await blobToBase64(blob);
							const fileName = `cropped_${Date.now()}.jpg`;

							// Write the file to the device (using a temporary location)
							await Filesystem.writeFile({
								path: fileName,
								data: base64Data,
								directory: Directory.Cache, // or Directory.Data if you prefer
							});

							// Grab the URI so we can later upload
							const fileUri = await Filesystem.getUri({
								path: fileName,
								directory: Directory.Cache,
							});

							// Create an object URL for quick previews in the app (optional)
							const objectUrl = URL.createObjectURL(blob);

							resolve({
								url: objectUrl, // for immediate preview (e.g. <img src={url} />)
								filePath: fileUri.uri, // the actual local URI of the cropped file
							});
						},
						"image/jpeg",
						0.9,
					);
				} catch (err) {
					reject(err);
				}
			};
			img.onerror = reject;
			img.src = webPath; // Kick off loading
		});
	}

	// Utility to convert Blob → base64 string
	function blobToBase64(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				const dataUrl = reader.result as string;
				// DataURL format: "data:image/jpeg;base64,...."
				// We just want the base64 portion after the comma
				const base64String = dataUrl.split(",")[1];
				resolve(base64String);
			};
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	}

	// Add photo handler with offline support
	const addPhotoToDevice = async () => {
		try {
			const image = await Camera.getPhoto({
				quality: 100,
				allowEditing: false,
				resultType: CameraResultType.Uri,
			});

			if (image.webPath) {
				const { url, filePath } = await centerCropImage(
					image.webPath,
					640,
					480,
				);

				setPhotoFileToUpload({
					url,
					path: filePath,
				});
			}
			await saveLocationSettings();
		} catch (error) {
			log.logError({
				message: "Failed to capture photo",
				error,
			});
		}
	};

	const updateLocation = createMemo(shouldUpdateLocState, "current", {
		equals: (prev, curr) => {
			if (curr === "loading" && prev === "needsUpdate") return true;
			if (curr === prev) return true;
			return false;
		},
	});

	// Delete photo handler
	const removePhotoReference = async () => {
		const img = photoUrl();
		if (!img) return;

		const prompt = await Prompt.confirm({
			title: "Confirm Deletion",
			message: "Are you sure you want to delete this photo?",
		});

		if (prompt.value) {
			if (currentPhoto()) {
				await storage.deleteDevicesImages(
					id(),
					isProd(),
					context.apState() === "connected",
				);
				refetchPhoto();
			}
			setPhotoFileToUpload(null);
		}
	};
	const [settingLocation, setSettingLocation] = createSignal(false);

	// UI rendering helpers
	const locationName = () => {
		if (newName()) return newName();
		return location()?.updateName || location()?.name || "Unnamed Location";
	};

	const hasPendingChanges = () => {
		const hasChanges = !!newName() || !!photoFileToUpload();
		return hasChanges;
	};

	const hasChangesToUpload = () => {
		const loc = location();
		const needsTo =
			loc?.updateName ||
			loc?.needsCreation ||
			currentPhoto()?.serverStatus === "pending-upload";
		if (needsTo) {
			console.log("Needs to upload: ", loc, currentPhoto());
		}
		return needsTo;
	};

	const photoUrl = () =>
		photoFileToUpload()?.url ??
		(currentPhoto()?.serverStatus !== "pending-deletion"
			? currentPhoto()?.url
			: undefined);

	onMount(async () => {
		await context.refetchDeviceLocToUpdate();
	});
	onCleanup(async () => {
		console.log("Cleaning up LocationSettingsTab");
		// make sure to save any unsaved changes
		if (hasChangesToUpload() || hasPendingChanges()) {
			await saveLocationSettings();
		}
	});

	return (
		<section class="mx-auto w-full max-w-md p-2 sm:p-4">
			<Show
				when={context.locationDisabled() || updateLocation() === "unavailable"}
			>
				<div class="flex w-full flex-col items-center space-y-2 sm:space-y-4">
					<p class="px-2 text-center text-xs text-red-500 sm:text-sm">
						Location services are disabled, please enable to save location
						settings.
					</p>
					<button
						class="
			  flex items-center justify-center 
			  space-x-2 
			  rounded-md bg-blue-500 px-3 py-2 
			  text-xs text-white disabled:cursor-not-allowed
			  disabled:opacity-50 sm:text-sm
			"
						onClick={async () => {
							await NativeSettings.open({
								optionIOS: IOSSettings.LocationServices,
								optionAndroid: AndroidSettings.Location,
							});
							await context.refetchLocationPermission();
							context.shouldDeviceUpdateLocation(id());
						}}
					>
						Open Location Settings
					</button>
				</div>

				<Show when={context.locationDisabled()}>
					<GoToPermissions />
				</Show>
			</Show>

			<Show
				when={location() || !locationRes.loading}
				fallback={
					<div class="flex h-full w-full flex-col items-center justify-center py-8">
						<FaSolidSpinner size={28} class="animate-spin" />
						<p class="mt-2 text-sm">Loading Location...</p>
					</div>
				}
			>
				<div class="flex justify-between items-center mb-2 px-2">
					<h2 class="text-lg font-medium text-gray-800">Location Settings</h2>

					<Show when={getLocationStatus() !== "uploaded"}>
						<ItemUploadStatus status={getLocationStatus()} type="location" />
					</Show>
				</div>

				<Show when={hasChangesToUpload() || hasPendingChanges()}>
					<div class={`mb-2 flex items-start space-x-2 rounded-lg border p-2 transition-all duration-300 ${context.apState() === "connected" ? 'border-blue-400 bg-blue-50' : 'border-orange-400 bg-orange-50'
						}`}>
						<div class="flex-shrink-0 mt-0.5">
							<Switch>
								<Match when={isSyncing()}>
									<FaSolidSpinner size={16} class="animate-spin text-blue-500" />
								</Match>
								<Match when={context.apState() === "connected"}>
									<FiCloud size={16} class="text-blue-500" />
								</Match>
								<Match when={true}>
									<FiCloudOff size={16} class="text-orange-500" />
								</Match>
							</Switch>
						</div>
						<div class="flex-1">
							<p class={`text-sm ${context.apState() === "connected" ? 'text-blue-800' : 'text-orange-800'
								}`}>
								{getUploadStatusMessage()}
							</p>
							<Show when={context.apState() !== "connected" && !isSyncing()}>
								<p class="text-xs text-orange-600 mt-1">
									Saved locally
								</p>
							</Show>
						</div>
					</div>
				</Show>

				<Switch>
					<Match when={updateLocation() === "needsUpdate"}>
						<div class="flex w-full flex-col items-center">
							<button
								class="
				  my-2 flex items-center space-x-2 self-center 
				  rounded-md bg-blue-500 
				  px-3 py-2 
				  text-xs 
				  text-white disabled:cursor-not-allowed
				  disabled:opacity-50 sm:text-sm
				"
								onClick={async () => {
									try {
										setSettingLocation(true);
										await context.setDeviceToCurrLocation(id());
										await context.refetchDeviceLocToUpdate();
										await refetchLocation();
									} catch (e) {
										console.error("Failed to update location", e);
									} finally {
										setSettingLocation(false);
									}
								}}
								disabled={settingLocation() || isSyncing()}
							>
								<Show
									when={!settingLocation()}
									fallback={
										<>
											<span class="text-xs sm:text-sm">
												Updating Location...
											</span>
											<FaSolidSpinner size={18} class="animate-spin" />
										</>
									}
								>
									<span class="text-xs sm:text-sm">Update Device Location</span>
									<FiMapPin size={18} />
								</Show>
							</button>
						</div>
					</Match>
					<Match when={updateLocation() === "current"}>

						<div class="space-y-1">
							<Show when={locCoords()}>
								<FieldWrapper type="custom" title="Coordinates">
									<div class="ml-2 flex items-center gap-2 text-xs sm:text-sm">
										<span class="font-medium">Lat:</span>
										<span>{locCoords()?.latitude.toFixed(3)}</span>
										<span class="font-medium">Lng:</span>
										<span>{locCoords()?.longitude.toFixed(3)}</span>
									</div>
								</FieldWrapper>
							</Show>

							<FieldWrapper type="custom" title={
								<div class="flex items-center justify-between w-full">
									<span>Name</span>
								</div>
							}>
								<input
									type="text"
									disabled={isSyncing()}
									class="
					w-full rounded-md bg-slate-50 
					px-2 py-1 
					text-xs sm:text-sm
					disabled:cursor-not-allowed disabled:opacity-50
				  "
									placeholder={locationName()}
									value={newName()}
									onInput={(e) => setNewName(e.currentTarget.value)}
									onSubmit={(e) => {
										e.preventDefault();
										saveLocationSettings();
									}}
								/>
							</FieldWrapper>
							<div class="relative rounded-md bg-slate-100">
								<Switch>
									<Match when={photoUrl()}>
										<div
											style={{ "aspect-ratio": "4/3" }}
											class=" group relative w-full"
										>
											<img src={photoUrl()} class="h-full w-full rounded-md" />
											<div
												class="
						  z-100 absolute inset-0 
						  flex items-start justify-between 
						  p-2
						  opacity-80 
						  transition-opacity group-hover:opacity-100
						"
											>
												<button
													onClick={addPhotoToDevice}
													disabled={isSyncing()}
													class="rounded-lg bg-white/80 p-2 backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-50"
												>
													<Show
														when={isSyncing()}
														fallback={<TbCameraPlus size={24} />}
													>
														<FaSolidSpinner size={24} class="animate-spin" />
													</Show>
												</button>
												<button
													onClick={removePhotoReference}
													disabled={isSyncing()}
													class="rounded-lg bg-white/80 p-2 backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-50"
												>
													<FaRegularTrashCan size={20} />
												</button>
											</div>
										</div>
									</Match>
									<Match when={!photoFileToUpload() && !currentPhoto()}>
										<button
											onClick={addPhotoToDevice}
											disabled={isSyncing()}
											class="
						aspect-4/3 flex h-48 
						w-full flex-col items-center justify-center gap-2 
						text-blue-500 
						disabled:cursor-not-allowed disabled:opacity-50
					  "
										>
											<Show
												when={isSyncing()}
												fallback={<TbCameraPlus size={36} />}
											>
												<FaSolidSpinner size={36} class="animate-spin" />
											</Show>
											<p class="text-xs text-gray-600 sm:text-sm">
												{isSyncing() ? "Saving..." : "Add Camera Perspective Photo"}
											</p>
										</button>
									</Match>
								</Switch>
							</div>
						</div>
					</Match>
				</Switch>
			</Show>
		</section>
	);
}