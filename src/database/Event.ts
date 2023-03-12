import { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { z } from "zod";

export type Event = {
  key: string;
  timestamp: string;
  type: string;
  device: string;
  details: string;
  isUploaded: boolean;
};

// sqlite schem
export const createEventSchema = `
CREATE TABLE IF NOT EXISTS event (
  key TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  device TEXT NOT NULL,
  details TEXT NOT NULL,
  isUploaded BOOLEAN NOT NULL DEFAULT 0
);
`;

export const insertEvent =
  (db: SQLiteDBConnection) =>
  async (event: Event): Promise<void> => {
    const sql = `INSERT INTO event (key, timestamp, type, device, details, isUploaded) VALUES (?, ?, ?, ?, ?, ?);`;
    const values = [
      event.key,
      event.timestamp,
      event.type,
      event.device,
      event.details,
      event.isUploaded,
    ];
    await db.run(sql, values);
  };

const EventSchema = z.object({
  key: z.string(),
  timestamp: z.string(),
  type: z.string(),
  device: z.string(),
  details: z.string(),
  isUploaded: z.boolean(),
});

const EventsSchema = z.array(EventSchema);

export const getEvents =
  (db: SQLiteDBConnection) =>
  async (options?: { uploaded?: boolean; device?: string }) => {
    let sql = `SELECT * FROM event`;
    const where = [];
    const values = [];
    if (options?.uploaded) {
      values.push(options.uploaded);
      where.push(`isUploaded = ?`);
    }
    if (options?.device) {
      values.push(options.device);
      where.push(`device = ?`);
    }
    const whereClause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
    const result = await db.query(`${sql}${whereClause};`, values);
    const events = EventsSchema.safeParse(
      result.values?.map((v) => ({ ...v, isUploaded: !!v.isUploaded })) ?? []
    );
    if (!events.success) return [];
    return events.data;
  };

export const updateEvent =
  (db: SQLiteDBConnection) =>
  async (event: Event): Promise<void> => {
    const sql = `UPDATE event SET isUploaded = ? WHERE key = ?`;
    const values = [event.isUploaded, event.key];
    await db.run(sql, values);
  };

export const deleteEvent =
  (db: SQLiteDBConnection) =>
  async (event: Event): Promise<void> => {
    const sql = `DELETE FROM event WHERE key = ?;`;
    const values = [event.key];
    await db.run(sql, values);
  };

export const deleteEvents =
  (db: SQLiteDBConnection) =>
  async (events: Event[]): Promise<void> => {
    const sql = `DELETE FROM event WHERE key = ?;`;
    const values = events.map((e) => e.key);
    await db.run(sql, values);
  };
