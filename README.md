# O‘sayotgan O‘rmon / The Growing Forest

An interactive 3D personal blogging platform where every published article plants a living tree that grows deterministically with time.

Built with **React**, **TypeScript**, **Three.js**, **Express**, and **SQLite** (`better-sqlite3`).

## Key Capabilities

- **Bilingual Platform (`uz` default, `en` secondary)**: Uzbek is the default language on first visit, with a clean switcher (`O‘zbekcha` / `English`), `localStorage` persistence, language-aware URLs (`/uz/...`, `/en/...`), `hreflang` & canonical metadata, and independent per-language article publishing.
- **Interactive 3D Forest**: Seven distinct procedural tree species (`oak`, `pine`, `birch`, `maple`, `willow`, `cedar`, `cherry`), undulating terrain with central clearing monument, seasonal palettes (`spring`, `summer`, `autumn`, `winter`), day/night lighting (`morning`, `afternoon`, `sunset`, `night`), smooth orbit & zoom on desktop and touch devices, and an automatic 2D spatial fallback if WebGL is unavailable.
- **Deterministic Tree Growth**: Every tree grows continuously from seedling to mature canopy based on `current_time - post.published_at`, while retaining its permanent database coordinates and species across restarts.
- **Single-Administrator Studio**: Protected by `scrypt` password hashing, `HttpOnly` session cookies, CSRF origin/header verification, login rate limiting, mandatory first-login credential update (`fa_admin` / `fa_admin`), bilingual Markdown editor with live preview & autosave, local image uploads, category management, JSON/Markdown exports, and SQLite backup/restore.

## Environment Variables

Configure via `.env` (see `.env.example`):

- `PORT` — HTTP server port (defaults to `3000`)
- `NODE_ENV` — Set to `production` in production deployments
- `APP_URL` — Public base URL used for canonical URLs, `sitemap.xml`, and `rss.xml`
- `DB_PATH` — Optional custom SQLite database path (defaults to `./data/forest.db`)
- `UPLOADS_DIR` — Optional persistent directory for uploaded images (defaults to `./data/uploads`)

## Local Development

```bash
npm install
npm run dev
```

The server initializes `./data/forest.db` automatically on first launch, runs schema migrations, and starts on `http://localhost:3000`.

## Running Tests

```bash
npx --yes tsx --test src/i18n/i18n.test.ts src/forest/growth.test.ts src/forest/placement.test.ts server/utils.test.ts
```

## Production Build & VPS Deployment

```bash
npm run build
NODE_ENV=production PORT=3000 APP_URL=https://yourdomain.com npm start
```

### Persistence & Backups

- SQLite data lives in `data/forest.db` (WAL mode) and uploaded cover images live in `data/uploads/`.
- Ensure `data/` is preserved across deployments (never stored in `/tmp`).
- Download full SQLite backups, JSON exports, or Markdown bundles anytime from `/admin` -> Settings, or copy `data/forest.db` after checkpointing.
- On a VPS, run behind a reverse proxy (Nginx or Caddy with TLS) forwarding `X-Forwarded-Proto` and `X-Forwarded-Host` using `systemd` or `pm2` for automatic restarts.
