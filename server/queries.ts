import type Database from 'better-sqlite3';
import { computeTreePlacement, groundHeightAt } from '../src/forest/placement';
import type {
  AnimalRecord,
  AnimalSpecies,
  CategoryRecord,
  ContributionKind,
  ForestStats,
  ForestTreeItem,
  LanguageCode,
  PostSummary,
  PostTranslation,
  SiteSettings,
  TagRecord,
  TreeRecord,
  TreeSpecies,
  VisitorContributionRecord,
} from '../src/types';
import { calculateReadingTime, sanitizeImageUrl, slugify } from './utils';

const VALID_CONTRIBUTION_KINDS = new Set<ContributionKind>(['stone', 'animal']);

const VALID_SPECIES = new Set<TreeSpecies>([
  'oak',
  'birch',
  'maple',
  'willow',
  'cherry',
  'walnut',
]);

const VALID_ANIMAL_SPECIES = new Set<AnimalSpecies>(['rabbit', 'bird', 'bear', 'wolf']);

export function getSettingsMap(db: Database.Database): SiteSettings {
  const rows = db.prepare('SELECT setting_key, setting_value FROM settings').all() as Array<{
    setting_key: string;
    setting_value: string;
  }>;
  const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
  const parsedGrass = Number(map.get('grass_count'));
  const parsedStone = Number(map.get('stone_count'));
  return {
    blog_name_uz: map.get('blog_name_uz') ?? 'Bulutlar ostidagi qalam',
    blog_name_en: map.get('blog_name_en') ?? "Fayozbek's nature",
    tagline_uz: map.get('tagline_uz') ?? '',
    tagline_en: map.get('tagline_en') ?? '',
    author_name: map.get('author_name') ?? 'Fayozbek Erkinjonov',
    about_title_uz: map.get('about_title_uz') ?? '',
    about_title_en: map.get('about_title_en') ?? '',
    about_body_uz: map.get('about_body_uz') ?? '',
    about_body_en: map.get('about_body_en') ?? '',
    default_time_of_day: (map.get('default_time_of_day') as SiteSettings['default_time_of_day']) ?? 'afternoon',
    default_season: (map.get('default_season') as SiteSettings['default_season']) ?? 'summer',
    intro_animation: map.get('intro_animation') !== 'false',
    reduced_effects_default: map.get('reduced_effects_default') === 'true',
    show_tree_titles: map.get('show_tree_titles') !== 'false',
    grass_count: Number.isFinite(parsedGrass) ? Math.min(2500, Math.max(0, Math.round(parsedGrass))) : 450,
    stone_count: Number.isFinite(parsedStone) ? Math.min(100, Math.max(0, Math.round(parsedStone))) : 18,
  };
}

export function listCategories(db: Database.Database, onlyPublishedCounts = true): CategoryRecord[] {
  const cats = db
    .prepare('SELECT id, slug, species_hint, sector_angle, created_at FROM categories ORDER BY id ASC')
    .all() as Array<{
    id: number;
    slug: string;
    species_hint: TreeSpecies;
    sector_angle: number;
    created_at: string;
  }>;

  const transRows = db
    .prepare('SELECT category_id, language_code, name, description FROM category_translations')
    .all() as Array<{
    category_id: number;
    language_code: LanguageCode;
    name: string;
    description: string;
  }>;

  const countRows = (
    onlyPublishedCounts
      ? db.prepare(
          `SELECT pc.category_id, COUNT(DISTINCT p.id) as cnt
           FROM post_categories pc
           JOIN posts p ON p.id = pc.post_id
           WHERE EXISTS (
             SELECT 1 FROM post_translations pt
             WHERE pt.post_id = p.id AND pt.translation_status = 'published'
           )
           GROUP BY pc.category_id`,
        )
      : db.prepare(
          `SELECT category_id, COUNT(DISTINCT post_id) as cnt
           FROM post_categories GROUP BY category_id`,
        )
  ).all() as Array<{ category_id: number; cnt: number }>;

  const countMap = new Map(countRows.map((r) => [r.category_id, r.cnt]));

  return cats.map((c) => {
    const uzRow = transRows.find((t) => t.category_id === c.id && t.language_code === 'uz');
    const enRow = transRows.find((t) => t.category_id === c.id && t.language_code === 'en');
    return {
      id: c.id,
      slug: c.slug,
      species_hint: c.species_hint,
      sector_angle: c.sector_angle,
      created_at: c.created_at,
      post_count: countMap.get(c.id) ?? 0,
      translations: {
        uz: {
          language_code: 'uz',
          name: uzRow?.name ?? c.slug,
          description: uzRow?.description ?? '',
        },
        en: {
          language_code: 'en',
          name: enRow?.name ?? c.slug,
          description: enRow?.description ?? '',
        },
      },
    };
  });
}

function hydratePosts(db: Database.Database, postIds: number[], onlyPublishedTranslations: boolean): PostSummary[] {
  if (postIds.length === 0) return [];
  const placeholders = postIds.map(() => '?').join(',');

  const posts = db
    .prepare(
      `SELECT id, status, cover_image, published_at, is_demo, created_at, updated_at
       FROM posts WHERE id IN (${placeholders})
       ORDER BY COALESCE(published_at, created_at) DESC, id DESC`,
    )
    .all(...postIds) as Array<{
    id: number;
    status: 'draft' | 'published';
    cover_image: string | null;
    published_at: string | null;
    is_demo: number;
    created_at: string;
    updated_at: string;
  }>;

  const transRows = db
    .prepare(
      `SELECT * FROM post_translations
       WHERE post_id IN (${placeholders})
       ${onlyPublishedTranslations ? "AND translation_status = 'published'" : ''}`,
    )
    .all(...postIds) as PostTranslation[];

  const treeRows = db
    .prepare(`SELECT * FROM trees WHERE post_id IN (${placeholders})`)
    .all(...postIds) as TreeRecord[];

  const allCategories = listCategories(db, onlyPublishedTranslations);
  const catMap = new Map(allCategories.map((c) => [c.id, c]));

  const postCatRows = db
    .prepare(`SELECT post_id, category_id FROM post_categories WHERE post_id IN (${placeholders})`)
    .all(...postIds) as Array<{ post_id: number; category_id: number }>;

  const postTagRows = db
    .prepare(
      `SELECT pt.post_id, t.id, t.name, t.slug
       FROM post_tags pt
       JOIN tags t ON t.id = pt.tag_id
       WHERE pt.post_id IN (${placeholders})`,
    )
    .all(...postIds) as Array<{ post_id: number; id: number; name: string; slug: string }>;

  return posts.map((p) => {
    const translations: Partial<Record<LanguageCode, PostTranslation>> = {};
    for (const tr of transRows) {
      if (tr.post_id === p.id) {
        translations[tr.language_code] = tr;
      }
    }

    const categories: CategoryRecord[] = [];
    for (const pc of postCatRows) {
      if (pc.post_id === p.id) {
        const cat = catMap.get(pc.category_id);
        if (cat) categories.push(cat);
      }
    }

    const tags: TagRecord[] = postTagRows
      .filter((t) => t.post_id === p.id)
      .map((t) => ({ id: t.id, name: t.name, slug: t.slug }));

    const tree = treeRows.find((t) => t.post_id === p.id) ?? null;

    return {
      id: p.id,
      status: p.status,
      cover_image: p.cover_image,
      published_at: p.published_at,
      created_at: p.created_at,
      updated_at: p.updated_at,
      is_demo: Boolean(p.is_demo),
      tree,
      categories,
      tags,
      translations,
    };
  });
}

export function getPublicForest(db: Database.Database): ForestTreeItem[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT p.id
       FROM posts p
       JOIN trees t ON t.post_id = p.id
       WHERE EXISTS (
         SELECT 1 FROM post_translations pt
         WHERE pt.post_id = p.id AND pt.translation_status = 'published'
       )
       ORDER BY COALESCE(p.published_at, p.created_at) DESC`,
    )
    .all() as Array<{ id: number }>;

  const summaries = hydratePosts(
    db,
    rows.map((r) => r.id),
    true,
  );

  return summaries
    .filter((s) => s.tree !== null && (s.translations.uz || s.translations.en))
    .map((s) => ({
      post_id: s.id,
      published_at: s.published_at ?? s.created_at,
      cover_image: s.cover_image,
      tree: s.tree!,
      categories: s.categories,
      tags: s.tags,
      translations: s.translations,
    }));
}

export interface PublicPostLookup {
  post: PostSummary | null;
  requestedLang: LanguageCode;
  availableLangs: LanguageCode[];
  missingRequestedLang: boolean;
  related: PostSummary[];
}

export function getPublicPostBySlug(
  db: Database.Database,
  slug: string,
  requestedLang: LanguageCode,
): PublicPostLookup {
  const match = db
    .prepare(
      `SELECT pt.post_id, pt.language_code
       FROM post_translations pt
       WHERE pt.slug = ? AND pt.translation_status = 'published'
       ORDER BY CASE WHEN pt.language_code = ? THEN 0 ELSE 1 END
       LIMIT 1`,
    )
    .get(slug, requestedLang) as { post_id: number; language_code: LanguageCode } | undefined;

  if (!match) {
    return {
      post: null,
      requestedLang,
      availableLangs: [],
      missingRequestedLang: false,
      related: [],
    };
  }

  const [post] = hydratePosts(db, [match.post_id], true);
  if (!post) {
    return {
      post: null,
      requestedLang,
      availableLangs: [],
      missingRequestedLang: false,
      related: [],
    };
  }

  const availableLangs: LanguageCode[] = [];
  if (post.translations.uz?.translation_status === 'published') availableLangs.push('uz');
  if (post.translations.en?.translation_status === 'published') availableLangs.push('en');

  const missingRequestedLang = !post.translations[requestedLang];

  // Related posts sharing a category or nearest in forest
  const catIds = post.categories.map((c) => c.id);
  let relatedIds: number[] = [];
  if (catIds.length > 0) {
    const ph = catIds.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT DISTINCT p.id
         FROM posts p
         JOIN post_categories pc ON pc.post_id = p.id
         WHERE p.id != ? AND pc.category_id IN (${ph})
           AND EXISTS (
             SELECT 1 FROM post_translations pt
             WHERE pt.post_id = p.id AND pt.translation_status = 'published'
           )
         ORDER BY COALESCE(p.published_at, p.created_at) DESC
         LIMIT 3`,
      )
      .all(post.id, ...catIds) as Array<{ id: number }>;
    relatedIds = rows.map((r) => r.id);
  }

  if (relatedIds.length < 3) {
    const exclude = [post.id, ...relatedIds];
    const exPh = exclude.map(() => '?').join(',');
    const extra = db
      .prepare(
        `SELECT DISTINCT p.id
         FROM posts p
         WHERE p.id NOT IN (${exPh})
           AND EXISTS (
             SELECT 1 FROM post_translations pt
             WHERE pt.post_id = p.id AND pt.translation_status = 'published'
           )
         ORDER BY COALESCE(p.published_at, p.created_at) DESC
         LIMIT ?`,
      )
      .all(...exclude, 3 - relatedIds.length) as Array<{ id: number }>;
    relatedIds.push(...extra.map((r) => r.id));
  }

  const related = hydratePosts(db, relatedIds, true);

  return {
    post,
    requestedLang,
    availableLangs,
    missingRequestedLang,
    related,
  };
}

export function getForestStats(db: Database.Database, includeDrafts = false): ForestStats {
  const pubPosts = db
    .prepare(
      `SELECT p.id, COALESCE(p.published_at, p.created_at) as pub_date
       FROM posts p
       WHERE EXISTS (
         SELECT 1 FROM post_translations pt
         WHERE pt.post_id = p.id AND pt.translation_status = 'published'
       )
       ORDER BY pub_date ASC`,
    )
    .all() as Array<{ id: number; pub_date: string }>;

  const totalTrees = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM trees t
         WHERE EXISTS (
           SELECT 1 FROM post_translations pt
           WHERE pt.post_id = t.post_id AND pt.translation_status = 'published'
         )`,
      )
      .get() as { c: number }
  ).c;

  const draftCount = includeDrafts
    ? (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM posts p
             WHERE NOT EXISTS (
               SELECT 1 FROM post_translations pt
               WHERE pt.post_id = p.id AND pt.translation_status = 'published'
             )`,
          )
          .get() as { c: number }
      ).c
    : 0;

  const categories = listCategories(db, true);
  const mostActive =
    categories
      .filter((c) => (c.post_count ?? 0) > 0)
      .sort((a, b) => (b.post_count ?? 0) - (a.post_count ?? 0))[0] ?? null;

  const oldest = pubPosts[0]?.pub_date ?? null;
  const newest = pubPosts[pubPosts.length - 1]?.pub_date ?? null;

  let avgDays: number | null = null;
  if (pubPosts.length >= 2 && oldest && newest) {
    const spanDays =
      (new Date(newest).getTime() - new Date(oldest).getTime()) / (1000 * 60 * 60 * 24);
    avgDays = Math.max(1, Math.round(spanDays / (pubPosts.length - 1)));
  }

  // Timeline aggregated by YYYY-MM
  const monthCounts = new Map<string, number>();
  for (const row of pubPosts) {
    const monthKey = row.pub_date.slice(0, 7);
    monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
  }
  const sortedMonths = Array.from(monthCounts.keys()).sort();
  let cumulative = 0;
  const timeline = sortedMonths.map((month) => {
    const count = monthCounts.get(month) ?? 0;
    cumulative += count;
    return { month, count, cumulative };
  });

  return {
    total_trees: totalTrees,
    total_posts: pubPosts.length,
    draft_count: draftCount,
    category_count: categories.length,
    oldest_publication: oldest,
    newest_publication: newest,
    most_active_category: mostActive,
    avg_days_between_posts: avgDays,
    timeline,
  };
}

export function listAllPostsAdmin(db: Database.Database): PostSummary[] {
  const rows = db
    .prepare('SELECT id FROM posts ORDER BY COALESCE(published_at, created_at) DESC, id DESC')
    .all() as Array<{ id: number }>;
  return hydratePosts(
    db,
    rows.map((r) => r.id),
    false,
  );
}

export function getPostAdminById(db: Database.Database, postId: number): PostSummary | null {
  const [post] = hydratePosts(db, [postId], false);
  return post ?? null;
}

export interface UpsertPostInput {
  cover_image?: string | null;
  published_at?: string | null;
  species?: TreeSpecies | 'auto';
  category_ids?: number[];
  tags?: string[];
  translations: Partial<
    Record<
      LanguageCode,
      {
        title: string;
        slug?: string;
        subtitle?: string;
        excerpt?: string;
        content: string;
        seo_title?: string;
        seo_description?: string;
        translation_status: 'draft' | 'published';
      }
    >
  >;
}

function resolveUniqueSlug(
  db: Database.Database,
  lang: LanguageCode,
  desiredSlug: string,
  excludePostId?: number,
): string {
  const base = slugify(desiredSlug);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = db
      .prepare(
        'SELECT post_id FROM post_translations WHERE language_code = ? AND slug = ?',
      )
      .get(lang, candidate) as { post_id: number } | undefined;
    if (!existing || existing.post_id === excludePostId) {
      return candidate;
    }
    candidate = `${base}-${suffix}`;
    suffix++;
  }
}

export function upsertPost(
  db: Database.Database,
  input: UpsertPostInput,
  existingPostId?: number,
): PostSummary {
  const nowIso = new Date().toISOString();
  const activeLangs = (['uz', 'en'] as LanguageCode[]).filter((lang) => {
    const t = input.translations[lang];
    return t && (t.title.trim().length > 0 || t.content.trim().length > 0);
  });

  if (activeLangs.length === 0) {
    throw new Error('At least one language version with a title or content is required.');
  }

  for (const lang of activeLangs) {
    const t = input.translations[lang]!;
    if (!t.title.trim()) {
      throw new Error(`Title is required for ${lang}.`);
    }
  }

  const anyPublished = activeLangs.some(
    (lang) => input.translations[lang]?.translation_status === 'published',
  );
  const overallStatus = anyPublished ? 'published' : 'draft';
  const safeCover = sanitizeImageUrl(input.cover_image);

  const tx = db.transaction(() => {
    let postId = existingPostId;

    if (postId) {
      const existing = db
        .prepare('SELECT id, published_at FROM posts WHERE id = ?')
        .get(postId) as { id: number; published_at: string | null } | undefined;
      if (!existing) {
        throw new Error('Post not found');
      }

      const nextPublishedAt = input.published_at
        ? new Date(input.published_at).toISOString()
        : anyPublished
          ? existing.published_at ?? nowIso
          : existing.published_at;

      db.prepare(
        `UPDATE posts
         SET status = ?, cover_image = ?, published_at = ?, updated_at = ?
         WHERE id = ?`,
      ).run(overallStatus, safeCover, nextPublishedAt, nowIso, postId);
    } else {
      const nextPublishedAt = input.published_at
        ? new Date(input.published_at).toISOString()
        : anyPublished
          ? nowIso
          : null;
      const res = db
        .prepare(
          `INSERT INTO posts (status, cover_image, published_at, is_demo, created_at, updated_at)
           VALUES (?, ?, ?, 0, ?, ?)`,
        )
        .run(overallStatus, safeCover, nextPublishedAt, nowIso, nowIso);
      postId = Number(res.lastInsertRowid);
    }

    // Sync translations
    for (const lang of ['uz', 'en'] as LanguageCode[]) {
      const t = input.translations[lang];
      if (!t || (!t.title.trim() && !t.content.trim())) {
        db.prepare('DELETE FROM post_translations WHERE post_id = ? AND language_code = ?').run(
          postId,
          lang,
        );
        continue;
      }

      const uniqueSlug = resolveUniqueSlug(db, lang, t.slug?.trim() || t.title, postId);
      const readingTime = calculateReadingTime(t.content);
      const existingTr = db
        .prepare('SELECT id FROM post_translations WHERE post_id = ? AND language_code = ?')
        .get(postId, lang) as { id: number } | undefined;

      if (existingTr) {
        db.prepare(
          `UPDATE post_translations
           SET title = ?, slug = ?, subtitle = ?, excerpt = ?, content = ?,
               seo_title = ?, seo_description = ?, reading_time = ?,
               translation_status = ?, updated_at = ?
           WHERE id = ?`,
        ).run(
          t.title.trim(),
          uniqueSlug,
          (t.subtitle ?? '').trim(),
          (t.excerpt ?? '').trim(),
          t.content,
          (t.seo_title ?? t.title).trim(),
          (t.seo_description ?? t.excerpt ?? '').trim(),
          readingTime,
          t.translation_status,
          nowIso,
          existingTr.id,
        );
      } else {
        db.prepare(
          `INSERT INTO post_translations
           (post_id, language_code, title, slug, subtitle, excerpt, content,
            seo_title, seo_description, reading_time, translation_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          postId,
          lang,
          t.title.trim(),
          uniqueSlug,
          (t.subtitle ?? '').trim(),
          (t.excerpt ?? '').trim(),
          t.content,
          (t.seo_title ?? t.title).trim(),
          (t.seo_description ?? t.excerpt ?? '').trim(),
          readingTime,
          t.translation_status,
          nowIso,
          nowIso,
        );
      }
    }

    // Sync categories
    db.prepare('DELETE FROM post_categories WHERE post_id = ?').run(postId);
    const catIds = Array.from(new Set(input.category_ids ?? [])).filter((n) => Number.isInteger(n));
    const insCat = db.prepare('INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)');
    for (const cid of catIds) {
      insCat.run(postId, cid);
    }

    // Sync tags
    db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(postId);
    const cleanTags = Array.from(
      new Set((input.tags ?? []).map((s) => s.trim()).filter(Boolean)),
    );
    const insTag = db.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)');
    const getTag = db.prepare('SELECT id FROM tags WHERE slug = ?');
    const insPostTag = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)');
    for (const name of cleanTags) {
      const tSlug = slugify(name);
      insTag.run(name, tSlug);
      const row = getTag.get(tSlug) as { id: number } | undefined;
      if (row) insPostTag.run(postId, row.id);
    }

    // Sync tree (ONE tree per post; keep existing X/Z coordinates!)
    const primaryCat =
      catIds.length > 0
        ? (db
            .prepare('SELECT species_hint, sector_angle FROM categories WHERE id = ?')
            .get(catIds[0]) as { species_hint: TreeSpecies; sector_angle: number } | undefined)
        : undefined;

    const resolvedSpecies: TreeSpecies =
      input.species && input.species !== 'auto' && VALID_SPECIES.has(input.species)
        ? input.species
        : primaryCat?.species_hint ?? 'oak';

    const existingTree = db
      .prepare('SELECT id FROM trees WHERE post_id = ?')
      .get(postId) as { id: number } | undefined;

    if (existingTree) {
      db.prepare('UPDATE trees SET species = ? WHERE post_id = ?').run(resolvedSpecies, postId);
    } else if (anyPublished) {
      // Plant a new tree with deterministic sector placement & collision avoidance
      const existingCoords = db
        .prepare('SELECT post_id, position_x, position_z FROM trees')
        .all() as Array<{ post_id: number; position_x: number; position_z: number }>;

      const placement = computeTreePlacement({
        postId,
        sectorAngleRad: primaryCat?.sector_angle ?? ((postId * 1.1) % (Math.PI * 2)),
        ageRankRatio: 0.72,
        existingTrees: existingCoords,
      });

      db.prepare(
        `INSERT INTO trees (post_id, species, position_x, position_y, position_z, rotation, scale_seed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        postId,
        resolvedSpecies,
        placement.position_x,
        placement.position_y,
        placement.position_z,
        placement.rotation,
        placement.scale_seed,
        nowIso,
      );
    }

    return postId;
  });

  const savedId = tx();
  return getPostAdminById(db, savedId)!;
}

export function listAnimals(db: Database.Database): AnimalRecord[] {
  return db
    .prepare(
      'SELECT id, species, name, position_x, position_y, position_z, rotation, scale, created_at FROM animals ORDER BY id ASC',
    )
    .all() as AnimalRecord[];
}

export function addAnimals(
  db: Database.Database,
  params: { species: string; count?: number; name?: string },
): AnimalRecord[] {
  const species = params.species as AnimalSpecies;
  if (!VALID_ANIMAL_SPECIES.has(species)) {
    throw new Error('Invalid animal species. Must be rabbit, bird, bear, or wolf.');
  }

  const count = Math.min(20, Math.max(1, Number(params.count) || 1));
  const label = (params.name ?? '').trim().slice(0, 60);
  const nowIso = new Date().toISOString();

  const existing = db
    .prepare('SELECT position_x, position_z FROM animals')
    .all() as Array<{ position_x: number; position_z: number }>;

  const ins = db.prepare(
    `INSERT INTO animals (species, name, position_x, position_y, position_z, rotation, scale, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const createdIds: number[] = [];
  db.transaction(() => {
    for (let i = 0; i < count; i++) {
      let x = 8;
      let z = 8;
      for (let attempt = 0; attempt < 40; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const minR = species === 'bear' || species === 'wolf' ? 14 : 6.5;
        const maxR = species === 'bird' ? 32 : 36;
        const radius = minR + Math.random() * (maxR - minR);
        const cx = Math.cos(angle) * radius;
        const cz = Math.sin(angle) * radius;
        // Keep away from center statue (radius 4) and wooden house (-6.8, -4.2)
        if (Math.hypot(cx, cz) < 4.5) continue;
        if (Math.hypot(cx + 6.8, cz + 4.2) < 4.8) continue;
        const crowded = existing.some((a) => Math.hypot(a.position_x - cx, a.position_z - cz) < 2.4);
        if (!crowded || attempt === 39) {
          x = Number(cx.toFixed(3));
          z = Number(cz.toFixed(3));
          break;
        }
      }
      existing.push({ position_x: x, position_z: z });
      const y =
        species === 'bird'
          ? Number((groundHeightAt(x, z) + 5.2 + Math.random() * 4.5).toFixed(3))
          : Number(groundHeightAt(x, z).toFixed(3));
      const rot = Number((Math.random() * Math.PI * 2).toFixed(4));
      const scale = Number((0.9 + Math.random() * 0.25).toFixed(3));
      const res = ins.run(species, label, x, y, z, rot, scale, nowIso);
      createdIds.push(Number(res.lastInsertRowid));
    }
  })();

  const ph = createdIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT id, species, name, position_x, position_y, position_z, rotation, scale, created_at FROM animals WHERE id IN (${ph})`,
    )
    .all(...createdIds) as AnimalRecord[];
}

export function deleteAnimal(db: Database.Database, id: number): boolean {
  const info = db.prepare('DELETE FROM animals WHERE id = ?').run(id);
  return info.changes > 0;
}

const CONTRIBUTION_SELECT = `
  SELECT id, kind, animal_species, visitor_name, comment, status,
         position_x, position_y, position_z, rotation, scale, created_at, approved_at
  FROM visitor_contributions
`;

export function listApprovedContributions(db: Database.Database): VisitorContributionRecord[] {
  return db
    .prepare(
      `${CONTRIBUTION_SELECT}
       WHERE status = 'approved'
       ORDER BY COALESCE(approved_at, created_at) ASC, id ASC`,
    )
    .all() as VisitorContributionRecord[];
}

export function listAllContributionsAdmin(db: Database.Database): VisitorContributionRecord[] {
  return db
    .prepare(
      `${CONTRIBUTION_SELECT}
       ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END ASC, created_at DESC, id DESC`,
    )
    .all() as VisitorContributionRecord[];
}

export function createVisitorContribution(
  db: Database.Database,
  params: {
    kind: string;
    animal_species?: string | null;
    visitor_name: string;
    comment?: string | null;
  },
): VisitorContributionRecord {
  const kind = params.kind as ContributionKind;
  if (!VALID_CONTRIBUTION_KINDS.has(kind)) {
    throw new Error('Contribution kind must be stone or animal.');
  }

  let animalSpecies: AnimalSpecies | null = null;
  if (kind === 'animal') {
    const rawSpecies = params.animal_species as AnimalSpecies;
    if (!VALID_ANIMAL_SPECIES.has(rawSpecies)) {
      throw new Error('Animal species must be rabbit, bird, bear, or wolf.');
    }
    animalSpecies = rawSpecies;
  }

  const visitorName = typeof params.visitor_name === 'string' ? params.visitor_name.trim() : '';
  if (!visitorName) {
    throw new Error('Visitor name is required.');
  }
  const safeName = visitorName.slice(0, 60);
  const safeComment =
    typeof params.comment === 'string' ? params.comment.trim().slice(0, 280) : '';

  const occupied = [
    ...(db.prepare('SELECT position_x, position_z FROM trees').all() as Array<{
      position_x: number;
      position_z: number;
    }>),
    ...(db.prepare('SELECT position_x, position_z FROM animals').all() as Array<{
      position_x: number;
      position_z: number;
    }>),
    ...(db.prepare('SELECT position_x, position_z FROM visitor_contributions').all() as Array<{
      position_x: number;
      position_z: number;
    }>),
  ];

  let x = 7.5;
  let z = 7.5;
  for (let attempt = 0; attempt < 60; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const minR =
      kind === 'stone' ? 5.2 : animalSpecies === 'bear' || animalSpecies === 'wolf' ? 13 : 6.5;
    const maxR = kind === 'stone' ? 28 : animalSpecies === 'bird' ? 30 : 34;
    const radius = minR + Math.random() * (maxR - minR);
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;

    // Keep clear of center stone and wooden house (-6.8, -4.2)
    if (Math.hypot(cx, cz) < 4.8) continue;
    if (Math.hypot(cx + 6.8, cz + 4.2) < 5.0) continue;

    const crowded = occupied.some((o) => Math.hypot(o.position_x - cx, o.position_z - cz) < 2.3);
    if (!crowded || attempt === 59) {
      x = Number(cx.toFixed(3));
      z = Number(cz.toFixed(3));
      break;
    }
  }

  const y =
    kind === 'animal' && animalSpecies === 'bird'
      ? Number((groundHeightAt(x, z) + 5.0 + Math.random() * 4.0).toFixed(3))
      : Number(groundHeightAt(x, z).toFixed(3));
  const rotation = Number((Math.random() * Math.PI * 2).toFixed(4));
  const scale =
    kind === 'stone'
      ? Number((0.92 + Math.random() * 0.24).toFixed(3))
      : Number((0.9 + Math.random() * 0.22).toFixed(3));
  const nowIso = new Date().toISOString();

  const res = db
    .prepare(
      `INSERT INTO visitor_contributions
       (kind, animal_species, visitor_name, comment, status, position_x, position_y, position_z, rotation, scale, created_at, approved_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(kind, animalSpecies, safeName, safeComment, x, y, z, rotation, scale, nowIso);

  const createdId = Number(res.lastInsertRowid);
  return db
    .prepare(`${CONTRIBUTION_SELECT} WHERE id = ?`)
    .get(createdId) as VisitorContributionRecord;
}

export function approveVisitorContribution(
  db: Database.Database,
  id: number,
): VisitorContributionRecord | null {
  const existing = db
    .prepare(`${CONTRIBUTION_SELECT} WHERE id = ?`)
    .get(id) as VisitorContributionRecord | undefined;
  if (!existing) return null;

  if (existing.status !== 'approved') {
    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE visitor_contributions
       SET status = 'approved', approved_at = ?
       WHERE id = ?`,
    ).run(nowIso, id);
  }

  return db
    .prepare(`${CONTRIBUTION_SELECT} WHERE id = ?`)
    .get(id) as VisitorContributionRecord;
}

export function deleteVisitorContribution(db: Database.Database, id: number): boolean {
  const info = db.prepare('DELETE FROM visitor_contributions WHERE id = ?').run(id);
  return info.changes > 0;
}


