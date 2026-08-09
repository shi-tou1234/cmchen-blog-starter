import type { BlogEntryWithLocaleStatus } from '@utils/content-utils';

const CATEGORY_PARAM_PREFIX = 'b64-';
export const STUDY_NOTE_CATEGORY = '学习笔记';
const STUDY_NOTE_SUBCATEGORIES = new Set(['电路', '高数', '数电', '大物', '复变函数', '英语笔记']);

// 浏览器兼容的 base64url 编解码（不依赖 Node 的 Buffer）
function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function getUncategorizedLabel(lang: string): string {
  return lang.toLowerCase().startsWith('zh') ? '未分类' : 'Uncategorized';
}

export function normalizeCategoryItems(categories: string[]): string[] {
  const unique = [...new Set(categories.map((item) => String(item).trim()).filter(Boolean))];

  if (unique.length === 1 && STUDY_NOTE_SUBCATEGORIES.has(unique[0])) {
    return [STUDY_NOTE_CATEGORY, unique[0]];
  }

  return unique;
}

export function getPrimaryCategoryFromItems(categories: string[]): string {
  return normalizeCategoryItems(categories)[0] || '';
}

export function getSubcategoriesFromItems(categories: string[]): string[] {
  return normalizeCategoryItems(categories).slice(1);
}

export function encodeCategoryParam(category: string): string {
  return `${CATEGORY_PARAM_PREFIX}${toBase64Url(category)}`;
}

export function decodeCategoryParam(categoryParam: string): string {
  if (!categoryParam) return '';

  if (categoryParam.startsWith(CATEGORY_PARAM_PREFIX)) {
    const encoded = categoryParam.slice(CATEGORY_PARAM_PREFIX.length);
    if (encoded) {
      try {
        return fromBase64Url(encoded);
      } catch {
        console.warn('[blog-taxonomy] base64url 解码失败:', encoded);
      }
    }
  }

  try {
    return decodeURIComponent(categoryParam);
  } catch {
    return categoryParam;
  }
}

export function getPostCategories(
  post: Pick<BlogEntryWithLocaleStatus, 'data'>,
  lang: string,
): string[] {
  const uncategorized = getUncategorizedLabel(lang);
  const legacyCategories = Array.isArray(post.data.categories) ? post.data.categories : [];
  const singleCategory = String(post.data.category || '').trim();
  const normalized = normalizeCategoryItems([...legacyCategories, ...(singleCategory ? [singleCategory] : [])]);
  return normalized.length > 0 ? normalized : [uncategorized];
}

export function buildCategoriesMap(posts: BlogEntryWithLocaleStatus[], lang: string) {
  return posts.reduce((acc, post) => {
    getPostCategories(post, lang).forEach((category) => {
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(post);
    });
    return acc;
  }, {} as Record<string, BlogEntryWithLocaleStatus[]>);
}

export function buildTopLevelCategoriesMap(posts: BlogEntryWithLocaleStatus[], lang: string) {
  return posts.reduce((acc, post) => {
    const primaryCategory = getPostCategories(post, lang)[0];
    if (!primaryCategory) return acc;

    if (!acc[primaryCategory]) {
      acc[primaryCategory] = [];
    }
    acc[primaryCategory].push(post);
    return acc;
  }, {} as Record<string, BlogEntryWithLocaleStatus[]>);
}

export function buildSubcategoriesByRoot(posts: BlogEntryWithLocaleStatus[], lang: string) {
  return posts.reduce((acc, post) => {
    const categories = getPostCategories(post, lang);
    const rootCategory = categories[0];
    const subcategories = categories.slice(1);
    if (!rootCategory || subcategories.length === 0) return acc;

    if (!acc[rootCategory]) {
      acc[rootCategory] = new Set<string>();
    }

    subcategories.forEach((subcategory) => {
      if (subcategory && subcategory !== rootCategory) {
        acc[rootCategory].add(subcategory);
      }
    });

    return acc;
  }, {} as Record<string, Set<string>>);
}
