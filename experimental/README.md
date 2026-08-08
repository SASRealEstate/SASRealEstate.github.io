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
- The 2D editor lives at `experimental/floorplan3d/editor/` (also linked from
  the walkthrough page's dev overlay). It's the fastest way to build/try an
  apartment without hand-editing JS.

To fully disable rendering (leaving only a placeholder message) without
removing the files, set `FEATURE_ENABLED = false` in
[`floorplan3d/config.js`](floorplan3d/config.js).

## Current state — Steps 1, 2 & 5 of the roadmap

- [x] **Step 1** — hard-coded structured apartment data → static 3D scene
      (floors, walls with real door/window openings, basic lighting/materials).
- [x] **Step 2** — first-person WASD + mouse-look movement, wall collision
      (`movement/firstPersonControls.js`). Replaces the orbit camera on the
      main walkthrough page (the editor's live-preview pane keeps orbit —
      see "Two camera schemes" below).
- [ ] **Step 3** — visual polish pass (materials, lighting, door/window detail).
- [x] **Step 4** — structured data format (see `data/` below), reused as-is
      by the Step 5 editor's export format.
- [x] **Step 5** — visual 2D editor (`editor/`): trace walls/rooms/doors/
      windows over an optional background sketch image, with a live 3D
      preview and JSON export/import. Supersedes hand-editing JS for
      authoring an apartment.
- [ ] **Step 6** — floor-plan image analysis (automatic wall/room/door/window
      detection). The editor's background-image + manual trace is the
      human-assisted stand-in for this until real detection exists.
- [ ] **Step 7** — wire image analysis output into the Step 1–3 renderer
      (should be a drop-in replacement for the editor's output, same schema).

### Walking in the 3D scene (Step 2)

Click anywhere in the scene to request pointer lock, then:
- **W A S D** (or arrow keys) — move, relative to where you're looking
- **Mouse** — look around
- **Esc** — release the mouse

Movement is resolved per-axis (X, then Z) against `wallColliders` — the flat
list of wall segments-with-thickness that `buildApartmentGeometry()` has
computed since Step 1 — so bumping into a wall at an angle slides you along
it instead of hard-stopping. The player is treated as a 0.3m-radius point at
1.6m eye height; there's no visible avatar mesh, since the camera *is* the
player (standard for a first-person walkthrough — see
`movement/firstPersonControls.js`). The starting position is the apartment's
corridor room if it has one (falls back to the first room, then the
apartment's center).

**Two camera schemes, by design:** the main walkthrough page now uses
first-person controls; the 2D editor's live-preview pane still uses
`OrbitControls` (`renderer/createScene.js` takes a `controls: 'orbit'|'none'`
option — the editor doesn't pass it, so it defaults to orbit). Pointer-lock
walking doesn't make sense in a small preview pane you're not actively
navigating — orbit-to-inspect is the right tool there.

### The 2D editor (`editor/`)

Split-screen page: a 2D canvas on the left/center for tracing, a live 3D
preview on the right that rebuilds (debounced) on every change — both sides
run on the exact same `buildApartmentGeometry`/`createScene` modules as the
main walkthrough page, so there's no separate rendering path to keep in sync.

- **Wall tool** — click to place points; each click continues the chain from
  the last point. Snaps to a 0.1m grid, to 90° angles, and to nearby existing
  wall endpoints (so walls stay connected). Escape ends the current chain.
- **Room tool** — drag a rectangle, then name it and pick a type (bedroom/
  bathroom/kitchen/corridor/living/other) — this name is what shows up as a
  label floating in the 3D scene.
- **Door / Window tools** — click near an existing wall to add an opening
  there; a small form asks for width (and sill/height for windows).
- **Select tool** — click any wall/room/door/window; the panel below the
  toolbar shows what's selected (room selections show the room's name) with
  a dedicated **"حذف العنصر المحدد" (delete selected)** button — separate
  from Undo and Clear All. The Delete/Backspace key does the same thing.
  Wall deletion also removes doors/windows attached to it.
- **Pan with WASD** — as an alternative to Shift/middle-drag, holding W/A/S/D
  pans the 2D view continuously (independent of the drawing tools' own
  keyboard handling — arrow keys aren't used for 2D pan, only mouse-look
  movement in the 3D scene).
- **Scale bar** — bottom-left corner of the canvas; a labeled ruler (e.g.
  "2 م") that stays accurate as you zoom, on top of the grid already being
  1m per square (bold every 5m).
- **Background sketch image** — upload a photo/scan of an actual كروكي,
  adjust its opacity, and trace directly over it. **Calibrate scale** lets
  you click two points whose real-world distance you know (e.g. a dimension
  written on the sketch) and enter that distance in meters — this is the
  "use the drawing's dimensions when available" requirement from the spec,
  done manually rather than pretending to auto-read handwritten numbers.
- **Export/Import JSON** — download the current apartment as a `.json` file
  matching the `data/sampleApartment.js` schema exactly, or load one back in
  to keep editing. Good for saving a layout as a new fixture under `data/`.
- **"Open full 3D walkthrough"** — saves the current apartment to
  `localStorage` and opens `../index.html?source=custom`, which loads it
  instead of the built-in sample (falls back to the sample apartment if
  no custom data or no `?source=custom` param is present).
- Work-in-progress auto-saves to `localStorage` on every change, so a
  refresh doesn't lose it (separate from the explicit "open walkthrough"
  save — see `editor/state.js` for the two distinct storage keys).

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
                         flat `wallColliders` list consumed directly by
                         movement/firstPersonControls.js (no need to
                         re-derive walls from meshes)
  renderer/
    createScene.js      Scene/camera/lights/renderer setup + resize handling.
                         `controls: 'orbit'` (default, used by the editor's
                         preview) or `'none'` (main walkthrough page, which
                         wires up movement/firstPersonControls.js instead).
  utils/
    canvasLabel.js       Small canvas-texture text sprite helper (room labels)
    geometry.js           Point/segment math shared by the editor and movement/
  movement/
    firstPersonControls.js  WASD + mouse-look + wall collision (Step 2)
  editor/
    index.html            Split-screen 2D editor + live 3D preview
    style.css
    state.js               FloorPlanState: data model, undo, localStorage
    canvas2d.js             2D canvas rendering + all drawing tools + WASD pan
    popover.js               Small floating form (room name, door width, ...)
    preview3d.js              Live 3D pane — reuses buildGeometry/createScene
    main.js                    Wires the toolbar UI to the pieces above
```

One folder is intentionally not created yet, to avoid empty scaffolding:

- `floorplan/` — image ingestion/analysis pipeline (Step 6). Should produce
  data matching the shape in `data/sampleApartment.js`, so it becomes a drop-in
  alternative to the hard-coded fixture — nothing downstream should need to
  change when Step 6 lands.

## Known simplifications (by design)

- Doors are full-height openings (no frame/header geometry).
- Windows are visual-only openings (sill/header wall segments + a semi-
  transparent pane) — not yet part of `wallColliders` distinctly from the
  wall they sit in, so collision treats a window opening as solid wall.
- The apartment in `data/sampleApartment.js` is entirely hand-written; no
  automatic image analysis exists yet (the editor's manual trace-over-image
  workflow is the stand-in — see Step 6 above).
- Movement collision is a simple circle-vs-segment check per axis (no
  capsule/physics engine) — correct and slide-along-walls-friendly for a
  single-floor apartment, not built for anything more complex.
- No vertical movement (jumping/crouching) or multi-floor support.
- Pointer Lock requires a real, un-sandboxed browser tab and a genuine user
  click — it will not activate inside most embedded/automated browser
  previews (including the one used to test this during development).

## Dependencies

Three.js is loaded from a CDN (`unpkg.com`) via an import map in
`index.html` — no addition to `package.json` (this repo has none) and no
impact on the existing site's load time, since nothing outside this folder
references it.
