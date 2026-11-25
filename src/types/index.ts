export type LanguageCode = 'uz' | 'en';

export type TreeSpecies =
  | 'oak'
  | 'birch'
  | 'maple'
  | 'willow'
  | 'cherry'
  | 'walnut';

export type AnimalSpecies = 'rabbit' | 'bird' | 'bear' | 'wolf';

export interface AnimalRecord {
  id: number;
  species: AnimalSpecies;
  name: string;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation: number;
  scale: number;
  created_at: string;
}

export type ContributionKind = 'stone' | 'animal';

export type ContributionStatus = 'pending' | 'approved';

export interface VisitorContributionRecord {
  id: number;
  kind: ContributionKind;
  animal_species: AnimalSpecies | null;
  visitor_name: string;
  comment: string;
  status: ContributionStatus;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation: number;
  scale: number;
  created_at: string;
  approved_at: string | null;
}

export type SeasonMode = 'spring' | 'summer' | 'autumn' | 'winter';

export type TimeOfDay = 'morning' | 'afternoon' | 'sunset' | 'night';

export type TranslationStatus = 'draft' | 'published';

export type PostStatus = 'draft' | 'published';

export interface CategoryTranslation {
  language_code: LanguageCode;
  name: string;
  description: string;
}

export interface CategoryRecord {
  id: number;
  slug: string;
  species_hint: TreeSpecies;
  sector_angle: number;
  created_at: string;
  post_count?: number;
  translations: Record<LanguageCode, CategoryTranslation>;
}

export interface TagRecord {
  id: number;
  name: string;
  slug: string;
}

export interface PostTranslation {
  id?: number;
  post_id?: number;
  language_code: LanguageCode;
  title: string;
  slug: string;
  subtitle: string;
  excerpt: string;
  content: string;
  seo_title: string;
  seo_description: string;
  reading_time: number;
  translation_status: TranslationStatus;
  created_at?: string;
  updated_at?: string;
}

export interface TreeRecord {
  id: number;
  post_id: number;
  species: TreeSpecies;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation: number;
  scale_seed: number;
  created_at: string;
}

export interface PostSummary {
  id: number;
  status: PostStatus;
  cover_image: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  is_demo: boolean;
  tree: TreeRecord | null;
  categories: CategoryRecord[];
  tags: TagRecord[];
  translations: Partial<Record<LanguageCode, PostTranslation>>;
}

export interface ForestTreeItem {
  post_id: number;
  published_at: string;
  cover_image: string | null;
  tree: TreeRecord;
  categories: CategoryRecord[];
  tags: TagRecord[];
  translations: Partial<Record<LanguageCode, PostTranslation>>;
}

export interface ForestStats {
  total_trees: number;
  total_posts: number;
  draft_count: number;
  category_count: number;
  oldest_publication: string | null;
  newest_publication: string | null;
  most_active_category: CategoryRecord | null;
  avg_days_between_posts: number | null;
  timeline: Array<{ month: string; count: number; cumulative: number }>;
}

export interface SiteSettings {
  blog_name_uz: string;
  blog_name_en: string;
  tagline_uz: string;
  tagline_en: string;
  author_name: string;
  about_title_uz: string;
  about_title_en: string;
  about_body_uz: string;
  about_body_en: string;
  default_time_of_day: TimeOfDay;
  default_season: SeasonMode;
  intro_animation: boolean;
  reduced_effects_default: boolean;
  show_tree_titles: boolean;
  grass_count: number;
  stone_count: number;
}

export interface AdminUser {
  id: number;
  username: string;
  must_change_credentials: boolean;
}
