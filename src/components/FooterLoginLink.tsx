import { getDictionary } from '../i18n';
import type { LanguageCode } from '../types';

interface FooterLoginLinkProps {
  lang: LanguageCode;
  siteName?: string;
  floating?: boolean;
  onNavigate: (path: string) => void;
}

export function FooterLoginLink({
  lang,
  siteName,
  floating = false,
  onNavigate,
}: FooterLoginLinkProps) {
  const t = getDictionary(lang);
  const label = siteName || t.meta.siteName;

  if (floating) {
    return (
      <footer className="fixed bottom-1.5 right-2.5 z-20 pointer-events-auto">
        <a
          href="/login"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/login');
          }}
          aria-label={t.nav.admin}
          className="text-[11px] text-[#1C241E]/20 hover:text-[#1C241E]/75 focus-visible:text-[#1C241E] transition-opacity px-1.5 py-0.5 rounded"
        >
          {t.nav.admin}
        </a>
      </footer>
    );
  }

  return (
    <footer className="max-w-4xl mx-auto px-4 sm:px-6 pt-12 pb-6 mt-12 border-t border-[#1C241E]/10 flex items-center justify-between text-xs text-[#546357]">
      <span>{label}</span>
      <a
        href="/login"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('/login');
        }}
        aria-label={t.nav.admin}
        className="text-[11px] text-[#1C241E]/20 hover:text-[#1C241E]/75 focus-visible:text-[#1C241E] transition-colors px-1.5 py-0.5 rounded"
      >
        {t.nav.admin}
      </a>
    </footer>
  );
}
