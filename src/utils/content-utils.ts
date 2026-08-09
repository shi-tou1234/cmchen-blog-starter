import { getCollection, getEntry } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

/**
 * 获取排序后的博客条目
 * @param filter 过滤函数，可选，默认过滤掉生产环境中的草稿文章
 * @param sort 排序函数，可选，默认按发布日期降序排列
 * @returns 排序后的博客条目数组
 */
export async function getBlogEntrySort(
  filter?: (entry: CollectionEntry<'blog'>) => boolean | undefined,
  sort?: (a: CollectionEntry<'blog'>, b: CollectionEntry<'blog'>) => number
): Promise<CollectionEntry<'blog'>[]> {
  
  const defaultFilter = ({ data }: CollectionEntry<'blog'>) => {
    return import.meta.env.PROD ? data.draft !== true : true;
  };

  const defaultSort = (a: CollectionEntry<'blog'>, b: CollectionEntry<'blog'>) => {
    const aPinned = a.data.pinned ? 1 : 0;
    const bPinned = b.data.pinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    const timeDiff = b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id);
  };

  const blogEntries = await getCollection('blog', filter || defaultFilter);

  // Group entries by directory, strip locale suffix from ID
  const grouped = new Map<string, CollectionEntry<'blog'>>();
  for (const post of blogEntries) {
    const parts = post.id.split('/');
    if (parts.length < 2) continue;
    const dir = parts.slice(0, -1).join('/');
    if (!grouped.has(dir)) {
      grouped.set(dir, { ...post, id: dir });
    }
  }

  return Array.from(grouped.values()).sort(sort || defaultSort);
}

export async function getSpec(
    spec: string
) {
    return await getEntry('spec', `${spec}/zh-cn`);
}