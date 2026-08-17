/* ===========================================================
   Shared glyph kit.
   One monospace atlas, baked at runtime, plus the two GLSL
   helpers that read it. Every scene on the page draws its
   points from this so the whole site speaks the same alphabet.
   =========================================================== */

import * as THREE from 'three';

export const GRID = 8;                       // atlas is GRID × GRID cells

// 64 code-ish characters — exactly fills the grid
export const CHARS = ('{}()[]<>/\\=+-*;:&|!?#$%^~.,_' + '0123456789' + 'abcdefghijklmnopqrstuvwxyz')
  .split('').slice(0, GRID * GRID);

let cached = null;

/** The glyph atlas, built once and shared by every scene. */
export function glyphAtlas() {
  if (cached) return cached;

  const cell = 64, size = cell * GRID;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.font = `600 ${cell * .68}px ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  for (let i = 0; i < CHARS.length; i++) {
    g.fillText(CHARS[i], (i % GRID) * cell + cell / 2, ((i / GRID) | 0) * cell + cell / 2);
  }

  cached = new THREE.CanvasTexture(cv);
  // flipY off so cell (col, row) counts from the canvas' top-left — the same
  // origin gl_PointCoord uses.
  cached.flipY = false;
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.minFilter = THREE.LinearFilter;
  cached.generateMipmaps = false;
  return cached;
}

/* Vertex-shader helper: which cell a point shows right now. `rate` is how many
   times a second it reshuffles, `seed` keeps neighbours out of step. */
export const GLYPH_PICK = /* glsl */`
  vec2 glyphCell(float seed, float rate, float time, float grid) {
    float n = floor(time * rate + seed * 13.);
    float r = fract(sin(n * 12.9898 + seed * 78.233) * 43758.5453);
    float i = floor(r * 64.);
    return vec2(mod(i, grid), floor(i / grid));
  }
`;

/* Fragment-shader helper: the glyph's coverage at this fragment. */
export const GLYPH_READ = /* glsl */`
  float glyphAlpha(sampler2D atlas, vec2 cell, vec2 coord, float grid) {
    return texture2D(atlas, (cell + coord) / grid).a;
  }
`;
