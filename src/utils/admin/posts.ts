import {
  setMsg,
  getToken,
  getBranch,
  saveGitHubDraft,
  getFileMeta,
  upsertFile,
  deleteFile,
  listFilesByPrefix,
  listBlogMarkdownEntries,
  uploadBlogAssetFile,
  renderPdfPagesToImages,
  savePreviewDraft,
  applyPreviewResult,
  getPreviewPageUrl,
  categoryOptionMeta,
  setCategoryOptionMeta,
  decodeFileContent,
  getNowDateTimeLocal,
  normalizeSlug,
  toIsoDateTime,
  buildPostMarkdown,
  getPrimaryCategoryFromItems,
  getSubcategoriesFromItems,
  extractCategoriesFromMarkdown,
  parsePostFrontmatter,
} from "./core";
import {
  CATEGORY_OPTIONS_LIMIT,
  CATEGORY_CACHE_KEY,
  CATEGORY_CACHE_TTL,
  ABOUT_SPEC_PATH_PREFIX,
  REPO_OWNER,
  REPO_NAME,
} from "./constants";

// 本地草稿 key（自动保存编辑器状态，刷新可恢复）
const POST_DRAFT_KEY = "cmchen_admin_post_draft";

// ===== Post list item 渲染（替代原 <option>） =====

interface PostListItemMeta {
  title?: string;
  pubDate?: string;
  pinned?: boolean;
  category?: string;
}

function renderPostListItem(entry: { path: string; slug: string; lang: string }, meta?: PostListItemMeta) {
  const item = document.createElement("div");
  item.className = "post-list-item";
  item.dataset.path = entry.path;
  item.setAttribute("role", "option");
  item.tabIndex = 0;

  const titleRow = document.createElement("div");
  titleRow.className = "post-list-item-title";

  if (meta?.pinned) {
    const pin = document.createElement("span");
    pin.className = "post-list-item-pin";
    pin.textContent = "📌";
    pin.title = "已置顶";
    titleRow.appendChild(pin);
  }

  const titleText = document.createElement("span");
  titleText.textContent = meta?.title || entry.slug;
  titleText.title = entry.path;
  titleRow.appendChild(titleText);

  const metaRow = document.createElement("div");
  metaRow.className = "post-list-item-meta";

  const langTag = document.createElement("span");
  langTag.textContent = entry.lang;
  metaRow.appendChild(langTag);

  if (meta?.pubDate) {
    const dateTag = document.createElement("span");
    dateTag.textContent = String(meta.pubDate).slice(0, 10);
    metaRow.appendChild(dateTag);
  }

  if (meta?.category) {
    const catTag = document.createElement("span");
    catTag.textContent = meta.category;
    metaRow.appendChild(catTag);
  }

  item.appendChild(titleRow);
  item.appendChild(metaRow);
  return item;
}

function updatePostListItem(path: string, meta: PostListItemMeta) {
  const container = document.getElementById("post-select");
  if (!container) return;
  const item = container.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
  if (!item) return;
  const newItem = renderPostListItem(
    { path, slug: item.dataset.slug || "", lang: item.dataset.lang || "" },
    meta
  );
  // 保留 dataset
  newItem.dataset.slug = item.dataset.slug || "";
  newItem.dataset.lang = item.dataset.lang || "";
  // 保留选中状态
  if (item.classList.contains("is-selected")) newItem.classList.add("is-selected");
  item.replaceWith(newItem);
}

function setSelectedPostPath(path: string) {
  const container = document.getElementById("post-select");
  if (!container) return;
  container.querySelectorAll<HTMLElement>(".post-list-item").forEach((el) => {
    el.classList.toggle("is-selected", el.dataset.path === path);
  });
}

function getSelectedPostPath(): string {
  const container = document.getElementById("post-select");
  return container?.querySelector<HTMLElement>(".post-list-item.is-selected")?.dataset.path || "";
}

// ===== 本地草稿自动保存 =====

function collectPostDraft() {
  const get = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value || "";
  const pinnedEl = document.getElementById("post-pinned") as HTMLInputElement | null;
  return {
    title: get("post-title"),
    slug: get("post-slug"),
    lang: get("post-lang"),
    date: get("post-date"),
    desc: get("post-desc"),
    cover: get("post-cover"),
    category: get("post-category"),
    subcategory: get("post-subcategory"),
    content: get("post-content"),
    pinned: pinnedEl?.checked || false,
    updatedAt: Date.now(),
  };
}

function savePostDraftLocally() {
  try {
    const draft = collectPostDraft();
    localStorage.setItem(POST_DRAFT_KEY, JSON.stringify(draft));
    const statusEl = document.getElementById("post-autosave-status");
    if (statusEl) {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      statusEl.textContent = `已自动保存 ${hh}:${mm}`;
    }
  } catch (err) {
    console.warn("[admin] 草稿自动保存失败:", err);
  }
}

function loadPostDraftLocally(): boolean {
  const raw = localStorage.getItem(POST_DRAFT_KEY);
  if (!raw) return false;
  try {
    const draft = JSON.parse(raw);
    const setVal = (id: string, val: string) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el && typeof val === "string") el.value = val;
    };
    setVal("post-title", draft.title || "");
    setVal("post-slug", draft.slug || "");
    setVal("post-lang", draft.lang || "zh-cn");
    setVal("post-date", draft.date || "");
    setVal("post-desc", draft.desc || "");
    setVal("post-cover", draft.cover || "");
    setVal("post-category", draft.category || "");
    setVal("post-subcategory", draft.subcategory || "");
    setVal("post-content", draft.content || "");
    const pinnedEl = document.getElementById("post-pinned") as HTMLInputElement | null;
    if (pinnedEl) pinnedEl.checked = !!draft.pinned;
    return true;
  } catch {
    localStorage.removeItem(POST_DRAFT_KEY);
    return false;
  }
}

function clearPostDraftLocally() {
  localStorage.removeItem(POST_DRAFT_KEY);
  const statusEl = document.getElementById("post-autosave-status");
  if (statusEl) statusEl.textContent = "";
}

// ===== 实时预览 iframe postMessage =====

function getAdminPageTheme() {
  const rootTheme = document.documentElement.getAttribute("data-theme");
  if (rootTheme === "dark") return "dark";
  if (rootTheme === "light") return "light";
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

function pushContentToPreview() {
  const iframe = document.getElementById("post-preview-iframe") as HTMLIFrameElement | null;
  let content = (document.getElementById("post-content") as HTMLTextAreaElement | null)?.value || "";
  if (content.includes("./assets/")) {
    content = rewritePreviewAssetPaths(content);
  }
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(
    { type: "admin-preview-update", content, theme: getAdminPageTheme() },
    window.location.origin
  );
}

// 预览专用：把正文里相对博客的 ./assets/<name> 重写成 jsDelivr CDN URL。
// raw.githubusercontent 在部分网络（如国内）不可达，改用项目已使用的 jsDelivr CDN 兜底。
// 仅用于预览推送，不改变保存在文章里的 markdown（发布照常走 ./assets/ 相对路径）。
function rewritePreviewAssetPaths(content: string): string {
  const slug = (document.getElementById("post-slug") as HTMLInputElement | null)?.value.trim() || "";
  if (!slug) return content;
  const branch = getBranch();
  const base = `https://cdn.jsdelivr.net/gh/${encodeURIComponent(REPO_OWNER)}/${encodeURIComponent(REPO_NAME)}@${encodeURIComponent(branch)}/src/content/blog/${encodeURIComponent(slug)}/assets/`;
  return String(content).replace(/\.\/assets\//g, base);
}

// debounce 工具
function debounce<T extends (...args: any[]) => void>(fn: T, wait: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  }) as T;
}

const pushPreviewDebounced = debounce(pushContentToPreview, 300);
const autoSaveDebounced = debounce(savePostDraftLocally, 2000);

// 在正文 textarea 光标处插入（有选中则替换选中），无有效光标时回退到结尾。
// 插入后把光标放到片段末尾并聚焦，方便继续录入。
function insertSnippetAtCaret(textarea: HTMLTextAreaElement, insertion: string) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const hasValidCaret = document.activeElement === textarea || textarea.value.length === 0 || start > 0;
  let before: string;
  let after: string;
  if (hasValidCaret) {
    before = textarea.value.slice(0, start);
    after = textarea.value.slice(end);
  } else {
    before = textarea.value;
    after = "";
  }
  textarea.value = before + insertion + after;
  const newPos = before.length + insertion.length;
  textarea.setSelectionRange(newPos, newPos);
  textarea.focus();
}

// 在上传区旁的缩略图容器里展示一张图片预览（本地 objectURL，与预览 iframe 无关）。
function addUploadThumb(name: string, url: string) {
  const container = document.getElementById("post-upload-thumbs");
  if (!container) return;
  const item = document.createElement("div");
  item.className = "post-upload-thumb";
  item.title = name;

  const img = document.createElement("img");
  img.src = url;
  img.alt = name;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "post-upload-thumb-remove";
  close.textContent = "×";
  close.title = "移除预览";
  close.addEventListener("click", () => {
    URL.revokeObjectURL(url);
    item.remove();
  });

  item.appendChild(img);
  item.appendChild(close);
  container.appendChild(item);
}

// ===== Post helper functions =====

function initPostDateDefault() {
  const input = document.getElementById("post-date");
  if (input && !input.value) {
    input.value = getNowDateTimeLocal();
  }
}

function toDateTimeLocalValue(isoLikeValue: string) {
  if (!isoLikeValue) return "";
  const date = new Date(isoLikeValue);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeCategoryOptionList(categories: string[]) {
  return [...new Set((categories || []).map((item) => String(item).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { sensitivity: "base" }))
    .slice(0, CATEGORY_OPTIONS_LIMIT);
}

function renderSubcategoryOptions(rootCategory: string) {
  const subcategoryDatalist = document.getElementById("post-subcategory-options");
  if (!(subcategoryDatalist instanceof HTMLDataListElement)) return;
  const subcategories = normalizeCategoryOptionList(categoryOptionMeta.subcategoriesByRoot[rootCategory] || []);
  subcategoryDatalist.innerHTML = "";
  subcategories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    subcategoryDatalist.appendChild(option);
  });
}

function syncSubcategoryOptions() {
  const rootCategory = (document.getElementById("post-category")?.value || "").trim();
  renderSubcategoryOptions(rootCategory);
}

function renderCategoryOptions(meta: { topLevelCategories: string[]; subcategoriesByRoot: Record<string, string[]> }) {
  const categoryDatalist = document.getElementById("post-category-options");
  const categorySelect = document.getElementById("post-category-select");
  const nextMeta = meta || { topLevelCategories: [], subcategoriesByRoot: {} };
  setCategoryOptionMeta(nextMeta);
  const unique = normalizeCategoryOptionList(nextMeta.topLevelCategories);

  if (categoryDatalist instanceof HTMLDataListElement) {
    categoryDatalist.innerHTML = "";
    unique.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      categoryDatalist.appendChild(option);
    });
  }

  if (categorySelect instanceof HTMLSelectElement) {
    categorySelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "手动输入新大分类";
    categorySelect.appendChild(placeholder);
    unique.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });
  }

  syncSubcategoryOptions();
}

function sanitizeMarkdownImageAlt(content: string) {
  return String(content || "").replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_matched, url) => `![](${url})`);
}

async function loadCategoryOptions(
  preloadedEntries: { path: string; slug: string; lang: string }[],
  onEntryParsed?: (entry: { path: string; slug: string; lang: string }, markdown: string, frontmatter: Record<string, string>) => void
) {
  const token = getToken();
  const branch = getBranch();
  if (!token) {
    renderCategoryOptions({ topLevelCategories: [], subcategoriesByRoot: {} });
    return;
  }

  // 缓存命中时，仅复用分类元数据；列表项的标题/日期/置顶信息仍需逐篇拉取（轻量回填）
  let cacheHit = false;
  try {
    const cached = localStorage.getItem(CATEGORY_CACHE_KEY);
    if (cached) {
      const cache = JSON.parse(cached);
      if (cache && cache.branch === branch && (Date.now() - cache.ts) < CATEGORY_CACHE_TTL && cache.topLevelCategories && cache.topLevelCategories.length > 0) {
        renderCategoryOptions(cache);
        cacheHit = true;
      }
    }
  } catch (err) { console.warn("[admin] 分类缓存读取失败:", err); }

  try {
    const entries = preloadedEntries && preloadedEntries.length > 0
      ? preloadedEntries
      : await listBlogMarkdownEntries(token, branch).catch(() => []);
    const categorySet = new Set<string>();
    const subcategoriesByRoot: Record<string, Set<string>> = {};

    const CONCURRENCY = 6;
    const entryQueue = [...entries];
    const processEntry = async (entry: { path: string; slug: string; lang: string }) => {
      try {
        const meta = await getFileMeta(entry.path, token, branch, true);
        const markdown = decodeFileContent(meta?.content || "");
        const cats = extractCategoriesFromMarkdown(markdown);
        const rootCategory = getPrimaryCategoryFromItems(cats);
        if (rootCategory) {
          categorySet.add(rootCategory);
          const subcategories = getSubcategoriesFromItems(cats);
          if (subcategories.length > 0) {
            if (!subcategoriesByRoot[rootCategory]) subcategoriesByRoot[rootCategory] = new Set();
            for (const sub of subcategories) subcategoriesByRoot[rootCategory].add(sub);
          }
        }
        // 回填列表项的标题/日期/置顶信息
        if (onEntryParsed) {
          const fm = parsePostFrontmatter(markdown).frontmatter;
          onEntryParsed(entry, markdown, fm);
        }
      } catch (err) { console.warn("[admin] 单篇文章分类提取失败:", entry?.path, err); }
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

    // 缓存未命中时才写入；命中时跳过避免覆盖未拉取到的完整分类
    if (!cacheHit) {
      const categoryMeta = {
        topLevelCategories: Array.from(categorySet),
        subcategoriesByRoot: Object.fromEntries(
          Object.entries(subcategoriesByRoot).map(([rootCategory, values]) => [rootCategory, Array.from(values)])
        ),
      };
      renderCategoryOptions(categoryMeta);
      try {
        localStorage.setItem(CATEGORY_CACHE_KEY, JSON.stringify({
          branch,
          ts: Date.now(),
          topLevelCategories: categoryMeta.topLevelCategories,
          subcategoriesByRoot: categoryMeta.subcategoriesByRoot,
        }));
      } catch (err) { console.warn("[admin] 分类缓存写入失败:", err); }
    }
  } catch (err) {
    console.warn("[admin] 加载分类选项失败:", err);
    if (!cacheHit) renderCategoryOptions({ topLevelCategories: [], subcategoriesByRoot: {} });
  }
}

function clearPostEditor() {
  const titleInput = document.getElementById("post-title");
  const slugInput = document.getElementById("post-slug");
  const langInput = document.getElementById("post-lang");
  const dateInput = document.getElementById("post-date");
  const descInput = document.getElementById("post-desc");
  const coverInput = document.getElementById("post-cover");
  const categoryInput = document.getElementById("post-category");
  const subcategoryInput = document.getElementById("post-subcategory");
  const contentInput = document.getElementById("post-content");
  const categorySelect = document.getElementById("post-category-select");

  if (titleInput) titleInput.value = "";
  if (slugInput) slugInput.value = "";
  if (langInput) langInput.value = "zh-cn";
  if (dateInput) dateInput.value = getNowDateTimeLocal();
  if (descInput) descInput.value = "";
  if (coverInput) coverInput.value = "";
  if (categoryInput) categoryInput.value = "";
  if (subcategoryInput) subcategoryInput.value = "";
  if (categorySelect instanceof HTMLSelectElement) categorySelect.value = "";
  if (contentInput) contentInput.value = "";
  const pinnedCheckbox = document.getElementById("post-pinned");
  if (pinnedCheckbox instanceof HTMLInputElement) pinnedCheckbox.checked = false;
  syncSubcategoryOptions();
}

function getSelectedPostSlug() {
  const selectedPath = getSelectedPostPath();
  if (!selectedPath) return "";
  const matched = selectedPath.match(/^src\/content\/blog\/(.+)\/(zh-cn|en)\.md$/);
  return matched?.[1] || "";
}

function isTimestampFallbackSlug(slug: string) {
  return /^post-\d{10,}$/.test(slug);
}

function ensurePostSlug() {
  const slugInput = document.getElementById("post-slug");
  const title = (document.getElementById("post-title")?.value || "").trim();
  const titleSlug = normalizeSlug(title);
  const currentSlug = normalizeSlug(slugInput?.value || "");
  if (currentSlug && !(isTimestampFallbackSlug(currentSlug) && titleSlug)) {
    if (slugInput) slugInput.value = currentSlug;
    return currentSlug;
  }
  const selectedSlug = normalizeSlug(getSelectedPostSlug());
  if (selectedSlug && !(isTimestampFallbackSlug(selectedSlug) && titleSlug)) {
    if (slugInput) slugInput.value = selectedSlug;
    return selectedSlug;
  }
  const fallbackSlug = titleSlug || `post-${Date.now()}`;
  if (slugInput) slugInput.value = fallbackSlug;
  return fallbackSlug;
}

// ===== Core post functions =====

export async function loadPostList() {
  const msgEl = document.getElementById("post-msg");
  const selectEl = document.getElementById("post-select");
  const token = getToken();
  const branch = getBranch();

  if (!token) {
    if (selectEl) selectEl.innerHTML = "";
    setMsg(msgEl, "请先填写 GitHub Token 后再加载文章列表", true);
    return;
  }

  setMsg(msgEl, "加载文章列表中...");
  saveGitHubDraft();
  let entries: { path: string; slug: string; lang: string }[] = [];
  try {
    entries = await listBlogMarkdownEntries(token, branch);
  } catch (err: any) {
    // 鉴权类错误（401/403）不应静默回退，需提示用户重新登录
    const status = err?.status || err?.response?.status;
    if (status === 401 || status === 403) {
      console.warn("[admin] token 已失效或无权限，请重新登录:", err);
      setMsg(msgEl, "登录已失效，请重新登录", "error");
      if (selectEl) selectEl.innerHTML = "";
      return;
    }
    console.warn("[admin] 文章列表加载失败:", err);
    setMsg(msgEl, "文章列表加载失败，请检查网络后重试", true);
    if (selectEl) selectEl.innerHTML = "";
    return;
  }

  // 渲染列表项（初始仅 slug + lang，后续异步回填标题/日期/分类/置顶）
  if (selectEl) {
    selectEl.innerHTML = "";
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "post-list-empty";
      empty.textContent = "暂无文章";
      selectEl.appendChild(empty);
    } else {
      entries.forEach((entry) => {
        const item = renderPostListItem(entry);
        item.dataset.slug = entry.slug;
        item.dataset.lang = entry.lang;
        selectEl.appendChild(item);
      });
    }
  }

  const enrichCallback = (entry: { path: string; slug: string; lang: string }, _markdown: string, fm: Record<string, string>) => {
    updatePostListItem(entry.path, {
      title: fm.title,
      pubDate: fm.pubDate,
      pinned: fm.pinned === "true" || fm.pinned === true,
      category: extractCategoriesFromMarkdown(_markdown)[0] || "",
    });
  };

  setMsg(msgEl, `已加载 ${entries.length} 篇文章`);
  await loadCategoryOptions(entries, enrichCallback).catch(() => {});
}

async function loadSelectedPostToEditor() {
  const msgEl = document.getElementById("post-msg");
  const selectedPath = getSelectedPostPath();
  const token = getToken();
  const branch = getBranch();
  const categorySelect = document.getElementById("post-category-select");

  if (!token) throw new Error("请先填写 GitHub Token");
  if (!selectedPath) throw new Error("请先选择文章");

  const meta = await getFileMeta(selectedPath, token, branch);
  if (!meta?.content) throw new Error("文章内容为空或不存在");

  const rawMarkdown = decodeFileContent(meta.content);
  const { frontmatter, content } = parsePostFrontmatter(rawMarkdown);

  const slugMatched = selectedPath.match(/^src\/content\/blog\/(.+)\/(zh-cn|en)\.md$/);
  const slug = slugMatched?.[1] || "";
  const lang = slugMatched?.[2] || "zh-cn";

  const titleInput = document.getElementById("post-title");
  const slugInput = document.getElementById("post-slug");
  const langInput = document.getElementById("post-lang");
  const dateInput = document.getElementById("post-date");
  const descInput = document.getElementById("post-desc");
  const coverInput = document.getElementById("post-cover");
  const categoryInput = document.getElementById("post-category");
  const subcategoryInput = document.getElementById("post-subcategory");
  const contentInput = document.getElementById("post-content");

  if (titleInput) titleInput.value = frontmatter.title || "";
  if (slugInput) slugInput.value = slug;
  if (langInput) langInput.value = lang;
  if (dateInput) dateInput.value = toDateTimeLocalValue(frontmatter.pubDate || "") || getNowDateTimeLocal();
  if (descInput) descInput.value = frontmatter.description || "";
  if (coverInput) coverInput.value = frontmatter.image || "";
  if (categoryInput) {
    const parsedCategories = extractCategoriesFromMarkdown(rawMarkdown);
    const currentCategory = parsedCategories[0] || "";
    const subCategory = parsedCategories[1] || "";
    categoryInput.value = currentCategory;
    if (subcategoryInput) subcategoryInput.value = subCategory;
    if (categorySelect instanceof HTMLSelectElement) {
      categorySelect.value = currentCategory;
      if (categorySelect.value !== currentCategory) categorySelect.value = "";
    }
    syncSubcategoryOptions();
  }
  if (contentInput) contentInput.value = (content || "").trim();

  const pinnedCheckbox = document.getElementById("post-pinned");
  if (pinnedCheckbox instanceof HTMLInputElement) {
    pinnedCheckbox.checked = frontmatter.pinned === "true" || frontmatter.pinned === true;
  }

  // 载入新文章后清掉旧草稿，避免误覆盖；并推送到预览 iframe
  clearPostDraftLocally();
  pushContentToPreview();

  setMsg(msgEl, `已载入：${slug} (${lang})`);
}

// ===== Markdown snippet helpers =====

function insertAtCursor(textarea: HTMLTextAreaElement | null, beforeText: string, afterText = "", fallbackSelection = "") {
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const selected = textarea.value.slice(start, end);
  const inner = selected || fallbackSelection;
  const insertion = `${beforeText}${inner}${afterText}`;
  textarea.setRangeText(insertion, start, end, "end");
  textarea.focus();
}

function insertMarkdownSnippet(type: string) {
  const textarea = document.getElementById("post-content") as HTMLTextAreaElement | null;
  if (!textarea || !type) return;

  const snippets: Record<string, () => void> = {
    app: () => insertAtCursor(textarea, "[📱 应用名称](https://example.com)\n\n> 简介：一句话说明这个应用适合做什么。\n"),
    link: () => insertAtCursor(textarea, "[链接标题](https://example.com)"),
    table: () => insertAtCursor(textarea, "| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容1 | 内容2 | 内容3 |\n"),
    tip: () => insertAtCursor(textarea, ":::tip\n这里填写提示内容\n:::\n"),
    "formula-inline": () => insertAtCursor(textarea, "$", "$", "a^2+b^2=c^2"),
    "formula-block": () => insertAtCursor(textarea, "$$\n", "\n$$\n", "\\int_a^b f(x)\\,dx"),
    derivation: () => insertAtCursor(textarea, "\n\n:::derivation\n**推导过程：**\n\n在此填写推导内容...\n:::\n\n"),
    "code-inline": () => insertAtCursor(textarea, "`", "`", "code"),
    "code-block": () => insertAtCursor(textarea, "```ts\n", "\n```\n", "console.log('hello')"),
    bold: () => insertAtCursor(textarea, "**", "**", "加粗文本"),
    italic: () => insertAtCursor(textarea, "*", "*", "斜体文本"),
    "heading-2": () => insertAtCursor(textarea, "## 二级标题\n"),
    "heading-3": () => insertAtCursor(textarea, "### 三级标题\n"),
    blockquote: () => insertAtCursor(textarea, "> 这是一段引用\n"),
    ul: () => insertAtCursor(textarea, "- 列表项 1\n- 列表项 2\n"),
    ol: () => insertAtCursor(textarea, "1. 列表项 1\n2. 列表项 2\n"),
    task: () => insertAtCursor(textarea, "- [ ] 待办事项\n- [x] 已完成事项\n"),
    strike: () => insertAtCursor(textarea, "~~", "~~", "删除线文本"),
    hr: () => insertAtCursor(textarea, "\n---\n"),
    // ===== 自定义样式（对照 Momo special 演示文章，一键插入语法模板） =====
    underline: () => insertAtCursor(textarea, "++", "++", "下划线文本"),
    spoiler: () => insertAtCursor(textarea, "!!", "!!", "模糊文本，悬停或点击后清晰"),
    rainbow: () => insertAtCursor(textarea, "==", "==", "彩虹文字"),
    ruby: () => insertAtCursor(textarea, "{汉字}(hàn|zì)"),
    "quote-card": () => insertAtCursor(textarea, "\n:::quote\n在此填写引用内容\n\n<br><right>—— 出处</right>\n:::\n"),
    footnote: () => {
      // 自动选取正文中未占用的脚注编号：光标处插入引用，文末追加定义
      const used = Array.from(textarea.value.matchAll(/\[\^(\d+)\]/g)).map((m) => parseInt(m[1], 10));
      const next = (used.length ? Math.max(...used) : 0) + 1;
      insertAtCursor(textarea, `[^${next}]`);
      textarea.setRangeText(`\n\n[^${next}]: 在此填写脚注内容\n`, textarea.value.length, textarea.value.length, "end");
      textarea.focus();
    },
    "music-card": () => insertAtCursor(textarea, "\n::music{id=\"网易云歌曲ID\"}\n"),
    "github-card": () => insertAtCursor(textarea, "\n::github{repo=\"用户名/仓库名\"}\n"),
  };

  const handler = snippets[type];
  if (!handler) return;
  handler();
}

// ===== Event handler initialization =====

export function initPostHandlers() {
  const categorySelect = document.getElementById("post-category-select");
  const postSelectEl = document.getElementById("post-select");

  initPostDateDefault();

  // 首次进入后台时尝试恢复本地草稿（仅在未选择文章时）
  const restored = loadPostDraftLocally();
  if (restored) {
    setMsg(document.getElementById("post-msg"), "已恢复上次未保存的草稿");
    setTimeout(pushContentToPreview, 100);
  }

  document.getElementById("about-music-files")?.addEventListener("change", () => {
    const files = document.getElementById("about-music-files")?.files;
    const countEl = document.getElementById("about-music-files-count");
    if (!countEl) return;
    const count = files?.length || 0;
    countEl.textContent = count > 0 ? `已选择 ${count} 个 MP3` : "未选择文件";
  });

  document.getElementById("post-files")?.addEventListener("change", () => {
    const files = document.getElementById("post-files")?.files;
    const countEl = document.getElementById("post-files-count");
    if (!countEl) return;
    const count = files?.length || 0;
    countEl.textContent = count > 0 ? `已选择 ${count} 个文件` : "未选择文件";
  });

  document.getElementById("post-cover-file")?.addEventListener("change", () => {
    const files = document.getElementById("post-cover-file")?.files;
    const nameEl = document.getElementById("post-cover-filename");
    if (!nameEl) return;
    const name = files?.[0]?.name || "";
    nameEl.textContent = name || "未选择";
  });

  document.getElementById("refresh-post-list-btn")?.addEventListener("click", loadPostList);

  categorySelect?.addEventListener("change", () => {
    const picked = (categorySelect.value || "").trim();
    const inputEl = document.getElementById("post-category");
    if (inputEl && picked) inputEl.value = picked;
    syncSubcategoryOptions();
  });

  document.getElementById("post-category")?.addEventListener("input", () => {
    if (!(categorySelect instanceof HTMLSelectElement)) return;
    const value = (document.getElementById("post-category")?.value || "").trim();
    categorySelect.value = value;
    if (categorySelect.value !== value) categorySelect.value = "";
    syncSubcategoryOptions();
  });

  document.getElementById("load-selected-post-btn")?.addEventListener("click", async () => {
    const msgEl = document.getElementById("post-msg");
    try {
      await loadSelectedPostToEditor();
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  document.getElementById("new-post-btn")?.addEventListener("click", () => {
    clearPostEditor();
    clearPostDraftLocally();
    setMsg(document.getElementById("post-msg"), "已切换到新建文章模式");
    pushContentToPreview();
  });

  document.getElementById("open-preview-editor-btn")?.addEventListener("click", () => {
    savePreviewDraft();
    const previewUrl = getPreviewPageUrl();
    window.open(previewUrl, "_blank", "noopener,noreferrer");
    setMsg(document.getElementById("post-msg"), "已打开预览编辑器，新内容可在返回后回填");
  });

  document.getElementById("apply-preview-content-btn")?.addEventListener("click", () => {
    const applied = applyPreviewResult();
    if (!applied) {
      setMsg(document.getElementById("post-msg"), "未检测到预览回填内容，请先在预览页点击\u201C返回发布\u201D", true);
    } else {
      pushContentToPreview();
    }
  });

  // 列表项点击：选中；双击/Enter：载入到编辑器
  postSelectEl?.addEventListener("click", (event: MouseEvent) => {
    const target = (event.target as HTMLElement)?.closest<HTMLElement>(".post-list-item");
    if (!target) return;
    const path = target.dataset.path || "";
    if (!path) return;
    setSelectedPostPath(path);
  });

  postSelectEl?.addEventListener("dblclick", (event: MouseEvent) => {
    const target = (event.target as HTMLElement)?.closest<HTMLElement>(".post-list-item");
    if (!target) return;
    const path = target.dataset.path || "";
    if (!path) return;
    setSelectedPostPath(path);
    loadSelectedPostToEditor().catch((error) => {
      setMsg(document.getElementById("post-msg"), String(error), true);
    });
  });

  postSelectEl?.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    const target = (event.target as HTMLElement)?.closest<HTMLElement>(".post-list-item");
    if (!target) return;
    event.preventDefault();
    const path = target.dataset.path || "";
    if (!path) return;
    setSelectedPostPath(path);
    loadSelectedPostToEditor().catch((error) => {
      setMsg(document.getElementById("post-msg"), String(error), true);
    });
  });

  // 搜索过滤
  document.getElementById("post-search")?.addEventListener("input", (event: Event) => {
    const keyword = ((event.target as HTMLInputElement)?.value || "").trim().toLowerCase();
    postSelectEl?.querySelectorAll<HTMLElement>(".post-list-item").forEach((item) => {
      if (!keyword) {
        item.style.display = "";
        return;
      }
      const slug = (item.dataset.slug || "").toLowerCase();
      const title = (item.querySelector(".post-list-item-title")?.textContent || "").toLowerCase();
      const lang = (item.dataset.lang || "").toLowerCase();
      const matched = slug.includes(keyword) || title.includes(keyword) || lang.includes(keyword);
      item.style.display = matched ? "" : "none";
    });
  });

  // 工具栏按钮 → insertMarkdownSnippet
  document.querySelectorAll<HTMLElement>(".toolbar-btn[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action || "";
      if (!action) return;
      insertMarkdownSnippet(action);
      pushContentToPreview();
      autoSaveDebounced();
    });
  });

  // 正文 textarea：实时推送预览 + 自动保存草稿
  document.getElementById("post-content")?.addEventListener("input", () => {
    pushPreviewDebounced();
    autoSaveDebounced();
  });

  // 元数据字段变化时也自动保存草稿
  ["post-title", "post-slug", "post-lang", "post-date", "post-desc", "post-cover", "post-category", "post-subcategory"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", autoSaveDebounced);
  });
  document.getElementById("post-pinned")?.addEventListener("change", autoSaveDebounced);

    // iframe 加载完成后推送初始内容
  const previewIframe = document.getElementById("post-preview-iframe") as HTMLIFrameElement | null;
  if (previewIframe) {
    previewIframe.addEventListener("load", () => {
      // iframe 每次加载（含 reload）都推送当前内容
      pushContentToPreview();
    });
  }

  // 后台主题切换时同步预览 iframe 主题
  const themeObserver = new MutationObserver(() => {
    pushContentToPreview();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  document.getElementById("insert-iframe-btn")?.addEventListener("click", () => {
    const textarea = document.getElementById("post-content") as HTMLTextAreaElement | null;
    if (!textarea) return;
    const iframeTpl = `\n<iframe src="https://www.youtube.com/embed/VIDEO_ID" title="Video" frameborder="0" allowfullscreen></iframe>\n`;
    insertSnippetAtCaret(textarea, iframeTpl);
    pushContentToPreview();
    autoSaveDebounced();
  });

  // 上传 cover
  document.getElementById("upload-cover-btn")?.addEventListener("click", async () => {
    const msgEl = document.getElementById("post-msg");
    try {
      const token = getToken();
      const branch = getBranch();
      const slug = ensurePostSlug();
      const lang = (document.getElementById("post-lang")?.value || "zh-cn").trim();
      const files = document.getElementById("post-cover-file")?.files;

      if (!token) throw new Error("请先填写 GitHub Token");
      if (!files || files.length === 0) throw new Error("请先选择封面图片");

      const file = files[0];
      if (!file.type.startsWith("image/")) throw new Error("请选择图片文件作为封面");

      setMsg(msgEl, "正在上传封面图片...");
      const result = await uploadBlogAssetFile({ slug, lang, file, token, branch });
      const coverPath = `./assets/${result.name}`;
      const coverInput = document.getElementById("post-cover");
      if (coverInput) coverInput.value = coverPath;
      const fileInput = document.getElementById("post-cover-file");
      if (fileInput) fileInput.value = "";
      const nameEl = document.getElementById("post-cover-filename");
      if (nameEl) nameEl.textContent = "未选择";
      setMsg(msgEl, `封面图片上传成功：${result.name}（已自动填入封面路径）`);
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // Upload files
  document.getElementById("upload-files-btn")?.addEventListener("click", async () => {
    const msgEl = document.getElementById("post-msg");
    try {
      const token = getToken();
      const branch = getBranch();
      const slug = ensurePostSlug();
      const lang = (document.getElementById("post-lang")?.value || "zh-cn").trim();
      const files = document.getElementById("post-files")?.files;

      if (!token) throw new Error("请先填写 GitHub Token");
      if (!files || files.length === 0) throw new Error("请先选择文件");

      setMsg(msgEl, `上传中...（${files.length} 个文件）`);

      const uploaded: { name: string; type: string }[] = [];
      for (const file of files) {
        const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        if (isPdf) {
          setMsg(msgEl, `正在转换 PDF：${file.name}`);
          const imageFiles = await renderPdfPagesToImages(file);
          for (const imageFile of imageFiles) {
            const result = await uploadBlogAssetFile({ slug, lang, file: imageFile, token, branch });
            uploaded.push(result);
            addUploadThumb(result.name, URL.createObjectURL(imageFile));
          }
          continue;
        }
        const result = await uploadBlogAssetFile({ slug, lang, file, token, branch });
        uploaded.push(result);
        if (file.type.startsWith("image/")) {
          addUploadThumb(result.name, URL.createObjectURL(file));
        }
      }

      const textarea = document.getElementById("post-content") as HTMLTextAreaElement | null;
      const snippets = uploaded.map((f) => {
        if (f.type.startsWith("image/")) return `![](./assets/${f.name})`;
        if (f.type.startsWith("video/")) return `<video controls src="./assets/${f.name}"></video>`;
        return `[${f.name}](./assets/${f.name})`;
      }).join("\n\n");

      if (snippets && textarea) {
        insertSnippetAtCaret(textarea, `\n\n${snippets}\n`);
      }
      const fileInput = document.getElementById("post-files");
      if (fileInput) fileInput.value = "";
      const countEl = document.getElementById("post-files-count");
      if (countEl) countEl.textContent = "未选择文件";
      setMsg(msgEl, `上传成功：${uploaded.length} 个文件（目录：${slug}/assets）`);
      pushContentToPreview();
      autoSaveDebounced();
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // Publish post
  document.getElementById("publish-post-btn")?.addEventListener("click", async () => {
    const msgEl = document.getElementById("post-msg");
    try {
      const token = getToken();
      const branch = getBranch();
      const lang = (document.getElementById("post-lang")?.value || "zh-cn").trim();
      const title = (document.getElementById("post-title")?.value || "").trim();
      const dateInput = (document.getElementById("post-date")?.value || "").trim();
      const date = toIsoDateTime(dateInput) || new Date().toISOString();
      const description = (document.getElementById("post-desc")?.value || "").trim();
      const image = (document.getElementById("post-cover")?.value || "").trim();
      const category = (document.getElementById("post-category")?.value || "").trim();
      const subCategory = (document.getElementById("post-subcategory")?.value || "").trim();
      const pinnedCheckbox = document.getElementById("post-pinned");
      const pinned = pinnedCheckbox instanceof HTMLInputElement ? pinnedCheckbox.checked : false;
      const contentInput = document.getElementById("post-content") as HTMLTextAreaElement | null;
      const content = sanitizeMarkdownImageAlt(contentInput?.value || "");
      if (contentInput) contentInput.value = content;
      const inputSlug = ensurePostSlug();
      const fallbackSlug = normalizeSlug(title);
      const slug = inputSlug || fallbackSlug || `post-${Date.now()}`;

      if (!token) throw new Error("请先填写 GitHub Token");
      if (!title) throw new Error("请填写标题");

      const slugInput = document.getElementById("post-slug");
      if (slugInput && !slugInput.value.trim()) slugInput.value = slug;

      const markdown = buildPostMarkdown({
        title, date, updatedDate: new Date().toISOString(),
        description, image, category, subCategory,
        slugId: slug, content, pinned,
      });

      const path = `src/content/blog/${slug}/${lang}.md`;
      setMsg(msgEl, "发布中...");
      saveGitHubDraft();
      await upsertFile(path, markdown, `post: update ${slug}/${lang}`, token, branch);
      setMsg(msgEl, `发布成功：${path}`);
      await loadPostList();
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // Delete single language
  document.getElementById("delete-post-btn")?.addEventListener("click", async () => {
    const msgEl = document.getElementById("post-msg");
    try {
      const token = getToken();
      const branch = getBranch();
      const lang = (document.getElementById("post-lang")?.value || "zh-cn").trim();
      const slug = ensurePostSlug();
      if (!token) throw new Error("请先填写 GitHub Token");

      const path = `src/content/blog/${slug}/${lang}.md`;
      const confirmed = window.confirm(`确认删除文章文件？\n${path}`);
      if (!confirmed) return;

      setMsg(msgEl, "删除中...");
      saveGitHubDraft();
      const deleted = await deleteFile(path, `post: delete ${slug}/${lang}`, token, branch);
      if (!deleted) throw new Error(`未找到文件：${path}`);
      setMsg(msgEl, `删除成功：${path}`);
      await loadPostList();
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // Delete entire blog directory
  document.getElementById("delete-post-all-btn")?.addEventListener("click", async () => {
    const msgEl = document.getElementById("post-msg");
    try {
      const token = getToken();
      const branch = getBranch();
      const slug = ensurePostSlug();
      if (!token) throw new Error("请先填写 GitHub Token");

      const prefix = `src/content/blog/${slug}/`;
      const confirmed = window.confirm(`确认删除整个博客目录？\n${prefix}\n\n这会删除该目录下所有语言文件和资源文件。`);
      if (!confirmed) return;

      setMsg(msgEl, "扫描目录中...");
      const files = await listFilesByPrefix(prefix, token, branch);
      if (files.length === 0) throw new Error(`目录为空或不存在：${prefix}`);

      setMsg(msgEl, `删除中...（共 ${files.length} 个文件）`);
      saveGitHubDraft();
      for (const file of files) {
        await deleteFile(file, `post: delete ${slug} directory`, token, branch);
      }
      setMsg(msgEl, `删除成功：${prefix}（已删除 ${files.length} 个文件）`);
      await loadPostList();
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });
}
