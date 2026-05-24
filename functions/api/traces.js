const MAX_ENTRIES = 80;
const MAX_AFFILIATION_LENGTH = 80;
const MAX_NAME_LENGTH = 40;
const FALLBACK_DELETE_PASSWORD_HASH =
  "8a7177fcda2d2eefc04849818b92cdd4444b23cfa993f103c1a9577dcc9f7028";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function getDatabase(env) {
  return env?.VISITS_DB || null;
}

async function ensureSchema(db) {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS guestbook_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        affiliation TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    .run();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function validatePayload(payload) {
  const affiliation = normalizeText(payload.affiliation);
  const name = normalizeText(payload.name);

  if (!affiliation) {
    return { error: "\uD559\uAD50/\uD559\uACFC\uBA85\uC740 \uD544\uC218\uC785\uB2C8\uB2E4." };
  }
  if (!name) {
    return { error: "\uC774\uB984\uC740 \uD544\uC218\uC785\uB2C8\uB2E4." };
  }
  if (affiliation.length > MAX_AFFILIATION_LENGTH) {
    return { error: `\uD559\uAD50/\uD559\uACFC\uBA85\uC740 ${MAX_AFFILIATION_LENGTH}\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.` };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `\uC774\uB984\uC740 ${MAX_NAME_LENGTH}\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.` };
  }

  return { affiliation, name };
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getDeletePasswordHash(env) {
  const candidates = [
    env?.TRACE_DELETE_PASSWORD_HASH,
    env?.MOMENT_TRACE_DELETE_PASSWORD_HASH,
    FALLBACK_DELETE_PASSWORD_HASH,
  ];
  const configuredHash = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return configuredHash ? configuredHash.trim().toLowerCase() : "";
}

async function verifyDeletePassword(password, env) {
  const expectedHash = getDeletePasswordHash(env);
  if (!expectedHash) {
    return false;
  }

  return (await sha256Hex(password)) === expectedHash;
}

async function readPayload(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}

async function readEntries(db) {
  const countRow = await db
    .prepare("SELECT COUNT(*) AS total FROM guestbook_entries")
    .first();
  const rows = await db
    .prepare(`
      SELECT id, affiliation, name, created_at
      FROM guestbook_entries
      ORDER BY id DESC
      LIMIT ?
    `)
    .bind(MAX_ENTRIES)
    .all();

  return {
    count: Number(countRow?.total || 0),
    entries: rows.results || [],
  };
}

export async function onRequestGet(context) {
  try {
    const db = getDatabase(context.env);
    if (!db) {
      console.error("Missing D1 binding: VISITS_DB");
      return json({ error: "\uD754\uC801\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 503);
    }

    await ensureSchema(db);
    return json(await readEntries(db));
  } catch (error) {
    console.error("Failed to read traces", error);
    return json({ error: "\uD754\uC801\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = getDatabase(context.env);
    if (!db) {
      console.error("Missing D1 binding: VISITS_DB");
      return json({ error: "\uD754\uC801\uC744 \uB0A8\uAE30\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 503);
    }

    await ensureSchema(db);
    const payload = await readPayload(context.request);
    const normalized = validatePayload(payload);
    if (normalized.error) {
      return json({ error: normalized.error }, 400);
    }

    const createdAt = new Date().toISOString();
    const entry = await db
      .prepare(`
        INSERT INTO guestbook_entries (affiliation, name, created_at)
        VALUES (?, ?, ?)
        RETURNING id, affiliation, name, created_at
      `)
      .bind(normalized.affiliation, normalized.name, createdAt)
      .first();

    return json(
      {
        entry,
        ...(await readEntries(db)),
      },
      201,
    );
  } catch (error) {
    console.error("Failed to create trace", error);
    return json({ error: "\uD754\uC801\uC744 \uB0A8\uAE30\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const db = getDatabase(context.env);
    if (!db) {
      console.error("Missing D1 binding: VISITS_DB");
      return json({ error: "Not found." }, 404);
    }

    await ensureSchema(db);
    const payload = await readPayload(context.request);
    const entryId = Number.parseInt(String(payload.id || ""), 10);
    if (!Number.isFinite(entryId) || entryId <= 0) {
      return json({ error: "Not found." }, 404);
    }

    if (!(await verifyDeletePassword(payload.password, context.env))) {
      return json({ error: "Not found." }, 404);
    }

    await db
      .prepare("DELETE FROM guestbook_entries WHERE id = ?")
      .bind(entryId)
      .run();

    return json({
      deleted: true,
      ...(await readEntries(db)),
    });
  } catch (error) {
    console.error("Failed to delete trace", error);
    return json({ error: "Not found." }, 404);
  }
}
