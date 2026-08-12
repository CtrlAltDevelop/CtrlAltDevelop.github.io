/* ===========================================================
   Hero scene — a drifting constellation.
   Points wander inside a soft box, thin lines appear between
   any pair that come close, and the cursor gently pushes the
   whole web aside. Abstract on purpose: it should read as
   craft, not as a product screenshot.
   =========================================================== */

import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('hero-canvas');
if (canvas) init(canvas);

function init(canvas) {
  /* ---------- config ---------- */
  const narrow  = window.innerWidth < 760;

  // The box has to match the viewport's shape, or in portrait most of the
  // cloud sits outside the frustum and the hero reads as a few stray dots.
  const BOX      = narrow ? { x: 9, y: 15, z: 9 } : { x: 21, y: 12, z: 11 };
  const LINK_D   = narrow ? 5.6 : 5.0;   // distance at which two points link
  const MAX_SEG  = 2000;                 // preallocated line segments
  const BG       = 0x06070A;

  const COUNT   = narrow ? 62 : 190;
  const PULSES  = narrow ? 14 : 30;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // On phones the canvas is small and the web is sparser, so everything
  // has to be proportionally bigger and brighter to read at all.
  const S = narrow ? 1.7 : 1;

  const C_CORE = new THREE.Color(0xBFD0FF);   // point cores
  const C_LINK = new THREE.Color(0x5C7CE0);   // web lines
  const C_HOT  = new THREE.Color(0x9F7BFF);   // a few accent nodes

  /* ---------- renderer ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    document.body.classList.add('no-webgl');
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(BG, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 200);
  const camBase = new THREE.Vector3(0, 0, 26);
  camera.position.copy(camBase);

  const world = new THREE.Group();
  scene.add(world);

  /* ---------- points ---------- */
  const pos = new Float32Array(COUNT * 3);
  const vel = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const siz = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    pos[i * 3]     = (Math.random() - .5) * 2 * BOX.x;
    pos[i * 3 + 1] = (Math.random() - .5) * 2 * BOX.y;
    pos[i * 3 + 2] = (Math.random() - .5) * 2 * BOX.z;

    const s = .55 + Math.random() * .45;
    vel[i * 3]     = (Math.random() - .5) * .55 * s;
    vel[i * 3 + 1] = (Math.random() - .5) * .40 * s;
    vel[i * 3 + 2] = (Math.random() - .5) * .35 * s;

    // roughly one node in seven carries the violet accent
    const c = Math.random() < .14 ? C_HOT : C_CORE;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    siz[i] = s;
  }

  // soft round sprite, built here so the page stays single-origin
  function dotTexture() {
    const s = 64, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0,   'rgba(255,255,255,1)');
    grd.addColorStop(.22, 'rgba(255,255,255,.8)');
    grd.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // live per-point colour, so nodes can brighten near the cursor
  const litCol = new Float32Array(COUNT * 3);
  litCol.set(col);

  const ptGeo = new THREE.BufferGeometry();
  ptGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ptGeo.setAttribute('color', new THREE.BufferAttribute(litCol, 3));
  const sprite = dotTexture();
  const points = new THREE.Points(ptGeo, new THREE.PointsMaterial({
    map: sprite, size: .38 * S, sizeAttenuation: true,
    vertexColors: true, transparent: true, opacity: .85,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  points.frustumCulled = false;
  world.add(points);

  /* ---------- pulses travelling along links ---------- */
  // Each pulse rides one link for a moment, then hops to another. Gives
  // the web a sense of traffic without implying any particular subject.
  const pulsePos = new Float32Array(PULSES * 3);
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
  const pulseMat = new THREE.PointsMaterial({
    map: sprite, color: 0xDCE6FF, size: .3 * S, sizeAttenuation: true,
    transparent: true, opacity: .95, depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const pulseObj = new THREE.Points(pulseGeo, pulseMat);
  pulseObj.frustumCulled = false;
  world.add(pulseObj);

  const pulses = [];
  for (let i = 0; i < PULSES; i++) {
    pulses.push({ a: 0, b: 0, t: Math.random(), v: .3 + Math.random() * .5, live: false });
  }

  /* ---------- links ---------- */
  const segPos = new Float32Array(MAX_SEG * 6);
  const segCol = new Float32Array(MAX_SEG * 6);
  const segGeo = new THREE.BufferGeometry();
  segGeo.setAttribute('position', new THREE.BufferAttribute(segPos, 3));
  segGeo.setAttribute('color', new THREE.BufferAttribute(segCol, 3));
  const links = new THREE.LineSegments(segGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: narrow ? .8 : .55,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  links.frustumCulled = false;
  world.add(links);

  // index pairs of the links built this frame, so pulses have rails to ride
  const pairA = new Uint16Array(MAX_SEG);
  const pairB = new Uint16Array(MAX_SEG);
  let pairCount = 0;

  /* ---------- distant dust, for depth ---------- */
  const D_COUNT = narrow ? 260 : 520;
  const dust = new Float32Array(D_COUNT * 3);
  for (let i = 0; i < D_COUNT; i++) {
    dust[i * 3]     = (Math.random() - .5) * 90;
    dust[i * 3 + 1] = (Math.random() - .5) * 50;
    dust[i * 3 + 2] = -14 - Math.random() * 45;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({
    map: sprite, color: 0x8FA6D8, size: .16 * S, sizeAttenuation: true,
    transparent: true, opacity: .45, depthWrite: false,
    blending: THREE.AdditiveBlending
  })));

  /* ---------- post-processing ---------- */
  const useBloom = !reduced && !narrow;
  let composer = null, bloom = null;
  if (useBloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .46, .5, .16);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  function render() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  /* ---------- sizing ---------- */
  let lastW = 0, lastH = 0;
  let raf = 0;

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;

    renderer.setSize(w, h, false);
    if (composer) {
      composer.setSize(w, h);
      bloom.setSize(w * dpr * .5, h * dpr * .5);   // blur: half res is free quality
    }
    camera.aspect = w / h;
    camBase.z = w / h < 1 ? 34 : 26;
    camera.updateProjectionMatrix();

    if (!raf) { rebuildLinks(); render(); }
  }

  /* ---------- pointer ---------- */
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    ptr.tx = (e.clientX / window.innerWidth - .5) * 2;
    ptr.ty = (e.clientY / window.innerHeight - .5) * 2;
  }, { passive: true });

  const push = new THREE.Vector3();

  /* ---------- simulation ---------- */
  function step(dt) {
    // where the cursor sits on the z=0 plane, in world units
    const halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * camBase.z;
    const mx = ptr.x * halfH * camera.aspect;
    const my = -ptr.y * halfH;

    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2;

      pos[ix] += vel[ix] * dt;
      pos[iy] += vel[iy] * dt;
      pos[iz] += vel[iz] * dt;

      // turn back at the walls instead of wrapping, so the web never tears
      if (pos[ix] >  BOX.x) { pos[ix] =  BOX.x; vel[ix] *= -1; }
      if (pos[ix] < -BOX.x) { pos[ix] = -BOX.x; vel[ix] *= -1; }
      if (pos[iy] >  BOX.y) { pos[iy] =  BOX.y; vel[iy] *= -1; }
      if (pos[iy] < -BOX.y) { pos[iy] = -BOX.y; vel[iy] *= -1; }
      if (pos[iz] >  BOX.z) { pos[iz] =  BOX.z; vel[iz] *= -1; }
      if (pos[iz] < -BOX.z) { pos[iz] = -BOX.z; vel[iz] *= -1; }

      // gentle cursor repulsion, strongest at the centre of the radius
      push.set(pos[ix] - mx, pos[iy] - my, 0);
      const d2 = push.x * push.x + push.y * push.y;
      if (d2 < 42 && d2 > .0001) {
        const f = (1 - d2 / 42) * 5.5 * dt / Math.sqrt(d2);
        pos[ix] += push.x * f;
        pos[iy] += push.y * f;
      }

      // and a soft pool of light around it, so the web responds visibly
      const glow = d2 < 120 ? (1 - d2 / 120) * 1.5 : 0;
      const k = 1 + glow;
      litCol[ix]     = Math.min(1, col[ix]     * k);
      litCol[iy]     = Math.min(1, col[iy]     * k);
      litCol[iz]     = Math.min(1, col[iz]     * k);
    }
    ptGeo.attributes.position.needsUpdate = true;
    ptGeo.attributes.color.needsUpdate = true;
  }

  function stepPulses(dt) {
    for (let i = 0; i < PULSES; i++) {
      const p = pulses[i];
      // links are rebuilt every frame, so a pulse re-picks a rail when it
      // finishes or when its previous one no longer exists
      if (!p.live || p.t >= 1) {
        if (pairCount === 0) { p.live = false; continue; }
        const e = (Math.random() * pairCount) | 0;
        p.a = pairA[e]; p.b = pairB[e];
        p.t = 0; p.v = .3 + Math.random() * .5; p.live = true;
      }
      p.t += p.v * dt;
      const t = Math.min(1, p.t);
      const a = p.a * 3, b = p.b * 3;
      pulsePos[i * 3]     = pos[a]     + (pos[b]     - pos[a])     * t;
      pulsePos[i * 3 + 1] = pos[a + 1] + (pos[b + 1] - pos[a + 1]) * t;
      pulsePos[i * 3 + 2] = pos[a + 2] + (pos[b + 2] - pos[a + 2]) * t;
    }
    pulseGeo.attributes.position.needsUpdate = true;
  }

  function rebuildLinks() {
    let s = 0;
    for (let i = 0; i < COUNT && s < MAX_SEG; i++) {
      const ax = pos[i * 3], ay = pos[i * 3 + 1], az = pos[i * 3 + 2];
      for (let j = i + 1; j < COUNT && s < MAX_SEG; j++) {
        const dx = ax - pos[j * 3];
        const dy = ay - pos[j * 3 + 1];
        const dz = az - pos[j * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > LINK_D * LINK_D) continue;

        // fade the line out as the pair drifts apart
        const k = 1 - Math.sqrt(d2) / LINK_D;
        const o = k * k;
        const p = s * 6;

        segPos[p]     = ax; segPos[p + 1] = ay; segPos[p + 2] = az;
        segPos[p + 3] = pos[j * 3]; segPos[p + 4] = pos[j * 3 + 1]; segPos[p + 5] = pos[j * 3 + 2];

        const r = C_LINK.r * o, g = C_LINK.g * o, b = C_LINK.b * o;
        segCol[p] = r; segCol[p + 1] = g; segCol[p + 2] = b;
        segCol[p + 3] = r; segCol[p + 4] = g; segCol[p + 5] = b;

        pairA[s] = i; pairB[s] = j;
        s++;
      }
    }
    pairCount = s;
    segGeo.setDrawRange(0, s * 2);
    segGeo.attributes.position.needsUpdate = true;
    segGeo.attributes.color.needsUpdate = true;
  }

  /* ---------- loop ---------- */
  let visible = true;
  let last = performance.now();
  let scrollEased = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, .05);
    last = now;

    step(dt);
    rebuildLinks();
    stepPulses(dt);

    ptr.x += (ptr.tx - ptr.x) * .04;
    ptr.y += (ptr.ty - ptr.y) * .04;

    // dolly through the field as the hero scrolls away
    const sp = Math.min(1, window.scrollY / Math.max(1, canvas.clientHeight));
    scrollEased += (sp - scrollEased) * .08;

    camera.position.x = camBase.x + ptr.x * 2.2;
    camera.position.y = camBase.y - ptr.y * 1.4 + scrollEased * 4;
    camera.position.z = camBase.z - scrollEased * 9;
    camera.lookAt(0, scrollEased * 1.5, 0);

    world.rotation.y = Math.sin(now / 21000) * .12 + ptr.x * .05 + scrollEased * .3;
    world.rotation.x = Math.cos(now / 27000) * .06;

    render();
  }

  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop()  { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  // Size against the canvas box, not the window: the element can be laid
  // out (or relaid out) without a window resize ever firing, and a canvas
  // measured at zero would otherwise stay broken for the page's lifetime.
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize, { passive: true });
  resize();

  if (reduced) {
    rebuildLinks();
    render();
    return;
  }

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible && !document.hidden ? start() : stop();
  }, { threshold: 0 });
  io.observe(canvas.parentElement);

  document.addEventListener('visibilitychange', () => {
    document.hidden || !visible ? stop() : start();
  });

  start();
}
