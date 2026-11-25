import { useCallback, useEffect, useState } from 'react';
import { SearchModal } from './components/SearchModal';
import { TopNav } from './components/TopNav';
import {
  buildLocalizedPath,
  getDictionary,
  getStoredLanguage,
  isAdminOrAuthPath,
  resolveInitialLanguage,
  setStoredLanguage,
  stripLangPrefix,
} from './i18n';
import { AdminDashboard } from './pages/AdminDashboard';
import { ArchivePage } from './pages/ArchivePage';
import { ForestPage } from './pages/ForestPage';
import { LoginPage } from './pages/LoginPage';
import { PostPage } from './pages/PostPage';
import type {
  AdminUser,
  AnimalRecord,
  CategoryRecord,
  ForestStats,
  ForestTreeItem,
  LanguageCode,
  SiteSettings,
  VisitorContributionRecord,
} from './types';
import { adminFetch, clearAuthToken } from './utils/authClient';

function normalizeInitialUrl(): { pathname: string; lang: LanguageCode } {
  const rawPath = window.location.pathname;
  const stored = getStoredLanguage();
  const lang = resolveInitialLanguage(rawPath, stored);

  if (!isAdminOrAuthPath(rawPath) && !rawPath.startsWith('/uz') && !rawPath.startsWith('/en')) {
    const localized = buildLocalizedPath(lang, rawPath);
    const nextUrl = localized + window.location.search;
    window.history.replaceState(null, '', nextUrl);
    return { pathname: localized, lang };
  }

  return { pathname: rawPath, lang };
}

export default function App() {
  const initial = normalizeInitialUrl();
  const [pathname, setPathname] = useState<string>(initial.pathname);
  const [searchQuery, setSearchQuery] = useState<string>(window.location.search);
  const [lang, setLang] = useState<LanguageCode>(initial.lang);

  const [trees, setTrees] = useState<ForestTreeItem[]>([]);
  const [animals, setAnimals] = useState<AnimalRecord[]>([]);
  const [contributions, setContributions] = useState<VisitorContributionRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [stats, setStats] = useState<ForestStats | null>(null);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [forestLoading, setForestLoading] = useState(true);

  const [focusPostId, setFocusPostId] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [alternateSlugs, setAlternateSlugs] = useState<Partial<Record<LanguageCode, string>> | null>(
    null,
  );

  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const loadForestData = useCallback(async () => {
    try {
      const res = await fetch('/api/forest');
      if (!res.ok) return;
      const data = await res.json();
      setTrees(data.trees ?? []);
      setAnimals(data.animals ?? []);
      setContributions(data.contributions ?? []);
      setCategories(data.categories ?? []);
      setStats(data.stats ?? null);
      setSettings(data.settings ?? null);
    } finally {
      setForestLoading(false);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await adminFetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated && data.user) {
        setAdminUser(data.user);
      } else {
        clearAuthToken();
        setAdminUser(null);
      }
    } catch {
      setAdminUser(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    loadForestData();
    checkAuth();
  }, [loadForestData, checkAuth]);

  useEffect(() => {
    const onPopState = () => {
      const p = window.location.pathname;
      setPathname(p);
      setSearchQuery(window.location.search);
      if (p === '/en' || p.startsWith('/en/')) setLang('en');
      else if (p === '/uz' || p.startsWith('/uz/')) setLang('uz');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const dynamicSiteName =
    (lang === 'uz' ? settings?.blog_name_uz : settings?.blog_name_en)?.trim() ||
    getDictionary(lang).meta.siteName;

  // Update <html lang> & document title on route/language/settings changes
  useEffect(() => {
    document.documentElement.lang = lang;
    const t = getDictionary(lang);
    const bare = stripLangPrefix(pathname);
    if (bare === '/archive') {
      document.title = `${t.archive.title} — ${dynamicSiteName}`;
    } else if (bare === '/login') {
      document.title = `${t.auth.loginTitle} — ${dynamicSiteName}`;
    } else if (bare.startsWith('/admin')) {
      document.title = `${t.admin.title} — ${dynamicSiteName}`;
    } else if (!bare.startsWith('/post/')) {
      document.title = `${dynamicSiteName} — ${t.meta.authorName}`;
    }
  }, [lang, pathname, dynamicSiteName]);

  const navigate = useCallback((nextPath: string, nextFocusPostId?: number) => {
    const [pathOnly, qs] = nextPath.split('?');
    const fullUrl = qs ? `${pathOnly}?${qs}` : pathOnly;
    window.history.pushState(null, '', fullUrl);
    setPathname(pathOnly);
    setSearchQuery(qs ? `?${qs}` : '');
    if (typeof nextFocusPostId === 'number') {
      setFocusPostId(nextFocusPostId);
    } else {
      setFocusPostId(null);
    }
    if (pathOnly === '/en' || pathOnly.startsWith('/en/')) setLang('en');
    else if (pathOnly === '/uz' || pathOnly.startsWith('/uz/')) setLang('uz');
    window.scrollTo({ top: 0 });
  }, []);

  const handleSwitchLanguage = useCallback(
    (nextLang: LanguageCode) => {
      if (nextLang === lang) return;
      setStoredLanguage(nextLang);
      setLang(nextLang);

      if (isAdminOrAuthPath(pathname)) {
        return;
      }

      const bare = stripLangPrefix(pathname);
      if (bare.startsWith('/post/') && alternateSlugs) {
        const targetSlug = alternateSlugs[nextLang] || bare.slice('/post/'.length);
        const nextUrl = buildLocalizedPath(nextLang, `/post/${targetSlug}`);
        window.history.replaceState(null, '', nextUrl);
        setPathname(nextUrl);
        return;
      }

      const nextUrl = buildLocalizedPath(nextLang, bare) + searchQuery;
      window.history.replaceState(null, '', nextUrl);
      setPathname(buildLocalizedPath(nextLang, bare));
    },
    [lang, pathname, searchQuery, alternateSlugs],
  );

  const barePath = stripLangPrefix(pathname);
  const urlParams = new URLSearchParams(searchQuery);

  // Admin & Login Routes
  if (barePath === '/login') {
    return (
      <>
        <TopNav
          lang={lang}
          currentSubPath={barePath}
          siteName={dynamicSiteName}
          onNavigate={(p) => navigate(p)}
          onSwitchLanguage={handleSwitchLanguage}
        />
        <LoginPage
          lang={lang}
          onAuthenticated={(u) => setAdminUser(u)}
          onNavigate={(p) => navigate(p)}
        />
      </>
    );
  }

  if (barePath === '/admin' || barePath.startsWith('/admin/')) {
    if (!authChecked) {
      return (
        <div className="min-h-screen bg-[#F7F4EE] flex items-center justify-center text-sm text-[#546357]">
          {getDictionary(lang).common.loading}
        </div>
      );
    }
    if (!adminUser) {
      return (
        <>
          <TopNav
            lang={lang}
            currentSubPath="/login"
            siteName={dynamicSiteName}
            onNavigate={(p) => navigate(p)}
            onSwitchLanguage={handleSwitchLanguage}
          />
          <LoginPage
            lang={lang}
            onAuthenticated={(u) => setAdminUser(u)}
            onNavigate={(p) => navigate(p)}
          />
        </>
      );
    }

    let initialTab:
      | 'overview'
      | 'posts'
      | 'editor'
      | 'categories'
      | 'animals'
      | 'contributions'
      | 'settings'
      | 'security' = 'overview';
    let editId: number | null = null;
    if (barePath === '/admin/posts') initialTab = 'posts';
    else if (barePath === '/admin/posts/new') initialTab = 'editor';
    else if (barePath === '/admin/animals') initialTab = 'animals';
    else if (barePath === '/admin/contributions') initialTab = 'contributions';
    else if (barePath === '/admin/settings') initialTab = 'settings';
    else if (barePath === '/admin/security') initialTab = 'security';
    else {
      const m = barePath.match(/^\/admin\/posts\/(\d+)\/edit$/);
      if (m) {
        initialTab = 'editor';
        editId = Number(m[1]);
      }
    }

    return (
      <AdminDashboard
        lang={lang}
        user={adminUser}
        initialTab={initialTab}
        editPostId={editId}
        onSwitchLanguage={handleSwitchLanguage}
        onUserUpdated={(u) => setAdminUser(u)}
        onDataMutated={loadForestData}
        onNavigate={(p) => navigate(p)}
      />
    );
  }

  const isForestView = barePath === '/' || barePath === '/about';
  const isArchiveView = barePath === '/archive' || barePath === '/categories';
  const postMatch = barePath.match(/^\/post\/([^/]+)$/);

  return (
    <>
      <TopNav
        lang={lang}
        currentSubPath={barePath}
        siteName={dynamicSiteName}
        overCanvas={isForestView}
        onNavigate={(p) => navigate(p)}
        onSwitchLanguage={handleSwitchLanguage}
        onOpenSearch={() => setSearchOpen(true)}
      />

      {postMatch ? (
        <PostPage
          lang={lang}
          slug={decodeURIComponent(postMatch[1])}
          siteName={dynamicSiteName}
          onNavigate={(p, focusId) => navigate(p, focusId)}
          onSyncAlternateSlugs={setAlternateSlugs}
        />
      ) : isArchiveView ? (
        <ArchivePage
          lang={lang}
          trees={trees}
          categories={categories}
          siteName={dynamicSiteName}
          initialCategorySlug={urlParams.get('category')}
          onNavigate={(p, focusId) => navigate(p, focusId)}
        />
      ) : (
        <ForestPage
          lang={lang}
          trees={trees}
          animals={animals}
          contributions={contributions}
          categories={categories}
          stats={stats}
          settings={settings}
          loading={forestLoading}
          initialFocusPostId={focusPostId}
          onNavigate={(p) => navigate(p)}
        />
      )}

      <SearchModal
        open={searchOpen}
        lang={lang}
        trees={trees}
        onClose={() => setSearchOpen(false)}
        onFocusTree={(id) => navigate(buildLocalizedPath(lang, '/'), id)}
        onReadArticle={(targetLang, slug) =>
          navigate(buildLocalizedPath(targetLang, `/post/${slug}`))
        }
      />
    </>
  );
}
