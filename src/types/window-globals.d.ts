// 本项目客户端脚本大量使用 window.__xxx 约定式全局，
// 此处为近期改动引入的全局属性补充类型声明，其余历史属性沿用既有宽松风格。

export type SpoilerScrollHandler = () => void;

declare global {
  interface Window {
    /** 按需加载 Pagefind（首次打开搜索面板时由入口调用） */
    __loadPagefindNow?: () => void;
    /** TravelMap 懒加载后的 echarts core 实例（仅注册 map + tooltip，首次进入视口时赋值） */
    echarts: typeof import("echarts/core");
    /** about 页热力图 tooltip 监听器集合（页面切换前清理用） */
    __heatmapTooltipHandlers?: {
      enter?: EventListener;
      move?: EventListener;
      leave?: EventListener;
    };
    /** about 页热力图 mouseenter 单监听清理引用（历史遗留接口） */
    __heatmapTooltipHandler?: EventListener;
    /** TravelMap GeoJSON 缓存 */
    __travelGeoCache?: Record<string, any>;
    /** MainPageLayout 粒子主题切换 observer */
    __globalParticleThemeObserver?: MutationObserver;
    /** MainPageLayout 弹层焦点圈住函数（历史遗留接口） */
    __blogTrapFocus?: (el: Element) => void;
  }

  interface Element {
    /** Markdown spoiler 当前绑定的 scroll 监听（重复点击前先解绑） */
    __spoilerScrollHandler?: SpoilerScrollHandler | null;
  }
}

export {};
