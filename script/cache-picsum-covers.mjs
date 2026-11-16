import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const PIC_SUM_COVER = /https:\/\/picsum\.photos\/seed\/[^"'<>\s]+?\/\d+\/\d+(?![\d/])/g;

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(file));
    else if (entry.name.endsWith('.html')) files.push(file);
  }
  return files;
}

function isJpeg(buffer) {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

// Snapshot the original seed response, never a replacement photo. Warm builds
// reuse the snapshot; an unavailable source is probed once rather than per post.
export async function cachePicsumCovers({ site = 'dist', base = '/', cache = 'node_modules/.cache/picsum-covers', fetchImage = fetch, timeout = 8000 } = {}) {
  const files = await htmlFiles(site);
  const documents = await Promise.all(files.map(async (file) => ({ file, html: await fs.readFile(file, 'utf8') })));
  const urls = [...new Set(documents.flatMap(({ html }) => html.match(PIC_SUM_COVER) || []))];
  const prefix = '/' + base.split('/').filter(Boolean).join('/');
  const publicBase = prefix === '/' ? '' : prefix;
  const output = path.join(site, '_covers');
  await fs.mkdir(cache, { recursive: true });
  await fs.mkdir(output, { recursive: true });
  const resolved = new Map();
  const missing = [];
  let reused = 0;
  let downloaded = 0;
  let failed = 0;
  const nameFor = (url) => createHash('sha256').update(url).digest('hex').slice(0, 24) + '.jpg';
  for (const url of urls) {
    const name = nameFor(url);
    try {
      const image = await fs.readFile(path.join(cache, name));
      if (!isJpeg(image)) throw new Error('Invalid cached JPEG');
      await fs.writeFile(path.join(output, name), image);
      resolved.set(url, publicBase + '/_covers/' + name);
      reused++;
    } catch {
      missing.push(url);
    }
  }
  async function download(url) {
    try {
      const response = await fetchImage(url, { signal: AbortSignal.timeout(timeout), headers: { Accept: 'image/jpeg' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const length = Number(response.headers.get('content-length'));
      if (length > 10 * 1024 * 1024) throw new Error('Cover exceeds 10 MB');
      const image = Buffer.from(await response.arrayBuffer());
      if (image.length > 10 * 1024 * 1024 || !isJpeg(image)) throw new Error('Invalid cover response');
      const name = nameFor(url);
      await fs.writeFile(path.join(cache, name), image);
      await fs.writeFile(path.join(output, name), image);
      resolved.set(url, publicBase + '/_covers/' + name);
      downloaded++;
      return true;
    } catch {
      failed++;
      return false;
    }
  }
  if (missing.length && await download(missing[0])) {
    let cursor = 1;
    let consecutiveFailures = 0;
    await Promise.all(Array.from({ length: Math.min(4, missing.length - 1) }, async () => {
      while (cursor < missing.length && consecutiveFailures < 4) {
        const url = missing[cursor++];
        if (await download(url)) consecutiveFailures = 0;
        else consecutiveFailures++;
      }
    }));
  }
  for (const { file, html } of documents) {
    const pageUrl = html.match(/<meta\b[^>]*property="og:url"[^>]*content="(https?:\/\/[^"<>]+)"/i)?.[1];
    const origin = pageUrl ? new URL(pageUrl).origin : undefined;
    const updated = html.replace(PIC_SUM_COVER, (url, offset) => {
      const snapshot = resolved.get(url);
      if (!snapshot) return url;
      const tagStart = html.lastIndexOf("<", offset);
      const inMeta = html.slice(tagStart, tagStart + 5).toLowerCase() === "<meta";
      return inMeta ? (origin ? origin + snapshot : url) : snapshot;
    });
    if (updated !== html) await fs.writeFile(file, updated);
  }
  const report = { covers: urls.length, reused, downloaded, failed, unresolved: urls.length - resolved.size };
  console.log('[cover-cache] ' + JSON.stringify(report));
  if (report.unresolved) console.warn('[cover-cache] 部分 Picsum 原图暂不可达，仍保留原地址；未使用其他来源替换。');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf('--base');
  cachePicsumCovers({ base: baseIndex >= 0 ? args[baseIndex + 1] : '/' }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
