export type CoverImageProvider = 'pexels' | 'unsplash' | 'pixabay' | 'picsum'

export interface CoverImageConfig {
  enabled: boolean
  provider: CoverImageProvider
  apiKey: string
  perPage: number
  orientation: 'landscape' | 'portrait' | 'square'
  size: 'small' | 'medium' | 'large' | 'original'
  locale: string
  fallbackImages: string[]
  searchStrategy: 'title' | 'title+categories' | 'categories'
  cacheEnabled: boolean
  cacheFilePath: string
  requestTimeout: number
  /** 使用随站点发布的本地封面；每篇文章一张，由构建期脚本自动补全 */
  localCoverFallback: boolean
}

export const coverImageConfig: CoverImageConfig = {
  enabled: true,

  provider: (import.meta.env.COVER_IMAGE_PROVIDER as CoverImageProvider) || 'picsum',

  apiKey: (import.meta.env.COVER_IMAGE_API_KEY as string) || '',

  perPage: 1,

  orientation: 'landscape',

  size: 'large',

  locale: 'zh-CN',

  fallbackImages: [],

  searchStrategy: 'title+categories',

  cacheEnabled: true,

  cacheFilePath: 'node_modules/.cache/cover-images.json',

  requestTimeout: 8000,

  // 本地封面不依赖任何外部图床，dev / 构建 / 线上 / 离线包都能稳定显示。
  // 每张封面按文章 ID 生成唯一文件名；缺图由 script/ensure-post-covers.mjs 在构建前自动补齐。
  // 如需恢复 Picsum 随机照片，设置 COVER_IMAGE_LOCAL_FALLBACK=false。
  localCoverFallback: (import.meta.env.COVER_IMAGE_LOCAL_FALLBACK || 'true') !== 'false',
}

export function buildSearchQuery(
  title: string,
  categories: string[],
  strategy: CoverImageConfig['searchStrategy'],
): string {
  switch (strategy) {
    case 'title':
      return title
    case 'categories':
      return categories.length > 0 ? categories.slice(0, 2).join(' ') : title
    case 'title+categories':
    default: {
      const parts: string[] = [title]
      if (categories.length > 0) {
        parts.push(categories.slice(0, 2).join(' '))
      }
      return parts.join(' ')
    }
  }
}
