import { json } from "../_shared/response.js";

const STATUS_UPDATE_ID = "moment-status-report";

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
