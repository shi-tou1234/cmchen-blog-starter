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
  TRUSTED_API_HOSTS_KEY,
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

const savedApiUrl = (() => {
  const saved = typeof localStorage !== "undefined"
    ? localStorage.getItem(ADMIN_GH_API_URL_KEY) || GITHUB_API_DEFAULT
    : GITHUB_API_DEFAULT;
  // 启动恢复时只接受默认端点或此前已确认信任的源，防止历史遗留的自定义地址静默生效
  try {
    const origin = new URL(saved).origin;
    const defaultOrigin = new URL(GITHUB_API_DEFAULT).origin;
    if (origin !== defaultOrigin) {
      let trusted: string[] = [];
      try {
        const list = JSON.parse(localStorage.getItem(TRUSTED_API_HOSTS_KEY) || "[]");
        trusted = Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
      } catch { /* 视为未信任 */ }
      if (!trusted.includes(origin) || !isSafeApiUrl(saved)) return GITHUB_API_DEFAULT;
    }
  } catch {
    return GITHUB_API_DEFAULT;
  }
  return saved;
})();

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
}

/**
 * 会话凭据（SEC-2）：登录成功后存入由密码派生的凭据，取代过去的固定值 "1"。
 * 派生盐与公开的 admin-security.json 中的哈希相互独立，攻击者无法在不
 * 知道密码的情况下伪造出格式合法且真实有效的凭据。
 */
export function setSessionProof(proof: string) {
  sessionStorage.setItem(SESSION_KEY, proof);
}

export function clearSessionProof() {
  sessionStorage.removeItem(SESSION_KEY);
}

/** 校验会话存储值是否为合法凭据格式（base64 且解码后不少于 16 字节） */
export function isValidSessionProof(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    return bytes.length >= 16;
  } catch {
    return false;
  }
}

/** 是否已持有有效会话（用于页面加载时自动解锁面板） */
export function hasValidSession(): boolean {
  return isValidSessionProof(sessionStorage.getItem(SESSION_KEY));
}

export function getToken() {
  return ((document.getElementById("gh-token") as HTMLInputElement | null)?.value || "").trim();
}

export function getBranch() {
  return ((document.getElementById("gh-branch") as HTMLInputElement | null)?.value || "main").trim();
}

export function getActiveApiUrl() {
  const selectEl = document.getElementById("gh-api-endpoint") as HTMLSelectElement | null;
  const sel = selectEl?.value || GITHUB_API_DEFAULT;
  if (sel === "custom") {
    return ((document.getElementById("gh-api-custom-url") as HTMLInputElement | null)?.value || "").trim().replace(/\/+$/, "") || GITHUB_API_DEFAULT;
  }
  return sel;
}

// ---- 自定义 API 端点信任校验（SEC-5）----
// Token 会随 Authorization 头发往 apiBase，自定义代理必须在显式确认后才会生效，
// 防止被诱导配置陌生地址后 Token 被直接送出。

function parseTrustedApiHosts(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(TRUSTED_API_HOSTS_KEY) || "[]");
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 仅接受 https 公网地址，拒绝携带凭据、localhost 与内网段 */
export function isSafeApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|192\.168\.|0\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function resetApiEndpointUi() {
  const selectEl = document.getElementById("gh-api-endpoint") as HTMLSelectElement | null;
  if (selectEl) selectEl.value = GITHUB_API_DEFAULT;
  document.getElementById("custom-api-url-wrap")?.classList.add("hidden");
}

/**
 * 确认目标端点可信：默认端点直接通过；其余源首次使用需弹窗确认，
 * 确认结果持久化。地址不安全或用户拒绝时返回 false。
 */
export function ensureApiEndpointTrusted(url: string): boolean {
  const defaultOrigin = new URL(GITHUB_API_DEFAULT).origin;
  const origin = new URL(url).origin;
  if (origin === defaultOrigin) return true;

  const trusted = parseTrustedApiHosts();
  if (trusted.includes(origin)) return true;
  if (!isSafeApiUrl(url)) return false;

  const ok = window.confirm(
    `后续所有请求（包括 Authorization 头中的 GitHub Token）都将发送到：\n\n${origin}\n\n请确认你信任该代理地址，继续吗？`,
  );
  if (!ok) return false;

  trusted.push(origin);
  localStorage.setItem(TRUSTED_API_HOSTS_KEY, JSON.stringify(trusted));
  return true;
}

/**
 * 校验并应用当前选择的 API 端点。
 * 非默认端点首次使用时弹窗确认，确认过的源记录在本地；拒绝或校验失败则回退默认端点。
 * @returns 是否成功应用（false 表示已回退到默认端点）
 */
export function syncApiBase(): boolean {
  const url = getActiveApiUrl();

  try {
    if (!ensureApiEndpointTrusted(url)) {
      resetApiEndpointUi();
      adminService.setApiBase(GITHUB_API_DEFAULT);
      localStorage.setItem(ADMIN_GH_API_URL_KEY, GITHUB_API_DEFAULT);
      if (!isSafeApiUrl(url)) {
        setMsg(document.getElementById("connection-msg"), "自定义端点被拒绝：仅允许 https 公网地址（不支持内网/localhost）", true);
      }
      return false;
    }
  } catch {
    // URL 解析失败视为非法端点，回退默认
    resetApiEndpointUi();
    adminService.setApiBase(GITHUB_API_DEFAULT);
    localStorage.setItem(ADMIN_GH_API_URL_KEY, GITHUB_API_DEFAULT);
    return false;
  }

  adminService.setApiBase(url);
  localStorage.setItem(ADMIN_GH_API_URL_KEY, url);
  return true;
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
  if (tokenInput && savedToken) ((tokenInput as HTMLInputElement).value = savedToken);
  if (branchInput && savedBranch) ((branchInput as HTMLInputElement).value = savedBranch);

  const selectEl = document.getElementById("gh-api-endpoint") as HTMLSelectElement | null;
  const customUrlInput = document.getElementById("gh-api-custom-url") as HTMLInputElement | null;
  const customWrap = document.getElementById("custom-api-url-wrap");

  if (savedApi && savedApi !== GITHUB_API_DEFAULT) {
    let found = false;
    if (selectEl) {
      for (const opt of selectEl.options) {
        if ((opt as HTMLOptionElement).value === savedApi) {
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
  const content = ((document.getElementById("post-content") as HTMLTextAreaElement | null)?.value || "");
  const title = ((document.getElementById("post-title") as HTMLInputElement | null)?.value || "");
  const slug = ((document.getElementById("post-slug") as HTMLInputElement | null)?.value || "");
  const lang = ((document.getElementById("post-lang") as HTMLSelectElement | null)?.value || "zh-cn");
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
    const textarea = document.getElementById("post-content") as HTMLTextAreaElement | null;
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

export function hasPasswordConfigured() {
  return adminService.hasPassword();
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
    const viewport = page.getViewport({ scale: 1.5 });
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
      ...({ renderInteractiveForms: true } as any),
    }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("PDF 转图片失败"));
      }, "image/webp", 0.9);
    });

    const fileName = `${baseName}-p${String(pageNo).padStart(2, "0")}.webp`;
    generatedFiles.push(new File([blob], fileName, { type: "image/webp" }));
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
  buildHomeCoverSignaturesTs,
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
  parseHomeCoverSignaturesFromTs,
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
