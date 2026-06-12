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

### Changed

- Generalized administrator examples from project-specific values to `admin` and `/admin`.
- Made admin login rate limiting thread-safe for the local threaded server.
- Preserved the original project prompt under `docs/original-specification.md`.

### Security

- Documented the difference between source code licensing and media content rights.
- Added HTTPS-aware secure cookie configuration based on the admin server URL.
- Allowed `blob:` images in CSP so the admin upload preview path remains compatible with browser policy.

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
