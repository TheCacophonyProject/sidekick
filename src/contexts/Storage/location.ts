import { createResource, onMount } from "solid-js";
import {
  insertLocations,
  updateLocation,
  getLocations,
  Location,
  LocationSchema,
  insertLocation,
  createLocationSchema,
  deleteLocation,
} from "~/database/Entities/Location";
import { db } from ".";
import {
  ApiLocation,
  CacophonyPlugin,
  getLocationsForUser,
} from "../CacophonyApi";
import { logError, logSuccess, logWarning } from "../Notification";
import { useUserContext } from "../User";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { DevicePlugin } from "../Device";

export function useLocationStorage() {
  const userContext = useUserContext();
  const getServerLocations = async () => {
    try {
      const user = await userContext.validateCurrToken();
      if (!user) return [];
      const locations = await getLocationsForUser(user.token);
      return locations.map((location) => ({
        ...location,
        isProd: user.prod,
      }));
    } catch (e) {
      if (e instanceof Error) {
        logError({
          message:
            "Unable to get locations. Please check internet and you are logged in",
          error: e,
        });
        return [];
      } else {
        logWarning({
          message:
            "Unable to get locations. Please check internet and you are logged in",
          details: JSON.stringify(e),
        });
        return [];
      }
    }
  };

  const [savedLocations, { mutate, refetch }] = createResource(
    () => [userContext.data(), userContext.data.loading] as const,
    async (data) => {
      try {
        const [user, loading] = data;
        if (loading) return [];
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
        const locationsToUpdate = dbLocations
          .map((dbLoc) => {
            const diffLoc = locations.find(
              (userLoc) =>
                dbLoc.id === userLoc.id &&
                dbLoc.isProd === userLoc.isProd &&
                (dbLoc.name !== userLoc.name ||
                  dbLoc.updatedAt !== userLoc.updatedAt ||
                  !dbLoc.referenceImages?.every(
                    (refImage) =>
                      userLoc.referenceImages?.includes(refImage) ?? false
                  ))
            );
            if (diffLoc) {
              // get difference between location and savedLocation objects
              const locationKeys = Object.keys(
                diffLoc
              ) as (keyof ApiLocation)[];
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

        await insertLocations(db)(locationsToInsert);
        await Promise.all([
          ...locationsToUpdate.map((location) => updateLocation(db)(location)),
        ]);
        // Sync locations names and photos
        const newLocations = await getLocations(db)();
        const syncedLocations = await Promise.all(
          newLocations.map(async (location) => {
            if (!user || location.isProd !== user?.prod) return location;
            if (location.needsCreation) {
              const res = await createLocation({
                ...location,
                name: location.updateName ?? location.name,
                referenceImages: location.referenceImages ?? [],
              });
              if (res) {
                deleteLocation(db)(location.id.toString());
              }
              return res;
            }
            if (location.updateName) {
              let name = location.updateName;
              while (newLocations.some((loc) => loc.name === name)) {
                name = `${location.updateName}(${Math.floor(
                  Math.random() * 100
                )})`;
              }
              const synced = await syncLocationName(location.id, name);
              if (synced) {
                location.name = name;
                location.updateName = undefined;
              } else {
                location.updateName = name;
              }
            }
            if (location.uploadImages?.length) {
              const [upload, currImages] = await syncLocationPhotos(location);
              location.uploadImages = upload;
              location.referenceImages = currImages;
            }
            if (location.deleteImages?.length) {
              const synced = await syncLocationDeleteImages(location);
              location.deleteImages = [
                ...(location.deleteImages?.filter(
                  (img) => !synced.includes(img)
                ) ?? []),
              ];
              location.referenceImages = [
                ...(location.referenceImages?.filter(
                  (img) => !synced.includes(img)
                ) ?? []),
              ];
              console.log("SYNCED DELETE", synced, location);
            }
            return location;
          })
        );
        console.log(syncedLocations);
        return syncedLocations;
      } catch (e) {
        if (e instanceof Error) {
          console.log(e);
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
    const deleteImages = location.deleteImages ?? [];
    if (!user) return [];
    const deleted: string[] = [];
    for (const fileKey of deleteImages) {
      if (!location.referenceImages?.includes(fileKey)) {
        location.deleteImages = location.deleteImages?.filter(
          (image) => image !== fileKey
        );
        await updateLocation(db)({
          id: location.id,
          isProd: location.isProd,
          deleteImages: location.deleteImages,
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
        location.deleteImages = deleteImages;
      }
    }
    await updateLocation(db)({
      id: location.id,
      isProd: location.isProd,
      deleteImages: location.deleteImages?.filter(
        (image) => !deleted.includes(image)
      ),
    });
    return deleted;
  };

  const deleteReferencePhotoForLocation = async (
    location: Location,
    fileKey: string
  ) => {
    await DevicePlugin.unbindConnection();
    const user = await userContext.validateCurrToken(false);
    const res = await CacophonyPlugin.deleteReferencePhoto({
      ...(user && { token: user.token }),
      station: location.id.toString(),
      fileKey,
    });
    await DevicePlugin.rebindConnection();
    if (res.success) {
      const deleted = res.data;
      // This image is in cache, so just remove without syncing
      const isImageToUpload = location.uploadImages?.includes(fileKey);
      const referenceImages = location.referenceImages?.filter(
        (image) => image !== fileKey
      );
      const uploadImages = location.uploadImages?.filter(
        (image) => image !== fileKey
      );

      const changes = {
        referenceImages: referenceImages ?? [],
        ...(!deleted.serverDeleted && {
          deleteImages: [
            ...(location.deleteImages ?? []).filter((key) => key !== fileKey),
            fileKey,
          ],
        }),
        ...(uploadImages && { uploadImages }),
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
      console.log(res.data);
      if (res.data.serverDeleted) {
        logSuccess({
          message: "Reference photo deleted",
        });
      } else if (!isImageToUpload) {
        logWarning({
          message:
            "Reference photo deleted from app, but not from server. We will sync it when you next open the app.",
          timeout: 6000,
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
    "Could not update location name. We will sync it when you next open the app.";
  const updateLocationName = async (location: Location, newName: string) => {
    try {
      await DevicePlugin.unbindConnection();
      const validToken = await userContext.validateCurrToken();
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
            timeout: 20000,
          });
        }
      } else {
        location.updateName = newName;
        logWarning({
          message: SyncLocationMessage,
          timeout: 20000,
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

  const updateLocationPhoto = async (location: Location, newPhoto: string) => {
    try {
      await DevicePlugin.unbindConnection();
      const validToken = await userContext.validateCurrToken(false);
      if (validToken) {
        const res = await CacophonyPlugin.uploadReferencePhoto({
          token: validToken.token,
          station: location.id.toString(),
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
        } else {
          logWarning({
            message:
              "Unable to upload location photo. We will try again when you next open the app.",
            timeout: 20000,
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
        logWarning({
          message:
            "Location photo could not upload but is saved. We will try again when you next open the app.",
          timeout: 20000,
        });
        if (!location.uploadImages?.includes(newPhoto)) {
          location.uploadImages = [...(location.uploadImages ?? []), newPhoto];
        }
      }
      await DevicePlugin.rebindConnection();
    } catch (e) {
      await DevicePlugin.rebindConnection();
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
      const user = await userContext.validateCurrToken(false);
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

  const syncLocationName = async (id: number, updateName: string) => {
    const user = await userContext.validateCurrToken();
    if (!user) return;
    let name = updateName;
    try {
      for (let i = 0; i < 3; i++) {
        name = i === 0 ? name : `${updateName}(${i})`;
        const res = await CacophonyPlugin.updateStation({
          token: user.token,
          id: id.toString(),
          name,
        });
        if (res.success) {
          await updateLocation(db)({
            id,
            isProd: user.prod,
            updateName: undefined,
          });
          return true;
        }
      }
    } catch (e) {
      await updateLocation(db)({
        id,
        isProd: user.prod,
        updateName: name,
      });
    }
    return false;
  };

  const syncLocationPhotos = async (
    location: Pick<Location, "id" | "uploadImages" | "referenceImages">
  ): Promise<[string[], string[]]> => {
    const user = await userContext.validateCurrToken();
    let uploadImages: string[] = location.uploadImages ?? [];
    if (!user) return [uploadImages, location?.referenceImages ?? []];
    const uploadedImages: [string, string][] = (
      await Promise.all(
        uploadImages.map(async (photo) => {
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
    uploadImages = uploadImages.filter(
      (image) => !uploadedImages.find((img) => img[0] === image)
    );
    const referenceImages = [
      ...(location?.referenceImages ?? []),
      ...uploadedImages.map((img) => img[1]),
    ];
    await updateLocation(db)({
      id: location.id,
      isProd: user.prod ?? false,
      uploadImages,
      referenceImages,
    });
    return [uploadImages, referenceImages];
  };

  const createLocation = async (settings: {
    groupName: string;
    referenceImages: string[];
    coords: { lat: number; lng: number };
    isProd: boolean;
    name?: string | null | undefined;
  }): Promise<Location> => {
    await DevicePlugin.unbindConnection();
    const user = await userContext.validateCurrToken();
    const fromDate = new Date().toISOString();
    const id = getNextLocationId();
    const location: Location = {
      ...settings,
      id,
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
        while (savedLocations()?.some((loc) => loc.name === name)) {
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
          await syncLocationPhotos({
            id: Number(res.data),
            referenceImages: settings.referenceImages,
          });
          location.id = parseInt(res.data);
          location.name = name;
          location.updateName = null;
          location.needsCreation = false;
          success = true;
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
          "We could not create this location on the server. We will try again when you next open the app.",
        timeout: 20000,
      });
      location.updateName = settings.name;
      location.name = null;
    }
    await DevicePlugin.rebindConnection();
    await insertLocation(db)(location);
    mutate((locations) => [...(locations ?? []), location]);
    return location;
  };

  onMount(async () => {
    try {
      await db.execute(createLocationSchema);
    } catch (e) {
      logError({
        message:
          "Unable to get locations. Please check internet and you are logged in",
        details: JSON.stringify(e),
      });
    }
  });

  return {
    savedLocations,
    saveLocation,
    createLocation,
    resyncLocations: refetch,
    getReferencePhotoForLocation,
    deleteReferencePhotoForLocation,
    updateLocationName,
    updateLocationPhoto,
  };
}
