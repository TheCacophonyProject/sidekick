import { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { z } from "zod";

const DBName = "LocationTableV5";

const CoordsSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export type Coords = z.infer<typeof CoordsSchema>;

const SettingsSchema = z.object({
  referenceImages: z.array(z.string()).optional(),
});

export const LocationSchema = z.object({
  id: z.number().positive(),
  name: z.string(),
  coords: CoordsSchema,
  updatedAt: z.string(),
  settings: SettingsSchema.optional(),
  updatePic: z.coerce.boolean().default(false),
  updateName: z.coerce.boolean().default(false),
  needsRename: z.coerce.boolean().optional(),
  groupId: z.coerce.number().positive(),
  groupName: z.string(),
});

const MutationLocationSchema = LocationSchema.extend({
  coords: CoordsSchema.transform((val) => JSON.stringify(val)),
  updateName: z.coerce.boolean().transform((val) => (val ? 1 : 0)),
  updatePic: z.coerce.boolean().transform((val) => (val ? 1 : 0)),
  needsRename: z.coerce.boolean().transform((val) => (val ? 1 : 0)),
  settings: SettingsSchema.optional().transform((val) => JSON.stringify(val)),
});

const QueryLocationSchema = LocationSchema.extend({
  coords: z.string().transform((val) => CoordsSchema.parse(JSON.parse(val))),
  settings: z
    .object({
      referenceImages: z
        .string()
        .optional()
        .transform((val) => (val ? JSON.parse(val) : []))
        .refine((val) => z.array(z.string()).parse(val)),
    })
    .optional(),
});

export const createLocationSchema = `
CREATE TABLE IF NOT EXISTS ${DBName} (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  coords TEXT NOT NULL,
  needsRename INTEGER NOT NULL,
  updatePic INTEGER NOT NULL,
  updateName INTEGER NOT NULL,
  referenceImages TEXT,
  updatedAt TEXT NOT NULL,
  groupId INTEGER NOT NULL,
  groupName TEXT NOT NULL
);
`;

export type Location = z.infer<typeof LocationSchema>;
const getLocationByIdSql = `SELECT * FROM ${DBName} WHERE id = ?`;
const insertStaionSql = `INSERT INTO ${DBName} ( id, name, coords, needsRename, updatePic, updateName, updatedAt, groupId, groupName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
export const insertLocation =
  (db: SQLiteDBConnection) => async (location: Location) => {
    const values = [
      location.id,
      location.name,
      JSON.stringify(location.coords),
      location.needsRename ? 1 : 0,
      location.updatePic ? 1 : 0,
      location.updateName ? 1 : 0,
      location.updatedAt,
      location.groupId,
      location.groupName,
    ];

    return db.run(insertStaionSql, values);
  };

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

const getLocationsSql = `SELECT * FROM ${DBName}`;
export const getLocations =
  (db: SQLiteDBConnection) => async (): Promise<Location[]> => {
    const result = await db.query(getLocationsSql);
    if (!result.values) return [];
    return result.values.map((row) => QueryLocationSchema.parse(row));
  };
const deleteLocationSql = `DELETE FROM ${DBName} WHERE id = ?`;
export const deleteLocation =
  (db: SQLiteDBConnection) => async (location: Location) => {
    return db.query(deleteLocationSql, [location.id]);
  };

type UpdateLocation = Pick<Location, "id"> & Partial<Location>;
const updateSql = (set: string) => `UPDATE ${DBName} SET ${set} WHERE id = ?`;
const upateLocationSql = (location: UpdateLocation) => {
  const entries = Object.entries(MutationLocationSchema.parse(location)).filter(
    ([key]) => key !== "id"
  );
  const set = entries.map(([key]) => `${key} = ?`).join(", ");
  return [updateSql(set), entries.map(([, value]) => value)] as const;
};

export const updateLocation =
  (db: SQLiteDBConnection) => async (location: UpdateLocation) => {
    const [sql, values] = upateLocationSql(location);
    return db.run(sql, [...values, location.id]);
  };
