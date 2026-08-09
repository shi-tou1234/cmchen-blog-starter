/**
 * 弹窗公共逻辑：锁滚动 + 焦点圈住（Tab 不逃出弹窗）。
 * 四个弹窗（搜索/图片放大/指南/移动菜单）统一用它，避免各写各的。
 */

/** 锁定/解锁页面滚动（弹窗打开时锁住，关闭时恢复） */
export function lockBodyScroll(locked: boolean): void {
  if (locked) {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }
}

/**
 * 焦点圈住：按 Tab 时把焦点限制在弹窗容器内，不逃到背后页面。
 * 用法：在容器 keydown 事件里调用 trapFocus(container, event)。
 */
export function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const focusables = Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    ),
  ).filter((el) => !el.hidden && el.offsetParent !== null);

  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else {
    if (active === last || !container.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }
}
