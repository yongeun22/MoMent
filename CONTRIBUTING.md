# Contributing

Thanks for helping improve MoMent. Keep changes small, verifiable, and aligned with the existing minimal exhibition experience.

## Development Setup

```powershell
py -3.13 -m pip install -r requirements.txt
py -3.13 manage.py init-admin --username admin
py -3.13 run.py
```

On non-Windows systems, replace `py -3.13` with the Python executable for Python 3.13 or 3.14.

## Tests

```powershell
py -3.13 -m unittest discover -s tests
```

Run the static export smoke check before proposing deployment changes:

```powershell
py -3.13 manage.py export-static --output dist-smoke
```

Remove the temporary `dist-smoke/` directory after inspection.

## Issues

Use the issue templates when possible. Include:

- What you expected.
- What happened.
- Steps to reproduce.
- Your Python version and operating system.
- Relevant logs with secrets removed.

Do not post passwords, API keys, `.env` values, database files, private uploads, or personal contact details in public issues.

## Branches And Pull Requests

- Use short branch names that describe the change.
- Keep pull requests focused on one behavior or document area.
- Update documentation when commands, configuration, export output, or user-visible behavior changes.
- Add or update tests for authentication, upload handling, export behavior, and validation changes.
- Check desktop and mobile layouts when changing UI, CSS, HTML, or frontend JavaScript.
- Do not add production dependencies unless the need is clear and documented.

## Content Rules

Do not add photographs, music, logos, private event material, real user data, API keys, secrets, local database files, or deployment-only settings to pull requests.

Source code and media content have different license terms. Read `CONTENT_LICENSE.md` before adding or replacing non-code files.
