(() => {
  "use strict";

  const IDLE_AFTER_MS = 4500;
  const MAX_YAW_DEG = 14;
  const MAX_PITCH_DEG = 11;
  const MAX_SHIFT_PX = 8;
  const ACTIVE_SCALE = 1.015;
  const GLOW_TRAVEL_PCT = 16;

  function initializeGaze() {
    const host = document.getElementById("sentinel-eye");
    const logo = host?.querySelector(".hero-logo");

    if (!host || !logo) {
      return;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const current = { yaw: 0, pitch: 0, scale: 1 };
    const target = { yaw: 0, pitch: 0, scale: 1 };
    let lastPointerTime = 0;
    let previousFrameTime = performance.now();

    function resetPose() {
      current.yaw = 0;
      current.pitch = 0;
      current.scale = 1;
      target.yaw = 0;
      target.pitch = 0;
      target.scale = 1;
      logo.style.transform = "none";
      host.style.setProperty("--glow-o", "0");
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
      const normX = Math.max(-1, Math.min(dx / (window.innerWidth * 0.45), 1));
      const normY = Math.max(-1, Math.min(dy / (window.innerHeight * 0.45), 1));

      target.yaw = normX * MAX_YAW_DEG;
      target.pitch = -normY * MAX_PITCH_DEG;
      target.scale = ACTIVE_SCALE;
      lastPointerTime = performance.now();
    }

    function updateIdleTarget(now) {
      if (lastPointerTime && now - lastPointerTime < IDLE_AFTER_MS) {
        return;
      }

      const seconds = now / 1000;
      target.yaw = Math.sin(seconds * 0.35) * (MAX_YAW_DEG * 0.35);
      target.pitch = Math.sin(seconds * 0.52 + 1.2) * (MAX_PITCH_DEG * 0.3);
      target.scale = 1;
    }

    function applyPose() {
      const shiftX = (current.yaw / MAX_YAW_DEG) * MAX_SHIFT_PX;
      const shiftY = (-current.pitch / MAX_PITCH_DEG) * MAX_SHIFT_PX * 0.75;

      logo.style.transform =
        `translate(${shiftX.toFixed(2)}px, ${shiftY.toFixed(2)}px) ` +
        `rotateY(${current.yaw.toFixed(2)}deg) ` +
        `rotateX(${current.pitch.toFixed(2)}deg) ` +
        `scale(${current.scale.toFixed(3)})`;

      const glowX = 50 + (current.yaw / MAX_YAW_DEG) * GLOW_TRAVEL_PCT;
      const glowY = 50 - (current.pitch / MAX_PITCH_DEG) * GLOW_TRAVEL_PCT;
      host.style.setProperty("--glow-x", `${glowX.toFixed(1)}%`);
      host.style.setProperty("--glow-y", `${glowY.toFixed(1)}%`);
      host.style.setProperty("--glow-o", "1");
    }

    function animate(now) {
      const delta = Math.min((now - previousFrameTime) / 16.67, 4);
      previousFrameTime = now;

      if (reducedMotionQuery.matches) {
        resetPose();
      } else {
        updateIdleTarget(now);
        const easing = 1 - Math.pow(0.88, delta);
        current.yaw += (target.yaw - current.yaw) * easing;
        current.pitch += (target.pitch - current.pitch) * easing;
        current.scale += (target.scale - current.scale) * easing;
        applyPose();
      }

      requestAnimationFrame(animate);
    }

    window.addEventListener("pointermove", updatePointerTarget, { passive: true });
    reducedMotionQuery.addEventListener("change", resetPose);
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
    initializeGaze();
    initializeNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
