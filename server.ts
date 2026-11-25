import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import {
  clearFailedLogins,
  clearSessionCookie,
  checkContributionRateLimit,
  checkLoginRateLimit,
  createRequireAdmin,
  createSession,
  extractSessionToken,
  hashPassword,
  recordFailedLogin,
  setSessionCookie,
  verifyCsrf,
  verifyPassword,
  type AuthedRequest,
} from './server/auth';
import { getDbFilePath, getUploadsDir, initializeDatabase } from './server/db';
import {
  addAnimals,
  approveVisitorContribution,
  createVisitorContribution,
  deleteAnimal,
  deleteVisitorContribution,
  getForestStats,
  getPostAdminById,
  getPublicForest,
  getPublicPostBySlug,
  getSettingsMap,
  listAllContributionsAdmin,
  listAllPostsAdmin,
  listAnimals,
  listApprovedContributions,
  listCategories,
  upsertPost,
} from './server/queries';
import { escapeHtml, escapeXml, slugify } from './server/utils';
import type { LanguageCode, TreeSpecies } from './src/types';

async function startServer() {
  let db = initializeDatabase();
  const app = express();
  const PORT = Number(process.env.PORT ?? 3000);
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  // Persistent uploads directory
  const uploadsDir = getUploadsDir();
  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

  const uploadStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`);
    },
  });

  const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      cb(null, allowed.includes(file.mimetype));
    },
  });

  const dbUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  // Helper to always bind current active DB handle
  const getDb = () => db;
  const requireAdmin: express.RequestHandler = (req, res, next) =>
    createRequireAdmin(getDb())(req as AuthedRequest, res, next);

  // ==========================================
  // HEALTH & PUBLIC API ROUTES
  // ==========================================
  app.get('/api/health', (_req, res) => {
    try {
      getDb().prepare('SELECT 1').get();
      res.json({ ok: true, status: 'healthy' });
    } catch {
      res.status(503).json({ ok: false, status: 'unhealthy' });
    }
  });

  app.get('/api/forest', (_req, res) => {
    const activeDb = getDb();
    const trees = getPublicForest(activeDb);
    const categories = listCategories(activeDb, true);
    const stats = getForestStats(activeDb, false);
    const settings = getSettingsMap(activeDb);
    const animals = listAnimals(activeDb);
    const contributions = listApprovedContributions(activeDb);
    res.json({ trees, categories, stats, settings, animals, contributions });
  });

  // Public unauthenticated visitor contribution endpoint (no login/auth required)
  app.post('/api/contributions', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkContributionRateLimit(ip)) {
      res.status(429).json({ error: 'Too many submissions. Please try again later.' });
      return;
    }

    try {
      const { kind, animal_species, visitor_name, comment } = req.body ?? {};
      const contribution = createVisitorContribution(getDb(), {
        kind,
        animal_species,
        visitor_name,
        comment,
      });
      res.status(201).json({ contribution });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid submission' });
    }
  });

  app.get('/api/posts', (req, res) => {
    const activeDb = getDb();
    const categorySlug = typeof req.query.category === 'string' ? req.query.category : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    let items = getPublicForest(activeDb);
    if (categorySlug) {
      items = items.filter((item) => item.categories.some((c) => c.slug === categorySlug));
    }
    if (q) {
      items = items.filter((item) => {
        const uz = item.translations.uz;
        const en = item.translations.en;
        const haystack = [
          uz?.title,
          uz?.subtitle,
          uz?.excerpt,
          en?.title,
          en?.subtitle,
          en?.excerpt,
          ...item.categories.flatMap((c) => [c.translations.uz.name, c.translations.en.name]),
          ...item.tags.map((t) => t.name),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    res.json({ posts: items });
  });

  app.get('/api/posts/:slug', (req, res) => {
    const activeDb = getDb();
    const lang: LanguageCode = req.query.lang === 'en' ? 'en' : 'uz';
    const result = getPublicPostBySlug(activeDb, req.params.slug, lang);
    if (!result.post) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(result);
  });

  app.get('/api/categories', (_req, res) => {
    res.json({ categories: listCategories(getDb(), true) });
  });

  app.get('/api/settings/public', (_req, res) => {
    res.json({ settings: getSettingsMap(getDb()) });
  });

  // ==========================================
  // AUTHENTICATION ROUTES
  // ==========================================
  app.get('/api/auth/me', (req, res) => {
    const rawToken = extractSessionToken(req);
    if (!rawToken) {
      res.json({ authenticated: false, user: null });
      return;
    }
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const row = getDb()
      .prepare(
        `SELECT a.id, a.username, a.must_change_credentials
         FROM sessions s
         JOIN admin a ON a.id = s.admin_id
         WHERE s.session_token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, new Date().toISOString()) as
      | { id: number; username: string; must_change_credentials: number }
      | undefined;

    if (!row) {
      res.json({ authenticated: false, user: null });
      return;
    }
    res.json({
      authenticated: true,
      user: {
        id: row.id,
        username: row.username,
        must_change_credentials: Boolean(row.must_change_credentials),
      },
    });
  });

  app.post('/api/auth/login', (req, res) => {
    if (!verifyCsrf(req)) {
      res.status(403).json({ error: 'CSRF check failed' });
      return;
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkLoginRateLimit(ip)) {
      res.status(429).json({ error: 'Too many login attempts' });
      return;
    }

    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const activeDb = getDb();
    const adminRow = activeDb
      .prepare('SELECT id, username, password_hash, must_change_credentials FROM admin WHERE username = ?')
      .get(username.trim()) as
      | { id: number; username: string; password_hash: string; must_change_credentials: number }
      | undefined;

    if (!adminRow || !verifyPassword(password, adminRow.password_hash)) {
      recordFailedLogin(ip);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    clearFailedLogins(ip);
    const { token } = createSession(activeDb, adminRow.id);
    setSessionCookie(req, res, token);

    res.json({
      authenticated: true,
      token,
      user: {
        id: adminRow.id,
        username: adminRow.username,
        must_change_credentials: Boolean(adminRow.must_change_credentials),
      },
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (!verifyCsrf(req)) {
      res.status(403).json({ error: 'CSRF check failed' });
      return;
    }
    const rawToken = extractSessionToken(req);
    if (rawToken) {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      getDb().prepare('DELETE FROM sessions WHERE session_token_hash = ?').run(tokenHash);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/change-credentials', requireAdmin, (req: AuthedRequest, res) => {
    const activeDb = getDb();
    const adminUser = req.adminUser!;
    const { currentPassword, newUsername, newPassword } = req.body ?? {};

    if (
      typeof currentPassword !== 'string' ||
      typeof newUsername !== 'string' ||
      typeof newPassword !== 'string'
    ) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    const trimmedUser = newUsername.trim();
    if (trimmedUser.length < 3 || newPassword.length < 8) {
      res.status(400).json({ error: 'Username (min 3) and password (min 8) are required' });
      return;
    }

    const row = activeDb
      .prepare('SELECT id, password_hash FROM admin WHERE id = ?')
      .get(adminUser.id) as { id: number; password_hash: string } | undefined;

    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const nowIso = new Date().toISOString();
    const newHash = hashPassword(newPassword);

    activeDb.transaction(() => {
      activeDb
        .prepare(
          `UPDATE admin
           SET username = ?, password_hash = ?, must_change_credentials = 0, updated_at = ?
           WHERE id = ?`,
        )
        .run(trimmedUser, newHash, nowIso, adminUser.id);
      // Invalidate all existing sessions on credential change
      activeDb.prepare('DELETE FROM sessions WHERE admin_id = ?').run(adminUser.id);
    })();

    // Issue fresh session for current client
    const { token } = createSession(activeDb, adminUser.id);
    setSessionCookie(req, res, token);

    res.json({
      token,
      user: {
        id: adminUser.id,
        username: trimmedUser,
        must_change_credentials: false,
      },
    });
  });

  // Allow direct admin access; credentials can be updated inside Admin's Security tab
  const requireReadyAdmin: express.RequestHandler = requireAdmin;

  // ==========================================
  // ADMIN API ROUTES
  // ==========================================
  app.get('/api/admin/overview', requireReadyAdmin, (_req, res) => {
    const activeDb = getDb();
    res.json({
      stats: getForestStats(activeDb, true),
      posts: listAllPostsAdmin(activeDb),
      categories: listCategories(activeDb, false),
      settings: getSettingsMap(activeDb),
      animals: listAnimals(activeDb),
      contributions: listAllContributionsAdmin(activeDb),
    });
  });

  app.get('/api/admin/posts/:id', requireReadyAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    const post = getPostAdminById(getDb(), id);
    if (!post) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ post });
  });

  app.post('/api/admin/posts', requireReadyAdmin, (req, res) => {
    try {
      const post = upsertPost(getDb(), req.body);
      res.status(201).json({ post });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create post' });
    }
  });

  app.put('/api/admin/posts/:id', requireReadyAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    try {
      const post = upsertPost(getDb(), req.body, id);
      res.json({ post });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update post' });
    }
  });

  app.delete('/api/admin/posts/:id', requireReadyAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    const info = getDb().prepare('DELETE FROM posts WHERE id = ?').run(id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/admin/upload', requireReadyAdmin, upload.single('image'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Valid image file is required (JPG, PNG, WebP, GIF, max 5MB)' });
      return;
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  });

  // Categories CRUD
  app.post('/api/admin/categories', requireReadyAdmin, (req, res) => {
    const { slug, species_hint, uz_name, uz_description, en_name, en_description } = req.body ?? {};
    if (!uz_name?.trim() || !en_name?.trim()) {
      res.status(400).json({ error: 'Both Uzbek and English category names are required' });
      return;
    }
    const activeDb = getDb();
    const cleanSlug = slugify(slug?.trim() || en_name);
    const angle = (Math.random() * Math.PI * 2);
    const species: TreeSpecies = species_hint || 'oak';
    try {
      const catId = activeDb.transaction(() => {
        const r = activeDb
          .prepare(
            'INSERT INTO categories (slug, species_hint, sector_angle, created_at) VALUES (?, ?, ?, ?)',
          )
          .run(cleanSlug, species, angle, new Date().toISOString());
        const cid = Number(r.lastInsertRowid);
        activeDb
          .prepare(
            'INSERT INTO category_translations (category_id, language_code, name, description) VALUES (?, ?, ?, ?)',
          )
          .run(cid, 'uz', uz_name.trim(), (uz_description ?? '').trim());
        activeDb
          .prepare(
            'INSERT INTO category_translations (category_id, language_code, name, description) VALUES (?, ?, ?, ?)',
          )
          .run(cid, 'en', en_name.trim(), (en_description ?? '').trim());
        return cid;
      })();
      res.status(201).json({ id: catId, categories: listCategories(activeDb, false) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create category' });
    }
  });

  app.put('/api/admin/categories/:id', requireReadyAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    const { species_hint, uz_name, uz_description, en_name, en_description } = req.body ?? {};
    const activeDb = getDb();
    activeDb.transaction(() => {
      if (species_hint) {
        activeDb.prepare('UPDATE categories SET species_hint = ? WHERE id = ?').run(species_hint, id);
      }
      if (uz_name) {
        activeDb
          .prepare(
            `INSERT INTO category_translations (category_id, language_code, name, description)
             VALUES (?, 'uz', ?, ?)
             ON CONFLICT(category_id, language_code) DO UPDATE SET name = excluded.name, description = excluded.description`,
          )
          .run(id, uz_name.trim(), (uz_description ?? '').trim());
      }
      if (en_name) {
        activeDb
          .prepare(
            `INSERT INTO category_translations (category_id, language_code, name, description)
             VALUES (?, 'en', ?, ?)
             ON CONFLICT(category_id, language_code) DO UPDATE SET name = excluded.name, description = excluded.description`,
          )
          .run(id, en_name.trim(), (en_description ?? '').trim());
      }
    })();
    res.json({ categories: listCategories(activeDb, false) });
  });

  app.delete('/api/admin/categories/:id', requireReadyAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    getDb().prepare('DELETE FROM categories WHERE id = ?').run(id);
    res.json({ categories: listCategories(getDb(), false) });
  });

  // Animals CRUD
  app.get('/api/admin/animals', requireReadyAdmin, (_req, res) => {
    res.json({ animals: listAnimals(getDb()) });
  });

  app.post('/api/admin/animals', requireReadyAdmin, (req, res) => {
    try {
      const { species, count, name } = req.body ?? {};
      const added = addAnimals(getDb(), { species, count, name });
      res.status(201).json({ added, animals: listAnimals(getDb()) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to add animal' });
    }
  });

  app.delete('/api/admin/animals/:id', requireReadyAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    const deleted = deleteAnimal(getDb(), id);
    if (!deleted) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ animals: listAnimals(getDb()) });
  });

  // Visitor Contributions Moderation CRUD (approve -> public 3D forest, disapprove -> delete)
  app.get('/api/admin/contributions', requireReadyAdmin, (_req, res) => {
    res.json({ contributions: listAllContributionsAdmin(getDb()) });
  });

  app.post('/api/admin/contributions/:id/approve', requireReadyAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    const activeDb = getDb();
    const approved = approveVisitorContribution(activeDb, id);
    if (!approved) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({
      contribution: approved,
      contributions: listAllContributionsAdmin(activeDb),
    });
  });

  app.delete('/api/admin/contributions/:id', requireReadyAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    const activeDb = getDb();
    const deleted = deleteVisitorContribution(activeDb, id);
    if (!deleted) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ contributions: listAllContributionsAdmin(activeDb) });
  });

  // Settings update
  app.put('/api/admin/settings', requireReadyAdmin, (req, res) => {
    const activeDb = getDb();
    const allowedKeys = [
      'blog_name_uz',
      'blog_name_en',
      'tagline_uz',
      'tagline_en',
      'author_name',
      'about_title_uz',
      'about_title_en',
      'about_body_uz',
      'about_body_en',
      'default_time_of_day',
      'default_season',
      'intro_animation',
      'reduced_effects_default',
      'show_tree_titles',
      'grass_count',
      'stone_count',
    ];
    const nowIso = new Date().toISOString();
    const upsert = activeDb.prepare(
      `INSERT INTO settings (setting_key, setting_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
    );

    activeDb.transaction(() => {
      for (const key of allowedKeys) {
        if (key in (req.body ?? {})) {
          let val = req.body[key];
          if (key === 'grass_count') {
            const n = Number(val);
            val = Number.isFinite(n) ? Math.min(2500, Math.max(0, Math.round(n))) : 450;
          } else if (key === 'stone_count') {
            const n = Number(val);
            val = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 18;
          }
          upsert.run(key, String(val), nowIso);
        }
      }
    })();

    res.json({ settings: getSettingsMap(activeDb) });
  });

  // Export JSON / Markdown / SQLite backup & restore
  app.get('/api/admin/export/json', requireReadyAdmin, (_req, res) => {
    const activeDb = getDb();
    const payload = {
      exported_at: new Date().toISOString(),
      settings: getSettingsMap(activeDb),
      categories: listCategories(activeDb, false),
      posts: listAllPostsAdmin(activeDb),
      contributions: listAllContributionsAdmin(activeDb),
    };
    res.setHeader('Content-Disposition', 'attachment; filename="growing-forest-export.json"');
    res.json(payload);
  });

  app.get('/api/admin/export/markdown', requireReadyAdmin, (_req, res) => {
    const posts = listAllPostsAdmin(getDb());
    const bundle = posts
      .map((p) => {
        const uz = p.translations.uz;
        const en = p.translations.en;
        return [
          `# Post #${p.id} (${p.published_at ?? p.created_at})`,
          `Species: ${p.tree?.species ?? 'oak'}`,
          uz ? `## [UZ] ${uz.title}\nSlug: ${uz.slug}\n\n${uz.content}` : '',
          en ? `## [EN] ${en.title}\nSlug: ${en.slug}\n\n${en.content}` : '',
          '---',
        ]
          .filter(Boolean)
          .join('\n\n');
      })
      .join('\n\n');

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="growing-forest-articles.md"');
    res.send(bundle);
  });

  app.get('/api/admin/backup/db', requireReadyAdmin, async (_req, res) => {
    const activeDb = getDb();
    const dbPath = getDbFilePath();
    const tempBackupPath = `${dbPath}.export-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      await activeDb.backup(tempBackupPath);
      res.download(
        tempBackupPath,
        `forest-backup-${new Date().toISOString().slice(0, 10)}.db`,
        () => {
          try {
            if (fs.existsSync(tempBackupPath)) fs.unlinkSync(tempBackupPath);
          } catch {
            // ignore cleanup errors
          }
        },
      );
    } catch (err) {
      if (fs.existsSync(tempBackupPath)) fs.unlinkSync(tempBackupPath);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Backup failed' });
    }
  });

  app.post('/api/admin/backup/restore', requireReadyAdmin, dbUpload.single('database'), (req, res) => {
    if (!req.file || req.file.buffer.length < 100) {
      res.status(400).json({ error: 'Valid SQLite database file is required' });
      return;
    }
    const header = req.file.buffer.subarray(0, 16).toString('utf8');
    if (!header.startsWith('SQLite format 3')) {
      res.status(400).json({ error: 'Uploaded file is not a valid SQLite 3 database' });
      return;
    }

    const dbPath = getDbFilePath();
    const tempPath = `${dbPath}.restore.tmp`;
    const safetyBackupPath = `${dbPath}.pre-restore.bak`;
    fs.writeFileSync(tempPath, req.file.buffer);

    try {
      // Validate core schema tables before replacing live DB
      const testConn = new Database(tempPath, { readonly: true });
      for (const table of ['admin', 'settings', 'categories', 'posts', 'post_translations', 'trees']) {
        testConn.prepare(`SELECT COUNT(*) FROM ${table}`).get();
      }
      testConn.close();

      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // ignore if already checkpointed
      }
      db.close();

      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, safetyBackupPath);
      }
      fs.renameSync(tempPath, dbPath);
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

      db = initializeDatabase(dbPath);
      res.json({ ok: true });
    } catch (err) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      db = initializeDatabase(dbPath);
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid backup database' });
    }
  });

  // ==========================================
  // SEO: ROBOTS.TXT, SITEMAP.XML, RSS.XML
  // ==========================================
  function getBaseUrl(req: express.Request): string {
    if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
      return process.env.APP_URL.replace(/\/+$/, '');
    }
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    return `${proto}://${host}`;
  }

  app.get('/robots.txt', (req, res) => {
    const base = getBaseUrl(req);
    res.type('text/plain');
    res.send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /login',
        'Disallow: /api/',
        `Sitemap: ${base}/sitemap.xml`,
      ].join('\n'),
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const base = getBaseUrl(req);
    const forest = getPublicForest(getDb());

    const urls: Array<{ loc: string; lastmod?: string; alternates?: Array<{ lang: string; href: string }> }> = [
      {
        loc: `${base}/uz/`,
        alternates: [
          { lang: 'uz', href: `${base}/uz/` },
          { lang: 'en', href: `${base}/en/` },
          { lang: 'x-default', href: `${base}/uz/` },
        ],
      },
      {
        loc: `${base}/en/`,
        alternates: [
          { lang: 'uz', href: `${base}/uz/` },
          { lang: 'en', href: `${base}/en/` },
        ],
      },
      { loc: `${base}/uz/archive` },
      { loc: `${base}/en/archive` },
    ];

    for (const item of forest) {
      const uz = item.translations.uz;
      const en = item.translations.en;
      const alternates: Array<{ lang: string; href: string }> = [];
      if (uz) alternates.push({ lang: 'uz', href: `${base}/uz/post/${uz.slug}` });
      if (en) alternates.push({ lang: 'en', href: `${base}/en/post/${en.slug}` });

      if (uz) {
        urls.push({
          loc: `${base}/uz/post/${uz.slug}`,
          lastmod: uz.updated_at ?? item.published_at,
          alternates: alternates.length > 1 ? alternates : undefined,
        });
      }
      if (en) {
        urls.push({
          loc: `${base}/en/post/${en.slug}`,
          lastmod: en.updated_at ?? item.published_at,
          alternates: alternates.length > 1 ? alternates : undefined,
        });
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map((u) => {
    const altXml = (u.alternates ?? [])
      .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.lang}" href="${escapeXml(a.href)}" />`)
      .join('\n');
    return `  <url>
    <loc>${escapeXml(u.loc)}</loc>
${u.lastmod ? `    <lastmod>${escapeXml(u.lastmod)}</lastmod>\n` : ''}${altXml ? `${altXml}\n` : ''}  </url>`;
  })
  .join('\n')}
</urlset>`;

    res.type('application/xml');
    res.send(xml);
  });

  app.get('/rss.xml', (req, res) => {
    const base = getBaseUrl(req);
    const lang: LanguageCode = req.query.lang === 'en' ? 'en' : 'uz';
    const settings = getSettingsMap(getDb());
    const forest = getPublicForest(getDb());

    const items = forest
      .filter((item) => Boolean(item.translations[lang]))
      .map((item) => {
        const tr = item.translations[lang]!;
        const link = `${base}/${lang}/post/${tr.slug}`;
        return `    <item>
      <title>${escapeXml(tr.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid>${escapeXml(link)}</guid>
      <pubDate>${new Date(item.published_at).toUTCString()}</pubDate>
      <description>${escapeXml(tr.excerpt || tr.subtitle)}</description>
    </item>`;
      })
      .join('\n');

    const title = lang === 'uz' ? settings.blog_name_uz : settings.blog_name_en;
    const desc = lang === 'uz' ? settings.tagline_uz : settings.tagline_en;

    res.type('application/rss+xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(`${base}/${lang}/`)}</link>
    <description>${escapeXml(desc)}</description>
    <language>${lang}</language>
${items}
  </channel>
</rss>`);
  });

  // ==========================================
  // FRONTEND SERVING + DYNAMIC SEO HEAD INJECTION
  // ==========================================
  let vite: Awaited<ReturnType<typeof createViteServer>> | null = null;
  if (!isProd) {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));
  }

  app.get('*', async (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      next();
      return;
    }

    try {
      const templatePath = isProd
        ? path.resolve(process.cwd(), 'dist', 'index.html')
        : path.resolve(process.cwd(), 'index.html');
      let html = fs.readFileSync(templatePath, 'utf-8');
      if (vite) {
        html = await vite.transformIndexHtml(req.originalUrl, html);
      }

      const activeDb = getDb();
      const base = getBaseUrl(req);
      const isEn = req.path === '/en' || req.path.startsWith('/en/');
      const lang: LanguageCode = isEn ? 'en' : 'uz';
      const isAdmin = req.path.startsWith('/admin') || req.path === '/login';
      const settings = getSettingsMap(activeDb);
      const siteName = lang === 'uz' ? settings.blog_name_uz : settings.blog_name_en;

      let pageTitle = `${siteName} — ${settings.author_name}`;
      let pageDesc =
        lang === 'uz'
          ? settings.tagline_uz || 'Har bir nashr etilgan maqola yangi daraxt ekadi va vaqt o‘tishi bilan o‘sib boradi.'
          : settings.tagline_en || 'Every published article plants a tree that grows over time in an interactive 3D forest.';
      let canonical = `${base}${req.path === '/' ? '/uz/' : req.path}`;
      const hreflangs: string[] = [];

      const postMatch = req.path.match(/^\/(?:(uz|en)\/)?post\/([^/]+)$/);
      if (postMatch) {
        const postLang = (postMatch[1] as LanguageCode | undefined) ?? lang;
        const slug = decodeURIComponent(postMatch[2]);
        const lookup = getPublicPostBySlug(activeDb, slug, postLang);
        const tr = lookup.post?.translations[postLang];
        const postSiteName = postLang === 'uz' ? settings.blog_name_uz : settings.blog_name_en;
        if (tr) {
          pageTitle = `${tr.seo_title || tr.title} — ${postSiteName}`;
          pageDesc = tr.seo_description || tr.excerpt || pageDesc;
          canonical = `${base}/${postLang}/post/${tr.slug}`;
        }
        if (lookup.post?.translations.uz?.translation_status === 'published') {
          hreflangs.push(`<link rel="alternate" hreflang="uz" href="${escapeHtml(`${base}/uz/post/${lookup.post.translations.uz.slug}`)}" />`);
        }
        if (lookup.post?.translations.en?.translation_status === 'published') {
          hreflangs.push(`<link rel="alternate" hreflang="en" href="${escapeHtml(`${base}/en/post/${lookup.post.translations.en.slug}`)}" />`);
        }
      } else if (!isAdmin) {
        const bare = req.path.replace(/^\/(uz|en)(?=\/|$)/, '') || '/';
        const normalizedBare = bare === '/' ? '/' : bare;
        hreflangs.push(`<link rel="alternate" hreflang="uz" href="${escapeHtml(`${base}/uz${normalizedBare}`)}" />`);
        hreflangs.push(`<link rel="alternate" hreflang="en" href="${escapeHtml(`${base}/en${normalizedBare}`)}" />`);
        hreflangs.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${base}/uz${normalizedBare}`)}" />`);
      }

      const robotsMeta = isAdmin ? '<meta name="robots" content="noindex, nofollow" />' : '';
      const injectedMeta = [
        `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
        ...hreflangs,
        robotsMeta,
      ]
        .filter(Boolean)
        .join('\n    ');

      html = html
        .replace('<html lang="uz">', `<html lang="${lang}">`)
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(pageTitle)}</title>`)
        .replace(
          /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
          `<meta name="description" content="${escapeHtml(pageDesc)}" />`,
        )
        .replace(
          /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
          `<meta property="og:title" content="${escapeHtml(pageTitle)}" />`,
        )
        .replace(
          /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
          `<meta property="og:description" content="${escapeHtml(pageDesc)}" />`,
        )
        .replace('</head>', `    ${injectedMeta}\n  </head>`);

      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (err) {
      next(err);
    }
  });

  // Clean JSON errors for API routes (uploads, malformed JSON, etc.)
  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof multer.MulterError) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        res.status(status).json({ error: err.message });
        return;
      }
      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({ error: 'Invalid JSON request body' });
        return;
      }
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(500).json({ error: message });
    },
  );

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Platform running (${isProd ? 'production' : 'development'}) on http://0.0.0.0:${PORT}`);
  });

  const shutdown = () => {
    server.close(() => {
      try {
        db.pragma('wal_checkpoint(PASSIVE)');
        db.close();
      } catch {
        // ignore close errors
      }
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer();
