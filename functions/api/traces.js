const MAX_ENTRIES = 200;
const MAX_AFFILIATION_LENGTH = 80;
const MAX_NAME_LENGTH = 40;
const MAX_JSON_BODY_BYTES = 2 * 1024;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const RATE_LIMIT_MAX_SUBMISSIONS = 12;
const BLOCKED_GUESTBOOK_TERMS = [
  "\uC2DC\uBC1C",
  "\uC2DC\uBE68",
  "\uC2DC\uD314",
  "\uC528\uBC1C",
  "\uC528\uBE68",
  "\uC528\uD314",
  "\u3145\u3142",
  "\u3146\u3142",
  "\uC874\uB098",
  "\u3148\u3134",
  "\uC886",
  "\uBCD1\uC2E0",
  "\uBE05\uC2E0",
  "\u3142\u3145",
  "\uAC1C\uC0C8\uB07C",
  "\uAC1C\uC0C9\uAE30",
  "\uB2C8\uC560\uBBF8",
  "\uB290\uAE08",
];
const REMOVED_GUESTBOOK_ENTRIES = [
  {
    affiliation: "\uB178\uBB34\uD604",
    name: "\uC800\uB294....\uC0B4\uC544\uC788\uC2B5\uB2C8\uB2E4",
  },
  {
    affiliation: "\uB3D9\uACE0\uBABD",
    name: "\uAC04\uC9C0\uB7FD\uB2E4",
  },
];
const MODERATION_ERROR = "\uB4F1\uB85D\uD560 \uC218 \uC5C6\uB294 \uD45C\uD604\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.";

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
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS guestbook_rate_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_key TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    .run();
  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS idx_guestbook_rate_limits_client_created
      ON guestbook_rate_limits (client_key, created_at)
    `)
    .run();
}

async function removeModeratedEntries(db) {
  await db.batch(
    REMOVED_GUESTBOOK_ENTRIES.map((entry) =>
      db
        .prepare("DELETE FROM guestbook_entries WHERE affiliation = ? AND name = ?")
        .bind(entry.affiliation, entry.name),
    ),
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeForModeration(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3]+/g, "");
}

function hasBlockedGuestbookTerm(...values) {
  const normalized = normalizeForModeration(values.join(" "));
  return BLOCKED_GUESTBOOK_TERMS.some((term) => normalized.includes(term));
}

function isRemovedGuestbookEntry(affiliation, name) {
  return REMOVED_GUESTBOOK_ENTRIES.some(
    (entry) => entry.affiliation === affiliation && entry.name === name,
  );
}

function validatePayload(payload) {
  const affiliation = normalizeText(payload.affiliation);
  const name = normalizeText(payload.name);

  if (!affiliation) {
    return { error: "\uC18C\uC18D\uC740 \uD544\uC218\uC785\uB2C8\uB2E4." };
  }
  if (!name) {
    return { error: "\uC774\uB984\uC740 \uD544\uC218\uC785\uB2C8\uB2E4." };
  }
  if (affiliation.length > MAX_AFFILIATION_LENGTH) {
    return { error: `\uC18C\uC18D\uC740 ${MAX_AFFILIATION_LENGTH}\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.` };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `\uC774\uB984\uC740 ${MAX_NAME_LENGTH}\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.` };
  }
  if (hasBlockedGuestbookTerm(affiliation, name)) {
    return { error: MODERATION_ERROR };
  }
  if (isRemovedGuestbookEntry(affiliation, name)) {
    return { error: MODERATION_ERROR };
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

function getDeletePasswordHash(env) {
  const candidates = [
    env?.TRACE_DELETE_PASSWORD_HASH,
    env?.MOMENT_TRACE_DELETE_PASSWORD_HASH,
  ];
  const configuredHash = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return configuredHash ? configuredHash.trim().toLowerCase() : "";
}

async function verifyDeletePassword(password, env) {
  const expectedHash = getDeletePasswordHash(env);
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }

  const candidateHash = await sha256Hex(password);
  return constantTimeEqual(hexToBytes(candidateHash), hexToBytes(expectedHash));
}

class PayloadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function validateJsonHeaders(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new PayloadError("Invalid JSON payload.", 415);
  }

  const contentLength = request.headers.get("Content-Length");
  if (!contentLength) {
    return;
  }

  const parsedLength = Number.parseInt(contentLength, 10);
  if (!Number.isFinite(parsedLength) || parsedLength < 0) {
    throw new PayloadError("Invalid request body.", 400);
  }
  if (parsedLength > MAX_JSON_BODY_BYTES) {
    throw new PayloadError("Request body is too large.", 413);
  }
}

async function readPayload(request) {
  validateJsonHeaders(request);

  try {
    const reader = request.body?.getReader();
    if (!reader) {
      return {};
    }

    let totalBytes = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new PayloadError("Request body is too large.", 413);
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder().decode(body).trim();
    if (!text) {
      return {};
    }

    return JSON.parse(text);
  } catch (error) {
    if (error instanceof PayloadError) {
      throw error;
    }
    throw new PayloadError("Invalid JSON payload.", 400);
  }
}

function getClientIdentity(request) {
  const forwardedFor = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
  const userAgent = request.headers.get("User-Agent") || "";
  return `${forwardedFor.split(",")[0].trim()}|${userAgent.slice(0, 160)}`;
}

async function enforceLooseRateLimit(db, request) {
  const clientKey = await sha256Hex(getClientIdentity(request));
  const now = new Date();
  const cutoff = new Date(now.getTime() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();

  await db
    .prepare("DELETE FROM guestbook_rate_limits WHERE created_at < ?")
    .bind(cutoff)
    .run();

  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM guestbook_rate_limits WHERE client_key = ? AND created_at >= ?")
    .bind(clientKey, cutoff)
    .first();

  if (Number(row?.total || 0) >= RATE_LIMIT_MAX_SUBMISSIONS) {
    return false;
  }

  await db
    .prepare("INSERT INTO guestbook_rate_limits (client_key, created_at) VALUES (?, ?)")
    .bind(clientKey, now.toISOString())
    .run();

  return true;
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
      return json({ error: "\uBC29\uBA85\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 503);
    }

    await ensureSchema(db);
    await removeModeratedEntries(db);
    return json(await readEntries(db));
  } catch (error) {
    console.error("Failed to read traces", error);
    return json({ error: "\uBC29\uBA85\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = getDatabase(context.env);
    if (!db) {
      console.error("Missing D1 binding: VISITS_DB");
      return json({ error: "\uBC29\uBA85\uB85D\uC744 \uB0A8\uAE30\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 503);
    }

    await ensureSchema(db);
    await removeModeratedEntries(db);
    const payload = await readPayload(context.request);
    const normalized = validatePayload(payload);
    if (normalized.error) {
      return json({ error: normalized.error }, 400);
    }

    if (!(await enforceLooseRateLimit(db, context.request))) {
      return json({ error: "\uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uB0A8\uACA8\uC8FC\uC138\uC694." }, 429);
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
    if (error instanceof PayloadError) {
      return json({ error: error.message }, error.status);
    }
    console.error("Failed to create trace", error);
    return json({ error: "\uBC29\uBA85\uB85D\uC744 \uB0A8\uAE30\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 500);
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
    if (error instanceof PayloadError) {
      return json({ error: "Not found." }, 404);
    }
    console.error("Failed to delete trace", error);
    return json({ error: "Not found." }, 404);
  }
}
