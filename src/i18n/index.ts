import type { LanguageCode } from '../types';
import { en } from './en';
import { uz } from './uz';

export type Dictionary = typeof uz;

const STORAGE_KEY = 'growing_forest_lang';

export const dictionaries: Record<LanguageCode, Dictionary> = {
  uz,
  en: en as unknown as Dictionary,
};

export function getDictionary(lang: LanguageCode): Dictionary {
  return dictionaries[lang] ?? dictionaries.uz;
}

/**
 * Resolves initial language strictly per spec:
 * 1. Explicit URL prefix (/uz/... or /en/...)
 * 2. Saved localStorage preference ('uz' | 'en')
 * 3. Default to 'uz' (never auto-switch based on browser navigator.language!)
 */
export function resolveInitialLanguage(pathname: string, stored?: string | null): LanguageCode {
  if (pathname === '/en' || pathname.startsWith('/en/')) return 'en';
  if (pathname === '/uz' || pathname.startsWith('/uz/')) return 'uz';
  if (stored === 'en') return 'en';
  if (stored === 'uz') return 'uz';
  return 'uz';
}

export function getStoredLanguage(): LanguageCode | null {
  try {
    const val = window.localStorage.getItem(STORAGE_KEY);
    if (val === 'uz' || val === 'en') return val;
  } catch {
    // ignore storage failures
  }
  return null;
}

export function setStoredLanguage(lang: LanguageCode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore storage failures
  }
}

export function stripLangPrefix(pathname: string): string {
  if (pathname === '/uz' || pathname === '/en') return '/';
  if (pathname.startsWith('/uz/')) return pathname.slice(3) || '/';
  if (pathname.startsWith('/en/')) return pathname.slice(3) || '/';
  return pathname || '/';
}

export function buildLocalizedPath(lang: LanguageCode, subPath: string): string {
  const clean = subPath.startsWith('/') ? subPath : `/${subPath}`;
  if (clean === '/') return `/${lang}/`;
  return `/${lang}${clean}`;
}

export function isAdminOrAuthPath(pathname: string): boolean {
  const bare = stripLangPrefix(pathname);
  return bare === '/login' || bare === '/admin' || bare.startsWith('/admin/');
}

const UZ_MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatLocalizedDate(isoDate: string | null | undefined, lang: LanguageCode): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getUTCDate();
  const monthIdx = date.getUTCMonth();
  const year = date.getUTCFullYear();
  if (lang === 'uz') {
    return `${year}-yil ${day}-${UZ_MONTHS[monthIdx]}`;
  }
  return `${EN_MONTHS[monthIdx]} ${day}, ${year}`;
}
