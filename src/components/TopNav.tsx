import { Menu, Search, X } from 'lucide-react';
import { useState } from 'react';
import { buildLocalizedPath, getDictionary } from '../i18n';
import type { LanguageCode } from '../types';

interface TopNavProps {
  lang: LanguageCode;
  currentSubPath: string;
  siteName?: string;
  overCanvas?: boolean;
  onNavigate: (path: string) => void;
  onSwitchLanguage: (nextLang: LanguageCode) => void;
  onOpenSearch?: () => void;
}

export function TopNav({
  lang,
  currentSubPath,
  siteName,
  overCanvas = false,
  onNavigate,
  onSwitchLanguage,
  onOpenSearch,
}: TopNavProps) {
  const t = getDictionary(lang);
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName = siteName?.trim() || t.meta.siteName;

  const navItems = [
    { label: t.nav.archive, path: buildLocalizedPath(lang, '/archive'), active: currentSubPath === '/archive' },
  ];

  const handleNav = (path: string) => {
    setMobileOpen(false);
    onNavigate(path);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-30 transition-colors ${
        overCanvas
          ? 'bg-[#F7F4EE]/92 border-b border-[#1C241E]/10'
          : 'bg-[#F7F4EE] border-b border-[#1C241E]/10'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single-line Editable Platform Wordmark */}
        <a
          href={buildLocalizedPath(lang, '/')}
          onClick={(e) => {
            e.preventDefault();
            handleNav(buildLocalizedPath(lang, '/'));
          }}
          className="font-display text-lg sm:text-xl font-semibold tracking-tight text-[#1C241E] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#2F5233] rounded"
        >
          {displayName}
        </a>

        {/* Zone 2: Simplified single-line desktop navigation (Forest Archive + Search) */}
        <nav
          aria-label={t.nav.forest}
          className="hidden md:flex items-center gap-6 text-sm font-medium text-[#3D4A3F]"
        >
          {navItems.map((item) => (
            <a
              key={item.path}
              href={item.path}
              onClick={(e) => {
                e.preventDefault();
                handleNav(item.path);
              }}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-2 focus-visible:outline-[#2F5233] ${
                item.active
                  ? 'border-[#2F5233] text-[#1C241E]'
                  : 'border-transparent hover:text-[#1C241E] hover:border-[#2F5233]/35'
              }`}
            >
              {item.label}
            </a>
          ))}
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 py-1 text-sm font-medium text-[#3D4A3F] hover:text-[#1C241E] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#2F5233] rounded"
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.nav.search}</span>
            </button>
          )}
        </nav>

        {/* Zone 3: Language Switcher + Mobile Menu Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label={t.lang.switchAria}
            className="inline-flex items-center rounded-lg bg-[#EAE6DC] p-0.5 border border-[#1C241E]/10"
          >
            <button
              type="button"
              onClick={() => onSwitchLanguage('uz')}
              aria-pressed={lang === 'uz'}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#2F5233] ${
                lang === 'uz'
                  ? 'bg-[#214029] text-[#F7F4EE]'
                  : 'text-[#3D4A3F] hover:text-[#1C241E]'
              }`}
            >
              {t.lang.uzLabel}
            </button>
            <button
              type="button"
              onClick={() => onSwitchLanguage('en')}
              aria-pressed={lang === 'en'}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#2F5233] ${
                lang === 'en'
                  ? 'bg-[#214029] text-[#F7F4EE]'
                  : 'text-[#3D4A3F] hover:text-[#1C241E]'
              }`}
            >
              {t.lang.enLabel}
            </button>
          </div>

          <button
            type="button"
            aria-label={mobileOpen ? t.nav.closeMenu : t.nav.menu}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-[#1C241E] hover:bg-[#EAE6DC] transition-colors cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Compact Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#1C241E]/10 bg-[#F7F4EE] px-4 py-3 flex flex-col gap-1">
          <a
            href={buildLocalizedPath(lang, '/')}
            onClick={(e) => {
              e.preventDefault();
              handleNav(buildLocalizedPath(lang, '/'));
            }}
            className="px-3 py-2.5 rounded-lg text-sm font-medium text-[#1C241E] hover:bg-[#EAE6DC]"
          >
            {t.nav.forest}
          </a>
          {navItems.map((item) => (
            <a
              key={item.path}
              href={item.path}
              onClick={(e) => {
                e.preventDefault();
                handleNav(item.path);
              }}
              className="px-3 py-2.5 rounded-lg text-sm font-medium text-[#1C241E] hover:bg-[#EAE6DC]"
            >
              {item.label}
            </a>
          ))}
          {onOpenSearch && (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenSearch();
              }}
              className="text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#1C241E] hover:bg-[#EAE6DC] flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              <span>{t.nav.search}</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}
