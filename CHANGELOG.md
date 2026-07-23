# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Open-source project documentation for setup, contribution, security, and content licensing.
- Automated tests for authentication, validation, configuration, guestbook, and static export behavior.
- GitHub Actions workflow for running the test suite.
- Basic local admin login rate limiting.
- Shared security headers for local and static responses.
- Shared security headers for Cloudflare Pages Function JSON responses.
- IP-wide admin login rate limiting in addition to the existing IP+username bucket.
- Shared accessible dialog behavior with focus entry, focus trapping, focus return, Escape dismissal, and background inertness.
- Mobile lightbox close/previous/next controls, swipe navigation, and visible photo position.
- Restorable URL state for gallery filters and the open photo.
- Map marker clustering, region controls, and a non-map place list.
- Admin collection search, collapsed editors, unsaved-change warnings, advanced-field disclosure, and a publish checklist.

### Changed

- Generalized administrator examples from project-specific values to `admin` and `/admin`.
- Made admin login rate limiting thread-safe for the local threaded server.
- Preserved the original project prompt under `docs/original-specification.md`.
- Split the mobile header into a dedicated logo row and a 44px-high control row to prevent navigation collisions on narrow screens.
- Stabilized randomized photo order for the browser session and converted lightbox information controls to real tabs.
- Made background audio start only after the visitor explicitly uses the audio control.
- Removed the frequently rewritten gallery grid from live-region announcements and added a skip link and concise status updates.

### Security

- Documented the difference between source code licensing and media content rights.
- Added HTTPS-aware secure cookie configuration based on the admin server URL.
- Allowed `blob:` images in CSP so the admin upload preview path remains compatible with browser policy.
- Raised the Pillow minimum to 12.3.0 and added CI dependency auditing.
- Refused non-loopback admin binds unless an explicit private-network exception is enabled.
- Removed committed status-token fallback material and replaced hidden guestbook deletion passwords with generated high-entropy tokens.
- Added transactional D1-backed endpoint rate limits without User-Agent-derived keys.
- Moved D1 schema and moderation maintenance out of public request paths into a versioned migration.
- Added anonymous visit deduplication, HSTS, stricter CSP directives, a real static 404 page, admin same-origin mutation checks, and query-redacted local error logging.

## v0.1.0 Draft Release Notes

MoMent is prepared as a small open-source online photography exhibition platform while preserving the original MoMent exhibition workflow.

Highlights:

- Local Python admin app for managing photos and metadata.
- Static export for Cloudflare Pages.
- Minimal public exhibition UI with photo interactions, lightbox, background audio, visit counter, latest-update marker, and trace guestbook.
- Tests and CI covering the core local app logic.

Maintainer confirmation required before release:

- Verify the public demo URL and screenshots.
- Confirm reuse permissions for photographs, music, logos, QR images, and exhibition copy.
- Confirm GitHub repository About fields, topics, and release notes in the web UI.
