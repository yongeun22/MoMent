# MoMent

Quiet online photography exhibition space for MoMent, the cultural heritage photography club in the archaeology and art history department.

## Stack

- Python 3.13
- SQLite for metadata and admin credentials
- Plain HTML, CSS, and JavaScript for a lightweight public exhibition and admin interface
- Pillow for image validation and display/lightbox image variants

Install Python dependencies before running the app:

```powershell
py -m pip install -r requirements.txt
```

## Project structure

- `run.py`: starts the web server
- `manage.py`: initializes or replaces the single admin account
- `app/config.py`: runtime paths and environment-based configuration
- `app/database.py`: SQLite schema and data access
- `app/auth.py`: password hashing and signed admin session cookies
- `app/http_utils.py`: multipart parsing and upload validation helpers
- `app/image_validation.py`: server-side image file validation
- `app/guestbook.py`: public trace guestbook validation and hidden deletion password verification
- `app/public_site.py`: public photo serialization and static export helpers
- `app/server.py`: HTTP routes for the public site, admin auth, and photo CRUD
- `static/index.html`: public exhibition page
- `static/admin/index.html`: admin login and management page
- `static/css/`: exhibition and admin styling
- `static/js/`: exhibition interactions and admin dashboard behavior
- `uploads/`: stored image files
- `data/`: SQLite database and generated secret key

## Quick start

1. Initialize the single admin account:

   ```powershell
   py manage.py init-admin --username yong1109
   ```

2. Start the application:

   ```powershell
   py run.py
   ```

3. Start browsing from the address printed in the terminal.

4. Open the private admin path configured in `.env` to log in and manage photographs.

5. After adding, editing, or deleting photographs locally, export again before pushing:

   ```powershell
   py manage.py export-static
   ```

## Static export

Use this when you want to publish the exhibition on Cloudflare Pages or any other static host:

```powershell
py manage.py export-static
```

This creates a `dist/` folder containing:

- `index.html`
- `static/css/site.css`
- `static/js/exhibition.js`
- `static/audio/moment-bgm.mp3`
- `uploads/` copied exhibition images
- `data/photos.json` exported metadata
- `_headers` cache rules for static hosting
- `.moment-static-export` marker used to prevent accidental deletion of unrelated folders

The admin page is not exported. Admin editing remains local in the Python app.
The public trace guestbook uses `/api/traces`; on Cloudflare Pages it requires the D1 binding named `VISITS_DB`.
Hidden trace deletion also requires a SHA-256 password hash environment variable. Use `TRACE_DELETE_PASSWORD_HASH` on Cloudflare Pages, or `MOMENT_TRACE_DELETE_PASSWORD_HASH` in local `.env`. No fallback deletion password is stored in source code.
Guestbook submissions are lightly rate-limited to reduce accidental spam without limiting total stored entries.
Guestbook moderation uses a conservative blocked-terms list for clear profanity while avoiding broad filters that could block ordinary names.

## Cloudflare Pages workflow

1. Edit photos locally in the admin page.
2. Run:

   ```powershell
   py manage.py export-static
   ```

3. Upload or commit the generated `dist/` folder to the repo you connect to Cloudflare Pages.
4. In Cloudflare Pages:

   - Framework preset: `None`
   - Build command: leave empty if `dist/` is already committed
   - Build output directory: `dist`

5. After each exhibition change, export again and redeploy the updated `dist/`.

## Notes

- The public site shows metadata only on desktop hover or mobile tap.
- The intro overlay stays visible until the visitor presses `입장>`, then fades into the exhibition.
- The public exhibition uses a responsive masonry layout and shuffles photo order on each visit.
- Uploads are stored in `uploads/`, while metadata is stored in SQLite.
- When `MOMENT_HOST=0.0.0.0`, the server prints both the local `127.0.0.1` address and the current LAN address for same-WiFi sharing.
- Static assets and uploaded images are cacheable, so repeated visits do not need to re-download every file from scratch.
- The public exhibition can also read from `/data/photos.json`, so the same frontend works both locally and as a static deployment.
- If you prefer environment-based first-run setup, copy `.env.example` to `.env` and uncomment the bootstrap admin values.
