import { ArrowRight, BookOpen, GraduationCap, Home, MapPin, X } from 'lucide-react';
import { buildLocalizedPath, getDictionary } from '../i18n';
import type { LanguageCode, SiteSettings } from '../types';

interface WoodenHouseModalProps {
  open: boolean;
  lang: LanguageCode;
  settings: SiteSettings | null;
  onClose: () => void;
  onNavigateArchive: () => void;
}

export function WoodenHouseModal({
  open,
  lang,
  settings,
  onClose,
  onNavigateArchive,
}: WoodenHouseModalProps) {
  if (!open) return null;
  const t = getDictionary(lang);

  const heading =
    (lang === 'uz' ? settings?.about_title_uz : settings?.about_title_en) ||
    t.meta.authorName;
  const body =
    (lang === 'uz' ? settings?.about_body_uz : settings?.about_body_en) || '';
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      data-testid="wooden-house-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141A15]/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl bg-[#FBF9F5] border border-[#1C241E]/15 shadow-2xl p-6 sm:p-8 text-[#1C241E]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-[#1C241E]/10 mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[#5B452A] mb-2">
              <Home className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.about.kicker}</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#1C241E] leading-tight">
              {heading}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#546357] hover:text-[#1C241E] hover:bg-[#EAE6DC] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Author essay */}
        {paragraphs.length > 0 && (
          <div className="space-y-4 mb-8 text-[#2F3A31] text-base leading-relaxed">
            {paragraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        )}

        {/* Location & Education */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-7">
          <div className="p-4 rounded-xl bg-[#F3EFE6] border border-[#1C241E]/8">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#546357] mb-1">
              <MapPin className="w-3.5 h-3.5 text-[#214029]" aria-hidden="true" />
              <span>{t.about.locationLabel}</span>
            </div>
            <div className="text-sm font-medium text-[#1C241E]">{t.about.locationValue}</div>
          </div>

          <div className="p-4 rounded-xl bg-[#F3EFE6] border border-[#1C241E]/8">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#546357] mb-1">
              <GraduationCap className="w-3.5 h-3.5 text-[#214029]" aria-hidden="true" />
              <span>{t.about.educationLabel}</span>
            </div>
            <div className="text-sm font-medium text-[#1C241E] leading-snug">
              {t.about.educationValue}
            </div>
          </div>
        </div>

        {/* Milestones */}
        <section className="mb-7">
          <h3 className="font-display text-lg font-semibold text-[#1C241E] mb-3">
            {t.about.milestonesTitle}
          </h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {t.about.milestones.map((item) => (
              <li
                key={item}
                className="px-3.5 py-2.5 rounded-lg bg-[#F3EFE6] border border-[#1C241E]/8 text-xs sm:text-sm text-[#2A382D]"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Interests */}
        <section className="mb-7">
          <h3 className="font-display text-lg font-semibold text-[#1C241E] mb-3">
            {t.about.interestsTitle}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {t.about.interestGroups.map((grp) => (
              <div key={grp.title}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[#546357] mb-2">
                  {grp.title}
                </h4>
                <ul className="space-y-1 text-xs sm:text-sm text-[#2F3A31]">
                  {grp.items.map((it) => (
                    <li key={it}>— {it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs sm:text-sm text-[#546357] italic leading-relaxed">
            {t.about.projectsNote}
          </p>
        </section>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-[#1C241E]/10">
          <a
            href={buildLocalizedPath(lang, '/archive')}
            onClick={(e) => {
              e.preventDefault();
              onClose();
              onNavigateArchive();
            }}
            className="px-4 py-2.5 rounded-lg bg-[#EAE6DC] text-[#1C241E] text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 hover:bg-[#DFDBD0]"
          >
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            <span>{t.about.readArchiveCta}</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg bg-[#214029] text-[#F7F4EE] text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 hover:bg-[#19321F] cursor-pointer"
          >
            <span>{t.about.exploreForestCta}</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
