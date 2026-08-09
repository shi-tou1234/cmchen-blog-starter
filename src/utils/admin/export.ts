import {
  setMsg,
  getToken,
  getBranch,
  saveGitHubDraft,
  getFileMeta,
  listBlogMarkdownEntries,
  decodeFileContent,
  extractCategoriesFromMarkdown,
  sanitizeFileName,
  parsePostFrontmatter,
} from "./core";

function escapeCsvField(value: string) {
  const str = String(value || "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportPosts(format: "csv" | "markdown") {
  const msgEl = document.getElementById("export-msg");
  const progressWrap = document.getElementById("export-progress-wrap");
  const progressBar = document.getElementById("export-progress-bar");
  const progressText = document.getElementById("export-progress-text");
  const token = getToken();
  const branch = getBranch();

  if (!token) {
    setMsg(msgEl, "请先填写 GitHub Token", true);
    return;
  }

  setMsg(msgEl, "正在加载 JSZip 库...");
  saveGitHubDraft();
  if (progressWrap) progressWrap.classList.remove("hidden");
  if (progressBar) progressBar.style.width = "0%";
  if (progressText) progressText.textContent = "0 / 0";

  let JSZip: any;
  try {
    JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
  } catch {
    setMsg(msgEl, "JSZip 库加载失败，请检查网络连接", true);
    if (progressWrap) progressWrap.classList.add("hidden");
    return;
  }

  setMsg(msgEl, "正在获取文章列表...");

  let entries: { path: string; slug: string; lang: string }[];
  try {
    entries = await listBlogMarkdownEntries(token, branch);
  } catch (error) {
    setMsg(msgEl, `获取文章列表失败：${error instanceof Error ? error.message : String(error)}`, true);
    if (progressWrap) progressWrap.classList.add("hidden");
    return;
  }

  if (entries.length === 0) {
    setMsg(msgEl, "没有找到可导出的文章", true);
    if (progressWrap) progressWrap.classList.add("hidden");
    return;
  }

  setMsg(msgEl, `正在获取 ${entries.length} 篇文章内容...`);
  if (progressText) progressText.textContent = `0 / ${entries.length}`;

  const posts: { path: string; slug: string; lang: string; markdown: string }[] = [];
  const total = entries.length;
  let completed = 0;
  const CONCURRENCY = 6;
  const entryQueue = [...entries];
  const processEntry = async (entry: { path: string; slug: string; lang: string }) => {
    try {
      const meta = await getFileMeta(entry.path, token, branch);
      if (meta?.content) {
        const rawMarkdown = decodeFileContent(meta.content);
        posts.push({ ...entry, markdown: rawMarkdown });
      }
    } catch {
      posts.push({ ...entry, markdown: "# 加载失败\n\n无法获取此文章内容。" });
    }
    completed++;
    const pct = Math.round((completed / total) * 100);
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressText) progressText.textContent = `${completed} / ${total}`;
  };
  const entryWorkers: Promise<void>[] = [];
  const runEntryWorker = async () => {
    while (entryQueue.length > 0) {
      const entry = entryQueue.shift();
      if (!entry) break;
      await processEntry(entry);
    }
  };
  for (let i = 0; i < Math.min(CONCURRENCY, entries.length); i++) {
    entryWorkers.push(runEntryWorker());
  }
  await Promise.all(entryWorkers);

  setMsg(msgEl, "正在生成压缩包...");
  const zip = new JSZip();

  if (format === "csv") {
    const csvRows: string[][] = [["title", "slug", "lang", "date", "description", "category"]];
    for (const post of posts) {
      const { frontmatter } = parsePostFrontmatter(post.markdown);
      const categories = extractCategoriesFromMarkdown(post.markdown);
      const row = [
        escapeCsvField(frontmatter.title || ""),
        post.slug,
        post.lang,
        frontmatter.pubDate || "",
        escapeCsvField(frontmatter.description || ""),
        escapeCsvField(categories.join(" / ")),
      ];
      csvRows.push(row);
      const langDir = post.lang === "zh-cn" ? "中文" : "English";
      const filePath = `${langDir}/${sanitizeFileName(post.slug)}.csv`;
      zip.file(filePath, `\uFEFF${row.join(",")}\n`);
    }
    const csvContent = csvRows.map((r) => r.join(",")).join("\n");
    zip.file("_全部元数据汇总.csv", `\uFEFF${csvContent}\n`);
  } else if (format === "markdown") {
    for (const post of posts) {
      const langDir = post.lang === "zh-cn" ? "中文" : "English";
      const filePath = `${langDir}/${sanitizeFileName(post.slug)}.md`;
      zip.file(filePath, post.markdown);
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, `blog-export-${Date.now()}.zip`);
  setMsg(msgEl, `导出成功：${posts.length} 篇文章已打包为 ZIP（按语言分目录，每篇独立文件）`);
  if (progressWrap) progressWrap.classList.add("hidden");
}

export function initExportHandlers() {
  document.getElementById("export-csv-btn")?.addEventListener("click", async () => {
    await exportPosts("csv");
  });

  document.getElementById("export-markdown-btn")?.addEventListener("click", async () => {
    await exportPosts("markdown");
  });
}
