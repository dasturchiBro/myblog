import { Search, TreePine, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { computeGrowthMetrics } from '../forest/growth';
import { buildLocalizedPath, formatLocalizedDate, getDictionary } from '../i18n';
import type { ForestTreeItem, LanguageCode } from '../types';

interface SearchModalProps {
  open: boolean;
  lang: LanguageCode;
  trees: ForestTreeItem[];
  onClose: () => void;
  onFocusTree: (postId: number) => void;
  onReadArticle: (targetLang: LanguageCode, slug: string) => void;
}

export function SearchModal({
  open,
  lang,
  trees,
  onClose,
  onFocusTree,
  onReadArticle,
}: SearchModalProps) {
  const t = getDictionary(lang);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trees.slice(0, 6);
    return trees.filter((item) => {
      const uz = item.translations.uz;
      const en = item.translations.en;
      const haystack = [
        uz?.title,
        uz?.subtitle,
        uz?.excerpt,
        en?.title,
        en?.subtitle,
        en?.excerpt,
        t.species[item.tree.species],
        ...item.categories.flatMap((c) => [c.translations.uz.name, c.translations.en.name]),
        ...item.tags.map((tg) => tg.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, trees, t]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.search.title}
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-[#141A15]/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl bg-[#FBF9F5] border border-[#1C241E]/15 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1C241E]/10">
          <Search className="w-4 h-4 text-[#546357] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search.placeholder}
            aria-label={t.search.title}
            className="w-full bg-transparent text-sm text-[#1C241E] placeholder-[#7B887E] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t.search.close}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#546357] hover:bg-[#EAE6DC] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-3">
          <div className="px-2 py-1.5 text-xs font-medium text-[#546357]">
            {query.trim()
              ? `${results.length} ${t.search.resultsCount}`
              : t.search.recentLabel}
          </div>

          {results.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#546357]">
              {t.search.noResults}
            </div>
          ) : (
            <div className="divide-y divide-[#1C241E]/8">
              {results.map((item) => {
                const tr = item.translations[lang];
                const fallbackLang: LanguageCode = lang === 'uz' ? 'en' : 'uz';
                const displayTr = tr || item.translations[fallbackLang];
                if (!displayTr) return null;
                const readLang: LanguageCode = tr ? lang : fallbackLang;
                const growth = computeGrowthMetrics(item.published_at);
                const catName = item.categories[0]?.translations[lang]?.name ?? '';

                return (
                  <div
                    key={item.post_id}
                    className="py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#546357] mb-1">
                        <TreePine className="w-3.5 h-3.5 text-[#2F5233]" aria-hidden="true" />
                        <span>{t.species[item.tree.species]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{t.growth[growth.stage]}</span>
                        {catName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{catName}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{formatLocalizedDate(item.published_at, lang)}</span>
                      </div>
                      <div className="font-display text-base font-medium text-[#1C241E] truncate">
                        {displayTr.title}
                        {!tr && (
                          <span className="ml-2 text-xs font-sans text-[#785926]">
                            ({fallbackLang.toUpperCase()})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onFocusTree(item.post_id);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#EAE6DC] hover:bg-[#DFDBD0] text-xs font-medium text-[#1C241E] cursor-pointer whitespace-nowrap"
                      >
                        {t.search.focusTree}
                      </button>
                      <a
                        href={buildLocalizedPath(readLang, `/post/${displayTr.slug}`)}
                        onClick={(e) => {
                          e.preventDefault();
                          onReadArticle(readLang, displayTr.slug);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#214029] hover:bg-[#19321F] text-xs font-medium text-[#F7F4EE] whitespace-nowrap"
                      >
                        {t.search.readPost}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
