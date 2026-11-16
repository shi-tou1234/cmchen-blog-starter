import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
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

// Share results between list and detail pages during one build.
const cacheFiles = new Map<string, CacheData>()
const pendingCovers = new Map<string, Promise<ResolvedCover>>()
let warnedMissingKey = false

function readCache(config: CoverImageConfig): CacheData {
  if (!config.cacheEnabled) return {}
  try {
    const root = path.resolve('.')
    const cachePath = path.resolve(config.cacheFilePath)
    // 与 writeCache 相同的越界校验：缓存文件必须位于项目根目录内
    if (!cachePath.startsWith(root + path.sep) && cachePath !== root) {
      console.warn('[cover-image] 缓存路径越界，拒绝读取')
      return {}
    }
    const existing = cacheFiles.get(cachePath)
    if (existing) return existing
    if (fs.existsSync(cachePath)) {
      const raw = fs.readFileSync(cachePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        cacheFiles.set(cachePath, parsed)
        return parsed
      }
    }
    const empty: CacheData = {}
    cacheFiles.set(cachePath, empty)
    return empty
  } catch {
    console.warn('[cover-image] 读取缓存失败，将重新获取')
  }
  return {}
}

function writeCache(config: CoverImageConfig, data: CacheData): void {
  if (!config.cacheEnabled) return
  try {
    const root = path.resolve('.')
    const target = path.resolve(config.cacheFilePath)
    if (!target.startsWith(root + path.sep) && target !== root) {
      console.warn('[cover-image] 缓存路径越界，拒绝写入')
      return
    }
    const dir = path.dirname(target)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf-8')
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

  // The seed URL needs no catalogue lookup. Catalogue authors do not identify
  // the seeded image and previously caused a five-second wait on every page.
  const photographer = 'Lorem Picsum'
  const photographerUrl = 'https://picsum.photos'

  return {
    url: `https://picsum.photos/seed/${encodeURIComponent(postId)}/${width}/${height}`,
    photographer,
    photographerUrl,
    alt: _query,
    width,
    height,
  }
}

/**
 * 每篇文章一张专属封面：文件名由文章 ID 的 sha256 派生，天然互不重复。
 * 新增文章会得到全新的文件名，构建前的 ensure-post-covers 脚本负责把图补齐。
 * BASE_URL 由 Astro 注入：站点部署是 /cmchen-blog/，桌面离线包是 /。
 */
function localCoverUrl(postId: string): string {
  const normalized = postId.replace(/\\/g, '/').split('/')[0];
  const filename = createHash('sha256').update(normalized).digest('hex').slice(0, 20) + '.webp';
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${base}/covers/${filename}`;
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
    if (/^https?:\/\//i.test(userImage) || userImage.startsWith('/')) {
      return { imageUrl: userImage, photographer: '', photographerUrl: '', source: 'user' }
    }
    // 用户指定的封面文件不存在时，当作「没填封面」继续走 API 兜底，避免页面显示破图
    // 去掉 userImage 前导 / 或 \，防止 Windows 下 path.resolve 跳转到盘符根目录
    const safeUserImage = userImage.replace(/^[\\/]+/, '');
    const localPath = path.resolve(process.cwd(), 'src', safeUserImage)
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

  if (!coverImageConfig.apiKey || coverImageConfig.provider === 'picsum') {
    // 外链图源在国内经常超时，优先用随站点一起发布的本地封面。
    if (coverImageConfig.localCoverFallback) {
      const url = localCoverUrl(postId)
      if (url) {
        return { imageUrl: url, photographer: '', photographerUrl: '', source: 'fallback' }
      }
    }
    if (!coverImageConfig.apiKey && coverImageConfig.provider !== 'picsum' && !warnedMissingKey) {
      warnedMissingKey = true
      console.warn('[cover-image] 未收到图片服务 API Key，本次构建使用 Picsum 随机封面。')
    }
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

  const query = buildSearchQuery(title, categories, coverImageConfig.searchStrategy)
  const requestKey = JSON.stringify([coverImageConfig.provider, postId, query])
  const pending = pendingCovers.get(requestKey)
  if (pending) return pending
  const request = resolveApiCover(postId, query)
  pendingCovers.set(requestKey, request)
  return request
}

async function resolveApiCover(postId: string, query: string): Promise<ResolvedCover> {
  const cache = readCache(coverImageConfig)
  const cacheKey = JSON.stringify([coverImageConfig.provider, postId, query])
  const cached = cache[cacheKey]
  if (cached) {
    return {
      imageUrl: cached.url,
      photographer: cached.photographer,
      photographerUrl: cached.photographerUrl,
      source: 'api',
    }
  }

  try {
    const result = await searchCoverImage(postId, query, coverImageConfig)

    if (result) {
      cache[cacheKey] = {
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
