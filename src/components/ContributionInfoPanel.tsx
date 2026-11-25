import { Mountain, PawPrint, X } from 'lucide-react';
import { formatLocalizedDate, getDictionary } from '../i18n';
import type { LanguageCode, VisitorContributionRecord } from '../types';

interface ContributionInfoPanelProps {
  item: VisitorContributionRecord;
  lang: LanguageCode;
  onClose: () => void;
}

export function ContributionInfoPanel({
  item,
  lang,
  onClose,
}: ContributionInfoPanelProps) {
  const t = getDictionary(lang);
  const kindTitle =
    item.kind === 'stone'
      ? t.visitorGift.panelKindStone
      : `${t.visitorGift.panelKindAnimal} · ${t.animals[item.animal_species ?? 'rabbit']}`;

  return (
    <aside
      aria-label={`${kindTitle} — ${item.visitor_name}`}
      data-testid="contribution-info-panel"
      className="fixed z-30 bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:top-20 sm:bottom-auto sm:w-[340px] bg-[#FBF9F5]/95 border border-[#1C241E]/14 rounded-xl shadow-lg p-5 text-[#1C241E]"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#214029]">
          {item.kind === 'stone' ? (
            <Mountain className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <PawPrint className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>{kindTitle}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="w-8 h-8 -mt-1 -mr-1 inline-flex items-center justify-center rounded-lg text-[#546357] hover:text-[#1C241E] hover:bg-[#EAE6DC] cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mb-3">
        <div className="text-[11px] text-[#546357]">{t.visitorGift.panelFrom}</div>
        <h2 className="font-display text-xl font-semibold text-[#1C241E] leading-snug">
          {item.visitor_name}
        </h2>
      </div>

      <div className="p-3.5 rounded-lg bg-[#F3EFE6] border border-[#1C241E]/8 mb-3">
        <div className="text-[11px] text-[#546357] mb-1">{t.visitorGift.panelComment}</div>
        <p className="text-sm text-[#2F3A31] leading-relaxed">
          {item.comment ? item.comment : t.visitorGift.panelNoComment}
        </p>
      </div>

      <div className="text-xs text-[#546357]">
        {t.visitorGift.panelAddedOn}: {formatLocalizedDate(item.approved_at ?? item.created_at, lang)}
      </div>
    </aside>
  );
}
