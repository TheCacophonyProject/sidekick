import {
  SQLiteConnection,
  SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { z } from "zod";

/**
 *
 * @param conName  database name
 * @param isDelete delete the database if exists
 */
export const openConnection = async (
  sqlite: SQLiteConnection,
  dbName: string,
  encrypted: boolean,
  mode: string,
  version: number
): Promise<SQLiteDBConnection> => {
  let db: SQLiteDBConnection;
  try {
    const retCC = (await sqlite.checkConnectionsConsistency()).result;
    const isConn = (await sqlite.isConnection(dbName, false)).result;
    if (retCC && isConn) {
      return await sqlite.retrieveConnection(dbName, false);
    } else {
      db = await sqlite.createConnection(
        dbName,
        encrypted,
        mode,
        version,
        false
      );
    }
    await db.open();
    return db;
  } catch (err) {
    return Promise.reject(err);
  }
};
export const removeEscapedQuotes = (str: string) => {
  return str.replace(/\\\"/g, '"').replace(/^"(.*)"$/, "$1");
};
export const boolToInt = z.coerce.boolean().transform((val) => (val ? 1 : 0));
export const insertIntoTable =
  <T extends object, S extends z.Schema<T>>({
    tableName,
    schema,
  }: {
    tableName: string;
    schema: S;
  }) =>
  (db: SQLiteDBConnection) =>
  async (obj: T) => {
    // Validate the object using the provided Zod schema
    const validatedObj = schema.parse(obj);

    // Generate the SQL query based on the object's keys and values
    const keys = Object.keys(validatedObj);
    const placeholders = keys.map(() => "?").join(", ");
    const values = keys.map((key) => validatedObj[key as keyof T]);
    const insertSql = `INSERT INTO ${tableName} (${keys.join(
      ", "
    )}) VALUES (${placeholders})`;

    return db.run(insertSql, values);
  };

export const insertManyIntoTable =
  <T extends object, S extends z.Schema<T>>({
    tableName,
    schema,
    keys,
  }: {
    tableName: string;
    schema: S;
    keys: string[];
  }) =>
  (db: SQLiteDBConnection) =>
  async (objs: T[]) => {
    if (objs.length === 0) return;
    // Validate the object using the provided Zod schema
    const validatedObjs = objs.map((obj) => schema.parse(obj));

    // Generate placeholders for each object
    const placeholders = validatedObjs
      .flatMap(() => `(${keys.map(() => "?").join(", ")})`)
      .join(", ");
    const values = validatedObjs.flatMap((obj) =>
      keys.map((key) => obj[key as keyof T])
    );
    const insertSql = `INSERT INTO ${tableName} (${keys.join(
      ", "
    )}) VALUES ${placeholders};`;

    return db.run(insertSql, values);
  };
