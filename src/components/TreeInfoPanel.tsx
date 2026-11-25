import { ArrowRight, X } from 'lucide-react';
import { computeGrowthMetrics } from '../forest/growth';
import { buildLocalizedPath, formatLocalizedDate, getDictionary } from '../i18n';
import type { ForestTreeItem, LanguageCode } from '../types';

interface TreeInfoPanelProps {
  item: ForestTreeItem;
  lang: LanguageCode;
  onClose: () => void;
  onReadArticle: (targetLang: LanguageCode, slug: string) => void;
}

export function TreeInfoPanel({
  item,
  lang,
  onClose,
  onReadArticle,
}: TreeInfoPanelProps) {
  const t = getDictionary(lang);
  const tr = item.translations[lang];
  const fallbackLang: LanguageCode = lang === 'uz' ? 'en' : 'uz';
  const fallbackTr = item.translations[fallbackLang];
  const growth = computeGrowthMetrics(item.published_at);

  const primaryCat = item.categories[0];
  const catName = primaryCat
    ? primaryCat.translations[lang]?.name || primaryCat.translations.uz.name
    : '';

  return (
    <aside
      aria-label={tr?.title || t.treePanel.species}
      data-testid="tree-info-panel"
      className="fixed z-30 bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:top-20 sm:bottom-auto sm:w-[360px] max-h-[calc(100vh-7rem)] overflow-y-auto bg-[#FBF9F5]/95 border border-[#1C241E]/14 rounded-xl shadow-lg p-5 text-[#1C241E]"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#546357]">
          {catName && (
            <>
              <span>{catName}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{formatLocalizedDate(item.published_at, lang)}</span>
          {tr && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {tr.reading_time} {t.treePanel.minRead}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.treePanel.close}
          className="w-8 h-8 -mt-1 -mr-1 inline-flex items-center justify-center rounded-lg text-[#546357] hover:text-[#1C241E] hover:bg-[#EAE6DC] transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {tr ? (
        <>
          <h2 className="font-display text-xl font-semibold text-[#1C241E] leading-snug mb-2">
            {tr.title}
          </h2>
          {tr.excerpt && (
            <p className="text-sm text-[#435046] leading-relaxed line-clamp-3 mb-4">
              {tr.excerpt}
            </p>
          )}
        </>
      ) : (
        <div className="mb-4">
          <p className="text-sm font-medium text-[#2A382D] mb-1.5">
            {t.treePanel.onlyOtherLangNotice}
          </p>
          {fallbackTr && (
            <p className="text-xs text-[#546357] italic">
              “{fallbackTr.title}”
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-[#546357] py-2.5 border-t border-[#1C241E]/10 mb-3">
        <span>
          {t.treePanel.species}: <strong className="font-medium text-[#1C241E]">{t.species[item.tree.species]}</strong>
        </span>
        <span>
          {t.growth[growth.stage]}
        </span>
      </div>

      {tr ? (
        <a
          href={buildLocalizedPath(lang, `/post/${tr.slug}`)}
          onClick={(e) => {
            e.preventDefault();
            onReadArticle(lang, tr.slug);
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#214029] text-[#F7F4EE] text-sm font-medium hover:bg-[#19321F] transition-colors"
        >
          <span>{t.treePanel.readArticle}</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </a>
      ) : fallbackTr ? (
        <a
          href={buildLocalizedPath(fallbackLang, `/post/${fallbackTr.slug}`)}
          onClick={(e) => {
            e.preventDefault();
            onReadArticle(fallbackLang, fallbackTr.slug);
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#214029] text-[#F7F4EE] text-sm font-medium hover:bg-[#19321F] transition-colors"
        >
          <span>{t.treePanel.viewOriginalOtherLang}</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </a>
      ) : null}
    </aside>
  );
}
