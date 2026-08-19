import type { APIRoute } from 'astro'
import { siteConfig } from '@/config'
import { getBlogEntrySort } from '@utils/content-utils'
import { getRelativeLocaleUrl } from '@utils/url-utils'

function escapeXml(text: string): string {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

const currentLang = 'zh-cn'

export const GET: APIRoute = async ({ site }) => {
    if (!site) return new Response('site is not configured', { status: 500 })

    const posts = await getBlogEntrySort()

    const feedUrl = new URL(getRelativeLocaleUrl(currentLang, '/'), site).href
    const items = posts.map((post) => {
        const url = new URL(getRelativeLocaleUrl(currentLang, `/blog/${post.id}`), site).href
        const title = escapeXml(post.data.title)
        const description = escapeXml((post.data.description || post.data.title).slice(0, 200))
        return `    <item>
      <title>${title}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${description}</description>
      <pubDate>${post.data.pubDate.toUTCString()}</pubDate>
    </item>`
    }).join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteConfig.title)} - ${escapeXml(siteConfig.subTitle)}</title>
    <link>${feedUrl}</link>
    <description>${escapeXml(siteConfig.subTitle)}</description>
    <language>zh-cn</language>
    <atom:link href="${new URL(getRelativeLocaleUrl(currentLang, '/rss.xml'), site).href}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`

    return new Response(xml, {
        headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    })
}
