/**
 * 文章封面自动补全（免 API Key）。
 *
 * 设计要点：
 * - 每篇文章按 ID 生成一个稳定且唯一的文件名（sha256 前 20 位），因此
 *   「每篇一张、互不重复」，且新增文章会自动得到一个全新的文件名。
 * - 图片编号由同一个哈希派生，并在本次运行内全局去重，不同文章不会撞同一张图。
 * - 只有缺失的封面才会下载；已有文件直接复用，所以旧文章的封面永不改变。
 * - 新文章优先从精选池的 spare-*.webp 预留图里取一张（完全不联网），
 *   预留图用尽后才回退到 Pexels CDN 并做质量筛选（人工黑名单永久生效）。
 * - 产物固化在 public/covers/，运行时只请求站内资源，不依赖任何外部图床。
 *
 * 图源：Pexels CDN（images.pexels.com），Pexels License 允许免费商用。
 * 用法：pnpm run covers:ensure   （已接入 dev / build / build:desktop / CI）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const ROOT = path.resolve('.');
const POSTS_DIR = path.join(ROOT, 'src/content/blog');
const OUT_DIR = path.join(ROOT, 'public/covers');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const REJECTS = path.join(ROOT, 'script/cover-rejects.json');
const W = 1200;
const H = 630;
const CONCURRENCY = 8;
const MAX_CANDIDATES = 30;
const FORCE = process.argv.includes('--force');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

export function normalizePostId(postId) {
  return postId.replace(/\\/g, '/').split('/')[0];
}

export function coverFilename(postId) {
  return createHash('sha256').update(normalizePostId(postId)).digest('hex').slice(0, 20) + '.webp';
}

function seedOf(hash) {
  return parseInt(hash.slice(0, 8), 16) >>> 0;
}

/** 为每篇文章生成一串全局不重复的图片编号 */
function assignCandidates(hashes, usedIds) {
  const map = new Map();
  for (const hash of hashes) {
    const seed = seedOf(hash);
    const list = [];
    for (let i = 0; i < 400 && list.length < MAX_CANDIDATES; i += 1) {
      const id = 100000 + (((seed + Math.imul(i, 2654435761)) >>> 0) % 8000000);
      if (usedIds.has(id)) continue;
      usedIds.add(id);
      list.push(id);
    }
    map.set(hash, list);
  }
  return map;
}

function pexelsUrl(id, width) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;
}

async function fetchImage(id, width = 800) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(pexelsUrl(id, width), {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': UA, Accept: 'image/*' },
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5000) return null;
      return buf;
    } catch {
      // 换下一个编号
    }
  }
  return null;
}

/** 粗略识别人像与高饱和商品图：随机图库里这两类最不适合当封面 */
async function pixelFlags(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(120, 63, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const step = info.channels;
  const total = info.width * info.height;
  let skin = 0;
  let vivid = 0;
  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && r > b) skin += 1;
    if (max > 150 && (max - min) / max > 0.55) vivid += 1;
  }
  return { skinRatio: skin / total, vividRatio: vivid / total };
}

/** 返回 { ok, score }，score 越小越接近理想范围，用于全部不合格时兜底 */
async function quality(buffer) {
  const [m, st, flags] = await Promise.all([
    sharp(buffer).metadata(),
    sharp(buffer).stats(),
    pixelFlags(buffer),
  ]);
  const ch = st.channels.slice(0, 3);
  const means = ch.map((c) => c.mean);
  const brightness = means.reduce((a, b) => a + b, 0) / 3;
  const spread = Math.max(...means) - Math.min(...means);
  const stdev = ch.reduce((a, c) => a + c.stdev, 0) / 3;
  const ratio = m.width / m.height;
  const reasons = [];
  if (m.width < 600 || m.height < 320) reasons.push('分辨率不足');
  if (ratio < 1.15) reasons.push('偏竖图');
  if (brightness < 50 || brightness > 205) reasons.push('过暗/过曝');
  if (spread > 120) reasons.push('色彩过艳');
  if (stdev < 18) reasons.push('层次太少');
  if (st.entropy < 4.0 || st.entropy > 8.2) reasons.push('画面过平/过杂');
  if (flags.skinRatio > 0.10) reasons.push('疑似人像');
  if (flags.vividRatio > 0.30) reasons.push('高饱和色块过多');
  // 硬否决：这类图无论如何都不作为兜底候选
  const hardReject =
    m.width < 600 || m.height < 320 || ratio < 1.15 ||
    brightness < 45 || brightness > 210 ||
    flags.skinRatio > 0.10 || flags.vividRatio > 0.30;
  const penalty =
    Math.max(0, 50 - brightness) + Math.max(0, brightness - 205) +
    Math.max(0, spread - 120) + Math.max(0, 18 - stdev) +
    Math.max(0, 4.0 - st.entropy) * 10 + Math.max(0, st.entropy - 8.2) * 10 +
    Math.max(0, 1.15 - ratio) * 40 +
    Math.max(0, flags.skinRatio - 0.10) * 300 +
    Math.max(0, flags.vividRatio - 0.30) * 300;
  return { ok: reasons.length === 0, hardReject, score: penalty, reasons };
}

async function isValidWebp(file) {
  try {
    const st = await fs.stat(file);
    return st.size > 1000;
  } catch {
    return false;
  }
}

const dirs = await fs.readdir(POSTS_DIR, { withFileTypes: true });
const posts = [];
for (const entry of dirs) {
  if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
  try {
    await fs.access(path.join(POSTS_DIR, entry.name, 'zh-cn.md'));
    posts.push(entry.name);
  } catch {
    // 非标准文章目录，跳过
  }
}
posts.sort();

await fs.mkdir(OUT_DIR, { recursive: true });
let manifest = {};
try {
  manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf-8'));
} catch {
  manifest = {};
}

const hashOfPost = new Map(posts.map((p) => [coverFilename(p), p]));
const usedIds = FORCE ? new Set() : new Set(
  Object.values(manifest)
    .map((v) => (typeof v === 'number' ? v : v?.pexelsId))
    .filter((n) => Number.isFinite(n)),
);
// 人工筛掉的图片编号永久拉黑，新文章也不会再抽到
try {
  for (const id of JSON.parse(await fs.readFile(REJECTS, 'utf-8'))) usedIds.add(id);
} catch { /* 黑名单可选 */ }

// 精选预留池：新文章优先从这里取一张，完全不联网
const spareFiles = FORCE ? [] : (await fs.readdir(OUT_DIR))
  .filter((f) => /^spare-\d+\.webp$/.test(f))
  .sort();
let spareCursor = 0;

// 清理不再对应任何文章的旧封面（也会清掉上一版的 cover-01.webp 等）
for (const file of await fs.readdir(OUT_DIR)) {
  // spare-* 是新文章预留池，不能当孤儿文件清理
  if (file.endsWith('.webp') && !file.startsWith('spare-') && !hashOfPost.has(file)) {
    await fs.rm(path.join(OUT_DIR, file));
  }
}

const missing = [];
let reused = 0;
for (const [hash, post] of hashOfPost) {
  const file = path.join(OUT_DIR, hash);
  if (!FORCE && await isValidWebp(file)) {
    reused += 1;
    if (manifest[hash]?.pexelsId) usedIds.add(manifest[hash].pexelsId);
  } else {
    missing.push({ hash, post });
  }
}

const candidateMap = assignCandidates(missing.map((m) => m.hash), usedIds);
let created = 0;
let failed = 0;
let cursor = 0;

async function worker() {
  while (cursor < missing.length) {
    const item = missing[cursor++];

    // 新文章优先用精选池里的预留图：零网络请求、质量可控
    const spare = spareFiles[spareCursor++];
    if (spare) {
      await fs.copyFile(path.join(OUT_DIR, spare), path.join(OUT_DIR, item.hash));
      await fs.rm(path.join(OUT_DIR, spare));
      manifest[item.hash] = { post: item.post, source: 'spare', ref: spare };
      created += 1;
      continue;
    }

    const candidates = candidateMap.get(item.hash) || [];
    let fallback = null;
    let chosen = null;
    for (const id of candidates) {
      // 先用小图做质量判断，通过后才拉大图，避免浪费带宽
      const small = await fetchImage(id, 800);
      if (!small) continue;
      let q;
      try {
        q = await quality(small);
      } catch {
        continue;
      }
      if (q.hardReject) continue;
      if (!fallback || q.score < fallback.score) fallback = { id, score: q.score };
      if (q.ok) {
        const big = await fetchImage(id, W);
        if (big) {
          chosen = { id, buf: big };
          break;
        }
      }
    }
    // 全部候选都不完美时，只从「非人像、非过曝、非高饱和」里挑最接近的
    const pick = chosen || (fallback
      ? { id: fallback.id, buf: await fetchImage(fallback.id, W) }
      : null);
    if (!pick || !pick.buf) {
      failed += 1;
      console.error(`[covers] 失败: ${item.post}`);
      continue;
    }
    try {
      await sharp(pick.buf)
        .resize(W, H, { fit: 'cover', position: 'entropy' })
        .webp({ quality: 80, effort: 4 })
        .toFile(path.join(OUT_DIR, item.hash));
      manifest[item.hash] = { post: item.post, pexelsId: pick.id };
      created += 1;
      if (created % 20 === 0 || created === missing.length) {
        console.log(`[covers] 进度 ${created}/${missing.length}`);
      }
    } catch (e) {
      failed += 1;
      console.error(`[covers] 处理失败 ${item.post}: ${e.message}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// 移除 manifest 里已不存在的文章记录
for (const key of Object.keys(manifest)) {
  if (!hashOfPost.has(key)) delete manifest[key];
}
await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

console.log(`[covers] 文章 ${posts.length} 篇｜复用 ${reused}｜新增 ${created}｜失败 ${failed}`);
if (failed) process.exitCode = 1;
