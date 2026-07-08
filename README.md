# MoMent

MoMent is a lightweight open-source platform for creating and publishing minimal online photography exhibitions. It was originally developed for a cultural heritage photography club, but can be adapted for student groups, artists, archives, museums, and community exhibitions.

## What It Solves

Small exhibition teams often need a quiet online gallery that can be edited locally and published as a static site without adopting a full CMS. MoMent keeps the public exhibition simple, stores photo metadata in SQLite, and exports a Cloudflare Pages-ready `dist/` folder.

## Features

- Minimal public photography exhibition with intro overlay, responsive layout, hover/tap metadata, lightbox viewing, and optional background audio.
- Local-only administrator interface for one admin account.
- Photo upload, expanded metadata editing, deletion, and generated display/lightbox image variants.
- Gallery filtering by year, region, photographer, and place.
- Integrated public guestbook, with photo-specific entries also shown in each lightbox.
- Lazy-loaded MoMent Map using self-hosted Leaflet assets and OpenStreetMap tiles for photos with coordinates.
- SQLite storage for the local admin app.
- Static export for Cloudflare Pages or another static host.
- Public visit counter, latest-update marker, and guestbook APIs through Cloudflare Pages Functions and a D1 binding.

## Live Demo

[https://moment-exhibition.pages.dev/](https://moment-exhibition.pages.dev/)

## Screenshots

No screenshots are committed yet. Add real screenshots captured from the local app or verified deployment before linking images in this section.

## Tech Stack

- Python 3.13 and 3.14
- SQLite
- Plain HTML, CSS, and JavaScript
- Pillow for image validation and display/lightbox variants
- Leaflet 1.9.4 vendored in `static/vendor/leaflet/` for the optional map view
- Cloudflare Pages Functions for public counters and guestbook APIs

## Requirements

- Python 3.13 or 3.14
- `pip`
- A shell that can run the `py` launcher on Windows, or `python` on other platforms

Install dependencies:

```powershell
py -3.13 -m pip install -r requirements.txt
```

On non-Windows systems, use the equivalent Python command:

```bash
python -m pip install -r requirements.txt
```

## Setup

Create the local administrator account:

```powershell
py -3.13 manage.py init-admin --username admin
```

The command prompts for a password when `--password` is omitted. Use at least 8 characters. For local development only, you can also copy `.env.example` to `.env` and use the bootstrap admin variables described below.

## Run Locally

```powershell
py -3.13 run.py
```

Open the printed local URL, then open the configured admin path. The default admin path is `/admin`.

The admin app is intended for local or private-network use. Do not expose the Python admin server directly to the public internet.

## Managing Photos

1. Start the local server.
2. Open the admin path.
3. Log in with the account created by `init-admin`.
4. Add, edit, or delete photographs and metadata.
5. Run a static export before publishing public changes.

Uploaded originals are stored in `uploads/`. Metadata is stored in `data/moment.db`. Both are local runtime data and are ignored by git except for `uploads/.gitkeep`.

Photo metadata includes the original date/location/photographer fields plus year, region, display place name, `placeId`, optional latitude/longitude, and an optional description. If `placeId` is left blank, MoMent generates a stable internal place id from the display place name.

## Static Export

Export the public exhibition:

```powershell
py -3.13 manage.py export-static
```

By default this writes to `dist/`. The export contains:

- `index.html`
- `static/css/site.css`
- `static/js/exhibition.js`
- `static/js/modules/`
- `static/audio/`
- `static/og/`
- `static/qr/`
- `static/icons/`
- `static/vendor/leaflet/`
- `uploads/` display and lightbox images used by the public site
- `data/photos.json`
- `_headers` for Cloudflare Pages cache and security headers
- `.moment-static-export` marker used by the exporter safety check

The admin page is not exported. Admin editing remains local in the Python app.

## Cloudflare Pages Deployment

1. Edit photos locally in the admin page.
2. Run `py -3.13 manage.py export-static`.
3. Commit or upload the generated `dist/` folder to the repository connected to Cloudflare Pages.
4. Configure Cloudflare Pages:
   - Framework preset: `None`
   - Build command: leave empty when `dist/` is already committed
   - Build output directory: `dist`
5. Bind a D1 database named `VISITS_DB` if you want public visits, latest update, and guestbook APIs to work.
6. Set `TRACE_DELETE_PASSWORD_HASH` in Cloudflare Pages if hidden trace deletion is needed. Use a SHA-256 hash, not the raw password.

After each exhibition change, export again and redeploy the updated `dist/`.

The map view requests OpenStreetMap raster tiles from `https://tile.openstreetmap.org` only when a visitor opens the `지도` panel. The static export CSP allows that tile host in `img-src`.

## Environment Variables

Copy `.env.example` to `.env` for local overrides. Do not commit `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MOMENT_HOST` | `127.0.0.1` | Local server bind host. Use `0.0.0.0` only for trusted local network sharing. |
| `MOMENT_PORT` | `8000` | Local server port. |
| `MOMENT_MAX_UPLOAD_BYTES` | `104857600` | Maximum request body size for uploads. |
| `MOMENT_ADMIN_PATH` | `/admin` | Local admin route. This is not a substitute for authentication. |
| `MOMENT_SESSION_COOKIE` | `moment_session` | Admin session cookie name. |
| `MOMENT_SESSION_MAX_AGE` | `43200` | Admin session lifetime in seconds. |
| `MOMENT_SECURE_COOKIES` | `auto` | Use `true` behind HTTPS, `false` for local HTTP, or `auto` to infer from `MOMENT_ADMIN_URL`. |
| `MOMENT_PUBLIC_URL` | empty | Optional canonical public URL used in generated metadata. |
| `MOMENT_ADMIN_URL` | empty | Optional admin server URL used only for secure cookie auto-detection. |
| `MOMENT_TRACE_DELETE_PASSWORD_HASH` | empty | Local SHA-256 hash for hidden trace deletion. |
| `MOMENT_ADMIN_USERNAME` | empty | Optional first-run bootstrap admin username. |
| `MOMENT_ADMIN_PASSWORD` | empty | Optional first-run bootstrap admin password. Do not use in shared files. |

## Project Structure

- `run.py`: starts the local Python server.
- `manage.py`: initializes the single admin account and exports the static site.
- `app/config.py`: runtime paths and environment-based configuration.
- `app/database.py`: SQLite schema and data access.
- `app/auth.py`: password hashing and signed session tokens.
- `app/rate_limit.py`: small in-memory rate limiting helpers.
- `app/security.py`: shared security headers and cookie helpers.
- `app/http_utils.py`: JSON, multipart, photo field, and path helpers.
- `app/photo_metadata.py`: photo metadata normalization and generated `placeId` helpers.
- `app/image_validation.py`: image content validation.
- `app/image_variants.py`: display and lightbox image generation.
- `app/guestbook.py`: public general/photo guestbook validation and local rate limiting.
- `app/public_site.py`: public payload serialization and static export.
- `static/`: public and admin frontend assets.
- `functions/api/`: Cloudflare Pages Functions for public APIs.
- `dist/`: generated static site currently used for deployment.
- `docs/original-specification.md`: preserved original project specification.
- `tests/`: automated tests.

## Security And Deployment Notes

- The Python admin server is a local management app, not a public production server.
- Keep `.env`, `data/moment.db`, `data/secret.key`, logs, and original uploads out of commits.
- The admin path can reduce casual discovery, but real protection comes from authentication, signed sessions, and not exposing the admin server publicly.
- Session cookies are `HttpOnly` and `SameSite=Strict`; set `MOMENT_ADMIN_URL=https://...` or `MOMENT_SECURE_COOKIES=true` when the admin server is served through HTTPS.
- Admin login failures are rate-limited for 15 minutes by both IP+username pairs (5 failures) and the source IP overall (20 failures).
- The static export includes Cloudflare `_headers` for basic browser security, long-lived asset caching for stable assets, and revalidation for JavaScript modules.
- The guestbook is public. It has basic validation and rate limiting, not full moderation tooling.

## Contributing

See `CONTRIBUTING.md`. Keep changes focused, update tests and documentation with behavior changes, and verify both desktop and mobile views when changing UI.

Do not include photographs, music, personal data, API keys, database files, secrets, or private deployment settings in pull requests.

## License

Source code is licensed under the MIT License. See `LICENSE`.

Photos, music, logos, exhibition text, and other media content are not automatically covered by the MIT License. See `CONTENT_LICENSE.md` before reusing any non-code content. Third-party users should replace the bundled exhibition content with content they own or have permission to use.
