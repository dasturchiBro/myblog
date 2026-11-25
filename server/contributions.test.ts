import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeDatabase } from './db';
import {
  approveVisitorContribution,
  createVisitorContribution,
  deleteVisitorContribution,
  listAllContributionsAdmin,
  listApprovedContributions,
  upsertPost,
} from './queries';

function makeTempDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gf-contrib-test-${name}-`));
  return path.join(dir, 'forest.db');
}

test('visitor contributions start as pending, stay hidden publicly until approved, and delete on disapprove', () => {
  const dbPath = makeTempDbPath('moderation');
  const db = initializeDatabase(dbPath);
  try {
    // 1. Visitor submits stone & wolf without authentication
    const stone = createVisitorContribution(db, {
      kind: 'stone',
      visitor_name: 'Jasur',
      comment: 'Ajoyib o‘rmon!',
    });
    assert.equal(stone.status, 'pending');
    assert.equal(stone.kind, 'stone');
    assert.equal(stone.animal_species, null);
    assert.equal(stone.visitor_name, 'Jasur');
    assert.equal(stone.comment, 'Ajoyib o‘rmon!');
    assert.equal(stone.approved_at, null);

    const wolf = createVisitorContribution(db, {
      kind: 'animal',
      animal_species: 'wolf',
      visitor_name: 'Laylo',
      comment: '',
    });
    assert.equal(wolf.status, 'pending');
    assert.equal(wolf.kind, 'animal');
    assert.equal(wolf.animal_species, 'wolf');

    // Public list must NOT show pending submissions
    assert.equal(listApprovedContributions(db).length, 0);
    // Admin list shows both pending items
    assert.equal(listAllContributionsAdmin(db).length, 2);

    // 2. Admin approves stone -> visible publicly on forest
    const approvedStone = approveVisitorContribution(db, stone.id);
    assert.ok(approvedStone);
    assert.equal(approvedStone.status, 'approved');
    assert.ok(approvedStone.approved_at);

    const publicAfterApprove = listApprovedContributions(db);
    assert.equal(publicAfterApprove.length, 1);
    assert.equal(publicAfterApprove[0].id, stone.id);
    assert.equal(publicAfterApprove[0].visitor_name, 'Jasur');

    // 3. Admin disapproves wolf -> permanently deleted from DB
    const deleted = deleteVisitorContribution(db, wolf.id);
    assert.equal(deleted, true);
    assert.equal(deleteVisitorContribution(db, wolf.id), false);

    assert.equal(listApprovedContributions(db).length, 1);
    assert.equal(listAllContributionsAdmin(db).length, 1);
  } finally {
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test('visitor contribution validation rejects blank names, invalid kinds, and invalid animal species', () => {
  const dbPath = makeTempDbPath('validation');
  const db = initializeDatabase(dbPath);
  try {
    assert.throws(() =>
      createVisitorContribution(db, { kind: 'stone', visitor_name: '   ', comment: 'Hi' }),
    );
    assert.throws(() =>
      createVisitorContribution(db, { kind: 'tree', visitor_name: 'Ali', comment: 'Hi' }),
    );
    assert.throws(() =>
      createVisitorContribution(db, {
        kind: 'animal',
        animal_species: 'dragon',
        visitor_name: 'Ali',
      }),
    );
  } finally {
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test('re-running initializeDatabase preserves approved and pending visitor contributions alongside posts', () => {
  const dbPath = makeTempDbPath('persist');
  let db = initializeDatabase(dbPath);
  try {
    upsertPost(db, {
      species: 'oak',
      translations: {
        uz: { title: 'Post', content: 'Matn', translation_status: 'published' },
      },
    });
    const c1 = createVisitorContribution(db, {
      kind: 'stone',
      visitor_name: 'Aziza',
      comment: 'Omad!',
    });
    approveVisitorContribution(db, c1.id);
    createVisitorContribution(db, {
      kind: 'animal',
      animal_species: 'rabbit',
      visitor_name: 'Sardor',
    });
    db.close();

    db = initializeDatabase(dbPath);
    assert.equal(listApprovedContributions(db).length, 1);
    assert.equal(listAllContributionsAdmin(db).length, 2);
  } finally {
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});
