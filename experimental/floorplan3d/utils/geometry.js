// Small 2D geometry helpers shared across the feature (the editor's drawing
// tools and the walkthrough's wall-collision code). All coordinates here are
// in world meters (X = east, Z = south), matching data/sampleApartment.js.

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function snap(value, gridSize) {
  return Math.round(value / gridSize) * gridSize;
}

// Closest point on segment [a,b] to point p, plus how far along the segment
// that point is (t in [0,1]) and the distance from p to that point.
export function projectPointOntoSegment(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lengthSq = abx * abx + abz * abz;
  let t = lengthSq === 0 ? 0 : ((p.x - a.x) * abx + (p.z - a.z) * abz) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + abx * t, z: a.z + abz * t };
  return { t, point, distance: distance(p, point) };
}

// Finds the wall whose segment is closest to `point`, within `maxDistance`
// meters. Returns null if nothing is close enough. Used by the door/window
// tools to figure out which wall was clicked and at what offset.
export function findNearestWall(walls, point, maxDistance) {
  let best = null;
  for (const wall of walls) {
    const projection = projectPointOntoSegment(point, wall.start, wall.end);
    if (projection.distance > maxDistance) continue;
    if (!best || projection.distance < best.distance) {
      const wallLength = distance(wall.start, wall.end);
      best = {
        wall,
        distance: projection.distance,
        offset: projection.t * wallLength,
        point: projection.point,
      };
    }
  }
  return best;
}

// Finds an existing wall endpoint near `point`, within `maxDistance` meters,
// so new wall segments can snap onto it and stay connected.
export function findNearestEndpoint(walls, point, maxDistance) {
  let best = null;
  for (const wall of walls) {
    for (const endpoint of [wall.start, wall.end]) {
      const d = distance(point, endpoint);
      if (d <= maxDistance && (!best || d < best.distance)) {
        best = { point: endpoint, distance: d };
      }
    }
  }
  return best;
}
