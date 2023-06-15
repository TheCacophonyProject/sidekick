import { createEffect, createResource, on, onMount } from "solid-js";
import {
  insertLocations,
  updateLocation,
  getLocations,
  Location,
  LocationSchema,
  insertLocation,
  createLocationSchema,
  getLocationById,
} from "~/database/Entities/Location";
import { db } from ".";
import { CacophonyPlugin, getLocationsForUser } from "../CacophonyApi";
import { logError, logSuccess, logWarning } from "../Notification";
import { useUserContext } from "../User";
import { Directory, Filesystem } from "@capacitor/filesystem";

export function useLocationStorage() {
  const userContext = useUserContext();
  const getUserLocations = async () => {
    try {
      const user = await userContext.validateCurrToken();
      if (!user) return [];
      const locations = await getLocationsForUser(user.token);
      return locations.map((location) => ({
        ...location,
        isProd: user.prod,
        userId: parseInt(user.id),
      }));
    } catch (e) {
      if (e instanceof Error) {
        logError({ message: "Failed to get locations", error: e });
        return [];
      } else {
        logWarning({
          message: "Failed to get locations",
          details: JSON.stringify(e),
        });
        return [];
      }
    }
  };

  const [savedLocations, { mutate }] = createResource(
    () => [userContext.data()] as const,
    async () => {
      try {
        const locations = await getUserLocations();
        const currLocations = await getLocations(db)();
        const locationsToInsert = locations.filter(
          (location) =>
            !currLocations.some(
              (savedLocation) =>
                savedLocation.id ===
                parseInt(`${location.id}${location.isProd ? "1" : "0"}`)
            )
        );
        const locationsToUpdate = locations
          .map((location) => {
            const diffLoc = currLocations.find(
              (savedLocation) =>
                savedLocation.id ===
                  parseInt(`${location.id}${location.isProd ? "1" : "0"}`) &&
                savedLocation.updatedAt !== location.updatedAt &&
                savedLocation.referenceImages?.every(
                  (refImage) =>
                    location.settings?.referenceImages?.includes(refImage) ??
                    false
                )
            );
            if (diffLoc) {
              // get difference between location and savedLocation objects
              const locationKeys = Object.keys(location) as (keyof Location)[];
              const diff = locationKeys.reduce((result, key) => {
                const oldLoc = diffLoc[key];
                const newLoc = location[key];
                if (JSON.stringify(newLoc) !== JSON.stringify(oldLoc)) {
                  result[key] = newLoc;
                }
                return result;
              }, {} as Record<keyof Location, unknown>);
              return {
                ...diff,
                id: diffLoc.id,
              };
            }
          })
          .filter(Boolean) as Location[];
        console.log("Locations", locations, locationsToUpdate);

        await Promise.all([
          insertLocations(db)(locationsToInsert),
          ...locationsToUpdate.map((location) => updateLocation(db)(location)),
        ]);
        // Sync locations names and photos
        const newLocations = await getLocations(db)();
        const syncedLocations = await Promise.all(
          newLocations.map(async (location) => {
            if (location.updateName) {
              const sync = await syncLocationName(location.id, location.name);
              location.updateName = !sync;
            }
            if (location.uploadImages?.length) {
              console.log("syncing photos", location);
              const sync = await syncLocationPhotos(
                location.id,
                location.uploadImages
              );
              location.uploadImages = sync ? [] : location.uploadImages;
            }
            if (location.deleteImages?.length) {
              const sync = await syncLocationDeleteImages(location);
              location.deleteImages = sync ? [] : location.deleteImages;
            }
            return location;
          })
        );
        console.log(syncedLocations);
        return syncedLocations;
      } catch (e) {
        if (e instanceof Error) {
          logError({ message: "Failed to sync locations", error: e });
          return [];
        } else {
          logWarning({
            message: "Failed to sync locations",
          });
          return [];
        }
      }
    }
  );

  const syncLocationDeleteImages = async (location: Location) => {
    const user = await userContext.validateCurrToken();
    if (!user) return;
    try {
      const deleteImages = location.deleteImages ?? [];
      for (const fileKey of deleteImages) {
        const res = await CacophonyPlugin.deleteReferencePhoto({
          token: user.token,
          station: location.id.toString().slice(0, -1),
          fileKey,
        });
        if (res.success && res.data.serverDeleted) {
          location.deleteImages = deleteImages.filter(
            (image) => image !== fileKey
          );
          await updateLocation(db)({
            id: location.id,
            deleteImages: location.deleteImages,
          });
        }
      }
      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  };

  const deleteReferencePhotoForLocation = async (
    location: Location,
    fileKey: string
  ) => {
    const user = await userContext.validateCurrToken();
    if (!user) return;
    const res = await CacophonyPlugin.deleteReferencePhoto({
      token: user.token,
      station: location.id.toString().slice(0, -1),
      fileKey,
    });

    if (res.success) {
      const deleted = res.data;
      const referenceImages = location.referenceImages?.filter(
        (image) => image !== fileKey
      );
      const changes = {
        referenceImages,
        ...(!deleted.serverDeleted && {
          deleteImages: [...(location.deleteImages ?? []), fileKey],
        }),
      };
      await updateLocation(db)({
        id: location.id,
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
    "Could not update location name. We will sync it when you next open the app.";
  const updateLocationName = async (location: Location, newName: string) => {
    const updatedLocation = { ...location, name: newName };
    try {
      const validToken = await userContext.validateCurrToken();
      if (validToken) {
        const res = await CacophonyPlugin.updateStation({
          token: validToken.token,
          id: location.id.toString().slice(0, -1),
          name: newName,
        });
        if (res.success) {
          updatedLocation.updateName = false;
          logSuccess({
            message: "Successfully updated location name",
          });
        } else {
          logWarning({
            message: SyncLocationMessage,
          });
        }
      } else {
        updatedLocation.updateName = true;
      }
      await updateLocation(db)(updatedLocation);
      mutate((locations) =>
        locations?.map((loc) =>
          loc.id === location.id ? updatedLocation : loc
        )
      );
    } catch (e) {
      logWarning({
        message: SyncLocationMessage,
      });
      updatedLocation.updateName = true;
      await updateLocation(db)(updatedLocation);
      mutate((locations) =>
        locations?.map((loc) =>
          loc.id === location.id ? updatedLocation : loc
        )
      );
    }
  };

  const updateLocationPhoto = async (location: Location, newPhoto: string) => {
    try {
      const validToken = await userContext.validateCurrToken();
      if (validToken) {
        const res = await CacophonyPlugin.uploadReferencePhoto({
          token: validToken.token,
          station: location.id.toString().slice(0, -1),
          filename: newPhoto,
        });
        if (res.success) {
          location.referenceImages = [
            ...(location.referenceImages ?? []),
            res.data,
          ];
          if (location.uploadImages) {
            location.uploadImages = location.uploadImages.filter(
              (imgPath) => imgPath !== newPhoto
            );
          }
          logSuccess({
            message: "Successfully updated location picture",
          });
          // Delete newPhoto from cache
          Filesystem.deleteFile({
            path: newPhoto,
            directory: Directory.Cache,
          });
        } else {
          logWarning({
            message:
              "Unable to upload location photo. We will try again when you next open the app.",
            details: res.message,
          });
          if (!location.uploadImages?.includes(newPhoto)) {
            location.uploadImages = [
              ...(location.uploadImages ?? []),
              newPhoto,
            ];
          }
        }
      } else {
        if (!location.uploadImages?.includes(newPhoto)) {
          location.uploadImages = [...(location.uploadImages ?? []), newPhoto];
        }
      }
    } catch (e) {
      logWarning({
        message: "Failed to update location picture",
        details: JSON.stringify(e),
      });
      if (!location.uploadImages?.includes(newPhoto)) {
        location.uploadImages = [...(location.uploadImages ?? []), newPhoto];
      }
    }
    await updateLocation(db)(location);
    mutate((locations) =>
      locations?.map((loc) => (loc.id === location.id ? location : loc))
    );
  };

  const getNextLocationId = () => {
    let randomId = Math.floor(Math.random() * 1000000000);
    while (savedLocations()?.some((loc) => loc.id === randomId)) {
      randomId = Math.floor(Math.random() * 1000000000);
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
    >
  ) => {
    const user = userContext.data();
    const newLocation = LocationSchema.parse({
      ...location,
      id: getNextLocationId(),
      needsCreation: true,
      updatedAt: new Date().toISOString(),
      ...(user && { userId: parseInt(user.id) }),
    });
    await insertLocation(db)(newLocation);
    mutate((locations) => [...(locations ?? []), newLocation]);
  };

  const getReferencePhotoForLocation = async (id: number, fileKey: string) => {
    try {
      const user = await userContext.validateCurrToken();
      const res = await CacophonyPlugin.getReferencePhoto({
        ...(user?.token && { token: user.token }),
        station: id.toString().slice(0, -1), // id adds 0/1 to indicate production or test
        fileKey,
      });
      if (res.success) {
        return `${window.location.origin}/_capacitor_file_${res.data}`;
      } else {
        logWarning({
          message: "Failed to get reference photo for location",
          details: `${id} ${fileKey}: ${res.message}`,
        });
        return;
      }
    } catch (e) {
      logWarning({
        message: "Failed to get reference photo for location",
        details: `${id} ${fileKey}: ${e}`,
      });
      return;
    }
  };

  const syncLocationName = async (id: number, name: string) => {
    const user = await userContext.validateCurrToken();
    if (!user) return;
    try {
      await CacophonyPlugin.updateStation({
        token: user.token,
        id: id.toString().slice(0, -1),
        name,
      });
      await updateLocation(db)({
        id,
        updateName: false,
      });
      return true;
    } catch (e) {
      await updateLocation(db)({
        id,
        updateName: true,
      });
      return false;
    }
  };

  const syncLocationPhotos = async (id: number, photos: string[]) => {
    const user = await userContext.validateCurrToken();
    if (!user) return;
    try {
      await Promise.all(
        photos.map(async (photo) => {
          const res = await CacophonyPlugin.uploadReferencePhoto({
            token: user.token,
            station: id.toString().slice(0, -1),
            filename: photo,
          });
          if (res.success) {
            return res.data;
          } else {
            throw new Error(res.message);
          }
        })
      );
      await updateLocation(db)({
        id,
        uploadImages: [],
      });
      return true;
    } catch (e) {
      await updateLocation(db)({
        id,
        uploadImages: photos,
      });
      return false;
    }
  };

  onMount(async () => {
    try {
      await db.execute(createLocationSchema);
    } catch (e) {
      logError({
        message: "Failed to get locations",
        details: JSON.stringify(e),
      });
    }
  });

  return {
    savedLocations,
    saveLocation,
    getReferencePhotoForLocation,
    deleteReferencePhotoForLocation,
    updateLocationName,
    updateLocationPhoto,
  };
}
