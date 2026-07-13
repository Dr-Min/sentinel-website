(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIEWBOX_WIDTH = 200;
  const VIEWBOX_HEIGHT = 140;
  const EYE_CENTER = { x: 100, y: 70 };
  const MAX_TRAVEL = { x: 24, y: 13 };
  const POINTER_RANGE = 180;
  const IDLE_AFTER_MS = 4500;

  function makeSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tagName);

    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, String(value));
    });

    return element;
  }

  function initializeEye() {
    const host = document.getElementById("sentinel-eye");

    if (!host || host.dataset.eyeInitialized === "true") {
      return;
    }

    host.dataset.eyeInitialized = "true";

    const svg = makeSvgElement("svg", {
      viewBox: `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`,
      role: "presentation",
      "aria-hidden": "true",
      focusable: "false",
      preserveAspectRatio: "xMidYMid meet",
    });
    svg.style.display = "block";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.overflow = "visible";

    const defs = makeSvgElement("defs");
    const clipPath = makeSvgElement("clipPath", { id: "sentinel-eye-clip" });
    clipPath.append(
      makeSvgElement("path", {
        d: "M10 70 C34 20 75 12 100 12 C125 12 166 20 190 70 C166 120 125 128 100 128 C75 128 34 120 10 70 Z",
      }),
    );
    defs.append(clipPath);
    svg.append(defs);

    const eyeVisual = makeSvgElement("g");
    const sclera = makeSvgElement("path", {
      d: "M10 70 C34 20 75 12 100 12 C125 12 166 20 190 70 C166 120 125 128 100 128 C75 128 34 120 10 70 Z",
      fill: "#f4f1e8",
      stroke: "#111820",
      "stroke-width": "6",
      "stroke-linejoin": "round",
    });

    const clippedContents = makeSvgElement("g", {
      "clip-path": "url(#sentinel-eye-clip)",
    });
    const gaze = makeSvgElement("g");
    const iris = makeSvgElement("circle", {
      cx: EYE_CENTER.x,
      cy: EYE_CENTER.y,
      r: 31,
      fill: "#4da4a7",
      stroke: "#183d45",
      "stroke-width": "5",
    });
    const irisRing = makeSvgElement("circle", {
      cx: EYE_CENTER.x,
      cy: EYE_CENTER.y,
      r: 23,
      fill: "none",
      stroke: "#8ed2c8",
      "stroke-width": "2",
      opacity: "0.62",
    });
    const pupil = makeSvgElement("circle", {
      cx: EYE_CENTER.x,
      cy: EYE_CENTER.y,
      r: 13,
      fill: "#071014",
    });
    const highlight = makeSvgElement("circle", {
      cx: EYE_CENTER.x - 8,
      cy: EYE_CENTER.y - 10,
      r: 5,
      fill: "#ffffff",
      opacity: "0.92",
    });

    gaze.append(iris, irisRing, pupil, highlight);
    clippedContents.append(gaze);
    eyeVisual.append(sclera, clippedContents);
    svg.append(eyeVisual);
    host.replaceChildren(svg);

    const current = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let lastPointerTime = 0;
    let blinkStart = 0;
    let blinkDuration = 0;
    let nextBlinkAt = performance.now() + randomBetween(4000, 7000);
    let previousFrameTime = performance.now();

    function randomBetween(min, max) {
      return min + Math.random() * (max - min);
    }

    function updatePointerTarget(event) {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") {
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

      target.x = Math.cos(angle) * MAX_TRAVEL.x * strength;
      target.y = Math.sin(angle) * MAX_TRAVEL.y * strength;
      lastPointerTime = performance.now();
    }

    function updateIdleTarget(now) {
      if (lastPointerTime && now - lastPointerTime < IDLE_AFTER_MS) {
        return;
      }

      const seconds = now / 1000;
      target.x = Math.sin(seconds * 0.42) * MAX_TRAVEL.x * 0.55;
      target.y = Math.sin(seconds * 0.67 + 1.4) * MAX_TRAVEL.y * 0.5;
    }

    function updateBlink(now) {
      if (!blinkStart && now >= nextBlinkAt) {
        blinkStart = now;
        blinkDuration = randomBetween(150, 210);
      }

      let scaleY = 1;
      if (blinkStart) {
        const progress = Math.min((now - blinkStart) / blinkDuration, 1);
        scaleY = 0.08 + 0.92 * Math.abs(Math.cos(progress * Math.PI));

        if (progress === 1) {
          blinkStart = 0;
          nextBlinkAt = now + randomBetween(4000, 7000);
          scaleY = 1;
        }
      }

      eyeVisual.setAttribute(
        "transform",
        `translate(0 ${EYE_CENTER.y * (1 - scaleY)}) scale(1 ${scaleY})`,
      );
    }

    function animate(now) {
      const delta = Math.min((now - previousFrameTime) / 16.67, 4);
      previousFrameTime = now;

      updateIdleTarget(now);

      const easing = 1 - Math.pow(0.88, delta);
      current.x += (target.x - current.x) * easing;
      current.y += (target.y - current.y) * easing;
      gaze.setAttribute("transform", `translate(${current.x.toFixed(2)} ${current.y.toFixed(2)})`);

      updateBlink(now);
      requestAnimationFrame(animate);
    }

    window.addEventListener("pointermove", updatePointerTarget, { passive: true });
    requestAnimationFrame(animate);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeEye, { once: true });
  } else {
    initializeEye();
  }
})();
