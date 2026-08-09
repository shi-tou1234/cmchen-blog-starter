/**
 * 计算页面滚动进度百分比（0-100），供顶部进度条、目录进度、回顶按钮环共用。
 */
export function getScrollProgressPercent(): number {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  if (docHeight <= 0) return 0;
  return Math.min(100, Math.round((scrollTop / docHeight) * 100));
}
