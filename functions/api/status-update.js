import { json } from "../_shared/response.js";

const STATUS_UPDATE_ID = "moment-status-report";
const STATUS_UPDATE_TOKEN_HASH_ENV_NAMES = [
  "STATUS_UPDATE_TOKEN_HASH",
  "MOMENT_STATUS_UPDATE_TOKEN_HASH",
];

function getDatabase(env) {
  return env?.VISITS_DB || null;
}

async function ensureSchema(db) {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS site_status_updates (
        id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL
      )
    `)
    .run();
}

async function readStatusUpdate(db) {
  const row = await db
    .prepare("SELECT updated_at FROM site_status_updates WHERE id = ?")
    .bind(STATUS_UPDATE_ID)
    .first();
  return row?.updated_at || null;
}

async function recordStatusUpdate(db) {
  const now = new Date().toISOString();
  await db
    .prepare(`
      INSERT INTO site_status_updates (id, updated_at)
      VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
    `)
    .bind(STATUS_UPDATE_ID, now)
    .run();
  return now;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left, right) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function getStatusUpdateTokenHash(env) {
  const configuredHash = STATUS_UPDATE_TOKEN_HASH_ENV_NAMES
    .map((name) => env?.[name])
    .find((value) => typeof value === "string" && value.trim().length > 0);
  return configuredHash ? configuredHash.trim().toLowerCase() : "";
}

function readStatusUpdateToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return (request.headers.get("X-Moment-Status-Token") || "").trim();
}

async function verifyStatusUpdateToken(request, env) {
  const expectedHash = getStatusUpdateTokenHash(env);
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }

  const token = readStatusUpdateToken(request);
  if (!token) {
    return false;
  }

  const candidateHash = await sha256Hex(token);
  return constantTimeEqual(hexToBytes(candidateHash), hexToBytes(expectedHash));
}

export async function onRequestGet(context) {
  try {
    const db = getDatabase(context.env);
    if (!db) {
      return json({ error: "Status update is unavailable." }, 503);
    }

    await ensureSchema(db);
    return json({ updatedAt: await readStatusUpdate(db) });
  } catch (error) {
    console.error("Failed to read status update", error);
    return json({ error: "Status update is unavailable." }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    if (!(await verifyStatusUpdateToken(context.request, context.env))) {
      return json({ error: "Not found." }, 404);
    }

    const db = getDatabase(context.env);
    if (!db) {
      return json({ error: "Status update is unavailable." }, 503);
    }

    await ensureSchema(db);
    return json({ updatedAt: await recordStatusUpdate(db) }, 201);
  } catch (error) {
    console.error("Failed to record status update", error);
    return json({ error: "Status update is unavailable." }, 500);
  }
}
