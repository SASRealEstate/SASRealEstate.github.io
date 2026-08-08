# Experimental: 3D Floor Plan Walkthrough

Status: **hidden, unfinished, isolated from the main site.** Nothing in the
existing pages (`index.html`, `Rent.html`, nav, etc.) links here, and nothing
here is imported by the main site.

## What this is

A lightweight browser-based 3D viewer (Three.js via CDN, no bundler, no
backend) that turns a structured description of an apartment — rooms, walls,
doors, windows, dimensions — into an explorable 3D scene. Long-term goal:
let a user upload a 2D floor plan / كروكي image and get a walkthrough of it.
Short-term (this commit): render a hand-written apartment layout in 3D.

## How to open it

Not linked anywhere on purpose. To view it:

- Locally: serve the repo root with any static file server and open
  `experimental/floorplan3d/index.html` (needs `http://`, not `file://`,
  because it uses ES module imports).
- After deploy: visit `https://<site>/experimental/floorplan3d/` directly.
  It won't appear in navigation, search, or sitemaps (`robots: noindex`).

To fully disable rendering (leaving only a placeholder message) without
removing the files, set `FEATURE_ENABLED = false` in
[`floorplan3d/config.js`](floorplan3d/config.js).

## Current state — Step 1 of the roadmap

- [x] **Step 1** — hard-coded structured apartment data → static 3D scene
      (floors, walls with real door/window openings, basic lighting/materials,
      orbit camera for inspection).
- [ ] **Step 2** — first-person WASD + mouse-look movement, wall collision.
- [ ] **Step 3** — visual polish pass (materials, lighting, door/window detail).
- [ ] **Step 4** — already done as part of Step 1 (see `data/` format below);
      revisit once Step 6/7 need format changes.
- [ ] **Step 5** — developer UI to hand-author rooms/walls without editing JS.
- [ ] **Step 6** — floor-plan image analysis (wall/room/door/window detection).
- [ ] **Step 7** — wire image analysis output into the Step 1–3 renderer.

## Code layout

```
experimental/floorplan3d/
  index.html          Hidden entry page (not linked from the site)
  style.css            Page-scoped styles
  config.js             Feature flag(s)
  main.js               Wires data -> geometry -> renderer together
  data/
    sampleApartment.js  Hard-coded structured apartment (Step 1 fixture;
                         this is the shape a future image analyzer must produce)
  geometry/
    buildGeometry.js    Structured data -> THREE.Group of meshes, plus a
                         flat `wallColliders` list for Step 2 to consume
                         directly (no need to re-derive walls from meshes)
  renderer/
    createScene.js      Scene/camera/lights/renderer setup + resize handling.
                         Currently uses OrbitControls as a stand-in "camera"
                         so the model can be inspected — this is expected to
                         be replaced by first-person movement in Step 2, not
                         extended.
  utils/
    canvasLabel.js       Small canvas-texture text sprite helper (room labels)
```

Two folders are intentionally not created yet, to avoid empty scaffolding:

- `movement/` — first-person controls + collision resolution (Step 2). Should
  read `wallColliders` from `buildApartmentGeometry()` rather than duplicating
  wall math.
- `floorplan/` — image ingestion/analysis pipeline (Step 6). Should produce
  data matching the shape in `data/sampleApartment.js`, so it becomes a drop-in
  alternative to the hard-coded fixture — nothing downstream should need to
  change when Step 6 lands.

## Known simplifications (by design, for Step 1)

- Doors are full-height openings (no frame/header geometry).
- Windows are visual-only openings (sill/header wall segments + a semi-
  transparent pane) — not yet part of `wallColliders` distinctly from the
  wall they sit in.
- The apartment in `data/sampleApartment.js` is entirely hand-written; no
  image analysis exists yet.
- Camera is orbit/inspection only — there is no walking, and no collision is
  applied yet (`wallColliders` is computed and exposed, but unused).

## Dependencies

Three.js is loaded from a CDN (`unpkg.com`) via an import map in
`index.html` — no addition to `package.json` (this repo has none) and no
impact on the existing site's load time, since nothing outside this folder
references it.
