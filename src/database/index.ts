import {
  SQLiteConnection,
  SQLiteDBConnection,
} from "@capacitor-community/sqlite";
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
    let isConn = (await sqlite.isConnection(dbName, false)).result;
    if (retCC && isConn) {
      db = await sqlite.retrieveConnection(dbName, false);
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
