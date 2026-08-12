/* ===========================================================
   Contact section — a particle cloud that morphs between four
   forms (sphere → torus → cube shell → helix) on a slow cycle.
   Same visual family as the hero constellation, but resolving
   into shapes instead of drifting.
   =========================================================== */

import * as THREE from 'three';

const canvas = document.getElementById('contact-canvas');
if (canvas) init(canvas);

function init(canvas) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow  = window.innerWidth < 760;
  const COUNT   = narrow ? 1800 : 4200;
  const HOLD    = 2.6;   // seconds resting in a shape
  const MORPH   = 2.2;   // seconds spent travelling between shapes

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    canvas.style.display = 'none';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
  camera.position.set(0, 0, 15);

  const group = new THREE.Group();
  scene.add(group);

  /* ---------- shape targets ---------- */
  const R = 4.4;

  function sphere(i, n, out) {
    // fibonacci sphere — even coverage, no polar clumping
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * 2.399963229728653;
    out[0] = Math.cos(th) * r * R;
    out[1] = y * R;
    out[2] = Math.sin(th) * r * R;
  }

  function torus(i, n, out) {
    const u = (i / n) * Math.PI * 2 * 7;      // wind around several times
    const v = (i * 2.399963229728653) % (Math.PI * 2);
    const ring = R * .78, tube = R * .3;
    out[0] = (ring + tube * Math.cos(v)) * Math.cos(u);
    out[1] = tube * Math.sin(v);
    out[2] = (ring + tube * Math.cos(v)) * Math.sin(u);
  }

  function cube(i, n, out) {
    // scatter over the six faces of a shell
    const face = i % 6;
    const a = (rand(i * 3.1) - .5) * 2 * R * .82;
    const b = (rand(i * 7.7) - .5) * 2 * R * .82;
    const s = R * .82;
    if (face === 0) { out[0] =  s; out[1] = a; out[2] = b; }
    if (face === 1) { out[0] = -s; out[1] = a; out[2] = b; }
    if (face === 2) { out[0] = a; out[1] =  s; out[2] = b; }
    if (face === 3) { out[0] = a; out[1] = -s; out[2] = b; }
    if (face === 4) { out[0] = a; out[1] = b; out[2] =  s; }
    if (face === 5) { out[0] = a; out[1] = b; out[2] = -s; }
  }

  function helix(i, n, out) {
    const t = i / n;
    const strand = i % 2 === 0 ? 0 : Math.PI;      // two intertwined ribbons
    const u = t * Math.PI * 2 * 3;
    const rr = R * .55;
    out[0] = Math.cos(u + strand) * rr;
    out[1] = (t - .5) * R * 2.6;
    out[2] = Math.sin(u + strand) * rr;
  }

  // cheap deterministic hash, so the cube looks the same every cycle
  function rand(x) {
    const s = Math.sin(x * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  const SHAPES = [sphere, torus, cube, helix];
  const targets = SHAPES.map(fn => {
    const arr = new Float32Array(COUNT * 3);
    const tmp = [0, 0, 0];
    for (let i = 0; i < COUNT; i++) {
      fn(i, COUNT, tmp);
      arr[i * 3] = tmp[0]; arr[i * 3 + 1] = tmp[1]; arr[i * 3 + 2] = tmp[2];
    }
    return arr;
  });

  /* ---------- geometry ---------- */
  const pos = new Float32Array(COUNT * 3);
  pos.set(targets[0]);
  const col = new Float32Array(COUNT * 3);
  const jitter = new Float32Array(COUNT);

  const cA = new THREE.Color(0x7C9AFF);
  const cB = new THREE.Color(0xA78BFA);
  const mix = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    mix.copy(cA).lerp(cB, rand(i * 1.7));
    col[i * 3] = mix.r; col[i * 3 + 1] = mix.g; col[i * 3 + 2] = mix.b;
    jitter[i] = rand(i * 5.3);
  }

  function dotTexture() {
    const s = 64, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(.25, 'rgba(255,255,255,.75)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const cloud = new THREE.Points(geo, new THREE.PointsMaterial({
    map: dotTexture(), size: .12, sizeAttenuation: true,
    vertexColors: true, transparent: true, opacity: .95,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  cloud.frustumCulled = false;
  group.add(cloud);

  /* ---------- morph state ---------- */
  let from = 0, to = 1, clock = 0;

  function updateMorph(dt, time) {
    clock += dt;
    const cycle = HOLD + MORPH;
    if (clock >= cycle) { clock -= cycle; from = to; to = (to + 1) % SHAPES.length; }

    const raw = Math.min(1, Math.max(0, (clock - HOLD) / MORPH));
    const t = raw * raw * (3 - 2 * raw);     // smoothstep

    const A = targets[from], B = targets[to];
    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3;
      // stagger each particle slightly so the form flows rather than snaps
      const k = Math.min(1, Math.max(0, (t - jitter[i] * .25) / .75));
      const e = k * k * (3 - 2 * k);
      const breathe = Math.sin(time * .8 + jitter[i] * 6.28) * .06;
      pos[ix]     = A[ix]     + (B[ix]     - A[ix])     * e;
      pos[ix + 1] = A[ix + 1] + (B[ix + 1] - A[ix + 1]) * e + breathe;
      pos[ix + 2] = A[ix + 2] + (B[ix + 2] - A[ix + 2]) * e;
    }
    geo.attributes.position.needsUpdate = true;
  }

  /* ---------- sizing ---------- */
  let lastW = 0, lastH = 0, raf = 0;

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 1 ? 20 : 15;
    camera.updateProjectionMatrix();
    if (!raf) renderer.render(scene, camera);
  }

  /* ---------- loop ---------- */
  let last = performance.now(), onScreen = false;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, .05);
    last = now;

    updateMorph(dt, now / 1000);
    group.rotation.y = now / 14000;
    group.rotation.x = Math.sin(now / 19000) * .22;

    renderer.render(scene, camera);
  }

  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop()  { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize, { passive: true });
  resize();

  // paint once regardless, so the section is never an empty rectangle
  renderer.render(scene, camera);
  if (reduced) return;

  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    onScreen && !document.hidden ? start() : stop();
  }, { threshold: 0 }).observe(canvas.parentElement);

  document.addEventListener('visibilitychange', () => {
    document.hidden || !onScreen ? stop() : start();
  });
}
