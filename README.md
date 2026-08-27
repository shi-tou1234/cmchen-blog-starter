# cmchen-blog-starter

**cmchen-blog 的初始化版本（Starter）** —— 功能齐全、内容为空，克隆即可开始搭建你的博客。

博客在线预览：<https://shi-tou1234.github.io/cmchen-blog-starter/>

后台在线预览：<https://shi-tou1234.github.io/cmchen-blog-starter/admin/>


## 功能特性

### 核心博客功能
- **Markdown 文章管理**：基于 Astro Content Collections，支持 Frontmatter 元数据
- **文章分类与标签**：灵活的分类体系，支持多级分类和标签
- **归档页面**：按时间线展示所有文章，支持按归档筛选浏览
- **RSS 订阅**：自动生成 RSS feed（`/rss.xml`），支持 RSS 阅读器订阅
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
- **分享按钮**：文章页一键复制链接，便于分享
- **社交分享卡片**：完整的 Open Graph / Twitter Card 支持，分享到社交平台时展示标题、描述与封面预览图
- **评论加载状态**：Giscus 评论加载中显示提示，加载失败时提供重试按钮
- **搜索空状态引导**：无结果时给出"换个关键词试试"提示与「浏览全部归档」入口
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

本版本已删除所有个人内容，以下路径即为你需要填充内容的地方。

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| **博客文章** | `src/content/blog/<slug>/zh-cn.md` | 每篇文章一个目录，正文为 Markdown。也可通过后台在线创建 |
| **关于页 · 自我介绍** | `src/content/spec/about/zh-cn.md` | 关于页顶部的介绍文案 |
| **关于页 · 个人资料** | `src/data/about-profile.ts` | MBTI、专业、最近在做、最近读书等 |
| **关于页 · 个性化内容** | `src/data/about-personal.ts` | 个人简介、站点时间轴、音乐列表、旅行城市标记 |
| **工具栏链接** | `src/data/tools-links.ts` | 工具栏页展示的常用工具 / 网站卡片 |
| **页头联系方式** | `src/data/header-contact.ts` | GitHub 主页与邮箱（用于页头复制邮箱等交互） |
| **音乐文件** | `public/music/` | 音乐播放器的音频文件，配合 `about-personal.ts` 的 `musicTracks` 使用 |
| **站点信息** | `src/data/site-info.ts`、`src/data/home-cover.ts` | 站点标题、标语、创建时间（已运行天数起点）、首页打字机签名（留空则显示副标题） |

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
    indexPage: "https://shi-tou1234.github.io/cmchen-blog-starter/", // 你的主页地址
    startYear: 2026,
}

export const externalUrlsConfig: ExternalUrlsConfig = {
    githubApi: "https://api.github.com",
    githubRepo: "shi-tou1234/cmchen-blog-starter", // 你的 GitHub 仓库（owner/repo），用于后台管理与提交热力图
    giscusRepoId: "", // Giscus 评论的 repo-id（启用评论时填写）
    geoDataVBase: "https://geo.datav.aliyun.com/areas_v3/bound", // 地图边界数据源
    geoDataVBaseLegacy: "https://geo.datav.aliyun.com/areas/bound",
}
```

部署地址在 [`astro.config.mjs`](astro.config.mjs) 中配置：

```ts
export default defineConfig({
  site: 'https://shi-tou1234.github.io',
  base: '/cmchen-blog-starter/',
  // ...
})
```

克隆后请把 `site`、`base`、`indexPage`、`githubRepo` 改成你自己的部署地址与仓库。

## 管理后台

后台入口为 `/admin`。**初始化版本默认不设密码，打开即可直接进入后台**；进入后可在「安全」页设置密码，之后登录需要密码。

### 前置：配置 GitHub 连接

后台的在线编辑（文章、站点设置、安全密码）都通过 GitHub API 写入仓库源码，需要先在 **GitHub** 页配置：

1. 到 GitHub 的 `Settings → Developer settings → Personal access tokens` 生成一个具有仓库读写权限的 Token（`Contents: Read and write`）。现在后台使用的是我这个仓库的token,克隆本仓库的时候需要自己申请。
2. 在后台 **GitHub** 页填入 Token、分支名（默认 `main`），点击保存。
3. Token 只保存在浏览器本地（localStorage / sessionStorage），不会写入仓库。

> 未配置 Token 时只能「加载」，无法「保存」。

### 模块说明

#### 文章
- 在线创建、编辑、删除文章，内容存放在 `src/content/blog/<slug>/zh-cn.md`。
- 支持 Markdown、公式推导浮层、图片上传、PDF 转图片、文章实时预览与回填。
- 点「保存」即通过 GitHub 提交；保存后需重新部署才会在前台生效。

#### 设置（站点信息与内容）

设置页包含多个子标签，每个模块都是「先点加载读取当前配置，修改后点保存写入仓库」：

| 子标签 | 作用 | 对应文件 |
| --- | --- | --- |
| 站点信息 | 左上角站点标题、标语、创建时间（已运行天数起点）、首页打字机签名 | `src/data/site-info.ts`、`src/data/home-cover.ts` |
| 关于页文本 | 关于页正文 Markdown | `src/content/spec/about/zh-cn.md` |
| 时间线 | 关于页「网站记录」时间轴 | `src/data/about-personal.ts` |
| 个人介绍 | 关于页个人简介、音乐列表、旅行地图城市标记 | `src/data/about-personal.ts` |
| 特质 | MBTI、专业、最近在做、最近读书 | `src/data/about-profile.ts` |
| 工具链接 | 工具栏页的常用工具 / 网站卡片 | `src/data/tools-links.ts` |
| 联系方式 | 页头 GitHub 链接与邮箱 | `src/data/header-contact.ts` |
| 博客介绍 | 首次访问弹窗（新手指南）内容 | `src/data/blog-guide-content.ts` |

#### 安全
- 未设置密码时后台为开放访问，进入后页面会提示直接进入。
- 首次设置：先在「GitHub」页填好 Token，再到「安全」页直接输入新密码（至少 6 位），点「修改密码」即可（无需填写当前密码）。
- 已设置密码后：再次进入后台需要输入密码；修改密码需先填写当前密码。
- 密码以 PBKDF2-SHA256 哈希保存在 `public/admin-security.json`，请勿提交明文密码。

#### 导出
- 一键导出站点全部数据（文章、配置等），用于备份或迁移。

#### GitHub
- 配置后台使用的 GitHub Token、API 地址与分支；Token 仅保存在浏览器本地。

### 常见问题
- **保存失败 / 提示请填写 Token**：先在「GitHub」页配置 Token。
- **修改后前台没变化**：保存只是写入仓库源码，需要触发部署（推送到 main 触发 GitHub Actions）重新构建后才生效。
- **后台加载不出来内容或者无法保存**：如果你是使用watt tookit加速打开github的话，关闭加速就可以了。

## 部署

本项目使用 GitHub Actions 自动部署到 GitHub Pages：

1. 修改 [`astro.config.mjs`](astro.config.mjs) 中的 `site` 与 `base`，改为你的实际部署地址（例如 `site: 'https://<你的用户名>.github.io'`、`base: '/<仓库名>/'`）。
2. 将代码推送到你的 GitHub 仓库。
3. 在仓库 Settings → Pages 中，将 Source 设置为 **GitHub Actions**（构建方式选择 GitHub Actions，而不是 Deploy from a branch）。
4. 推送 `main` 分支后，工作流会自动构建并部署。

## 桌面版（Electron）

本项目支持打包为三平台桌面应用（Windows / macOS / Linux）：**优先在线加载 GitHub Pages 线上站点（新文章即时可见，无需重新打包），断网或站点不可达时自动回落到打包时内置的离线快照**，中文搜索两种模式下均可用。

### GitHub Actions 自动发布（推荐）

推送 `v*` 格式的 tag 后，GitHub Actions 自动构建三平台安装包并挂上 Release：

```bash
# 打 tag 并推送 → 自动触发构建并发布 Release
git tag v1.0
git push origin v1.0
```

Release 包含的产物：

| 平台 | 产物 | 说明 |
| --- | --- | --- |
| Windows | `*-Setup*.exe` | NSIS 安装版，运行即装 |
| Windows | `*.exe`（无 Setup） | 便携版，双击即用 |
| macOS | `*-arm64.dmg` | Apple Silicon 芯片（M1/M2/M3/M4） |
| macOS | `*.dmg`（无后缀） | Intel 芯片 |
| Linux | `*.AppImage` | 单文件免安装 |

### 安装指南

#### Windows
1. 从 Release 下载 `*-Setup*.exe`（安装版）或另一个 exe（便携版）
2. 安装版：双击运行，按提示安装；便携版：直接双击运行
3. Windows SmartScreen 可能提示「未知发布者」，选择「仍要运行」即可（当前未签名）

#### macOS
1. 从 Release 下载对应芯片的 `.dmg`：
   - **Apple Silicon**（M 系列）：`*-arm64.dmg`
   - **Intel**：下载另一个 `.dmg`（文件名无 arm64 后缀）
2. 双击 dmg → 拖动 `cmchen-blog-desktop.app` 到 Applications 文件夹
3. **首次打开**：右键选择「打开」→ 弹窗中点「打开」（未签名应用，Gatekeeper 默认拦截）
4. 或终端执行：`xattr -cr /Applications/cmchen-blog-desktop.app`

> 确认自己的芯片类型：左上角苹果菜单 →「关于本机」→ 查看芯片信息

#### Linux
1. 从 Release 下载 `*.AppImage`
2. 赋予执行权限并运行：
   ```bash
   chmod +x cmchen-blog-desktop-*.AppImage
   ./cmchen-blog-desktop-*.AppImage
   ```
3. **Ubuntu 24.04+**：需要先安装 libfuse2
   ```bash
   sudo apt install libfuse2t64
   ```

### 本地打包（Windows）

本机 Windows 可直接打包 Windows 版：

```bash
# 一键打包（桌面形态构建 + 精简 electron 应用）
pnpm run dist:electron
```

产物输出到 `release/`（文件名中的版本号取 `DESKTOP_VERSION` 环境变量，缺省 `0.0.1`；CI 上由 tag 自动透传，两段式短 tag 会自动补零为三段）：
- `cmchen-blog-desktop Setup <版本>.exe`：NSIS 安装版
- `cmchen-blog-desktop <版本>.exe`：便携版，双击即用

> macOS 和 Linux 包需要在对应系统的 GitHub Actions 构建机上自动产出，Windows 本地无法打出。

### 各平台构建环境要求

如果需要在本地自行构建（不使用 GitHub Actions 自动发布），需满足以下环境：

| 平台 | 必需 | 说明 |
| --- | --- | --- |
| 全平台 | Node.js 24+ | 本项目使用 `packageManager` 字段锁定 pnpm 版本 |
| 全平台 | pnpm | 通过 `corepack enable` 启用，版本见 `package.json` |
| 全平台 | npm | 随 Node.js 安装，打包脚本内部用 npm 安装隔离依赖 |
| Windows | 无额外要求 | 打包 NSIS + portable，electron-builder 内置所需工具 |
| macOS | 无额外要求 | 打包 dmg，需 macOS 系统（不能用 Linux 或 Windows 交叉编译） |
| Linux | 无额外要求 | 打包 AppImage，Ubuntu 24.04+ 需 `sudo apt install libfuse2t64` |

> macOS 的 dmg 依赖系统工具 `hdiutil` 和 Apple SDK，**只能在 macOS 上打包**，Windows 和 Linux 均无法交叉编译。GitHub Actions 使用 macOS 构建机（Apple Silicon）解决此限制。

### 实现说明

- 桌面壳基于 [Electron](https://www.electronjs.org/)，启动时探测线上站点（HEAD + 5 秒超时），可达即加载线上；不可达则用内置 `serve-handler` 在 127.0.0.1 随机端口托管打包时的离线快照
- 线上地址可用环境变量 `DESKTOP_ONLINE_URL` 覆盖（如换自定义域名）
- 采用精简打包策略：staging 目录仅包含 `electron/main.js` + `dist/` + `serve-handler` 运行时依赖（约 12 个包），exe 体积约 **110MB**
- 搜索（Pagefind）需要 http 源加载，两种模式均已处理
- 只有想让「离线快照」更新时才需要重新打包；在线模式下内容始终最新
- 应用图标在 `electron/icon.png`（≥256 的正方形 PNG），换成自己的图重新打包即可生效
- macOS 和 Linux 包均未签名（无 Apple 开发者账号），需用户手动授权首次打开


## 致谢

- 本项目深受 [motues/Momo](https://github.com/motues/Momo) 启发，并在此基础上进行了深度功能进化。
