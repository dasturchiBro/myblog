import { X } from 'lucide-react';
import { formatLocalizedDate, getDictionary } from '../i18n';
import type { ForestStats, LanguageCode } from '../types';

interface StatsModalProps {
  open: boolean;
  lang: LanguageCode;
  stats: ForestStats | null;
  onClose: () => void;
}

export function StatsModal({ open, lang, stats, onClose }: StatsModalProps) {
  const t = getDictionary(lang);
  if (!open || !stats) return null;

  const maxCum = Math.max(1, ...stats.timeline.map((p) => p.cumulative));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.stats.title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141A15]/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-[#FBF9F5] border border-[#1C241E]/15 shadow-2xl p-6 text-[#1C241E]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold">{t.stats.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#546357] hover:bg-[#EAE6DC] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 pb-5 border-b border-[#1C241E]/10">
          <div>
            <div className="text-xs text-[#546357]">{t.stats.totalTrees}</div>
            <div className="font-display text-2xl font-semibold tabular-nums mt-0.5">
              {stats.total_trees}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#546357]">{t.stats.categories}</div>
            <div className="font-display text-2xl font-semibold tabular-nums mt-0.5">
              {stats.category_count}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#546357]">{t.stats.oldestTree}</div>
            <div className="text-sm font-medium mt-0.5">
              {stats.oldest_publication
                ? formatLocalizedDate(stats.oldest_publication, lang)
                : t.stats.noneYet}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#546357]">{t.stats.newestTree}</div>
            <div className="text-sm font-medium mt-0.5">
              {stats.newest_publication
                ? formatLocalizedDate(stats.newest_publication, lang)
                : t.stats.noneYet}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#546357]">{t.stats.mostActiveCategory}</div>
            <div className="text-sm font-medium mt-0.5">
              {stats.most_active_category
                ? stats.most_active_category.translations[lang]?.name ||
                  stats.most_active_category.translations.uz.name
                : t.stats.noneYet}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#546357]">{t.stats.avgFrequency}</div>
            <div className="text-sm font-medium tabular-nums mt-0.5">
              {stats.avg_days_between_posts !== null
                ? `${stats.avg_days_between_posts} ${t.stats.days}`
                : t.stats.noneYet}
            </div>
          </div>
        </div>

        {stats.timeline.length > 0 && (
          <div className="pt-4">
            <div className="text-xs font-medium text-[#546357] mb-3">
              {t.stats.growthOverTime}
            </div>
            <div className="flex items-end gap-2 h-24">
              {stats.timeline.map((pt) => {
                const hPct = Math.max(12, Math.round((pt.cumulative / maxCum) * 100));
                return (
                  <div key={pt.month} className="flex-1 h-full flex flex-col items-center justify-end gap-1 min-w-0">
                    <span className="text-[10px] tabular-nums text-[#546357]">
                      {pt.cumulative}
                    </span>
                    <div
                      className="w-full rounded-t bg-[#2F5233]"
                      style={{ height: `${hPct * 0.6}%` }}
                      title={`${pt.month}: ${pt.cumulative}`}
                    />
                    <span className="text-[10px] font-mono text-[#546357] truncate max-w-full">
                      {pt.month.slice(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
