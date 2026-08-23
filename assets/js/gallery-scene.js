import * as THREE from 'three';

const canvas = document.getElementById('gallery-canvas');

if (!canvas || !supportsWebGL()) {
  document.body.classList.add('no-webgl');
} else {
  boot(canvas);
}

function supportsWebGL() {
  try {
    const probe = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (
      probe.getContext('webgl2') || probe.getContext('webgl')
    ));
  } catch (_) {
    return false;
  }
}

function boot(target) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const accent = 0x7c9aff;
  const ice = 0xe9edf5;
  const slate = 0x646d80;
  const sectionIds = [
    'hero', 'about', 'approach', 'work', 'open-source',
    'experience', 'stack', 'research', 'contact'
  ];
  const spacing = 13;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06070a, 0.023);

  const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 180);
  camera.position.set(0, 0, 16);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: target,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
  } catch (_) {
    document.body.classList.add('no-webgl');
    return;
  }

  renderer.setClearColor(0x06070a, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const world = new THREE.Group();
  scene.add(world);

  const exhibits = [];
  const seeded = mulberry32(20260823);

  addDepthSpine(world, spacing, sectionIds.length, accent, slate);
  addParticleField(world, seeded, ice, accent);
  addFloor(world, ice, accent);

  for (let i = 0; i < sectionIds.length; i++) {
    const side = i === 0 ? 1 : (i % 2 ? -1 : 1);
    const exhibit = createExhibit(i, side, accent, ice, slate, seeded);
    const baseY = (i % 3 - 1) * 0.45;
    exhibit.position.set(side * (i === 0 ? 3.8 : 4.6), baseY, 4 - i * spacing);
    exhibit.userData.baseY = baseY;
    exhibit.rotation.y = side * -0.18;
    world.add(exhibit);
    exhibits.push(exhibit);
  }

  const pointer = new THREE.Vector2();
  const cameraGoal = new THREE.Vector3(0, 0, 16);
  let scrollProgress = 0;
  let activeIndex = -1;
  let raf = 0;
  let lastTime = performance.now();

  function updateScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollProgress = Math.min(1, Math.max(0, window.scrollY / max));
    const readingLine = window.scrollY + window.innerHeight * 0.44;
    let next = 0;
    for (let i = 0; i < sectionIds.length; i++) {
      const section = document.getElementById(sectionIds[i]);
      if (section && section.offsetTop <= readingLine) next = i;
    }
    const currentSection = document.getElementById(sectionIds[next]);
    const local = currentSection
      ? Math.min(1, Math.max(0, (readingLine - currentSection.offsetTop) / currentSection.offsetHeight))
      : 0;
    const scenePosition = Math.min(sectionIds.length - 1, next + local);
    cameraGoal.z = 16 - scenePosition * spacing;
    setActive(next);
    if (reduced) renderStatic();
  }

  function setActive(index) {
    if (index === activeIndex) return;
    activeIndex = index;
    cameraGoal.x = (index % 2 ? 1 : -1) * Math.min(index, 1) * 0.72;
    cameraGoal.y = (index % 3 - 1) * 0.16;
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.fov = width < 760 ? 55 : 47;
    camera.updateProjectionMatrix();
    if (reduced) renderStatic();
  }

  function updatePointer(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  }

  function animate(now) {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(0.04, (now - lastTime) / 1000);
    lastTime = now;
    const ease = 1 - Math.pow(0.001, dt);

    camera.position.x += (cameraGoal.x + pointer.x * 0.38 - camera.position.x) * ease;
    camera.position.y += (cameraGoal.y - pointer.y * 0.24 - camera.position.y) * ease;
    camera.position.z += (cameraGoal.z - camera.position.z) * ease;
    camera.rotation.y += ((-pointer.x * 0.018) - camera.rotation.y) * ease;
    camera.rotation.x += ((pointer.y * 0.012) - camera.rotation.x) * ease;

    const time = now * 0.001;
    for (let i = 0; i < exhibits.length; i++) {
      const exhibit = exhibits[i];
      const near = Math.max(0, 1 - Math.abs((camera.position.z - 12) - exhibit.position.z) / 19);
      exhibit.rotation.y += dt * (0.025 + i * 0.003);
      exhibit.rotation.x = Math.sin(time * 0.22 + i) * 0.035;
      exhibit.userData.floatY = Math.sin(time * 0.34 + i * 1.7) * 0.32;
      exhibit.position.y = exhibit.userData.baseY + exhibit.userData.floatY;
      exhibit.userData.materials.forEach((material) => {
        material.opacity = material.userData.baseOpacity * (0.32 + near * 0.9);
      });
    }

    world.rotation.z = Math.sin(time * 0.08) * 0.006;
    renderer.render(scene, camera);
  }

  function renderStatic() {
    camera.position.copy(cameraGoal);
    renderer.render(scene, camera);
  }

  document.addEventListener('pointermove', updatePointer, { passive: true });
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (reduced) return;
    if (document.hidden && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!document.hidden && !raf) {
      lastTime = performance.now();
      raf = requestAnimationFrame(animate);
    }
  });

  resize();
  updateScroll();
  target.classList.add('is-live');
  if (reduced) renderStatic();
  else raf = requestAnimationFrame(animate);
}

function createExhibit(index, side, accent, ice, slate, random) {
  const group = new THREE.Group();
  group.userData.materials = [];
  group.userData.floatY = 0;

  const frameMaterial = lineMaterial(index === 3 || index === 8 ? accent : ice, 0.34);
  const quietMaterial = lineMaterial(slate, 0.25);
  const accentMaterial = lineMaterial(accent, 0.78);
  group.userData.materials.push(frameMaterial, quietMaterial, accentMaterial);

  const outer = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(6.8, 6.8, 0.34)),
    frameMaterial
  );
  group.add(outer);

  const inner = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(5.4, 5.4, 0.18)),
    quietMaterial
  );
  inner.position.z = 0.8;
  inner.rotation.z = index % 2 ? 0.09 : -0.09;
  group.add(inner);

  const signature = makeSignature(index, accentMaterial, frameMaterial);
  signature.position.z = 1.4;
  signature.scale.setScalar(index === 0 ? 1.16 : 1);
  group.add(signature);
  group.userData.materials.push(...signature.userData.materials);

  const panel = makeDataPanel(side, accentMaterial, quietMaterial);
  panel.position.set(side * -3.7, -2.35, 2.2);
  panel.rotation.y = side * 0.28;
  group.add(panel);

  for (let i = 0; i < 16; i++) {
    const tick = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.13, 0, 0),
        new THREE.Vector3(i % 4 === 0 ? 0.42 : 0.18, 0, 0)
      ]),
      i % 4 === 0 ? accentMaterial : quietMaterial
    );
    tick.position.set(-4.35, 3.25 - i * 0.42, random() * 0.3);
    group.add(tick);
  }

  return group;
}

function makeSignature(index, accentMaterial, iceMaterial) {
  const group = new THREE.Group();
  const geometries = [
    new THREE.TorusKnotGeometry(1.35, 0.28, 90, 10, 2, 3),
    new THREE.IcosahedronGeometry(1.75, 1),
    new THREE.BoxGeometry(2.7, 2.7, 2.7, 2, 2, 2),
    new THREE.OctahedronGeometry(1.95, 1),
    new THREE.TorusKnotGeometry(1.42, 0.34, 96, 12, 3, 2),
    new THREE.DodecahedronGeometry(1.75, 0),
    new THREE.CylinderGeometry(1.4, 1.4, 2.9, 12, 4, true),
    new THREE.SphereGeometry(1.7, 14, 10),
    new THREE.TorusGeometry(1.55, 0.46, 12, 44)
  ];
  const mesh = new THREE.Mesh(
    geometries[index],
    new THREE.MeshBasicMaterial({
      color: index === 3 || index === 8 ? 0x7c9aff : 0xe9edf5,
      wireframe: true,
      transparent: true,
      opacity: index === 3 || index === 8 ? 0.7 : 0.42,
      depthWrite: false
    })
  );
  mesh.material.userData.baseOpacity = mesh.material.opacity;
  group.add(mesh);
  group.userData.materials = [mesh.material];

  const ring = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.TorusGeometry(2.25, 0.025, 4, 64)),
    accentMaterial
  );
  ring.rotation.x = Math.PI * 0.5;
  ring.rotation.y = index * 0.17;
  group.add(ring);

  if (index % 2 === 0) {
    const axis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-2.6, 0, 0),
        new THREE.Vector3(2.6, 0, 0)
      ]),
      iceMaterial
    );
    group.add(axis);
  }
  return group;
}

function makeDataPanel(side, accentMaterial, quietMaterial) {
  const group = new THREE.Group();
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2.7, 1.72, 0.08)),
    quietMaterial
  );
  group.add(edge);
  for (let i = 0; i < 6; i++) {
    const width = 0.55 + ((i * 37) % 100) / 100 * 1.45;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.05, 0, 0.08),
        new THREE.Vector3(-1.05 + width, 0, 0.08)
      ]),
      i === 0 || i === 4 ? accentMaterial : quietMaterial
    );
    line.position.y = 0.58 - i * 0.22;
    line.scale.x = side;
    group.add(line);
  }
  return group;
}

function addDepthSpine(world, spacing, count, accent, slate) {
  const points = [];
  for (let i = 0; i < count; i++) points.push(new THREE.Vector3(0, -3.7, 4 - i * spacing));
  const material = lineMaterial(slate, 0.34);
  world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  for (let i = 0; i < count; i++) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(i === 0 || i === count - 1 ? 0.18 : 0.11, 0),
      new THREE.MeshBasicMaterial({ color: i === count - 1 ? accent : slate })
    );
    marker.position.copy(points[i]);
    world.add(marker);
  }
}

function addParticleField(world, random, ice, accent) {
  const count = 850;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const iceColor = new THREE.Color(ice);
  const accentColor = new THREE.Color(accent);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * 34;
    positions[i * 3 + 1] = (random() - 0.5) * 18;
    positions[i * 3 + 2] = 12 - random() * 126;
    const color = random() > 0.94 ? accentColor : iceColor;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  world.add(new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.035,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    })
  ));
}

function addFloor(world, ice, accent) {
  const grid = new THREE.GridHelper(150, 75, accent, ice);
  grid.position.set(0, -4, -48);
  grid.material.transparent = true;
  grid.material.opacity = 0.055;
  grid.material.depthWrite = false;
  world.add(grid);
}

function lineMaterial(color, opacity) {
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  });
  material.userData.baseOpacity = opacity;
  return material;
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
