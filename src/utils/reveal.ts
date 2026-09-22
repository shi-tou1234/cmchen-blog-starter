/**
 * 全站统一的卡片/区块入场动画。
 *
 * 读取所有 [data-card-reveal] 元素，用 IntersectionObserver 在进入视口时加
 * .is-visible（样式见 global.css）。AOS 已移除，这里是唯一的入场机制；
 * prefers-reduced-motion 时直接显示、不播动画。
 */
export function initCardReveal(): void {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-card-reveal]'));
  if (cards.length === 0) return;

  const oldObserver = window.__postCardRevealObserver;
  if (oldObserver) {
    oldObserver.disconnect();
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    cards.forEach((card) => {
      card.classList.remove('post-card-reveal');
      card.classList.add('is-visible');
    });
    return;
  }

  cards.forEach((card) => {
    card.classList.add('post-card-reveal');
    card.classList.remove('is-visible');
  });

  const observer = new IntersectionObserver(
    (entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (entry.target instanceof HTMLElement) {
          entry.target.classList.add('is-visible');
        }
        currentObserver.unobserve(entry.target);
      });
    },
    {
      root: null,
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.08,
    },
  );

  cards.forEach((card) => observer.observe(card));
  window.__postCardRevealObserver = observer;
}
