
(() => {
  const start = () => {
    const intro = document.getElementById('tobaIntro');
    if (!intro) return;

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    window.setTimeout(() => {
      intro.classList.add('is-leaving');
      window.setTimeout(() => intro.remove(), 750);
    }, reducedMotion ? 500 : 2650);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
