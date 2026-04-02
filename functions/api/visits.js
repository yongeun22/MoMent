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
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS site_stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `)
    .run();
}

async function readCount(db) {
  const result = await db
    .prepare("SELECT count FROM site_stats WHERE id = 1")
    .first();

  return Number(result?.count || 0);
}

function getDatabase(env) {
  return env?.VISITS_DB || null;
}

export async function onRequestGet(context) {
  try {
    const db = getDatabase(context.env);
    if (!db) {
      return json({ error: "Missing D1 binding: VISITS_DB" }, 503);
    }

    await ensureSchema(db);
    return json({ count: await readCount(db) });
  } catch (error) {
    return json(
      {
        error: "Failed to read visit counter",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}

export async function onRequestPost(context) {
  try {
    const db = getDatabase(context.env);
    if (!db) {
      return json({ error: "Missing D1 binding: VISITS_DB" }, 503);
    }

    await ensureSchema(db);
    const now = new Date().toISOString();

    await db
      .prepare(`
        INSERT INTO site_stats (id, count, updated_at)
        VALUES (1, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          count = count + 1,
          updated_at = excluded.updated_at
      `)
      .bind(now)
      .run();

    return json({ count: await readCount(db) });
  } catch (error) {
    return json(
      {
        error: "Failed to update visit counter",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}
