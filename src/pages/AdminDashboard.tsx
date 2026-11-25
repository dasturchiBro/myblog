import {
  Check,
  Clock,
  Download,
  Eye,
  EyeOff,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TreeDeciduous,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AdminPostEditor } from '../components/AdminPostEditor';
import { ALL_SPECIES } from '../forest/growth';
import { formatTashkentClock, getTashkentTimeOfDay } from '../forest/tashkentTime';
import { buildLocalizedPath, formatLocalizedDate, getDictionary } from '../i18n';
import type {
  AdminUser,
  AnimalRecord,
  AnimalSpecies,
  CategoryRecord,
  ForestStats,
  LanguageCode,
  PostSummary,
  SeasonMode,
  SiteSettings,
  TreeSpecies,
  VisitorContributionRecord,
} from '../types';
import { adminFetch, clearAuthToken, setAuthToken } from '../utils/authClient';

type AdminTab =
  | 'overview'
  | 'posts'
  | 'editor'
  | 'categories'
  | 'animals'
  | 'contributions'
  | 'settings'
  | 'security';

const ANIMAL_SPECIES: AnimalSpecies[] = ['rabbit', 'bird', 'bear', 'wolf'];

interface AdminDashboardProps {
  lang: LanguageCode;
  user: AdminUser;
  initialTab?: AdminTab;
  editPostId?: number | null;
  onSwitchLanguage: (next: LanguageCode) => void;
  onUserUpdated: (user: AdminUser | null) => void;
  onDataMutated: () => void;
  onNavigate: (path: string) => void;
}

export function AdminDashboard({
  lang,
  user,
  initialTab = 'overview',
  editPostId = null,
  onSwitchLanguage,
  onUserUpdated,
  onDataMutated,
  onNavigate,
}: AdminDashboardProps) {
  const t = getDictionary(lang);
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [stats, setStats] = useState<ForestStats | null>(null);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [animals, setAnimals] = useState<AnimalRecord[]>([]);
  const [contributions, setContributions] = useState<VisitorContributionRecord[]>([]);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [editingPost, setEditingPost] = useState<PostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PostSummary | null>(null);

  // Category creation form state
  const [newCatUz, setNewCatUz] = useState('');
  const [newCatEn, setNewCatEn] = useState('');
  const [newCatDescUz, setNewCatDescUz] = useState('');
  const [newCatDescEn, setNewCatDescEn] = useState('');
  const [newCatSpecies, setNewCatSpecies] = useState<TreeSpecies>('oak');

  // Animal creation form state
  const [animalSpecies, setAnimalSpecies] = useState<AnimalSpecies>('rabbit');
  const [animalQty, setAnimalQty] = useState<number>(1);
  const [animalName, setAnimalName] = useState<string>('');

  // Credentials update form state
  const [credCurrent, setCredCurrent] = useState('');
  const [credUsername, setCredUsername] = useState(user.username);
  const [credNewPass, setCredNewPass] = useState('');
  const [credConfirm, setCredConfirm] = useState('');
  const vegSaveTimerRef = useRef<number | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/overview');
      if (res.status === 401 || res.status === 403) {
        clearAuthToken();
        onUserUpdated(null);
        onNavigate('/login');
        return;
      }
      const data = await res.json();
      setStats(data.stats);
      setPosts(data.posts);
      setCategories(data.categories);
      setAnimals(data.animals ?? []);
      setContributions(data.contributions ?? []);
      setSettings(data.settings);
      if (editPostId) {
        const found = (data.posts as PostSummary[]).find((p) => p.id === editPostId) ?? null;
        setEditingPost(found);
        setTab('editor');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    return () => {
      if (vegSaveTimerRef.current !== null) window.clearTimeout(vegSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setTab(initialTab);
    if (editPostId && posts.length > 0) {
      setEditingPost(posts.find((p) => p.id === editPostId) ?? null);
    } else if (initialTab === 'editor' && !editPostId) {
      setEditingPost(null);
    }
  }, [initialTab, editPostId]);

  const handleLogout = async () => {
    await adminFetch('/api/auth/logout', { method: 'POST' });
    clearAuthToken();
    onUserUpdated(null);
    onNavigate('/login');
  };

  const patchSettingsImmediate = async (patch: Partial<SiteSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    const res = await adminFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      setNotice(t.admin.settings.settingsSaved);
      onDataMutated();
    }
  };

  const patchSettingsDebounced = (patch: Partial<SiteSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    if (vegSaveTimerRef.current !== null) {
      window.clearTimeout(vegSaveTimerRef.current);
    }
    vegSaveTimerRef.current = window.setTimeout(async () => {
      const res = await adminFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setSettings(data.settings);
        setNotice(t.admin.settings.settingsSaved);
        onDataMutated();
      }
    }, 220);
  };

  const handleDownloadProtectedFile = async (url: string, fallbackName: string) => {
    const res = await adminFetch(url);
    if (!res.ok) {
      setNotice(t.common.error);
      return;
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  };

  const handleDeletePost = async () => {
    if (!deleteTarget) return;
    const res = await adminFetch(`/api/admin/posts/${deleteTarget.id}`, {
      method: 'DELETE',
    });
    setDeleteTarget(null);
    if (res.ok) {
      setNotice(t.admin.editor.deleteSuccess);
      await loadOverview();
      onDataMutated();
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminFetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uz_name: newCatUz,
        en_name: newCatEn,
        uz_description: newCatDescUz,
        en_description: newCatDescEn,
        species_hint: newCatSpecies,
      }),
    });
    if (res.ok) {
      setNewCatUz('');
      setNewCatEn('');
      setNewCatDescUz('');
      setNewCatDescEn('');
      await loadOverview();
      onDataMutated();
    }
  };

  const handleDeleteCategory = async (id: number) => {
    const res = await adminFetch(`/api/admin/categories/${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await loadOverview();
      onDataMutated();
    }
  };

  const handleAddAnimals = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminFetch('/api/admin/animals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        species: animalSpecies,
        count: animalQty,
        name: animalName.trim(),
      }),
    });
    if (res.ok) {
      setAnimalName('');
      setAnimalQty(1);
      setNotice(t.admin.animalsPanel.addedNotice);
      await loadOverview();
      onDataMutated();
    }
  };

  const handleDeleteAnimal = async (id: number) => {
    const res = await adminFetch(`/api/admin/animals/${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setNotice(t.admin.animalsPanel.removedNotice);
      await loadOverview();
      onDataMutated();
    }
  };

  const handleApproveContribution = async (id: number) => {
    const res = await adminFetch(`/api/admin/contributions/${id}/approve`, {
      method: 'POST',
    });
    if (res.ok) {
      const data = await res.json();
      if (data.contributions) setContributions(data.contributions);
      setNotice(t.admin.contributionsPanel.approvedNotice);
      onDataMutated();
    }
  };

  const handleDisapproveContribution = async (id: number) => {
    const res = await adminFetch(`/api/admin/contributions/${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const data = await res.json();
      if (data.contributions) setContributions(data.contributions);
      setNotice(t.admin.contributionsPanel.disapprovedNotice);
      onDataMutated();
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    const res = await adminFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      setNotice(t.admin.settings.settingsSaved);
      onDataMutated();
    }
  };

  const handleChangeCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (credNewPass.length < 8) {
      setNotice(t.auth.passwordTooShort);
      return;
    }
    if (credNewPass !== credConfirm) {
      setNotice(t.auth.passwordMismatch);
      return;
    }
    const res = await adminFetch('/api/auth/change-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: credCurrent,
        newUsername: credUsername,
        newPassword: credNewPass,
      }),
    });
    const data = await res.json();
    if (res.ok && data.user) {
      if (typeof data.token === 'string') {
        setAuthToken(data.token);
      }
      onUserUpdated(data.user);
      setCredCurrent('');
      setCredNewPass('');
      setCredConfirm('');
      setNotice(t.admin.settings.settingsSaved);
    } else {
      setNotice(data.error || t.common.error);
    }
  };

  const handleRestoreDb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('database', file);
    const res = await adminFetch('/api/admin/backup/restore', {
      method: 'POST',
      body: form,
    });
    if (res.ok) {
      setNotice(t.admin.settings.restoreSuccess);
      await loadOverview();
      onDataMutated();
    } else {
      const data = await res.json();
      setNotice(data.error || t.common.error);
    }
  };

  const renderTranslationStatus = (post: PostSummary, code: LanguageCode) => {
    const tr = post.translations[code];
    if (!tr) return <span className="text-[#7B887E]">{t.admin.statusMissing}</span>;
    return tr.translation_status === 'published' ? (
      <span className="text-[#214029] font-medium">{t.admin.statusPublished}</span>
    ) : (
      <span className="text-[#925E18] font-medium">{t.admin.statusDraft}</span>
    );
  };

  const pendingContributions = contributions.filter((c) => c.status === 'pending');
  const approvedContributions = contributions.filter((c) => c.status === 'approved');

  const navTabs: Array<[AdminTab, string]> = [
    ['overview', t.admin.navOverview],
    ['posts', t.admin.navPosts],
    ['categories', t.admin.navCategories],
    ['animals', t.admin.navAnimals],
    [
      'contributions',
      pendingContributions.length > 0
        ? `${t.admin.navContributions} (${pendingContributions.length})`
        : t.admin.navContributions,
    ],
    ['settings', t.admin.navSettings],
    ['security', t.admin.navSecurity],
  ];

  const tashkentClock = formatTashkentClock();
  const tashkentTime = getTashkentTimeOfDay();

  return (
    <div className="min-h-screen bg-[#F7F4EE] text-[#1C241E]">
      {/* Studio Header */}
      <header className="bg-[#FBF9F5] border-b border-[#1C241E]/12 px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <span className="font-display text-lg font-semibold text-[#1C241E] whitespace-nowrap">
            {t.admin.title}
          </span>
          <nav className="hidden md:flex items-center gap-1">
            {navTabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  setNotice(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  tab === key
                    ? 'bg-[#214029] text-[#F7F4EE]'
                    : 'text-[#3D4A3F] hover:bg-[#EAE6DC]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="inline-flex rounded-lg bg-[#EAE6DC] p-0.5">
            <button
              type="button"
              onClick={() => onSwitchLanguage('uz')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                lang === 'uz' ? 'bg-[#214029] text-[#F7F4EE]' : 'text-[#3D4A3F]'
              }`}
            >
              {t.lang.uzLabel}
            </button>
            <button
              type="button"
              onClick={() => onSwitchLanguage('en')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                lang === 'en' ? 'bg-[#214029] text-[#F7F4EE]' : 'text-[#3D4A3F]'
              }`}
            >
              {t.lang.enLabel}
            </button>
          </div>

          <a
            href={buildLocalizedPath(lang, '/')}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(buildLocalizedPath(lang, '/'));
            }}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EAE6DC] text-xs font-medium text-[#1C241E] hover:bg-[#DFDBD0] whitespace-nowrap"
          >
            <TreeDeciduous className="w-3.5 h-3.5 text-[#214029]" />
            <span>{t.admin.viewPublicForest}</span>
          </a>

          <button
            type="button"
            onClick={handleLogout}
            aria-label={t.auth.logout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EAE6DC] text-xs font-medium text-[#1C241E] hover:bg-[#DFDBD0] cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.auth.logout}</span>
          </button>
        </div>
      </header>

      {/* Mobile Tab Strip */}
      <div className="md:hidden flex items-center gap-1 overflow-x-auto px-4 py-2 bg-[#FBF9F5] border-b border-[#1C241E]/10">
        {navTabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              tab === key ? 'bg-[#214029] text-[#F7F4EE]' : 'bg-[#EAE6DC] text-[#1C241E]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {notice && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-[#214029]/10 border border-[#214029]/25 text-sm text-[#1C241E] flex items-center justify-between">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs font-medium underline cursor-pointer"
            >
              {t.common.close}
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-[#546357]">{t.common.loading}</div>
        ) : tab === 'editor' ? (
          <AdminPostEditor
            lang={lang}
            post={editingPost}
            categories={categories}
            onSaved={async () => {
              setNotice(t.admin.editor.saveSuccess);
              setEditingPost(null);
              setTab('posts');
              await loadOverview();
              onDataMutated();
            }}
            onCancel={() => {
              setEditingPost(null);
              setTab('posts');
            }}
          />
        ) : tab === 'overview' && stats ? (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="font-display text-2xl sm:text-3xl font-semibold">
                {t.admin.overviewHeading}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setEditingPost(null);
                  setTab('editor');
                }}
                className="h-10 px-4 rounded-lg bg-[#214029] text-[#F7F4EE] text-sm font-medium inline-flex items-center gap-2 hover:bg-[#19321F] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t.admin.createPostBtn}</span>
              </button>
            </div>

            {/* Quick Forest Controls (persisted to SQLite across all devices) */}
            {settings && (
              <section className="p-5 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/12 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-base font-semibold text-[#1C241E]">
                    {t.admin.quickControlsTitle}
                  </h2>
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#546357]">
                    <Clock className="w-3.5 h-3.5 text-[#214029]" aria-hidden="true" />
                    <span>
                      {t.forest.tashkentTimeLabel}: <strong className="text-[#1C241E]">{tashkentClock}</strong> ({t.forest.times[tashkentTime]})
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Platform Season Selector */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="quick-season" className="text-xs font-medium text-[#3D4A3F]">
                      {t.admin.settings.defaultSeason}:
                    </label>
                    <select
                      id="quick-season"
                      value={settings.default_season}
                      onChange={(e) =>
                        patchSettingsImmediate({ default_season: e.target.value as SeasonMode })
                      }
                      className="h-9 px-3 rounded-lg bg-[#EAE6DC] border border-[#1C241E]/12 text-xs font-medium text-[#1C241E]"
                    >
                      <option value="spring">{t.forest.seasons.spring}</option>
                      <option value="summer">{t.forest.seasons.summer}</option>
                      <option value="autumn">{t.forest.seasons.autumn}</option>
                      <option value="winter">{t.forest.seasons.winter}</option>
                    </select>
                  </div>

                  {/* Show Post Titles Above Trees Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      patchSettingsImmediate({ show_tree_titles: !settings.show_tree_titles })
                    }
                    className={`h-9 px-3.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      settings.show_tree_titles
                        ? 'bg-[#214029] text-[#F7F4EE]'
                        : 'bg-[#EAE6DC] text-[#3D4A3F] hover:text-[#1C241E]'
                    }`}
                  >
                    {settings.show_tree_titles ? (
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {settings.show_tree_titles
                        ? t.admin.toggleTitlesOn
                        : t.admin.toggleTitlesOff}
                    </span>
                  </button>

                  {/* Reduced Effects for All Devices Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      patchSettingsImmediate({
                        reduced_effects_default: !settings.reduced_effects_default,
                      })
                    }
                    className={`h-9 px-3.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      settings.reduced_effects_default
                        ? 'bg-[#214029] text-[#F7F4EE]'
                        : 'bg-[#EAE6DC] text-[#3D4A3F] hover:text-[#1C241E]'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {settings.reduced_effects_default
                        ? t.admin.toggleReducedOn
                        : t.admin.toggleReducedOff}
                    </span>
                  </button>
                </div>

                {/* Grass & Stone Density Sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#1C241E]/10">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium text-[#3D4A3F]">
                      <label htmlFor="quick-grass-count">{t.admin.settings.grassCount}</label>
                      <input
                        id="quick-grass-number"
                        aria-label={t.admin.settings.grassCount}
                        type="number"
                        min={0}
                        max={2500}
                        step={25}
                        value={settings.grass_count}
                        onChange={(e) => {
                          const v = Math.min(2500, Math.max(0, Math.round(Number(e.target.value) || 0)));
                          patchSettingsDebounced({ grass_count: v });
                        }}
                        className="w-20 h-7 px-2 rounded bg-[#EAE6DC] border border-[#1C241E]/12 text-right tabular-nums text-xs text-[#1C241E]"
                      />
                    </div>
                    <input
                      id="quick-grass-count"
                      type="range"
                      min={0}
                      max={2500}
                      step={25}
                      value={settings.grass_count}
                      onChange={(e) =>
                        patchSettingsDebounced({ grass_count: Number(e.target.value) })
                      }
                      className="w-full accent-[#214029] cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium text-[#3D4A3F]">
                      <label htmlFor="quick-stone-count">{t.admin.settings.stoneCount}</label>
                      <input
                        id="quick-stone-number"
                        aria-label={t.admin.settings.stoneCount}
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={settings.stone_count}
                        onChange={(e) => {
                          const v = Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0)));
                          patchSettingsDebounced({ stone_count: v });
                        }}
                        className="w-20 h-7 px-2 rounded bg-[#EAE6DC] border border-[#1C241E]/12 text-right tabular-nums text-xs text-[#1C241E]"
                      />
                    </div>
                    <input
                      id="quick-stone-count"
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={settings.stone_count}
                      onChange={(e) =>
                        patchSettingsDebounced({ stone_count: Number(e.target.value) })
                      }
                      className="w-full accent-[#214029] cursor-pointer"
                    />
                  </div>
                </div>
              </section>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/10">
                <div className="text-xs text-[#546357]">{t.stats.totalPosts}</div>
                <div className="font-display text-3xl font-semibold tabular-nums mt-1">
                  {stats.total_posts}
                </div>
              </div>
              <div className="p-5 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/10">
                <div className="text-xs text-[#546357]">{t.stats.totalTrees}</div>
                <div className="font-display text-3xl font-semibold tabular-nums mt-1">
                  {stats.total_trees}
                </div>
              </div>
              <div className="p-5 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/10">
                <div className="text-xs text-[#546357]">{t.stats.categories}</div>
                <div className="font-display text-3xl font-semibold tabular-nums mt-1">
                  {stats.category_count}
                </div>
              </div>
              <div className="p-5 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/10">
                <div className="text-xs text-[#546357]">{t.stats.drafts}</div>
                <div className="font-display text-3xl font-semibold tabular-nums mt-1">
                  {stats.draft_count}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 p-6 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/10">
                <h2 className="font-display text-lg font-semibold mb-4">
                  {t.stats.growthOverTime}
                </h2>
                {stats.timeline.length === 0 ? (
                  <p className="text-sm text-[#546357]">{t.stats.noneYet}</p>
                ) : (
                  <div className="flex items-end gap-2.5 h-36 pt-4">
                    {stats.timeline.map((pt) => {
                      const maxCum = Math.max(1, ...stats.timeline.map((x) => x.cumulative));
                      const pct = Math.max(12, Math.round((pt.cumulative / maxCum) * 100));
                      return (
                        <div
                          key={pt.month}
                          className="flex-1 h-full flex flex-col items-center justify-end gap-1 min-w-0"
                        >
                          <span className="text-xs tabular-nums text-[#546357]">{pt.cumulative}</span>
                          <div
                            className="w-full rounded-t bg-[#214029]"
                            style={{ height: `${pct * 0.7}%` }}
                          />
                          <span className="text-[11px] font-mono text-[#546357] truncate max-w-full">
                            {pt.month}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 p-6 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/10 space-y-4">
                <div>
                  <div className="text-xs text-[#546357]">{t.stats.newestTree}</div>
                  <div className="text-sm font-medium mt-0.5">
                    {stats.newest_publication
                      ? formatLocalizedDate(stats.newest_publication, lang)
                      : t.stats.noneYet}
                  </div>
                </div>
                <div className="pt-3 border-t border-[#1C241E]/10">
                  <div className="text-xs text-[#546357]">{t.stats.oldestTree}</div>
                  <div className="text-sm font-medium mt-0.5">
                    {stats.oldest_publication
                      ? formatLocalizedDate(stats.oldest_publication, lang)
                      : t.stats.noneYet}
                  </div>
                </div>
                <div className="pt-3 border-t border-[#1C241E]/10">
                  <div className="text-xs text-[#546357]">{t.stats.avgFrequency}</div>
                  <div className="text-sm font-medium tabular-nums mt-0.5">
                    {stats.avg_days_between_posts !== null
                      ? `${stats.avg_days_between_posts} ${t.stats.days}`
                      : t.stats.noneYet}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : tab === 'posts' ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="font-display text-2xl sm:text-3xl font-semibold">
                {t.admin.postsHeading}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setEditingPost(null);
                  setTab('editor');
                }}
                className="h-10 px-4 rounded-lg bg-[#214029] text-[#F7F4EE] text-sm font-medium inline-flex items-center gap-2 hover:bg-[#19321F] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t.admin.createPostBtn}</span>
              </button>
            </div>

            <div className="rounded-xl bg-[#FBF9F5] border border-[#1C241E]/12 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#EAE6DC]/65 text-xs text-[#546357] border-b border-[#1C241E]/10">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t.admin.editor.titleLabel}</th>
                    <th className="px-4 py-3 font-medium">{t.admin.uzStatus}</th>
                    <th className="px-4 py-3 font-medium">{t.admin.enStatus}</th>
                    <th className="px-4 py-3 font-medium">{t.admin.editor.speciesLabel}</th>
                    <th className="px-4 py-3 font-medium">{t.treePanel.plantedOn}</th>
                    <th className="px-4 py-3 font-medium text-right">{t.admin.statusLabel}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C241E]/10">
                  {posts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#546357]">
                        {t.forest.emptyBody}
                      </td>
                    </tr>
                  ) : (
                    posts.map((p) => {
                      const displayTitle =
                        p.translations[lang]?.title ||
                        p.translations.uz?.title ||
                        p.translations.en?.title ||
                        `#${p.id}`;
                      const treeVisible =
                        p.translations.uz?.translation_status === 'published' ||
                        p.translations.en?.translation_status === 'published';

                      return (
                        <tr key={p.id} className="hover:bg-[#F7F4EE]/70">
                          <td className="px-4 py-3.5 font-medium text-[#1C241E] max-w-xs truncate">
                            {displayTitle}
                          </td>
                          <td className="px-4 py-3.5 text-xs">{renderTranslationStatus(p, 'uz')}</td>
                          <td className="px-4 py-3.5 text-xs">{renderTranslationStatus(p, 'en')}</td>
                          <td className="px-4 py-3.5 text-xs text-[#3D4A3F]">
                            {p.tree ? t.species[p.tree.species] : '—'}
                            <div className="text-[11px] text-[#546357]">
                              {treeVisible ? t.admin.treeStatusVisible : t.admin.treeStatusHidden}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-[#546357] whitespace-nowrap">
                            {formatLocalizedDate(p.published_at ?? p.created_at, lang)}
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-2">
                            <button
                              type="button"
                              aria-label={`${t.admin.editBtn} ${displayTitle}`}
                              onClick={() => {
                                setEditingPost(p);
                                setTab('editor');
                              }}
                              className="px-2.5 py-1 rounded bg-[#EAE6DC] hover:bg-[#DFDBD0] text-xs font-medium text-[#1C241E] cursor-pointer"
                            >
                              {t.admin.editBtn}
                            </button>
                            <button
                              type="button"
                              aria-label={`${t.admin.deleteBtn} ${displayTitle}`}
                              onClick={() => setDeleteTarget(p)}
                              className="px-2.5 py-1 rounded bg-[#9A3412]/10 hover:bg-[#9A3412]/20 text-xs font-medium text-[#9A3412] cursor-pointer"
                            >
                              {t.admin.deleteBtn}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : tab === 'categories' ? (
          <div className="space-y-8">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold">
              {t.admin.categoriesHeading}
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <form
                onSubmit={handleCreateCategory}
                className="lg:col-span-5 p-6 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/12 space-y-4 h-fit"
              >
                <h2 className="font-display text-lg font-semibold">{t.admin.categories.addNew}</h2>
                <div>
                  <label className="block text-xs font-medium text-[#3D4A3F] mb-1">
                    {t.admin.categories.nameUz}
                  </label>
                  <input
                    required
                    value={newCatUz}
                    onChange={(e) => setNewCatUz(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D4A3F] mb-1">
                    {t.admin.categories.nameEn}
                  </label>
                  <input
                    required
                    value={newCatEn}
                    onChange={(e) => setNewCatEn(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D4A3F] mb-1">
                    {t.admin.categories.descUz}
                  </label>
                  <input
                    value={newCatDescUz}
                    onChange={(e) => setNewCatDescUz(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D4A3F] mb-1">
                    {t.admin.categories.descEn}
                  </label>
                  <input
                    value={newCatDescEn}
                    onChange={(e) => setNewCatDescEn(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D4A3F] mb-1">
                    {t.admin.categories.defaultSpecies}
                  </label>
                  <select
                    value={newCatSpecies}
                    onChange={(e) => setNewCatSpecies(e.target.value as TreeSpecies)}
                    className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                  >
                    {ALL_SPECIES.map((sp) => (
                      <option key={sp} value={sp}>
                        {t.species[sp]}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full h-10 rounded-lg bg-[#214029] text-[#F7F4EE] text-sm font-medium hover:bg-[#19321F] cursor-pointer"
                >
                  {t.admin.categories.saveCategory}
                </button>
              </form>

              <div className="lg:col-span-7 space-y-3">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="p-4 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/10 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="font-medium text-sm text-[#1C241E]">
                        {cat.translations.uz.name} / {cat.translations.en.name}
                      </div>
                      <div className="text-xs text-[#546357] mt-0.5">
                        {t.species[cat.species_hint]} · {cat.post_count ?? 0}{' '}
                        {t.categoriesPage.articlesCount}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat.id)}
                      aria-label={`${t.admin.deleteBtn} ${cat.translations[lang]?.name}`}
                      className="p-2 rounded-lg text-[#9A3412] hover:bg-[#9A3412]/10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : tab === 'animals' ? (
          <div className="space-y-8">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold">
              {t.admin.animalsHeading}
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <form
                onSubmit={handleAddAnimals}
                className="lg:col-span-5 p-6 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/12 space-y-4 h-fit"
              >
                <h2 className="font-display text-lg font-semibold">
                  {t.admin.animalsPanel.addTitle}
                </h2>
                <div>
                  <label htmlFor="animal-species" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                    {t.admin.animalsPanel.speciesLabel}
                  </label>
                  <select
                    id="animal-species"
                    value={animalSpecies}
                    onChange={(e) => setAnimalSpecies(e.target.value as AnimalSpecies)}
                    className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                  >
                    {ANIMAL_SPECIES.map((sp) => (
                      <option key={sp} value={sp}>
                        {t.animals[sp]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="animal-qty" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                    {t.admin.animalsPanel.quantityLabel}
                  </label>
                  <input
                    id="animal-qty"
                    type="number"
                    min={1}
                    max={10}
                    value={animalQty}
                    onChange={(e) => setAnimalQty(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                    className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="animal-name" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                    {t.admin.animalsPanel.nameLabel}
                  </label>
                  <input
                    id="animal-name"
                    type="text"
                    value={animalName}
                    onChange={(e) => setAnimalName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-10 rounded-lg bg-[#214029] text-[#F7F4EE] text-sm font-medium hover:bg-[#19321F] cursor-pointer"
                >
                  {t.admin.animalsPanel.addBtn}
                </button>
              </form>

              <div className="lg:col-span-7 space-y-3">
                <h2 className="font-display text-lg font-semibold">
                  {t.admin.animalsPanel.listTitle} ({animals.length})
                </h2>
                {animals.length === 0 ? (
                  <div className="p-6 rounded-xl bg-[#FBF9F5] border border-dashed border-[#1C241E]/15 text-sm text-[#546357]">
                    {t.admin.animalsPanel.empty}
                  </div>
                ) : (
                  animals.map((animal) => (
                    <div
                      key={animal.id}
                      className="p-4 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/10 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-medium text-sm text-[#1C241E]">
                          {t.animals[animal.species]}
                          {animal.name ? ` — ${animal.name}` : ''}
                        </div>
                        <div className="text-xs text-[#546357] mt-0.5 tabular-nums">
                          ({animal.position_x.toFixed(1)}, {animal.position_z.toFixed(1)})
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteAnimal(animal.id)}
                        aria-label={`${t.admin.deleteBtn} ${t.animals[animal.species]} #${animal.id}`}
                        className="p-2 rounded-lg text-[#9A3412] hover:bg-[#9A3412]/10 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : tab === 'contributions' ? (
          <div className="space-y-8">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold">
                {t.admin.contributionsHeading}
              </h1>
              <p className="text-sm text-[#435046] mt-1">{t.admin.contributionsSubtitle}</p>
            </div>

            {/* Pending Review */}
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">
                {t.admin.contributionsPanel.pendingTitle} ({pendingContributions.length})
              </h2>
              {pendingContributions.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#FBF9F5] border border-dashed border-[#1C241E]/15 text-sm text-[#546357]">
                  {t.admin.contributionsPanel.emptyPending}
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingContributions.map((item) => {
                    const kindText =
                      item.kind === 'stone'
                        ? t.admin.contributionsPanel.typeStone
                        : `${t.admin.contributionsPanel.typeAnimal} · ${t.animals[item.animal_species ?? 'rabbit']}`;
                    return (
                      <div
                        key={item.id}
                        className="p-4 sm:p-5 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/12 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-medium px-2 py-0.5 rounded bg-[#EAE6DC] text-[#214029]">
                              {kindText}
                            </span>
                            <span className="font-semibold text-sm text-[#1C241E]">
                              {item.visitor_name}
                            </span>
                            <span className="text-[#546357]">
                              {formatLocalizedDate(item.created_at, lang)}
                            </span>
                          </div>
                          <p className="text-sm text-[#3D4A3F] leading-relaxed break-words">
                            {item.comment || t.admin.contributionsPanel.noComment}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleApproveContribution(item.id)}
                            aria-label={`${t.admin.contributionsPanel.approveBtn} ${item.visitor_name} #${item.id}`}
                            className="h-9 px-3.5 rounded-lg bg-[#214029] hover:bg-[#19321F] text-[#F7F4EE] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t.admin.contributionsPanel.approveBtn}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDisapproveContribution(item.id)}
                            aria-label={`${t.admin.contributionsPanel.disapproveBtn} ${item.visitor_name} #${item.id}`}
                            className="h-9 px-3.5 rounded-lg bg-[#9A3412]/10 hover:bg-[#9A3412]/20 text-[#9A3412] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t.admin.contributionsPanel.disapproveBtn}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Approved on Forest */}
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">
                {t.admin.contributionsPanel.approvedTitle} ({approvedContributions.length})
              </h2>
              {approvedContributions.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#FBF9F5] border border-dashed border-[#1C241E]/15 text-sm text-[#546357]">
                  {t.admin.contributionsPanel.emptyApproved}
                </div>
              ) : (
                <div className="space-y-3">
                  {approvedContributions.map((item) => {
                    const kindText =
                      item.kind === 'stone'
                        ? t.admin.contributionsPanel.typeStone
                        : `${t.admin.contributionsPanel.typeAnimal} · ${t.animals[item.animal_species ?? 'rabbit']}`;
                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-medium px-2 py-0.5 rounded bg-[#214029]/10 text-[#214029]">
                              {kindText}
                            </span>
                            <span className="font-semibold text-sm text-[#1C241E]">
                              {item.visitor_name}
                            </span>
                            <span className="text-[#546357] tabular-nums">
                              ({item.position_x.toFixed(1)}, {item.position_z.toFixed(1)})
                            </span>
                          </div>
                          <p className="text-sm text-[#3D4A3F] leading-relaxed break-words">
                            {item.comment || t.admin.contributionsPanel.noComment}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDisapproveContribution(item.id)}
                          aria-label={`${t.admin.contributionsPanel.removeApprovedBtn} ${item.visitor_name} #${item.id}`}
                          className="h-9 px-3 rounded-lg bg-[#9A3412]/10 hover:bg-[#9A3412]/20 text-[#9A3412] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t.admin.contributionsPanel.removeApprovedBtn}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : tab === 'security' ? (
          <div className="space-y-6 max-w-xl">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold flex items-center gap-2.5">
                <ShieldCheck className="w-6 h-6 text-[#214029]" aria-hidden="true" />
                <span>{t.admin.securityHeading}</span>
              </h1>
              <p className="text-sm text-[#435046] mt-1.5">{t.admin.securitySubtitle}</p>
            </div>

            <form
              onSubmit={handleChangeCredentials}
              className="p-6 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/12 space-y-4"
            >
              <h2 className="font-display text-lg font-semibold">
                {t.admin.settings.credentialsSection}
              </h2>
              <div>
                <label htmlFor="sec-current-pass" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                  {t.auth.currentPasswordLabel}
                </label>
                <input
                  id="sec-current-pass"
                  type="password"
                  required
                  value={credCurrent}
                  onChange={(e) => setCredCurrent(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                />
              </div>
              <div>
                <label htmlFor="sec-new-username" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                  {t.auth.newUsernameLabel}
                </label>
                <input
                  id="sec-new-username"
                  type="text"
                  required
                  minLength={3}
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                />
              </div>
              <div>
                <label htmlFor="sec-new-pass" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                  {t.auth.newPasswordLabel}
                </label>
                <input
                  id="sec-new-pass"
                  type="password"
                  required
                  minLength={8}
                  value={credNewPass}
                  onChange={(e) => setCredNewPass(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                />
              </div>
              <div>
                <label htmlFor="sec-confirm-pass" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                  {t.auth.confirmPasswordLabel}
                </label>
                <input
                  id="sec-confirm-pass"
                  type="password"
                  required
                  minLength={8}
                  value={credConfirm}
                  onChange={(e) => setCredConfirm(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-[#214029] text-[#F7F4EE] text-xs font-medium hover:bg-[#19321F] cursor-pointer"
              >
                {t.common.save}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-8">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold">
              {t.admin.settingsHeading}
            </h1>

            {settings && (
              <form
                onSubmit={handleSaveSettings}
                className="p-6 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/12 space-y-6"
              >
                {/* Platform Branding / Page Name */}
                <h2 className="font-display text-lg font-semibold">
                  {t.admin.settings.brandingSection}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="blog-name-uz" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                      {t.admin.settings.blogNameUz}
                    </label>
                    <input
                      id="blog-name-uz"
                      required
                      value={settings.blog_name_uz}
                      onChange={(e) =>
                        setSettings({ ...settings, blog_name_uz: e.target.value })
                      }
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="blog-name-en" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                      {t.admin.settings.blogNameEn}
                    </label>
                    <input
                      id="blog-name-en"
                      required
                      value={settings.blog_name_en}
                      onChange={(e) =>
                        setSettings({ ...settings, blog_name_en: e.target.value })
                      }
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="tagline-uz" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                      {t.admin.settings.taglineUz}
                    </label>
                    <input
                      id="tagline-uz"
                      value={settings.tagline_uz}
                      onChange={(e) =>
                        setSettings({ ...settings, tagline_uz: e.target.value })
                      }
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="tagline-en" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                      {t.admin.settings.taglineEn}
                    </label>
                    <input
                      id="tagline-en"
                      value={settings.tagline_en}
                      onChange={(e) =>
                        setSettings({ ...settings, tagline_en: e.target.value })
                      }
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                    />
                  </div>
                </div>

                {/* Environment Section */}
                <h2 className="font-display text-lg font-semibold pt-4 border-t border-[#1C241E]/10">
                  {t.admin.settings.environmentSection}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-center">
                  <div>
                    <label htmlFor="default-season" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                      {t.admin.settings.defaultSeason}
                    </label>
                    <select
                      id="default-season"
                      value={settings.default_season}
                      onChange={(e) =>
                        setSettings({ ...settings, default_season: e.target.value as SeasonMode })
                      }
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                    >
                      <option value="spring">{t.forest.seasons.spring}</option>
                      <option value="summer">{t.forest.seasons.summer}</option>
                      <option value="autumn">{t.forest.seasons.autumn}</option>
                      <option value="winter">{t.forest.seasons.winter}</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="settings-grass-count" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                      {t.admin.settings.grassCount} (0–2500)
                    </label>
                    <input
                      id="settings-grass-count"
                      type="number"
                      min={0}
                      max={2500}
                      step={25}
                      value={settings.grass_count}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          grass_count: Math.min(2500, Math.max(0, Math.round(Number(e.target.value) || 0))),
                        })
                      }
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm tabular-nums"
                    />
                  </div>

                  <div>
                    <label htmlFor="settings-stone-count" className="block text-xs font-medium text-[#3D4A3F] mb-1">
                      {t.admin.settings.stoneCount} (0–100)
                    </label>
                    <input
                      id="settings-stone-count"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={settings.stone_count}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          stone_count: Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))),
                        })
                      }
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm tabular-nums"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs font-medium text-[#1C241E] pt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.show_tree_titles}
                      onChange={(e) =>
                        setSettings({ ...settings, show_tree_titles: e.target.checked })
                      }
                    />
                    <span>{t.admin.settings.showTreeTitles}</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-[#1C241E] pt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.reduced_effects_default}
                      onChange={(e) =>
                        setSettings({ ...settings, reduced_effects_default: e.target.checked })
                      }
                    />
                    <span>{t.admin.settings.reducedEffectsDefault}</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-[#1C241E] pt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.intro_animation}
                      onChange={(e) =>
                        setSettings({ ...settings, intro_animation: e.target.checked })
                      }
                    />
                    <span>{t.admin.settings.introAnimation}</span>
                  </label>
                </div>

                <p className="text-xs text-[#546357] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#214029]" aria-hidden="true" />
                  <span>
                    {t.admin.settings.tashkentTimeNote} ({tashkentClock} · {t.forest.times[tashkentTime]})
                  </span>
                </p>

                {/* Wooden House About Section */}
                <h2 className="font-display text-lg font-semibold pt-4 border-t border-[#1C241E]/10">
                  {t.admin.settings.aboutSection}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#3D4A3F] mb-1">
                      {t.admin.settings.aboutTitleUz}
                    </label>
                    <input
                      value={settings.about_title_uz}
                      onChange={(e) =>
                        setSettings({ ...settings, about_title_uz: e.target.value })
                      }
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D4A3F] mb-1">
                      {t.admin.settings.aboutTitleEn}
                    </label>
                    <input
                      value={settings.about_title_en}
                      onChange={(e) =>
                        setSettings({ ...settings, about_title_en: e.target.value })
                      }
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D4A3F] mb-1">
                      {t.admin.settings.aboutBodyUz}
                    </label>
                    <textarea
                      rows={7}
                      value={settings.about_body_uz}
                      onChange={(e) =>
                        setSettings({ ...settings, about_body_uz: e.target.value })
                      }
                      className="w-full p-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D4A3F] mb-1">
                      {t.admin.settings.aboutBodyEn}
                    </label>
                    <textarea
                      rows={7}
                      value={settings.about_body_en}
                      onChange={(e) =>
                        setSettings({ ...settings, about_body_en: e.target.value })
                      }
                      className="w-full p-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-[#214029] text-[#F7F4EE] text-sm font-medium hover:bg-[#19321F] cursor-pointer"
                >
                  {t.admin.settings.saveSettings}
                </button>
              </form>
            )}

            {/* Backup & Export Section */}
            <div className="p-6 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/12 space-y-5 max-w-xl">
              <h2 className="font-display text-lg font-semibold">
                {t.admin.settings.backupSection}
              </h2>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadProtectedFile('/api/admin/export/json', 'growing-forest-export.json')
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#EAE6DC] hover:bg-[#DFDBD0] text-xs font-medium text-[#1C241E] cursor-pointer text-left"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t.admin.settings.exportJson}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadProtectedFile(
                      '/api/admin/export/markdown',
                      'growing-forest-articles.md',
                    )
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#EAE6DC] hover:bg-[#DFDBD0] text-xs font-medium text-[#1C241E] cursor-pointer text-left"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t.admin.settings.exportMarkdown}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadProtectedFile('/api/admin/backup/db', 'growing-forest-backup.db')
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#EAE6DC] hover:bg-[#DFDBD0] text-xs font-medium text-[#1C241E] cursor-pointer text-left"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t.admin.settings.downloadSqlite}</span>
                </button>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#EAE6DC] hover:bg-[#DFDBD0] text-xs font-medium text-[#1C241E] cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{t.admin.settings.restoreSqlite}</span>
                  <input
                    type="file"
                    accept=".db,.sqlite,.sqlite3"
                    onChange={handleRestoreDb}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.admin.confirmDeleteTitle}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141A15]/60"
        >
          <div className="w-full max-w-md rounded-xl bg-[#FBF9F5] border border-[#1C241E]/15 p-6 shadow-xl">
            <h2 className="font-display text-xl font-semibold text-[#1C241E] mb-2">
              {t.admin.confirmDeleteTitle}
            </h2>
            <p className="text-sm text-[#435046] leading-relaxed mb-6">
              {t.admin.confirmDeletePost}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg bg-[#EAE6DC] text-xs font-medium text-[#1C241E] cursor-pointer"
              >
                {t.admin.cancelBtn}
              </button>
              <button
                type="button"
                onClick={handleDeletePost}
                className="px-4 py-2 rounded-lg bg-[#9A3412] text-white text-xs font-medium hover:bg-[#7C2D12] cursor-pointer"
              >
                {t.admin.confirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
