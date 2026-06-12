# AGENTS.md

Use these rules when working on this repository.

## Project Shape

- Python local admin app in `app/`, started by `run.py`.
- Management commands in `manage.py`.
- Plain HTML, CSS, and JavaScript in `static/`.
- Cloudflare Pages Functions in `functions/api/`.
- Generated static deployment output in `dist/`.
- Local runtime data in `data/` and original uploads in `uploads/`.

## Commands

- Install: `py -3.13 -m pip install -r requirements.txt`
- Initialize admin: `py -3.13 manage.py init-admin --username admin`
- Run locally: `py -3.13 run.py`
- Test: `py -3.13 -m unittest discover -s tests`
- Export: `py -3.13 manage.py export-static`

## Working Rules

- Address the project owner as `사용자` in Korean conversation.
- Do not invent metrics, users, demo URLs, screenshots, supported versions, contacts, or features.
- Keep the existing minimal public exhibition design and Cloudflare Pages static export compatibility.
- Do not expose the local admin app as a public internet service.
- Do not rewrite git history unless the maintainer explicitly asks.
- Do not add production dependencies without a clear need and documentation.
- Do not modify, delete, or replace photos, music, logos, local databases, secrets, or private deployment settings unless explicitly requested.
- Keep code modular by feature; do not place unrelated logic into one large file.
- Update README, tests, and export behavior together when commands or behavior change.
- Run tests and review `git diff` before reporting completion.
