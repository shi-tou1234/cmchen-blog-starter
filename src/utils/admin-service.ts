// =====================================================================
// Admin Service — GitHub API 后台管理服务（重写版）
// 提供：密码验证、文件 CRUD、文章列表、友链/联系方式/关于 解析与构建
// =====================================================================

import { normalizeCategoryItems } from '@utils/blog-taxonomy';

// ====== Types ======

type SecurityConfig = {
  algorithm: string;
  iterations: number;
  salt: string;
  hash: string;
};

type ChangePasswordInput = {
  oldPassword: string;
  newPassword: string;
  token: string;
  branch: string;
};

type BlogEntry = {
  path: string;
  slug: string;
  lang: string;
};

type FileMeta = {
  content: string;
  sha: string | undefined;
  [key: string]: unknown;
};

type ServiceOptions = {
  repoOwner: string;
  repoName: string;
  securityPath: string;
  securityUrl: string;
  apiBaseUrl?: string;
  fallbackSecurityConfig?: SecurityConfig;
};

// ====== Error Class ======

export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }

  /** 文件/资源不存在 */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** 认证失败（token 无效或无权限） */
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** 网络不可达 */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

// ====== Constants ======

// PBKDF2 迭代次数：OWASP 2023 建议 PBKDF2-SHA256 至少 600,000 次
const PBKDF2_ITERATIONS = 600000;

// 加载失败时不回退到任何默认密码——直接禁用登录，防止默认密码被利用
const NULL_SECURITY: SecurityConfig = {
  algorithm: "PBKDF2-SHA256",
  iterations: PBKDF2_ITERATIONS,
  salt: "",
  hash: "",
};

// ====== Base64 & Crypto Helpers ======

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function hashPassword(
  password: string,
  saltBase64: string,
  iterations: number,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromBase64(saltBase64) as BufferSource,
      iterations,
    },
    keyMaterial,
    256,
  );

  return toBase64(new Uint8Array(bits));
}

function utf8ToBase64(content: string): string {
  return toBase64(new TextEncoder().encode(content));
}

/**
 * 派生会话凭据：与登录哈希使用不同的盐，派生结果不落在公开的
 * admin-security.json 里——攻击者即便下载了公开哈希，也无法在
 * 不知道密码的前提下伪造出合法的会话凭据。
 */
export async function deriveSessionProof(
  password: string,
  saltBase64: string,
  iterations: number,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      // 与登录哈希的盐隔离：直接拼接字符串盐，不复用其 base64 解码值
      salt: encoder.encode(`cmchen-admin-session-v1:${saltBase64}`),
      iterations,
    },
    keyMaterial,
    256,
  );

  return toBase64(new Uint8Array(bits));
}

export function decodeFileContent(raw: string): string {
  const base64 = (raw || "").replace(/\n/g, "");
  return new TextDecoder().decode(fromBase64(base64));
}

// ====== Content Parsers & Builders ======

export function parseToolsLinksFromTs(content: string) {
  const matched = content.match(
    /const\s+toolsLinks:\s*ToolLink\[\]\s*=\s*(\[[\s\S]*?\])\s*\n\s*export\s+default\s+toolsLinks/,
  );
  if (!matched?.[1]) throw new Error("无法解析工具链接文件");
  const raw = matched[1];

  const normalized = raw
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(normalized);
}

export function buildToolsLinksTs(toolsLinks: unknown[]): string {
  return `export interface ToolLink {\n  name: string\n  url: string\n  icon: string\n  description: string\n  color?: string\n}\n\nconst toolsLinks: ToolLink[] = ${JSON.stringify(toolsLinks, null, 2)}\n\nexport default toolsLinks\n`;
}

export function parseHeaderContactFromTs(content: string) {
  const matched = content.match(
    /const\s+headerContact:\s*HeaderContact\s*=\s*(\{[\s\S]*?\})\s*\n\s*export\s+default\s+headerContact/,
  );
  if (!matched?.[1]) throw new Error("无法解析联系方式文件");
  const raw = matched[1]
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(raw);
}

export function buildHeaderContactTs(contact: {
  githubUrl: string;
  email: string;
}): string {
  return `export type HeaderContact = {\n  githubUrl: string\n  email: string\n}\n\nconst headerContact: HeaderContact = ${JSON.stringify(contact, null, 2)}\n\nexport default headerContact\n`;
}

export function parseBlogGuideContentFromTs(content: string) {
  const marker = "const blogGuideContent";
  const exportMarker = "export default blogGuideContent";
  const start = content.indexOf(marker);
  if (start < 0) throw new Error("无法解析博客介绍弹窗内容文件");

  const eq = content.indexOf("=", start);
  if (eq < 0) throw new Error("无法解析博客介绍弹窗内容文件");

  const end = content.indexOf(exportMarker, eq);
  if (end < 0) throw new Error("无法解析博客介绍弹窗内容文件");

  const rawBlock = content.slice(eq + 1, end).trim().replace(/;\s*$/, "");

  const normalized = rawBlock
    .replace(/\n\s*\/\/.*$/gm, "")
    // Quote unquoted object keys (e.g., title: -> "title":)
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3')
    // Remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error("无法解析博客介绍弹窗内容文件");
  }
}

export function buildBlogGuideContentTs(content: {
  "zh-cn": { title: string; subtitle: string; items: string[] };
  en: { title: string; subtitle: string; items: string[] };
}) {
  return `export type BlogGuideLocaleContent = {\n  title: string;\n  subtitle: string;\n  items: string[];\n};\n\nexport type BlogGuideContent = {\n  "zh-cn": BlogGuideLocaleContent;\n  en: BlogGuideLocaleContent;\n};\n\nconst blogGuideContent: BlogGuideContent = ${JSON.stringify(content, null, 2)};\n\nexport default blogGuideContent;\n`;
}

export function parseSiteInfoFromTs(content: string) {
  const matched = content.match(
    /const\s+siteInfo:\s*SiteInfo\s*=\s*(\{[\s\S]*?\})\s*\n\s*export\s+default\s+siteInfo/,
  );
  if (!matched?.[1]) throw new Error("无法解析站点信息文件");
  const raw = matched[1]
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(raw);
}

export function buildSiteInfoTs(info: {
  title: string;
  slogan: string;
  startDate: string;
}): string {
  return `export type SiteInfo = {\n  title: string;\n  slogan: string;\n  startDate: string;\n}\n\nconst siteInfo: SiteInfo = ${JSON.stringify(info, null, 2)}\n\nexport default siteInfo\n`;
}

export function parseHomeCoverSignaturesFromTs(content: string) {
  const matched = content.match(
    /const\s+homeCoverSignatures:\s*string\[\]\s*=\s*(\[[\s\S]*?\])\s*;?\s*\n\s*export\s+default\s+homeCoverSignatures/,
  );
  if (!matched?.[1]) throw new Error("无法解析首页签名文件");
  const raw = matched[1]
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(raw);
  } catch {
    // 兼容单引号字符串数组
    return JSON.parse(raw.replace(/'/g, '"'));
  }
}

export function buildHomeCoverSignaturesTs(signatures: string[]) {
  const list = Array.isArray(signatures)
    ? signatures.map((s) => String(s ?? "").trim()).filter(Boolean)
    : [];
  const body = list.length > 0
    ? `[\n  ${list.map((s) => JSON.stringify(s)).join(",\n  ")}\n]`
    : "[]";
  return `// 首页 Cover 打字机签名列表（留空则不显示打字机，改为显示副标题）\nconst homeCoverSignatures: string[] = ${body}\n\nexport default homeCoverSignatures;\n`;
}

export function parseAboutProfileFromTs(content: string) {
  const matched = content.match(
    /const\s+aboutProfile:\s*AboutProfile\s*=\s*(\{[\s\S]*?\})\s*\n\s*export\s+default\s+aboutProfile/,
  );
  if (!matched?.[1]) throw new Error("无法解析关于特质文件");
  const raw = matched[1]
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(raw);
}

export function buildAboutProfileTs(profile: {
  mbti: string;
  mbtiLink: string;
  major: string;
  majorLink: string;
  recentDoing: string;
  recentReading: string;
}) {
  return `export type AboutProfile = {\n  mbti: string\n  mbtiLink: string\n  major: string\n  majorLink: string\n  recentDoing: string\n  recentReading: string\n}\n\nconst aboutProfile: AboutProfile = ${JSON.stringify(profile, null, 2)}\n\nexport default aboutProfile\n`;
}

export function parseAboutPersonalFromTs(content: string) {
  const marker = "const aboutPersonal";
  const exportMarker = "export default aboutPersonal";
  const start = content.indexOf(marker);
  if (start < 0) throw new Error("无法解析关于页面扩展内容文件");

  const eq = content.indexOf("=", start);
  if (eq < 0) throw new Error("无法解析关于页面扩展内容文件");

  const end = content.indexOf(exportMarker, eq);
  if (end < 0) throw new Error("无法解析关于页面扩展内容文件");

  const rawBlock = content.slice(eq + 1, end).trim().replace(/;\s*$/, "");
  const normalized = rawBlock
    .replace(/\n\s*\/\/.*$/gm, "")
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error("无法解析关于页面扩展内容文件");
  }
}

export function buildAboutPersonalTs(content: {
  intro: string;
  siteTimeline: Array<{ date: string; content: string[] }>;
  musicTracks: Array<{ title: string; artist: string; url: string }>;
  travelCities: Array<{ province: string; city: string; visited: boolean; lat?: number; lng?: number }>;
}) {
  return `export type SiteTimelineItem = {\n  date: string;\n  content: string[];\n};\n\nexport type MusicTrack = {\n  title: string;\n  artist: string;\n  url: string;\n};\n\nexport type TravelProvince = {\n  province: string;\n  city: string;\n  visited: boolean;\n  lat?: number;\n  lng?: number;\n};\n\nexport type AboutPersonal = {\n  intro: string;\n  siteTimeline: SiteTimelineItem[];\n  musicTracks: MusicTrack[];\n  travelCities: TravelProvince[];\n};\n\nconst aboutPersonal: AboutPersonal = ${JSON.stringify(content, null, 2)};\n\nexport default aboutPersonal;\n`;
}

// ====== Slug & Date Helpers ======

export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[<>:"\\|?*#%{}[\]^`~/]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^-+|-+$/g, "");
}

/**
 * 将文件名/路径段清洗为安全字符：只保留 字母/数字/下划线/点/横线/中文，
 * 路径分隔符与其余字符一律换成横线，连续点压缩防目录穿越。
 * 供上传文件、导出等场景统一使用，避免 `../../evil.png` 这类花招。
 */
export function sanitizeFileName(input: string): string {
  return String(input || "")
    .replace(/[/\\]/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/[^\w.\-一-龥]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 将写入 frontmatter 的自由文本清洗为安全值：
 * 去掉换行/制表符/控制字符（防止破坏 `---` 结构或被塞入假配置），
 * 含特殊符号时用双引号包住并转义。
 */
function escapeFrontmatterValue(value: string): string {
  const str = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    // 故意剔除控制字符：YAML 头字段不允许它们出现
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const needsQuote =
    /[:#"']|\s$|^\s/.test(str) || /^[-?@`!&*%,[\]{}|>]/.test(str);
  if (!needsQuote) return str;
  return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildPostMarkdown(data: {
  title: string;
  date: string;
  updatedDate?: string;
  description: string;
  image: string;
  category: string;
  subCategory?: string;
  slugId: string;
  content: string;
  pinned?: boolean;
}): string {
  const imageLine = data.image ? `image: ${escapeFrontmatterValue(data.image)}\n` : "";
  const categories = normalizeCategoryItems([data.category, data.subCategory || ""]);
  const safeCategories = categories.map(escapeFrontmatterValue);
  const categoryLine = safeCategories[0] ? `category: ${safeCategories[0]}\n` : "";
  const categoriesLine = safeCategories.length > 0
    ? `categories:\n${safeCategories.map((category) => `  - ${category}`).join("\n")}\n`
    : "";
  const updatedDateLine = data.updatedDate ? `updatedDate: ${data.updatedDate}\n` : "";
  const pinnedLine = data.pinned ? `pinned: true\n` : "";
  return `---\ntitle: ${escapeFrontmatterValue(data.title)}\npubDate: ${data.date}\n${updatedDateLine}draft: false\n${pinnedLine}description: ${escapeFrontmatterValue(data.description)}\n${imageLine}${categoryLine}${categoriesLine}slugId: ${escapeFrontmatterValue(data.slugId)}\n---\n\n${data.content}\n`;
}

export function toIsoDateTime(dateTimeLocalValue: string): string {
  if (!dateTimeLocalValue) return "";
  const date = new Date(dateTimeLocalValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function getNowDateTimeLocal(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// ====== AdminService ======

export class AdminService {
  private readonly owner: string;
  private readonly repo: string;
  private readonly securityPath: string;
  private readonly securityUrl: string;
  private apiBase: string;
  private readonly fallbackSecurity: SecurityConfig;
  private security: SecurityConfig;
  private securityOutdated = false;

  constructor(opts: ServiceOptions) {
    this.owner = opts.repoOwner;
    this.repo = opts.repoName;
    this.securityPath = opts.securityPath;
    this.securityUrl = opts.securityUrl;
    this.apiBase = (opts.apiBaseUrl || "https://api.github.com").replace(
      /\/+$/,
      "",
    );
    this.fallbackSecurity =
      opts.fallbackSecurityConfig || NULL_SECURITY;
    this.security = this.fallbackSecurity;
  }

  /** 动态切换 API 基础 URL（用于代理切换） */
  setApiBase(url: string): void {
    this.apiBase = url.replace(/\/+$/, "");
  }

  /** 获取当前 API 基础 URL */
  getApiBase(): string {
    return this.apiBase;
  }

  // ---- URL Helpers ----

  /**
   * 将文件路径的每一段分别 encodeURIComponent，保留 /
   * 正确处理中文文件名（如 "极限"、"导数和微分"）
   */
  private encodePath(filePath: string): string {
    return filePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  /**
   * 构建仓库 API 路径: /repos/{owner}/{repo}{endpoint}
   */
  private repoApiPath(endpoint: string): string {
    const e = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `/repos/${this.owner}/${this.repo}${e}`;
  }

  /**
   * 构建仓库 Contents API 路径: /repos/{owner}/{repo}/contents/{encodedPath}
   */
  private contentsApiPath(filePath: string): string {
    return `${this.repoApiPath("/contents")}/${this.encodePath(filePath)}`;
  }

  // ---- Core API Request ----

  /**
   * 发起 GitHub API 请求
   * @param path - API 路径（相对于 apiBase，如 /repos/owner/repo/contents/...）
   * @param token - GitHub Personal Access Token
   * @param options - fetch RequestInit
   * @returns 解析后的 JSON 或 null (204)
   * @throws GitHubApiError
   */
  async githubRequest(
    path: string,
    token: string,
    options: RequestInit = {},
  ): Promise<any> {
    // GitHub API 返回结构多样（meta/tree/user/content 等），用 any 避免每个调用点都加断言
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.apiBase}${normalizedPath}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (options.body && typeof options.body === "string") {
      headers["Content-Type"] = "application/json";
    }

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        cache: "no-store",
        headers: {
          ...headers,
          ...((options.headers as Record<string, string>) || {}),
        },
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err);
      throw new GitHubApiError(
        0,
        `网络请求失败（GitHub API）：${msg}。请确认网络可访问 ${this.apiBase}`,
      );
    }

    if (res.status === 204) return null;

    if (!res.ok) {
      let detail: string;
      try {
        const json = await res.json();
        detail = json?.message || JSON.stringify(json);
      } catch {
        detail = await res.text().catch(() => `HTTP ${res.status}`);
      }
      throw new GitHubApiError(res.status, detail);
    }

    return res.json();
  }

  // ---- Security ----

  async loadSecurityConfig(): Promise<void> {
    try {
      const response = await fetch(`${this.securityUrl}?t=${Date.now()}`);
      if (!response.ok) throw new Error("fetch failed");
      const json = await response.json();
      if (!json?.salt || !json?.hash || !json?.iterations)
        throw new Error("invalid config");
      this.security = json;
      // 旧配置迭代次数偏低（如 180k < 600k），提示用户改密升级
      this.securityOutdated = Number(json.iterations) < PBKDF2_ITERATIONS;
    } catch (err) {
      console.warn("[admin] 安全配置加载失败，登录已禁用（不会回退到任何默认密码）：", err);
      this.security = this.fallbackSecurity;
    }
  }

  /** 是否已设置后台密码（admin-security.json 中存在 salt/hash） */
  hasPassword(): boolean {
    return !!(this.security.salt && this.security.hash);
  }

  async verifyPassword(password: string): Promise<boolean> {
    // 未设置密码时直接放行（默认无密码，进入后台后可再设置）
    if (!this.hasPassword()) {
      console.warn("[admin] 未设置后台密码，登录直接放行");
      return true;
    }
    const hashed = await hashPassword(
      password,
      this.security.salt,
      this.security.iterations,
    );
    return hashed === this.security.hash;
  }

  /** 供会话凭据派生使用（SEC-2）：返回当前盐与迭代次数 */
  getSecurityParams(): { salt: string; iterations: number } | null {
    if (!this.security.salt || !this.security.hash) return null;
    return { salt: this.security.salt, iterations: this.security.iterations };
  }

  /** 当前哈希迭代次数低于推荐值（旧配置），应提示用户改一次密码完成升级 */
  isSecurityOutdated(): boolean {
    return this.securityOutdated;
  }

  async changePassword(input: ChangePasswordInput): Promise<SecurityConfig> {
    // 尚未设置过密码时无需校验当前密码，直接设置首个密码
    if (this.hasPassword()) {
      const oldPassed = await this.verifyPassword(input.oldPassword);
      if (!oldPassed) throw new Error("当前密码不正确");
    }
    if (input.newPassword.trim().length < 6)
      throw new Error("新密码至少 6 位");

    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const salt = toBase64(saltBytes);
    const nextSecurity: SecurityConfig = {
      algorithm: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
      salt,
      hash: await hashPassword(input.newPassword.trim(), salt, PBKDF2_ITERATIONS),
    };

    await this.upsertFile(
      this.securityPath,
      `${JSON.stringify(nextSecurity, null, 2)}\n`,
      "admin: update password hash",
      input.token,
      input.branch,
    );

    this.security = nextSecurity;
    return nextSecurity;
  }

  // ---- File Operations ----

  /**
   * 获取文件元信息（含 base64 内容和 SHA）
   * @returns FileMeta 或 null（不存在时）
   */
  async getFileMeta(
    filePath: string,
    token: string,
    branch: string,
    allowReadonlyFallback = true,
  ): Promise<FileMeta | null> {
    const apiPath = `${this.contentsApiPath(filePath)}?ref=${encodeURIComponent(branch)}`;
    try {
      return await this.githubRequest(apiPath, token);
    } catch (err) {
      if (err instanceof GitHubApiError) {
        if (err.isNotFound) return null;

        // 网络不可达时尝试 CDN 只读回退
        if (allowReadonlyFallback && err.isNetwork) {
          const rawContent = await this.fetchRawContent(filePath, branch);
          if (rawContent !== null) {
            return { content: utf8ToBase64(rawContent), sha: undefined };
          }
        }
      }
      throw err;
    }
  }

  /**
   * 创建或更新文本文件
   */
  async upsertFile(
    filePath: string,
    content: string,
    message: string,
    token: string,
    branch: string,
  ): Promise<void> {
    const apiPath = this.contentsApiPath(filePath);

    // SHA 冲突常见于并发保存或代理缓存导致的旧 SHA；这里自动重试一次。
    for (let attempt = 0; attempt < 2; attempt++) {
      const sha = await this.getFileSha(filePath, token, branch);

      try {
        await this.githubRequest(apiPath, token, {
          method: "PUT",
          body: JSON.stringify({
            message,
            content: utf8ToBase64(content),
            branch,
            ...(sha ? { sha } : {}),
          }),
        });
        return;
      } catch (err) {
        if (!this.isShaConflictError(err) || attempt === 1) {
          throw err;
        }
      }
    }
  }

  /**
   * 上传二进制文件（content 已是 base64 编码）
   */
  async uploadFile(
    filePath: string,
    base64Content: string,
    message: string,
    token: string,
    branch: string,
  ): Promise<void> {
    const apiPath = this.contentsApiPath(filePath);

    for (let attempt = 0; attempt < 2; attempt++) {
      const sha = await this.getFileSha(filePath, token, branch);

      try {
        await this.githubRequest(apiPath, token, {
          method: "PUT",
          body: JSON.stringify({
            message,
            content: base64Content,
            branch,
            ...(sha ? { sha } : {}),
          }),
        });
        return;
      } catch (err) {
        if (!this.isShaConflictError(err) || attempt === 1) {
          throw err;
        }
      }
    }
  }

  /**
   * 删除文件
   * @returns true 已删除；false 文件不存在
   */
  async deleteFile(
    filePath: string,
    message: string,
    token: string,
    branch: string,
  ): Promise<boolean> {
    const sha = await this.getFileSha(filePath, token, branch);
    if (!sha) return false;

    const apiPath = this.contentsApiPath(filePath);
    await this.githubRequest(apiPath, token, {
      method: "DELETE",
      body: JSON.stringify({ message, sha, branch }),
    });

    return true;
  }

  /**
   * 获取指定文件的 SHA（用于更新/删除）
   * @returns SHA 字符串，文件不存在时返回 undefined
   */
  private async getFileSha(
    filePath: string,
    token: string,
    branch: string,
  ): Promise<string | undefined> {
    const apiPath = `${this.contentsApiPath(filePath)}?ref=${encodeURIComponent(branch)}&t=${Date.now()}`;
    try {
      const meta = await this.githubRequest(apiPath, token);
      return meta?.sha;
    } catch (err) {
      if (err instanceof GitHubApiError && err.isNotFound) return undefined;
      throw err;
    }
  }

  private isShaConflictError(err: unknown): boolean {
    if (!(err instanceof GitHubApiError)) return false;
    if (err.status === 409 || err.status === 422) return true;
    return /does\s+not\s+match|sha/i.test(err.message || "");
  }

  // ---- File Listing ----

  /**
   * 列出指定前缀下的所有文件路径，多级回退：
   * 1. Git Trees API（最快，单次请求）
   * 2. Contents API（递归目录遍历）
   * 3. CDN flat API（无需认证，可能有缓存延迟）
   */
  async listFilesByPrefix(
    prefix: string,
    token: string,
    branch: string,
  ): Promise<string[]> {
    // 策略 1: Git Trees API
    try {
      const files = await this.listByTreeApi(prefix, token, branch);
      if (files.length > 0) return files;
    } catch (err) {
      console.warn("[admin] listFilesByPrefix: Trees API 失败，尝试下一策略:", err);
    }

    // 策略 2: Contents API
    try {
      const files = await this.listByContentsApi(prefix, token, branch);
      if (files.length > 0) return files;
    } catch (err) {
      console.warn("[admin] listFilesByPrefix: Contents API 失败，尝试 CDN:", err);
    }

    // 策略 3: CDN
    return this.listByCdn(prefix, branch);
  }

  /** Git Trees API 列文件（单次请求获取整棵树） */
  private async listByTreeApi(
    prefix: string,
    token: string,
    branch: string,
  ): Promise<string[]> {
    const apiPath = this.repoApiPath(
      `/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    );
    const tree = await this.githubRequest(apiPath, token);
    const items = Array.isArray(tree?.tree) ? tree.tree : [];

    return items
      .filter(
        (item: { type?: string; path?: string }) =>
          item?.type === "blob" &&
          typeof item?.path === "string" &&
          item.path.startsWith(prefix),
      )
      .map((item: { path: string }) => item.path);
  }

  /** Contents API 递归遍历目录列文件 */
  private async listByContentsApi(
    prefix: string,
    token: string,
    branch: string,
  ): Promise<string[]> {
    const normalizedPrefix = prefix.replace(/\/+$/, "");
    const queue = [normalizedPrefix];
    const files: string[] = [];

    while (queue.length > 0) {
      const currentPath = queue.shift();
      if (!currentPath) continue;

      try {
        const apiPath = `${this.contentsApiPath(currentPath)}?ref=${encodeURIComponent(branch)}`;
        const content = await this.githubRequest(apiPath, token);
        if (!Array.isArray(content)) continue;

        for (const item of content) {
          if (!item || typeof item !== "object") continue;
          const itemType = (item as { type?: string }).type;
          const itemPath = (item as { path?: string }).path;
          if (!itemType || !itemPath) continue;

          if (itemType === "file" && itemPath.startsWith(prefix)) {
            files.push(itemPath);
          }
          if (itemType === "dir") {
            queue.push(itemPath);
          }
        }
      } catch {
        continue;
      }
    }

    return files;
  }

  /** jsDelivr CDN flat API 列文件（无需 token） */
  private async listByCdn(
    prefix: string,
    branch: string,
  ): Promise<string[]> {
    const endpoint = `https://data.jsdelivr.com/v1/package/gh/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}@${encodeURIComponent(branch)}/flat`;
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const files = Array.isArray(payload?.files) ? payload.files : [];

      return files
        .map((item: { name?: string }) => item?.name)
        .filter(
          (name: string | undefined): name is string =>
            typeof name === "string" && name.startsWith(`/${prefix}`),
        )
        .map((name: string) => name.slice(1));
    } catch (err) {
      console.warn("[admin] listByCdn: CDN 列表获取失败:", err);
      return [];
    }
  }

  // ---- CDN Raw Content Fallback ----

  /** 通过 CDN / raw URL 获取文件原始内容（无需认证，只读） */
  private async fetchRawContent(
    filePath: string,
    branch: string,
  ): Promise<string | null> {
    const endpoints = [
      `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${encodeURIComponent(branch)}/${this.encodePath(filePath)}`,
      `https://cdn.jsdelivr.net/gh/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}@${encodeURIComponent(branch)}/${this.encodePath(filePath)}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) continue;
        return await response.text();
      } catch (err) {
        console.warn("[admin] fetchRawContent: CDN 端点失败:", endpoint, err);
        continue;
      }
    }

    return null;
  }

  // ---- Blog ----

  /** 列出所有博客 Markdown 条目 */
  async listBlogMarkdownEntries(
    token: string,
    branch: string,
  ): Promise<BlogEntry[]> {
    const files = await this.listFilesByPrefix(
      "src/content/blog/",
      token,
      branch,
    );

    return files
      .map((path: string) => {
        const matched = path.match(
          /^src\/content\/blog\/(.+)\/(zh-cn|en)\.md$/,
        );
        if (!matched) return null;
        return { path, slug: matched[1], lang: matched[2] } as BlogEntry;
      })
      .filter((entry): entry is BlogEntry => Boolean(entry))
      .sort((a, b) =>
        `${a.slug}/${a.lang}`.localeCompare(`${b.slug}/${b.lang}`),
      );
  }

  // ---- Connection Test ----

  /**
   * 测试 GitHub Token 是否有效且有仓库权限
   * @returns { ok: boolean; message: string }
   */
  async testConnection(
    token: string,
  ): Promise<{ ok: boolean; message: string }> {
    if (!token) {
      return { ok: false, message: "请输入 GitHub Token" };
    }

    try {
      const user = await this.githubRequest("/user", token);
      const login = user?.login || "未知";

      // 验证仓库访问权限
      try {
        await this.githubRequest(this.repoApiPath(""), token);
        return {
          ok: true,
          message: `连接成功！用户：${login}，仓库 ${this.owner}/${this.repo} 可访问`,
        };
      } catch (repoErr) {
        if (repoErr instanceof GitHubApiError && repoErr.isNotFound) {
          return {
            ok: false,
            message: `用户 ${login} 无权访问仓库 ${this.owner}/${this.repo}（404）`,
          };
        }
        if (repoErr instanceof GitHubApiError && repoErr.isAuth) {
          return {
            ok: false,
            message: `用户 ${login} 无权访问仓库 ${this.owner}/${this.repo}（请确认 Token 有 repo 权限）`,
          };
        }
        throw repoErr;
      }
    } catch (err) {
      if (err instanceof GitHubApiError) {
        if (err.isAuth) {
          return { ok: false, message: "Token 无效或已过期，请检查后重试" };
        }
        if (err.isNetwork) {
          return {
            ok: false,
            message: `无法连接 GitHub API：${err.message}`,
          };
        }
        return { ok: false, message: `API 错误 ${err.status}: ${err.message}` };
      }
      return {
        ok: false,
        message: `未知错误：${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
