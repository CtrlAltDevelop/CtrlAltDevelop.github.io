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
`index.html` (experience timeline, work cards, open-source packages, education).
Experience is framed as nine years writing software (since 2017), eight professionally (since 2018). Keep that consistent everywhere it appears: the hero fact, the
meta and Open Graph descriptions, the JSON-LD `Person`, and `assets/img/og-cover.png`.

## Page structure

Sections run About, Work, Experience, Open source, Approach, Stack, Education,
Contact. Work and experience come first on purpose, because that is what a hiring
manager reads in the first thirty seconds. Section numbers (`.section__num`) are
hardcoded 01–08, so inserting a section means renumbering everything after it.

Count-up numbers carry their real value in the HTML (`<span class="count"
data-to="8">8</span>`) and are only animated by `main.js`, so reader mode, print, ATS
parsers and link previews never see a zero.

## Open-source packages

The `#open-source` section lists twenty packages — sixteen Dart/Flutter packages on
pub.dev and four Python packages on PyPI (`django-ninja-starter`, `matching-engine`,
`mdp-outbox`, `django-reliable-outbox`) — plus two backend services with no registry
release (`oauth-dpop-server`, `ledger-service`), each mirrored at
`github.com/CtrlAltDevelop/<name>`. The flagship entries (`django-ninja-starter`,
`ohlcv_chart`) and the two services use `.pkg--flagship`, two to a row with feature
bullets. The Python packages follow as `.pkg--mini`; the remaining fifteen Dart
packages sit inside a closed `<details class="more">`, so they stay in the HTML for
search engines but don't lengthen the page. The package tallies are counted from
registry links, so a card with only a GitHub link is not counted as a package.
