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
  const lines = Array.from(document.querySelectorAll('.film__line'));
  const context = canvas ? canvas.getContext('2d', { alpha: false }) : null;

  if (!film || !canvas || !loader || !loaderBar || !context) {
    root.classList.add('motion-fallback');
    return;
  }

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

  function formatFramePath(index) {
    const frameNumber = String(index + 1).padStart(4, '0');
    const filename = state.manifest.pattern.replace('%04d', frameNumber);
    return `../shared/frames/${filename}`;
  }

  function loadFrame(index) {
    if (state.frames[index]) {
      return state.frames[index].promise;
    }

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

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));

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
    const sourceWidth = state.manifest.width || image.naturalWidth;
    const sourceHeight = state.manifest.height || image.naturalHeight;
    const scale = Math.max(state.displayWidth / sourceWidth, state.displayHeight / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const x = (state.displayWidth - drawWidth) / 2;
    const y = (state.displayHeight - drawHeight) / 2;

    context.drawImage(image, x, y, drawWidth, drawHeight);
    state.drawnFrame = frameIndex;
    state.canvasDirty = false;
    root.classList.add('canvas-ready');
  }

  function overlayOpacity(progress, start, end, stays) {
    if (progress < start || (!stays && progress > end)) return 0;

    const span = end - start;
    const fadeSpan = Math.min(0.055, span * 0.32);
    const fadeIn = smoothstep(clamp((progress - start) / fadeSpan, 0, 1));
    if (stays) return fadeIn;

    const fadeOut = smoothstep(clamp((end - progress) / fadeSpan, 0, 1));
    return Math.min(fadeIn, fadeOut);
  }

  function updateOverlays() {
    lines.forEach((line) => {
      const start = Number(line.dataset.start);
      const end = Number(line.dataset.end);
      const opacity = overlayOpacity(state.progress, start, end, line.dataset.stay === 'true');
      line.style.opacity = opacity.toFixed(3);
      line.style.transform = `translate3d(0, ${(1 - opacity) * 18}px, 0)`;
    });

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
    const scrollDistance = Math.max(1, film.offsetHeight - window.innerHeight);
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
      if (!Number.isInteger(state.manifest.count) || state.manifest.count < 1 || !state.manifest.pattern) {
        throw new Error('Invalid manifest');
      }

      state.frames = new Array(state.manifest.count);
      const coarse = [0];
      for (let frameNumber = 8; frameNumber <= state.manifest.count; frameNumber += 8) {
        coarse.push(frameNumber - 1);
      }

      let coarseLoaded = 0;
      await Promise.all(coarse.map(async (index) => {
        await loadFrame(index);
        coarseLoaded += 1;
        const percent = Math.round((coarseLoaded / coarse.length) * 100);
        loader.setAttribute('aria-valuenow', String(percent));
        loaderBar.style.transform = `scaleX(${coarseLoaded / coarse.length})`;
      }));

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

  initialise();
})();
