import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { hashPassword } from './auth';
import type { TreeSpecies } from '../src/types';

export function getDbFilePath(): string {
  const custom = process.env.DB_PATH;
  if (custom) return path.resolve(custom);
  return path.resolve(process.cwd(), 'data', 'forest.db');
}

export function getUploadsDir(): string {
  const custom = process.env.UPLOADS_DIR;
  if (custom) return path.resolve(custom);
  return path.resolve(process.cwd(), 'data', 'uploads');
}

export function initializeDatabase(dbPath: string = getDbFilePath()): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(getUploadsDir(), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  seedDefaultsIfEmpty(db);

  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
      (r) => r.version,
    ),
  );

  if (!applied.has(1)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        must_change_credentials INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        session_token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (admin_id) REFERENCES admin(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(session_token_hash);

      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
        cover_image TEXT,
        published_at TEXT,
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at);

      CREATE TABLE IF NOT EXISTS post_translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        language_code TEXT NOT NULL CHECK (language_code IN ('uz', 'en')),
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        excerpt TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        seo_title TEXT NOT NULL DEFAULT '',
        seo_description TEXT NOT NULL DEFAULT '',
        reading_time INTEGER NOT NULL DEFAULT 1,
        translation_status TEXT NOT NULL DEFAULT 'draft' CHECK (translation_status IN ('draft', 'published')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        UNIQUE (post_id, language_code),
        UNIQUE (language_code, slug)
      );

      CREATE INDEX IF NOT EXISTS idx_post_translations_lang_slug ON post_translations(language_code, slug);

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        species_hint TEXT NOT NULL DEFAULT 'oak',
        sector_angle REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS category_translations (
        category_id INTEGER NOT NULL,
        language_code TEXT NOT NULL CHECK (language_code IN ('uz', 'en')),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (category_id, language_code),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS post_categories (
        post_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        PRIMARY KEY (post_id, category_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS post_tags (
        post_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (post_id, tag_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS trees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL UNIQUE,
        species TEXT NOT NULL DEFAULT 'oak',
        position_x REAL NOT NULL,
        position_y REAL NOT NULL,
        position_z REAL NOT NULL,
        rotation REAL NOT NULL DEFAULT 0,
        scale_seed REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      1,
      new Date().toISOString(),
    );
  }

  if (!applied.has(2)) {
    const nowIso = new Date().toISOString();
    db.exec(`
      CREATE TABLE IF NOT EXISTS animals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        species TEXT NOT NULL CHECK (species IN ('rabbit', 'bird', 'bear', 'wolf')),
        name TEXT NOT NULL DEFAULT '',
        position_x REAL NOT NULL,
        position_y REAL NOT NULL,
        position_z REAL NOT NULL,
        rotation REAL NOT NULL DEFAULT 0,
        scale REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
    `);

    // Update default branding to Bulutlar ostidagi qalam / Fayozbek's nature if still initial defaults
    db.prepare(
      `UPDATE settings SET setting_value = ?, updated_at = ? WHERE setting_key = 'blog_name_uz' AND setting_value = 'O‘sayotgan O‘rmon'`,
    ).run('Bulutlar ostidagi qalam', nowIso);
    db.prepare(
      `UPDATE settings SET setting_value = ?, updated_at = ? WHERE setting_key = 'blog_name_en' AND setting_value = 'The Growing Forest'`,
    ).run("Fayozbek's nature", nowIso);

    // Ensure show_tree_titles setting exists
    db.prepare(
      `INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at) VALUES ('show_tree_titles', 'true', ?)`,
    ).run(nowIso);

    // Remove fir trees ('pine' / 'cedar') by migrating any existing ones to broadleaf deciduous species
    db.prepare(`UPDATE trees SET species = 'maple' WHERE species IN ('pine', 'cedar')`).run();
    db.prepare(`UPDATE categories SET species_hint = 'maple' WHERE species_hint IN ('pine', 'cedar')`).run();

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      2,
      nowIso,
    );
  }

  if (!applied.has(3)) {
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at) VALUES ('grass_count', '450', ?)`,
    ).run(nowIso);
    db.prepare(
      `INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at) VALUES ('stone_count', '18', ?)`,
    ).run(nowIso);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      3,
      nowIso,
    );
  }

  if (!applied.has(4)) {
    const nowIso = new Date().toISOString();
    db.transaction(() => {
      // One-time removal of previously seeded demonstration posts & initial fake wildlife.
      // Any real user posts (is_demo = 0) and user-added animals are strictly preserved.
      db.prepare('DELETE FROM posts WHERE is_demo = 1').run();
      db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM post_tags)').run();
      db.prepare(
        `DELETE FROM animals
         WHERE name = ''
           AND (
             (species = 'rabbit' AND position_x = 5.8 AND position_z = 5.2)
             OR (species = 'bird' AND position_x = -3.2 AND position_z = 7.5)
           )`,
      ).run();
      if (applied.has(1)) {
        db.prepare(
          `INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at) VALUES ('categories_initialized', '1', ?)`,
        ).run(nowIso);
      }
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        4,
        nowIso,
      );
    })();
  }

  if (!applied.has(5)) {
    const nowIso = new Date().toISOString();
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS visitor_contributions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL CHECK (kind IN ('stone', 'animal')),
          animal_species TEXT CHECK (animal_species IN ('rabbit', 'bird', 'bear', 'wolf') OR animal_species IS NULL),
          visitor_name TEXT NOT NULL,
          comment TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
          position_x REAL NOT NULL,
          position_y REAL NOT NULL,
          position_z REAL NOT NULL,
          rotation REAL NOT NULL DEFAULT 0,
          scale REAL NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          approved_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_visitor_contributions_status
          ON visitor_contributions(status);
      `);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        5,
        nowIso,
      );
    })();
  }
}

const DEFAULT_ABOUT_UZ = `Men Fayozbek Erkinjonovman — dunyo qanday ishlashini va g‘oyalarni qanday qilib mazmunli narsaga aylantirish mumkinligini tushunishga intilayotgan O‘zbekistonlik talabaman.

Qiziqishlarim texnologiya, iqtisodiyot, biznes va inson kamoloti chorrahasida joylashgan. Kompyuter fanlari, sun’iy intellekt, tadbirkorlik, tarix hamda shaxs va jamiyatni shakllantiruvchi g‘oyalarni o‘rganish menga ilhom beradi.

Ishonamanki, haqiqiy ta’lim auditoriya devorlaridan tashqariga chiqishi kerak; mazmunli taraqqiyot esa qiziquvchanlik, tajriba, intizom va mavjud tushunchalarni qayta sinovdan o‘tkazishga tayyorlikdan tug‘iladi.

Bu o‘rmon — g‘oyalarni jamlash, tajribalarni hujjatlashtirish, kashfiyotlarla bo‘lishish va saqlab qolishga arziydigan fikrlarni asrash uchun shaxsiy makonimdir.

Har bir maqola bitta daraxt ekadi. Ba’zi g‘oyalar endigina unib chiqqan nihol; boshqalari esa yillar davomida ildiz otib ulg‘aygan.

Men o‘rganishda, savollar berishda, tajriba qilishda va yaratishda davom etar ekanman, bu o‘rmon ham o‘zgarib boraveradi.

Oldindan belgilangan yakuniy manzil yo‘q. Maqsad — o‘sishda davom etish.`;

const DEFAULT_ABOUT_EN = `I am Fayozbek Erkinjonov, a student from Uzbekistan interested in understanding how the world works and how ideas can be transformed into something meaningful.

My interests lie at the intersection of technology, economics, business, and human development. I enjoy exploring computer science, artificial intelligence, entrepreneurship, history, and the ideas that shape individuals and societies.

I believe that learning should extend beyond classrooms and that meaningful progress comes from curiosity, experimentation, discipline, and the willingness to challenge one's existing understanding.

This forest is my personal space for collecting ideas, documenting experiences, sharing discoveries, and preserving thoughts that I consider worth remembering.

Every publication plants a tree. Some ideas are young seedlings; others have had years to grow.

The forest will change as I continue learning, questioning, experimenting, and building.

There is no predetermined final destination. The purpose is to keep growing.`;

function seedDefaultsIfEmpty(db: Database.Database): void {
  const nowIso = new Date().toISOString();

  // 1. Seed initial administrator if missing
  const adminCount = (db.prepare('SELECT COUNT(*) as c FROM admin').get() as { c: number }).c;
  if (adminCount === 0) {
    db.prepare(
      `INSERT INTO admin (username, password_hash, must_change_credentials, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)`,
    ).run('fa_admin', hashPassword('fa_admin'), nowIso, nowIso);
  }

  // 2. Seed settings defaults if missing
  const defaultSettings: Array<[string, string]> = [
    ['blog_name_uz', 'Bulutlar ostidagi qalam'],
    ['blog_name_en', "Fayozbek's nature"],
    ['tagline_uz', 'Har bir maqola — o‘sib borayotgan bitta daraxt'],
    ['tagline_en', 'Every publication plants a growing tree'],
    ['author_name', 'Fayozbek Erkinjonov'],
    ['about_title_uz', 'O‘sishdan to‘xtamaydigan ong'],
    ['about_title_en', 'A Mind Still Growing'],
    ['about_body_uz', DEFAULT_ABOUT_UZ],
    ['about_body_en', DEFAULT_ABOUT_EN],
    ['default_time_of_day', 'afternoon'],
    ['default_season', 'summer'],
    ['intro_animation', 'true'],
    ['reduced_effects_default', 'false'],
    ['show_tree_titles', 'true'],
    ['grass_count', '450'],
    ['stone_count', '18'],
  ];

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)',
  );
  for (const [k, v] of defaultSettings) {
    insertSetting.run(k, v, nowIso);
  }

  // 3. Seed initial categories only on a brand-new database (never overwrite after user edits)
  const catInitRow = db
    .prepare("SELECT setting_value FROM settings WHERE setting_key = 'categories_initialized'")
    .get() as { setting_value: string } | undefined;
  const catCount = (db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }).c;
  if (!catInitRow && catCount === 0) {
    const initialCategories: Array<{
      slug: string;
      species: TreeSpecies;
      angle: number;
      uzName: string;
      uzDesc: string;
      enName: string;
      enDesc: string;
    }> = [
      {
        slug: 'technology',
        species: 'walnut',
        angle: 0.35,
        uzName: 'Texnologiya va Dasturlash',
        uzDesc: 'Dasturiy muhandislik, tizim arxitekturasi va texnologik tajribalar.',
        enName: 'Technology & Engineering',
        enDesc: 'Software engineering, systems architecture, and technological experiments.',
      },
      {
        slug: 'artificial-intelligence',
        species: 'cherry',
        angle: 1.4,
        uzName: 'Sun’iy intellekt',
        uzDesc: 'Mashinaviy o‘rganish, intellektual tizimlar va inson tafakkuri.',
        enName: 'Artificial Intelligence',
        enDesc: 'Machine learning, intelligent systems, and the future of reasoning.',
      },
      {
        slug: 'economics-business',
        species: 'oak',
        angle: 2.5,
        uzName: 'Iqtisodiyot va Biznes',
        uzDesc: 'Xalqaro iqtisodiyot, tadbirkorlik, savdo va uzoq muddatli qiymat yaratish.',
        enName: 'Economics & Business',
        enDesc: 'International economics, entrepreneurship, trade, and compounding value.',
      },
      {
        slug: 'personal-development',
        species: 'birch',
        angle: 3.6,
        uzName: 'Shaxsiy rivojlanish',
        uzDesc: 'Intizom, mas’uliyat, yugurish va kundalik odatlar.',
        enName: 'Personal Development',
        enDesc: 'Discipline, responsibility, endurance, and deliberate daily habits.',
      },
      {
        slug: 'philosophy-history',
        species: 'willow',
        angle: 4.75,
        uzName: 'Falsafa va Tarix',
        uzDesc: 'Tarix saboqlari, tafakkur va vaqt sinovidan o‘tgan g‘oyalar.',
        enName: 'Philosophy & History',
        enDesc: 'Lessons from history, quiet reflection, and enduring ideas.',
      },
      {
        slug: 'reflections',
        species: 'maple',
        angle: 5.65,
        uzName: 'Mulohazalar',
        uzDesc: 'Kuzatuvlar, mutolaa taassurotlari va shaxsiy qaydlar.',
        enName: 'Reflections',
        enDesc: 'Observations, reading notes, and quiet personal essays.',
      },
    ];

    const insCat = db.prepare(
      'INSERT INTO categories (slug, species_hint, sector_angle, created_at) VALUES (?, ?, ?, ?)',
    );
    const insCatTrans = db.prepare(
      'INSERT INTO category_translations (category_id, language_code, name, description) VALUES (?, ?, ?, ?)',
    );

    for (const c of initialCategories) {
      const res = insCat.run(c.slug, c.species, c.angle, nowIso);
      const cid = Number(res.lastInsertRowid);
      insCatTrans.run(cid, 'uz', c.uzName, c.uzDesc);
      insCatTrans.run(cid, 'en', c.enName, c.enDesc);
    }
    insertSetting.run('categories_initialized', '1', nowIso);
  }
}
