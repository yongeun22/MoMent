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
      console.error("Missing D1 binding: VISITS_DB");
      return json({ error: "\uBC29\uBB38\uC790 \uC218\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 503);
    }

    await ensureSchema(db);
    return json({ count: await readCount(db) });
  } catch (error) {
    console.error("Failed to read visit counter", error);
    return json({ error: "\uBC29\uBB38\uC790 \uC218\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = getDatabase(context.env);
    if (!db) {
      console.error("Missing D1 binding: VISITS_DB");
      return json({ error: "\uBC29\uBB38\uC790 \uC218\uB97C \uC5C5\uB370\uC774\uD2B8\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 503);
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
    console.error("Failed to update visit counter", error);
    return json({ error: "\uBC29\uBB38\uC790 \uC218\uB97C \uC5C5\uB370\uC774\uD2B8\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 500);
  }
}
