(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIEWBOX_SIZE = 120;
  const VIEWBOX_CENTER = VIEWBOX_SIZE / 2;
  const WANDER_SIZE = 84;
  const TRANSITION_MS = 600;
  const APPROACH_AFTER_MS = 6000;
  const APPROACH_STOP_PX = 140;
  const FLINCH_TRIGGER_DISTANCE_PX = 180;
  const FLINCH_TRIGGER_SPEED_PX_S = 900;
  const FLINCH_DURATION_MS = 350;
  const FLINCH_COOLDOWN_MS = 3000;
  const PUPIL_TRAVEL = 12;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(value, maximum));
  }

  function randomBetween(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function easeInOutCubic(progress) {
    if (progress < 0.5) {
      return 4 * progress * progress * progress;
    }

    return 1 - Math.pow(-2 * progress + 2, 3) / 2;
  }

  function easeOutCubic(progress) {
    return 1 - Math.pow(1 - progress, 3);
  }

  function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tagName);

    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });

    return element;
  }

  function buildWatcherSvg() {
    const svg = createSvgElement("svg", {
      viewBox: `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`,
      width: VIEWBOX_SIZE,
      height: VIEWBOX_SIZE,
      focusable: "false",
      "aria-hidden": "true"
    });
    const defs = createSvgElement("defs");
    const ringGradient = createSvgElement("linearGradient", {
      id: "watcher-ring-gradient",
      x1: "0",
      y1: "0",
      x2: "0",
      y2: "1"
    });
    const pupilGradient = createSvgElement("radialGradient", {
      id: "watcher-pupil-gradient",
      cx: "38%",
      cy: "32%",
      r: "68%"
    });
    const haloFilter = createSvgElement("filter", {
      id: "watcher-pupil-halo",
      x: "-100%",
      y: "-100%",
      width: "300%",
      height: "300%"
    });
    const blur = createSvgElement("feGaussianBlur", {
      stdDeviation: "2.4"
    });

    [
      ["0%", "#e8c84a"],
      ["52%", "#cca101"],
      ["100%", "#7a6512"]
    ].forEach(([offset, color]) => {
      ringGradient.append(createSvgElement("stop", {
        offset,
        "stop-color": color
      }));
    });

    [
      ["0%", "#ffe9a8"],
      ["100%", "#cca101"]
    ].forEach(([offset, color]) => {
      pupilGradient.append(createSvgElement("stop", {
        offset,
        "stop-color": color
      }));
    });

    haloFilter.append(blur);
    defs.append(ringGradient, pupilGradient, haloFilter);

    const aperture = createSvgElement("g");
    const ringDefinitions = [
      { radius: 48, strokeWidth: 5, rotation: -8 },
      { radius: 34, strokeWidth: 7, rotation: 13 },
      { radius: 20, strokeWidth: 3.5, rotation: -19 }
    ];
    const rings = ringDefinitions.map(({ radius, strokeWidth, rotation }) => {
      const group = createSvgElement("g");
      const ring = createSvgElement("circle", {
        cx: VIEWBOX_CENTER,
        cy: VIEWBOX_CENTER,
        r: radius,
        fill: "none",
        stroke: "url(#watcher-ring-gradient)",
        "stroke-width": strokeWidth,
        "stroke-linecap": "round"
      });

      group.dataset.baseRotation = String(rotation * Math.PI / 180);
      group.append(ring);
      aperture.append(group);
      return group;
    });

    const pupil = createSvgElement("g");
    const halo = createSvgElement("circle", {
      cx: VIEWBOX_CENTER,
      cy: VIEWBOX_CENTER,
      r: 9.5,
      fill: "#cca101",
      opacity: "0.38",
      filter: "url(#watcher-pupil-halo)"
    });
    const orb = createSvgElement("circle", {
      cx: VIEWBOX_CENTER,
      cy: VIEWBOX_CENTER,
      r: 7,
      fill: "url(#watcher-pupil-gradient)"
    });

    pupil.append(halo, orb);
    svg.append(defs, aperture, pupil);

    [svg, aperture, pupil, ...rings].forEach((element) => {
      element.style.transformBox = "fill-box";
      element.style.transformOrigin = "center";
      element.style.willChange = "transform";
    });

    return { svg, aperture, rings, pupil };
  }

  function initializeWatcher() {
    const mount = document.getElementById("watcher");
    const hero = document.getElementById("hero");

    if (!mount || !hero) {
      return;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointerQuery = window.matchMedia("(any-pointer: fine)");
    const scene = buildWatcherSvg();
    const pose = {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.36,
      size: clamp(window.innerWidth * 0.3, 230, 380)
    };
    const pupilCurrent = { x: 0, y: 0 };
    const pupilTarget = { x: 0, y: 0 };
    const pointer = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      previousX: window.innerWidth / 2,
      previousY: window.innerHeight / 2,
      previousTime: 0,
      lastMoveTime: performance.now()
    };
    const wander = {
      targetX: pose.x,
      targetY: pose.y,
      velocityX: 0,
      velocityY: 0,
      legStartTime: 0,
      legEndTime: 0,
      perpendicularX: 0,
      perpendicularY: 0,
      curveAmount: 0
    };
    const transition = {
      active: false,
      startTime: 0,
      fromX: pose.x,
      fromY: pose.y,
      fromSize: pose.size,
      destination: "HERO"
    };
    const flinch = {
      startTime: 0,
      startX: 0,
      startY: 0,
      targetX: 0,
      targetY: 0,
      cooldownUntil: 0
    };
    let state = "HERO";
    let previousFrameTime = performance.now();
    let nextBlinkTime = previousFrameTime + randomBetween(5000, 9000);
    let blinkStartTime = 0;
    let animationFrameId = 0;

    mount.replaceChildren(scene.svg);

    function heroSize() {
      return clamp(window.innerWidth * 0.3, 230, 380);
    }

    function heroPosition(now) {
      return {
        x: window.innerWidth / 2,
        y: window.innerHeight * 0.36 + Math.sin(now / 1550) * 6
      };
    }

    function isHeroRegion() {
      return window.scrollY < hero.offsetHeight * 0.5;
    }

    function movementMargins() {
      return {
        x: window.innerWidth * 0.1 + WANDER_SIZE / 2,
        y: window.innerHeight * 0.1 + WANDER_SIZE / 2
      };
    }

    function keepInViewport(x, y) {
      const margins = movementMargins();
      const maximumX = Math.max(margins.x, window.innerWidth - margins.x);
      const maximumY = Math.max(margins.y, window.innerHeight - margins.y);

      return {
        x: clamp(x, margins.x, maximumX),
        y: clamp(y, margins.y, maximumY)
      };
    }

    function chooseWaypoint(now) {
      const margins = movementMargins();
      const maximumX = Math.max(margins.x, window.innerWidth - margins.x);
      const maximumY = Math.max(margins.y, window.innerHeight - margins.y);
      const targetX = randomBetween(margins.x, maximumX);
      const targetY = randomBetween(margins.y, maximumY);
      const dx = targetX - pose.x;
      const dy = targetY - pose.y;
      const distance = Math.hypot(dx, dy) || 1;

      wander.targetX = targetX;
      wander.targetY = targetY;
      wander.legStartTime = now;
      wander.legEndTime = now + randomBetween(4000, 8000);
      wander.perpendicularX = -dy / distance;
      wander.perpendicularY = dx / distance;
      wander.curveAmount = Math.min(distance * 0.18, 42) * (Math.random() < 0.5 ? -1 : 1);
    }

    function beginTransition(destination, now) {
      transition.active = true;
      transition.startTime = now;
      transition.fromX = pose.x;
      transition.fromY = pose.y;
      transition.fromSize = pose.size;
      transition.destination = destination;
      state = destination;
      mount.dataset.state = destination.toLowerCase();

      if (destination === "WANDER") {
        chooseWaypoint(now);
      } else {
        wander.velocityX = 0;
        wander.velocityY = 0;
      }
    }

    function updateTransition(now) {
      const progress = clamp((now - transition.startTime) / TRANSITION_MS, 0, 1);
      const eased = easeInOutCubic(progress);
      const destinationPosition = transition.destination === "HERO"
        ? heroPosition(now)
        : { x: wander.targetX, y: wander.targetY };
      const destinationSize = transition.destination === "HERO" ? heroSize() : WANDER_SIZE;

      pose.x = transition.fromX + (destinationPosition.x - transition.fromX) * eased;
      pose.y = transition.fromY + (destinationPosition.y - transition.fromY) * eased;
      pose.size = transition.fromSize + (destinationSize - transition.fromSize) * eased;

      if (progress >= 1) {
        transition.active = false;
        pose.size = destinationSize;
        wander.velocityX = 0;
        wander.velocityY = 0;

        if (transition.destination === "WANDER") {
          chooseWaypoint(now);
        }
      }
    }

    function updateHero(now) {
      const destination = heroPosition(now);
      pose.x = destination.x;
      pose.y = destination.y;
      pose.size = heroSize();
    }

    function criticallyDampedStep(targetX, targetY, deltaSeconds, responseSeconds = 1.35) {
      const omega = 2 / responseSeconds;
      const accelerationX = omega * omega * (targetX - pose.x) - 2 * omega * wander.velocityX;
      const accelerationY = omega * omega * (targetY - pose.y) - 2 * omega * wander.velocityY;

      wander.velocityX += accelerationX * deltaSeconds;
      wander.velocityY += accelerationY * deltaSeconds;
      pose.x += wander.velocityX * deltaSeconds;
      pose.y += wander.velocityY * deltaSeconds;
    }

    function updateWander(now, deltaSeconds) {
      if (!wander.legEndTime || now >= wander.legEndTime) {
        chooseWaypoint(now);
      }

      const legDuration = Math.max(wander.legEndTime - wander.legStartTime, 1);
      const legProgress = clamp((now - wander.legStartTime) / legDuration, 0, 1);
      const curve = Math.sin(Math.PI * legProgress) * wander.curveAmount;
      const targetX = wander.targetX + wander.perpendicularX * curve;
      const targetY = wander.targetY + wander.perpendicularY * curve;

      criticallyDampedStep(targetX, targetY, deltaSeconds);
      pose.size = WANDER_SIZE;
    }

    function updateApproach(deltaSeconds) {
      const dx = pointer.x - pose.x;
      const dy = pointer.y - pose.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= APPROACH_STOP_PX) {
        wander.velocityX *= 0.94;
        wander.velocityY *= 0.94;
        return;
      }

      const travel = distance - APPROACH_STOP_PX;
      const target = keepInViewport(
        pose.x + dx / distance * travel,
        pose.y + dy / distance * travel
      );

      criticallyDampedStep(target.x, target.y, deltaSeconds, 2.3);
      pose.size = WANDER_SIZE;
    }

    function beginFlinch(now) {
      const dx = pose.x - pointer.x;
      const dy = pose.y - pointer.y;
      const distance = Math.hypot(dx, dy) || 1;
      const dartDistance = randomBetween(120, 160);
      const target = keepInViewport(
        pose.x + dx / distance * dartDistance,
        pose.y + dy / distance * dartDistance
      );

      flinch.startTime = now;
      flinch.startX = pose.x;
      flinch.startY = pose.y;
      flinch.targetX = target.x;
      flinch.targetY = target.y;
      flinch.cooldownUntil = now + FLINCH_COOLDOWN_MS;
      state = "FLINCH";
      transition.active = false;
      mount.dataset.state = "flinch";
    }

    function updateFlinch(now) {
      const progress = clamp((now - flinch.startTime) / FLINCH_DURATION_MS, 0, 1);
      const eased = easeOutCubic(progress);

      pose.x = flinch.startX + (flinch.targetX - flinch.startX) * eased;
      pose.y = flinch.startY + (flinch.targetY - flinch.startY) * eased;
      pose.size = WANDER_SIZE;

      if (progress >= 1) {
        state = "WANDER";
        mount.dataset.state = "wander";
        wander.velocityX = 0;
        wander.velocityY = 0;
        chooseWaypoint(now);
      }
    }

    function updateState(now, deltaSeconds) {
      const shouldBeHero = isHeroRegion();

      if (shouldBeHero && state !== "HERO") {
        beginTransition("HERO", now);
      } else if (!shouldBeHero && state === "HERO") {
        beginTransition("WANDER", now);
      }

      if (transition.active) {
        updateTransition(now);
        return;
      }

      if (state === "HERO") {
        updateHero(now);
        return;
      }

      if (state === "FLINCH") {
        updateFlinch(now);
        return;
      }

      if (
        finePointerQuery.matches &&
        state === "WANDER" &&
        now - pointer.lastMoveTime > APPROACH_AFTER_MS
      ) {
        state = "APPROACH";
        mount.dataset.state = "approach";
      }

      if (state === "APPROACH") {
        updateApproach(deltaSeconds);
      } else {
        updateWander(now, deltaSeconds);
      }
    }

    function updatePupil(now, deltaFrames) {
      if (finePointerQuery.matches) {
        const dx = pointer.x - pose.x;
        const dy = pointer.y - pose.y;
        const distance = Math.hypot(dx, dy);
        const strength = Math.min(distance / 220, 1) * PUPIL_TRAVEL;

        pupilTarget.x = distance ? dx / distance * strength : 0;
        pupilTarget.y = distance ? dy / distance * strength : 0;
      } else {
        pupilTarget.x = Math.sin(now / 1700) * (PUPIL_TRAVEL * 0.7);
        pupilTarget.y = Math.sin(now / 2300 + 1.1) * (PUPIL_TRAVEL * 0.55);
      }

      const easing = 1 - Math.pow(0.88, deltaFrames);
      pupilCurrent.x += (pupilTarget.x - pupilCurrent.x) * easing;
      pupilCurrent.y += (pupilTarget.y - pupilCurrent.y) * easing;
      scene.pupil.style.transform =
        `translate3d(${pupilCurrent.x.toFixed(2)}px, ${pupilCurrent.y.toFixed(2)}px, 0)`;
    }

    function updateRings(now) {
      const seconds = now / 1000;
      const rotationSpeeds = [0.012, -0.018, 0.015];

      scene.rings.forEach((ring, index) => {
        const baseRotation = Number(ring.dataset.baseRotation);
        ring.style.transform = `rotate(${baseRotation + seconds * rotationSpeeds[index]}rad)`;
      });

      if (!blinkStartTime && now >= nextBlinkTime) {
        blinkStartTime = now;
      }

      if (blinkStartTime) {
        const progress = clamp((now - blinkStartTime) / 260, 0, 1);
        const scale = 1 - Math.sin(Math.PI * progress) * 0.14;
        scene.aperture.style.transform = `scale(${scale.toFixed(4)})`;

        if (progress >= 1) {
          blinkStartTime = 0;
          nextBlinkTime = now + randomBetween(5000, 9000);
          scene.aperture.style.transform = "scale(1)";
        }
      }
    }

    function renderPose() {
      const scale = pose.size / VIEWBOX_SIZE;

      scene.svg.style.transform =
        `translate3d(${(pose.x - VIEWBOX_CENTER).toFixed(2)}px, ` +
        `${(pose.y - VIEWBOX_CENTER).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    }

    function animate(now) {
      const elapsedMs = Math.min(now - previousFrameTime, 50);
      const deltaSeconds = elapsedMs / 1000;
      const deltaFrames = elapsedMs / 16.67;
      previousFrameTime = now;

      updateState(now, deltaSeconds);
      updatePupil(now, deltaFrames);
      updateRings(now);
      renderPose();
      animationFrameId = requestAnimationFrame(animate);
    }

    function updatePointer(event) {
      if (
        !finePointerQuery.matches ||
        (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen")
      ) {
        return;
      }

      const now = performance.now();
      const elapsedSeconds = pointer.previousTime
        ? Math.max((now - pointer.previousTime) / 1000, 0.001)
        : 0;
      const velocityX = elapsedSeconds ? (event.clientX - pointer.previousX) / elapsedSeconds : 0;
      const velocityY = elapsedSeconds ? (event.clientY - pointer.previousY) / elapsedSeconds : 0;

      pointer.x = event.clientX;
      pointer.y = event.clientY;

      const towardX = pose.x - pointer.x;
      const towardY = pose.y - pointer.y;
      const distance = Math.hypot(towardX, towardY);
      const speedTowardEye = distance
        ? velocityX * towardX / distance + velocityY * towardY / distance
        : 0;
      const canFlinch =
        state !== "HERO" &&
        !transition.active &&
        state !== "FLINCH" &&
        now >= flinch.cooldownUntil;

      if (
        canFlinch &&
        distance < FLINCH_TRIGGER_DISTANCE_PX &&
        speedTowardEye > FLINCH_TRIGGER_SPEED_PX_S
      ) {
        beginFlinch(now);
      } else if (state === "APPROACH") {
        state = "WANDER";
        mount.dataset.state = "wander";
        wander.velocityX *= 0.35;
        wander.velocityY *= 0.35;
        chooseWaypoint(now);
      }

      pointer.previousX = event.clientX;
      pointer.previousY = event.clientY;
      pointer.previousTime = now;
      pointer.lastMoveTime = now;
    }

    function applyStaticPose() {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
      mount.classList.add("watcher-static");
      mount.dataset.state = "static";
      pupilCurrent.x = 0;
      pupilCurrent.y = 0;
      scene.pupil.style.transform = "translate3d(0, 0, 0)";
      scene.aperture.style.transform = "scale(1)";
      scene.rings.forEach((ring) => {
        ring.style.transform = `rotate(${ring.dataset.baseRotation}rad)`;
      });

      pose.x = window.innerWidth - Math.max(76, window.innerWidth * 0.08);
      pose.y = window.innerHeight - Math.max(76, window.innerHeight * 0.1);
      pose.size = WANDER_SIZE;
      renderPose();
    }

    function handleMotionPreferenceChange() {
      if (reducedMotionQuery.matches) {
        applyStaticPose();
        return;
      }

      mount.classList.remove("watcher-static");
      previousFrameTime = performance.now();
      pointer.lastMoveTime = previousFrameTime;

      if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(animate);
      }
    }

    function handleResize() {
      if (reducedMotionQuery.matches) {
        applyStaticPose();
        return;
      }

      if (state !== "HERO" && !transition.active) {
        const contained = keepInViewport(pose.x, pose.y);
        pose.x = contained.x;
        pose.y = contained.y;
        chooseWaypoint(performance.now());
      }
    }

    window.addEventListener("pointermove", updatePointer, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });
    reducedMotionQuery.addEventListener("change", handleMotionPreferenceChange);
    mount.dataset.state = "hero";

    if (reducedMotionQuery.matches) {
      applyStaticPose();
    } else {
      animationFrameId = requestAnimationFrame(animate);
    }
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
    initializeWatcher();
    initializeNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
