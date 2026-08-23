import {
  setMsg,
  getToken,
  getBranch,
  saveGitHubDraft,
  getFileMeta,
  upsertFile,
  uploadAboutMusicFile,
  decodeFileContent,
  parseAboutPersonalFromTs,
  buildAboutPersonalTs,
  parseAboutProfileFromTs,
  buildAboutProfileTs,
  parseToolsLinksFromTs,
  buildToolsLinksTs,
  parseBlogGuideContentFromTs,
  buildBlogGuideContentTs,
  parseHeaderContactFromTs,
  buildHeaderContactTs,
  parseSiteInfoFromTs,
  buildSiteInfoTs,
  parseHomeCoverSignaturesFromTs,
  buildHomeCoverSignaturesTs,
} from "./core";
import {
  ABOUT_PERSONAL_PATH,
  ABOUT_PROFILE_PATH,
  ABOUT_SPEC_PATH_PREFIX,
  BLOG_GUIDE_CONTENT_PATH,
  HEADER_CONTACT_PATH,
  SITE_INFO_PATH,
  HOME_COVER_PATH,
} from "./constants";

// ===== Data conversion helpers =====

function timelineToTextarea(items: { date?: string; content?: string[] }[]) {
  if (!Array.isArray(items)) return "";
  const lines: string[] = [];
  for (const item of items) {
    const date = String(item?.date || "").trim();
    const contents = Array.isArray(item?.content) ? item!.content : [String(item?.content || "").trim()];
    for (const c of contents) {
      const text = String(c || "").trim();
      if (date && text) lines.push(`${date}|${text}`);
    }
  }
  return lines.join("\n");
}

function textareaToTimeline(raw: string) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const grouped = new Map<string, string[]>();
  const order: string[] = [];

  for (const line of lines) {
    const [date, ...rest] = line.split("|");
    const d = String(date || "").trim();
    const c = rest.join("|").trim();
    if (!d || !c) continue;
    if (!grouped.has(d)) {
      grouped.set(d, []);
      order.push(d);
    }
    grouped.get(d)!.push(c);
  }

  return order.map((date) => ({ date, content: grouped.get(date)! }));
}

function musicToTextarea(items: { title?: string; artist?: string; url?: string }[]) {
  if (!Array.isArray(items)) return "";
  return items
    .map((item) => `${String(item?.title || "").trim()}|${String(item?.artist || "").trim()}|${String(item?.url || "").trim()}`)
    .filter((line) => !line.startsWith("||"))
    .join("\n");
}

function textareaToMusic(raw: string) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, artist, ...rest] = line.split("|");
      return { title: String(title || "").trim(), artist: String(artist || "").trim(), url: rest.join("|").trim() };
    })
    .filter((item) => item.title && item.url);
}

function normalizeTravelCities(items: any[]) {
  if (!Array.isArray(items)) return [];
  const map = new Map<string, { province: string; city: string; visited: boolean }>();
  items.forEach((item) => {
    if (!item) return;
    if (typeof item === "string") {
      const text = item.trim();
      if (!text) return;
      map.set(`${text.toLowerCase()}|${text.toLowerCase()}`, { province: text, city: text, visited: true });
      return;
    }
    const visited = item?.visited !== false;
    if (!visited) return;
    const province = String(item?.province || item?.parent || item?.city || item?.name || "").trim();
    const city = String(item?.city || item?.name || item?.province || "").trim();
    if (!province && !city) return;
    const finalProvince = province || city;
    const finalCity = city || province;
    const key = `${finalProvince.toLowerCase()}|${finalCity.toLowerCase()}`;
    map.set(key, { province: finalProvince, city: finalCity, visited: true });
  });
  return Array.from(map.values()).sort((a, b) => {
    const byProvince = a.province.localeCompare(b.province, "zh-Hans-CN", { sensitivity: "base" });
    if (byProvince !== 0) return byProvince;
    return a.city.localeCompare(b.city, "zh-Hans-CN", { sensitivity: "base" });
  });
}

function travelCitiesToStorage(items: any[]) {
  return JSON.stringify(normalizeTravelCities(items));
}

function storageToTravelCities(raw: string) {
  const text = String(raw || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return normalizeTravelCities(parsed);
  } catch {
    const fallback = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [province, _lat, _lng, visitedText] = line.split("|");
        return {
          province: String(province || "").trim(),
          city: String(province || "").trim(),
          visited: visitedText === "1" || /^true$/i.test(String(visitedText || "")),
        };
      })
      .filter((item) => item.province);
    return normalizeTravelCities(fallback);
  }
}

// ===== Event handler initialization =====

export function initSiteSettingsHandlers() {
  // About markdown
  document.getElementById("load-about-markdown-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("about-markdown-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      const lang = ((document.getElementById("about-lang") as HTMLInputElement | null)?.value || "zh-cn").trim();
      if (!token) throw new Error("请先填写 GitHub Token");

      const path = `${ABOUT_SPEC_PATH_PREFIX}/${lang}.md`;
      const meta = await getFileMeta(path, token, branch);
      const content = decodeFileContent(meta?.content || "");
      const input = (document.getElementById("about-markdown-content") as HTMLTextAreaElement | null);

      if (input) input.value = content;
      setMsg(msgEl, `已加载 ${lang} 文本`);
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  document.getElementById("save-about-markdown-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("about-markdown-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      const lang = ((document.getElementById("about-lang") as HTMLInputElement | null)?.value || "zh-cn").trim();
      if (!token) throw new Error("请先填写 GitHub Token");

      const content = (document.getElementById("about-markdown-content") as HTMLTextAreaElement | null)?.value || "";
      const path = `${ABOUT_SPEC_PATH_PREFIX}/${lang}.md`;
      await upsertFile(path, content, `about: update markdown ${lang}`, token, branch);
      setMsg(msgEl, `已保存 ${lang} 文本`);
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // Timeline
  document.getElementById("load-about-timeline-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("about-timeline-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      if (!token) throw new Error("请先填写 GitHub Token");

      const meta = await getFileMeta(ABOUT_PERSONAL_PATH, token, branch);
      const content = decodeFileContent(meta?.content || "");
      const parsed = parseAboutPersonalFromTs(content);

      const timelineInput = (document.getElementById("about-timeline-content") as HTMLTextAreaElement | null);

      if (timelineInput) timelineInput.value = timelineToTextarea(parsed?.siteTimeline || []);
      setMsg(msgEl, "网站记录加载成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  document.getElementById("save-about-timeline-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("about-timeline-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      if (!token) throw new Error("请先填写 GitHub Token");

      const meta = await getFileMeta(ABOUT_PERSONAL_PATH, token, branch);
      const content = decodeFileContent(meta?.content || "");
      const parsed = parseAboutPersonalFromTs(content);
      parsed.siteTimeline = textareaToTimeline((document.getElementById("about-timeline-content") as HTMLTextAreaElement | null)?.value || "");

      const nextContent = buildAboutPersonalTs(parsed);
      await upsertFile(ABOUT_PERSONAL_PATH, nextContent, "about: update site timeline", token, branch);
      setMsg(msgEl, "网站记录保存成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // About personal
  document.getElementById("load-about-personal-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("about-personal-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      if (!token) throw new Error("请先填写 GitHub Token");

      const meta = await getFileMeta(ABOUT_PERSONAL_PATH, token, branch);
      const content = decodeFileContent(meta?.content || "");
      const parsed = parseAboutPersonalFromTs(content);

      const introEl = (document.getElementById("about-personal-intro") as HTMLTextAreaElement | null);

      const musicEl = (document.getElementById("about-personal-music") as HTMLTextAreaElement | null);

      const travelEl = (document.getElementById("about-personal-travel-cities") as HTMLTextAreaElement | null);

      if (introEl) introEl.value = parsed?.intro || "";
      if (musicEl) musicEl.value = musicToTextarea(parsed?.musicTracks || []);
      if (travelEl) {
        travelEl.value = travelCitiesToStorage(parsed?.travelCities || []);
        document.dispatchEvent(new CustomEvent("travel-map-refresh", {
          detail: { inputId: "about-personal-travel-cities" },
        }));
      }
      setMsg(msgEl, "关于我的一些事情加载成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  document.getElementById("save-about-personal-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("about-personal-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      if (!token) throw new Error("请先填写 GitHub Token");

      const meta = await getFileMeta(ABOUT_PERSONAL_PATH, token, branch);
      const content = decodeFileContent(meta?.content || "");
      const parsed = parseAboutPersonalFromTs(content);

      parsed.intro = ((document.getElementById("about-personal-intro") as HTMLTextAreaElement | null)?.value || "").trim();
      parsed.musicTracks = textareaToMusic((document.getElementById("about-personal-music") as HTMLTextAreaElement | null)?.value || "");
      parsed.travelCities = storageToTravelCities((document.getElementById("about-personal-travel-cities") as HTMLTextAreaElement | null)?.value || "[]");

      const nextContent = buildAboutPersonalTs(parsed);
      await upsertFile(ABOUT_PERSONAL_PATH, nextContent, "about: update personal block", token, branch);
      setMsg(msgEl, "关于我的一些事情保存成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // Upload about music
  document.getElementById("upload-about-music-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("about-personal-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      const files = (document.getElementById("about-music-files") as HTMLInputElement | null)?.files;
      if (!token) throw new Error("请先填写 GitHub Token");
      if (!files || files.length === 0) throw new Error("请先选择 MP3 文件");

      const musicTextarea = (document.getElementById("about-personal-music") as HTMLTextAreaElement | null);

      let appended = 0;
      for (const file of files) {
        const isMp3 = file.type === "audio/mpeg" || /\.mp3$/i.test(file.name);
        if (!isMp3) continue;
        const uploaded = await uploadAboutMusicFile({ file, token, branch });
        const title = uploaded.name.replace(/\.mp3$/i, "");
        const line = `${title}|Unknown Artist|${uploaded.url}`;
        if (musicTextarea) {
          const current = musicTextarea.value.trim();
          musicTextarea.value = current ? `${current}\n${line}` : line;
        }
        appended += 1;
      }

      const fileInput = (document.getElementById("about-music-files") as HTMLInputElement | null);

      const countEl = (document.getElementById("about-music-files-count") as HTMLInputElement | null);

      if (fileInput) fileInput.value = "";
      if (countEl) countEl.textContent = "未选择文件";

      if (appended === 0) throw new Error("所选文件中没有可上传的 MP3");
      setMsg(msgEl, `已上传 ${appended} 个 MP3，并追加到音乐列表。请点击"保存"写入关于页配置。`);
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // About profile
  document.getElementById("load-about-profile-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("about-profile-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      if (!token) throw new Error("请先填写 GitHub Token");

      const meta = await getFileMeta(ABOUT_PROFILE_PATH, token, branch);
      const content = decodeFileContent(meta?.content || "");
      const profile = parseAboutProfileFromTs(content);

      (document.getElementById("about-mbti") as HTMLInputElement).value = profile.mbti || "";
      (document.getElementById("about-mbti-link") as HTMLInputElement).value = profile.mbtiLink || "";
      (document.getElementById("about-major") as HTMLInputElement).value = profile.major || "";
      (document.getElementById("about-major-link") as HTMLInputElement).value = profile.majorLink || "";
      (document.getElementById("about-recent-doing") as HTMLInputElement).value = profile.recentDoing || "";
      (document.getElementById("about-recent-reading") as HTMLInputElement).value = profile.recentReading || "";
      setMsg(msgEl, "关于特质加载成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  document.getElementById("save-about-profile-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("about-profile-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      if (!token) throw new Error("请先填写 GitHub Token");

      const mbti = ((document.getElementById("about-mbti") as HTMLInputElement | null)?.value || "").trim();
      const mbtiLink = ((document.getElementById("about-mbti-link") as HTMLInputElement | null)?.value || "").trim();
      const major = ((document.getElementById("about-major") as HTMLInputElement | null)?.value || "").trim();
      const majorLink = ((document.getElementById("about-major-link") as HTMLInputElement | null)?.value || "").trim();
      const recentDoing = ((document.getElementById("about-recent-doing") as HTMLInputElement | null)?.value || "").trim();
      const recentReading = ((document.getElementById("about-recent-reading") as HTMLInputElement | null)?.value || "").trim();

      if (!mbti) throw new Error("请填写 MBTI");
      if (!mbtiLink) throw new Error("请填写 MBTI 介绍链接");
      if (!major) throw new Error("请填写所学专业");
      if (!majorLink) throw new Error("请填写专业百科链接");
      if (!recentDoing) throw new Error("请填写最近在做");
      if (!recentReading) throw new Error("请填写最近读书");

      const content = buildAboutProfileTs({ mbti, mbtiLink, major, majorLink, recentDoing, recentReading });
      await upsertFile(ABOUT_PROFILE_PATH, content, "about: update profile", token, branch);
      setMsg(msgEl, "关于特质保存成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // Tools links
  document.getElementById("load-tools-links-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("tools-links-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      if (!token) throw new Error("请先填写 GitHub Token");

      const path = "src/data/tools-links.ts";
      const meta = await getFileMeta(path, token, branch);
      const content = decodeFileContent(meta?.content || "");
      const links = parseToolsLinksFromTs(content);
      (document.getElementById("tools-links-content") as HTMLTextAreaElement).value = JSON.stringify(links, null, 2);
      setMsg(msgEl, "工具链接加载成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  document.getElementById("save-tools-links-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("tools-links-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      const raw = (document.getElementById("tools-links-content") as HTMLTextAreaElement | null)?.value || "[]";
      if (!token) throw new Error("请先填写 GitHub Token");

      const links = JSON.parse(raw);
      if (!Array.isArray(links)) throw new Error("工具链接内容必须是 JSON 数组");

      links.forEach((item: any, index: number) => {
        if (typeof item?.name !== "string" || typeof item?.url !== "string" || typeof item?.icon !== "string" || typeof item?.description !== "string") {
          throw new Error(`第 ${index + 1} 条工具链接格式不正确`);
        }
        if (item.color !== undefined && typeof item.color !== "string") {
          throw new Error(`第 ${index + 1} 条工具链接的 color 字段必须是字符串`);
        }
      });

      const path = "src/data/tools-links.ts";
      const content = buildToolsLinksTs(links);
      await upsertFile(path, content, "tools: update links", token, branch);
      setMsg(msgEl, "工具链接保存成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // Insert tools link template
  document.getElementById("insert-tools-link-template-btn")?.addEventListener("click", () => {
    const msgEl = (document.getElementById("tools-links-msg") as HTMLElement | null);

    try {
      const textarea = document.getElementById("tools-links-content") as HTMLTextAreaElement | null;
      const raw = (textarea?.value || "[]").trim();
      const links = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(links)) throw new Error("工具链接内容必须是 JSON 数组");

      links.push({
        name: "示例工具名",
        url: "https://example.com",
        icon: "fa6-solid:link",
        description: "请填写工具描述",
        color: ""
      });

      if (textarea) textarea.value = JSON.stringify(links, null, 2);
      setMsg(msgEl, "已插入工具链接模板，请修改后点击保存");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // Color picker
  function getGradientFromSliders() {
    const hue = parseInt((document.getElementById("color-hue-slider") as HTMLInputElement)?.value || "235");
    const sat = parseInt((document.getElementById("color-sat-slider") as HTMLInputElement)?.value || "45");
    const light = parseInt((document.getElementById("color-light-slider") as HTMLInputElement)?.value || "46");
    const hue2 = (hue + 40) % 360;
    const light2 = Math.max(25, Math.min(60, light - 4));
    const sat2 = Math.max(20, Math.min(70, sat - 3));
    return `linear-gradient(-45deg, hsl(${hue}, ${sat}%, ${light}%) 0%, hsl(${hue2}, ${sat2}%, ${light2}%) 100%)`;
  }

  function updateColorPreview() {
    const grad = getGradientFromSliders();
    const preview = (document.getElementById("color-preview") as HTMLElement | null);

    const text = (document.getElementById("color-preview-text") as HTMLElement | null);

    if (preview) preview.style.background = grad;
    if (text) text.textContent = grad;
  }

  document.getElementById("color-hue-slider")?.addEventListener("input", updateColorPreview);
  document.getElementById("color-sat-slider")?.addEventListener("input", updateColorPreview);
  document.getElementById("color-light-slider")?.addEventListener("input", updateColorPreview);

  document.querySelectorAll(".gradient-preset-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const grad = (btn as HTMLElement).getAttribute("data-grad");
      if (!grad) return;
      const preview = (document.getElementById("color-preview") as HTMLElement | null);

      const text = (document.getElementById("color-preview-text") as HTMLElement | null);

      if (preview) preview.style.background = grad;
      if (text) text.textContent = grad;
      document.querySelectorAll(".gradient-preset-btn").forEach(function(b) {
        (b as HTMLElement).style.borderColor = "transparent";
      });
      (btn as HTMLElement).style.borderColor = "var(--link-color)";
    });
  });

  document.getElementById("apply-gradient-btn")?.addEventListener("click", function() {
    const textarea = document.getElementById("tools-links-content") as HTMLTextAreaElement | null;
    if (!textarea) return;
    const gradText = document.getElementById("color-preview-text")?.textContent || "";
    if (!gradText) return;

    const raw = textarea.value.trim();
    if (!raw) {
      setMsg(document.getElementById("tools-links-msg"), "请先在文本框中输入 JSON 数据", true);
      return;
    }

    let links: any[];
    try {
      links = JSON.parse(raw);
      if (!Array.isArray(links)) throw new Error("not array");
    } catch {
      setMsg(document.getElementById("tools-links-msg"), "JSON 解析失败，请检查格式", true);
      return;
    }

    const cursorPos = textarea.selectionStart;
    const textBefore = raw.slice(0, cursorPos);
    let targetIndex = -1;
    const matches = textBefore.match(/\{\s*"name"/g);
    if (matches) targetIndex = matches.length - 1;
    if (targetIndex < 0 || targetIndex >= links.length) targetIndex = links.length - 1;

    if (!links[targetIndex]) {
      setMsg(document.getElementById("tools-links-msg"), "未找到可应用颜色的条目", true);
      return;
    }

    links[targetIndex].color = gradText;
    textarea.value = JSON.stringify(links, null, 2);
    setMsg(document.getElementById("tools-links-msg"), `已将颜色应用到第 ${targetIndex + 1} 条「${links[targetIndex].name}」`);
  });

  // Header contact
  document.getElementById("load-header-contact-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("header-contact-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      if (!token) throw new Error("请先填写 GitHub Token");

      const meta = await getFileMeta(HEADER_CONTACT_PATH, token, branch);
      const content = decodeFileContent(meta?.content || "");
      const contact = parseHeaderContactFromTs(content);

      (document.getElementById("header-github") as HTMLInputElement).value = contact.githubUrl || "";
      (document.getElementById("header-email") as HTMLInputElement).value = contact.email || "";
      setMsg(msgEl, "联系方式加载成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  document.getElementById("save-header-contact-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("header-contact-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      const githubUrl = ((document.getElementById("header-github") as HTMLInputElement | null)?.value || "").trim();
      const email = ((document.getElementById("header-email") as HTMLInputElement | null)?.value || "").trim();

      if (!token) throw new Error("请先填写 GitHub Token");
      if (!githubUrl) throw new Error("请填写 GitHub 首页链接");
      if (!email) throw new Error("请填写邮箱地址");

      const content = buildHeaderContactTs({ githubUrl, email });
      await upsertFile(HEADER_CONTACT_PATH, content, "header: update contact links", token, branch);
      setMsg(msgEl, "联系方式保存成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // Blog guide
  document.getElementById("load-blog-guide-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("blog-guide-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      if (!token) throw new Error("请先填写 GitHub Token");

      const meta = await getFileMeta(BLOG_GUIDE_CONTENT_PATH, token, branch);
      const content = decodeFileContent(meta?.content || "");
      const guide = parseBlogGuideContentFromTs(content);

      (document.getElementById("blog-guide-zh-title") as HTMLInputElement).value = guide?.["zh-cn"]?.title || "";
      (document.getElementById("blog-guide-zh-subtitle") as HTMLInputElement).value = guide?.["zh-cn"]?.subtitle || "";
      (document.getElementById("blog-guide-zh-items") as HTMLTextAreaElement).value = (guide?.["zh-cn"]?.items || []).join("\n");

      (document.getElementById("blog-guide-en-title") as HTMLInputElement).value = guide?.en?.title || "";
      (document.getElementById("blog-guide-en-subtitle") as HTMLInputElement).value = guide?.en?.subtitle || "";
      (document.getElementById("blog-guide-en-items") as HTMLTextAreaElement).value = (guide?.en?.items || []).join("\n");
      setMsg(msgEl, "博客介绍弹窗内容加载成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  document.getElementById("save-blog-guide-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("blog-guide-msg") as HTMLElement | null);

    try {
      const token = getToken();
      const branch = getBranch();
      if (!token) throw new Error("请先填写 GitHub Token");

      const zhTitle = ((document.getElementById("blog-guide-zh-title") as HTMLInputElement | null)?.value || "").trim();
      const zhSubtitle = ((document.getElementById("blog-guide-zh-subtitle") as HTMLInputElement | null)?.value || "").trim();
      const zhItems = ((document.getElementById("blog-guide-zh-items") as HTMLTextAreaElement | null)?.value || "").split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);

      const enTitle = ((document.getElementById("blog-guide-en-title") as HTMLInputElement | null)?.value || "").trim();
      const enSubtitle = ((document.getElementById("blog-guide-en-subtitle") as HTMLInputElement | null)?.value || "").trim();
      const enItems = ((document.getElementById("blog-guide-en-items") as HTMLTextAreaElement | null)?.value || "").split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);

      if (!zhTitle || !zhSubtitle || zhItems.length === 0) throw new Error("请完整填写中文弹窗内容");
      if (!enTitle || !enSubtitle || enItems.length === 0) throw new Error("请完整填写英文弹窗内容");

      const content = buildBlogGuideContentTs({
        "zh-cn": { title: zhTitle, subtitle: zhSubtitle, items: zhItems },
        en: { title: enTitle, subtitle: enSubtitle, items: enItems },
      });

      await upsertFile(BLOG_GUIDE_CONTENT_PATH, content, "guide: update blog guide content", token, branch);
      setMsg(msgEl, "博客介绍弹窗内容保存成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  // Site info
  document.getElementById("load-site-info-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("site-info-msg") as HTMLElement | null);
    try {
      const token = getToken();
      const branch = getBranch();
      if (!token) throw new Error("请先填写 GitHub Token");

      const meta = await getFileMeta(SITE_INFO_PATH, token, branch);
      const content = decodeFileContent(meta?.content || "");
      const info = parseSiteInfoFromTs(content);

      (document.getElementById("site-info-title") as HTMLInputElement).value = info.title || "";
      (document.getElementById("site-info-slogan") as HTMLInputElement).value = info.slogan || "";
      (document.getElementById("site-info-start-date") as HTMLInputElement).value = info.startDate || "";

      const coverMeta = await getFileMeta(HOME_COVER_PATH, token, branch);
      const coverContent = decodeFileContent(coverMeta?.content || "");
      const signatures = parseHomeCoverSignaturesFromTs(coverContent);
      (document.getElementById("site-info-signatures") as HTMLTextAreaElement).value = (signatures || []).join("\n");

      setMsg(msgEl, "站点信息加载成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });

  document.getElementById("save-site-info-btn")?.addEventListener("click", async () => {
    const msgEl = (document.getElementById("site-info-msg") as HTMLElement | null);
    try {
      const token = getToken();
      const branch = getBranch();
      const title = ((document.getElementById("site-info-title") as HTMLInputElement | null)?.value || "").trim();
      const slogan = ((document.getElementById("site-info-slogan") as HTMLInputElement | null)?.value || "").trim();
      const startDate = ((document.getElementById("site-info-start-date") as HTMLInputElement | null)?.value || "").trim();
      const signatures = ((document.getElementById("site-info-signatures") as HTMLTextAreaElement | null)?.value || "")
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean);

      if (!token) throw new Error("请先填写 GitHub Token");
      if (!title) throw new Error("请填写站点标题");
      if (!startDate) throw new Error("请填写创建时间");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("创建时间格式应为 YYYY-MM-DD");

      const infoContent = buildSiteInfoTs({ title, slogan, startDate });
      const coverContent = buildHomeCoverSignaturesTs(signatures);
      await upsertFile(SITE_INFO_PATH, infoContent, "site: update site info", token, branch);
      await upsertFile(HOME_COVER_PATH, coverContent, "site: update home cover signatures", token, branch);
      setMsg(msgEl, "站点信息保存成功");
    } catch (error) {
      setMsg(msgEl, String(error), true);
    }
  });
}

// 统一加载入口：触发所有设置模块的"加载"按钮，登录后自动调用
export function loadAllSiteSettings() {
  const token = getToken();
  if (!token) return;
  const loadButtonIds = [
    "load-about-markdown-btn",
    "load-about-timeline-btn",
    "load-about-personal-btn",
    "load-about-profile-btn",
    "load-tools-links-btn",
    "load-header-contact-btn",
    "load-blog-guide-btn",
    "load-site-info-btn",
  ];
  loadButtonIds.forEach((id) => {
    document.getElementById(id)?.click();
  });
}
