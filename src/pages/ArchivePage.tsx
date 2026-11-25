import { ArrowRight, FolderTree, Search, TreeDeciduous } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FooterLoginLink } from '../components/FooterLoginLink';
import { computeGrowthMetrics } from '../forest/growth';
import { buildLocalizedPath, formatLocalizedDate, getDictionary } from '../i18n';
import type { CategoryRecord, ForestTreeItem, LanguageCode } from '../types';

interface ArchivePageProps {
  lang: LanguageCode;
  trees: ForestTreeItem[];
  categories: CategoryRecord[];
  siteName?: string;
  initialCategorySlug?: string | null;
  onNavigate: (path: string, focusPostId?: number) => void;
}

export function ArchivePage({
  lang,
  trees,
  categories,
  siteName,
  initialCategorySlug = null,
  onNavigate,
}: ArchivePageProps) {
  const t = getDictionary(lang);
  const [selectedCat, setSelectedCat] = useState<string>(initialCategorySlug ?? '');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trees.filter((item) => {
      if (selectedCat && !item.categories.some((c) => c.slug === selectedCat)) {
        return false;
      }
      if (!q) return true;
      const tr = item.translations[lang] || item.translations.uz || item.translations.en;
      const hay = [
        tr?.title,
        tr?.subtitle,
        tr?.excerpt,
        ...item.tags.map((tg) => tg.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [trees, selectedCat, query, lang]);

  return (
    <main className="min-h-screen bg-[#F7F4EE] pt-24 pb-16 px-4 sm:px-6 flex flex-col justify-between">
      <div className="max-w-4xl mx-auto w-full">
        <header className="mb-8 pb-6 border-b border-[#1C241E]/12">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#1C241E] mb-3">
            {t.archive.title}
          </h1>
          <p className="text-base text-[#435046] max-w-2xl">{t.archive.subtitle}</p>
        </header>

        {/* Search & Count */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search
              className="w-4 h-4 text-[#546357] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.archive.searchPlaceholder}
              aria-label={t.archive.searchPlaceholder}
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#FBF9F5] border border-[#1C241E]/14 text-sm text-[#1C241E] placeholder-[#7B887E] focus:outline-none focus:border-[#214029]"
            />
          </div>

          <span className="text-xs text-[#546357] tabular-nums whitespace-nowrap">
            {filtered.length} {t.archive.countSuffix}
          </span>
        </div>

        {/* Category Filter Buttons */}
        <section aria-label={t.archive.filterByCategoryBtn} className="mb-9">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#546357] mb-2.5">
            <FolderTree className="w-3.5 h-3.5 text-[#214029]" aria-hidden="true" />
            <span>{t.archive.filterByCategoryBtn}:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCat('')}
              aria-pressed={selectedCat === ''}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                selectedCat === ''
                  ? 'bg-[#214029] text-[#F7F4EE]'
                  : 'bg-[#EAE6DC] text-[#1C241E] hover:bg-[#DFDBD0]'
              }`}
            >
              {t.archive.filterAll} ({trees.length})
            </button>
            {categories.map((cat) => {
              const active = selectedCat === cat.slug;
              const catLabel = cat.translations[lang]?.name || cat.translations.uz.name;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCat(active ? '' : cat.slug)}
                  aria-pressed={active}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#214029] text-[#F7F4EE]'
                      : 'bg-[#EAE6DC] text-[#1C241E] hover:bg-[#DFDBD0]'
                  }`}
                >
                  {catLabel} ({cat.post_count ?? 0})
                </button>
              );
            })}
          </div>
        </section>

        {/* Chronological List */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#546357] border border-dashed border-[#1C241E]/15 rounded-xl">
            {t.archive.empty}
          </div>
        ) : (
          <div className="divide-y divide-[#1C241E]/10">
            {filtered.map((item) => {
              const tr = item.translations[lang];
              const fallbackLang: LanguageCode = lang === 'uz' ? 'en' : 'uz';
              const displayTr = tr || item.translations[fallbackLang];
              if (!displayTr) return null;
              const targetLang: LanguageCode = tr ? lang : fallbackLang;
              const growth = computeGrowthMetrics(item.published_at);

              return (
                <article
                  key={item.post_id}
                  className="py-7 flex flex-col sm:flex-row sm:items-start justify-between gap-5"
                >
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#546357] mb-2">
                      <span>{formatLocalizedDate(item.published_at, lang)}</span>
                      {item.categories[0] && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {item.categories[0].translations[lang]?.name ||
                              item.categories[0].translations.uz.name}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <TreeDeciduous className="w-3.5 h-3.5 text-[#214029]" aria-hidden="true" />
                        {t.species[item.tree.species]} ({t.growth[growth.stage]})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {displayTr.reading_time} {t.treePanel.minRead}
                      </span>
                    </div>

                    <h2 className="font-display text-2xl font-semibold text-[#1C241E] leading-snug mb-2">
                      <a
                        href={buildLocalizedPath(targetLang, `/post/${displayTr.slug}`)}
                        onClick={(e) => {
                          e.preventDefault();
                          onNavigate(buildLocalizedPath(targetLang, `/post/${displayTr.slug}`));
                        }}
                        className="hover:text-[#214029] transition-colors"
                      >
                        {displayTr.title}
                      </a>
                      {!tr && (
                        <span className="ml-2 text-xs font-sans font-normal text-[#785926]">
                          ({fallbackLang.toUpperCase()})
                        </span>
                      )}
                    </h2>

                    {displayTr.excerpt && (
                      <p className="text-sm text-[#435046] leading-relaxed">{displayTr.excerpt}</p>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end gap-2.5 shrink-0 pt-1">
                    <a
                      href={buildLocalizedPath(targetLang, `/post/${displayTr.slug}`)}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(buildLocalizedPath(targetLang, `/post/${displayTr.slug}`));
                      }}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-[#214029] hover:underline underline-offset-4 whitespace-nowrap"
                    >
                      <span>{t.archive.readMore}</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onNavigate(buildLocalizedPath(lang, '/'), item.post_id)}
                      className="text-xs text-[#546357] hover:text-[#1C241E] cursor-pointer whitespace-nowrap"
                    >
                      {t.archive.viewInForest}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <FooterLoginLink lang={lang} siteName={siteName} onNavigate={onNavigate} />
    </main>
  );
}
