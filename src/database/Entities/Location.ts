import { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { z } from "zod";
import { insertIntoTable, insertManyIntoTable } from "..";

const TABLE_NAME = "LocationV2";

export const createLocationSchema = `
CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
  id INTEGER PRIMARY KEY,
  name TEXT,
  groupName TEXT NOT NULL,
  coords TEXT NOT NULL,
  isProd INTEGER,
  updatedAt TEXT NOT NULL,
  needsCreation INTEGER NOT NULL,
  needsRename INTEGER NOT NULL,
  updateName TEXT,
  referencePhotos TEXT,
  uploadPhotos TEXT,
  deletePhotos TEXT
);
`;

export const CoordsSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export type Coords = z.infer<typeof CoordsSchema>;

export const LocationSchema = z.object({
  id: z.number().positive(),
  name: z.string().nullish(),
  groupName: z.string(),
  coords: CoordsSchema,
  isProd: z.coerce.boolean().default(false),
  updatedAt: z.string(),
  updateName: z.string().nullish(),
  needsRename: z.coerce.boolean().default(false),
  needsCreation: z.coerce.boolean().default(false),
  referencePhotos: z.array(z.string()).nullish().default([]),
  // Photos to upload
  uploadPhotos: z.array(z.string()).nullish(),
  // Photos to delete
  deletePhotos: z.array(z.string()).nullish(),
});

const StrToArr = z.string().transform((val) => {
  if (!val) return [];
  return JSON.parse(val) as string[];
});

const ArrToString = z
  .array(z.string())
  .default([])
  .transform((val) => JSON.stringify(val));

const transformId = <T extends { id: number; isProd: boolean }>(val: T) => ({
  ...val,
  id: (val.id << 1) | (val.isProd ? 1 : 0),
});

const reverseTransformId = <T extends { id: number }>(val: T) => ({
  ...val,
  id: val.id >> 1,
  isProd: Boolean(val.id & 1),
});

export const MutationLocationSchema = LocationSchema.extend({
  deletePhotos: ArrToString,
  uploadPhotos: ArrToString,
  referencePhotos: ArrToString,
  coords: CoordsSchema.transform((val) => JSON.stringify(val)),
});

export const QueryLocationSchema = MutationLocationSchema.extend({
  coords: z.string().transform((val) => CoordsSchema.parse(JSON.parse(val))),
  referencePhotos: StrToArr,
  deletePhotos: StrToArr,
  uploadPhotos: StrToArr,
}).transform(reverseTransformId);

export type Location = z.infer<typeof LocationSchema>;
const InsertSchema = MutationLocationSchema.transform(transformId);
// Make zod partial except for id
export const insertLocation = insertIntoTable({
  tableName: TABLE_NAME,
  schema: InsertSchema,
});
export const insertLocations = insertManyIntoTable({
  tableName: TABLE_NAME,
  schema: InsertSchema,
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
  (db: SQLiteDBConnection) => async (id: string, isProd: boolean) =>
    db.run(deleteLocationSql, [transformId({ id: Number(id), isProd }).id]);

const UpdateSchema = MutationLocationSchema.partial()
  .extend({
    id: z.number().positive(),
    isProd: z.coerce.boolean(),
  })
  .transform(transformId);

export type ParsedUpdateLocation = z.infer<typeof UpdateSchema>;
const updateSql = (set: [string, unknown][]) =>
  `UPDATE ${TABLE_NAME} SET ${set
    .map(([key]) => `${key} = ?`)
    .join(", ")} WHERE id = ?`;
const upateLocationSql = (location: ParsedUpdateLocation) => {
  const entries = Object.entries(location).filter(
    ([key]) => key !== "id" && key !== "isProd"
  );
  const set = entries;
  return [updateSql(set), entries.map(([, value]) => value)] as const;
};

export type UpdateLocation = Partial<Location> & {
  id: number;
  isProd: boolean;
};
export const updateLocation =
  (db: SQLiteDBConnection) => async (location: UpdateLocation) => {
    const loc = UpdateSchema.parse(location);
    const [sql, values] = upateLocationSql(loc);
    return db.run(sql, [...values, loc.id]);
  };
