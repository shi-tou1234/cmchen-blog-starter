import {
  AdminService,
  decodeFileContent,
  getNowDateTimeLocal,
  normalizeSlug,
  sanitizeFileName,
  toIsoDateTime,
  buildPostMarkdown,
} from "@/utils/admin-service";
import {
  getPrimaryCategoryFromItems,
  getSubcategoriesFromItems,
  normalizeCategoryItems,
} from "@utils/blog-taxonomy";
import {
  SESSION_KEY,
  ADMIN_GH_TOKEN_KEY,
  ADMIN_GH_TOKEN_REMEMBER_KEY,
  ADMIN_GH_BRANCH_KEY,
  ADMIN_GH_API_URL_KEY,
  ADMIN_PREVIEW_DRAFT_KEY,
  ADMIN_PREVIEW_RESULT_KEY,
  REPO_OWNER,
  REPO_NAME,
  GITHUB_API_DEFAULT,
  ADMIN_SECURITY_PATH,
  PREVIEW_TOOL_PATH,
} from "./constants";

export const BASE_URL = import.meta.env.BASE_URL || "/";

export const ADMIN_SECURITY_URL = typeof window !== "undefined"
  ? new URL("admin-security.json", `${window.location.origin}${BASE_URL}`).toString()
  : "";

const savedApiUrl = typeof localStorage !== "undefined"
  ? localStorage.getItem(ADMIN_GH_API_URL_KEY) || GITHUB_API_DEFAULT
  : GITHUB_API_DEFAULT;

export const adminService = new AdminService({
  repoOwner: REPO_OWNER,
  repoName: REPO_NAME,
  securityPath: ADMIN_SECURITY_PATH,
  securityUrl: ADMIN_SECURITY_URL,
  apiBaseUrl: savedApiUrl,
});

// Shared mutable state
export let categoryOptionMeta = {
  topLevelCategories: [] as string[],
  subcategoriesByRoot: {} as Record<string, string[]>,
};

export function setCategoryOptionMeta(meta: typeof categoryOptionMeta) {
  categoryOptionMeta = meta;
}

// Utility functions
export function setMsg(el: HTMLElement | null | undefined, message: string, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#dc2626" : "";
}

/**
 * 解析文章 frontmatter：返回键值对象与正文。统一供后台各模块使用，避免多套解析逻辑不一致。
 */
export function parsePostFrontmatter(markdown: string): { frontmatter: Record<string, string>; content: string } {
  const matched = String(markdown || "").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!matched) return { frontmatter: {}, content: markdown || "" };
  const rawFrontmatter = matched[1] || "";
  const frontmatter: Record<string, string> = {};
  rawFrontmatter.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx <= 0) return;
    frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
  });
  return { frontmatter, content: matched[2] || "" };
}

export function unlockPanel() {
  const loginSection = document.getElementById("login-section");
  const adminPanel = document.getElementById("admin-panel");
  loginSection?.classList.add("hidden");
  adminPanel?.classList.remove("hidden");
  sessionStorage.setItem(SESSION_KEY, "1");
}

export function getToken() {
  return (document.getElementById("gh-token")?.value || "").trim();
}

export function getBranch() {
  return (document.getElementById("gh-branch")?.value || "main").trim();
}

export function getActiveApiUrl() {
  const selectEl = document.getElementById("gh-api-endpoint");
  const sel = selectEl?.value || GITHUB_API_DEFAULT;
  if (sel === "custom") {
    return (document.getElementById("gh-api-custom-url")?.value || "").trim().replace(/\/+$/, "") || GITHUB_API_DEFAULT;
  }
  return sel;
}

export function syncApiBase() {
  const url = getActiveApiUrl();
  adminService.setApiBase(url);
  localStorage.setItem(ADMIN_GH_API_URL_KEY, url);
}

export function loadGitHubDraft() {
  const tokenInput = document.getElementById("gh-token");
  const branchInput = document.getElementById("gh-branch");
  const rememberCheckbox = document.getElementById("gh-remember-token") as HTMLInputElement | null;

  // "记住 Token" 偏好持久化，复选框状态跨刷新保留
  const remember = localStorage.getItem(ADMIN_GH_TOKEN_REMEMBER_KEY) === "1";
  if (rememberCheckbox) rememberCheckbox.checked = remember;

  // 勾选记住 → 从 localStorage 读；否则从 sessionStorage 读（关闭标签即清）
  const savedToken = remember
    ? (localStorage.getItem(ADMIN_GH_TOKEN_KEY) || "")
    : (sessionStorage.getItem(ADMIN_GH_TOKEN_KEY) || "");
  const savedBranch = localStorage.getItem(ADMIN_GH_BRANCH_KEY) || "main";
  const savedApi = localStorage.getItem(ADMIN_GH_API_URL_KEY) || GITHUB_API_DEFAULT;
  if (tokenInput && savedToken) tokenInput.value = savedToken;
  if (branchInput && savedBranch) branchInput.value = savedBranch;

  const selectEl = document.getElementById("gh-api-endpoint");
  const customUrlInput = document.getElementById("gh-api-custom-url");
  const customWrap = document.getElementById("custom-api-url-wrap");

  if (savedApi && savedApi !== GITHUB_API_DEFAULT) {
    let found = false;
    if (selectEl) {
      for (const opt of selectEl.options) {
        if (opt.value === savedApi) {
          selectEl.value = savedApi;
          found = true;
          break;
        }
      }
    }
    if (!found && selectEl) {
      selectEl.value = "custom";
      if (customUrlInput) customUrlInput.value = savedApi;
      if (customWrap) customWrap.classList.remove("hidden");
    }
  }
}

export function saveGitHubDraft() {
  const token = getToken();
  const branch = getBranch();
  const rememberCheckbox = document.getElementById("gh-remember-token") as HTMLInputElement | null;
  const remember = !!rememberCheckbox?.checked;

  // 持久化"记住"偏好
  localStorage.setItem(ADMIN_GH_TOKEN_REMEMBER_KEY, remember ? "1" : "0");

  if (remember) {
    // 勾选：存 localStorage（长期保留），清掉 sessionStorage 避免残留
    localStorage.setItem(ADMIN_GH_TOKEN_KEY, token);
    sessionStorage.removeItem(ADMIN_GH_TOKEN_KEY);
  } else {
    // 不勾选：存 sessionStorage（关闭标签即清），清掉 localStorage 避免残留
    sessionStorage.setItem(ADMIN_GH_TOKEN_KEY, token);
    localStorage.removeItem(ADMIN_GH_TOKEN_KEY);
  }
  localStorage.setItem(ADMIN_GH_BRANCH_KEY, branch || "main");
  syncApiBase();
}

export function getPreviewPageUrl() {
  return new URL(PREVIEW_TOOL_PATH, `${window.location.origin}${BASE_URL}`).toString();
}

export function savePreviewDraft() {
  const content = document.getElementById("post-content")?.value || "";
  const title = document.getElementById("post-title")?.value || "";
  const slug = document.getElementById("post-slug")?.value || "";
  const lang = document.getElementById("post-lang")?.value || "zh-cn";
  const payload = {
    content,
    title,
    slug,
    lang,
    updatedAt: Date.now(),
    returnUrl: `${window.location.origin}${BASE_URL}admin`,
  };
  localStorage.setItem(ADMIN_PREVIEW_DRAFT_KEY, JSON.stringify(payload));
}

export function applyPreviewResult() {
  const raw = localStorage.getItem(ADMIN_PREVIEW_RESULT_KEY);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    const nextContent = String(parsed?.content || "");
    const textarea = document.getElementById("post-content");
    if (textarea) {
      textarea.value = nextContent;
    }
    localStorage.removeItem(ADMIN_PREVIEW_RESULT_KEY);
    setMsg(document.getElementById("post-msg"), "已从预览页回填 Markdown，可直接保存文章");
    return true;
  } catch {
    localStorage.removeItem(ADMIN_PREVIEW_RESULT_KEY);
    setMsg(document.getElementById("post-msg"), "预览回填数据损坏，请重新打开预览", true);
    return false;
  }
}

// GitHub API wrappers
export async function verifyPassword(password: string) {
  return adminService.verifyPassword(password);
}

export async function loadSecurityConfig() {
  await adminService.loadSecurityConfig();
}

export async function getFileMeta(repoPath: string, token: string, branch: string, allowReadonlyFallback = true) {
  return adminService.getFileMeta(repoPath, token, branch, allowReadonlyFallback);
}

export async function upsertFile(repoPath: string, content: string, message: string, token: string, branch: string) {
  return adminService.upsertFile(repoPath, content, message, token, branch);
}

export async function deleteFile(repoPath: string, message: string, token: string, branch: string) {
  return adminService.deleteFile(repoPath, message, token, branch);
}

export async function listFilesByPrefix(prefix: string, token: string, branch: string) {
  return adminService.listFilesByPrefix(prefix, token, branch);
}

export async function listBlogMarkdownEntries(token: string, branch: string) {
  return adminService.listBlogMarkdownEntries(token, branch);
}

export async function fileToBase64(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function uploadBlogAssetFile({ slug, lang, file, token, branch }: {
  slug: string; lang: string; file: File; token: string; branch: string;
}) {
  const safeName = sanitizeFileName(file.name);
  const path = `src/content/blog/${slug}/assets/${safeName}`;
  const b64 = await fileToBase64(file);
  await adminService.uploadFile(path, b64, `upload: ${safeName} for ${slug} (${lang})`, token, branch);
  return { name: safeName, type: file.type || "application/octet-stream" };
}

export async function uploadAboutMusicFile({ file, token, branch }: {
  file: File; token: string; branch: string;
}) {
  const safeName = sanitizeFileName(file.name);
  const path = `public/music/${safeName}`;
  const b64 = await fileToBase64(file);
  await adminService.uploadFile(path, b64, `about: upload music ${safeName}`, token, branch);
  const basePrefix = (BASE_URL || "/").replace(/\/$/, "");
  const publicUrl = `${basePrefix}/music/${safeName}`.replace(/\/\//g, "/");
  return { name: safeName, url: publicUrl.startsWith("/") ? publicUrl : `/${publicUrl}` };
}

export async function renderPdfPagesToImages(file: File) {
  const pdfjsLib = await import("pdfjs-dist");
  const workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs";
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

  const pdfData = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdfDoc = await loadingTask.promise;

  const baseName = file.name.replace(/\.pdf$/i, "").replace(/\s+/g, "-");
  const generatedFiles = [];

  for (let pageNo = 1; pageNo <= pdfDoc.numPages; pageNo++) {
    const page = await pdfDoc.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PDF 渲染失败：无法创建画布上下文");

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport,
      background: "#ffffff",
      annotationMode: pdfjsLib.AnnotationMode.ENABLE,
      renderInteractiveForms: true
    }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("PDF 转图片失败"));
      }, "image/png");
    });

    const fileName = `${baseName}-p${String(pageNo).padStart(2, "0")}.png`;
    generatedFiles.push(new File([blob], fileName, { type: "image/png" }));
  }

  return generatedFiles;
}

// Re-export from admin-service for convenience
export {
  AdminService,
  GitHubApiError,
  buildAboutPersonalTs,
  buildAboutProfileTs,
  buildToolsLinksTs,
  buildBlogGuideContentTs,
  buildHeaderContactTs,
  buildPostMarkdown,
  buildSiteInfoTs,
  decodeFileContent,
  getNowDateTimeLocal,
  normalizeSlug,
  sanitizeFileName,
  parseAboutPersonalFromTs,
  parseAboutProfileFromTs,
  parseToolsLinksFromTs,
  parseBlogGuideContentFromTs,
  parseHeaderContactFromTs,
  parseSiteInfoFromTs,
  toIsoDateTime,
} from "@/utils/admin-service";

export {
  getPrimaryCategoryFromItems,
  getSubcategoriesFromItems,
  normalizeCategoryItems,
} from "@utils/blog-taxonomy";

/**
 * 从文章 Markdown frontmatter 中提取分类（合并 category + categories）
 * 统一实现，供 posts.ts 和 export.ts 共用，避免两处行为不一致
 */
export function extractCategoriesFromMarkdown(markdown: string): string[] {
  const matched = String(markdown || "").match(/^---\n([\s\S]*?)\n---/);
  if (!matched?.[1]) return [];

  const frontmatter = matched[1];
  const values: string[] = [];

  const singleCategory = frontmatter.match(/^category:\s*(.+)$/m)?.[1];
  if (singleCategory) {
    values.push(singleCategory.trim().replace(/^['"]|['"]$/g, ""));
  }

  const inlineCategories = frontmatter.match(/^categories:\s*\[(.+)\]\s*$/m)?.[1];
  if (inlineCategories) {
    inlineCategories
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean)
      .forEach((item) => values.push(item));
  }

  const blockCategories = frontmatter.match(/^categories:\s*\n((?:\s*-\s*.+\n?)*)/m)?.[1] || "";
  if (blockCategories) {
    blockCategories
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^-\s+/.test(line))
      .map((line) => line.replace(/^-\s+/, "").trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean)
      .forEach((item) => values.push(item));
  }

  return normalizeCategoryItems(values);
}
