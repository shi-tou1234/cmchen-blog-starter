export type BlogGuideLocaleContent = {
  title: string;
  subtitle: string;
  items: string[];
};

export type BlogGuideContent = {
  "zh-cn": BlogGuideLocaleContent;
  en: BlogGuideLocaleContent;
};

const blogGuideContent: BlogGuideContent = {
  "zh-cn": {
    "title": "博客使用指南",
    "subtitle": "首次访问自动弹出；你可以随时通过右上角问号按钮重新打开。",
    "items": [
      "首页更新提示：发布新内容或更新旧文后，首页弹出一次性通知，可直达最新文章。",
      "全站搜索：快捷键 /或 Ctrl/Cmd + K唤起，支持标题与正文关键词检索，含搜索历史与热门推荐。",
      "导航与工具栏：顶部导航直达首页、归档、关于、工具栏；工具栏页整合常用工具与站点链接，移动端底部导航栏适配。",
      "主题切换：亮色/暗色一键切换，自动记忆偏好并跟随系统偏好。",
      "沉浸阅读：双击正文进入全屏阅读模式，再次双击退出；支持正文字号调节。",
      "公式推导浮层：数理公式支持 hover 弹出推导过程（移动端点击触发），不打断阅读节奏。",
      "图片预览：点击图片全屏查看，支持滚轮/手势缩放、拖拽平移、多图切换。",
      "目录与分类推荐：自动生成文章目录锚点跳转，文末推荐同分类文章。",
      "便捷工具：右侧悬浮返回顶部（带阅读进度环）、粒子背景等辅助交互。"
    ]
  },
  "en": {
    "title": "Blog User Guide",
    "subtitle": "Shown automatically on first visit. Reopen anytime with the top-right help button.",
    "items": [
      "**Home Update Notification:** After publishing new content or updating an existing post, a one-time notification pops up on the homepage, providing a direct link to the latest article.",
      "**Global Search:** Press the `/` or `Ctrl/Cmd + K` shortcut to invoke the search panel. Supports keyword search across titles and body text, with search history and trending recommendations.",
      "**Navigation & Toolbar:** The top navigation bar provides quick access to Home, Archive, About, and Toolbar. The Toolbar page aggregates commonly used tools and site links, while a bottom navigation bar adapts for mobile devices.",
      "**Theme Switching:** One‑click toggle between light and dark modes, with automatic preference saving and system‑level follow‑up.",
      "**Immersive Reading:** Double‑click on the article body to enter full‑screen reading mode; double‑click again to exit. Font size adjustment is also supported.",
      "**Formula Derivation Overlay:** For mathematical formulas, hovering (or tapping on mobile) pops up the derivation process, without interrupting your reading flow.",
      "**Image Preview:** Click on any image to view it in full screen, with support for zoom (scroll/gesture), drag‑to‑pan, and navigation through multiple images.",
      "**Table of Contents & Category Recommendations:** Automatically generates a table of contents with anchor links for the current article, and recommends related posts from the same category at the end.",
      "**Convenience Tools:** A floating button on the right side returns you to the top (with a reading‑progress ring), along with auxiliary interactions such as particle backgrounds."
    ]
  }
};

export default blogGuideContent;
