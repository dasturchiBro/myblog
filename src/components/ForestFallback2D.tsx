import { TreeDeciduous } from 'lucide-react';
import type { ForestTreeItem, LanguageCode } from '../types';
import { computeGrowthMetrics } from '../forest/growth';
import { formatLocalizedDate, getDictionary } from '../i18n';

interface ForestFallback2DProps {
  trees: ForestTreeItem[];
  lang: LanguageCode;
  selectedPostId: number | null;
  highlightCategorySlug: string | null;
  noticeText?: string;
  onSelectTree: (postId: number) => void;
}

export function ForestFallback2D({
  trees,
  lang,
  selectedPostId,
  highlightCategorySlug,
  noticeText,
  onSelectTree,
}: ForestFallback2DProps) {
  const t = getDictionary(lang);

  return (
    <div
      data-testid="forest-2d-fallback"
      className="relative w-full h-full overflow-auto bg-[#ECECE2] pt-24 pb-32 px-4 sm:px-8"
    >
      <div className="max-w-5xl mx-auto">
        {noticeText && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm text-[#2A382D]">
            {noticeText}
          </div>
        )}

        {/* Interactive 2D Spatial Clearing Map */}
        <div className="relative w-full h-[360px] sm:h-[440px] rounded-xl bg-[#DFE5D8] border border-[#1C241E]/12 overflow-hidden mb-8">
          <svg
            viewBox="-55 -55 110 110"
            className="w-full h-full"
            role="img"
            aria-label={t.nav.forest}
          >
            {/* Clearing rings */}
            <circle cx="0" cy="0" r="10" fill="#D2DAC7" stroke="#9AA88E" strokeWidth="0.3" />
            <circle cx="0" cy="0" r="26" fill="none" stroke="#B7C4AA" strokeDasharray="1.5 1.5" strokeWidth="0.25" />
            <circle cx="0" cy="0" r="44" fill="none" stroke="#B7C4AA" strokeDasharray="1.5 1.5" strokeWidth="0.25" />
            <rect x="-1.6" y="-1.6" width="3.2" height="3.2" rx="0.6" fill="#7D7B72" />

            {trees.map((item) => {
              const g = computeGrowthMetrics(item.published_at);
              const isSelected = selectedPostId === item.post_id;
              const dimmed =
                Boolean(highlightCategorySlug) &&
                !item.categories.some((c) => c.slug === highlightCategorySlug);
              const r = 1.4 + g.progress * 2.1;
              const title =
                item.translations[lang]?.title ||
                item.translations.uz?.title ||
                item.translations.en?.title ||
                '';

              return (
                <g
                  key={item.post_id}
                  transform={`translate(${item.tree.position_x}, ${item.tree.position_z})`}
                  onClick={() => onSelectTree(item.post_id)}
                  className="cursor-pointer"
                  opacity={dimmed ? 0.3 : 1}
                >
                  {isSelected && (
                    <circle
                      r={r + 1.4}
                      fill="none"
                      stroke="#C68B2C"
                      strokeWidth="0.6"
                    />
                  )}
                  <circle
                    r={r}
                    fill={
                      item.tree.species === 'cherry'
                        ? '#D9859C'
                        : item.tree.species === 'maple'
                          ? '#C85E2B'
                          : item.tree.species === 'birch'
                            ? '#6B9E4D'
                            : '#3B6E3A'
                    }
                    stroke="#1C241E"
                    strokeWidth="0.25"
                  />
                  <title>{title}</title>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Accessible 2D Tree List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trees.map((item) => {
            const tr = item.translations[lang] || item.translations.uz || item.translations.en;
            if (!tr) return null;
            const g = computeGrowthMetrics(item.published_at);
            const isSelected = selectedPostId === item.post_id;
            return (
              <button
                key={item.post_id}
                type="button"
                onClick={() => onSelectTree(item.post_id)}
                className={`text-left p-5 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-[#FBF9F5] border-[#2F5233]'
                    : 'bg-[#F7F4EE] border-[#1C241E]/10 hover:border-[#2F5233]/40'
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-[#546357] mb-2">
                  <TreeDeciduous className="w-3.5 h-3.5 text-[#2F5233]" />
                  <span>{t.species[item.tree.species]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t.growth[g.stage]}</span>
                </div>
                <h3 className="font-display text-lg font-medium text-[#1C241E] leading-snug mb-1.5">
                  {tr.title}
                </h3>
                <p className="text-xs text-[#546357]">
                  {formatLocalizedDate(item.published_at, lang)}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
