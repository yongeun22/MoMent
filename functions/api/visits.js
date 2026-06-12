import { json } from "../_shared/response.js";

function getDatabase(env) {
  return env?.VISITS_DB || null;
}

async function ensureSchema(db) {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS site_visit_counter (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `)
    .run();
}

async function readVisitCount(db) {
  const row = await db
    .prepare("SELECT count FROM site_visit_counter WHERE id = 1")
    .first();
  return Number(row?.count || 0);
}

async function recordVisit(db) {
  const now = new Date().toISOString();
  await db
    .prepare("INSERT INTO site_visit_counter (id, count, updated_at) VALUES (1, 0, ?) ON CONFLICT(id) DO NOTHING")
    .bind(now)
    .run();
  await db
    .prepare("UPDATE site_visit_counter SET count = count + 1, updated_at = ? WHERE id = 1")
    .bind(now)
    .run();
  return readVisitCount(db);
}

export async function onRequestGet(context) {
  try {
    const db = getDatabase(context.env);
    if (!db) {
      return json({ error: "Visit counter is unavailable." }, 503);
    }

    await ensureSchema(db);
    return json({ count: await readVisitCount(db) });
  } catch (error) {
    console.error("Failed to read visit count", error);
    return json({ error: "Visit counter is unavailable." }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = getDatabase(context.env);
    if (!db) {
      return json({ error: "Visit counter is unavailable." }, 503);
    }

    await ensureSchema(db);
    return json({ count: await recordVisit(db) }, 201);
  } catch (error) {
    console.error("Failed to record visit", error);
    return json({ error: "Visit counter is unavailable." }, 500);
  }
}
