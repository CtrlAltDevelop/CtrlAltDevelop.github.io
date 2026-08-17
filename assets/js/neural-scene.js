/* ===========================================================
   Research section backdrop — a slowly rotating feed-forward
   network with signal pulses travelling along its edges, read
   through the same falling code glyphs the rest of the page
   uses. A nod to the brain-signal classification work.
   =========================================================== */

import * as THREE from 'three';
import { GRID, glyphAtlas, GLYPH_PICK, GLYPH_READ } from './glyph.js';

const canvas = document.getElementById('neural-canvas');
if (canvas) init(canvas);

function init(canvas) {
  const LAYERS  = [4, 7, 7, 3];
  const GAP_X   = 3.1;
  const GAP_Y   = 1.5;
  const PULSES  = 34;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    canvas.style.display = 'none';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
  camera.position.set(0, 0, 14);

  const net = new THREE.Group();
  net.rotation.set(.16, -.5, 0);
  scene.add(net);

  /* ---------- nodes ---------- */
  const nodes = [];
  const layerOffset = (LAYERS.length - 1) / 2;

  LAYERS.forEach((n, li) => {
    const layer = [];
    for (let i = 0; i < n; i++) {
      layer.push(new THREE.Vector3(
        (li - layerOffset) * GAP_X,
        (i - (n - 1) / 2) * GAP_Y,
        (Math.random() - .5) * 1.5
      ));
    }
    nodes.push(layer);
  });

  const flat = nodes.flat();
  const nodeGeo = new THREE.IcosahedronGeometry(.11, 1);
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: .95 });
  const nodeMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, flat.length);
  const mtx = new THREE.Matrix4();
  flat.forEach((p, i) => nodeMesh.setMatrixAt(i, mtx.makeTranslation(p.x, p.y, p.z)));
  net.add(nodeMesh);

  // soft halo around each node
  const haloGeo = new THREE.BufferGeometry().setFromPoints(flat);
  net.add(new THREE.Points(haloGeo, new THREE.PointsMaterial({
    color: 0xc4b5fd, size: .5, transparent: true, opacity: .28,
    sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending
  })));

  /* ---------- edges ---------- */
  const edges = [];
  for (let li = 0; li < nodes.length - 1; li++) {
    for (const a of nodes[li]) {
      for (const b of nodes[li + 1]) edges.push([a, b]);
    }
  }

  const edgePts = [];
  for (const [a, b] of edges) edgePts.push(a, b);
  const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
  net.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
    color: 0x6d7cff, transparent: true, opacity: .12
  })));

  /* ---------- travelling pulses ---------- */
  const pulsePos = new Float32Array(PULSES * 3);
  const pulses = [];
  for (let i = 0; i < PULSES; i++) {
    pulses.push({
      e: (Math.random() * edges.length) | 0,
      t: Math.random(),
      v: .22 + Math.random() * .38
    });
  }
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
  net.add(new THREE.Points(pulseGeo, new THREE.PointsMaterial({
    color: 0x00e08a, size: .17, transparent: true, opacity: .95,
    sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending
  })));

  /* ---------- glyph drift behind the net ---------- */
  // Same alphabet and cadence as the hero, just quieter and further back, so
  // the section reads as part of the same page rather than a separate toy.
  // The canvas is masked to a soft ellipse in the middle, so the field has to
  // stay inside that core or it simply never shows.
  const G_COLS = 16, G_PER = 8, G_SPAN = 20;
  const gCount = G_COLS * G_PER;
  const gPos   = new Float32Array(gCount * 3);
  const gSeed  = new Float32Array(gCount);
  const gTrail = new Float32Array(gCount);
  const gSpeed = new Float32Array(gCount);

  for (let c = 0, i = 0; c < G_COLS; c++) {
    const x = (c / (G_COLS - 1) - .5) * 13 + (Math.random() - .5) * .8;
    const z = -3 - Math.random() * 7;
    const speed = .7 + Math.random() * 1.1;
    const top = (Math.random() - .5) * G_SPAN;
    for (let k = 0; k < G_PER; k++, i++) {
      gPos[i * 3] = x; gPos[i * 3 + 1] = top + k * .8; gPos[i * 3 + 2] = z;
      gSeed[i] = Math.random() * 100;
      gTrail[i] = k / (G_PER - 1);
      gSpeed[i] = speed;
    }
  }

  const glyphGeo = new THREE.BufferGeometry();
  glyphGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  glyphGeo.setAttribute('aSeed',    new THREE.BufferAttribute(gSeed, 1));
  glyphGeo.setAttribute('aTrail',   new THREE.BufferAttribute(gTrail, 1));
  glyphGeo.setAttribute('aSpeed',   new THREE.BufferAttribute(gSpeed, 1));

  const glyphMat = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: glyphAtlas() },
      uTime:  { value: 0 },
      uGrid:  { value: GRID },
      uSpan:  { value: G_SPAN },
      uSize:  { value: 1.35 },
      uPix:   { value: Math.min(window.devicePixelRatio || 1, 2) },
      uCold:  { value: new THREE.Color(0x5C7CE0) },
      uHot:   { value: new THREE.Color(0xC9D6FF) },
    },
    vertexShader: GLYPH_PICK + /* glsl */`
      uniform float uTime, uGrid, uSpan, uSize, uPix;
      attribute float aSeed, aTrail, aSpeed;
      varying float vAlpha, vHead;
      varying vec2  vCell;

      void main() {
        float h = uSpan * .5;
        float y = mod(position.y - uTime * aSpeed + h, uSpan) - h;
        vec4 mv = modelViewMatrix * vec4(position.x, y, position.z, 1.);
        gl_Position = projectionMatrix * mv;

        vHead  = pow(1. - aTrail, 2.2);
        // The canvas is transparent and sits at 65% opacity behind a soft mask,
        // so the field needs real alpha here to survive all three.
        vAlpha = (.4 + .9 * vHead) * smoothstep(0., .2, 1. - abs(y) / h);
        gl_PointSize = uSize * uPix * (300. / -mv.z);
        vCell = glyphCell(aSeed, 1. + vHead * 3., uTime, uGrid);
      }
    `,
    fragmentShader: GLYPH_READ + /* glsl */`
      uniform sampler2D uAtlas;
      uniform float uGrid;
      uniform vec3 uCold, uHot;
      varying float vAlpha, vHead;
      varying vec2  vCell;

      void main() {
        float a = glyphAlpha(uAtlas, vCell, gl_PointCoord, uGrid);
        if (a < .02) discard;
        gl_FragColor = vec4(mix(uCold, uHot, pow(vHead, 3.)), a * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const glyphs = new THREE.Points(glyphGeo, glyphMat);
  glyphs.frustumCulled = false;
  scene.add(glyphs);

  function stepPulses(dt) {
    for (let i = 0; i < PULSES; i++) {
      const p = pulses[i];
      p.t += p.v * dt;
      if (p.t > 1) { p.t = 0; p.e = (Math.random() * edges.length) | 0; }
      const [a, b] = edges[p.e];
      pulsePos[i * 3]     = a.x + (b.x - a.x) * p.t;
      pulsePos[i * 3 + 1] = a.y + (b.y - a.y) * p.t;
      pulsePos[i * 3 + 2] = a.z + (b.z - a.z) * p.t;
    }
    pulseGeo.attributes.position.needsUpdate = true;
  }

  /* ---------- sizing ---------- */
  let lastW = 0, lastH = 0;

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 1 ? 19 : 14;
    camera.updateProjectionMatrix();
    if (!raf) renderer.render(scene, camera);
  }

  /* ---------- loop, gated on visibility ---------- */
  let raf = 0, last = performance.now(), onScreen = false;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, .05);
    last = now;

    stepPulses(dt);
    glyphMat.uniforms.uTime.value = now / 1000;
    net.rotation.y = -.5 + Math.sin(now / 9000) * .34;
    net.rotation.x = .16 + Math.cos(now / 13000) * .1;

    renderer.render(scene, camera);
  }

  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop()  { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  // Size off the canvas box rather than the window — the element is laid
  // out after this module runs, and no window resize would ever follow.
  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener('resize', resize, { passive: true });
  }

  // Always paint one frame up front. Otherwise the canvas stays blank
  // whenever the loop can't start yet — page opened in a background tab,
  // or the section still off-screen — and the section looks broken.
  stepPulses(0);
  resize();
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
