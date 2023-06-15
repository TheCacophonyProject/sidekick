import { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { z } from "zod";
import { boolToInt, insertIntoTable, insertManyIntoTable } from "..";

const TABLE_NAME = "LocationTableV3";

const CoordsSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export type Coords = z.infer<typeof CoordsSchema>;

const SettingsSchema = z.object({
  referenceImages: z.array(z.string()).nullish(),
});

export const LocationSchema = z.object({
  id: z.number().positive(),
  name: z.string(),
  userId: z.number().positive().nullish(),
  coords: CoordsSchema,
  updatedAt: z.string(),
  isProd: z.coerce.boolean().default(false),
  updateName: z.coerce.boolean().default(false),
  needsCreation: z.coerce.boolean().default(false),
  needsRename: z.coerce.boolean().default(false),
  groupName: z.string(),
  referenceImages: z.array(z.string()).nullish(),
  // Images created offline to sync with server
  uploadImages: z.array(z.string()).nullish(),
  deleteImages: z.array(z.string()).nullish(),
});

export const ApiLocationSchema = LocationSchema.extend({
  settings: SettingsSchema.nullish(),
});

const MutationLocationSchema = ApiLocationSchema.extend({
  coords: CoordsSchema.transform((val) => JSON.stringify(val)),
});
const LocationParse = MutationLocationSchema.partial().transform((val) => {
  // remove settings and set settings.referenceImages to string for key referenceImages
  const { settings, deleteImages, ...rest } = val;
  return {
    ...rest,
    ...(settings?.referenceImages && {
      referenceImages: JSON.stringify(settings.referenceImages),
    }),
    ...(deleteImages && {
      deleteImages: JSON.stringify(deleteImages),
    }),
    id: parseInt(`${rest.id}${rest.isProd ? "1" : "0"}`),
  };
});

const stringToArr = z
  .string()
  .nullish()
  .transform((val) => {
    if (!val) return [];
    return JSON.parse(val) as string[];
  });
const QueryLocationSchema = LocationSchema.extend({
  coords: z.string().transform((val) => CoordsSchema.parse(JSON.parse(val))),
  referenceImages: stringToArr,
  deleteImages: stringToArr,
  uploadImages: stringToArr,
});

export const createLocationSchema = `
CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  userId INTEGER,
  coords TEXT NOT NULL,
  isProd INTEGER NOT NULL,
  needsRename INTEGER NOT NULL,
  needsCreation INTEGER NOT NULL,
  updateName INTEGER NOT NULL,
  referenceImages TEXT,
  uploadImages TEXT,
  deleteImages TEXT,
  updatedAt TEXT NOT NULL,
  groupName TEXT NOT NULL
);
`;

export type Location = z.infer<typeof LocationSchema>;
export const insertLocation = insertIntoTable({
  tableName: TABLE_NAME,
  schema: LocationParse,
});
export const insertLocations = insertManyIntoTable({
  tableName: TABLE_NAME,
  schema: LocationParse,
  keys: Object.keys(LocationSchema.shape),
});
const getLocationByIdSql = `SELECT * FROM ${TABLE_NAME} WHERE id = ?`;
export const getLocationById =
  (db: SQLiteDBConnection) =>
  async (id: string): Promise<Location | null> => {
    const result = await db.query(getLocationByIdSql, [id]);
    if (!result.values || result.values.length === 0) return null;
    const row = result.values[0];
    return QueryLocationSchema.parse(row);
  };

export const hasLocation =
  (db: SQLiteDBConnection) => async (location: Location) => {
    const result = await db.query(getLocationByIdSql, [location.id]);
    return result.values && result.values.length > 0;
  };

const getLocationsSql = `SELECT * FROM ${TABLE_NAME}`;
export const getLocations =
  (db: SQLiteDBConnection) => async (): Promise<Location[]> => {
    const result = await db.query(getLocationsSql);
    if (!result.values) return [];
    return result.values.map((row: unknown) => QueryLocationSchema.parse(row));
  };

const deleteLocationSql = `DELETE FROM ${TABLE_NAME} WHERE id = ?`;
export const deleteLocation =
  (db: SQLiteDBConnection) => async (location: Location) => {
    return db.query(deleteLocationSql, [location.id]);
  };

type UpdateLocation = Pick<Location, "id"> & Partial<Location>;
const updateSql = (set: [string, unknown][]) =>
  `UPDATE ${TABLE_NAME} SET ${set
    .map(([key]) => `${key} = ?`)
    .join(", ")} WHERE id = ?`;
const upateLocationSql = (location: UpdateLocation) => {
  const entries = Object.entries(LocationParse.parse(location)).filter(
    ([key]) => key !== "id"
  );
  const set = entries;
  return [updateSql(set), entries.map(([, value]) => value)] as const;
};

export const updateLocation =
  (db: SQLiteDBConnection) => async (location: UpdateLocation) => {
    const [sql, values] = upateLocationSql(location);
    return db.query(sql, [...values, location.id]);
  };
