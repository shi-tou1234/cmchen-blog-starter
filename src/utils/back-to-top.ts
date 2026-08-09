import { getScrollProgressPercent } from './scroll';

// 记录每个按钮当前挂的监听，重复初始化时先摘掉，避免累积
const activeListeners = new WeakMap<HTMLElement, { scroll: () => void; click: () => void }>();

/**
 * 给「回到顶部」按钮绑定：滚动时更新进度环 + 点击平滑回顶。
 * 供侧边栏 BackTop 组件与全局回顶按钮共用，避免两套几乎一样的实现。
 */
export function initBackToTop(btn: HTMLElement | null, circle: HTMLElement | null): void {
  if (!btn || !circle) return;

  const prev = activeListeners.get(btn);
  if (prev) {
    window.removeEventListener('scroll', prev.scroll);
    btn.removeEventListener('click', prev.click);
  }

  const handleScroll = () => {
    const percent = getScrollProgressPercent();
    const circumference = 2 * Math.PI * 20;
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDasharray = `${circumference - offset} ${offset}`;
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  btn.addEventListener('click', scrollToTop);
  activeListeners.set(btn, { scroll: handleScroll, click: scrollToTop });
  handleScroll();
}
