import { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { z } from "zod";

export type Recording = {
  name: string;
  path: string;
  groupName: string;
  device: string;
  isUploaded?: boolean;
  uploadId?: string | null;
  size: string;
  isProd: boolean;
};
// sqllite
export const createRecordingSchema = `
CREATE TABLE IF NOT EXISTS recordings (
  name TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  groupName TEXT NOT NULL,
  device TEXT NOT NULL,
  isUploaded BOOLEAN NOT NULL DEFAULT 0,
  uploadId TEXT,
  size TEXT NOT NULL,
  isProd BOOLEAN NOT NULL DEFAULT 0
);
`;

const RecordingSchema = z.object({
  name: z.string(),
  path: z.string(),
  groupName: z.string(),
  device: z.string(),
  isUploaded: z.boolean(),
  uploadId: z.string().nullable(),
  size: z.string(),
  isProd: z.boolean(),
});

const RecordingsSchema = z.array(RecordingSchema);

export const getRecordings =
  (db: SQLiteDBConnection) =>
  async (options?: {
    name?: string;
    uploaded?: boolean;
    device?: string;
  }): Promise<Recording[]> => {
    const sql = `SELECT * FROM recordings`;
    const where = [];
    const values = [];
    if (options?.name) {
      values.push(options.name);
      where.push(`name = ?`);
    }
    if (options?.uploaded) {
      values.push(options.uploaded);
      where.push(`isUploaded = ?`);
    }
    if (options?.device) {
      values.push(options.device);
      where.push(`device = ?`);
    }
    const whereClause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
    const query = `${sql}${whereClause};`;
    const result = await db.query(query, values);
    const recordings = RecordingsSchema.safeParse(
      result.values?.map((v) => ({
        ...v,
        isUploaded: !!v.isUploaded,
        isProd: !!v.isProd,
      })) ?? []
    );
    if (!recordings.success) return [];
    return recordings.data;
  };

export const insertRecording =
  (db: SQLiteDBConnection) =>
  async (recording: Recording): Promise<void> => {
    const sql = `INSERT INTO recordings (name, path, groupName, device, size, isProd) VALUES (?, ?, ?, ?, ?, ?);`;
    const values = [
      recording.name,
      recording.path,
      recording.groupName,
      recording.device,
      recording.size,
      recording.isProd,
    ];
    await db.run(sql, values);
  };

export const updateRecording =
  (db: SQLiteDBConnection) =>
  async (recording: Recording): Promise<void> => {
    const sql = `UPDATE recordings SET isUploaded = ?, uploadId = ? WHERE name = ?;`;
    const values = [recording.isUploaded, recording.uploadId, recording.name];
    await db.run(sql, values);
  };

export const deleteRecording =
  (db: SQLiteDBConnection) =>
  async (recording: Recording): Promise<void> => {
    const sql = `DELETE FROM recordings WHERE name = ?;`;
    const values = [recording.name];
    await db.run(sql, values);
  };

export const deleteRecordings =
  (db: SQLiteDBConnection) =>
  async (recordings: Recording[]): Promise<void> => {
    const sql = `DELETE FROM recordings WHERE name = ?;`;
    const values = recordings.map((r) => r.name);
    await db.run(sql, values);
  };
