import { createMemo, createResource, createSignal, onMount } from "solid-js";
import {
	type Location,
	LocationSchema,
	createLocationSchema,
	deleteLocation,
	getLocations,
	insertLocation,
	insertLocations,
	updateLocation,
} from "~/database/Entities/Location";
import { db } from ".";
import {
	type ApiLocation,
	CacophonyPlugin,
	getLocationsForUser,
} from "../CacophonyApi";
import { useUserContext } from "../User";
import { useLogsContext } from "../LogsContext";

const MIN_STATION_SEPARATION_METERS = 60;
const MAX_DISTANCE_FROM_STATION_FOR_RECORDING =
	MIN_STATION_SEPARATION_METERS / 2;

const retry = async <T>(
	fn: () => Promise<T>,
	retries = 3,
	delay = 1000,
): Promise<T> => {
	try {
		return await fn();
	} catch (error) {
		if (retries <= 0) throw error;
		await new Promise((res) => setTimeout(res, delay));
		return retry(fn, retries - 1, delay * 2);
	}
};

export interface LatLng {
	lat: number;
	lng: number;
}
export function latLngApproxDistance(a: LatLng, b: LatLng): number {
	if (a.lat === b.lat && a.lng === b.lng) {
		return 0;
	}
	const R = 6371e3;
	const lat1 = (a.lat * Math.PI) / 180;
	const lat2 = (b.lat * Math.PI) / 180;
	const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
	const distance = Math.acos(
		Math.sin(lat1) * Math.sin(lat2) +
			Math.cos(lat1) * Math.cos(lat2) * Math.cos(deltaLng),
	);
	return distance * R;
}

function isWithinRadius(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
	radius: number,
): boolean {
	const distance = latLngApproxDistance(
		{ lat: lat1, lng: lon1 },
		{ lat: lat2, lng: lon2 },
	);
	return distance <= radius;
}

export const isWithinRange = (
	prevLoc: [number, number],
	newLoc: [number, number],
	accuracy: number,
	range = MAX_DISTANCE_FROM_STATION_FOR_RECORDING,
) => {
	const [lat, lng] = prevLoc;
	const [latitude, longitude] = newLoc;
	// If accuracy is <= 0 or NaN, substitute a safe default (100m)
	const safeAccuracy =
		!accuracy || accuracy <= 0 || Number.isNaN(accuracy) ? 100 : accuracy;
	return isWithinRadius(
		lat,
		lng,
		latitude,
		longitude,
		range + safeAccuracy * 2,
	);
};

export function useLocationStorage() {
	const log = useLogsContext();
	const userContext = useUserContext();
	const [shouldUpload, setShouldUpload] = createSignal(true);

	const message =
		"Could not get locations. Please check your internet connection and that you are logged in.";

	type ServerLocation = ApiLocation & { isProd: boolean };

	const getServerLocations = async (): Promise<ServerLocation[] | null> => {
		try {
			const user = await userContext.getUser();
			if (!user) return null;
			const locations = await getLocationsForUser(user.token);
			if (locations === null) return null;
			return locations.map((location) => ({
				...location,
				isProd: user.prod,
			}));
		} catch (error) {
			log.logError({
				message,
				error,
			});
			return null;
		}
	};

	function getLocationsToUpdate(
		apiLocations: ServerLocation[],
		dbLocations: Location[],
	): Location[] {
		return dbLocations
			.map((dbLoc: Location) => {
				const diffLoc = apiLocations.find(
					(userLoc) =>
						dbLoc.id === userLoc.id &&
						dbLoc.isProd === userLoc.isProd &&
						(dbLoc.name !== userLoc.name ||
							dbLoc.updatedAt !== userLoc.updatedAt),
				);
				if (diffLoc) {
					const locationKeys = Object.keys(diffLoc) as (keyof ApiLocation)[];
					const diff = locationKeys.reduce(
						(result, key) => {
							const newLoc = diffLoc[key];
							const oldLoc = dbLoc[key];
							if (JSON.stringify(newLoc) !== JSON.stringify(oldLoc)) {
								result[key] = newLoc;
							}
							return result;
						},
						{} as Record<keyof Location, unknown>,
					);
					return {
						...diff,
						isProd: dbLoc.isProd,
						id: dbLoc.id,
					};
				}
			})
			.filter(Boolean) as Location[];
	}

	async function syncLocations(): Promise<Location[]> {
		const locations = await getLocations(db)();
		for (const [i, loc] of locations.entries()) {
			if (loc.needsCreation) {
				const existingLoc = locations.findIndex(
					(l) =>
						l.id !== loc.id &&
						l.isProd === loc.isProd &&
						l.groupName === loc.groupName &&
						isWithinRange(
							[loc.coords.lat, loc.coords.lng],
							[l.coords.lat, l.coords.lng],
							0,
						),
				);
				if (existingLoc !== -1) {
					const same = locations[existingLoc];
					const newLoc = {
						...same,
						updateName: loc.updateName ?? loc.name,
					};
					await deleteLocation(db)(loc.id.toString(), loc.isProd);
					await updateLocation(db)(newLoc);
					locations[existingLoc] = newLoc;
					locations.splice(i, 1);
				}
			}
		}
		const user = await userContext.getUser();
		return (
			await Promise.all(
				locations.map(async (location) => {
					if (!user || location.isProd !== user?.prod) return location;
					if (!shouldUpload()) return location; // Check if upload was cancelled
					if (location.needsCreation) {
						const res = await createLocation(
							{
								...location,
								name: location.updateName ?? location.name,
							},
							false,
						);
						return res;
					}
					if (location.updateName && shouldUpload()) { // Check before syncing
						let name = location.updateName;
						// Make sure the name is unique
						while (locations.some((loc) => loc.name === name)) {
							name = `${location.updateName}(${Math.floor(
								Math.random() * 100,
							)})`;
						}
						const synced = await syncLocationName(location, name);
						if (synced) {
							location.name = name;
							location.updateName = undefined;
						} else {
							location.updateName = name;
						}
					}
					return location;
				}),
			)
		).filter((location) => location !== undefined);
	}

	const [savedLocations, { mutate, refetch }] = createResource(
		() => [userContext.data()] as const,
		async (data) => {
			try {
				const user = data;
				if (!user) return [];
				const locations = await getServerLocations();
				const dbLocations = await getLocations(db)();
				if (locations !== null) {
					// Insert brand new locations from server
					const locationsToInsert = locations.filter(
						(location) =>
							!dbLocations.some(
								(savedLocation) =>
									savedLocation.id === location.id &&
									savedLocation.isProd === location.isProd,
							),
					);
					const locationsToUpdate = getLocationsToUpdate(
						locations,
						dbLocations,
					);

					await insertLocations(db)(locationsToInsert);
					await Promise.all(locationsToUpdate.map(updateLocation(db)));

					// Remove any that the server says are gone
					const locationsToDelete = dbLocations.filter(
						(location) =>
							!locations.some(
								(loc) => loc.id === location.id && loc.name === location.name,
							),
					);
					await Promise.all(
						locationsToDelete.map((location) =>
							deleteLocation(db)(location.id.toString(), location.isProd),
						),
					);
				}

				const newLocations = await syncLocations();
				return newLocations;
			} catch (error) {
				log.logError({
					message: "Failed to sync locations",
					error,
				});
				return [];
			}
		},
	);

	const updateLocationName = async (
		location: Location,
		newName: string,
		isConnectedToDeviceAp: boolean,
	) => {
		if (!newName?.trim()) {
			throw new Error("Location name cannot be empty");
		}

		const existingLocations = await getLocations(db)();
		if (!existingLocations.some((l) => l.id === location.id)) {
			throw new Error("Location not found in local database");
		}

		try {
			const validToken = await userContext.getUser();
			if (validToken && !isConnectedToDeviceAp) {
				// Ensure uniqueness across local set
				while (savedLocations()?.some((loc) => loc.name === newName)) {
					newName = `${newName}(${Math.floor(Math.random() * 100)})`;
				}
				const res = await CacophonyPlugin.updateStation({
					token: validToken.token,
					id: location.id.toString(),
					name: newName,
				});
				if (res.success) {
					location.name = newName;
					location.updateName = undefined;
					log.logSuccess({
						message: "Successfully updated location name",
					});
				} else {
					location.updateName = newName;
				}
			} else {
				location.updateName = newName;
			}
			await updateLocation(db)(location);
			mutate((locations) =>
				locations?.map((loc) => (loc.id === location.id ? location : loc)),
			);
		} catch (e) {
			location.updateName = newName;
			await updateLocation(db)(location);
			mutate((locations) =>
				locations?.map((loc) => (loc.id === location.id ? location : loc)),
			);
			throw e;
		}
	};

	const getNextLocationId = () => {
		let randomId = Math.floor(Math.random() * 1_000_000_000);
		while (savedLocations()?.some((loc) => loc.id === randomId)) {
			randomId = Math.floor(Math.random() * 1_000_000_000);
		}
		return randomId;
	};

	const saveLocation = async (
		location: Omit<
			Location,
			| "id"
			| "updatedAt"
			| "needsCreation"
			| "needsDeletion"
			| "updateName"
			| "needsRename"
		>,
	) => {
		const newLocation = LocationSchema.safeParse({
			...location,
			id: getNextLocationId(),
			needsCreation: true,
			updatedAt: new Date().toISOString(),
		});
		if (!newLocation.success) {
			log.logWarning({
				message: "Failed to save location",
				details: JSON.stringify(newLocation.error),
			});
			return;
		}
		await insertLocation(db)(newLocation);
		mutate((locations) => [...(locations ?? []), newLocation.data]);
		refetch();
	};

	// Update location name on server with retry
	const syncLocationName = async (loc: Location, updateName: string) => {
		const user = await userContext.getUser();
		debugger;
		if (!user) return false;
		let name = updateName;
		try {
			for (let i = 0; i < 3; i++) {
				name = i === 0 ? name : `${updateName}(${i})`;
				const res = await CacophonyPlugin.updateStation({
					token: user.token,
					id: loc.id.toString(),
					name,
				});
				if (res.success) {
					await updateLocation(db)({
						id: loc.id,
						isProd: loc.isProd,
						updateName: undefined,
					});
					return true;
				}
				if (res.message.includes("Could not find a station with an id")) {
					log.logWarning({
						message: "Location not found on server",
						details: `ID: ${loc.id}, Name: ${loc.name}`,
						warn: false,
					});
					// If the station doesn't exist, we assume it was deleted
					await deleteLocation(db)(loc.id.toString(), loc.isProd);
					return false;
				}
			}
		} catch (e) {
			await updateLocation(db)({
				id: loc.id,
				isProd: loc.isProd,
				updateName: name,
			});
		} finally {
			refetch();
		}
		return false;
	};

	const createLocation = async (
		settings: {
			id?: number;
			groupName: string;
			coords: { lat: number; lng: number };
			isProd: boolean;
			name?: string | null;
		},
		isConnectedToDeviceAp: boolean,
	): Promise<Location | undefined> => {
		try {
			const user = await userContext.getUser();
			const fromDate = new Date().toISOString();
			const newId = getNextLocationId();
			debugger;

			// Validate coordinates
			if (
				!settings.coords ||
				typeof settings.coords.lat !== "number" ||
				typeof settings.coords.lng !== "number"
			) {
				throw new Error("Invalid coordinates provided for location creation");
			}

			// Base local location object
			const baseLocation: Location = {
				id: newId,
				...settings,
				name:
					settings.name || `New Location ${new Date().toLocaleDateString()}`,
				updatedAt: fromDate,
				needsCreation: true,
				coords: settings.coords,
				updateName: undefined,
				needsRename: false,
			};

			// Try to find existing station on the server with same group & near coords
			const renameIfServerHasSameCoords = async () => {
				if (!user) return false;
				if (user.prod !== settings.isProd) return false;
				// If connected to device AP, we skip server calls
				if (isConnectedToDeviceAp) return false;

				// Get all server locations
				const serverLocs = await getLocationsForUser(user.token);
				if (!serverLocs) return false;

				// Find any server station in same groupName & within ~30m or so (use your isWithinRange or direct distance)
				const match = serverLocs.find((loc) => {
					return (
						loc.groupName === settings.groupName &&
						isWithinRange(
							[loc.coords.lat, loc.coords.lng],
							[settings.coords.lat, settings.coords.lng],
							0 /* accuracy */,
						)
					);
				});
				if (!match) return false;

				// If found, rename that station to baseLocation.name
				const rename = await CacophonyPlugin.updateStation({
					token: user.token,
					id: match.id.toString(),
					name: baseLocation.name!,
				});
				if (rename.success) {
					// Reflect in baseLocation
					baseLocation.id = match.id; // reuse existing ID from server
					baseLocation.needsCreation = false;
					return true;
				}
				return false;
			};

			try {
				// 1) If the server already has a station near these coords, rename it
				const foundExisting = await renameIfServerHasSameCoords();
				if (!foundExisting) {
					// 2) If no existing station, create a new one on the server
					if (user && user.prod === settings.isProd && !isConnectedToDeviceAp) {
						await retry(async () => {
							const res = await CacophonyPlugin.createStation({
								token: user.token,
								name: baseLocation.name!,
								groupName: settings.groupName,
								lat: settings.coords.lat.toString(),
								lng: settings.coords.lng.toString(),
								fromDate,
							});
							if (res.success) {
								// Successfully created on server
								baseLocation.id = Number.parseInt(res.data);
								baseLocation.needsCreation = false;
							}
						}, 3);
					}
				}
			} catch (e) {
				log.logWarning({
					message: "Location created locally - will sync with server later",
					details: "Device is offline or server communication failed",
				});
			} finally {
				// Cleanup old local location if it had an ID
				if (settings.id) {
					await deleteLocation(db)(settings.id.toString(), settings.isProd);
				}
				// Upsert our new local location
				await insertLocation(db)(baseLocation);
				mutate((locations) => [
					...(locations ?? []).filter((loc) => loc.id !== settings.id),
					baseLocation,
				]);
			}
			return baseLocation;
		} catch (error) {
			log.logError({ error, message: "Failed to create location" });
			return undefined;
		} finally {
			refetch();
		}
	};

	const deleteSyncLocations = async () => {
		if (!savedLocations.loading) {
			const locs = savedLocations() ?? [];
			await Promise.all(
				locs.map(async (loc) => {
					if (loc.needsCreation) {
						await deleteLocation(db)(loc.id.toString(), loc.isProd);
					}
					if (loc.updateName) {
						await updateLocation(db)({
							id: loc.id,
							isProd: loc.isProd,
							updateName: null,
						});
					}
				}),
			);
			refetch();
		}
	};

	const hasItemsToUpload = createMemo(() => {
		const locs = savedLocations();
		return locs?.some((loc) => loc.updateName) ?? false;
	});

	onMount(async () => {
		try {
			await db.execute(createLocationSchema);
		} catch (error) {
			log.logError({
				message,
				error,
			});
		}
	});

	const resyncLocations = async () => {
		setShouldUpload(true);
		await refetch();
	};

	const stopUploading = () => {
		setShouldUpload(false);
	};

	return {
		savedLocations,
		saveLocation,
		createLocation,
		deleteSyncLocations,
		resyncLocations,
		updateLocationName,
		hasItemsToUpload,
		stopUploading,
	};
}
