import { Eye, ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ALL_SPECIES } from '../forest/growth';
import { getDictionary } from '../i18n';
import type {
  CategoryRecord,
  LanguageCode,
  PostSummary,
  TranslationStatus,
  TreeSpecies,
} from '../types';
import { adminFetch } from '../utils/authClient';
import { MarkdownRenderer } from './MarkdownRenderer';

interface TranslationDraft {
  title: string;
  slug: string;
  subtitle: string;
  excerpt: string;
  content: string;
  seo_title: string;
  seo_description: string;
  translation_status: TranslationStatus;
}

function emptyDraft(): TranslationDraft {
  return {
    title: '',
    slug: '',
    subtitle: '',
    excerpt: '',
    content: '',
    seo_title: '',
    seo_description: '',
    translation_status: 'draft',
  };
}

function makeSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/o[‘ʻ'`’]/gi, 'o')
    .replace(/g[‘ʻ'`’]/gi, 'g')
    .replace(/[‘’'`ʻ]/g, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

interface AdminPostEditorProps {
  lang: LanguageCode;
  post: PostSummary | null;
  categories: CategoryRecord[];
  onSaved: () => void;
  onCancel: () => void;
}

export function AdminPostEditor({
  lang,
  post,
  categories,
  onSaved,
  onCancel,
}: AdminPostEditorProps) {
  const t = getDictionary(lang);
  const [activeTab, setActiveTab] = useState<LanguageCode>('uz');
  const [previewMode, setPreviewMode] = useState(false);

  const [uz, setUz] = useState<TranslationDraft>(() => {
    const existing = post?.translations.uz;
    return existing
      ? {
          title: existing.title,
          slug: existing.slug,
          subtitle: existing.subtitle,
          excerpt: existing.excerpt,
          content: existing.content,
          seo_title: existing.seo_title,
          seo_description: existing.seo_description,
          translation_status: existing.translation_status,
        }
      : emptyDraft();
  });

  const [en, setEn] = useState<TranslationDraft>(() => {
    const existing = post?.translations.en;
    return existing
      ? {
          title: existing.title,
          slug: existing.slug,
          subtitle: existing.subtitle,
          excerpt: existing.excerpt,
          content: existing.content,
          seo_title: existing.seo_title,
          seo_description: existing.seo_description,
          translation_status: existing.translation_status,
        }
      : emptyDraft();
  });

  const [species, setSpecies] = useState<TreeSpecies | 'auto'>(post?.tree?.species ?? 'auto');
  const [publishedAt, setPublishedAt] = useState<string>(() => {
    const d = post?.published_at ? new Date(post.published_at) : new Date();
    return d.toISOString().slice(0, 16);
  });
  const [selectedCatIds, setSelectedCatIds] = useState<number[]>(
    post?.categories.map((c) => c.id) ?? (categories[0] ? [categories[0].id] : []),
  );
  const [tagsInput, setTagsInput] = useState<string>(
    post?.tags.map((tg) => tg.name).join(', ') ?? '',
  );
  const [coverImage, setCoverImage] = useState<string | null>(post?.cover_image ?? null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autosaveTime, setAutosaveTime] = useState<string | null>(null);

  const autosaveKey = `gf_editor_autosave_${post?.id ?? 'new'}`;

  // Autosave draft locally every 3 seconds when typing
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(
          autosaveKey,
          JSON.stringify({ uz, en, species, publishedAt, selectedCatIds, tagsInput, coverImage }),
        );
        setAutosaveTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch {
        // ignore storage errors
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [uz, en, species, publishedAt, selectedCatIds, tagsInput, coverImage, autosaveKey]);

  const currentDraft = activeTab === 'uz' ? uz : en;
  const setCurrentDraft = activeTab === 'uz' ? setUz : setEn;

  const updateField = <K extends keyof TranslationDraft>(key: K, val: TranslationDraft[K]) => {
    setCurrentDraft((prev) => ({ ...prev, [key]: val }));
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('image', file);
    try {
      const res = await adminFetch('/api/admin/upload', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setCoverImage(data.url);
      } else {
        setError(data.error || t.common.error);
      }
    } catch {
      setError(t.common.error);
    }
  };

  const handleSubmit = async (publishActiveLang?: boolean) => {
    setError(null);

    const nextUz = { ...uz };
    const nextEn = { ...en };

    if (publishActiveLang === true) {
      if (activeTab === 'uz' && nextUz.title.trim()) nextUz.translation_status = 'published';
      if (activeTab === 'en' && nextEn.title.trim()) nextEn.translation_status = 'published';
      // Also if neither is explicitly published yet and user clicked Save & Publish, publish whichever has content
      if (
        nextUz.translation_status !== 'published' &&
        nextEn.translation_status !== 'published'
      ) {
        if (nextUz.title.trim()) nextUz.translation_status = 'published';
        if (nextEn.title.trim()) nextEn.translation_status = 'published';
      }
    } else if (publishActiveLang === false) {
      if (activeTab === 'uz') nextUz.translation_status = 'draft';
      if (activeTab === 'en') nextEn.translation_status = 'draft';
    }

    const hasUz = nextUz.title.trim().length > 0 || nextUz.content.trim().length > 0;
    const hasEn = nextEn.title.trim().length > 0 || nextEn.content.trim().length > 0;

    if (!hasUz && !hasEn) {
      setError(t.admin.editor.validationNeedOneLang);
      return;
    }

    if ((hasUz && !nextUz.title.trim()) || (hasEn && !nextEn.title.trim())) {
      setError(t.admin.editor.validationNeedTitleSlug);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        cover_image: coverImage,
        published_at: publishedAt ? new Date(publishedAt).toISOString() : null,
        species,
        category_ids: selectedCatIds,
        tags: tagsInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        translations: {
          ...(hasUz
            ? {
                uz: {
                  ...nextUz,
                  slug: nextUz.slug.trim() || makeSlug(nextUz.title),
                },
              }
            : {}),
          ...(hasEn
            ? {
                en: {
                  ...nextEn,
                  slug: nextEn.slug.trim() || makeSlug(nextEn.title),
                },
              }
            : {}),
        },
      };

      const url = post ? `/api/admin/posts/${post.id}` : '/api/admin/posts';
      const res = await adminFetch(url, {
        method: post ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t.common.error);
        setSaving(false);
        return;
      }

      try {
        window.localStorage.removeItem(autosaveKey);
      } catch {
        // ignore
      }
      onSaved();
    } catch {
      setError(t.common.error);
    } finally {
      setSaving(false);
    }
  };

  const getLangStatusText = (d: TranslationDraft) => {
    if (!d.title.trim() && !d.content.trim()) return t.admin.statusMissing;
    return d.translation_status === 'published' ? t.admin.statusPublished : t.admin.statusDraft;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#1C241E]">
            {post ? t.admin.editPostHeading : t.admin.newPostHeading}
          </h2>
          {autosaveTime && (
            <div className="text-xs text-[#546357] mt-1">
              {t.admin.editor.autosaveSaved}: {autosaveTime}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewMode((v) => !v)}
            className="h-9 px-3 rounded-lg bg-[#EAE6DC] text-xs font-medium text-[#1C241E] inline-flex items-center gap-1.5 hover:bg-[#DFDBD0] cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{t.admin.previewBtn}</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-3 rounded-lg bg-[#EAE6DC] text-xs font-medium text-[#1C241E] hover:bg-[#DFDBD0] cursor-pointer"
          >
            {t.admin.cancelBtn}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSubmit(false)}
            className="h-9 px-4 rounded-lg bg-[#D8D3C6] text-xs font-medium text-[#1C241E] hover:bg-[#CCC6B7] disabled:opacity-60 cursor-pointer"
          >
            {t.admin.saveDraftBtn}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSubmit(true)}
            className="h-9 px-4 rounded-lg bg-[#214029] text-xs font-medium text-[#F7F4EE] hover:bg-[#19321F] disabled:opacity-60 cursor-pointer"
          >
            {t.admin.saveAndPublishBtn}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-[#9A3412]/10 border border-[#9A3412]/25 text-sm text-[#7C2D12]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left 8 columns: Bilingual Content Editor */}
        <div className="lg:col-span-8 space-y-5">
          {/* Language Tabs with live translation status */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C241E]/12 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('uz')}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === 'uz'
                    ? 'bg-[#214029] text-[#F7F4EE]'
                    : 'bg-[#EAE6DC] text-[#1C241E]'
                }`}
              >
                {t.admin.editor.languageTabUz} · {getLangStatusText(uz)}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('en')}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === 'en'
                    ? 'bg-[#214029] text-[#F7F4EE]'
                    : 'bg-[#EAE6DC] text-[#1C241E]'
                }`}
              >
                {t.admin.editor.languageTabEn} · {getLangStatusText(en)}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="trans-status" className="text-xs text-[#546357]">
                {t.admin.editor.translationStatusLabel}:
              </label>
              <select
                id="trans-status"
                value={currentDraft.translation_status}
                onChange={(e) =>
                  updateField('translation_status', e.target.value as TranslationStatus)
                }
                className="h-8 px-2.5 rounded-lg bg-[#FBF9F5] border border-[#1C241E]/14 text-xs font-medium text-[#1C241E]"
              >
                <option value="draft">{t.admin.editor.draftTranslation}</option>
                <option value="published">{t.admin.editor.publishTranslation}</option>
              </select>
              {(currentDraft.title || currentDraft.content) && (
                <button
                  type="button"
                  onClick={() => setCurrentDraft(emptyDraft())}
                  aria-label={t.admin.editor.clearTranslation}
                  title={t.admin.editor.clearTranslation}
                  className="h-8 px-2 rounded-lg text-xs text-[#9A3412] hover:bg-[#9A3412]/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {previewMode ? (
            <div className="p-6 sm:p-8 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/12">
              <h1 className="font-display text-3xl font-semibold text-[#1C241E] mb-2">
                {currentDraft.title || '—'}
              </h1>
              {currentDraft.subtitle && (
                <p className="text-lg text-[#435046] mb-6">{currentDraft.subtitle}</p>
              )}
              <MarkdownRenderer content={currentDraft.content || ''} dropCap />
            </div>
          ) : (
            <div className="space-y-4 bg-[#FBF9F5] border border-[#1C241E]/12 rounded-xl p-5 sm:p-6">
              <div>
                <label htmlFor="post-title" className="block text-xs font-medium text-[#3D4A3F] mb-1.5">
                  {t.admin.editor.titleLabel} ({activeTab.toUpperCase()})
                </label>
                <input
                  id="post-title"
                  type="text"
                  value={currentDraft.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm text-[#1C241E]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="post-slug" className="text-xs font-medium text-[#3D4A3F]">
                    {t.admin.editor.slugLabel} ({activeTab.toUpperCase()})
                  </label>
                  <button
                    type="button"
                    onClick={() => updateField('slug', makeSlug(currentDraft.title))}
                    className="text-xs text-[#214029] hover:underline cursor-pointer"
                  >
                    {t.admin.editor.generateSlug}
                  </button>
                </div>
                <input
                  id="post-slug"
                  type="text"
                  value={currentDraft.slug}
                  onChange={(e) => updateField('slug', e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm font-mono text-[#1C241E]"
                />
              </div>

              <div>
                <label htmlFor="post-subtitle" className="block text-xs font-medium text-[#3D4A3F] mb-1.5">
                  {t.admin.editor.subtitleLabel}
                </label>
                <input
                  id="post-subtitle"
                  type="text"
                  value={currentDraft.subtitle}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm text-[#1C241E]"
                />
              </div>

              <div>
                <label htmlFor="post-excerpt" className="block text-xs font-medium text-[#3D4A3F] mb-1.5">
                  {t.admin.editor.excerptLabel}
                </label>
                <textarea
                  id="post-excerpt"
                  rows={2}
                  value={currentDraft.excerpt}
                  onChange={(e) => updateField('excerpt', e.target.value)}
                  className="w-full p-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm text-[#1C241E]"
                />
              </div>

              <div>
                <label htmlFor="post-content" className="block text-xs font-medium text-[#3D4A3F] mb-1.5">
                  {t.admin.editor.contentLabel}
                </label>
                <textarea
                  id="post-content"
                  rows={14}
                  value={currentDraft.content}
                  onChange={(e) => updateField('content', e.target.value)}
                  className="w-full p-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm font-mono leading-relaxed text-[#1C241E]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#1C241E]/10">
                <div>
                  <label htmlFor="post-seo-title" className="block text-xs font-medium text-[#3D4A3F] mb-1.5">
                    {t.admin.editor.seoTitleLabel}
                  </label>
                  <input
                    id="post-seo-title"
                    type="text"
                    value={currentDraft.seo_title}
                    onChange={(e) => updateField('seo_title', e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-xs text-[#1C241E]"
                  />
                </div>
                <div>
                  <label htmlFor="post-seo-desc" className="block text-xs font-medium text-[#3D4A3F] mb-1.5">
                    {t.admin.editor.seoDescLabel}
                  </label>
                  <input
                    id="post-seo-desc"
                    type="text"
                    value={currentDraft.seo_description}
                    onChange={(e) => updateField('seo_description', e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-xs text-[#1C241E]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right 4 columns: Shared Tree & Publication Settings */}
        <aside className="lg:col-span-4 space-y-5">
          <div className="p-5 rounded-xl bg-[#FBF9F5] border border-[#1C241E]/12 space-y-4">
            <h3 className="font-display text-lg font-semibold text-[#1C241E]">
              {t.admin.editor.sharedSettingsTitle}
            </h3>

            <div>
              <label htmlFor="tree-species" className="block text-xs font-medium text-[#3D4A3F] mb-1.5">
                {t.admin.editor.speciesLabel}
              </label>
              <select
                id="tree-species"
                value={species}
                onChange={(e) => setSpecies(e.target.value as TreeSpecies | 'auto')}
                className="w-full h-10 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm text-[#1C241E]"
              >
                <option value="auto">{t.admin.editor.autoSpeciesOption}</option>
                {ALL_SPECIES.map((sp) => (
                  <option key={sp} value={sp}>
                    {t.species[sp]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="post-pub-date" className="block text-xs font-medium text-[#3D4A3F] mb-1.5">
                {t.admin.editor.publishedAtLabel}
              </label>
              <input
                id="post-pub-date"
                type="datetime-local"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm text-[#1C241E]"
              />
            </div>

            <div>
              <div className="text-xs font-medium text-[#3D4A3F] mb-2">
                {t.admin.editor.categoriesLabel}
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {categories.map((cat) => {
                  const checked = selectedCatIds.includes(cat.id);
                  return (
                    <label
                      key={cat.id}
                      className="flex items-center gap-2 text-xs text-[#1C241E] cursor-pointer py-1"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedCatIds((prev) =>
                            checked ? prev.filter((id) => id !== cat.id) : [...prev, cat.id],
                          )
                        }
                        className="rounded border-[#1C241E]/30 text-[#214029]"
                      />
                      <span>{cat.translations[lang]?.name || cat.translations.uz.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="post-tags" className="block text-xs font-medium text-[#3D4A3F] mb-1.5">
                {t.admin.editor.tagsLabel}
              </label>
              <input
                id="post-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="iqtisodiyot, intizom, dasturlash"
                className="w-full h-10 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/15 text-sm text-[#1C241E]"
              />
            </div>

            <div>
              <div className="text-xs font-medium text-[#3D4A3F] mb-2">
                {t.admin.editor.coverImageLabel}
              </div>
              {coverImage && (
                <div className="mb-2">
                  <img
                    src={coverImage}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-36 object-cover rounded-lg border border-[#1C241E]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setCoverImage(null)}
                    className="mt-1.5 text-xs text-[#9A3412] hover:underline cursor-pointer"
                  >
                    {t.admin.editor.removeImageBtn}
                  </button>
                </div>
              )}
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#EAE6DC] hover:bg-[#DFDBD0] text-xs font-medium text-[#1C241E] cursor-pointer">
                <ImagePlus className="w-4 h-4" />
                <span>{t.admin.editor.uploadImageBtn}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleUploadImage}
                  className="sr-only"
                />
              </label>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
