export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": (
    "default-src 'self'; "
    + "script-src 'self'; "
    + "style-src 'self'; "
    + "img-src 'self' data: blob: https://tile.openstreetmap.org; "
    + "media-src 'self'; "
    + "connect-src 'self'; "
    + "base-uri 'self'; "
    + "form-action 'self'; "
    + "frame-ancestors 'none'"
  ),
};

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
