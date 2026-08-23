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
      exhibit.userData.scanners.forEach((scanner) => {
        scanner.position.y = Math.sin(time * 1.35 + scanner.userData.phase) * 1.16;
      });
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
  group.userData.scanners = [];

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
  group.userData.scanners.push(...signature.userData.scanners);

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
  group.userData.materials = [];
  group.userData.scanners = [];

  const screen = makeCodeScreen(index, accentMaterial, iceMaterial);
  screen.position.set(index % 2 ? 0.38 : -0.38, 0.12, 0.48);
  screen.rotation.y = index % 2 ? -0.09 : 0.09;
  group.add(screen);
  group.userData.materials.push(...screen.userData.materials);
  group.userData.scanners.push(...screen.userData.scanners);

  const props = makeProgrammingProps(index, accentMaterial, iceMaterial);
  props.position.z = 0.05;
  group.add(props);

  return group;
}

const PROGRAM_SCREENS = [
  {
    title: 'main.dart',
    lines: [
      '// Mohammad Zarif · @CtrlAltDevelop',
      'void main() => runApp(const Portfolio());',
      'class Portfolio extends StatelessWidget {',
      '  const Portfolio({super.key});',
      '  Widget build(context) => Gallery3D();',
      '}'
    ]
  },
  {
    title: 'developer.json',
    lines: [
      '{',
      '  "name": "Mohammad Zarif",',
      '  "github": "CtrlAltDevelop",',
      '  "focus": ["Flutter", "Python"],',
      '  "status": "available"',
      '}'
    ]
  },
  {
    title: 'architecture.dart',
    lines: [
      'presentation -> domain -> data',
      '',
      'Result<Success, Failure> execute() {',
      '  return repository.fetch();',
      '}',
      '// dependency flow: inward only'
    ]
  },
  {
    title: 'api_client.py',
    lines: [
      'async def request(endpoint, payload):',
      '    token = await auth.refresh_if_needed()',
      '    response = await client.post(',
      '        endpoint, json=payload',
      '    )',
      '    return Result.ok(response.json())'
    ]
  },
  {
    title: 'pubspec.yaml',
    lines: [
      'name: verdict',
      'version: 2.1.0',
      'description: Typed result boundaries',
      'repository: github.com/CtrlAltDevelop/verdict',
      'environment:',
      '  sdk: ^3.6.0',
      'license: MIT'
    ]
  },
  {
    title: 'CtrlAltDevelop / git log --graph',
    lines: [
      '* feat: ship mobile architecture',
      '|\\',
      '| * fix: make refresh atomic',
      '* | perf: cache generated models',
      '|/',
      '* test: keep analysis at zero'
    ]
  },
  {
    title: 'stack.ts',
    lines: [
      'const stack = {',
      '  mobile: ["Flutter", "Dart"],',
      '  backend: ["Python", ".NET"],',
      '  patterns: ["BLoC", "Clean Arch"],',
      '  quality: ["CI", "Codegen", "Tests"]',
      '};'
    ]
  },
  {
    title: 'research.py',
    lines: [
      'signals = preprocess(eeg_dataset)',
      'features = extract_frequency_bands(signals)',
      '',
      'model.fit(features, diagnosis)',
      'score = model.cross_validate(k=10)',
      'print(score.mean())'
    ]
  },
  {
    title: 'contact.sh',
    lines: [
      '$ gh api users/CtrlAltDevelop --jq .name',
      'Mohammad Zarif',
      '',
      '$ ./start-a-project --remote',
      'checking availability ........ ready',
      'connection open on port 443'
    ]
  }
];

function makeCodeScreen(index, accentMaterial, iceMaterial) {
  const group = new THREE.Group();
  const spec = PROGRAM_SCREENS[index];
  const texture = codeTexture(spec);
  const screenMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  screenMaterial.userData.baseOpacity = screenMaterial.opacity;
  group.userData.materials = [screenMaterial];
  group.userData.scanners = [];

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.65, 2.9), screenMaterial);
  group.add(screen);

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(4.82, 3.07, 0.14)),
    iceMaterial
  );
  frame.position.z = -0.02;
  group.add(frame);

  const scanner = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2.08, 0, 0.09),
      new THREE.Vector3(2.08, 0, 0.09)
    ]),
    accentMaterial
  );
  scanner.userData.phase = index * 0.71;
  group.add(scanner);
  group.userData.scanners.push(scanner);
  return group;
}

function codeTexture(spec) {
  const surface = document.createElement('canvas');
  surface.width = 1024;
  surface.height = 640;
  const context = surface.getContext('2d');
  context.fillStyle = 'rgba(8, 10, 16, 0.96)';
  context.fillRect(0, 0, surface.width, surface.height);

  context.strokeStyle = 'rgba(124, 154, 255, 0.55)';
  context.lineWidth = 3;
  context.strokeRect(2, 2, surface.width - 4, surface.height - 4);
  context.fillStyle = 'rgba(124, 154, 255, 0.10)';
  context.fillRect(0, 0, surface.width, 84);

  ['#FF6B7A', '#FFD166', '#6FE3A1'].forEach((color, dot) => {
    context.beginPath();
    context.arc(38 + dot * 34, 42, 9, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  });

  context.font = '500 25px JetBrains Mono, monospace';
  context.fillStyle = '#9BA5B8';
  context.fillText(spec.title, 148, 51);

  context.font = '24px JetBrains Mono, monospace';
  spec.lines.forEach((line, row) => {
    const y = 135 + row * 72;
    context.fillStyle = 'rgba(100, 109, 128, 0.86)';
    context.fillText(String(row + 1).padStart(2, '0'), 34, y);
    context.fillStyle = row === 0 || line.trim().startsWith('$')
      ? '#7C9AFF'
      : row % 3 === 0 ? '#A78BFA' : '#E9EDF5';
    context.fillText(line, 105, y);
  });

  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function makeProgrammingProps(index, accentMaterial, iceMaterial) {
  const group = new THREE.Group();
  if (index === 0) addBracketPair(group, accentMaterial);
  if (index === 1) addPhone(group, iceMaterial, accentMaterial);
  if (index === 2) addArchitectureStack(group, iceMaterial, accentMaterial);
  if (index === 3) addApiGraph(group, iceMaterial, accentMaterial);
  if (index === 4) addPackageCubes(group, iceMaterial, accentMaterial);
  if (index === 5) addCommitGraph(group, iceMaterial, accentMaterial);
  if (index === 6) addDatabaseStack(group, iceMaterial, accentMaterial);
  if (index === 7) addNeuralGraph(group, iceMaterial, accentMaterial);
  if (index === 8) addTerminalPrompt(group, iceMaterial, accentMaterial);
  return group;
}

function addBracketPair(group, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-3.05, 1.45, 0), new THREE.Vector3(-3.42, 1.45, 0),
    new THREE.Vector3(-3.42, 1.45, 0), new THREE.Vector3(-3.42, -1.45, 0),
    new THREE.Vector3(-3.42, -1.45, 0), new THREE.Vector3(-3.05, -1.45, 0),
    new THREE.Vector3(3.05, 1.45, 0), new THREE.Vector3(3.42, 1.45, 0),
    new THREE.Vector3(3.42, 1.45, 0), new THREE.Vector3(3.42, -1.45, 0),
    new THREE.Vector3(3.42, -1.45, 0), new THREE.Vector3(3.05, -1.45, 0)
  ]);
  group.add(new THREE.LineSegments(geometry, material));
}

function addPhone(group, frameMaterial, accentMaterial) {
  const phone = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.32, 2.55, 0.22)),
    frameMaterial
  );
  phone.position.set(2.72, -0.05, -0.5);
  phone.rotation.y = -0.25;
  group.add(phone);
  const home = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.TorusGeometry(0.1, 0.015, 4, 20)),
    accentMaterial
  );
  home.position.set(2.72, -1.05, -0.36);
  group.add(home);
}

function addArchitectureStack(group, frameMaterial, accentMaterial) {
  for (let layer = 0; layer < 3; layer++) {
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2 - layer * 0.3, 0.42, 1.3)),
      layer === 1 ? accentMaterial : frameMaterial
    );
    box.position.set(2.65, 0.72 - layer * 0.72, -0.58);
    box.rotation.y = -0.32;
    group.add(box);
  }
}

function addApiGraph(group, frameMaterial, accentMaterial) {
  const positions = [
    [-3.0, 1.25], [-2.55, 0.05], [-3.1, -1.2],
    [2.7, 1.1], [3.15, 0], [2.65, -1.15]
  ];
  positions.forEach((position, node) => {
    const marker = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(node % 3 === 1 ? 0.22 : 0.14, 0)),
      node % 3 === 1 ? accentMaterial : frameMaterial
    );
    marker.position.set(position[0], position[1], -0.25);
    group.add(marker);
    const edge = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(position[0], position[1], -0.28),
        new THREE.Vector3(position[0] > 0 ? 2.0 : -2.0, 0, -0.28)
      ]),
      node % 3 === 1 ? accentMaterial : frameMaterial
    );
    group.add(edge);
  });
}

function addPackageCubes(group, frameMaterial, accentMaterial) {
  [[-3.0, 1.05], [2.8, 1.0], [-2.85, -1.0], [2.95, -1.05]].forEach((position, cube) => {
    const item = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.65, 0.65, 0.65)),
      cube === 1 ? accentMaterial : frameMaterial
    );
    item.position.set(position[0], position[1], -0.32);
    item.rotation.set(cube * 0.21, cube * 0.35, cube * 0.12);
    group.add(item);
  });
}

function addCommitGraph(group, frameMaterial, accentMaterial) {
  const commits = [[-3.15, 1.25], [-2.75, .45], [-3.08, -.35], [-2.55, -1.15], [2.85, .85], [3.08, 0], [2.72, -.9]];
  commits.forEach((commit, index) => {
    const point = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.13, 0)),
      index === 3 || index === 5 ? accentMaterial : frameMaterial
    );
    point.position.set(commit[0], commit[1], -0.3);
    group.add(point);
    if (index) {
      const previous = commits[index - 1];
      if (Math.sign(previous[0]) === Math.sign(commit[0])) {
        group.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(previous[0], previous[1], -0.34),
            new THREE.Vector3(commit[0], commit[1], -0.34)
          ]), frameMaterial
        ));
      }
    }
  });
}

function addDatabaseStack(group, frameMaterial, accentMaterial) {
  for (let level = 0; level < 3; level++) {
    const database = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 20)),
      level === 0 ? accentMaterial : frameMaterial
    );
    database.position.set(2.85, 0.7 - level * 0.58, -0.48);
    group.add(database);
  }
}

function addNeuralGraph(group, frameMaterial, accentMaterial) {
  const layers = [[-3.15, 3], [-2.7, 4], [2.72, 4], [3.12, 3]];
  const nodes = [];
  layers.forEach(([x, count], layer) => {
    for (let i = 0; i < count; i++) {
      const y = (i - (count - 1) / 2) * 0.62;
      const node = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.1, 0)),
        layer === 2 ? accentMaterial : frameMaterial
      );
      node.position.set(x, y, -0.28);
      group.add(node);
      nodes.push([x, y]);
    }
  });
  nodes.slice(0, 7).forEach((from, edge) => {
    const to = nodes[(edge * 3 + 7) % nodes.length];
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(from[0], from[1], -0.34),
        new THREE.Vector3(to[0], to[1], -0.34)
      ]), frameMaterial
    ));
  });
}

function addTerminalPrompt(group, frameMaterial, accentMaterial) {
  const cursor = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(2.55, -1.38, -0.2),
      new THREE.Vector3(3.28, -1.38, -0.2)
    ]), accentMaterial
  );
  group.add(cursor);
  const arrow = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-3.25, 0.2, -0.2), new THREE.Vector3(-2.55, 0.2, -0.2),
      new THREE.Vector3(-2.78, 0.48, -0.2), new THREE.Vector3(-2.5, 0.2, -0.2),
      new THREE.Vector3(-2.5, 0.2, -0.2), new THREE.Vector3(-2.78, -0.08, -0.2)
    ]), frameMaterial
  );
  group.add(arrow);
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
