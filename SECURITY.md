# Security Policy

PaunClip is local-first, but it can handle sensitive local credentials such as API keys and YouTube cookies.

## Reporting a Vulnerability

Please report security issues privately to the maintainer instead of opening a public issue with sensitive details.

Include:

- affected version or commit
- operating system
- reproduction steps
- expected and actual behavior
- logs with secrets removed

## Sensitive Data

Never upload or paste:

- `.env` files
- API keys
- YouTube cookies or browser cookie exports
- `paunclip.ai.local.json`
- local profile directories
- SQLite databases
- rendered private videos

Treat YouTube cookies like a password. If they are exposed, revoke the session from your Google account and export fresh cookies.

## Supported Versions

PaunClip is pre-1.0. Security fixes are made on the active `main` branch and released through GitHub Releases when applicable.
