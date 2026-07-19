(() => {
  'use strict';

  document.documentElement.classList.add('reveal-ready');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const rows = [...document.querySelectorAll('.work-row')];
  const photoBase = '../shared/photos/';

  function initReveals() {
    const elements = document.querySelectorAll('.reveal');

    if (reducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-revealed'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, {
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.08,
    });

    elements.forEach((element) => observer.observe(element));

    const revealVisible = () => {
      elements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.98 && rect.bottom > 0) {
          element.classList.add('is-revealed');
          observer.unobserve(element);
        }
      });
    };

    revealVisible();
    window.addEventListener('load', () => window.requestAnimationFrame(revealVisible), { once: true });
  }

  async function syncManifest() {
    try {
      const response = await fetch(`${photoBase}photos.json`);
      if (!response.ok) return;

      const projects = await response.json();
      projects.slice(0, rows.length).forEach((project, index) => {
        const row = rows[index];
        row.dataset.photo = project.file;
        row.querySelector('.work-row__year').textContent = project.year;
        row.querySelector('strong').textContent = project.title;
        row.querySelector('.work-row__venue').textContent = project.venue;
        row.setAttribute('aria-label', `${project.title} 이미지 보기`);
      });
    } catch (_) {
      // The semantic HTML already contains the complete manifest as a local fallback.
    }
  }

  function initTouchPreview() {
    const preview = document.querySelector('.touch-preview');
    const image = preview?.querySelector('img');
    const captionParts = preview?.querySelectorAll('figcaption span');
    if (!preview || !image || !captionParts || !coarsePointer) return;

    rows.forEach((row) => {
      row.addEventListener('click', () => {
        rows.forEach((item) => item.classList.remove('is-selected'));
        row.classList.add('is-selected');
        preview.classList.add('is-changing');

        const title = row.querySelector('strong').textContent;
        image.onload = () => preview.classList.remove('is-changing');
        image.src = `${photoBase}${row.dataset.photo}`;
        image.alt = `${title} 현장`;
        captionParts[0].textContent = row.dataset.index;
        captionParts[1].textContent = title;
      });
    });
  }

  function initFloatingPreview() {
    if (coarsePointer || reducedMotion) return;

    const preview = document.querySelector('.floating-preview');
    const image = preview?.querySelector('img');
    const index = preview?.querySelector('.floating-preview__index');
    if (!preview || !image || !index) return;

    let currentX = -500;
    let currentY = -500;
    let targetX = -500;
    let targetY = -500;
    let rotation = 0;
    let targetRotation = 0;
    let lastPointerX = 0;
    let active = false;
    let activePhoto = '';
    let frameId = 0;

    const clampTarget = (event) => {
      const width = preview.offsetWidth;
      const height = preview.offsetHeight;
      const gutter = 18;
      const offsetX = 30;
      const offsetY = 28;
      targetX = Math.min(window.innerWidth - width - gutter, Math.max(gutter, event.clientX + offsetX));
      targetY = Math.min(window.innerHeight - height - gutter, Math.max(gutter, event.clientY - height * 0.48 + offsetY));

      const velocityX = event.clientX - lastPointerX;
      targetRotation = Math.max(-3, Math.min(3, velocityX * 0.14));
      lastPointerX = event.clientX;
    };

    const render = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      rotation += (targetRotation - rotation) * 0.12;
      targetRotation *= 0.9;

      const scale = active ? 1 : 0.88;
      preview.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(${scale}) rotate(${rotation}deg)`;
      frameId = window.requestAnimationFrame(render);
    };

    rows.forEach((row) => {
      row.addEventListener('pointerenter', (event) => {
        active = true;
        activePhoto = row.dataset.photo;
        clampTarget(event);
        currentX = targetX - 24;
        currentY = targetY + 12;
        const photo = new Image();
        photo.onload = () => {
          if (active && activePhoto === row.dataset.photo) {
            image.src = photo.src;
            preview.classList.add('is-visible');
          }
        };
        photo.src = `${photoBase}${row.dataset.photo}`;
        index.textContent = `${row.dataset.index} / 08`;
      });

      row.addEventListener('pointermove', clampTarget);

      row.addEventListener('pointerleave', () => {
        active = false;
        activePhoto = '';
        preview.classList.remove('is-visible');
      });
    });

    frameId = window.requestAnimationFrame(render);
    window.addEventListener('pagehide', () => window.cancelAnimationFrame(frameId), { once: true });
  }

  initReveals();
  syncManifest();
  initTouchPreview();
  initFloatingPreview();
})();
