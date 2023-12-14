import { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { z } from "zod";
import crypto from "crypto";

const WifiNetworksDBName = "WifiNetworksV1";
function encrypt(text: string, pin: string) {
  const iv = crypto.randomBytes(16); // Initialization vector
  const key = crypto
    .createHash("sha256")
    .update(String(pin))
    .digest("base64")
    .substr(0, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return {
    iv: iv.toString("hex"),
    content: encrypted,
    tag: tag,
  };
}

interface EncryptedData {
  content: string;
  iv: string;
  tag: string;
}

function decrypt(encryptedData: EncryptedData, pin: string): string {
  try {
    const iv = Buffer.from(encryptedData.iv, "hex");
    const tag = Buffer.from(encryptedData.tag, "hex");
    const key = crypto
      .createHash("sha256")
      .update(String(pin))
      .digest("base64")
      .slice(0, 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedData.content, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Decryption failed");
  }
}

export const createWifiNetworksSchema = `
CREATE TABLE IF NOT EXISTS ${WifiNetworksDBName}(
  ssid TEXT PRIMARY KEY,
  encryptedPassword TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  lastConnected DATETIME
);
`;
const WifiNetworkSchema = z.object({
  ssid: z.string(),
  password: z.string(),
  iv: z.string(),
  tag: z.string(),
  lastConnected: z.date().optional(),
});

export type WifiNetwork = z.infer<typeof WifiNetworkSchema>;

export const insertWifiNetwork =
  (db: SQLiteDBConnection) =>
  async (network: Omit<WifiNetwork, "lastConnected">, pin: string) => {
    const encryptedPassword = encrypt(network.password, pin);
    const sql = `INSERT INTO ${WifiNetworksDBName} (ssid, encryptedPassword, iv, tag) VALUES (?, ?, ?, ?);`;
    const values = [
      network.ssid,
      encryptedPassword.content,
      encryptedPassword.iv,
      encryptedPassword.tag,
    ];
    return db.query(sql, values);
  };

export const getWifiNetwork =
  (db: SQLiteDBConnection) => async (ssid: string, pin: string) => {
    const sql = `SELECT encryptedPassword, iv, tag FROM ${WifiNetworksDBName} WHERE ssid = ?;`;
    const values = [ssid];
    const result = await db.query(sql, values);
    if (!result.values || result.values?.length === 0) {
      throw new Error("Network not found");
    }
    const network = WifiNetworkSchema.parse(result.values[0]);
    const decryptedPassword = decrypt(
      {
        content: network.password,
        iv: network.iv,
        tag: network.tag,
      },
      pin
    );
    return decryptedPassword;
  };
