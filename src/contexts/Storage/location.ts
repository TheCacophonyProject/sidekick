import { createMemo, createResource, onMount } from "solid-js";
import {
  Location,
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
  ApiLocation,
  CacophonyPlugin,
  getLocationsForUser,
} from "../CacophonyApi";
import { DevicePlugin } from "../Device";
import { logError, logSuccess, logWarning } from "../Notification";
import { useUserContext } from "../User";

const MIN_STATION_SEPARATION_METERS = 60;
// The radius of the station is half the max distance between stations: any recording inside the radius can
// be considered to belong to that station.
const MAX_DISTANCE_FROM_STATION_FOR_RECORDING =
  MIN_STATION_SEPARATION_METERS / 2;

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180; // Convert latitude from degrees to radians
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Returns the distance in meters
}

function isWithinRadius(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radius: number
): boolean {
  const distance = haversineDistance(lat1, lon1, lat2, lon2);
  return distance <= radius;
}

export const isWithinRange = (
  prevLoc: [number, number],
  newLoc: [number, number],
  range = MAX_DISTANCE_FROM_STATION_FOR_RECORDING
) => {
  const [lat, lng] = prevLoc;
  const [latitude, longitude] = newLoc;
  const inRange = isWithinRadius(lat, lng, latitude, longitude, range);
  return inRange;
};

export function useLocationStorage() {
  const userContext = useUserContext();
  type ServerLocation = ApiLocation & { isProd: boolean };
  const message =
    "Could not to get locations. Please check your internet connection and you are logged in.";
  const getServerLocations = async (): Promise<ServerLocation[]> => {
    try {
      const user = await userContext.getUser();
      if (!user) return [];
      const locations = await getLocationsForUser(user.token);
      return locations.map((location) => ({
        ...location,
        isProd: user.prod,
      }));
    } catch (error) {
      logError({
        message,
        error,
      });
      return [];
    }
  };

  function getLocationsToUpdate(
    apiLocations: ServerLocation[],
    dbLocations: Location[]
  ): Location[] {
    return dbLocations
      .map((dbLoc) => {
        // Update Locations
        const diffLoc = apiLocations.find(
          (userLoc) =>
            dbLoc.id === userLoc.id &&
            dbLoc.isProd === userLoc.isProd &&
            (dbLoc.name !== userLoc.name ||
              dbLoc.updatedAt !== userLoc.updatedAt ||
              !dbLoc.referencePhotos?.every(
                (refImage) =>
                  userLoc.referencePhotos?.includes(refImage) ?? false
              ))
        );
        if (diffLoc) {
          // get difference between location and savedLocation objects
          const locationKeys = Object.keys(diffLoc) as (keyof ApiLocation)[];
          const diff = locationKeys.reduce((result, key) => {
            const newLoc = diffLoc[key];
            const oldLoc = dbLoc[key];
            if (JSON.stringify(newLoc) !== JSON.stringify(oldLoc)) {
              result[key] = newLoc;
            }
            return result;
          }, {} as Record<keyof Location, unknown>);

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
        const sameLoc = locations.findIndex(
          (l) =>
            l.id !== loc.id &&
            l.isProd === loc.isProd &&
            l.groupName === loc.groupName &&
            isWithinRange(
              [loc.coords.lat, loc.coords.lng],
              [l.coords.lat, l.coords.lng]
            )
        );
        // remove the location that needs creation, but keep the new name and photos
        if (sameLoc !== -1) {
          debugger;
          const same = locations[sameLoc];
          const newLoc = {
            ...same,
            updateName: loc.updateName ?? loc.name,
            referencePhotos: [
              ...(loc.referencePhotos ?? []),
              ...(same.referencePhotos ?? []),
            ],
            uploadPhotos: [
              ...(loc.uploadPhotos ?? []),
              ...(same.uploadPhotos ?? []),
            ],
          };
          await deleteLocation(db)(loc.id.toString(), loc.isProd);
          await updateLocation(db)(newLoc);
          // insert the new location
          locations[sameLoc] = newLoc;
          // remove the old location
          locations.splice(i, 1);
        }
      }
    }
    const user = await userContext.getUser();
    return await Promise.all(
      locations.map(async (location) => {
        if (!user || location.isProd !== user?.prod) return location;
        if (location.needsCreation) {
          const res = await createLocation({
            ...location,
            name: location.updateName ?? location.name,
            uploadPhotos: location.uploadPhotos ?? [],
          });
          return res;
        }
        if (location.updateName) {
          let name = location.updateName;
          while (locations.some((loc) => loc.name === name)) {
            name = `${location.updateName}(${Math.floor(Math.random() * 100)})`;
          }
          const synced = await syncLocationName(location, name);
          if (synced) {
            location.name = name;
            location.updateName = undefined;
          } else {
            location.updateName = name;
          }
        }
        if (location.uploadPhotos?.length) {
          const [upload, currPhotos] = await syncLocationPhotos(location);
          location.uploadPhotos = upload;
          location.referencePhotos = currPhotos;
        }
        if (location.deletePhotos?.length) {
          const synced = await syncLocationDeletePhotos(location);
          location.deletePhotos = [
            ...(location.deletePhotos?.filter((img) => !synced.includes(img)) ??
              []),
          ];
          location.referencePhotos = [
            ...(location.referencePhotos?.filter(
              (img) => !synced.includes(img)
            ) ?? []),
          ];
        }
        return location;
      })
    );
  }

  const [savedLocations, { mutate, refetch }] = createResource(
    () => [userContext.getUser()] as const,
    async (data) => {
      try {
        // Update Locations based on user
        const user = await data[0];
        if (!user) return [];
        const locations = await getServerLocations();
        const dbLocations = await getLocations(db)();
        const locationsToInsert = locations.filter(
          (location) =>
            !dbLocations.some(
              (savedLocation) =>
                savedLocation.id === location.id &&
                savedLocation.isProd === location.isProd
            )
        );
        const locationsToUpdate = getLocationsToUpdate(locations, dbLocations);
        await insertLocations(db)(locationsToInsert);
        await Promise.all(locationsToUpdate.map(updateLocation(db)));
        return syncLocations();
      } catch (error) {
        logError({
          message: "Failed to sync locations",
          error,
        });
        return [];
      }
    }
  );

  // Deletes ima
  const syncLocationDeletePhotos = async (location: Location) => {
    const user = await userContext.getUser();
    const deletePhotos = location.deletePhotos ?? [];
    if (!user) return [];
    const deleted: string[] = [];
    for (const fileKey of deletePhotos) {
      if (!location.referencePhotos?.includes(fileKey)) {
        location.deletePhotos = location.deletePhotos?.filter(
          (image) => image !== fileKey
        );
        await updateLocation(db)({
          id: location.id,
          isProd: location.isProd,
          deletePhotos: location.deletePhotos,
        });
        deleted.push(fileKey);
        continue;
      }
      const res = await CacophonyPlugin.deleteReferencePhoto({
        token: user.token,
        station: location.id.toString(),
        fileKey,
      });
      if (res.success && res.data.serverDeleted) {
        deleted.push(fileKey);
        location.deletePhotos = deletePhotos;
      }
    }
    await updateLocation(db)({
      id: location.id,
      isProd: location.isProd,
      deletePhotos: location.deletePhotos?.filter(
        (image) => !deleted.includes(image)
      ),
    });
    return deleted;
  };

  const deleteReferencePhotosForLocation = async (
    location: Location,
    fileKey: string
  ) => {
    await DevicePlugin.unbindConnection();
    const user = await userContext.getUser();
    const res = await CacophonyPlugin.deleteReferencePhoto({
      ...(user && { token: user.token }),
      station: location.id.toString(),
      fileKey,
    });
    await DevicePlugin.rebindConnection();
    if (res.success) {
      const deleted = res.data;
      // This image is in cache, so just remove without syncing
      const isImageToUpload = location.uploadPhotos?.includes(fileKey);
      const referencePhotos = location.referencePhotos?.filter(
        (image) => image !== fileKey
      );
      const uploadPhotos = location.uploadPhotos?.filter(
        (image) => image !== fileKey
      );

      const changes = {
        referencePhotos: referencePhotos ?? [],
        ...(!deleted.serverDeleted && {
          deletePhotos: [
            ...(location.deletePhotos ?? []).filter((key) => key !== fileKey),
            fileKey,
          ],
        }),
        ...(uploadPhotos && { uploadPhotos }),
      };
      await updateLocation(db)({
        id: location.id,
        isProd: location.isProd,
        ...changes,
      });
      mutate((locations) =>
        locations?.map((loc) => {
          if (loc.id === location.id) {
            return {
              ...loc,
              ...changes,
            };
          }
          return loc;
        })
      );
      if (res.data.serverDeleted) {
        logSuccess({
          message: "Reference photo deleted",
        });
      } else if (!isImageToUpload) {
        logWarning({
          message:
            "Reference photo deleted from app, but not from server. Try sync again through storage.",
        });
      }
      return true;
    } else {
      logWarning({
        message:
          "Failed to delete reference photo for location. You can also delete it on the Cacophony website.",
        details: `${location.id} ${fileKey}: ${res.message}`,
      });
      return false;
    }
  };

  const SyncLocationMessage =
    "Could not update location name. Try again through storage.";
  const updateLocationName = async (location: Location, newName: string) => {
    try {
      await DevicePlugin.unbindConnection();
      const validToken = await userContext.getUser();
      if (validToken) {
        while (savedLocations()?.some((loc) => loc.name === newName)) {
          newName = `${newName}(${Math.floor(Math.random() * 100)})`;
        }
        const res = await CacophonyPlugin.updateStation({
          token: validToken.token,
          id: location.id.toString(),
          name: newName,
        });
        await DevicePlugin.rebindConnection();
        if (res.success) {
          location.name = newName;
          location.updateName = undefined;
          logSuccess({
            message: "Successfully updated location name",
          });
        } else {
          location.updateName = newName;
          logWarning({
            message: SyncLocationMessage,
          });
        }
      } else {
        location.updateName = newName;
        logWarning({
          message: SyncLocationMessage,
        });
      }
      await updateLocation(db)(location);
      mutate((locations) =>
        locations?.map((loc) => (loc.id === location.id ? location : loc))
      );
    } catch (e) {
      logWarning({
        message: SyncLocationMessage,
      });
      location.updateName = newName;
      await updateLocation(db)(location);
      mutate((locations) =>
        locations?.map((loc) => (loc.id === location.id ? location : loc))
      );
    }
  };

  const UploadPhotoMessage =
    "Location photo saved but not uploaded, try upload again through storage.";
  const updateLocationPhoto = async (location: Location, newPhoto: string) => {
    try {
      await DevicePlugin.unbindConnection();
      const user = await userContext.getUser();
      if (user) {
        const res = await CacophonyPlugin.uploadReferencePhoto({
          token: user.token,
          station: location.id.toString(),
          filename: newPhoto,
        });
        if (res.success) {
          location.referencePhotos = [
            ...(location.referencePhotos ?? []),
            res.data,
          ];
          if (location.uploadPhotos) {
            location.uploadPhotos = location.uploadPhotos.filter(
              (imgPath: string) => imgPath !== newPhoto
            );
          }
          logSuccess({
            message: "Successfully updated location picture",
          });
        } else {
          logWarning({
            message: UploadPhotoMessage,
            details: res.message,
          });
          if (!location.uploadPhotos?.includes(newPhoto)) {
            location.uploadPhotos = [
              ...(location.uploadPhotos ?? []),
              newPhoto,
            ];
          }
        }
      } else {
        logWarning({
          message: UploadPhotoMessage,
        });
        if (!location.uploadPhotos?.includes(newPhoto)) {
          location.uploadPhotos = [...(location.uploadPhotos ?? []), newPhoto];
        }
      }
      await DevicePlugin.rebindConnection();
    } catch (e) {
      await DevicePlugin.rebindConnection();
      logWarning({
        message: "Failed to update location picture",
        details: JSON.stringify(e),
      });
      if (!location.uploadPhotos?.includes(newPhoto)) {
        location.uploadPhotos = [...(location.uploadPhotos ?? []), newPhoto];
      }
    }
    await updateLocation(db)(location);
    mutate((locations) =>
      locations?.map((loc) => (loc.id === location.id ? location : loc))
    );
  };

  const getNextLocationId = () => {
    let randomId = Math.floor(Math.random() * 1000000000);
    while (savedLocations()?.some((loc: Location) => loc.id === randomId)) {
      randomId = Math.floor(Math.random() * 1000000000);
    }
    return randomId;
  };

  const saveLocation = async (
    location: Omit<
      Location,
      "id" | "updatedAt" | "needsCreation" | "needsDeletion" | "updateName"
    >
  ) => {
    const newLocation = LocationSchema.safeParse({
      ...location,
      id: getNextLocationId(),
      needsCreation: true,
      updatedAt: new Date().toISOString(),
    });
    if (!newLocation.success) {
      logWarning({
        message: "Failed to save location",
        details: JSON.stringify(newLocation.error),
      });
      return;
    }
    await insertLocation(db)(newLocation);
    mutate((locations) => [...(locations ?? []), newLocation.data]);
  };

  const getReferencePhotoForLocation = async (id: number, fileKey: string) => {
    try {
      await DevicePlugin.unbindConnection();
      const user = await userContext.getUser();
      const res = await CacophonyPlugin.getReferencePhoto({
        ...(user?.token && { token: user.token }),
        station: id.toString(),
        fileKey,
      });
      await DevicePlugin.rebindConnection();
      if (res.success) {
        return `${window.location.origin}/_capacitor_file_${res.data}`;
      }
    } catch (e) {
      await DevicePlugin.rebindConnection();
    }
  };

  const syncLocationName = async (loc: Location, updateName: string) => {
    const user = await userContext.getUser();
    if (!user) return;
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
      }
    } catch (e) {
      await updateLocation(db)({
        id: loc.id,
        isProd: loc.isProd,
        updateName: name,
      });
    }
    return false;
  };

  const syncLocationPhotos = async (
    location: Pick<Location, "id" | "uploadPhotos" | "referencePhotos">
  ): Promise<[string[], string[]]> => {
    const user = await userContext.getUser();
    let uploadPhotos: string[] = location.uploadPhotos ?? [];
    let referencePhotos = location.referencePhotos ?? [];
    if (!user) return [uploadPhotos, referencePhotos];
    const uploadedPhotos: [string, string][] = (
      await Promise.all(
        uploadPhotos.map(async (photo) => {
          const res = await CacophonyPlugin.uploadReferencePhoto({
            token: user.token,
            station: location.id.toString(),
            filename: photo,
          });
          if (res.success) {
            return [photo, res.data];
          }
        })
      )
    ).filter((res): res is [string, string] => res !== undefined);

    // remove uploaded photos from uploadPhotos
    uploadPhotos = uploadPhotos.filter(
      (image) => !uploadedPhotos.find((img) => img[0] === image)
    );
    referencePhotos = referencePhotos.concat(
      uploadedPhotos.map((img) => img[1])
    );
    await updateLocation(db)({
      id: location.id,
      isProd: user.prod ?? false,
      uploadPhotos: uploadPhotos,
      referencePhotos: referencePhotos,
    });
    console.log(
      "UPLOADED PHOTOS",
      uploadedPhotos,
      uploadPhotos,
      referencePhotos
    );
    return [uploadPhotos, referencePhotos];
  };

  const createLocation = async (settings: {
    id?: number;
    groupName: string;
    uploadPhotos: string[];
    coords: { lat: number; lng: number };
    isProd: boolean;
    name?: string | null | undefined;
  }): Promise<Location> => {
    await DevicePlugin.unbindConnection();
    const user = await userContext.getUser();
    const fromDate = new Date().toISOString();
    const id = getNextLocationId();
    const location: Location = {
      id,
      referencePhotos: [],
      ...settings,
      updatedAt: fromDate,
      needsCreation: true,
      needsRename: false,
    };
    if (user && user.prod === settings.isProd) {
      let success = false;
      let tries = 0;
      while (!success) {
        let name =
          settings.name ??
          `New Location ${settings.groupName} ${new Date().toISOString()}`;
        if (tries > 0) name = `${name}(${Math.floor(Math.random() * 1000)})`;
        while (savedLocations()?.some((loc: Location) => loc.name === name)) {
          name = `${name}(${Math.floor(Math.random() * 100)})`;
        }
        const res = await CacophonyPlugin.createStation({
          token: user.token,
          name,
          groupName: settings.groupName,
          lat: settings.coords.lat.toString(),
          lng: settings.coords.lng.toString(),
          fromDate,
        });
        if (res.success) {
          if (settings.id) {
            // Delete old location if it exists
            await deleteLocation(db)(settings.id.toString(), settings.isProd);
          }
          location.id = parseInt(res.data);
          location.name = name;
          location.updateName = null;
          location.needsCreation = false;
          await insertLocation(db)(location);
          const [uploadPhotos, refPhotos] = await syncLocationPhotos({
            id: Number(res.data),
            uploadPhotos: settings.uploadPhotos,
            referencePhotos: [],
          });
          location.referencePhotos = refPhotos;
          location.uploadPhotos = uploadPhotos;

          success = true;
          logSuccess({
            message: "Location created successfully",
          });
        } else if (res.message.includes("already exists") && tries < 3) {
          tries++;
        } else {
          success = true;
        }
      }
    }
    if (location.needsCreation) {
      logWarning({
        message:
          "Unable to establish this location. Please try uploading from storage when you're online again.",
      });
      location.updateName = settings.name;
      location.name = null;
      if (!settings.id) {
        await insertLocation(db)(location);
      }
    }
    await DevicePlugin.rebindConnection();

    mutate((locations) => [
      ...(locations ?? []).filter((loc) => loc.id !== settings.id),
      location,
    ]);
    return location;
  };

  const deleteSyncLocations = async () => {
    if (!savedLocations.loading) {
      const locs = savedLocations() ?? [];
      await Promise.all(
        locs.map(async (loc) => {
          if (loc.needsCreation) {
            await deleteLocation(db)(loc.id.toString(), loc.isProd);
          }
          if (loc.uploadPhotos) {
            await updateLocation(db)({
              id: loc.id,
              isProd: loc.isProd,
              uploadPhotos: [],
            });
          }
          if (loc.updateName) {
            await updateLocation(db)({
              id: loc.id,
              isProd: loc.isProd,
              updateName: null,
            });
          }
        })
      );
      refetch();
    }
  };

  const hasItemsToUpload = createMemo(() => {
    const locs = savedLocations();
    return (
      locs?.some((loc) => loc.uploadPhotos?.length || loc.updateName) ?? false
    );
  });

  onMount(async () => {
    try {
      await db.execute(createLocationSchema);
    } catch (error) {
      logError({
        message,
        error,
      });
    }
  });

  return {
    savedLocations,
    saveLocation,
    createLocation,
    deleteSyncLocations,
    resyncLocations: refetch,
    getReferencePhotoForLocation,
    deleteReferencePhotoForLocation: deleteReferencePhotosForLocation,
    updateLocationName,
    updateLocationPhoto,
    hasItemsToUpload,
  };
}
