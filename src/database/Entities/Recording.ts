import { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { z } from "zod";

const DBName = "RecordingTableV1";

// sqllite
export const createRecordingSchema = `
CREATE TABLE IF NOT EXISTS ${DBName}(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  groupName TEXT NOT NULL,
  device TEXT NOT NULL,
  deviceName TEXT NOT NULL,
  isUploaded BOOLEAN NOT NULL DEFAULT 0,
  uploadId TEXT,
  size TEXT NOT NULL,
  isProd BOOLEAN NOT NULL DEFAULT 0
);
`;

const RecordingSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  groupName: z.string(),
  device: z.string(),
  deviceName: z.string(),
  isUploaded: z.boolean(),
  uploadId: z.string().nullable(),
  size: z.string(),
  isProd: z.boolean(),
});

export type Recording = z.infer<typeof RecordingSchema>;
export type UploadedRecording = Recording & {
  isUploaded: true;
  uploadId: string;
};
export type DownloadedRecording = Recording & {
  isUploaded: false;
  uploadId: null;
};

const RecordingsSchema = z.array(RecordingSchema);

export const getRecordings =
  (db: SQLiteDBConnection) =>
    async (options?: {
      id?: string;
      name?: string;
      uploaded?: boolean;
      device?: string;
    }): Promise<Recording[]> => {
      try {
        const sql = `SELECT * FROM ${DBName}`;
        const where = [];
        if (options?.id) {
          where.push(`id = '${options.id}'`);
        }
        if (options?.name) {
          where.push(`name = '${options.name}'`);
        }
        if (options?.uploaded) {
          where.push(`isUploaded = ${options.uploaded ? 1 : 0}`);
        }
        if (options?.device) {
          where.push(`device = '${options.device}'`);
        }
        const whereClause =
          where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
        const query = `${sql}${whereClause};`;
        const result = await db.query(query);
        const recordings = RecordingsSchema.safeParse(
          result.values?.map((v) => ({
            ...v,
            isUploaded: !!v.isUploaded,
            isProd: !!v.isProd,
          })) ?? []
        );
        if (!recordings.success) return [];
        return recordings.data;
      } catch (error) {
        console.log(error);
        return [];
      }
    };

export const insertRecording =
  (db: SQLiteDBConnection) => async (recording: Omit<DownloadedRecording, "id"|"isUploaded"|"uploadId">) => {
    const sql = `INSERT INTO ${DBName} (id, name, path, groupName, device, deviceName, size, isProd) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;
    const values = [
      `${recording.device}-${recording.name}`,
      recording.name,
      recording.path,
      recording.groupName,
      recording.device,
      recording.deviceName,
      recording.size,
      recording.isProd,
    ];
    return db.query(sql, values);
  };

export const updateRecording =
  (db: SQLiteDBConnection) => async (recording: Recording) => {
    if (!recording.isUploaded || !recording.uploadId) return;
    const sql = `UPDATE ${DBName} SET isUploaded = ${recording.isUploaded ? 1 : 0
      }, uploadId = '${recording.uploadId}' WHERE id = '${recording.id}';`;
    return db.query(sql);
  };

export const deleteRecording =
  (db: SQLiteDBConnection) => async (recording: Recording) => {
    const sql = `DELETE FROM ${DBName} WHERE id = '${recording.id}';`;
    return db.query(sql);
  };

export const deleteRecordings =
  (db: SQLiteDBConnection) => async (recordings: Recording[]) => {
    const sql = `DELETE FROM ${DBName} WHERE id IN (${recordings
      .map((r) => `'${r.id}'`)
      .join(",")});`;
    return db.query(sql);
  };
