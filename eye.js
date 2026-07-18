(() => {
  "use strict";

  const POINTER_RANGE = 180;
  const IDLE_AFTER_MS = 4500;

  function initializeEmblem() {
    const host = document.getElementById("sentinel-eye");
    const emblem = host?.querySelector(".logo-emblem");

    if (!host || !emblem) {
      return;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const current = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const maxTravel = { x: 0, y: 0 };
    let lastPointerTime = performance.now();
    let previousFrameTime = performance.now();

    function updateTravelLimits() {
      const renderedWidth = emblem.getBoundingClientRect().width;
      maxTravel.x = renderedWidth * 0.03;
      maxTravel.y = renderedWidth * 0.022;
      current.x = Math.max(-maxTravel.x, Math.min(current.x, maxTravel.x));
      current.y = Math.max(-maxTravel.y, Math.min(current.y, maxTravel.y));
      target.x = Math.max(-maxTravel.x, Math.min(target.x, maxTravel.x));
      target.y = Math.max(-maxTravel.y, Math.min(target.y, maxTravel.y));
    }

    function resetPosition() {
      current.x = 0;
      current.y = 0;
      target.x = 0;
      target.y = 0;
      emblem.style.transform = "translate(0px, 0px)";
    }

    function updatePointerTarget(event) {
      if (
        reducedMotionQuery.matches ||
        (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen")
      ) {
        return;
      }

      const bounds = host.getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        return;
      }

      const dx = event.clientX - (bounds.left + bounds.width / 2);
      const dy = event.clientY - (bounds.top + bounds.height / 2);
      const distance = Math.hypot(dx, dy);
      const strength = Math.min(distance / POINTER_RANGE, 1);
      const angle = Math.atan2(dy, dx);

      target.x = Math.cos(angle) * maxTravel.x * strength;
      target.y = Math.sin(angle) * maxTravel.y * strength;
      lastPointerTime = performance.now();
    }

    function updateIdleTarget(now) {
      if (now - lastPointerTime < IDLE_AFTER_MS) {
        return;
      }

      const seconds = now / 1000;
      target.x = Math.sin(seconds * 0.42) * maxTravel.x * 0.55;
      target.y = Math.sin(seconds * 0.67 + 1.4) * maxTravel.y * 0.5;
    }

    function animate(now) {
      const delta = Math.min((now - previousFrameTime) / 16.67, 4);
      previousFrameTime = now;

      if (reducedMotionQuery.matches) {
        resetPosition();
      } else {
        updateIdleTarget(now);
        const easing = 1 - Math.pow(0.88, delta);
        current.x += (target.x - current.x) * easing;
        current.y += (target.y - current.y) * easing;
        emblem.style.transform = `translate(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px)`;
      }

      requestAnimationFrame(animate);
    }

    function handleMotionPreferenceChange() {
      resetPosition();
      lastPointerTime = performance.now();
      previousFrameTime = performance.now();
    }

    updateTravelLimits();
    window.addEventListener("pointermove", updatePointerTarget, { passive: true });
    window.addEventListener("resize", updateTravelLimits, { passive: true });
    if (!emblem.complete) {
      emblem.addEventListener("load", updateTravelLimits, { once: true });
    }
    reducedMotionQuery.addEventListener("change", handleMotionPreferenceChange);
    requestAnimationFrame(animate);
  }

  function initializeNavigation() {
    const nav = document.getElementById("top-nav");
    const hero = document.getElementById("hero");

    if (!nav || !hero) {
      return;
    }

    let updateRequested = false;

    function updateNavigation() {
      const revealAt = hero.offsetTop + hero.offsetHeight * 0.7;
      nav.classList.toggle("nav-visible", window.scrollY >= revealAt);
      updateRequested = false;
    }

    function requestNavigationUpdate() {
      if (updateRequested) {
        return;
      }

      updateRequested = true;
      requestAnimationFrame(updateNavigation);
    }

    window.addEventListener("scroll", requestNavigationUpdate, { passive: true });
    window.addEventListener("resize", requestNavigationUpdate, { passive: true });
    updateNavigation();
  }

  function initialize() {
    initializeEmblem();
    initializeNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
