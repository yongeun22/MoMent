const RATE_LIMIT_TABLE = "api_rate_limits";

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(request) {
  const cloudflareIp = request.headers.get("CF-Connecting-IP") || "";
  if (cloudflareIp.trim()) {
    return cloudflareIp.trim();
  }
  const forwardedFor = request.headers.get("X-Forwarded-For") || "";
  return forwardedFor.split(",")[0].trim() || "unknown";
}

export async function enforceRateLimit(
  db,
  request,
  { scope, windowSeconds, maxAttempts },
) {
  const clientKey = await sha256Hex(`${scope}|${clientIp(request)}`);
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowSeconds * 1000).toISOString();
  const createdAt = now.toISOString();

  const statements = [
    db.prepare(`DELETE FROM ${RATE_LIMIT_TABLE} WHERE created_at < ?`).bind(cutoff),
    db
      .prepare(`
        INSERT INTO ${RATE_LIMIT_TABLE} (client_key, created_at)
        SELECT ?, ?
        WHERE (
          SELECT COUNT(*)
          FROM ${RATE_LIMIT_TABLE}
          WHERE client_key = ? AND created_at >= ?
        ) < ?
        RETURNING id
      `)
      .bind(clientKey, createdAt, clientKey, cutoff, maxAttempts),
  ];

  const [, insertResult] = await db.batch(statements);
  return Number(insertResult?.meta?.changes || 0) > 0
    || Number(insertResult?.results?.length || 0) > 0;
}
