import { useEffect, useMemo, useRef, useState } from 'react';
import { ContributionInfoPanel } from '../components/ContributionInfoPanel';
import { FooterLoginLink } from '../components/FooterLoginLink';
import { ForestDock } from '../components/ForestDock';
import { ForestFallback2D } from '../components/ForestFallback2D';
import { StatsModal } from '../components/StatsModal';
import { TreeInfoPanel } from '../components/TreeInfoPanel';
import { VisitorContributionModal } from '../components/VisitorContributionModal';
import { WoodenHouseModal } from '../components/WoodenHouseModal';
import { ForestCanvas, type ForestControlApi } from '../forest/ForestCanvas';
import { formatTashkentClock, getTashkentTimeOfDay } from '../forest/tashkentTime';
import { buildLocalizedPath, getDictionary } from '../i18n';
import type {
  AnimalRecord,
  CategoryRecord,
  ForestStats,
  ForestTreeItem,
  LanguageCode,
  SeasonMode,
  SiteSettings,
  TimeOfDay,
  VisitorContributionRecord,
} from '../types';

interface ForestPageProps {
  lang: LanguageCode;
  trees: ForestTreeItem[];
  animals: AnimalRecord[];
  contributions: VisitorContributionRecord[];
  categories: CategoryRecord[];
  stats: ForestStats | null;
  settings: SiteSettings | null;
  loading: boolean;
  initialFocusPostId: number | null;
  onNavigate: (path: string) => void;
}

export function ForestPage({
  lang,
  trees,
  animals,
  contributions,
  categories,
  stats,
  settings,
  loading,
  initialFocusPostId,
  onNavigate,
}: ForestPageProps) {
  const t = getDictionary(lang);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(initialFocusPostId);
  const [selectedContributionId, setSelectedContributionId] = useState<number | null>(null);
  const [highlightCatSlug, setHighlightCatSlug] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(() => getTashkentTimeOfDay());
  const [tashkentClock, setTashkentClock] = useState<string>(() => formatTashkentClock());
  const [webglFailed, setWebglFailed] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [statsOpen, setStatsOpen] = useState(false);
  const [houseOpen, setHouseOpen] = useState(false);
  const [contributionModalOpen, setContributionModalOpen] = useState(false);
  const controlApiRef = useRef<ForestControlApi | null>(null);

  const season: SeasonMode = settings?.default_season ?? 'summer';
  const reducedEffects: boolean = settings?.reduced_effects_default ?? false;
  const showTreeTitles: boolean = settings?.show_tree_titles ?? true;
  const grassCount: number = settings?.grass_count ?? 450;
  const stoneCount: number = settings?.stone_count ?? 18;

  // Keep platform lighting synced with live Tashkent (UTC+5) time
  useEffect(() => {
    const refreshTashkent = () => {
      setTimeOfDay(getTashkentTimeOfDay());
      setTashkentClock(formatTashkentClock());
    };
    refreshTashkent();
    const timer = window.setInterval(refreshTashkent, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (initialFocusPostId !== null) {
      setSelectedContributionId(null);
      setSelectedPostId(initialFocusPostId);
    }
  }, [initialFocusPostId]);

  const selectedTree = useMemo(
    () => trees.find((item) => item.post_id === selectedPostId) ?? null,
    [trees, selectedPostId],
  );

  const selectedContribution = useMemo(
    () => contributions.find((item) => item.id === selectedContributionId) ?? null,
    [contributions, selectedContributionId],
  );

  const handleRandomTree = () => {
    if (trees.length === 0) return;
    const pool = trees.filter((tr) => tr.post_id !== selectedPostId);
    const list = pool.length > 0 ? pool : trees;
    const picked = list[Math.floor(Math.random() * list.length)];
    if (picked) {
      setSelectedContributionId(null);
      setSelectedPostId(picked.post_id);
    }
  };

  const handleStepTree = (delta: number) => {
    if (trees.length === 0) return;
    setSelectedContributionId(null);
    if (selectedPostId === null) {
      setSelectedPostId(delta >= 0 ? trees[0].post_id : trees[trees.length - 1].post_id);
      return;
    }
    const idx = trees.findIndex((tr) => tr.post_id === selectedPostId);
    const nextIdx = idx === -1 ? 0 : (idx + delta + trees.length) % trees.length;
    setSelectedPostId(trees[nextIdx].post_id);
  };

  const handleResetView = () => {
    setSelectedPostId(null);
    setSelectedContributionId(null);
    setResetSignal((n) => n + 1);
  };

  const handleOpenWoodenHouse = () => {
    setSelectedPostId(null);
    setSelectedContributionId(null);
    controlApiRef.current?.focusWoodenHouse();
    setHouseOpen(true);
  };

  const handleReadArticle = (targetLang: LanguageCode, slug: string) => {
    onNavigate(buildLocalizedPath(targetLang, `/post/${slug}`));
  };

  return (
    <main className="relative w-full h-screen overflow-hidden pt-14 bg-[#d7e3d8]">
      {webglFailed ? (
        <ForestFallback2D
          trees={trees}
          lang={lang}
          selectedPostId={selectedPostId}
          highlightCategorySlug={highlightCatSlug}
          noticeText={t.forest.webglFallbackNotice}
          onSelectTree={(id) => {
            setSelectedContributionId(null);
            setSelectedPostId(id);
          }}
        />
      ) : (
        <ForestCanvas
          trees={trees}
          animals={animals}
          contributions={contributions}
          lang={lang}
          selectedPostId={selectedPostId}
          selectedContributionId={selectedContributionId}
          highlightCategorySlug={highlightCatSlug}
          season={season}
          timeOfDay={timeOfDay}
          reducedEffects={reducedEffects}
          showTreeTitles={showTreeTitles}
          grassCount={grassCount}
          stoneCount={stoneCount}
          introAnimation={settings?.intro_animation ?? true}
          resetSignal={resetSignal}
          hoverPromptLabel={t.forest.hoverPrompt}
          houseHoverTitle={t.forest.houseHoverTitle}
          houseHoverPrompt={t.forest.houseHoverPrompt}
          statueHoverTitle={t.forest.statueHoverTitle}
          contributionStoneLabel={t.visitorGift.hoverStone}
          animalLabels={t.animals}
          controlApiRef={controlApiRef}
          onSelectTree={(id) => {
            if (id !== null) setSelectedContributionId(null);
            setSelectedPostId(id);
          }}
          onSelectContribution={(id) => {
            if (id !== null) setSelectedPostId(null);
            setSelectedContributionId(id);
          }}
          onOpenWoodenHouse={handleOpenWoodenHouse}
          onWebGLFailure={() => setWebglFailed(true)}
        />
      )}

      {loading && trees.length === 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-10 flex justify-center px-4">
          <div className="bg-[#FBF9F5]/92 border border-[#1C241E]/12 rounded-lg px-4 py-2 text-xs font-medium text-[#2A382D] shadow-sm">
            {t.forest.loading}
          </div>
        </div>
      )}

      {!loading && trees.length === 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-28 z-10 flex justify-center px-4">
          <div className="bg-[#FBF9F5]/95 border border-[#1C241E]/12 rounded-xl px-6 py-4 text-center max-w-md shadow-sm">
            <h1 className="font-display text-xl font-semibold text-[#1C241E] mb-1">
              {t.forest.emptyTitle}
            </h1>
            <p className="text-sm text-[#546357]">{t.forest.emptyBody}</p>
          </div>
        </div>
      )}

      {selectedTree && (
        <TreeInfoPanel
          item={selectedTree}
          lang={lang}
          onClose={() => setSelectedPostId(null)}
          onReadArticle={handleReadArticle}
        />
      )}

      {!selectedTree && selectedContribution && (
        <ContributionInfoPanel
          item={selectedContribution}
          lang={lang}
          onClose={() => setSelectedContributionId(null)}
        />
      )}

      <ForestDock
        lang={lang}
        treeCount={trees.length}
        categories={categories}
        selectedCategorySlug={highlightCatSlug}
        season={season}
        timeOfDay={timeOfDay}
        tashkentClock={tashkentClock}
        hiddenOnMobile={
          Boolean(selectedTree) ||
          Boolean(selectedContribution) ||
          houseOpen ||
          contributionModalOpen
        }
        onSelectCategory={setHighlightCatSlug}
        onMove={(fwd, strafe) => controlApiRef.current?.move(fwd, strafe)}
        onSetMoveInput={(fwd, strafe) => controlApiRef.current?.setHoldMove(fwd, strafe)}
        onPrevTree={() => handleStepTree(-1)}
        onNextTree={() => handleStepTree(1)}
        onRandomTree={handleRandomTree}
        onOpenWoodenHouse={handleOpenWoodenHouse}
        onOpenContributionModal={() => setContributionModalOpen(true)}
        onResetView={handleResetView}
        onOpenStats={() => setStatsOpen(true)}
      />

      <VisitorContributionModal
        open={contributionModalOpen}
        lang={lang}
        onClose={() => setContributionModalOpen(false)}
      />

      <WoodenHouseModal
        open={houseOpen}
        lang={lang}
        settings={settings}
        onClose={() => setHouseOpen(false)}
        onNavigateArchive={() => onNavigate(buildLocalizedPath(lang, '/archive'))}
      />

      <StatsModal
        open={statsOpen}
        lang={lang}
        stats={stats}
        onClose={() => setStatsOpen(false)}
      />

      <FooterLoginLink lang={lang} floating onNavigate={onNavigate} />
    </main>
  );
}
