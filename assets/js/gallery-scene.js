import * as THREE from 'three';

const canvas = document.getElementById('gallery-canvas');

// Defer boot until the module has finished evaluating. The programming-widget
// definitions below are const-backed and must be initialized before the first
// exhibit asks for its code-screen data.
queueMicrotask(() => {
  if (!canvas || !supportsWebGL()) {
    document.body.classList.add('no-webgl');
  } else {
    boot(canvas);
  }
});

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
  // Derived from the DOM, never hardcoded. An earlier hardcoded order silently
  // went stale when the page reordered its sections, which parked the camera on
  // one exhibit across three sections and left two exhibits unreachable. Reading
  // the order back from the document means the scene cannot drift from the page
  // again — reorder a <section> and the gallery follows.
  const sectionIds = SECTION_ORDER
    .filter((id) => document.getElementById(id))
    .sort((a, b) => document.getElementById(a).offsetTop - document.getElementById(b).offsetTop);
  if (!sectionIds.length) return;
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
  addCeiling(world, ice, accent);
  addPortalTunnel(world, spacing, sectionIds.length, ice, accent);
  addSyntaxCloud(world, spacing, sectionIds.length, accent, ice);
  addExhibitLabels(world, spacing, accent, sectionIds);
  addCircuitWalls(world, spacing, sectionIds.length, ice, accent);
  addKeycaps(world, accent, ice);
  addBuildBadges(world, spacing, accent);
  const flowPackets = addApplicationFlow(
    world, spacing, sectionIds.length, seeded, accent, ice, slate
  );

  for (let i = 0; i < sectionIds.length; i++) {
    const side = i === 0 ? 1 : (i % 2 ? -1 : 1);
    const exhibit = createExhibit(i, EXHIBITS[sectionIds[i]].screen, side, accent, ice, slate, seeded);
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
  let cameraYawGoal = 0;
  let raf = 0;
  let lastTime = performance.now();
  const packetAxis = new THREE.Vector3(0, 0, 1);
  const packetTangent = new THREE.Vector3();

  function magneticTravel(value) {
    const hold = 0.18;
    if (value <= hold) return 0;
    if (value >= 1 - hold) return 1;
    const progress = (value - hold) / (1 - hold * 2);
    return progress * progress * (3 - 2 * progress);
  }

  function updateScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollProgress = Math.min(1, Math.max(0, window.scrollY / max));
    const snapOffset = Math.min(72, window.innerHeight * 0.12);
    const readingLine = window.scrollY + snapOffset + 2;
    let next = 0;
    for (let i = 0; i < sectionIds.length; i++) {
      const section = document.getElementById(sectionIds[i]);
      if (section && section.offsetTop <= readingLine) next = i;
    }
    const currentSection = document.getElementById(sectionIds[next]);
    const followingSection = next < sectionIds.length - 1
      ? document.getElementById(sectionIds[next + 1])
      : null;
    const travelStart = currentSection ? currentSection.offsetTop : 0;
    const travelEnd = followingSection
      ? followingSection.offsetTop
      : travelStart + (currentSection ? currentSection.offsetHeight : window.innerHeight);
    const local = currentSection
      ? Math.min(1, Math.max(0, (readingLine - travelStart) / Math.max(1, travelEnd - travelStart)))
      : 0;
    const scenePosition = Math.min(sectionIds.length - 1, next + magneticTravel(local));
    cameraGoal.z = 16 - scenePosition * spacing;
    setActive(next);
    if (reduced) renderStatic();
  }

  function setActive(index) {
    if (index === activeIndex) return;
    activeIndex = index;
    cameraGoal.x = (index % 2 ? 1 : -1) * Math.min(index, 1) * 0.72;
    cameraGoal.y = (index % 3 - 1) * 0.16;
    cameraYawGoal = index === 0 ? 0 : (index % 2 ? 0.105 : -0.105);
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
    const ease = 1 - Math.pow(0.045, dt);

    camera.position.x += (cameraGoal.x + pointer.x * 0.38 - camera.position.x) * ease;
    camera.position.y += (cameraGoal.y - pointer.y * 0.24 - camera.position.y) * ease;
    camera.position.z += (cameraGoal.z - camera.position.z) * ease;
    camera.rotation.y += ((cameraYawGoal - pointer.x * 0.018) - camera.rotation.y) * ease;
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

    flowPackets.forEach((packet) => {
      const travel = (time * packet.userData.speed + packet.userData.offset) % 1;
      const progress = packet.userData.reverse ? 1 - travel : travel;
      packet.userData.curve.getPointAt(progress, packet.position);
      packet.userData.curve.getTangentAt(progress, packetTangent);
      if (packet.userData.reverse) packetTangent.multiplyScalar(-1);
      packet.quaternion.setFromUnitVectors(packetAxis, packetTangent.normalize());
      const pulse = 0.82 + Math.sin(time * 5 + packet.userData.phase) * 0.18;
      packet.scale.setScalar(pulse);
    });

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

function createExhibit(index, screenIndex, side, accent, ice, slate, random) {
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

  const signature = makeSignature(index, screenIndex, accentMaterial, frameMaterial);
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

function makeSignature(index, screenIndex, accentMaterial, iceMaterial) {
  const group = new THREE.Group();
  group.userData.materials = [];
  group.userData.scanners = [];

  const screen = makeCodeScreen(screenIndex, accentMaterial, iceMaterial);
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
    title: 'CTRL ALT DEVELOP · Flutter / main.dart',
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
    title: '@CtrlAltDevelop · Flutter / mobile_flow.dart',
    lines: [
      'on<SubmitOrder>((event, emit) async {',
      '  emit(const OrderState.loading());',
      '  final result = await placeOrder(event);',
      '  result.fold(',
      '    (failure) => emit(OrderState.error(failure)),',
      '    (order) => emit(OrderState.ready(order)),',
      '  );',
      '});'
    ]
  },
  {
    title: 'CTRL ALT DEVELOP · Dart / architecture.dart',
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
    title: '@CtrlAltDevelop · Python / api_client.py',
    lines: [
      '@router.post("/v1/orders")',
      'async def create_order(',
      '    body: OrderIn,',
      '    user = Depends(dpop_auth),',
      '):',
      '    result = await service.execute(body, user)',
      '    return OrderOut.from_domain(result)'
    ]
  },
  {
    title: 'CTRL ALT DEVELOP · Dart / packages.dart',
    lines: [
      '// pub.dev · @CtrlAltDevelop',
      'const latest = <String>[',
      '  "dpop_client@1.0.0",',
      '  "safe_json_cast@1.0.0",',
      '  "indicator_tab_bar@1.0.0",',
      '];',
      '// source: github.com/CtrlAltDevelop'
    ]
  },
  {
    title: '@CtrlAltDevelop · git log --graph',
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
    title: 'CTRL ALT DEVELOP · flutter_python.yaml',
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
    title: '@CtrlAltDevelop · Python / research.py',
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
    title: 'CTRL ALT DEVELOP · terminal',
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

  const screen = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.06, 1.86, 0.025)),
    accentMaterial
  );
  screen.position.set(2.72, 0.06, -0.36);
  screen.rotation.y = -0.25;
  group.add(screen);

  for (let row = 0; row < 4; row++) {
    const width = row === 0 ? 0.62 : 0.78 - row * 0.08;
    const uiLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-width * 0.5, 0, 0),
        new THREE.Vector3(width * 0.5, 0, 0)
      ]),
      row === 0 ? accentMaterial : frameMaterial
    );
    uiLine.position.set(2.72, 0.66 - row * 0.35, -0.30);
    uiLine.rotation.y = -0.25;
    group.add(uiLine);
  }

  for (let tab = 0; tab < 3; tab++) {
    const navItem = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 0.12, 0.035)),
      tab === 1 ? accentMaterial : frameMaterial
    );
    navItem.position.set(2.42 + tab * 0.3, -0.7, -0.29);
    navItem.rotation.y = -0.25;
    group.add(navItem);
  }
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
  [
    [-3.15, 1.25], [-2.6, 0], [-3.05, -1.25],
    [3.1, 1.3], [2.6, 0.45], [3.05, -0.55], [2.65, -1.35]
  ].forEach((position, cube) => {
    const item = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 0.5, 0.5)),
      cube === 1 || cube === 4 ? accentMaterial : frameMaterial
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

function addCeiling(world, ice, accent) {
  const grid = new THREE.GridHelper(150, 75, accent, ice);
  grid.position.set(0, 4.15, -48);
  grid.rotation.z = Math.PI;
  grid.material.transparent = true;
  grid.material.opacity = 0.028;
  grid.material.depthWrite = false;
  world.add(grid);
}

function addPortalTunnel(world, spacing, count, ice, accent) {
  const quiet = lineMaterial(ice, 0.075);
  const active = lineMaterial(accent, 0.24);

  for (let index = 0; index < count; index++) {
    const z = 4 - index * spacing;
    const portal = new THREE.Group();
    portal.position.z = z;

    const room = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(13.4, 8.3, 0.16)),
      index === 0 || index === count - 1 ? active : quiet
    );
    portal.add(room);

    const innerRoom = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(11.8, 7.15, 0.08)),
      quiet
    );
    innerRoom.position.z = -0.35;
    portal.add(innerRoom);

    const syntax = index % 3;
    if (syntax === 0) addPortalBrackets(portal, active, 'square');
    if (syntax === 1) addPortalBrackets(portal, active, 'curly');
    if (syntax === 2) addPortalBrackets(portal, active, 'angle');
    world.add(portal);
  }

  const rails = [-6.7, 6.7];
  rails.forEach((x) => {
    [-4.15, 4.15].forEach((y) => {
      world.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, y, 10),
          new THREE.Vector3(x, y, 4 - (count - 1) * spacing - 8)
        ]), quiet
      ));
    });
  });
}

function addPortalBrackets(portal, material, type) {
  const points = [];
  if (type === 'square') {
    points.push(
      [-5.45, 2.85], [-5.9, 2.85], [-5.9, 2.85], [-5.9, -2.85], [-5.9, -2.85], [-5.45, -2.85],
      [5.45, 2.85], [5.9, 2.85], [5.9, 2.85], [5.9, -2.85], [5.9, -2.85], [5.45, -2.85]
    );
  }
  if (type === 'angle') {
    points.push(
      [-5.25, 2.85], [-6.05, 0], [-6.05, 0], [-5.25, -2.85],
      [5.25, 2.85], [6.05, 0], [6.05, 0], [5.25, -2.85]
    );
  }
  if (type === 'curly') {
    points.push(
      [-5.4, 3], [-5.85, 2.45], [-5.85, 2.45], [-5.7, 0.55], [-5.7, 0.55], [-6.08, 0],
      [-6.08, 0], [-5.7, -0.55], [-5.7, -0.55], [-5.85, -2.45], [-5.85, -2.45], [-5.4, -3],
      [5.4, 3], [5.85, 2.45], [5.85, 2.45], [5.7, 0.55], [5.7, 0.55], [6.08, 0],
      [6.08, 0], [5.7, -0.55], [5.7, -0.55], [5.85, -2.45], [5.85, -2.45], [5.4, -3]
    );
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map(([x, y]) => new THREE.Vector3(x, y, 0.2))
  );
  portal.add(new THREE.LineSegments(geometry, material));
}

function addSyntaxCloud(world, spacing, count, accent, ice) {
  const tokens = [
    'Flutter', 'async def', 'BLoC', 'FastAPI', 'Widget', 'await',
    'pub.dev', 'Result<T>', '@CtrlAltDevelop', 'Dart', 'Python', 'Dio',
    'pytest', 'Clean Arch', 'REST', 'git push', '{ }', '=>'
  ];
  for (let index = 0; index < count * 2; index++) {
    const token = tokens[index % tokens.length];
    const section = Math.floor(index / 2);
    const layer = index % 2;
    const texture = syntaxTexture(token, index % 4 === 0 ? '#7C9AFF' : '#9BA5B8');
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: index % 4 === 0 ? 0.34 : 0.17,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const ratio = Math.min(3.4, Math.max(1.75, token.length * 0.23));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(ratio, 0.72), material);
    const side = layer ? -1 : 1;
    label.position.set(
      side * (6.1 + (section % 3) * 0.38),
      layer ? -2.35 + (section % 2) * 0.55 : 2.7 - (section % 3) * 0.48,
      1 - section * spacing + (layer ? -0.7 : 0.8)
    );
    label.rotation.y = side * -0.46;
    world.add(label);
  }

  [
    ['CTRL ALT DEVELOP', 2.4],
    ['@CtrlAltDevelop', -spacing * 3 + 1],
    ['FLUTTER × PYTHON', -spacing * 6 + 1]
  ].forEach(([text, z], index) => {
    const signature = syntaxTexture(text, '#7C9AFF');
    const signatureMaterial = new THREE.MeshBasicMaterial({
      map: signature,
      transparent: true,
      opacity: index === 0 ? 0.46 : 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const signaturePanel = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 0.78), signatureMaterial);
    signaturePanel.position.set(index % 2 ? -0.8 : 0.8, 3.15, z);
    signaturePanel.rotation.y = index % 2 ? 0.06 : -0.06;
    world.add(signaturePanel);
  });
}

function syntaxTexture(text, color) {
  const surface = document.createElement('canvas');
  surface.width = 640;
  surface.height = 160;
  const context = surface.getContext('2d');
  context.clearRect(0, 0, surface.width, surface.height);
  context.font = '600 58px JetBrains Mono, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.fillText(text, surface.width / 2, surface.height / 2);
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/* Exhibit content, keyed by the section it belongs to rather than by position.
   The plate number is composed from the section's real position in the document
   (see addExhibitLabels), so reordering a section renumbers the gallery instead
   of handing one section another's exhibit. `screen` indexes PROGRAM_SCREENS. */
const EXHIBITS = {
  'hero':        { title: 'CTRL ALT DEVELOP', meta: '@CtrlAltDevelop · main.dart',            screen: 0 },
  'about':       { title: 'FLUTTER PROFILE',  meta: 'developer.json · mobile + backend',      screen: 1 },
  'approach':    { title: 'DART ARCH',        meta: 'BLoC · Result<T> · clean architecture',  screen: 2 },
  'work':        { title: 'PYTHON API',       meta: '@CtrlAltDevelop · api_client.py',        screen: 3 },
  'open-source': { title: 'DART PACKAGES',    meta: 'pub.dev · 17 published packages',        screen: 4 },
  'experience':  { title: 'GITHUB',           meta: 'CtrlAltDevelop · git log --graph',       screen: 5 },
  'stack':       { title: 'DEV STACK',        meta: 'Flutter + Python + .NET',                screen: 6 },
  'research':    { title: 'PYTHON RESEARCH',  meta: 'signal_pipeline.py · pytest',            screen: 7 },
  'contact':     { title: 'CONNECT',          meta: 'github.com/CtrlAltDevelop',              screen: 8 }
};

/* Every section the scene has an exhibit for. boot() intersects this with the
   document and sorts by real offsetTop, so this list is a registry, not an order. */
const SECTION_ORDER = Object.keys(EXHIBITS);

const APP_FLOW_STAGES = [
  ['01 / FLUTTER UI', '@CtrlAltDevelop · tap → Event'],
  ['02 / BLOC STATE', 'Event → UseCase'],
  ['03 / DOMAIN', 'Result<T> boundary'],
  ['04 / DIO CLIENT', 'serialize + intercept'],
  ['05 / DPOP AUTH', 'proof JWT · ES256'],
  ['06 / REST API', 'POST /v1/orders'],
  ['07 / PYTHON API', 'FastAPI · validate → execute'],
  ['08 / DATABASE', 'query → commit'],
  ['09 / UI RESPONSE', '200 OK → Ready(data)']
];

function addExhibitLabels(world, spacing, accent, sectionIds) {
  sectionIds.forEach((id, index) => {
    const exhibit = EXHIBITS[id];
    const title = String(index).padStart(2, '0') + ' / ' + exhibit.title;
    const meta = exhibit.meta;
    const texture = panelTexture(title, meta, '#7C9AFF');
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.72), material);
    const side = index % 2 ? -1 : 1;
    panel.position.set(side * 3.75, 3.28, 4.45 - index * spacing);
    panel.rotation.y = side * -0.12;
    world.add(panel);

    const marker = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(4.35, 0.86, 0.08)),
      lineMaterial(accent, 0.25)
    );
    marker.position.copy(panel.position);
    marker.rotation.copy(panel.rotation);
    marker.position.z -= 0.05;
    world.add(marker);
  });
}

function panelTexture(title, meta, color) {
  const surface = document.createElement('canvas');
  surface.width = 900;
  surface.height = 160;
  const context = surface.getContext('2d');
  context.fillStyle = 'rgba(8, 10, 16, 0.88)';
  context.fillRect(0, 0, surface.width, surface.height);
  context.fillStyle = color;
  context.font = '700 37px JetBrains Mono, monospace';
  context.fillText(title, 36, 70);
  context.fillStyle = '#9BA5B8';
  context.font = '500 25px JetBrains Mono, monospace';
  context.fillText(meta, 36, 119);
  context.strokeStyle = 'rgba(124, 154, 255, 0.62)';
  context.lineWidth = 3;
  context.strokeRect(2, 2, surface.width - 4, surface.height - 4);
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function addCircuitWalls(world, spacing, count, ice, accent) {
  const wire = lineMaterial(ice, 0.095);
  const live = lineMaterial(accent, 0.32);
  const endZ = 4 - (count - 1) * spacing;

  [-1, 1].forEach((side) => {
    for (let circuit = 0; circuit < 4; circuit++) {
      const x = side * (6.18 + circuit * 0.13);
      const y = -2.7 + circuit * 1.72;
      const points = [];
      for (let room = 0; room < count; room++) {
        const z = 4 - room * spacing;
        const offsetY = room % 2 ? 0.46 : -0.34;
        points.push(
          new THREE.Vector3(x, y, z + 4.2),
          new THREE.Vector3(x, y, z + 0.8),
          new THREE.Vector3(x, y, z + 0.8),
          new THREE.Vector3(x, y + offsetY, z + 0.25),
          new THREE.Vector3(x, y + offsetY, z + 0.25),
          new THREE.Vector3(x, y + offsetY, Math.max(endZ - 2, z - 4.5))
        );
      }
      world.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(points),
        circuit === 1 ? live : wire
      ));
    }

    for (let room = 0; room < count; room++) {
      const node = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.OctahedronGeometry(room % 3 === 0 ? 0.16 : 0.09, 0)),
        room % 3 === 0 ? live : wire
      );
      node.position.set(side * 6.2, -2.7 + (room % 4) * 1.72, 4 - room * spacing + 0.25);
      world.add(node);
    }
  });
}

function addKeycaps(world, accent, ice) {
  const edge = lineMaterial(accent, 0.52);
  const deck = new THREE.Group();
  deck.position.set(-3.65, -3.22, 1.1);
  deck.rotation.y = 0.12;

  ['CTRL', 'ALT', 'DEV'].forEach((label, index) => {
    const key = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.08, 0.36, 0.92)),
      index === 2 ? edge : lineMaterial(ice, 0.3)
    );
    key.position.x = index * 1.22;
    deck.add(key);

    const texture = syntaxTexture(label, index === 2 ? '#7C9AFF' : '#E9EDF5');
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.35), material);
    top.position.set(index * 1.22, 0.19, 0);
    top.rotation.x = -Math.PI * 0.5;
    deck.add(top);
  });
  world.add(deck);
}

function addBuildBadges(world, spacing, accent) {
  const badges = [
    ['FLUTTER BUILD', 'PASS · @CtrlAltDevelop'],
    ['PYTHON API', 'ONLINE · 200 OK'],
    ['QUALITY', '132 SUITES · 0 ISSUES']
  ];
  badges.forEach(([title, value], index) => {
    const texture = panelTexture(title, value, '#7C9AFF');
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: index === 0 ? 0.68 : 0.44,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.62), material);
    badge.position.set(4.55, -2.2 - index * 0.78, 4 - 3 * spacing + 0.7);
    badge.rotation.y = -0.3;
    world.add(badge);

    if (index === 0) {
      const pulse = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(2.16, 0.72, 0.08)),
        lineMaterial(accent, 0.38)
      );
      pulse.position.copy(badge.position);
      pulse.rotation.copy(badge.rotation);
      pulse.position.z -= 0.04;
      world.add(pulse);
    }
  });
}

function addApplicationFlow(world, spacing, count, random, accent, ice, slate) {
  const packets = [];
  const railY = -2.72;
  const requestPoints = [];
  const responsePoints = [];

  for (let index = 0; index < count; index++) {
    const z = 8 - index * spacing;
    const bend = index % 2 ? -0.12 : 0.12;
    requestPoints.push(new THREE.Vector3(-0.62 + bend, railY, z));
    responsePoints.push(new THREE.Vector3(0.62 - bend, railY + 0.18, z));
  }

  requestPoints.push(new THREE.Vector3(-0.62, railY, 4 - count * spacing));
  responsePoints.push(new THREE.Vector3(0.62, railY + 0.18, 4 - count * spacing));

  const requestCurve = new THREE.CatmullRomCurve3(requestPoints, false, 'catmullrom', 0.12);
  const responseCurve = new THREE.CatmullRomCurve3(responsePoints, false, 'catmullrom', 0.12);
  const requestRail = lineMaterial(accent, 0.42);
  const responseRail = lineMaterial(ice, 0.2);

  world.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(requestCurve.getPoints(180)),
    requestRail
  ));
  world.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(responseCurve.getPoints(180)),
    responseRail
  ));

  APP_FLOW_STAGES.slice(0, count).forEach(([title, detail], index) => {
    const z = 6 - index * spacing;
    const side = index % 2 ? -1 : 1;
    const texture = panelTexture(title, detail, '#7C9AFF');
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.5), labelMaterial);
    label.position.set(side * 1.28, -2.1, z);
    label.rotation.y = side * -0.08;
    world.add(label);

    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2, 0.6, 0.06)),
      lineMaterial(index === 4 || index === 5 ? accent : slate, index === 4 || index === 5 ? 0.42 : 0.25)
    );
    frame.position.copy(label.position);
    frame.rotation.copy(label.rotation);
    frame.position.z -= 0.04;
    world.add(frame);

    const requestNode = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(index === 0 || index === count - 1 ? 0.15 : 0.1, 0)),
      requestRail
    );
    requestNode.position.set(-0.62, railY, z);
    world.add(requestNode);

    const responseNode = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.09, 0)),
      responseRail
    );
    responseNode.position.set(0.62, railY + 0.18, z);
    world.add(responseNode);

    const railX = side < 0 ? -0.62 : 0.62;
    const labelEdge = side * 0.2;
    world.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(railX, railY + 0.09, z),
        new THREE.Vector3(labelEdge, -2.1, z)
      ]),
      side < 0 ? requestRail : responseRail
    ));

    if (index < count - 1) {
      const arrowZ = z - spacing * 0.5;
      const requestArrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.085, 0.28, 3),
        new THREE.MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity: 0.62,
          depthWrite: false
        })
      );
      requestArrow.position.set(-0.62, railY, arrowZ);
      requestArrow.rotation.x = -Math.PI * 0.5;
      world.add(requestArrow);

      const responseArrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.075, 0.24, 3),
        new THREE.MeshBasicMaterial({
          color: ice,
          transparent: true,
          opacity: 0.34,
          depthWrite: false
        })
      );
      responseArrow.position.set(0.62, railY + 0.18, arrowZ);
      responseArrow.rotation.x = Math.PI * 0.5;
      world.add(responseArrow);
    }
  });

  const requestMaterial = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.82,
    depthWrite: false
  });
  const responseMaterial = new THREE.MeshBasicMaterial({
    color: ice,
    transparent: true,
    opacity: 0.58,
    depthWrite: false
  });

  for (let index = 0; index < 22; index++) {
    const reverse = index % 3 === 0;
    const packet = new THREE.Mesh(
      reverse
        ? new THREE.OctahedronGeometry(0.095, 0)
        : new THREE.BoxGeometry(0.08, 0.08, 0.38),
      reverse ? responseMaterial : requestMaterial
    );
    packet.userData.curve = reverse ? responseCurve : requestCurve;
    packet.userData.reverse = reverse;
    packet.userData.offset = random();
    packet.userData.speed = 0.022 + random() * 0.018;
    packet.userData.phase = random() * Math.PI * 2;
    const initial = reverse ? 1 - packet.userData.offset : packet.userData.offset;
    packet.userData.curve.getPointAt(initial, packet.position);
    world.add(packet);
    packets.push(packet);
  }
  return packets;
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
