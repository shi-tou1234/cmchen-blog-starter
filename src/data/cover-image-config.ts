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
}

export const coverImageConfig: CoverImageConfig = {
  enabled: true,

  provider: (import.meta.env.COVER_IMAGE_PROVIDER as CoverImageProvider) || 'pexels',

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
