import { ArrowLeft, Check, Share2, TreeDeciduous } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FooterLoginLink } from '../components/FooterLoginLink';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { computeGrowthMetrics } from '../forest/growth';
import { buildLocalizedPath, formatLocalizedDate, getDictionary } from '../i18n';
import type { LanguageCode, PostSummary } from '../types';

interface PostPageProps {
  lang: LanguageCode;
  slug: string;
  siteName?: string;
  onNavigate: (path: string, focusPostId?: number) => void;
  onSyncAlternateSlugs: (slugs: Partial<Record<LanguageCode, string>> | null) => void;
}

interface PostLookupResponse {
  post: PostSummary;
  requestedLang: LanguageCode;
  availableLangs: LanguageCode[];
  missingRequestedLang: boolean;
  related: PostSummary[];
}

export function PostPage({ lang, slug, siteName, onNavigate, onSyncAlternateSlugs }: PostPageProps) {
  const t = getDictionary(lang);
  const [data, setData] = useState<PostLookupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);

    fetch(`/api/posts/${encodeURIComponent(slug)}?lang=${lang}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Not found');
        }
        return (await res.json()) as PostLookupResponse;
      })
      .then((json) => {
        if (!active) return;
        setData(json);
        const altSlugs: Partial<Record<LanguageCode, string>> = {};
        if (json.post.translations.uz?.translation_status === 'published') {
          altSlugs.uz = json.post.translations.uz.slug;
        }
        if (json.post.translations.en?.translation_status === 'published') {
          altSlugs.en = json.post.translations.en.slug;
        }
        onSyncAlternateSlugs(altSlugs);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setNotFound(true);
        onSyncAlternateSlugs(null);
        setLoading(false);
      });

    return () => {
      active = false;
      onSyncAlternateSlugs(null);
    };
  }, [slug, lang]);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setScrollProgress(max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F7F4EE] pt-28 pb-20 px-4">
        <div className="max-w-2xl mx-auto text-center text-sm text-[#546357]">{t.common.loading}</div>
      </main>
    );
  }

  if (notFound || !data) {
    return (
      <main className="min-h-screen bg-[#F7F4EE] pt-28 pb-20 px-4">
        <div className="max-w-xl mx-auto text-center">
          <h1 className="font-display text-3xl font-semibold text-[#1C241E] mb-3">
            {t.post.notFoundTitle}
          </h1>
          <p className="text-base text-[#435046] mb-6">{t.post.notFoundBody}</p>
          <a
            href={buildLocalizedPath(lang, '/')}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(buildLocalizedPath(lang, '/'));
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#214029] text-[#F7F4EE] text-sm font-medium hover:bg-[#19321F]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.nav.backToForest}</span>
          </a>
        </div>
      </main>
    );
  }

  const { post, missingRequestedLang, related } = data;
  const translation = post.translations[lang];
  const otherLang: LanguageCode = lang === 'uz' ? 'en' : 'uz';
  const otherTr = post.translations[otherLang];

  // Clear notice if article is not translated into the requested language
  if (missingRequestedLang || !translation) {
    return (
      <main className="min-h-screen bg-[#F7F4EE] pt-28 pb-20 px-4">
        <div className="max-w-xl mx-auto rounded-xl bg-[#FBF9F5] border border-[#1C241E]/12 p-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-[#1C241E] mb-3">
            {t.post.unavailableInLangTitle}
          </h1>
          <p className="text-base text-[#435046] leading-relaxed mb-6">
            {t.post.unavailableInLangBody}
          </p>
          {otherTr && (
            <div className="mb-6 p-4 rounded-lg bg-[#F1EEE6] text-left">
              <div className="text-xs text-[#546357] mb-1">
                {otherLang === 'uz' ? t.lang.uzLabel : t.lang.enLabel}
              </div>
              <div className="font-display text-lg font-medium text-[#1C241E]">{otherTr.title}</div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {otherTr && (
              <a
                href={buildLocalizedPath(otherLang, `/post/${otherTr.slug}`)}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(buildLocalizedPath(otherLang, `/post/${otherTr.slug}`));
                }}
                className="px-5 py-2.5 rounded-lg bg-[#214029] text-[#F7F4EE] text-sm font-medium hover:bg-[#19321F]"
              >
                {t.post.readInOtherLang}
              </a>
            )}
            <a
              href={buildLocalizedPath(lang, '/')}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(buildLocalizedPath(lang, '/'));
              }}
              className="px-5 py-2.5 rounded-lg bg-[#EAE6DC] text-[#1C241E] text-sm font-medium hover:bg-[#DFDBD0]"
            >
              {t.nav.backToForest}
            </a>
          </div>
        </div>
      </main>
    );
  }

  const pubDate = post.published_at ?? post.created_at;
  const growth = computeGrowthMetrics(pubDate);

  return (
    <main className="min-h-screen bg-[#F7F4EE] pt-14 pb-24">
      {/* Subtle top reading progress line */}
      <div
        className="fixed top-14 left-0 h-0.5 bg-[#214029] z-20 transition-[width] duration-75"
        style={{ width: `${scrollProgress}%` }}
      />

      <article className="max-w-2xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14">
        <div className="flex items-center justify-between gap-4 mb-8">
          <a
            href={buildLocalizedPath(lang, '/')}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(buildLocalizedPath(lang, '/'), post.id);
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#214029] hover:underline underline-offset-4"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>{t.nav.backToForest}</span>
          </a>

          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#435046] hover:text-[#1C241E] cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#214029]" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? t.post.linkCopied : t.post.shareLink}</span>
          </button>
        </div>

        {/* Unboxed editorial metadata line (zero pills) */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#546357] mb-3">
          {post.categories.map((c, idx) => (
            <span key={c.id}>
              {idx > 0 && <span className="mr-2">/</span>}
              {c.translations[lang]?.name || c.translations.uz.name}
            </span>
          ))}
          {post.categories.length > 0 && <span aria-hidden="true">·</span>}
          <span>{formatLocalizedDate(pubDate, lang)}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {translation.reading_time} {t.post.readingTimeUnit}
          </span>
        </div>

        <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-semibold text-[#1C241E] leading-[1.18] tracking-tight mb-4 [text-wrap:balance]">
          {translation.title}
        </h1>

        {translation.subtitle && (
          <p className="text-lg sm:text-xl text-[#435046] leading-relaxed mb-6">
            {translation.subtitle}
          </p>
        )}

        {/* Tree linkage metadata */}
        {post.tree && (
          <div className="flex flex-wrap items-center justify-between gap-3 py-3.5 border-y border-[#1C241E]/12 text-xs text-[#546357] mb-8">
            <div className="flex items-center gap-2">
              <TreeDeciduous className="w-4 h-4 text-[#214029]" aria-hidden="true" />
              <span>
                {t.post.treeSpeciesLabel}:{' '}
                <strong className="font-medium text-[#1C241E]">
                  {t.species[post.tree.species]}
                </strong>{' '}
                ({t.growth[growth.stage]})
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(buildLocalizedPath(lang, '/'), post.id)}
              className="font-medium text-[#214029] hover:underline underline-offset-4 cursor-pointer"
            >
              {t.post.findInForest}
            </button>
          </div>
        )}

        {post.cover_image && (
          <figure className="mb-10">
            <img
              src={post.cover_image}
              alt={translation.title}
              referrerPolicy="no-referrer"
              className="w-full max-h-[440px] object-cover rounded-xl border border-[#1C241E]/10"
            />
          </figure>
        )}

        <MarkdownRenderer content={translation.content} dropCap />

        {post.tags.length > 0 && (
          <div className="mt-12 pt-6 border-t border-[#1C241E]/12 flex flex-wrap items-center gap-2 text-xs text-[#546357]">
            <span className="font-medium text-[#1C241E]">{t.post.tagsLabel}:</span>
            {post.tags.map((tag, idx) => (
              <span key={tag.id}>
                {idx > 0 && <span className="mr-2 text-[#9AA69C]">·</span>}
                #{tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Related articles */}
        {related.length > 0 && (
          <section className="mt-16 pt-10 border-t border-[#1C241E]/15">
            <h2 className="font-display text-xl font-semibold text-[#1C241E] mb-6">
              {t.post.relatedTitle}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {related.map((rel) => {
                const relTr = rel.translations[lang] || rel.translations.uz || rel.translations.en;
                const relLang: LanguageCode = rel.translations[lang]
                  ? lang
                  : rel.translations.uz
                    ? 'uz'
                    : 'en';
                if (!relTr) return null;
                return (
                  <a
                    key={rel.id}
                    href={buildLocalizedPath(relLang, `/post/${relTr.slug}`)}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(buildLocalizedPath(relLang, `/post/${relTr.slug}`));
                    }}
                    className="group block"
                  >
                    <div className="text-xs text-[#546357] mb-1">
                      {formatLocalizedDate(rel.published_at ?? rel.created_at, lang)}
                    </div>
                    <h3 className="font-display text-base font-medium text-[#1C241E] group-hover:text-[#214029] leading-snug">
                      {relTr.title}
                    </h3>
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </article>
      <FooterLoginLink lang={lang} siteName={siteName} onNavigate={onNavigate} />
    </main>
  );
}
