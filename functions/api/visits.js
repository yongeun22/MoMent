function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function ensureSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS site_stats (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

async function readCount(db) {
  const result = await db
    .prepare("SELECT value FROM site_stats WHERE key = ?")
    .bind("visit_count")
    .first();

  return Number(result?.value || 0);
}

function getDatabase(env) {
  return env?.VISITS_DB || null;
}

export async function onRequestGet(context) {
  const db = getDatabase(context.env);
  if (!db) {
    return json({ error: "Missing D1 binding: VISITS_DB" }, 503);
  }

  await ensureSchema(db);
  return json({ count: await readCount(db) });
}

export async function onRequestPost(context) {
  const db = getDatabase(context.env);
  if (!db) {
    return json({ error: "Missing D1 binding: VISITS_DB" }, 503);
  }

  await ensureSchema(db);
  const now = new Date().toISOString();

  await db
    .prepare(`
      INSERT INTO site_stats (key, value, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = value + 1,
        updated_at = excluded.updated_at
    `)
    .bind("visit_count", now)
    .run();

  return json({ count: await readCount(db) });
}
