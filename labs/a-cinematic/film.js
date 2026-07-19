(() => {
  'use strict';

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (reducedMotion.matches) {
    root.classList.add('reduced-motion');
    return;
  }

  const film = document.querySelector('.film');
  const canvas = document.querySelector('.film__canvas');
  const loader = document.querySelector('.loader');
  const loaderBar = document.querySelector('.loader__bar');
  const landing = document.querySelector('.landing');
  const lines = Array.from(document.querySelectorAll('.film__line'));
  const context = canvas ? canvas.getContext('2d', { alpha: false }) : null;

  if (!film || !canvas || !loader || !loaderBar || !landing || !context) {
    root.classList.add('motion-fallback');
    return;
  }

  const EMBLEM = {
    centerX: 0.501,
    centerY: 0.438,
    width: 0.349,
  };

  const state = {
    manifest: null,
    frames: [],
    loaded: new Set(),
    progress: 0,
    targetFrame: -1,
    drawnFrame: -1,
    raf: 0,
    canvasDirty: true,
    displayWidth: 0,
    displayHeight: 0,
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const smoothstep = (value) => value * value * (3 - 2 * value);
  const phase = (value, start, end) => smoothstep(clamp((value - start) / (end - start), 0, 1));

  function coverFit(viewWidth, viewHeight) {
    const sourceWidth = state.manifest.width;
    const sourceHeight = state.manifest.height;
    const scale = Math.max(viewWidth / sourceWidth, viewHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;

    return {
      scale,
      width,
      height,
      x: (viewWidth - width) / 2,
      y: (viewHeight - height) / 2,
    };
  }

  // Public by design: landing elements and the canvas share this exact cover-fit map.
  function frameSpaceToViewport(xPercent, yPercent) {
    if (!state.manifest) return null;

    const rect = canvas.getBoundingClientRect();
    const fit = coverFit(rect.width, rect.height);
    return {
      x: rect.left + fit.x + state.manifest.width * (xPercent / 100) * fit.scale,
      y: rect.top + fit.y + state.manifest.height * (yPercent / 100) * fit.scale,
      scale: fit.scale,
    };
  }

  window.frameSpaceToViewport = frameSpaceToViewport;

  function formatFramePath(index) {
    const frameNumber = String(index + 1).padStart(4, '0');
    const filename = state.manifest.pattern.replace('%04d', frameNumber);
    return `../shared/frames/${filename}`;
  }

  function loadFrame(index) {
    if (state.frames[index]) return state.frames[index].promise;

    const image = new Image();
    image.decoding = 'async';
    const promise = new Promise((resolve) => {
      image.addEventListener('load', () => {
        state.loaded.add(index);
        if (state.targetFrame === index || state.drawnFrame < 0) {
          state.canvasDirty = true;
          scheduleRender();
        }
        resolve(true);
      }, { once: true });
      image.addEventListener('error', () => resolve(false), { once: true });
    });

    state.frames[index] = { image, promise };
    image.src = formatFramePath(index);
    return promise;
  }

  function nearestLoadedFrame(target) {
    if (state.loaded.has(target)) return target;

    for (let distance = 1; distance < state.manifest.count; distance += 1) {
      const before = target - distance;
      const after = target + distance;
      if (before >= 0 && state.loaded.has(before)) return before;
      if (after < state.manifest.count && state.loaded.has(after)) return after;
    }

    return -1;
  }

  function updateLandingGeometry() {
    if (!state.manifest) return;

    const center = frameSpaceToViewport(EMBLEM.centerX * 100, EMBLEM.centerY * 100);
    if (!center) return;

    const emblemWidth = state.manifest.width * EMBLEM.width * center.scale;
    landing.style.setProperty('--emblem-center-x', `${center.x.toFixed(2)}px`);
    landing.style.setProperty('--emblem-center-y', `${center.y.toFixed(2)}px`);
    landing.style.setProperty('--emblem-width', `${emblemWidth.toFixed(2)}px`);
    landing.style.setProperty('--band-width', `${(emblemWidth * 1.15).toFixed(2)}px`);
    landing.style.setProperty('--band-height', `${(emblemWidth * 0.235).toFixed(2)}px`);
    landing.style.setProperty('--wordmark-size', `${(emblemWidth * 0.18).toFixed(2)}px`);
    landing.style.setProperty('--landing-below', `${(center.y + emblemWidth * 0.535).toFixed(2)}px`);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));

    updateLandingGeometry();
    if (canvas.width === width && canvas.height === height) return;

    canvas.width = width;
    canvas.height = height;
    state.displayWidth = width;
    state.displayHeight = height;
    state.canvasDirty = true;
  }

  function drawFrame() {
    if (!state.manifest || !state.canvasDirty) return;

    const frameIndex = nearestLoadedFrame(state.targetFrame);
    if (frameIndex < 0) return;

    const image = state.frames[frameIndex].image;
    const fit = coverFit(state.displayWidth, state.displayHeight);
    context.drawImage(image, fit.x, fit.y, fit.width, fit.height);
    state.drawnFrame = frameIndex;
    state.canvasDirty = false;
    root.classList.add('canvas-ready');
  }

  function overlayOpacity(progress, start, end) {
    if (progress < start || progress > end) return 0;

    const span = end - start;
    const fadeSpan = Math.min(0.05, span * 0.3);
    const fadeIn = phase(progress, start, start + fadeSpan);
    const fadeOut = 1 - phase(progress, end - fadeSpan, end);
    return Math.min(fadeIn, fadeOut);
  }

  function updateOverlays() {
    lines.forEach((line) => {
      const opacity = overlayOpacity(
        state.progress,
        Number(line.dataset.start),
        Number(line.dataset.end),
      );
      line.style.opacity = opacity.toFixed(3);
      line.style.transform = `translate3d(0, ${(1 - opacity) * 18}px, 0)`;
    });

    const reveal = phase(state.progress, 0.96, 1);
    const wordmarkReveal = phase(reveal, 0, 0.52);
    const taglineReveal = phase(reveal, 0.22, 0.76);
    const ctaReveal = phase(reveal, 0.48, 1);
    const tracking = 0.115 + (1 - wordmarkReveal) * 0.22;

    landing.style.setProperty('--wordmark-opacity', wordmarkReveal.toFixed(3));
    landing.style.setProperty('--wordmark-tracking', `${tracking.toFixed(3)}em`);
    landing.style.setProperty('--tagline-opacity', taglineReveal.toFixed(3));
    landing.style.setProperty('--tagline-offset', `${((1 - taglineReveal) * 12).toFixed(2)}px`);
    landing.style.setProperty('--cta-opacity', ctaReveal.toFixed(3));
    landing.style.setProperty('--cta-offset', `${((1 - ctaReveal) * 12).toFixed(2)}px`);
    landing.classList.toggle('is-active', state.progress >= 0.94);
    landing.classList.toggle('is-interactive', ctaReveal > 0.8);
    film.classList.toggle('has-progress', state.progress > 0.012);
  }

  function render() {
    state.raf = 0;
    resizeCanvas();
    drawFrame();
    updateOverlays();
  }

  function scheduleRender() {
    if (!state.raf) state.raf = window.requestAnimationFrame(render);
  }

  function updateProgress() {
    const rect = film.getBoundingClientRect();
    // Reserve the section's final viewport of sticky travel as a stable landing hold.
    const scrollDistance = Math.max(1, film.offsetHeight - (window.innerHeight * 2));
    state.progress = clamp(-rect.top / scrollDistance, 0, 1);

    if (state.manifest) {
      const nextTarget = Math.round(state.progress * (state.manifest.count - 1));
      if (nextTarget !== state.targetFrame) {
        state.targetFrame = nextTarget;
        state.canvasDirty = true;
        loadFrame(nextTarget);
      }
    }

    scheduleRender();
  }

  async function loadProgressively(indices, concurrency = 4) {
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < indices.length) {
        const index = indices[cursor];
        cursor += 1;
        await loadFrame(index);
      }
    });
    await Promise.all(workers);
  }

  async function initialise() {
    try {
      const response = await fetch('../shared/frames/manifest.json');
      if (!response.ok) throw new Error('Manifest unavailable');

      state.manifest = await response.json();
      if (
        !Number.isInteger(state.manifest.count)
        || state.manifest.count < 1
        || !state.manifest.pattern
        || !(state.manifest.width > 0)
        || !(state.manifest.height > 0)
      ) {
        throw new Error('Invalid manifest');
      }

      state.frames = new Array(state.manifest.count);
      const coarse = [0];
      for (let frameNumber = 8; frameNumber <= state.manifest.count; frameNumber += 8) {
        coarse.push(frameNumber - 1);
      }
      if (coarse[coarse.length - 1] !== state.manifest.count - 1) {
        coarse.push(state.manifest.count - 1);
      }

      let coarseLoaded = 0;
      await Promise.all(coarse.map(async (index) => {
        await loadFrame(index);
        coarseLoaded += 1;
        const percent = Math.round((coarseLoaded / coarse.length) * 100);
        loader.setAttribute('aria-valuenow', String(percent));
        loaderBar.style.transform = `scaleX(${coarseLoaded / coarse.length})`;
      }));

      if (state.loaded.size === 0) throw new Error('Frames unavailable');

      loader.classList.add('is-ready');
      window.setTimeout(() => {
        loader.hidden = true;
      }, 520);

      updateProgress();

      const coarseSet = new Set(coarse);
      const remaining = Array.from({ length: state.manifest.count }, (_, index) => index)
        .filter((index) => !coarseSet.has(index));
      await loadProgressively(remaining);
    } catch (_) {
      root.classList.add('motion-fallback');
    }
  }

  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', () => {
    state.canvasDirty = true;
    updateProgress();
  }, { passive: true });
  window.addEventListener('pageshow', updateProgress);

  initialise();
})();
