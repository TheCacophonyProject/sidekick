import { createEffect, createResource, on, onMount } from "solid-js";
import {
  insertLocations,
  updateLocation,
  getLocations,
  Location,
  LocationSchema,
  insertLocation,
  createLocationSchema,
} from "~/database/Entities/Location";
import { db } from ".";
import { CacophonyPlugin, getLocationsForUser } from "../CacophonyApi";
import { logError, logSuccess, logWarning } from "../Notification";
import { useUserContext } from "../User";

export function useLocationStorage() {
  const userContext = useUserContext();
  const getUserLocations = async () => {
    try {
      const userData = userContext.data();
      if (!userData) return [];
      const user = await userContext.validateCurrToken();
      if (!user) return [];
      const locations = await getLocationsForUser(user.token);
      return locations.map((location) => ({
        ...location,
        isProd: userData.prod,
        userId: parseInt(userData.id),
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
                savedLocation.updatedAt !== location.updatedAt
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
              console.log(diff);
              return {
                ...diff,
                id: diffLoc.id,
              };
            }
          })
          .filter(Boolean) as Location[];
        console.log(locations, locationsToUpdate);

        await Promise.all([
          insertLocations(db)(locationsToInsert),
          ...locationsToUpdate.map((location) => updateLocation(db)(location)),
        ]);
        return getLocations(db)();
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
      await updateLocation(db)({
        id: location.id,
        referenceImages,
        needsDeletion: !deleted.serverDeleted,
      });
      mutate((locations) =>
        locations?.map((loc) => {
          if (loc.id === location.id) {
            return {
              ...loc,
              referenceImages,
              needsDeletion: !deleted.serverDeleted,
            };
          }
          return loc;
        })
      );
      return true;
    } else {
      logWarning({
        message: "Failed to delete reference photo for location",
        details: `${location.id} ${fileKey}: ${res.message}`,
      });
      return false;
    }
  };
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
            message: "Failed to update location name",
            details: res.message,
          });
        }
      }
      updatedLocation.updateName = true;
      await updateLocation(db)(updatedLocation);
      mutate((locations) =>
        locations?.map((loc) =>
          loc.id === location.id ? updatedLocation : loc
        )
      );
    } catch (e) {
      logWarning({
        message: "Failed to update location name",
        details: JSON.stringify(e),
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
        } else {
          logError({
            message: "Failed to update location picture",
            details: res.message,
          });
        }
      } else {
        throw new Error("No valid token, may not have internet connection");
      }
    } catch (e) {
      debugger;
      logWarning({
        message: "Failed to update location picture",
        details: JSON.stringify(e),
      });
      location.uploadImages = [
        ...(location.uploadImages ?? []),
        newPhoto.slice(7),
      ];
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
    const user = await userContext.validateCurrToken();
    if (!user) return;
    try {
      const res = await CacophonyPlugin.getReferencePhoto({
        token: user.token,
        station: id.toString().slice(0, -1),
        fileKey,
      });
      if (res.success) {
        const photoPath = res.data;
        return `${window.location.origin}/_capacitor_file_${photoPath}`;
      }
      return res.message;
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
        id: id.toString(),
        name,
      });
      await updateLocation(db)({
        id,
        updateName: false,
      });
    } catch (e) {
      await updateLocation(db)({
        id,
        updateName: true,
      });
    }
  };

  createEffect(() => {
    on(savedLocations, async (locations) => {
      if (!locations) return;
      await Promise.all(
        locations
          .filter((loc) => loc.updateName)
          .map((location) => {
            return syncLocationName(location.id, location.name);
          })
      );
      mutate((locations) =>
        locations?.map((loc) => ({ ...loc, updateName: false }))
      );
    });
  });

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
