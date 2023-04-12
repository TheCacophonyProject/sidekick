import { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { z } from "zod";
import { removeEscapedQuotes } from "..";

const DBName = "events";

// sqlite schem
export const createEventSchema = `
CREATE TABLE IF NOT EXISTS ${DBName} (
  key TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  device TEXT NOT NULL,
  details TEXT NOT NULL,
  isUploaded BOOLEAN NOT NULL DEFAULT 0,
  isProd BOOLEAN NOT NULL DEFAULT 0
);
`;

const EventSchema = z.object({
  key: z.string(),
  timestamp: z.string(),
  type: z.string(),
  device: z.string(),
  details: z.string(),
  isUploaded: z.boolean(),
  isProd: z.boolean(),
});

export type Event = z.infer<typeof EventSchema>;

export const insertEvent = (db: SQLiteDBConnection) => async (event: Event) => {
  // check if event exists
  const sqlCheck = `SELECT * FROM ${DBName} WHERE key = '${event.key}';`;
  const existing = await db.query(sqlCheck);
  if (existing.values && existing.values.length > 0) return existing.values[0];

  const sql = `INSERT INTO ${DBName} (key, timestamp, type, device, details, isUploaded, isProd) VALUES (?, ?, ?, ?, ?, ?, ?);`;
  const values = [
    event.key,
    event.timestamp,
    event.type,
    event.device,
    event.details,
    event.isUploaded,
    event.isProd,
  ];
  return db.run(sql, values);
};

const EventsSchema = z.array(EventSchema);

export const getEvents =
  (db: SQLiteDBConnection) =>
  async (options?: { uploaded?: boolean; device?: string }) => {
    const sql = `SELECT * FROM ${DBName}`;
    const where = [];
    if (options?.uploaded !== undefined) {
      where.push(`isUploaded = ${options.uploaded ? 1 : 0}`);
    }
    if (options?.device !== undefined) {
      where.push(`device = '${options.device}'`);
    }
    const whereClause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
    const result = await db.query(`${sql}${whereClause};`);
    const events = EventsSchema.safeParse(
      result.values?.map((v) => ({
        ...v,
        isUploaded: !!v.isUploaded,
        isProd: !!v.isProd,
        details: removeEscapedQuotes(v.details),
      })) ?? []
    );
    if (!events.success) return [];
    return events.data;
  };

export const updateEvent = (db: SQLiteDBConnection) => async (event: Event) => {
  const sql = `UPDATE ${DBName} SET isUploaded = ${
    event.isUploaded ? 1 : 0
  } WHERE key = '${event.key}';`;
  return db.run(sql);
};

export const deleteEvent = (db: SQLiteDBConnection) => async (event: Event) => {
  const sql = `DELETE FROM ${DBName} WHERE key = '${event.key}';`;
  return db.run(sql);
};

export const deleteEvents =
  (db: SQLiteDBConnection) => async (events: Event[]) => {
    if (events.length === 0) return;
    const sql = `DELETE FROM ${DBName} WHERE key IN (${events
      .map((e) => `'${e.key}'`)
      .join(",")});`;

    return db.run(sql);
  };
