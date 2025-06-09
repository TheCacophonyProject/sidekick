import {
	clearServerOperationStatus,
	createDeviceReferenceImageSchema,
	getAllDeviceReferenceImages,
	getPendingServerOperations,
	insertDeviceReferenceImage,
	markPhotoForServerOperation,
} from "~/database/Entities/DeviceReferenceImages";
import { CacophonyPlugin } from "../CacophonyApi";
import { useLogsContext } from "../LogsContext";
import { useUserContext } from "../User";
import { db } from ".";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { deleteDeviceReferenceImage } from "~/database/Entities/DeviceReferenceImages";
import {
	createEffect,
	createResource,
	createSignal,
	on,
	onMount,
} from "solid-js";
import { z } from "zod";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { useDevice } from "../Device";
import { Network } from "@capacitor/network";

export function useDeviceImagesStorage() {
	const log = useLogsContext();
	const userContext = useUserContext();
	const [shouldUpload, setShouldUpload] = createSignal(true);

	onMount(async () => {
		try {
			await db.execute(createDeviceReferenceImageSchema);
		} catch (error) {
			log.logError({
				message: "Failed to create device reference image table",
				error,
			});
		}
	});
	const [deviceImages, { refetch: refetchDeviceImages }] = createResource(
		async () => {
			try {
				const images = await getAllDeviceReferenceImages(db)();
				// Filter out images marked for deletion
				return images.filter((img) => img.serverStatus !== "pending-deletion");
			} catch (error) {
				log.logError({
					message: "Failed to get device images",
					error,
				});
			}
		},
		{ initialValue: [] },
	);
	createEffect(() => {
		console.log("Device Images", deviceImages());
	});

	const itemsToUpload = () =>
		deviceImages()?.filter(
			(i) =>
				i.serverStatus === "pending-deletion" ||
				i.serverStatus === "pending-upload",
		) ?? [];

	const hasItemsToUpload = () => itemsToUpload().length > 0;

	function base64ToArrayBuffer(base64: string): ArrayBuffer {
		// atob() decodes a base64-encoded string into a binary string
		const binaryString = window.atob(base64);

		const len = binaryString.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes.buffer;
	}

	const uploadDevicePhoto = async (
		deviceId: string,
		isProd: boolean,
		filePath: string,
		type: "pov" | "in-situ",
		isDeviceApConnected: boolean,
		location?: { lat: number; lng: number },
		timestamp?: Date,
	) => {
		try {
			const user = await userContext.getUser();

			// If no user or we're connected to the device AP, store as pending
			if (!user || isDeviceApConnected) {
				await insertDeviceReferenceImage(db)({
					deviceId: Number.parseInt(deviceId),
					filePath,
					timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
					type,
					isProd,
					lat: location?.lat,
					lng: location?.lng,
					serverStatus: "pending-upload",
				});
				return;
			}

			const url = userContext.getServerUrl();

			const updateData = {
				location,
			};
			const setLocationRes = await CapacitorHttp.post({
				url: `${url}/api/v1/devices/${deviceId}/settings`,
				method: "POST",
				headers: {
					Authorization: user.token,
					"Content-Type": "application/json",
				},
				data: updateData,
			});
			console.log("Set Location Res", setLocationRes);
			const fileContents = await Filesystem.readFile({
				path: filePath, // Use local file path instead of URL
			});

			const base64Data = fileContents.data;

			let res = await CapacitorHttp.post({
				url: `${url}/api/v1/devices/${deviceId}/reference-image?type=${type}`,
				method: "POST",
				headers: {
					Authorization: user.token,
					"Content-Type": "image/jpeg",
				},
				data: base64Data,
				dataType: "file", // Critical for CapacitorHTTP
			}).catch((error) => ({ status: 0, data: {} }));
			console.log("Upload Device Photo", res);
			if (
				res.status === 422 &&
				(res.data.messages as string[]).includes(
					"No location for device to tag with reference",
				)
			) {
				if (location && location.lat && location.lng) {
					res = await CapacitorHttp.post({
						url: `${url}/api/v1/devices/${deviceId}/reference-image?type=${type}`,
						method: "POST",
						headers: {
							Authorization: user.token,
							"Content-Type": "image/jpeg",
						},
						data: base64Data,
						dataType: "file", // Critical for CapacitorHTTP
					});
				}
			}

			const currImages = deviceImages();
			const existingImage = currImages?.find(
				(img) =>
					img.deviceId === Number.parseInt(deviceId) && img.isProd === isProd,
			);
			if (existingImage && res.status === 200) {
				await deleteDeviceReferenceImage(db)(
					existingImage.deviceId,
					existingImage.isProd,
					existingImage.filePath,
				);
			}
			// Check for authorization errors before processing
			if (res.status === 403 || res.status === 401) {
				// Check if this is a device access issue
				const errorData = res.data as { messages?: string[]; message?: string };
				const errorMessage =
					errorData.message ||
					(errorData.messages && errorData.messages.join(", ")) ||
					"";

				if (
					errorMessage.includes("Could not find a device") ||
					errorMessage.includes("authorization") ||
					errorMessage.includes("access")
				) {
					// Trigger device access request popup using deviceId
					userContext.setUserNeedsGroupAccess({
						deviceId: deviceId,
						deviceName: "",
						groupName: "",
					});

					log.logWarning({
						message: `Device access required for device ${deviceId}`,
						details: `You need access to device ${deviceId} to upload images`,
					});

					return false;
				}
			}

			const insertRes = await insertDeviceReferenceImage(db)({
				deviceId: Number.parseInt(deviceId),
				filePath,
				timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
				type,
				lat: location?.lat,
				lng: location?.lng,
				isProd,
				...(res.status === 200
					? {
							fileKey: z
								.object({ key: z.string(), size: z.number() })
								.parse(await res.data).key,
						}
					: { serverStatus: "pending-upload" }),
			});

			if (res.status === 200) {
				log.logSuccess({
					message: "Successfully uploaded device photo",
					details: JSON.stringify(insertRes),
				});
			} else {
				log.logWarning({
					message: "Device photo upload failed or pending",
					details: `Status: ${res.status}, marked as pending upload`,
				});
			}

			return res.status === 200;
		} catch (error) {
			log.logError({
				message: "Failed to upload device photo",
				error,
			});
			throw error;
		} finally {
			refetchDeviceImages();
		}
	};

	const getServerDeviceImages = async (deviceId: string) => {
		try {
			// If device AP is connected, skip server calls
			const user = await userContext.getUser();
			if (!user) return null;

			const res = await CapacitorHttp.get({
				url: `${userContext.getServerUrl()}/api/v1/devices/${deviceId}/reference-image`,
				headers: {
					Authorization: user.token,
				},
			});

			if (res.status === 200) {
				return res.data as string;
			}
			return null;
		} catch (error) {
			log.logError({
				message: "Failed to get server device images",
				error,
			});
			return null;
		}
	};

	// Utility function for file hashing
	const getFileHash = async (data: string): Promise<string> => {
		try {
			let hash = 0;
			for (let i = 0; i < data.length; i++) {
				const char = data.charCodeAt(i);
				hash = (hash << 5) - hash + char;
				hash = hash & hash;
			}
			return hash.toString();
		} catch (error) {
			log.logError({
				message: "Failed to calculate file hash",
				error,
			});
			return "";
		}
	};

	// Helper function to download and save image
	const downloadAndSaveImage = async (
		deviceId: string,
		isProd: boolean,
		serverImage: { key: string; type: "pov" | "in-situ"; timestamp: string },
		token: string,
	) => {
		const fileName = `${deviceId}-${isProd ? "prod" : "dev"}-${
			serverImage.type
		}-${serverImage.timestamp}.jpg`;
		const path = await Filesystem.getUri({
			path: "",
			directory: Directory.Data,
		});
		const filePath = `${path.uri}/${fileName}`;

		const downloadRes = await CacophonyPlugin.getReferenceImage({
			token,
			deviceId,
			fileKey: serverImage.key,
			filePath,
		});

		if (downloadRes.success) {
			await insertDeviceReferenceImage(db)({
				deviceId: Number.parseInt(deviceId),
				filePath,
				timestamp: serverImage.timestamp,
				type: serverImage.type,
				isProd,
				fileKey: serverImage.key,
			});
		}
	};

	const processPendingOperations = async () => {
		try {
			// If device AP is connected, skip server calls
			const user = await userContext.getUser();
			if (!user) return;

			const pendingOps = await getPendingServerOperations(db)();

			const url = userContext.getServerUrl();
			for (const op of pendingOps) {
				if (op.serverStatus === "pending-deletion") {
					try {
						const res = await CapacitorHttp.delete({
							url: `${url}/api/v1/devices/${op.deviceId}/reference-image`,
							headers: {
								authorization: user.token,
							},
						}).catch((error) => {
							console.error("Delete Image Error", error);
							return { status: 0 };
						});

						if (res.status === 200 || res.status === 403) {
							await Filesystem.deleteFile({ path: op.filePath }).catch(
								(error) => {
									console.error("Error deleting file", error);
								},
							);
							await deleteDeviceReferenceImage(db)(
								op.deviceId,
								op.isProd,
								op.filePath,
							);
						}
					} catch (error) {
						log.logError({
							message: "Failed to process pending deletion",
							error,
						});
					}
				} else if (op.serverStatus === "pending-upload") {
					const photo = op;
					const { filePath, deviceId, isProd } = photo;
					let fileContents;
					try {
						fileContents = await Filesystem.readFile({
							path: filePath, // Use local file path instead of URL
						});
					} catch (e: any) {
						if (e.message === "File does not exist.") {
							log.logError({
								message: `File missing for pending upload, deleting record: ${filePath}`,
								error: e,
							});
							await deleteDeviceReferenceImage(db)(deviceId, isProd, filePath);
							continue; // Skip to the next operation
						}
						throw e; // Re-throw other errors
					}

					if (photo.lat && photo.lng) {
						const updateData = {
							location: {
								lat: photo.lat,
								lng: photo.lng,
							},
						};
						const setLocationRes = await CapacitorHttp.post({
							url: `${url}/api/v1/devices/${deviceId}/settings`,
							method: "POST",
							headers: {
								Authorization: user.token,
								"Content-Type": "application/json",
							},
							data: updateData,
						});
						console.log("Set Location Res", setLocationRes);
					}

					const base64Data = fileContents.data;
					const res = await CapacitorHttp.post({
						url: `${url}/api/v1/devices/${deviceId}/reference-image?type=pov`,
						method: "POST",
						headers: {
							Authorization: user.token,
							"Content-Type": "image/jpeg",
						},
						data: base64Data,
						dataType: "file", // Critical for CapacitorHTTP
					});
					console.log("Sync Pending Photos", res);
					await markPhotoForServerOperation(db)(
						deviceId,
						isProd,
						filePath,
						res.status === 200 ? null : "pending-upload",
					);
				}
			}

			await refetchDeviceImages();
		} catch (error) {
			log.logError({
				message: "Failed to process pending operations",
				error,
			});
		}
	};

	const syncWithServer = async (deviceId: string, isProd: boolean) => {
		try {
			const networkStatus = await Network.getStatus();
			if (!networkStatus.connected) return;
			// Process any pending operations first
			await processPendingOperations();

			const user = await userContext.getUser();
			if (!user) return;

			const imgs = deviceImages();
			let localImage = imgs?.find(
				(img) =>
					img.deviceId === Number.parseInt(deviceId) && img.isProd === isProd,
			);

			// Try to get the reference image
			const response = await CapacitorHttp.get({
				url: `${userContext.getServerUrl()}/api/v1/devices/${deviceId}/reference-image`,
				headers: {
					Authorization: user.token,
				},
				responseType: "blob",
			});

			// Handle different response status codes
			switch (response.status) {
				case 200:
					// Server has an image

					if (!localImage) {
						// No local image - download server image
						const date = new Date().toISOString();
						const fileName = `${deviceId}-$${
							isProd ? "prod" : "dev"
						}-reference-${date}.jpg`;

						const settingsRes = await CapacitorHttp.get({
							url: `${userContext.getServerUrl()}/api/v1/devices/${deviceId}/settings`,
							headers: {
								Authorization: user.token,
							},
							responseType: "blob",
						});
						const file = await Filesystem.writeFile({
							path: fileName,
							data: response.data,
							directory: Directory.Data,
						});
						console.log("Settings Res", settingsRes);

						await insertDeviceReferenceImage(db)({
							deviceId: Number.parseInt(deviceId),
							filePath: file.uri,
							timestamp: date,
							type: "pov", // Default type - adjust as needed
							isProd,
						});
					} else {
						// We have a local image - check if it needs updating
						try {
							const file = await Filesystem.readFile({
								path: localImage.filePath,
							});
							// Use a simple hash function for the file contents
							const data = file.data as string;
							const localHash = data.substring(0, 50);
							const serverHash = (response.data as string).substring(0, 50);
							if (serverHash !== localHash) {
								// File content differs, update timestamp or re-download?
								// For now, let's assume re-downloading is handled by deleting and letting the 'no local image' logic run
								log.logSuccess({
									message: `Local file ${localImage.filePath} differs from server. Deleting local record.`,
								});
								await deleteDeviceReferenceImage(db)(
									localImage.deviceId,
									localImage.isProd,
									localImage.filePath,
								);
								// Re-run the download logic as if no local image existed
								// This part might need refinement based on desired behavior (e.g., update vs replace)
								// Falling through to the download logic below by effectively nullifying localImage for this block
								localImage = undefined;
							}
						} catch (e: any) {
							if (e.message === "File does not exist.") {
								log.logError({
									message: `Local file missing during sync, deleting record: ${localImage?.filePath}`,
									error: e,
								});
								if (localImage) {
									await deleteDeviceReferenceImage(db)(
										localImage.deviceId,
										localImage.isProd,
										localImage.filePath,
									);
								}
								localImage = undefined; // Mark as null so the download logic below runs
							} else {
								throw e; // Re-throw other errors
							}
						}
					}
					// If localImage is now null (either initially or because it was deleted above), download server image
					if (!localImage) {
						// No local image - download server image
						const date = new Date().toISOString();
						const fileName = `${deviceId}-$${
							isProd ? "prod" : "dev"
						}-reference-${date}.jpg`;

						const settingsRes = await CapacitorHttp.get({
							url: `${userContext.getServerUrl()}/api/v1/devices/${deviceId}/settings`,
							headers: {
								Authorization: user.token,
							},
							responseType: "blob",
						});
						const file = await Filesystem.writeFile({
							path: fileName,
							data: response.data,
							directory: Directory.Data,
						});
						console.log("Settings Res", settingsRes);

						await insertDeviceReferenceImage(db)({
							deviceId: Number.parseInt(deviceId),
							filePath: file.uri,
							timestamp: date,
							type: "pov", // Default type - adjust as needed
							isProd,
						});
					}
					break;
				case 404: // No image on server
				case 403: // Unauthorized
					if (localImage && localImage.serverStatus === "pending-deletion") {
						console.log("403 Delete Device Photo", localImage);
						await deleteDevicePhoto(localImage, false);
					}
					break;
				case 422: // Unprocessable entity
					if (localImage && localImage.serverStatus === "pending-deletion") {
						console.log("422 Delete Device Photo", localImage);
						await deleteDevicePhoto(localImage, false);
					}
					break;

				default:
					if (response.status >= 500) {
						// Server error - keep local files
						log.logEvent("sync_server_error");
						return;
					}
			}

			await refetchDeviceImages();
		} catch (error) {
			if (error instanceof TypeError) {
				// Network error - keep local files
				log.logEvent("sync_network_error");
				return;
			}
			log.logError({
				message: "Failed to sync with server",
				error,
			});
		}
	};

	const getDevicePhoto = async (device: {
		name: string;
		isProd: boolean;
		id: string;
	}) => {
		try {
			// After sync, get the local image (which will now be up-to-date)
			const images = deviceImages()?.sort((a, b) => {
				return (
					new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
				);
			});
			const image = images?.find(
				(i) =>
					i.deviceId === Number.parseInt(device.id) &&
					i.isProd === device.isProd,
			);
			console.log("Get Device Photo", image);
			if (image) {
				return {
					...image,
					url: Capacitor.convertFileSrc(image.filePath),
				};
			}

			return null;
		} catch (error) {
			log.logError({
				message: "Failed to get device photo",
				error,
			});
			return null;
		}
	};

	const getDeviceImageData = async (
		deviceId: string,
		{ fileKey, filePath }: { fileKey?: string | null; filePath: string },
	) => {
		try {
			// If device AP is connected, skip server calls
			const user = await userContext.getUser();
			const res = await CacophonyPlugin.getReferenceImage({
				...(user?.token && { token: user.token }),
				deviceId: deviceId,
				fileKey,
				filePath,
			});
			const data = res.success ? Capacitor.convertFileSrc(res.data) : null;
			console.log("Get Device Image Data", res, data);
			return data;
		} catch (error) {
			console.error("Error", error);
			log.logError({
				message: "Failed to get device photo",
				error,
			});
			return null;
		}
	};

	const deleteDevicePhoto = async (
		photo: {
			deviceId: number;
			isProd: boolean;
			fileKey?: string | null;
			filePath: string;
		},
		isDeviceApConnected: boolean,
	) => {
		try {
			const user = await userContext.getUser();

			// If no user/offline or device AP is connected, mark for deletion instead of immediate delete
			if (!user || isDeviceApConnected) {
				await markPhotoForServerOperation(db)(
					photo.deviceId,
					photo.isProd,
					photo.filePath,
					"pending-deletion",
				);
				refetchDeviceImages();
				return;
			}
			const image = deviceImages()?.find((p) => p.filePath === photo.filePath);
			if (image && image.serverStatus === "pending-upload") {
				await deleteDeviceReferenceImage(db)(
					photo.deviceId,
					photo.isProd,
					photo.filePath,
				);
				return;
			}

			// Online case - try to delete from server
			try {
				const res = await CapacitorHttp.delete({
					url: `${userContext.getServerUrl()}/api/v1/devices/${
						photo.deviceId
					}/reference-image`,
					headers: {
						authorization: user.token,
					},
				}).catch((error) => {
					console.error("Error", error);
				});
				console.log("Delete Device Photo", res);
				if (res?.status === 200) {
					// Delete succeeded - remove local file and DB entry
					await Filesystem.deleteFile({ path: photo.filePath }).catch(
						(error) => {
							console.error("Error deleting file", error);
						},
					);
					await deleteDeviceReferenceImage(db)(
						photo.deviceId,
						photo.isProd,
						photo.filePath,
					);
					log.logSuccess({
						message: "Successfully deleted device photo",
					});
				} else {
					// Server error or network error - mark for later deletion
					await markPhotoForServerOperation(db)(
						photo.deviceId,
						photo.isProd,
						photo.filePath,
						"pending-deletion",
					);
				}
			} catch (error) {
				// Network/other error - mark for later deletion
				await markPhotoForServerOperation(db)(
					photo.deviceId,
					photo.isProd,
					photo.filePath,
					"pending-deletion",
				);
				throw error;
			}
		} catch (error) {
			log.logError({
				message: "Error deleting device photo",
				error,
			});
			throw error;
		} finally {
			refetchDeviceImages();
		}
	};

	const syncPendingPhotos = async () => {
		setShouldUpload(true);
		try {
			// If device AP is connected, skip server calls
			const user = await userContext.getUser();
			if (!user) return;
			const pendingPhotos = itemsToUpload();

			for (const photo of pendingPhotos) {
				if (!shouldUpload()) break; // Check if upload was cancelled
				try {
					const url = userContext.getServerUrl();

					const { deviceId, filePath, isProd } = photo;
					if (photo.serverStatus === "pending-deletion") {
						await deleteDevicePhoto(photo, false);
					} else if (
						photo.serverStatus === "pending-upload" &&
						shouldUpload()
					) {
						let fileContents;
						try {
							fileContents = await Filesystem.readFile({
								path: filePath, // Use local file path instead of URL
							});
						} catch (e: any) {
							if (e.message === "File does not exist.") {
								log.logError({
									message: `File missing for pending sync, deleting record: ${filePath}`,
									error: e,
								});
								await deleteDeviceReferenceImage(db)(
									deviceId,
									isProd,
									filePath,
								);
								continue; // Skip to the next photo
							}
							throw e; // Re-throw other errors
						}

						if (photo.lat && photo.lng) {
							const updateData = {
								location: {
									lat: photo.lat,
									lng: photo.lng,
								},
							};
							const setLocationRes = await CapacitorHttp.post({
								url: `${url}/api/v1/devices/${deviceId}/settings`,
								method: "POST",
								headers: {
									Authorization: user.token,
									"Content-Type": "application/json",
								},
								data: updateData,
							});
							console.log("Set Location Res", setLocationRes);
						}

						const base64Data = fileContents.data;
						const res = await CapacitorHttp.post({
							url: `${url}/api/v1/devices/${deviceId}/reference-image?type=pov`,
							method: "POST",
							headers: {
								Authorization: user.token,
								"Content-Type": "image/jpeg",
							},
							data: base64Data,
							dataType: "file", // Critical for CapacitorHTTP
						});
						console.log("Sync Pending Photos", res);
						await markPhotoForServerOperation(db)(
							deviceId,
							isProd,
							filePath,
							res.status === 200 ? null : "pending-upload",
						);
					}
				} catch (error) {
					log.logError({
						message: `Failed to sync photo for device ${photo.deviceId} ${photo.fileKey}`,
						error,
					});
				}
			}
		} catch (error) {
			log.logError({
				message: "Failed to sync pending photos",
				error,
			});
		} finally {
			refetchDeviceImages();
		}
	};

	const deleteUnuploadedPhotos = async () => {
		try {
			const photos = itemsToUpload();
			console.log("Delete Unuploaded Photos", photos);
			for (const photo of photos) {
				const res = await deleteDeviceReferenceImage(db)(
					photo.deviceId,
					photo.isProd,
					photo.filePath,
				);
			}
		} catch (error) {
			log.logError({
				message: "Failed to delete unuploaded photos",
				error,
			});
		} finally {
			refetchDeviceImages();
		}
	};

	const deleteDevicesImages = async (
		deviceId: string,
		isProd: boolean,
		isDeviceApConnected: boolean,
	) => {
		try {
			const photos = deviceImages()?.filter(
				(p) => p.deviceId === Number.parseInt(deviceId) && p.isProd === isProd,
			);
			console.log("Delete Device Images", photos);
			if (!photos || photos.length === 0) return;

			for (const photo of photos) {
				await deleteDevicePhoto(photo, isDeviceApConnected);
			}
		} catch (error) {
			log.logError({
				message: "Failed to delete all device images",
				error,
			});
		} finally {
			refetchDeviceImages();
		}
	};

	const stopUploading = () => {
		setShouldUpload(false);
	};

	return {
		deviceImages,
		itemsToUpload,
		deleteUnuploadedPhotos,
		hasItemsToUpload,
		uploadDevicePhoto,
		getDevicePhoto,
		getDeviceImageData,
		deleteDevicePhoto,
		deleteDevicesImages,
		syncPendingPhotos,
		syncWithServer,
		processPendingOperations,
		stopUploading,
	};
}
