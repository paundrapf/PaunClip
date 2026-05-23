# Contributing

Thanks for helping improve PaunClip.

## Setup

```bash
npm ci
npm run desktop:tools
```

Run the web app:

```bash
npm run dev
```

Run the CLI without installing it globally:

```bash
node ./bin/paunclip.cjs --help
```

## Checks Before a Pull Request

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run cli:smoke
```

For desktop packaging changes on Windows:

```bash
npm run desktop:pack
npm run desktop:smoke
```

## Branches

- Use a feature branch for changes.
- Open pull requests into `main`.
- Keep PRs focused and include verification notes.

## Secrets and Local Data

Do not commit `.env`, API keys, YouTube cookies, local profiles, SQLite databases, storage output, or generated desktop artifacts.
