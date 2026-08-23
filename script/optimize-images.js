// =====================================================================
// optimize-images.js — 文章图片批量瘦身脚本
// 将 src/content 下过大的位图（PNG/JPG）压缩为 WebP（质量 85、最宽 1600px），
// 删除原图并同步更新同目录文章 Markdown 中的引用。
// 幂等可重复运行；压缩后反而变大的文件会保留原图并跳过。
// 用法：node script/optimize-images.js [--dry]（--dry 仅统计不落盘）
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const CONTENT_DIR = path.resolve(process.cwd(), 'src', 'content');
const SIZE_THRESHOLD = 300 * 1024; // 超过 300KB 触发压缩
const WIDTH_THRESHOLD = 1920;      // 或宽度超过 1920px 触发压缩
const MAX_WIDTH = 1600;
const QUALITY = 85;
const dry = process.argv.includes('--dry');

const RASTER_EXTS = new Set(['.png', '.jpg', '.jpeg']);

function walk(dir, accept, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, accept, out);
    else if (accept(name)) out.push(full);
  }
  return out;
}

const images = walk(CONTENT_DIR, (n) => RASTER_EXTS.has(path.extname(n).toLowerCase()));

let converted = 0, skipped = 0, savedBytes = 0, beforeBytes = 0;

for (const file of images) {
  const st = fs.statSync(file);
  let width = 0;
  try {
    width = (await sharp(file).metadata()).width || 0;
  } catch (err) {
    console.warn(`[skip] 无法读取图片元数据：${path.relative(process.cwd(), file)}（${err.message}）`);
    skipped++;
    continue;
  }

  if (st.size <= SIZE_THRESHOLD && width <= WIDTH_THRESHOLD) {
    skipped++;
    continue;
  }

  const outPath = file.slice(0, -path.extname(file).length) + '.webp';
  if (dry) {
    console.log(`[dry] ${path.relative(process.cwd(), file)} ${(st.size / 1048576).toFixed(1)}MB ${width}px → webp`);
    continue;
  }

  try {
    await sharp(file)
      .rotate() // 按 EXIF 方向摆正
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(outPath);
  } catch (err) {
    console.warn(`[skip] 压缩失败：${path.relative(process.cwd(), file)}（${err.message}）`);
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    skipped++;
    continue;
  }

  const outSize = fs.statSync(outPath).size;
  // 压缩无收益时保留原图
  if (outSize >= st.size) {
    fs.unlinkSync(outPath);
    skipped++;
    console.log(`[skip] WebP 未小于原图：${path.basename(file)}`);
    continue;
  }

  fs.unlinkSync(file);
  converted++;
  beforeBytes += st.size;
  savedBytes += st.size - outSize;

  // 只更新图片所在文章目录（assets 的上级）内的 Markdown 引用，避免误伤同名文件
  const postDir = path.dirname(path.dirname(file));
  const oldBase = path.basename(file);
  const newBase = path.basename(outPath);
  if (fs.existsSync(postDir)) {
    for (const md of walk(postDir, (n) => n.endsWith('.md'))) {
      let txt = fs.readFileSync(md, 'utf-8');
      if (txt.includes(oldBase)) {
        fs.writeFileSync(md, txt.split(oldBase).join(newBase), 'utf-8');
      }
    }
  }
  console.log(`[ok] ${oldBase} → ${newBase}：${(st.size / 1048576).toFixed(2)}MB → ${(outSize / 1048576).toFixed(2)}MB`);
}

console.log('—'.repeat(40));
console.log(`完成：压缩 ${converted} 张，跳过 ${skipped} 张；`);
if (!dry && converted > 0) {
  console.log(`源文件体积 ${(beforeBytes / 1048576).toFixed(1)}MB → ${((beforeBytes - savedBytes) / 1048576).toFixed(1)}MB，节省 ${(savedBytes / 1048576).toFixed(1)}MB`);
}
