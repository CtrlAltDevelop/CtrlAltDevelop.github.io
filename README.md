# ctrlaltdevelop.github.io

Personal résumé site for **Mohammad Zarif** — senior mobile & backend developer.

Live at **[ctrlaltdevelop.github.io](https://ctrlaltdevelop.github.io)**.

## Stack

Plain HTML, CSS and ES modules — no build step, no framework, no dependencies to install.
[Three.js](https://threejs.org) is loaded from a CDN via an import map.

```
index.html                  all page content
assets/css/style.css        design tokens + every style rule
assets/js/hero-scene.js     hero WebGL scene (constellation + link pulses)
assets/js/neural-scene.js   research-section accent (feed-forward network)
assets/js/contact-scene.js  contact-section morphing particle cloud
assets/js/main.js           preloader, nav, scroll spy, reveals, counters,
                            card tilt, magnetic buttons, role rotator
assets/Mohammad-Zarif-Resume.pdf
```

## Running locally

No tooling required — serve the folder over HTTP (ES modules won't load from `file://`):

```bash
python3 -m http.server 4321
```

Then open <http://localhost:4321>.

## Notes

- All three WebGL scenes pause when scrolled off screen or when the tab is hidden,
  and render a single static frame under `prefers-reduced-motion: reduce`.
- The hero point cloud switches to a portrait-shaped box below 760px — a landscape
  box viewed in portrait leaves most of the cloud outside the frustum.
- Card tilt and magnetic buttons are gated on `(hover: hover) and (pointer: fine)`,
  so they never fire on touch.
- Scroll reveals are scoped to a `.js` class on `<html>`, so the page still renders
  fully if the scripts fail to load.
- Canvases size themselves with a `ResizeObserver` rather than window resize events.

## Updating the résumé

Replace `assets/Mohammad-Zarif-Resume.pdf` and update the matching content in
`index.html` (experience timeline, work cards, research list).
