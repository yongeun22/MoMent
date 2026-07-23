import { enforceRateLimit } from "../_shared/rate-limit.js";
import { json } from "../_shared/response.js";

const VISIT_COOKIE_NAME = "moment_visit_id";
const VISIT_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const VISIT_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const VISIT_RATE_LIMIT_MAX_ATTEMPTS = 30;

function getDatabase(env) {
  return env?.VISITS_DB || null;
}

function readCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  for (const item of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch (error) {
        return "";
      }
    }
  }
  return "";
}

function validVisitToken(value) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function visitCookie(value) {
  return `${VISIT_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${VISIT_COOKIE_MAX_AGE}`;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readVisitCount(db) {
  const row = await db
    .prepare("SELECT count FROM site_visit_counter WHERE id = 1")
    .first();
  return Number(row?.count || 0);
}

async function recordVisit(db, visitorKey) {
  const now = new Date().toISOString();
  await db
    .prepare("INSERT OR IGNORE INTO site_visit_events (visitor_key, created_at) VALUES (?, ?)")
    .bind(visitorKey, now)
    .run();
  return readVisitCount(db);
}

export async function onRequestGet(context) {
  try {
    const db = getDatabase(context.env);
    if (!db) {
      return json({ error: "Visit counter is unavailable." }, 503);
    }
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

    const allowed = await enforceRateLimit(db, context.request, {
      scope: "visit",
      windowSeconds: VISIT_RATE_LIMIT_WINDOW_SECONDS,
      maxAttempts: VISIT_RATE_LIMIT_MAX_ATTEMPTS,
    });
    if (!allowed) {
      return json({ error: "Visit counter is unavailable." }, 429, { "Retry-After": "900" });
    }

    const existingToken = readCookie(context.request, VISIT_COOKIE_NAME);
    const token = validVisitToken(existingToken) ? existingToken : crypto.randomUUID();
    const headers = validVisitToken(existingToken) ? {} : { "Set-Cookie": visitCookie(token) };
    const visitorKey = await sha256Hex(token);
    return json({ count: await recordVisit(db, visitorKey) }, 201, headers);
  } catch (error) {
    console.error("Failed to record visit", error);
    return json({ error: "Visit counter is unavailable." }, 500);
  }
}
