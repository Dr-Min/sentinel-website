import * as THREE from "../shared/three.module.min.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const canvas = document.querySelector("#webgl");
const experience = document.querySelector("#experience");
const titleChapter = document.querySelector("#title-chapter");
const closingChapter = document.querySelector("#closing-chapter");
const progressFill = document.querySelector("#progress-fill");
const scrollCue = document.querySelector("#scroll-cue");
const experienceStatus = document.querySelector("#experience-status");

if (!reducedMotion.matches && canvas && experience) {
  startExperience();
}

function startExperience() {
  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (_error) {
    experienceStatus.textContent = "WebGL을 사용할 수 없어 정적 화면을 표시합니다.";
    return;
  }

  if (!renderer.getContext()) {
    renderer.dispose();
    experienceStatus.textContent = "WebGL을 사용할 수 없어 정적 화면을 표시합니다.";
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030507);
  scene.fog = new THREE.FogExp2(0x030507, 0.055);

  const camera = new THREE.PerspectiveCamera(43, 1, 0.04, 40);
  camera.position.set(0, 0, 6);

  const maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(maxPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const world = new THREE.Group();
  scene.add(world);

  const aperture = createAperture();
  world.add(aperture.group);

  const dust = createDust(1500);
  world.add(dust.points);

  const warmLight = new THREE.PointLight(0xffc54f, 42, 11, 1.55);
  warmLight.position.set(1.7, 1.15, 2.4);
  scene.add(warmLight);

  const rimLight = new THREE.PointLight(0x587da2, 12, 10, 1.6);
  rimLight.position.set(-2.3, -1.2, -1.4);
  scene.add(rimLight);

  const ambientLight = new THREE.AmbientLight(0x251f0c, 0.7);
  scene.add(ambientLight);

  const pointer = { x: 0, y: 0 };
  const orbit = { azimuth: 0, polar: 0 };
  let scrollProgress = readScrollProgress();
  let lastTime = performance.now();
  let slowFrameStreak = 0;
  let qualityReduced = false;
  let frameId = 0;
  let visible = !document.hidden;

  document.documentElement.classList.add("is-webgl");
  experience.setAttribute("aria-hidden", "false");
  experienceStatus.textContent = "Sentinel 3D 몰입형 경험이 시작되었습니다.";
  updateScrollUI(scrollProgress);
  renderFrame(lastTime);
  requestAnimationFrame(() => document.documentElement.classList.add("is-ready"));

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerleave", resetPointer, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  function onPointerMove(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  }

  function resetPointer() {
    pointer.x = 0;
    pointer.y = 0;
  }

  function onScroll() {
    scrollProgress = readScrollProgress();
    updateScrollUI(scrollProgress);
  }

  function onResize() {
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  function onVisibilityChange() {
    visible = !document.hidden;
    lastTime = performance.now();

    if (visible && frameId === 0) {
      frameId = requestAnimationFrame(renderFrame);
    }
  }

  function renderFrame(now) {
    frameId = 0;
    if (!visible) return;

    const deltaSeconds = Math.min((now - lastTime) / 1000, 0.05);
    const rawDelta = now - lastTime;
    lastTime = now;

    if (!qualityReduced) {
      slowFrameStreak = rawDelta > 25 ? slowFrameStreak + 1 : 0;
      if (slowFrameStreak >= 60) {
        qualityReduced = true;
        dust.setCount(750);
        renderer.setPixelRatio(1);
        renderer.setSize(window.innerWidth, window.innerHeight, false);
      }
    }

    orbit.azimuth += (pointer.x * 0.35 - orbit.azimuth) * Math.min(deltaSeconds * 2.5, 1);
    orbit.polar += (-pointer.y * 0.2 - orbit.polar) * Math.min(deltaSeconds * 2.5, 1);

    const cameraZ = cameraZAt(scrollProgress);
    const orbitRadius = Math.max(0.42, Math.min(1.15, Math.abs(cameraZ) * 0.22));
    camera.position.x = Math.sin(orbit.azimuth) * orbitRadius;
    camera.position.y = Math.sin(orbit.polar) * orbitRadius;
    camera.position.z = cameraZ;
    camera.lookAt(camera.position.x * 0.12, camera.position.y * 0.12, cameraZ - 4.5);

    aperture.rings[0].rotation.z += deltaSeconds * 0.024;
    aperture.rings[1].rotation.z -= deltaSeconds * 0.038;
    aperture.rings[2].rotation.z += deltaSeconds * 0.05;
    aperture.pupil.position.y = -0.16 + Math.sin(now * 0.00055) * 0.018;
    aperture.group.position.z = Math.sin(now * 0.00022) * 0.025;

    const ringFade = 1 - smoothstep(0.665, 0.735, scrollProgress);
    for (const material of aperture.materials) {
      material.opacity = ringFade;
    }
    aperture.pupilMaterial.opacity = ringFade;

    dust.update(deltaSeconds, now * 0.001);
    dust.points.material.opacity = 0.32 + smoothstep(0.56, 0.84, scrollProgress) * 0.68;
    dust.points.rotation.z = now * 0.000012;

    renderer.render(scene, camera);
    frameId = requestAnimationFrame(renderFrame);
  }
}

function createAperture() {
  const group = new THREE.Group();
  const rings = [];
  const materials = [];
  const ringSettings = [
    { radius: 1, tube: 0.052, tiltX: 0.05, tiltY: -0.08 },
    { radius: 0.72, tube: 0.038, tiltX: -0.09, tiltY: 0.06 },
    { radius: 0.5, tube: 0.026, tiltX: 0.07, tiltY: 0.09 },
  ];

  for (const [index, setting] of ringSettings.entries()) {
    const geometry = new THREE.TorusGeometry(setting.radius, setting.tube, 24, 160);
    const material = new THREE.MeshStandardMaterial({
      color: index === 1 ? 0xe8c84a : 0xcca101,
      emissive: 0x4a3a00,
      emissiveIntensity: 0.62,
      metalness: 0.9,
      roughness: 0.25,
      transparent: true,
      opacity: 1,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = setting.tiltX;
    ring.rotation.y = setting.tiltY;
    ring.position.z = -index * 0.035;
    group.add(ring);
    rings.push(ring);
    materials.push(material);
  }

  const pupilMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd65a,
    emissive: 0xcca101,
    emissiveIntensity: 3.2,
    metalness: 0.6,
    roughness: 0.2,
    transparent: true,
    opacity: 1,
  });
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 24), pupilMaterial);
  pupil.position.set(0.22, -0.16, 0.08);
  group.add(pupil);

  const pupilGlow = new THREE.PointLight(0xffc83d, 4.5, 1.4, 2);
  pupil.add(pupilGlow);

  return { group, rings, materials, pupil, pupilMaterial };
}

function createDust(maxCount) {
  const positions = new Float32Array(maxCount * 3);
  const velocities = new Float32Array(maxCount * 3);
  const phases = new Float32Array(maxCount);
  const bounds = { x: 0, y: 0, z: -4.5, radius: 10.5 };
  let activeCount = maxCount;

  for (let index = 0; index < maxCount; index += 1) {
    seedParticle(index, false);
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setDrawRange(0, activeCount);
  geometry.computeBoundingSphere();

  const sprite = makePointSprite();
  const material = new THREE.PointsMaterial({
    color: 0xe8c84a,
    map: sprite,
    alphaMap: sprite,
    size: 0.052,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  function seedParticle(index, edgeOnly) {
    const vector = randomUnitVector();
    const radius = edgeOnly
      ? bounds.radius * (0.86 + Math.random() * 0.12)
      : bounds.radius * Math.cbrt(Math.random());
    const offset = index * 3;
    positions[offset] = bounds.x + vector.x * radius;
    positions[offset + 1] = bounds.y + vector.y * radius;
    positions[offset + 2] = bounds.z + vector.z * radius;
    velocities[offset] = (Math.random() - 0.5) * 0.055;
    velocities[offset + 1] = 0.018 + Math.random() * 0.045;
    velocities[offset + 2] = (Math.random() - 0.5) * 0.045;
    phases[index] = Math.random() * Math.PI * 2;
  }

  function update(deltaSeconds, elapsed) {
    for (let index = 0; index < activeCount; index += 1) {
      const offset = index * 3;
      const phase = phases[index];
      positions[offset] +=
        (velocities[offset] + Math.sin(elapsed * 0.34 + phase) * 0.012) * deltaSeconds;
      positions[offset + 1] +=
        (velocities[offset + 1] + Math.cos(elapsed * 0.27 + phase) * 0.009) * deltaSeconds;
      positions[offset + 2] +=
        (velocities[offset + 2] + Math.sin(elapsed * 0.22 + phase * 1.7) * 0.01) * deltaSeconds;

      const x = positions[offset] - bounds.x;
      const y = positions[offset + 1] - bounds.y;
      const z = positions[offset + 2] - bounds.z;
      if (x * x + y * y + z * z > bounds.radius * bounds.radius) {
        seedParticle(index, true);
      }
    }
    positionAttribute.needsUpdate = true;
  }

  function setCount(count) {
    activeCount = Math.max(1, Math.min(maxCount, count));
    geometry.setDrawRange(0, activeCount);
  }

  return { points, update, setCount };
}

function makePointSprite() {
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = 64;
  spriteCanvas.height = 64;
  const context = spriteCanvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255, 240, 168, 1)");
  gradient.addColorStop(0.18, "rgba(232, 200, 74, 0.9)");
  gradient.addColorStop(0.58, "rgba(204, 161, 1, 0.2)");
  gradient.addColorStop(1, "rgba(204, 161, 1, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(spriteCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function randomUnitVector() {
  const z = Math.random() * 2 - 1;
  const angle = Math.random() * Math.PI * 2;
  const scale = Math.sqrt(1 - z * z);
  return {
    x: scale * Math.cos(angle),
    y: scale * Math.sin(angle),
    z,
  };
}

function readScrollProgress() {
  const scrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  return clamp(window.scrollY / scrollable, 0, 1);
}

function cameraZAt(progress) {
  if (progress <= 0.33) {
    return lerp(6, 2.2, smoothstep(0, 0.33, progress));
  }
  if (progress <= 0.66) {
    return lerp(2.2, 0.4, smoothstep(0.33, 0.66, progress));
  }
  return lerp(0.4, -6.2, smoothstep(0.66, 1, progress));
}

function updateScrollUI(progress) {
  const titleIn = smoothstep(0.34, 0.43, progress);
  const titleOut = 1 - smoothstep(0.57, 0.67, progress);
  const titleOpacity = titleIn * titleOut;
  const closingOpacity = smoothstep(0.69, 0.83, progress);

  titleChapter.style.opacity = titleOpacity.toFixed(3);
  titleChapter.style.transform = `translate(-50%, ${lerp(-42, -50, titleOpacity).toFixed(2)}%)`;
  titleChapter.style.pointerEvents = titleOpacity > 0.8 ? "auto" : "none";

  closingChapter.style.opacity = closingOpacity.toFixed(3);
  closingChapter.style.transform = `translate(-50%, ${lerp(-42, -50, closingOpacity).toFixed(2)}%)`;
  closingChapter.style.pointerEvents = closingOpacity > 0.8 ? "auto" : "none";

  progressFill.style.transform = `scaleY(${progress.toFixed(4)})`;
  scrollCue.style.opacity = String(1 - smoothstep(0.015, 0.08, progress));
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}
