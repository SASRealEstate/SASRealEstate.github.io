import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { projectPointOntoSegment } from '../utils/geometry.js';

export const PLAYER_HEIGHT = 1.6; // eye level, meters
const PLAYER_RADIUS = 0.3; // collision radius, meters
const MOVE_SPEED = 3.2; // meters/second

const KEY_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

// First-person WASD + mouse-look movement with wall collision, consuming the
// `wallColliders` list that buildApartmentGeometry() already computes (it's
// been sitting unused since Step 1 specifically for this). Movement is
// resolved per-axis (try X, then Z) against the wall segments, which gives a
// natural "slide along the wall" feel instead of hard-stopping at contact.
export function createFirstPersonControls({ camera, domElement, wallColliders, startPosition, onLockChange }) {
  const controls = new PointerLockControls(camera, domElement);
  camera.position.set(startPosition.x, PLAYER_HEIGHT, startPosition.z);

  const keyState = { forward: false, backward: false, left: false, right: false };
  let lockOnClickEnabled = true;

  function onKeyDown(e) {
    const key = KEY_MAP[e.code];
    if (key) keyState[key] = true;
  }
  function onKeyUp(e) {
    const key = KEY_MAP[e.code];
    if (key) keyState[key] = false;
  }
  function onClick() {
    if (lockOnClickEnabled) controls.lock();
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  domElement.addEventListener('click', onClick);
  controls.addEventListener('lock', () => onLockChange?.(true));
  controls.addEventListener('unlock', () => onLockChange?.(false));

  const forwardVec = new THREE.Vector3();
  const rightVec = new THREE.Vector3();

  // Same horizontal-only forward/right derivation PointerLockControls uses
  // internally for moveForward/moveRight — computed here instead of calling
  // those directly so collision can be checked before the position commits.
  function computeHorizontalVectors() {
    rightVec.setFromMatrixColumn(camera.matrix, 0);
    forwardVec.crossVectors(camera.up, rightVec);
  }

  function collidesAt(x, z) {
    for (const wall of wallColliders) {
      const projection = projectPointOntoSegment({ x, z }, wall.start, wall.end);
      if (projection.distance < PLAYER_RADIUS + wall.thickness / 2) return true;
    }
    return false;
  }

  function moveWithCollision(dx, dz) {
    const pos = camera.position;
    if (dx !== 0) {
      const nextX = pos.x + dx;
      if (!collidesAt(nextX, pos.z)) pos.x = nextX;
    }
    if (dz !== 0) {
      const nextZ = pos.z + dz;
      if (!collidesAt(pos.x, nextZ)) pos.z = nextZ;
    }
  }

  function update(dt) {
    if (!controls.isLocked) return;
    if (!keyState.forward && !keyState.backward && !keyState.left && !keyState.right) return;

    computeHorizontalVectors();
    const step = MOVE_SPEED * dt;
    let dx = 0;
    let dz = 0;
    if (keyState.forward) { dx += forwardVec.x * step; dz += forwardVec.z * step; }
    if (keyState.backward) { dx -= forwardVec.x * step; dz -= forwardVec.z * step; }
    if (keyState.right) { dx += rightVec.x * step; dz += rightVec.z * step; }
    if (keyState.left) { dx -= rightVec.x * step; dz -= rightVec.z * step; }

    // Cap diagonal movement (forward+strafe) to the same speed as a single direction.
    const length = Math.hypot(dx, dz);
    if (length > step) {
      dx = (dx / length) * step;
      dz = (dz / length) * step;
    }

    moveWithCollision(dx, dz);
  }

  function dispose() {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    domElement.removeEventListener('click', onClick);
    controls.dispose();
  }

  return {
    controls,
    update,
    requestLock: () => controls.lock(),
    setLockOnClickEnabled: (enabled) => { lockOnClickEnabled = enabled; },
    dispose,
    get isLocked() { return controls.isLocked; },
  };
}
