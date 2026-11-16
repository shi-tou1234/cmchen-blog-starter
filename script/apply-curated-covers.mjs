/**
 * 用「精选照片池」替换掉随机图库里不合格的封面。
 * 免 API Key：图源只有可直接访问的 images.unsplash.com 与 cn.bing.com。
 * 生成物全部固化在 public/covers/，运行时不请求任何外部服务。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve('public/covers');
const MANIFEST = path.join(OUT, 'manifest.json');
const REJECTS = path.resolve('script/cover-rejects.json');
const W = 1200;
const H = 630;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

const UNSPLASH = [
  'photo-1470071459604-3b5ec3a7fe05', 'photo-1519681393784-d120267933ba',
  'photo-1441974231531-c6227db76b6e', 'photo-1500534623283-312aade485b7',
  'photo-1469474968028-56623f02e42e', 'photo-1501785888041-af3ef285b470',
  'photo-1507525428034-b723cf961d3e', 'photo-1470252649378-9c29740c9fa8',
  'photo-1487958449943-2429e8be8625', 'photo-1511818966892-d7d671e672a2',
  'photo-1481627834876-b7833e8f5570', 'photo-1518770660439-4636190af475',
  'photo-1490750967868-88aa4486c946', 'photo-1433086966358-54859d0ed716',
  'photo-1502082553048-f009c37129b9', 'photo-1418065460487-3e41a6c84dc5',
  'photo-1447752875215-b2761acb3c5d', 'photo-1426604966848-d7adac402bff',
  'photo-1472214103451-9374bd1c798e', 'photo-1501854140801-50d01698950b',
  'photo-1511497584788-876760111969', 'photo-1475924156734-496f6cac6ec1',
  'photo-1439405326854-014607f694d7', 'photo-1465101162946-4377e57745c3',
  'photo-1444084316824-dc26d6657664', 'photo-1518495973542-4542c06a5843',
];

async function fetchBuffer(url) {
  for (let i = 0; i < 3; i += 1) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': UA } });
      if (!r.ok) continue;
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length > 5000) return b;
    } catch { /* retry */ }
  }
  return null;
}

async function toWebp(buf) {
  return sharp(buf).resize(W, H, { fit: 'cover', position: 'entropy' })
    .webp({ quality: 82, effort: 5 }).toBuffer();
}

console.log('[curated] 拉取 Unsplash 精选…');
const unsplashBufs = await Promise.all(UNSPLASH.map(async (id) => {
  const buf = await fetchBuffer(`https://images.unsplash.com/${id}?w=${W}&h=${H}&fit=crop&auto=format&q=85`);
  if (!buf) { console.log('  跳过', id); return null; }
  try { return await toWebp(buf); } catch { return null; }
}));

console.log('[curated] 拉取必应每日壁纸…');
const BING_MARKETS = [
  'zh-cn', 'en-us', 'en-gb', 'en-ca', 'en-au', 'ja-jp', 'ko-kr', 'de-de',
  'fr-fr', 'es-es', 'it-it', 'pt-br', 'nl-nl', 'sv-se', 'pl-pl', 'ru-ru',
  'tr-tr', 'id-id', 'th-th', 'ar-sa', 'hi-in', 'ms-my', 'vi-vn', 'he-il',
];
const bingUrls = new Map();
for (const mkt of BING_MARKETS) {
  for (const idx of [0, 8]) {
    try {
      const r = await fetch(`https://cn.bing.com/HPImageArchive.aspx?format=js&idx=${idx}&n=8&mkt=${mkt}`, {
        signal: AbortSignal.timeout(12000), headers: { 'User-Agent': UA },
      });
      const data = await r.json();
      for (const item of data.images || []) {
        if (item.urlbase && !bingUrls.has(item.urlbase)) bingUrls.set(item.urlbase, 'https://cn.bing.com' + item.url);
      }
    } catch { /* skip */ }
  }
}
const bingBufs = await Promise.all([...bingUrls.values()].map(async (url) => {
  const buf = await fetchBuffer(url);
  if (!buf) return null;
  try { return await toWebp(buf); } catch { return null; }
}));

const curated = [...unsplashBufs, ...bingBufs].filter(Boolean);
console.log(`[curated] 精选图共 ${curated.length} 张`);

const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf-8'));
const rejects = new Set(JSON.parse(await fs.readFile(REJECTS, 'utf-8')));
const badHashes = Object.entries(manifest)
  .filter(([, v]) => rejects.has(v.pexelsId))
  .map(([hash]) => hash)
  .sort();
console.log(`[curated] 待替换 ${badHashes.length} 张`);

let replaced = 0;
for (const hash of badHashes) {
  const webp = curated[replaced];
  if (!webp) break;
  await fs.writeFile(path.join(OUT, hash), webp);
  manifest[hash] = { post: manifest[hash].post, source: 'curated', ref: `curated-${String(replaced + 1).padStart(2, '0')}` };
  replaced += 1;
}

// 剩余精选图作为新文章预留池
const spares = curated.slice(replaced);
for (let i = 0; i < spares.length; i += 1) {
  await fs.writeFile(path.join(OUT, `spare-${String(i + 1).padStart(2, '0')}.webp`), spares[i]);
}
for (const file of await fs.readdir(OUT)) {
  if (/^spare-\d+\.webp$/.test(file)) {
    const n = Number(file.match(/spare-(\d+)/)[1]);
    if (n > spares.length) await fs.rm(path.join(OUT, file));
  }
}

await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
console.log(`[curated] 已替换 ${replaced} 张，预留 ${spares.length} 张给新文章`);
