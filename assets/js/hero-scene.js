/* ===========================================================
   Hero scene — a codebase, seen from inside.
   Columns of monospace glyphs fall through depth while a few
   translucent editor panes drift and type themselves out.
   Every texture is generated at runtime, so the page stays
   single-origin and there is nothing to preload.
   =========================================================== */

import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';
import { GRID, glyphAtlas, GLYPH_PICK, GLYPH_READ } from './glyph.js';

/* ---------- what the panes type ---------- */
// Deliberately mundane code: it should read as work, not as a slogan.
// Lines stay under ~42 characters: the panes are read at a glance, from a
// distance, so legibility beats completeness.
const SNIPPETS = [
  {
    name: 'quote_stream.dart',
    lines: [
      'Stream<Quote> watch(String sym) async* {',
      '  final ch = await _socket.open(sym);',
      '',
      '  await for (final f in ch.frames) {',
      '    final q = Quote.fromJson(f.body);',
      '    if (q.isStale) continue; // late tick',
      '    yield q;',
      '  }',
      '}',
    ],
  },
  {
    name: 'orders.py',
    lines: [
      '@router.post("/orders")',
      'async def place(order: OrderIn, uow: Uow):',
      '    async with uow.transaction():',
      '        book = await uow.books.lock(sym)',
      '        filled = book.match(order)',
      '        await uow.ledger.append(filled)',
      '    return OrderOut.of(filled)',
    ],
  },
  {
    name: 'LedgerService.cs',
    lines: [
      'public async Task<Receipt> Settle(Batch b)',
      '{',
      '    if (b.IsEmpty) return Receipt.None;',
      '',
      '    var posted = await _ledger.Post(b, Ct);',
      '    return posted.Match(',
      '        ok => ok.Receipt,',
      '        err => throw new PostFailed(err));',
      '}',
    ],
  },
];

const canvas = document.getElementById('hero-canvas');
if (canvas) boot(canvas);

/* The scene's layout and counts are chosen once, from the canvas' real size.
   A hidden or not-yet-laid-out tab measures 0×0, so wait for a usable box
   before building anything — otherwise a desktop page can come up with the
   phone layout and a degenerate camera aspect. */
function boot(canvas) {
  let built = false;

  const attempt = () => {
    if (built) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    built = true;
    if (ro) ro.disconnect();
    init(canvas, w, h);
  };

  const ro = 'ResizeObserver' in window ? new ResizeObserver(attempt) : null;
  if (ro) ro.observe(canvas);
  attempt();

  // No ResizeObserver (or a canvas that never reports a box): fall back to the
  // window, so the scene still shows up.
  if (!built && !ro) init(canvas, window.innerWidth || 1024, window.innerHeight || 768);
}

function init(canvas, width, height) {
  /* ---------- config ---------- */
  const narrow  = width < 760;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const BG      = 0x06070A;
  const SPAN    = narrow ? 40 : 34;         // height a glyph falls before wrapping
  const COLUMNS = narrow ? 42 : 88;
  const PER_COL = narrow ? 12 : 15;         // glyphs per trail

  const C_COLD = new THREE.Color(0x5C7CE0); // body of a trail
  const C_WARM = new THREE.Color(0xA78BFA); // the violet columns
  const C_HOT  = new THREE.Color(0xE8EEFF); // leading glyph

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

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 300);
  const camBase = new THREE.Vector3(0, 0, 26);
  camera.position.copy(camBase);

  const world = new THREE.Group();
  scene.add(world);

  /* ---------- falling glyphs ---------- */
  // The atlas comes from glyph.js; the shader picks a cell per glyph per
  // moment, which is what makes a column look like it is being rewritten
  // rather than scrolled.
  const COUNT = COLUMNS * PER_COL;
  const gPos   = new Float32Array(COUNT * 3);
  const gSpeed = new Float32Array(COUNT);
  const gTrail = new Float32Array(COUNT);   // 0 at the head, 1 at the tail
  const gSeed  = new Float32Array(COUNT);
  const gTint  = new Float32Array(COUNT);

  const STEP = narrow ? 1.15 : 1.0;         // vertical gap inside a trail

  // Half-width of the view at a given depth, so columns can be spread to fill
  // the frame instead of bunching near the centre as they recede.
  const halfAt = (z) => Math.tan((50 * Math.PI / 180) / 2) * (26 - z) * (narrow ? .75 : 1.85);

  for (let c = 0, i = 0; c < COLUMNS; c++) {
    // Columns sit on a loose grid so they read as ranks of text rather than a
    // random cloud, with enough jitter that the grid never shows.
    const z = -18 + (c % 5) * 4.6 + Math.random() * 3;
    const x = (c / (COLUMNS - 1) - .5) * 2 * halfAt(z) * 1.06 + (Math.random() - .5) * 1.6;
    // Slow enough to read as drifting code rather than falling rain.
    const speed = (1.0 + Math.random() * 1.5) * (narrow ? .8 : 1);
    const top   = (Math.random() - .5) * SPAN;
    const tint  = Math.random() < .22 ? 1 : 0;

    for (let k = 0; k < PER_COL; k++, i++) {
      gPos[i * 3]     = x;
      gPos[i * 3 + 1] = top + k * STEP;     // +y is behind the head as it falls
      gPos[i * 3 + 2] = z;
      gSpeed[i] = speed;
      gTrail[i] = k / (PER_COL - 1);
      gSeed[i]  = Math.random() * 100;
      gTint[i]  = tint;
    }
  }

  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  rainGeo.setAttribute('aSpeed',   new THREE.BufferAttribute(gSpeed, 1));
  rainGeo.setAttribute('aTrail',   new THREE.BufferAttribute(gTrail, 1));
  rainGeo.setAttribute('aSeed',    new THREE.BufferAttribute(gSeed, 1));
  rainGeo.setAttribute('aTint',    new THREE.BufferAttribute(gTint, 1));

  const rainMat = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas:   { value: glyphAtlas() },
      uTime:    { value: 0 },
      uSpan:    { value: SPAN },
      uSize:    { value: narrow ? 1.45 : 1.7 },
      uPix:     { value: dpr },
      uGrid:    { value: GRID },
      uOpacity: { value: narrow ? 1 : .72 },
      // How far the copy side of the frame dims. On phones the copy is centred
      // and the scene is the only visual, so barely dim it at all.
      uCalm:    { value: narrow ? .82 : .34 },
      uCold:    { value: C_COLD },
      uWarm:    { value: C_WARM },
      uHot:     { value: C_HOT },
    },
    vertexShader: GLYPH_PICK + /* glsl */`
      uniform float uTime, uSpan, uSize, uPix, uGrid, uCalm;
      attribute float aSpeed, aTrail, aSeed, aTint;
      varying float vAlpha, vHead, vTint;
      varying vec2  vCell;

      void main() {
        float h = uSpan * .5;
        // wrap the fall instead of respawning, so the field never thins out
        float y = mod(position.y - uTime * aSpeed + h, uSpan) - h;

        vec4 mv = modelViewMatrix * vec4(position.x, y, position.z, 1.);
        gl_Position = projectionMatrix * mv;

        vHead = pow(1. - aTrail, 2.2);
        vTint = aTint;

        // fade at the wrap seams, otherwise glyphs pop in at full brightness
        float seam = smoothstep(0., .18, 1. - abs(y) / h);

        // The hero copy sits left of centre; hold the glyphs back over it so
        // the type never has to fight the scene.
        float calm = mix(uCalm, 1., smoothstep(-16., 1., mv.x));

        vAlpha = (.1 + .9 * vHead) * seam * calm;

        gl_PointSize = uSize * uPix * (300. / -mv.z);

        // pick a glyph cell; the head reshuffles fastest
        vCell = glyphCell(aSeed, 1.1 + vHead * 3.5, uTime, uGrid);
      }
    `,
    fragmentShader: GLYPH_READ + /* glsl */`
      uniform sampler2D uAtlas;
      uniform float uGrid, uOpacity;
      uniform vec3 uCold, uWarm, uHot;
      varying float vAlpha, vHead, vTint;
      varying vec2  vCell;

      void main() {
        float a = glyphAlpha(uAtlas, vCell, gl_PointCoord, uGrid);
        if (a < .02) discard;
        vec3 c = mix(uCold, uWarm, vTint);
        c = mix(c, uHot, pow(vHead, 3.));
        gl_FragColor = vec4(c, a * vAlpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const rain = new THREE.Points(rainGeo, rainMat);
  rain.frustumCulled = false;
  world.add(rain);

  /* ---------- editor panes ---------- */
  // Each pane owns a canvas it repaints as its snippet types out. Painting is
  // throttled to the typing cadence, so this costs almost nothing per frame.
  const PANE_W = 1024, PANE_H = 512;        // texture pixels
  const KEYWORDS = /\b(async|await|await for|final|var|const|return|if|else|for|while|continue|yield|public|private|class|def|new|null|void|Task|Stream|String|bool|int|double|using|from|import|with|not|in|is|and|or)\b/g;

  /* On a phone the copy fills the hero — a wrapped name, the tagline and three
     stacked buttons — so the one card has to go in the only band that stays
     clear: between the nav and the eyebrow. Convert that band's position on
     screen into world units at the card's depth rather than guessing, since
     the band moves with the viewport. */
  /* On a phone the copy claims almost the whole hero; the only free band is the
     strip between the nav and the eyebrow pill. Measure it, then size and centre
     the single card inside it so it never collides with the type. */
  function phoneCard() {
    const camZ = 32, cardZ = 2;                            // portrait dolly
    const halfH = Math.tan((50 * Math.PI / 180) / 2) * (camZ - cardZ);
    const pxPerUnit = height / (2 * halfH);

    const eyebrow = document.querySelector('.hero .eyebrow');
    const floor = eyebrow ? eyebrow.getBoundingClientRect().top : height * .28;

    // 11.4 world units wide at s = 1, half that tall
    const s = .5;
    const cardPx = 11.4 * s * .5 * pxPerUnit;

    // Hang it off the eyebrow: clear of the type below, free to slide up behind
    // the translucent nav, which reads as depth rather than collision.
    const mid = Math.max(cardPx * .35, floor - 10 - cardPx / 2);
    return { y: (.5 - mid / height) * 2 * halfH, s, z: cardZ };
  }

  // The hero copy sits left of centre, so the panes live on the right where
  // they add depth without ever competing with the type.
  const PANE_LAYOUT = narrow
    ? [{ x: 1.4, ry: .06, ...phoneCard() }]
    : [
        { x: 13.2, y:  1.4, z:   1.5, ry: -.32, s: 1.00 },
        { x:  9.5, y: -7.4, z:  -3.5, ry: -.16, s:  .86 },
        { x: 21.5, y: 11.2, z: -13.0, ry: -.42, s:  .78 },
      ];

  /* Liquid glass.
     The scene minus the panes is rendered to a target first; each pane then
     samples that image in screen space, bending the lookup near its rounded
     edge (that bend is what reads as thick glass), frosting it with a few
     offset taps, and adding a specular rim. */
  const glassRT = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false
  });

  const GLASS_VERT = /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    }
  `;

  const GLASS_FRAG = /* glsl */`
    uniform sampler2D uScene;
    uniform vec2  uRes;
    uniform float uAspect;   // pane width / height
    uniform float uRadius;   // corner radius, in half-height units
    uniform float uBend;     // how hard the edge lenses
    uniform float uFrost;    // blur radius, in pixels
    uniform vec3  uTint;
    uniform vec3  uSheen;
    uniform float uGain;     // phones need the glass brighter to read at all
    uniform float uAlpha;
    varying vec2 vUv;

    // signed distance to a rounded rectangle ('half' is reserved in GLSL)
    float sdRound(vec2 p, vec2 hb, float r) {
      vec2 q = abs(p) - (hb - r);
      return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
    }

    void main() {
      vec2 p  = (vUv - .5) * vec2(uAspect, 1.) * 2.;      // -1..1 on the short axis
      vec2 hb = vec2(uAspect, 1.);
      float sd = sdRound(p, hb, uRadius);
      if (sd > 0.) discard;                               // outside the rounded corner

      // distance in from the edge, and the direction pointing outwards
      float edge = 1. - smoothstep(0., .34, -sd);
      vec2  dir  = normalize(p / hb + vec2(1e-5));

      vec2 uv = gl_FragCoord.xy / uRes;
      vec2 px = 1. / uRes;

      // thick-glass lensing: strongest right at the rim, gone by the middle
      uv -= dir * edge * edge * uBend * px * 42.;

      // cheap frost — two rings of taps, so what shows through smears
      vec3 col = texture2D(uScene, uv).rgb * .28;
      for (int i = 0; i < 6; i++) {
        float a = float(i) * 1.0472;                      // 60° apart
        vec2  d = vec2(cos(a), sin(a));
        col += texture2D(uScene, uv + d * uFrost * px).rgb * .085;
        col += texture2D(uScene, uv + d * uFrost * 2.1 * px).rgb * .035;
      }
      col *= 1.25;                                        // glass gathers light

      // body tint, plus a sheen that falls off down the pane
      col = mix(col, uTint, .46);
      col += uSheen * (1. - vUv.y) * .035 + vec3(.006, .009, .019);

      // specular bevel, brightest along the top-left rim
      float lit = clamp(dot(dir, normalize(vec2(-.6, .8))), 0., 1.);
      col += uSheen * pow(edge, 2.6) * (.03 + .17 * lit);

      // hairline just inside the border keeps the shape crisp under bloom
      col += uSheen * smoothstep(.035, 0., abs(sd + .01)) * .16;

      col *= uGain;

      float a = smoothstep(0., .012, -sd);
      gl_FragColor = vec4(col, a * uAlpha);
    }
  `;

  const panes = PANE_LAYOUT.map((layout, i) => {
    const snippet = SNIPPETS[i % SNIPPETS.length];
    const cv = document.createElement('canvas');
    cv.width = PANE_W; cv.height = PANE_H;

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    const w = 11.4 * layout.s, h = w * (PANE_H / PANE_W);
    const group = new THREE.Group();
    group.position.set(layout.x, layout.y, layout.z);
    group.rotation.y = layout.ry;

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.ShaderMaterial({
        uniforms: {
          uScene:  { value: glassRT.texture },
          uRes:    { value: new THREE.Vector2(2, 2) },
          uAspect: { value: w / h },
          uRadius: { value: .4 },
          uBend:   { value: 1.25 - i * .22 },       // far panes lens less
          uFrost:  { value: 6.5 },
          uTint:   { value: new THREE.Color(0x1B2440) },
          uSheen:  { value: new THREE.Color(0xAFC2F5) },
          uGain:   { value: narrow ? 1.4 : 1 },
          uAlpha:  { value: narrow ? .9 : .8 },
        },
        vertexShader: GLASS_VERT,
        fragmentShader: GLASS_FRAG,
        transparent: true,
        depthWrite: false,
      })
    );
    glass.renderOrder = 2;
    group.add(glass);

    const text = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: .98, depthWrite: false
      })
    );
    text.position.z = .02;
    text.renderOrder = 3;
    group.add(text);

    world.add(group);

    const total = snippet.lines.reduce((n, l) => n + l.length + 1, 0);
    return {
      group, glass, cv, ctx: cv.getContext('2d'), tex, snippet, total,
      homeY: layout.y, homeRY: layout.ry,
      typed: 0, hold: 0, drawn: -1,
      phase: Math.random() * Math.PI * 2,
      drift: .5 + Math.random() * .5,
    };
  });

  function paint(p) {
    const g = p.ctx;
    const padX = 34, fs = 30, lh = 42, top = 96;
    g.clearRect(0, 0, PANE_W, PANE_H);

    // chrome: three dots and the file name
    g.font = `500 ${fs * .8}px ui-monospace, "JetBrains Mono", monospace`;
    g.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(padX + 8 + i * 26, 40, 7, 0, Math.PI * 2);
      g.fillStyle = i === 0 ? '#4A5878' : '#39435C';
      g.fill();
    }
    g.fillStyle = '#6C7896';
    g.fillText(p.snippet.name, padX + 108, 40);
    g.fillStyle = 'rgba(124,154,255,.2)';
    g.fillRect(padX, 66, PANE_W - padX * 2, 1);

    g.font = `500 ${fs}px ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, monospace`;
    // the glass behind can brighten unpredictably, so the code carries its own
    // contrast rather than relying on the backdrop
    g.shadowColor = 'rgba(4,6,12,.75)';
    g.shadowBlur = 7;

    let budget = p.typed;
    for (let i = 0; i < p.snippet.lines.length && budget > 0; i++) {
      const full = p.snippet.lines[i];
      const shown = full.slice(0, Math.min(full.length, budget));
      budget -= full.length + 1;

      const y = top + i * lh;

      g.fillStyle = '#39435C';                                  // gutter numbers
      g.fillText(String(i + 1).padStart(2, ' '), padX, y);

      let x = padX + fs * 2.1;
      for (const tok of tokenize(shown)) {
        g.fillStyle = tok.c;
        g.fillText(tok.s, x, y);
        x += g.measureText(tok.s).width;
      }

      // block caret rides the end of the last line being typed
      if (budget <= 0 && p.typed < p.total) {
        g.fillStyle = 'rgba(232,238,255,.85)';
        g.fillRect(x + 1, y - fs * .55, fs * .55, fs * 1.1);
      }
    }

    p.tex.needsUpdate = true;
  }

  // Small, forgiving highlighter — it only has to be plausible at a glance.
  function tokenize(line) {
    const out = [];
    const re = /(\/\/[^\n]*|#[^\n]*)|(["'`][^"'`]*["'`])|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\w\s])/g;
    let m;
    while ((m = re.exec(line))) {
      const s = m[0];
      let c = '#C7D2E8';
      if (m[1])      c = '#4E5871';                                  // comment
      else if (m[2]) c = '#A78BFA';                                   // string
      else if (m[3]) c = '#8FD6C4';                                   // number
      else if (m[4]) {
        KEYWORDS.lastIndex = 0;
        if (KEYWORDS.test(s)) c = '#7C9AFF';                          // keyword
        else if (/^[A-Z]/.test(s)) c = '#C6B6FF';                     // type
        else c = '#C7D2E8';
      }
      else if (m[6]) c = '#7E8AA6';                                   // punctuation
      out.push({ s, c });
    }
    return out;
  }

  function stepPanes(dt, t) {
    for (const p of panes) {
      if (p.hold > 0) {
        p.hold -= dt;
        if (p.hold <= 0) { p.typed = 0; p.drawn = -1; }
      } else if (p.typed < p.total) {
        p.typed = Math.min(p.total, p.typed + dt * 34);
        if ((p.typed | 0) !== p.drawn) { p.drawn = p.typed | 0; paint(p); }
        if (p.typed >= p.total) { p.hold = 3.4; paint(p); }
      }

      // Suspended, not pinned: a slow bob around the pane's own anchor, plus a
      // small tilt towards the cursor so the glass catches the light as you
      // move — the only feedback the scene gives, and it should stay subtle.
      p.group.position.y = p.homeY + Math.sin(t * .45 * p.drift + p.phase) * .5;
      p.group.rotation.z = Math.sin(t * .3 * p.drift + p.phase) * .012;
      p.group.rotation.y = p.homeRY - ptr.x * .07;
      p.group.rotation.x = ptr.y * .05;
    }
  }

  /* ---------- distant dust, for depth ---------- */
  const D_COUNT = narrow ? 200 : 420;
  const dust = new Float32Array(D_COUNT * 3);
  for (let i = 0; i < D_COUNT; i++) {
    dust[i * 3]     = (Math.random() - .5) * 100;
    dust[i * 3 + 1] = (Math.random() - .5) * 60;
    dust[i * 3 + 2] = -26 - Math.random() * 55;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));

  function dotTexture() {
    const s = 64, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0,   'rgba(255,255,255,1)');
    grd.addColorStop(.25, 'rgba(255,255,255,.75)');
    grd.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({
    map: dotTexture(), color: 0x8FA6D8, size: .2, sizeAttenuation: true,
    transparent: true, opacity: .4, depthWrite: false,
    blending: THREE.AdditiveBlending
  })));

  /* ---------- post-processing ---------- */
  const useBloom = !reduced && !narrow;
  let composer = null, bloom = null;
  if (useBloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .4, .55, .2);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  function render() {
    // pass 1: the scene behind the glass, at half resolution
    for (const p of panes) p.group.visible = false;
    renderer.setRenderTarget(glassRT);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    for (const p of panes) p.group.visible = true;

    // pass 2: everything, with the panes refracting that image
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  /* ---------- sizing ---------- */
  let lastW = 0, lastH = 0, raf = 0;

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;

    renderer.setSize(w, h, false);
    if (composer) {
      composer.setSize(w, h);
      bloom.setSize(w * dpr * .5, h * dpr * .5);   // blur at half res is free quality
    }

    // The glass samples in screen space, so its lookup resolution has to be
    // the drawing-buffer resolution, not the target's own half-size one.
    glassRT.setSize(Math.max(2, (w * dpr * .5) | 0), Math.max(2, (h * dpr * .5) | 0));
    for (const p of panes) p.glass.material.uniforms.uRes.value.set(w * dpr, h * dpr);

    camera.aspect = w / h;
    camBase.z = w / h < 1 ? 32 : 26;
    camera.updateProjectionMatrix();

    if (!raf) render();
  }

  /* ---------- pointer ---------- */
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    ptr.tx = (e.clientX / window.innerWidth - .5) * 2;
    ptr.ty = (e.clientY / window.innerHeight - .5) * 2;
  }, { passive: true });

  /* ---------- loop ---------- */
  let visible = true, last = performance.now(), t = 0, scrollEased = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    t += dt;

    rainMat.uniforms.uTime.value = t;
    stepPanes(dt, t);

    ptr.x += (ptr.tx - ptr.x) * .04;
    ptr.y += (ptr.ty - ptr.y) * .04;

    // dolly deeper into the field as the hero scrolls away
    const sp = Math.min(1, window.scrollY / Math.max(1, canvas.clientHeight));
    scrollEased += (sp - scrollEased) * .08;

    camera.position.x = camBase.x + ptr.x * 2.4;
    camera.position.y = camBase.y - ptr.y * 1.5 + scrollEased * 4;
    camera.position.z = camBase.z - scrollEased * 10;
    camera.lookAt(0, scrollEased * 1.5, 0);

    world.rotation.y = Math.sin(t / 19) * .06 + ptr.x * .05 + scrollEased * .22;
    world.rotation.x = Math.cos(t / 23) * .03;

    render();
    reveal();
  }

  // hand the canvas over to CSS once there is a real frame to look at
  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    canvas.classList.add('is-live');
  }

  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop()  { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  // Size against the canvas box, not the window: the element can be laid out
  // (or relaid out) without a window resize ever firing.
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize, { passive: true });
  resize();

  if (reduced) {
    // one still frame: snippets fully typed, nothing moving
    for (const p of panes) { p.typed = p.total; paint(p); }
    render();
    reveal();
    return;
  }

  for (const p of panes) paint(p);

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
