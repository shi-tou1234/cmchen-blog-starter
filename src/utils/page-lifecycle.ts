/**
 * 统一组件的生命周期初始化写法：
 * 立即执行一次 + 每次换页（astro:page-load / astro:after-swap）再执行。
 * 替代散落在各组件里的三五行样板代码。
 */
export function onPageLifecycle(init: () => void): void {
  init();
  document.addEventListener('astro:page-load', init);
  document.addEventListener('astro:after-swap', init);
}
