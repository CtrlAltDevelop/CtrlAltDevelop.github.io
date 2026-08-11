/* ===========================================================
   Research section backdrop — a slowly rotating feed-forward
   network with signal pulses travelling along its edges.
   A nod to the brain-signal classification work.
   =========================================================== */

import * as THREE from 'three';

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
