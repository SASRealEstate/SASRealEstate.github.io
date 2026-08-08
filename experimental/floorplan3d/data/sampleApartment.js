// Hard-coded structured apartment data — Step 1 of the 3D floor-plan feature.
//
// This is the target shape that a future floor-plan image analyzer (Step 6/7)
// will need to produce. Keeping it hand-written for now lets the renderer,
// geometry builder and (later) movement/collision code be built and tested
// against a known-good input before any image recognition exists.
//
// Coordinate system: X = east, Z = south, Y = up. Units are meters.
// Layout (matches the reference sketch used to design this apartment):
//
//   ┌───────────────┬──────────────┐
//   │               │              │
//   │   Bedroom 1   │   Bedroom 2  │
//   │               │              │
//   ├───────┬───────┴───────┬──────┤
//   │       │               │      │
//   │ Bath  │   Corridor    │Living│
//   │       │               │      │
//   ├───────┤               │      │
//   │       │               │      │
//   │Kitchen│               │      │
//   └───────┴───────────────┴──────┘

export const sampleApartment = {
  dimensions: {
    width: 10,
    depth: 8,
    wallHeight: 2.7,
    wallThickness: 0.15,
    unit: 'm',
  },

  rooms: [
    { id: 'bedroom1', name: 'غرفة نوم 1', type: 'bedroom', bounds: { x: [0, 5], z: [0, 3.5] } },
    { id: 'bedroom2', name: 'غرفة نوم 2', type: 'bedroom', bounds: { x: [5, 10], z: [0, 3.5] } },
    { id: 'bath', name: 'حمام', type: 'bathroom', bounds: { x: [0, 3], z: [3.5, 5.75] } },
    { id: 'kitchen', name: 'مطبخ', type: 'kitchen', bounds: { x: [0, 3], z: [5.75, 8] } },
    { id: 'corridor', name: 'ممر', type: 'corridor', bounds: { x: [3, 7.5], z: [3.5, 8] } },
    { id: 'living', name: 'غرفة المعيشة', type: 'living', bounds: { x: [7.5, 10], z: [3.5, 8] } },
  ],

  // Every wall is a straight segment from start to end. `id` is referenced
  // by doors/windows below so an opening always knows which wall it cuts into.
  walls: [
    { id: 'ext_north', start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
    { id: 'ext_east', start: { x: 10, z: 0 }, end: { x: 10, z: 8 } },
    { id: 'ext_south', start: { x: 0, z: 8 }, end: { x: 10, z: 8 } },
    { id: 'ext_west', start: { x: 0, z: 0 }, end: { x: 0, z: 8 } },

    { id: 'int_bedroom_divider', start: { x: 5, z: 0 }, end: { x: 5, z: 3.5 } },
    { id: 'int_row_divider', start: { x: 0, z: 3.5 }, end: { x: 10, z: 3.5 } },
    { id: 'int_bath_corridor', start: { x: 3, z: 3.5 }, end: { x: 3, z: 5.75 } },
    { id: 'int_kitchen_corridor', start: { x: 3, z: 5.75 }, end: { x: 3, z: 8 } },
    { id: 'int_bath_kitchen', start: { x: 0, z: 5.75 }, end: { x: 3, z: 5.75 } },
    { id: 'int_corridor_living', start: { x: 7.5, z: 3.5 }, end: { x: 7.5, z: 8 } },
  ],

  // `offset` is measured in meters from the wall's `start` point along its
  // direction. Doors are treated as full-height openings (floor to ceiling)
  // for Step 1 — no frame/header geometry yet.
  doors: [
    { id: 'd_entrance', wallId: 'ext_south', offset: 5.2, width: 1.0 },
    { id: 'd_bed1_corridor', wallId: 'int_row_divider', offset: 3.3, width: 0.9 },
    { id: 'd_bed2_corridor', wallId: 'int_row_divider', offset: 5.8, width: 0.9 },
    { id: 'd_bath_corridor', wallId: 'int_bath_corridor', offset: 0.3, width: 0.9 },
    { id: 'd_kitchen_corridor', wallId: 'int_kitchen_corridor', offset: 0.5, width: 0.9 },
    { id: 'd_bath_kitchen', wallId: 'int_bath_kitchen', offset: 0.5, width: 0.8 },
    { id: 'd_corridor_living', wallId: 'int_corridor_living', offset: 1.6, width: 1.0 },
  ],

  // Windows sit on exterior walls only. `sill` is the height from the floor
  // to the bottom of the opening; `height` is the opening's own height.
  windows: [
    { id: 'w_bed1', wallId: 'ext_north', offset: 2.0, width: 1.5, sill: 0.9, height: 1.3 },
    { id: 'w_bed2', wallId: 'ext_north', offset: 6.5, width: 1.5, sill: 0.9, height: 1.3 },
    { id: 'w_living', wallId: 'ext_east', offset: 5.5, width: 1.8, sill: 0.8, height: 1.4 },
    { id: 'w_kitchen', wallId: 'ext_west', offset: 6.5, width: 1.0, sill: 1.1, height: 1.0 },
  ],
};
