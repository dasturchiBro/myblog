import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Home,
  Mountain,
  RotateCcw,
  Shuffle,
} from 'lucide-react';
import { useState } from 'react';
import { getDictionary } from '../i18n';
import type { CategoryRecord, LanguageCode, SeasonMode, TimeOfDay } from '../types';

interface ForestDockProps {
  lang: LanguageCode;
  treeCount: number;
  categories: CategoryRecord[];
  selectedCategorySlug: string | null;
  season: SeasonMode;
  timeOfDay: TimeOfDay;
  tashkentClock: string;
  hiddenOnMobile?: boolean;
  onSelectCategory: (slug: string | null) => void;
  onMove: (forward: number, strafe: number) => void;
  onSetMoveInput?: (forward: number, strafe: number) => void;
  onPrevTree: () => void;
  onNextTree: () => void;
  onRandomTree: () => void;
  onOpenWoodenHouse: () => void;
  onOpenContributionModal: () => void;
  onResetView: () => void;
  onOpenStats: () => void;
}

export function ForestDock({
  lang,
  treeCount,
  categories,
  selectedCategorySlug,
  season,
  timeOfDay,
  tashkentClock,
  hiddenOnMobile = false,
  onSelectCategory,
  onMove,
  onSetMoveInput,
  onPrevTree,
  onNextTree,
  onRandomTree,
  onOpenWoodenHouse,
  onOpenContributionModal,
  onResetView,
  onOpenStats,
}: ForestDockProps) {
  const t = getDictionary(lang);
  const [collapsed, setCollapsed] = useState(false);

  const makeHoldProps = (fwdDir: number, strafeDir: number) => {
    let downAt = 0;
    let lastHandledAt = 0;
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        downAt = performance.now();
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          // ignore synthetic pointer capture errors
        }
        onSetMoveInput?.(fwdDir, strafeDir);
      },
      onPointerUp: () => {
        onSetMoveInput?.(0, 0);
        const now = performance.now();
        if (downAt && now - downAt < 220) {
          lastHandledAt = now;
          onMove(fwdDir * 3.0, strafeDir * 3.0);
        } else if (downAt) {
          lastHandledAt = now;
        }
        downAt = 0;
      },
      onPointerCancel: () => {
        onSetMoveInput?.(0, 0);
        downAt = 0;
      },
      onClick: () => {
        const now = performance.now();
        if (now - lastHandledAt > 150) {
          onMove(fwdDir * 3.0, strafeDir * 3.0);
        }
      },
    };
  };

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(980px,calc(100vw-24px))] flex flex-col items-center pointer-events-none ${
        hiddenOnMobile ? 'max-sm:hidden' : ''
      }`}
    >
      {/* Collapse / Expand Handle */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F7F4EE]/95 border border-[#1C241E]/12 text-xs font-medium text-[#2A382D] hover:bg-[#FBF9F5] shadow-sm cursor-pointer"
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.forest.showControls}</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.forest.hideControls}</span>
          </>
        )}
      </button>

      {!collapsed && (
        <div className="pointer-events-auto w-full rounded-xl bg-[#F7F4EE]/95 border border-[#1C241E]/14 shadow-lg px-2.5 sm:px-3.5 py-2 sm:py-2.5 flex flex-col gap-1.5 sm:gap-2">
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
            {/* Left cluster: Free-move directional pad + Wooden House + Tree navigation */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Smooth Free-Move Directional Pad (hold to walk, tap to glide) */}
              <div
                role="group"
                aria-label={t.forest.moveForward}
                className="inline-flex items-center gap-0.5 bg-[#EAE6DC] p-0.5 rounded-lg border border-[#1C241E]/10"
              >
                <button
                  type="button"
                  {...makeHoldProps(0, -1)}
                  aria-label={t.forest.moveLeft}
                  title={t.forest.moveLeft}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-md inline-flex items-center justify-center text-[#1C241E] hover:bg-[#FBF9F5] active:bg-[#DFDBD0] cursor-pointer select-none touch-none"
                >
                  <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  {...makeHoldProps(1, 0)}
                  aria-label={t.forest.moveForward}
                  title={t.forest.moveForward}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-md inline-flex items-center justify-center text-[#1C241E] hover:bg-[#FBF9F5] active:bg-[#DFDBD0] cursor-pointer select-none touch-none"
                >
                  <ArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  {...makeHoldProps(-1, 0)}
                  aria-label={t.forest.moveBack}
                  title={t.forest.moveBack}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-md inline-flex items-center justify-center text-[#1C241E] hover:bg-[#FBF9F5] active:bg-[#DFDBD0] cursor-pointer select-none touch-none"
                >
                  <ArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  {...makeHoldProps(0, 1)}
                  aria-label={t.forest.moveRight}
                  title={t.forest.moveRight}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-md inline-flex items-center justify-center text-[#1C241E] hover:bg-[#FBF9F5] active:bg-[#DFDBD0] cursor-pointer select-none touch-none"
                >
                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Tree explorer steppers */}
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  disabled={treeCount === 0}
                  onClick={onPrevTree}
                  aria-label={t.forest.prevTree}
                  title={t.forest.prevTree}
                  className="h-8 sm:h-9 px-2 sm:px-2.5 rounded-lg bg-[#EAE6DC] text-[#1C241E] text-xs font-medium inline-flex items-center gap-1 hover:bg-[#DFDBD0] disabled:opacity-45 disabled:pointer-events-none cursor-pointer whitespace-nowrap"
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden lg:inline">{t.forest.prevTree}</span>
                </button>
                <button
                  type="button"
                  disabled={treeCount === 0}
                  onClick={onRandomTree}
                  className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg bg-[#214029] text-[#F7F4EE] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#18301E] disabled:opacity-45 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.forest.randomTree}</span>
                </button>
                <button
                  type="button"
                  disabled={treeCount === 0}
                  onClick={onNextTree}
                  aria-label={t.forest.nextTree}
                  title={t.forest.nextTree}
                  className="h-8 sm:h-9 px-2 sm:px-2.5 rounded-lg bg-[#EAE6DC] text-[#1C241E] text-xs font-medium inline-flex items-center gap-1 hover:bg-[#DFDBD0] disabled:opacity-45 disabled:pointer-events-none cursor-pointer whitespace-nowrap"
                >
                  <span className="hidden lg:inline">{t.forest.nextTree}</span>
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                onClick={onOpenWoodenHouse}
                className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg bg-[#6D4D2E] text-[#FBF7F0] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#583D24] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Home className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.forest.visitHouse}</span>
              </button>

              <button
                type="button"
                onClick={onOpenContributionModal}
                data-testid="open-visitor-contribution-btn"
                className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg bg-[#2F5233] text-[#F7F4EE] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#234027] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Mountain className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.visitorGift.openBtn}</span>
              </button>

              <button
                type="button"
                onClick={onResetView}
                aria-label={t.forest.resetView}
                title={t.forest.resetView}
                className="h-8 sm:h-9 px-2 sm:px-2.5 rounded-lg bg-[#EAE6DC] text-[#1C241E] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#DFDBD0] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{t.forest.resetView}</span>
              </button>
            </div>

            {/* Right cluster: Category Filter + Stats + Live Tashkent Clock/Season */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="forest-category-filter">
                {t.forest.filterByCategory}
              </label>
              <select
                id="forest-category-filter"
                value={selectedCategorySlug ?? ''}
                onChange={(e) => onSelectCategory(e.target.value || null)}
                className="h-9 px-2.5 rounded-lg bg-[#EAE6DC] border border-[#1C241E]/10 text-xs font-medium text-[#1C241E] focus-visible:outline-2 focus-visible:outline-[#2F5233]"
              >
                <option value="">{t.forest.allCategories}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.translations[lang]?.name || cat.translations.uz.name} ({cat.post_count ?? 0})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onOpenStats}
                className="h-9 px-2.5 rounded-lg bg-[#EAE6DC] text-[#1C241E] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#DFDBD0] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="tabular-nums">
                  {treeCount} {t.forest.treeCountLabel}
                </span>
              </button>

              <div
                title={`${t.forest.tashkentTimeLabel} · ${t.forest.seasons[season]}`}
                className="hidden sm:inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-[#EAE6DC]/75 text-[11px] font-medium text-[#3D4A3F] whitespace-nowrap"
              >
                <Clock className="w-3.5 h-3.5 text-[#214029]" aria-hidden="true" />
                <span className="tabular-nums">{tashkentClock}</span>
                <span aria-hidden="true">·</span>
                <span>{t.forest.times[timeOfDay]}</span>
                <span aria-hidden="true">·</span>
                <span>{t.forest.seasons[season]}</span>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center justify-between text-[11px] text-[#546357] pt-1 border-t border-[#1C241E]/8">
            <span>{t.forest.navHintDesktop}</span>
            <span className="italic">{t.forest.clearingInscription}</span>
          </div>
        </div>
      )}
    </div>
  );
}
