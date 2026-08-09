import fs from 'node:fs'
import path from 'node:path'
import {
  coverImageConfig,
  buildSearchQuery,
  type CoverImageConfig,
} from '@/data/cover-image-config'
import { hashString } from './hash'

interface CoverImageResult {
  url: string
  photographer: string
  photographerUrl: string
  alt: string
  width: number
  height: number
}

interface CacheEntry {
  url: string
  photographer: string
  photographerUrl: string
  fetchedAt: string
}

interface CacheData {
  [postId: string]: CacheEntry
}

function readCache(config: CoverImageConfig): CacheData {
  if (!config.cacheEnabled) return {}
  try {
    const cachePath = path.resolve(config.cacheFilePath)
    if (fs.existsSync(cachePath)) {
      const raw = fs.readFileSync(cachePath, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {
    console.warn('[cover-image] 读取缓存失败，将重新获取')
  }
  return {}
}

function writeCache(config: CoverImageConfig, data: CacheData): void {
  if (!config.cacheEnabled) return
  try {
    const cachePath = path.resolve(config.cacheFilePath)
    const dir = path.dirname(cachePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    console.warn('[cover-image] 写入缓存失败')
  }
}

async function searchPexels(
  query: string,
  config: CoverImageConfig,
): Promise<CoverImageResult | null> {
  const params = new URLSearchParams({
    query,
    per_page: String(config.perPage),
    orientation: config.orientation,
    size: config.size,
    locale: config.locale,
  })

  const response = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: {
      Authorization: config.apiKey,
    },
    signal: AbortSignal.timeout(config.requestTimeout),
  })

  if (!response.ok) {
    console.warn(`[cover-image] Pexels API 返回 ${response.status}: ${response.statusText}`)
    return null
  }

  const data = (await response.json()) as {
    photos: Array<{
      src: Record<string, string>
      photographer: string
      photographer_url: string
      alt: string
      width: number
      height: number
    }>
  }

  if (!data.photos || data.photos.length === 0) return null

  const photo = data.photos[0]
  const sizeKey = config.size === 'original' ? 'original' : config.size
  return {
    url: photo.src[sizeKey] || photo.src.large,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    alt: photo.alt || query,
    width: photo.width,
    height: photo.height,
  }
}

async function searchUnsplash(
  query: string,
  config: CoverImageConfig,
): Promise<CoverImageResult | null> {
  const params = new URLSearchParams({
    query,
    per_page: String(config.perPage),
    orientation: config.orientation,
  })

  const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: {
      Authorization: `Client-ID ${config.apiKey}`,
    },
    signal: AbortSignal.timeout(config.requestTimeout),
  })

  if (!response.ok) {
    console.warn(`[cover-image] Unsplash API 返回 ${response.status}: ${response.statusText}`)
    return null
  }

  const data = (await response.json()) as {
    results: Array<{
      urls: Record<string, string>
      user: { name: string; links: { html: string } }
      alt_description: string
      width: number
      height: number
    }>
  }

  if (!data.results || data.results.length === 0) return null

  const photo = data.results[0]
  return {
    url: photo.urls.regular || photo.urls.small,
    photographer: photo.user.name,
    photographerUrl: photo.user.links.html,
    alt: photo.alt_description || query,
    width: photo.width,
    height: photo.height,
  }
}

async function searchPixabay(
  query: string,
  config: CoverImageConfig,
): Promise<CoverImageResult | null> {
  const params = new URLSearchParams({
    key: config.apiKey,
    q: query,
    per_page: String(config.perPage),
    orientation: config.orientation,
  })

  const response = await fetch(`https://pixabay.com/api/?${params}`, {
    signal: AbortSignal.timeout(config.requestTimeout),
  })

  if (!response.ok) {
    console.warn(`[cover-image] Pixabay API 返回 ${response.status}: ${response.statusText}`)
    return null
  }

  const data = (await response.json()) as {
    hits: Array<{
      largeImageURL: string
      webformatURL: string
      user: string
      pageURL: string
      tags: string
      imageWidth: number
      imageHeight: number
    }>
  }

  if (!data.hits || data.hits.length === 0) return null

  const photo = data.hits[0]
  return {
    url: photo.largeImageURL || photo.webformatURL,
    photographer: photo.user,
    photographerUrl: photo.pageURL,
    alt: photo.tags || query,
    width: photo.imageWidth,
    height: photo.imageHeight,
  }
}

async function searchPicsum(
  postId: string,
  _query: string,
  _config: CoverImageConfig,
): Promise<CoverImageResult | null> {
  const width = 1200
  const height = 630

  let photographer = 'Lorem Picsum'
  let photographerUrl = 'https://picsum.photos'

  try {
    const listResponse = await fetch('https://picsum.photos/v2/list?page=1&limit=100', {
      signal: AbortSignal.timeout(5000),
    })
    if (listResponse.ok) {
      const list = (await listResponse.json()) as Array<{ author: string; url: string }>
      if (list.length > 0) {
        const seed = hashString(postId)
        const item = list[seed % list.length]
        photographer = item.author
        photographerUrl = item.url
      }
    }
  } catch {
    // 列表获取失败，使用默认署名
  }

  return {
    url: `https://picsum.photos/seed/${encodeURIComponent(postId)}/${width}/${height}`,
    photographer,
    photographerUrl,
    alt: _query,
    width,
    height,
  }
}

async function searchCoverImage(
  postId: string,
  query: string,
  config: CoverImageConfig,
): Promise<CoverImageResult | null> {
  switch (config.provider) {
    case 'pexels':
      return searchPexels(query, config)
    case 'unsplash':
      return searchUnsplash(query, config)
    case 'pixabay':
      return searchPixabay(query, config)
    case 'picsum':
      return searchPicsum(postId, query, config)
    default:
      return searchPexels(query, config)
  }
}

export interface ResolvedCover {
  imageUrl: string
  photographer: string
  photographerUrl: string
  source: 'user' | 'api' | 'fallback' | 'none'
}

export async function resolveCoverImage(
  postId: string,
  userImage: string,
  title: string,
  categories: string[],
): Promise<ResolvedCover> {
  if (userImage) {
    // 用户指定的封面文件不存在时，当作「没填封面」继续走 API 兜底，避免页面显示破图
    const localPath = path.resolve(process.cwd(), 'src', userImage)
    if (fs.existsSync(localPath)) {
      return {
        imageUrl: userImage,
        photographer: '',
        photographerUrl: '',
        source: 'user',
      }
    }
    console.warn(`[cover-image] 封面文件不存在，改用 API 兜底: ${userImage}`)
  }

  if (!coverImageConfig.enabled) {
    return { imageUrl: '', photographer: '', photographerUrl: '', source: 'none' }
  }

  if (!coverImageConfig.apiKey) {
    try {
      const result = await searchPicsum(postId, title, coverImageConfig)
      if (result) {
        return {
          imageUrl: result.url,
          photographer: result.photographer,
          photographerUrl: result.photographerUrl,
          source: 'api',
        }
      }
    } catch (err) {
      console.warn(`[cover-image] Picsum 获取失败 (${postId}):`, err)
    }
    return { imageUrl: '', photographer: '', photographerUrl: '', source: 'none' }
  }

  const cache = readCache(coverImageConfig)
  const cached = cache[postId]
  if (cached) {
    return {
      imageUrl: cached.url,
      photographer: cached.photographer,
      photographerUrl: cached.photographerUrl,
      source: 'api',
    }
  }

  const query = buildSearchQuery(title, categories, coverImageConfig.searchStrategy)

  try {
    const result = await searchCoverImage(postId, query, coverImageConfig)

    if (result) {
      cache[postId] = {
        url: result.url,
        photographer: result.photographer,
        photographerUrl: result.photographerUrl,
        fetchedAt: new Date().toISOString(),
      }
      writeCache(coverImageConfig, cache)

      return {
        imageUrl: result.url,
        photographer: result.photographer,
        photographerUrl: result.photographerUrl,
        source: 'api',
      }
    }
  } catch (err) {
    console.warn(`[cover-image] 获取封面图失败 (${postId}):`, err)
  }

  if (coverImageConfig.fallbackImages.length > 0) {
    const fallbackIndex = Math.abs(hashString(postId)) % coverImageConfig.fallbackImages.length
    return {
      imageUrl: coverImageConfig.fallbackImages[fallbackIndex],
      photographer: '',
      photographerUrl: '',
      source: 'fallback',
    }
  }

  return { imageUrl: '', photographer: '', photographerUrl: '', source: 'none' }
}
