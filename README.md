# cmchen-blog-starter

> 🚀 **cmchen-blog 的初始化版本（Starter）**——功能齐全、内容为空，克隆即可开始你的博客之旅。

本项目基于 [cmchen-blog](https://github.com/shi-tou1234/cmchen-blog) 的源码初始化而来，**删除了全部个人内容**（文章、关于、工具栏链接、旅行地图城市标记、音乐等），只保留了完整的功能框架与工程配置。你可以把它当作一个开箱即用的博客模板，填入自己的内容后即可发布。

## 目录

- [✨ 功能特性](#功能特性)
- [📦 技术栈](#技术栈)
- [🚀 快速开始](#快速开始)
- [✍️ 填充你的内容](#填充你的内容)
- [⚙️ 站点配置](#站点配置)
- [🖥️ 管理后台](#管理后台)
- [📤 部署](#部署)
- [📜 与 cmchen-blog 的关系](#与-cmchen-blog-的关系)

## 功能特性

### 核心博客功能
- **Markdown 文章管理**：基于 Astro Content Collections，支持 Frontmatter 元数据
- **文章分类与标签**：灵活的分类体系，支持多级分类和标签
- **归档页面**：按时间线展示所有文章，支持分页浏览
- **阅读进度条** 与 **阅读时间估算**
- **文章置顶**：支持重要文章置顶展示

### 界面与交互
- **响应式设计**：完美适配桌面端、平板和移动端
- **暗黑 / 明亮模式**：跟随系统并可手动切换
- **字体大小控制**：读者可自定义正文字体大小
- **AOS 滚动动画** 与 **粒子动画背景**（tsparticles）
- **页面过渡动画**：基于 Astro View Transitions

### 高级功能
- **数学公式渲染**：完整支持 LaTeX（KaTeX）与 Typst 公式
- **自定义 Markdown 组件**：音乐卡片、GitHub 卡片、引用块、推导过程浮层、提示框（Note / Tip / Important / Caution / Warning）
- **代码高亮**：Shiki 语法高亮
- **全文搜索**：基于 Pagefind 的静态站点搜索
- **多语言**：内置 i18n 框架（当前以中文为主）

### 管理后台
- **GitHub 集成**：通过 GitHub API 在线管理文章
- **文章管理**：在线创建、编辑、删除文章
- **站点设置**：动态修改标题、头像、签名、关于、工具栏链接等
- **安全配置**：JSON 文件访问密码保护
- **数据导出**、**文章实时预览与回填**、**PDF 转图片**、**文件上传**

### 数据可视化
- **旅行地图**：中国省份 / 城市访问标记（ECharts）
- **Git 提交热力图**：GitHub 贡献图风格的提交频率可视化

## 技术栈

- [Astro](https://astro.build) + Tailwind CSS + TypeScript
- KaTeX / Typst 数学渲染、Shiki 代码高亮、Pagefind 搜索
- ECharts 地图、tsparticles 粒子动画、Giscus 评论
- pnpm 包管理器

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 本地开发
pnpm dev

# 3. 构建生产版本（含 Pagefind 索引）
pnpm build

# 4. 本地预览构建产物
pnpm preview
```

## 填充你的内容

> 本版本已删除所有个人内容，以下路径即为你需要填充内容的地方。

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| **博客文章** | `src/content/blog/<slug>/zh-cn.md` | 每篇文章一个目录，正文为 Markdown。也可通过后台在线创建 |
| **关于页 · 自我介绍** | `src/content/spec/about/zh-cn.md` | 关于页顶部的介绍文案 |
| **关于页 · 个人资料** | `src/data/about-profile.ts` | MBTI、专业、最近在做、最近读书等 |
| **关于页 · 个性化内容** | `src/data/about-personal.ts` | 个人简介、站点时间轴、音乐列表、旅行城市标记 |
| **工具栏链接** | `src/data/tools-links.ts` | 工具栏页展示的常用工具 / 网站卡片 |
| **页头联系方式** | `src/data/header-contact.ts` | GitHub 主页与邮箱（用于页头复制邮箱等交互） |
| **音乐文件** | `public/music/` | 音乐播放器的音频文件，配合 `about-personal.ts` 的 `musicTracks` 使用 |
| **首页打字机签名** | `src/data/home-cover.ts` | 首页 Cover 上滚动的签名语（留空则显示副标题） |
| **站点标语** | `src/data/site-slogan.ts` | 站点 slogan |

## 站点配置

站点级配置集中在 [`src/config.ts`](src/config.ts)：

```ts
export const siteConfig: SiteConfig = {
    title: "我的博客",
    subTitle: "记录生活与学习",
    favicon: "/favicon/favicon.ico",
    pageSize: 6, // 每页文章数
}

export const profileConfig: ProfileConfig = {
    avatar: "assets/Motues.jpg", // 头像（相对 src 目录）
    name: "你的名字",
    description: "写一句介绍自己的话",
    indexPage: "", // 你的主页地址（可选）
    startYear: 2026,
}

export const externalUrlsConfig: ExternalUrlsConfig = {
    githubApi: "https://api.github.com",
    githubRepo: "",      // 你的 GitHub 仓库（owner/repo），用于后台管理与提交热力图
    giscusRepoId: "",    // Giscus 评论的 repo-id（启用评论时填写）
    geoDataVBase: "https://geo.datav.aliyun.com/areas_v3/bound", // 地图边界数据源
    geoDataVBaseLegacy: "https://geo.datav.aliyun.com/areas/bound",
}
```

## 管理后台

后台入口为 `/admin`。**初始化版本默认关闭登录**（`public/admin-security.json` 的 `salt` / `hash` 为空）。

设置后台密码的两种方式：

1. **手动生成**：用任意 PBKDF2-SHA256 工具，对你的密码生成 `180000` 次迭代、16 字节随机 salt 的哈希，分别以 Base64 填入 `public/admin-security.json` 的 `salt` 与 `hash`。
2. **后台修改**：按上述方式首次配置后，登录后台即可在「安全设置」中在线修改密码（需配置 GitHub Token）。

> ⚠️ 请勿将个人密码提交到公开仓库。

后台的 GitHub 集成（在线发文章）需要你提供 **GitHub Token** 与仓库地址，这些信息只会保存在浏览器本地（localStorage / sessionStorage）。

## 部署

本项目使用 GitHub Actions 自动部署到 GitHub Pages：

1. 修改 [`astro.config.mjs`](astro.config.mjs) 中的 `site` 与 `base`，改为你的实际部署地址（例如 `site: 'https://<你的用户名>.github.io'`、`base: '/<仓库名>/'`）。
2. 将代码推送到你的 GitHub 仓库。
3. 在仓库 **Settings → Pages** 中，将 Source 设置为 **GitHub Actions**。
4. 推送 `main` 分支后，工作流会自动构建并部署。

## 与 cmchen-blog 的关系

- **[cmchen-blog](https://github.com/shi-tou1234/cmchen-blog)**：包含完整文章与个人内容的完整博客，是作者的日常博客。
- **cmchen-blog-starter（本仓库）**：由 cmchen-blog 初始化而来，**内容为空、功能齐全**，作为通用博客模板供新用户快速开始。

## 致谢

- 本项目深受 [motues/Momo](https://github.com/motues/Momo) 启发，并在此基础上进行了深度功能进化。

---

<p align="center">Made with ❤️ by cmchen</p>
