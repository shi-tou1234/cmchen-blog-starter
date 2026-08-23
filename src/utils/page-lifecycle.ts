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

/**
 * 支持清理的页面生命周期注册。
 * 每次触发（立即 + astro:page-load / astro:after-swap）时，先执行上一轮注册的所有清理函数，再执行新一轮 init。
 * init 内通过传入的 cleanup(fn) 登记清理动作（removeEventListener / clearInterval / disconnect 等）。
 */
export function onPageScoped(init: (cleanup: (fn: () => void) => void) => void): void {
  let cleanups: (() => void)[] = [];

  function runInit() {
    const previous = cleanups;
    cleanups = [];

    for (const cleanup of previous) {
      cleanup();
    }

    init((fn) => {
      cleanups.push(fn);
    });
  }

  runInit();
  document.addEventListener('astro:page-load', runInit);
  document.addEventListener('astro:after-swap', runInit);
}
