/* ─────────────────────────────────────────────────────────────────────────────
   name-scene.js — the hero name as a field of particles.

   The <h1> stays real text: it is what search engines, screen readers and
   copy-paste see. This file draws the same words, in the same font, at the same
   place, into a 2D canvas, samples the glyph pixels, and hands each sample to
   Three.js as a particle with a home position. Moving the pointer through the
   name pushes particles away — harder the faster it moves — and springs pull
   them back until the name is whole again.

   Only once the first WebGL frame is on screen is the text made transparent,
   so any failure (no WebGL, blocked CDN, reduced motion) leaves the h1 as it was.
   The render loop runs only while something is moving, and never offscreen.
   ───────────────────────────────────────────────────────────────────────────── */
import * as THREE from 'three';

const title = document.querySelector('.hero__name');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (title && !reduced && supportsWebGL()) {
  // Glyph sampling has to wait for the webfont, or it samples the fallback face.
  document.fonts.ready.then(() => boot(title)).catch(() => {});
}

function supportsWebGL() {
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch (_) {
    return false;
  }
}

// The h1's CSS gradient: linear-gradient(150deg, #FFF 12%, #B9C6D4 62%, #6D7C8C 100%).
const STOPS = [[0.12, '#FFFFFF'], [0.62, '#B9C6D4'], [1, '#6D7C8C']];
const ANGLE = 150 * Math.PI / 180;
const HEAT = new THREE.Color('#7C9AFF');   // --accent: a scattered particle glows toward it

// Physics, per frame at 60 fps. Stiffness varies per particle so the name
// re-forms as a ripple rather than all at once.
const SPRING = 0.05;
const DAMPING = 0.86;

function boot(h1) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
  } catch (_) {
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const canvas = renderer.domElement;
  canvas.className = 'hero__name-gl';
  canvas.setAttribute('aria-hidden', 'true');
  h1.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);   // y grows downward, like the DOM

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSize: { value: 4 },
      uHeat: { value: HEAT }
    },
    vertexShader: `
      uniform float uSize;
      attribute vec3 color;
      attribute float heat;
      varying vec3 vColor;
      varying float vHeat;
      void main() {
        vColor = color;
        vHeat = heat;
        gl_PointSize = uSize * (1.0 + heat * 0.35);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uHeat;
      varying vec3 vColor;
      varying float vHeat;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(mix(vColor, uHeat, vHeat), 1.0 - smoothstep(0.32, 0.5, d));
      }`
  });

  let points = null;
  let home, pos, vel, stiff, heat;
  let count = 0;
  let width = 0, height = 0, radius = 0;

  const pointer = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, moved: false };
  let running = false, visible = true, shown = false;

  /* ---------- layout: sample the glyphs where the browser put them ---------- */

  function build() {
    const box = h1.getBoundingClientRect();
    const style = getComputedStyle(h1);
    const fontSize = parseFloat(style.fontSize);
    if (!box.width || !fontSize) return;

    // Room around the name for particles to scatter into, clamped to the
    // viewport horizontally so the canvas never causes a sideways scroll.
    const margin = Math.round(fontSize * 0.9);
    const viewW = document.documentElement.clientWidth;
    const left = Math.max(-margin, -box.left);
    const right = Math.min(box.width + margin, viewW - box.left);
    const top = -margin;
    width = Math.round(right - left);
    height = Math.round(box.height + margin * 2);

    canvas.style.left = left + 'px';
    canvas.style.top = top + 'px';
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    renderer.setSize(width, height, false);
    camera.right = width;
    camera.bottom = height;
    camera.updateProjectionMatrix();

    // Draw each word at its own client rect, so wrapping, letter-spacing and
    // alignment match the h1 exactly on every screen size.
    const sample = document.createElement('canvas');
    sample.width = width;
    sample.height = height;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = style.letterSpacing;
    ctx.textBaseline = 'alphabetic';

    // The gradient spans the h1 box, as background-clip: text does.
    const dx = Math.sin(ANGLE), dy = -Math.cos(ANGLE);
    const len = Math.abs(box.width * dx) + Math.abs(box.height * dy);
    const cx = -left + box.width / 2, cy = -top + box.height / 2;
    const grad = ctx.createLinearGradient(cx - dx * len / 2, cy - dy * len / 2, cx + dx * len / 2, cy + dy * len / 2);
    STOPS.forEach(([at, c]) => grad.addColorStop(at, c));
    ctx.fillStyle = grad;

    const text = [...h1.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (!text) return;
    const range = document.createRange();
    const words = /\S+/g;
    let match;
    while ((match = words.exec(text.textContent))) {
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      const r = range.getClientRects()[0];
      if (!r) continue;
      // A text range's rect is the font's content area, so its top plus the
      // font ascent is the baseline.
      const ascent = ctx.measureText(match[0]).fontBoundingBoxAscent ?? fontSize * 0.92;
      ctx.fillText(match[0], r.left - box.left - left, r.top - box.top - top + ascent);
    }

    // One particle per `gap` pixels of glyph: roughly 2–3k on a desktop
    // headline, fewer on a phone, and dense enough to read as solid type.
    const gap = Math.max(2, Math.min(3, Math.round(fontSize / 36)));
    const data = ctx.getImageData(0, 0, width, height).data;
    const homes = [], colors = [];
    for (let y = 0; y < height; y += gap) {
      for (let x = 0; x < width; x += gap) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 140) continue;
        homes.push(x, y, 0);
        colors.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      }
    }

    const first = !points;
    const prevHome = home, prevPos = pos, prevCount = count;
    count = homes.length / 3;
    home = new Float32Array(homes);
    pos = new Float32Array(home.length);
    vel = new Float32Array(home.length);
    stiff = new Float32Array(count);
    heat = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      stiff[i] = SPRING * (0.55 + Math.random() * 0.9);
      const j = i * 3;
      if (first) {
        // The name assembles itself on load, drifting in from a loose cloud.
        const a = Math.random() * Math.PI * 2;
        const d = (0.25 + Math.random() * 0.75) * fontSize * 2.2;
        pos[j] = home[j] + Math.cos(a) * d;
        pos[j + 1] = home[j + 1] + Math.sin(a) * d * 0.6;
      } else if (prevCount) {
        // On resize, fly from wherever a neighbouring particle was.
        const k = Math.floor(i * prevCount / count) * 3;
        pos[j] = prevPos[k] + (home[j] - prevHome[k]);
        pos[j + 1] = prevPos[k + 1] + (home[j + 1] - prevHome[k + 1]);
      }
    }

    if (points) {
      points.geometry.dispose();
      scene.remove(points);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.setAttribute('heat', new THREE.BufferAttribute(heat, 1).setUsage(THREE.DynamicDrawUsage));
    points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);

    material.uniforms.uSize.value = gap * 1.3 * dpr;
    radius = fontSize * 1.15;
    wake();
  }

  /* ---------- simulation ---------- */

  function step() {
    const moved = pointer.moved;
    pointer.moved = false;
    const mvx = pointer.x - pointer.px, mvy = pointer.y - pointer.py;
    const speed = Math.min(Math.hypot(mvx, mvy), 80);
    pointer.px = pointer.x;
    pointer.py = pointer.y;

    const r2 = radius * radius;
    const push = 1.2 + speed * 0.32;
    let energy = 0;

    for (let i = 0; i < count; i++) {
      const j = i * 3;
      let x = pos[j], y = pos[j + 1];

      if (moved && speed > 0.5) {
        const ox = x - pointer.x, oy = y - pointer.y;
        const d2 = ox * ox + oy * oy;
        if (d2 < r2) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / radius) ** 2 * push;
          // Mostly away from the pointer, partly along its path, so the name
          // tears in the direction the hand moved.
          vel[j] += (ox / d) * f + (mvx / (speed || 1)) * f * 0.45;
          vel[j + 1] += (oy / d) * f + (mvy / (speed || 1)) * f * 0.45;
        }
      }

      const k = stiff[i];
      vel[j] = (vel[j] + (home[j] - x) * k) * DAMPING;
      vel[j + 1] = (vel[j + 1] + (home[j + 1] - y) * k) * DAMPING;
      x += vel[j];
      y += vel[j + 1];
      pos[j] = x;
      pos[j + 1] = y;

      const off = Math.abs(home[j] - x) + Math.abs(home[j + 1] - y);
      heat[i] = Math.min(off / radius, 1);
      energy += off + Math.abs(vel[j]) + Math.abs(vel[j + 1]);
    }

    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.heat.needsUpdate = true;
    return moved || energy / Math.max(count, 1) > 0.02;
  }

  function frame() {
    if (!running) return;
    const busy = step();
    renderer.render(scene, camera);

    if (!shown) {
      shown = true;
      h1.classList.add('is-gl');      // hide the DOM text only once particles are drawn
    }

    if (busy && visible && !document.hidden) {
      requestAnimationFrame(frame);
    } else {
      // Settled: snap home so the resting name is pixel-exact, draw once, stop.
      if (!busy) {
        pos.set(home);
        heat.fill(0);
        points.geometry.attributes.position.needsUpdate = true;
        points.geometry.attributes.heat.needsUpdate = true;
        renderer.render(scene, camera);
      }
      running = false;
    }
  }

  function wake() {
    if (running || !points || !visible || document.hidden) return;
    running = true;
    requestAnimationFrame(frame);
  }

  /* ---------- input & lifecycle ---------- */

  window.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const inside = x > -radius && y > -radius && x < r.width + radius && y < r.height + radius;
    if (!inside) {
      pointer.x = pointer.px = -1e4;
      return;
    }
    if (pointer.x < -1e3) { pointer.px = x; pointer.py = y; }   // entering: no jump
    pointer.x = x;
    pointer.y = y;
    pointer.moved = true;
    wake();
  }, { passive: true });

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) wake();
  }).observe(h1);

  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

  let pending = 0;
  const rebuild = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(build);
  };
  new ResizeObserver(rebuild).observe(h1);      // also fires once on observe: the first build
  window.addEventListener('resize', rebuild);   // the viewport clamp depends on position too
}
