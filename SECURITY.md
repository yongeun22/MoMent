# Security Policy

## Supported Versions

Security fixes target the current `main` branch until the first tagged release is created. The planned first release is `v0.1.0`.

## Reporting A Vulnerability

Do not open a public issue with passwords, tokens, database files, private uploads, server logs, or exploit details.

Use GitHub Security Advisories if available for this repository, or contact the maintainer through the private contact method already used by the project. Maintainer confirmation required: add a dedicated security contact if the repository adopts one.

## Local Admin Server

The Python server includes the administrator interface and is intended for local use. It refuses non-loopback binds unless `MOMENT_ALLOW_NETWORK_ADMIN=true` is explicitly set. That exception is only for a trusted private network; do not expose it directly to the public internet.

The public static site in `dist/` is separate from the local admin app. Cloudflare Pages should serve the static export and Pages Functions, not the local Python admin server.

Admin session cookies are `HttpOnly` and `SameSite=Strict`. `MOMENT_SECURE_COOKIES=auto` only enables the `Secure` attribute when `MOMENT_ADMIN_URL` starts with `https://`; `MOMENT_PUBLIC_URL` is only public-site metadata and does not control admin cookie security.

Admin login failures are held in memory and rate-limited for 15 minutes by both source IP and IP+username pair. Restarting the local server clears these in-memory counters.

Admin POST and DELETE requests also require a same-origin `Origin` or `Referer` header. The server response does not disclose the Python runtime version, and error logs omit URL query strings.

## Cloudflare Functions

Apply the committed D1 migrations before deploying matching Function code. Public GET handlers do not create tables or run moderation deletes.

Operator-only endpoints use separate generated high-entropy tokens. Store only their SHA-256 verifiers in `TRACE_DELETE_TOKEN_HASH` and `STATUS_UPDATE_TOKEN_HASH`; there is no source-code fallback. Rate limits are keyed by source IP and endpoint without User-Agent input and are inserted through a transactional D1 batch.

The visit counter deduplicates an anonymous HttpOnly browser token and rate-limits write attempts. Treat it as an approximate counter, not an identity-verified unique-person metric.

## Secrets And Data

Never publish:

- `.env`
- `data/moment.db`
- `data/secret.key`
- local logs
- raw passwords
- API keys or tokens
- original uploads or private exhibition content without permission

If a secret is accidentally committed, rotate it. Do not rewrite git history without an explicit maintainer decision.
