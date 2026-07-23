from __future__ import annotations


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "img-src 'self' data: blob: https://tile.openstreetmap.org; "
        "media-src 'self'; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "manifest-src 'self'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'none'"
    ),
}


def iter_security_headers():
    return SECURITY_HEADERS.items()


def build_session_cookie(
    name: str,
    value: str,
    *,
    max_age: int,
    secure: bool,
) -> str:
    parts = [
        f"{name}={value}",
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        f"Max-Age={int(max_age)}",
    ]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)
