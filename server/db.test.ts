import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { initializeDatabase } from './db';
import {
  addAnimals,
  getPublicForest,
  getSettingsMap,
  listAllPostsAdmin,
  listAnimals,
  listCategories,
  upsertPost,
} from './queries';

function makeTempDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gf-db-test-${name}-`));
  return path.join(dir, 'forest.db');
}

test('fresh database initializes with zero fake posts and zero fake animals', () => {
  const dbPath = makeTempDbPath('fresh');
  const db = initializeDatabase(dbPath);
  try {
    assert.equal(listAllPostsAdmin(db).length, 0);
    assert.equal(getPublicForest(db).length, 0);
    assert.equal(listAnimals(db).length, 0);
    assert.ok(listCategories(db, false).length > 0);
    const settings = getSettingsMap(db);
    assert.equal(settings.blog_name_uz, 'Bulutlar ostidagi qalam');
    assert.equal(settings.blog_name_en, "Fayozbek's nature");
  } finally {
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test('rerunning initializeDatabase preserves all real posts, animals, settings, and deleted categories', () => {
  const dbPath = makeTempDbPath('persist');
  let db = initializeDatabase(dbPath);
  try {
    const saved = upsertPost(db, {
      species: 'oak',
      translations: {
        uz: {
          title: 'Haqiqiy maqola',
          content: 'Bu haqiqiy matn.',
          translation_status: 'published',
        },
      },
    });
    addAnimals(db, { species: 'wolf', count: 1, name: 'Bo‘ri' });
    db.prepare("UPDATE settings SET setting_value = '900' WHERE setting_key = 'grass_count'").run();
    // Simulate admin deleting all categories intentionally
    db.prepare('DELETE FROM categories').run();
    db.close();

    // Simulate code rerun / server restart
    db = initializeDatabase(dbPath);
    const postsAfter = listAllPostsAdmin(db);
    assert.equal(postsAfter.length, 1);
    assert.equal(postsAfter[0].id, saved.id);
    assert.equal(postsAfter[0].translations.uz?.title, 'Haqiqiy maqola');
    assert.equal(getPublicForest(db).length, 1);
    assert.equal(listAnimals(db).length, 1);
    assert.equal(listAnimals(db)[0].name, 'Bo‘ri');
    assert.equal(getSettingsMap(db).grass_count, 900);
    // Intentionally deleted categories must not be resurrected on restart
    assert.equal(listCategories(db, false).length, 0);
  } finally {
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test('migration v4 removes legacy demo posts and seeded fake animals once while keeping real data', () => {
  const dbPath = makeTempDbPath('migrate-v4');
  let db = initializeDatabase(dbPath);
  try {
    const nowIso = new Date().toISOString();
    // Roll back migration v4 marker and insert synthetic legacy demo + real data
    db.prepare('DELETE FROM schema_migrations WHERE version = 4').run();
    const demoRes = db
      .prepare(
        `INSERT INTO posts (status, cover_image, published_at, is_demo, created_at, updated_at)
         VALUES ('published', NULL, ?, 1, ?, ?)`,
      )
      .run(nowIso, nowIso, nowIso);
    const demoId = Number(demoRes.lastInsertRowid);
    db.prepare(
      `INSERT INTO post_translations
       (post_id, language_code, title, slug, subtitle, excerpt, content, seo_title, seo_description, reading_time, translation_status, created_at, updated_at)
       VALUES (?, 'uz', 'Fake Demo', 'fake-demo', '', '', 'Fake body', 'Fake', '', 1, 'published', ?, ?)`,
    ).run(demoId, nowIso, nowIso);
    db.prepare(
      `INSERT INTO trees (post_id, species, position_x, position_y, position_z, rotation, scale_seed, created_at)
       VALUES (?, 'oak', 10, 0, 10, 0, 1, ?)`,
    ).run(demoId, nowIso);

    // Seeded initial fake animals
    db.prepare(
      `INSERT INTO animals (species, name, position_x, position_y, position_z, rotation, scale, created_at)
       VALUES ('rabbit', '', 5.8, 0, 5.2, 0.8, 1.0, ?)`,
    ).run(nowIso);

    // Real user post & real user animal
    const realPost = upsertPost(db, {
      species: 'birch',
      translations: {
        en: {
          title: 'Real Production Essay',
          content: 'Written by owner.',
          translation_status: 'published',
        },
      },
    });
    addAnimals(db, { species: 'bear', count: 1, name: 'Ayiq' });
    db.close();

    // Rerun initialization -> Migration v4 cleans only demo rows once
    db = initializeDatabase(dbPath);
    const postsAfter = listAllPostsAdmin(db);
    assert.equal(postsAfter.length, 1);
    assert.equal(postsAfter[0].id, realPost.id);
    assert.equal(postsAfter[0].is_demo, false);

    const animalsAfter = listAnimals(db);
    assert.equal(animalsAfter.length, 1);
    assert.equal(animalsAfter[0].species, 'bear');
    assert.equal(animalsAfter[0].name, 'Ayiq');

    const rawVerify = new Database(dbPath, { readonly: true });
    const migVersions = (rawVerify.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((r) => r.version);
    rawVerify.close();
    assert.ok(migVersions.includes(4));
  } finally {
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});
