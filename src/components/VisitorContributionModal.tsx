import { CheckCircle2, Mountain, PawPrint, Send, X } from 'lucide-react';
import { useState } from 'react';
import { getDictionary } from '../i18n';
import type { AnimalSpecies, ContributionKind, LanguageCode } from '../types';

interface VisitorContributionModalProps {
  open: boolean;
  lang: LanguageCode;
  onClose: () => void;
}

const SPECIES_OPTIONS: AnimalSpecies[] = ['rabbit', 'bird', 'bear', 'wolf'];

export function VisitorContributionModal({
  open,
  lang,
  onClose,
}: VisitorContributionModalProps) {
  const t = getDictionary(lang);
  const [kind, setKind] = useState<ContributionKind>('stone');
  const [animalSpecies, setAnimalSpecies] = useState<AnimalSpecies>('rabbit');
  const [visitorName, setVisitorName] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setVisitorName('');
    setComment('');
    setErrorMsg(null);
    setSubmitted(false);
  };

  const handleClose = () => {
    setErrorMsg(null);
    setSubmitted(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = visitorName.trim();
    if (!trimmedName) {
      setErrorMsg(t.visitorGift.validationName);
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          animal_species: kind === 'animal' ? animalSpecies : null,
          visitor_name: trimmedName,
          comment: comment.trim(),
        }),
      });
      if (res.status === 429) {
        setErrorMsg(t.visitorGift.rateLimited);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || t.common.error);
        return;
      }
      setSubmitted(true);
    } catch {
      setErrorMsg(t.common.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.visitorGift.modalTitle}
      data-testid="visitor-contribution-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141A15]/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#FBF9F5] border border-[#1C241E]/15 shadow-2xl p-6 text-[#1C241E]">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#1C241E]/10 mb-5">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#1C241E]">
              {t.visitorGift.modalTitle}
            </h2>
            <p className="text-xs sm:text-sm text-[#435046] mt-1 leading-relaxed">
              {t.visitorGift.modalSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t.common.close}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#546357] hover:text-[#1C241E] hover:bg-[#EAE6DC] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-4 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#214029]/12 text-[#214029] inline-flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-[#1C241E]">
                {t.visitorGift.successTitle}
              </h3>
              <p className="text-sm text-[#435046] mt-1.5 leading-relaxed">
                {t.visitorGift.successBody}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg bg-[#EAE6DC] hover:bg-[#DFDBD0] text-xs sm:text-sm font-medium text-[#1C241E] cursor-pointer"
              >
                {t.visitorGift.addAnotherBtn}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 rounded-lg bg-[#214029] hover:bg-[#19321F] text-xs sm:text-sm font-medium text-[#F7F4EE] cursor-pointer"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="px-3.5 py-2.5 rounded-lg bg-[#9A3412]/10 border border-[#9A3412]/25 text-xs sm:text-sm text-[#9A3412]"
              >
                {errorMsg}
              </div>
            )}

            <div>
              <div className="text-xs font-medium text-[#3D4A3F] mb-2">
                {t.visitorGift.kindLabel}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setKind('stone')}
                  aria-pressed={kind === 'stone'}
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-2.5 ${
                    kind === 'stone'
                      ? 'bg-[#214029] text-[#F7F4EE] border-[#214029]'
                      : 'bg-[#F3EFE6] text-[#1C241E] border-[#1C241E]/12 hover:bg-[#EAE6DC]'
                  }`}
                >
                  <Mountain className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="text-xs sm:text-sm font-medium">{t.visitorGift.kindStone}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setKind('animal')}
                  aria-pressed={kind === 'animal'}
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-2.5 ${
                    kind === 'animal'
                      ? 'bg-[#214029] text-[#F7F4EE] border-[#214029]'
                      : 'bg-[#F3EFE6] text-[#1C241E] border-[#1C241E]/12 hover:bg-[#EAE6DC]'
                  }`}
                >
                  <PawPrint className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="text-xs sm:text-sm font-medium">{t.visitorGift.kindAnimal}</span>
                </button>
              </div>
            </div>

            {kind === 'animal' && (
              <div>
                <label
                  htmlFor="visitor-animal-species"
                  className="block text-xs font-medium text-[#3D4A3F] mb-1"
                >
                  {t.visitorGift.speciesLabel}
                </label>
                <select
                  id="visitor-animal-species"
                  value={animalSpecies}
                  onChange={(e) => setAnimalSpecies(e.target.value as AnimalSpecies)}
                  className="w-full h-10 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm text-[#1C241E]"
                >
                  {SPECIES_OPTIONS.map((sp) => (
                    <option key={sp} value={sp}>
                      {t.animals[sp]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label
                htmlFor="visitor-gift-name"
                className="block text-xs font-medium text-[#3D4A3F] mb-1"
              >
                {t.visitorGift.nameLabel}
              </label>
              <input
                id="visitor-gift-name"
                type="text"
                maxLength={60}
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                placeholder={t.visitorGift.namePlaceholder}
                className="w-full h-10 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm text-[#1C241E]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="visitor-gift-comment"
                  className="block text-xs font-medium text-[#3D4A3F]"
                >
                  {t.visitorGift.commentLabel}
                </label>
                <span className="text-[11px] text-[#546357] tabular-nums">
                  {comment.length}/280
                </span>
              </div>
              <textarea
                id="visitor-gift-comment"
                rows={3}
                maxLength={280}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t.visitorGift.commentPlaceholder}
                className="w-full p-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm text-[#1C241E] resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg bg-[#EAE6DC] hover:bg-[#DFDBD0] text-xs sm:text-sm font-medium text-[#1C241E] cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-[#214029] hover:bg-[#19321F] disabled:opacity-60 text-xs sm:text-sm font-medium text-[#F7F4EE] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{submitting ? t.visitorGift.submitting : t.visitorGift.submitBtn}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
