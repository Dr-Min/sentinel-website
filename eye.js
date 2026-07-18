(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIEWBOX_SIZE = 200;
  const MARK_CENTER = { x: 100, y: 100 };
  const INNER_RADIUS = 46;
  const PUPIL_RADIUS = INNER_RADIUS * 0.07;
  const MAX_TRAVEL = 31;
  const POINTER_RANGE = 180;
  const IDLE_AFTER_MS = 4500;
  const GOLD = "#cca101";

  function makeSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tagName);

    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, String(value));
    });

    return element;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function initializeEye(hostId) {
    const host = document.getElementById(hostId);

    if (!host || host.dataset.eyeInitialized === "true") {
      return;
    }

    host.dataset.eyeInitialized = "true";

    const svg = makeSvgElement("svg", {
      viewBox: `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`,
      role: "presentation",
      "aria-hidden": "true",
      focusable: "false",
      preserveAspectRatio: "xMidYMid meet",
    });
    svg.style.display = "block";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.overflow = "visible";

    const aperture = makeSvgElement("g", {
      fill: "none",
      stroke: GOLD,
    });
    const outerRing = makeSvgElement("circle", {
      cx: MARK_CENTER.x,
      cy: MARK_CENTER.y,
      r: 92,
      stroke: GOLD,
      "stroke-width": "1.5",
      opacity: "0.58",
    });
    const mainRing = makeSvgElement("circle", {
      cx: MARK_CENTER.x,
      cy: MARK_CENTER.y,
      r: 79,
      stroke: GOLD,
      "stroke-width": "7",
    });
    const innerRing = makeSvgElement("circle", {
      cx: MARK_CENTER.x,
      cy: MARK_CENTER.y,
      r: INNER_RADIUS,
      stroke: GOLD,
      "stroke-width": "2.5",
      opacity: "0.9",
    });
    const gaze = makeSvgElement("g");
    const pupil = makeSvgElement("circle", {
      cx: MARK_CENTER.x,
      cy: MARK_CENTER.y,
      r: PUPIL_RADIUS.toFixed(2),
      fill: GOLD,
    });

    aperture.append(outerRing, mainRing, innerRing);
    gaze.append(pupil);
    svg.append(aperture, gaze);
    host.replaceChildren(svg);

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const current = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let lastPointerTime = 0;
    let pulseStart = 0;
    let nextPulseAt = performance.now() + randomBetween(4000, 7000);
    let previousFrameTime = performance.now();

    function resetFocusPulse(now) {
      pulseStart = 0;
      nextPulseAt = now + randomBetween(4000, 7000);
      innerRing.setAttribute("r", INNER_RADIUS);
      innerRing.setAttribute("opacity", "0.9");
    }

    function updatePointerTarget(event) {
      if (
        reducedMotionQuery.matches ||
        (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen")
      ) {
        return;
      }

      const bounds = svg.getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        return;
      }

      const dx = event.clientX - (bounds.left + bounds.width / 2);
      const dy = event.clientY - (bounds.top + bounds.height / 2);
      const distance = Math.hypot(dx, dy);
      const strength = Math.min(distance / POINTER_RANGE, 1);
      const angle = Math.atan2(dy, dx);

      target.x = Math.cos(angle) * MAX_TRAVEL * strength;
      target.y = Math.sin(angle) * MAX_TRAVEL * strength;
      lastPointerTime = performance.now();
    }

    function updateIdleTarget(now) {
      if (reducedMotionQuery.matches) {
        target.x = 0;
        target.y = 0;
        return;
      }

      if (lastPointerTime && now - lastPointerTime < IDLE_AFTER_MS) {
        return;
      }

      const seconds = now / 1000;
      target.x = Math.sin(seconds * 0.42) * MAX_TRAVEL * 0.55;
      target.y = Math.sin(seconds * 0.67 + 1.4) * MAX_TRAVEL * 0.5;
    }

    function updateFocusPulse(now) {
      if (reducedMotionQuery.matches) {
        if (pulseStart) {
          resetFocusPulse(now);
        }
        return;
      }

      if (!pulseStart && now >= nextPulseAt) {
        pulseStart = now;
      }

      if (!pulseStart) {
        return;
      }

      const progress = Math.min((now - pulseStart) / 250, 1);
      const focus = Math.sin(progress * Math.PI);
      innerRing.setAttribute("r", (INNER_RADIUS - focus * 2.5).toFixed(2));
      innerRing.setAttribute("opacity", (0.9 + focus * 0.1).toFixed(2));

      if (progress === 1) {
        resetFocusPulse(now);
      }
    }

    function animate(now) {
      const delta = Math.min((now - previousFrameTime) / 16.67, 4);
      previousFrameTime = now;

      updateIdleTarget(now);

      if (reducedMotionQuery.matches) {
        current.x = 0;
        current.y = 0;
      } else {
        const easing = 1 - Math.pow(0.88, delta);
        current.x += (target.x - current.x) * easing;
        current.y += (target.y - current.y) * easing;
      }

      gaze.setAttribute("transform", `translate(${current.x.toFixed(2)} ${current.y.toFixed(2)})`);
      updateFocusPulse(now);
      requestAnimationFrame(animate);
    }

    window.addEventListener("pointermove", updatePointerTarget, { passive: true });
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
    initializeEye("sentinel-eye");
    initializeEye("nav-eye");
    initializeNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
