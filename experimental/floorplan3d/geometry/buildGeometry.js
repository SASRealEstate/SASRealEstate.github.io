import * as THREE from 'three';
import { createTextSprite } from '../utils/canvasLabel.js';

// Converts the structured apartment data (see data/sampleApartment.js) into
// a THREE.Group of meshes, ready to be added to a scene.
//
// Also returns `wallColliders`: a flat list of 2D wall segments with
// thickness, independent of the meshes. Step 2 (movement/collision) can
// consume this list directly instead of re-deriving it from geometry.

const ROOM_FLOOR_COLORS = {
  bedroom: 0xe8ddc7,
  bathroom: 0xcfe3ec,
  kitchen: 0xf1e6b8,
  corridor: 0xd8d5c8,
  living: 0xd9e8d3,
};

const WALL_COLOR = 0xf5f2e9;
const GLASS_COLOR = 0x9fd3e8;

export function buildApartmentGeometry(apartment) {
  const { dimensions, rooms, walls, doors = [], windows = [] } = apartment;
  const wallHeight = dimensions.wallHeight;
  const wallThickness = dimensions.wallThickness ?? 0.15;

  const group = new THREE.Group();
  group.name = 'apartment';

  const floorGroup = new THREE.Group();
  floorGroup.name = 'floors';
  const wallGroup = new THREE.Group();
  wallGroup.name = 'walls';
  const labelGroup = new THREE.Group();
  labelGroup.name = 'labels';

  const doorsByWall = groupByWallId(doors);
  const windowsByWall = groupByWallId(windows);
  const wallColliders = [];

  for (const room of rooms) {
    floorGroup.add(buildRoomFloor(room));
    const label = createTextSprite(room.name);
    label.position.set(
      (room.bounds.x[0] + room.bounds.x[1]) / 2,
      1.6,
      (room.bounds.z[0] + room.bounds.z[1]) / 2
    );
    labelGroup.add(label);
  }

  for (const wall of walls) {
    const segments = buildWallSegments(wall, {
      wallHeight: wall.height ?? wallHeight,
      wallThickness: wall.thickness ?? wallThickness,
      doors: doorsByWall.get(wall.id) ?? [],
      windows: windowsByWall.get(wall.id) ?? [],
    });
    for (const mesh of segments) wallGroup.add(mesh);

    wallColliders.push(...buildWallColliders(wall, wallThickness, doorsByWall.get(wall.id) ?? []));
  }

  group.add(floorGroup, wallGroup, labelGroup);

  return { group, wallColliders };
}

function groupByWallId(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.wallId)) map.set(item.wallId, []);
    map.get(item.wallId).push(item);
  }
  return map;
}

function buildRoomFloor(room) {
  const { x, z } = room.bounds;
  const width = x[1] - x[0];
  const depth = z[1] - z[0];

  const geometry = new THREE.PlaneGeometry(width, depth);
  const material = new THREE.MeshStandardMaterial({
    color: ROOM_FLOOR_COLORS[room.type] ?? 0xdddddd,
    roughness: 0.9,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x[0] + x[1]) / 2, 0, (z[0] + z[1]) / 2);
  mesh.receiveShadow = false;
  mesh.name = `floor_${room.id}`;
  return mesh;
}

// Wall direction/orientation helpers.
// Rotating a box around Y by atan2(-dz, dx) aligns its local X axis (length)
// with the wall's (dx, dz) direction in world space.
function wallFrame(wall) {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const rotationY = Math.atan2(-dz, dx);
  return { length, ux, uz, rotationY };
}

function pointAlongWall(wall, ux, uz, distance) {
  return {
    x: wall.start.x + ux * distance,
    z: wall.start.z + uz * distance,
  };
}

// Builds the visible mesh segments for one wall, cutting full-height gaps
// for doors and partial-height (sill/header) gaps for windows.
function buildWallSegments(wall, { wallHeight, wallThickness, doors, windows }) {
  const { length, ux, uz, rotationY } = wallFrame(wall);
  const meshes = [];
  const material = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.95 });

  const addBox = (from, to, yFrom, yTo, name) => {
    const segLength = to - from;
    if (segLength <= 0.001) return;
    const box = new THREE.BoxGeometry(segLength, yTo - yFrom, wallThickness);
    const mesh = new THREE.Mesh(box, material);
    const mid = pointAlongWall(wall, ux, uz, (from + to) / 2);
    mesh.position.set(mid.x, (yFrom + yTo) / 2, mid.z);
    mesh.rotation.y = rotationY;
    mesh.name = name;
    meshes.push(mesh);
  };

  // Openings sorted by position so the wall can be walked left-to-right
  // and split into solid segments between them.
  const openings = [
    ...doors.map((d) => ({ ...d, kind: 'door' })),
    ...windows.map((w) => ({ ...w, kind: 'window' })),
  ].sort((a, b) => a.offset - b.offset);

  let cursor = 0;
  for (const opening of openings) {
    const start = Math.max(0, opening.offset);
    const end = Math.min(length, opening.offset + opening.width);

    addBox(cursor, start, 0, wallHeight, `${wall.id}_solid`);

    if (opening.kind === 'door') {
      // Full-height opening: nothing to add.
    } else {
      const sill = opening.sill ?? 0.9;
      const header = sill + (opening.height ?? 1.2);
      addBox(start, end, 0, sill, `${wall.id}_sill`);
      addBox(start, end, header, wallHeight, `${wall.id}_header`);

      const glassGeometry = new THREE.PlaneGeometry(end - start, (opening.height ?? 1.2) * 0.95);
      const glassMaterial = new THREE.MeshStandardMaterial({
        color: GLASS_COLOR,
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
      const glass = new THREE.Mesh(glassGeometry, glassMaterial);
      const mid = pointAlongWall(wall, ux, uz, (start + end) / 2);
      glass.position.set(mid.x, sill + (opening.height ?? 1.2) / 2, mid.z);
      glass.rotation.y = rotationY;
      glass.name = `${wall.id}_glass`;
      meshes.push(glass);
    }

    cursor = end;
  }
  addBox(cursor, length, 0, wallHeight, `${wall.id}_solid`);

  return meshes;
}

// Produces 2D collider segments for a wall, split around door openings
// (doors are passable, so no collider covers a door gap). Windows stay
// solid at collision level for Step 1/2 since walking through a window-
// height gap isn't a real use case here.
function buildWallColliders(wall, wallThickness, doors) {
  const { length, ux, uz } = wallFrame(wall);
  const sortedDoors = [...doors].sort((a, b) => a.offset - b.offset);
  const colliders = [];

  let cursor = 0;
  for (const door of sortedDoors) {
    const start = Math.max(0, door.offset);
    const end = Math.min(length, door.offset + door.width);
    pushCollider(cursor, start);
    cursor = end;
  }
  pushCollider(cursor, length);

  function pushCollider(from, to) {
    if (to - from <= 0.001) return;
    colliders.push({
      start: pointAlongWall(wall, ux, uz, from),
      end: pointAlongWall(wall, ux, uz, to),
      thickness: wallThickness,
    });
  }

  return colliders;
}
