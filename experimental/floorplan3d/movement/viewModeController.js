import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFirstPersonControls, PLAYER_HEIGHT } from './firstPersonControls.js';

// Toggles the camera (Space bar) between:
//  - 'ground'  first-person WASD + mouse-look + wall collision
//  - 'aerial'  bird's-eye OrbitControls, for scouting the whole apartment
//
// Landing back on the ground drops the player at wherever the aerial camera
// was looking (its orbit target), not back at the exact spot they left —
// that makes aerial view useful for actually getting around a big apartment,
// not just sightseeing. Only the horizontal facing (yaw) carries over between
// modes; pitch resets to level so the player doesn't land staring at a wall
// or the ceiling.
export function createViewModeController({ camera, renderer, wallColliders, startPosition, apartmentSize, onModeChange, onLockChange }) {
  const center = new THREE.Vector3(apartmentSize.width / 2, 0, apartmentSize.depth / 2);
  const ground = createFirstPersonControls({
    camera,
    domElement: renderer.domElement,
    wallColliders,
    startPosition,
    onLockChange,
  });

  let mode = 'ground';
  let aerialControls = null;
  const lastYaw = new THREE.Euler(0, 0, 0, 'YXZ');

  function enterAerial() {
    lastYaw.setFromQuaternion(camera.quaternion);
    if (ground.isLocked) document.exitPointerLock();
    ground.setLockOnClickEnabled(false);

    const height = Math.max(apartmentSize.width, apartmentSize.depth) * 0.9;
    // Slightly off-vertical on purpose: a camera placed exactly above the
    // target is a degenerate case for OrbitControls' spherical coordinates
    // (the azimuthal angle is ambiguous when x and z offsets are both zero),
    // which makes orbit-dragging unreliable right after entering aerial mode.
    // A small tilt also just reads better than a flat top-down view.
    camera.position.set(center.x - apartmentSize.width * 0.15, height, center.z + apartmentSize.depth * 0.15);
    camera.up.set(0, 1, 0);
    camera.lookAt(center);

    aerialControls = new OrbitControls(camera, renderer.domElement);
    aerialControls.target.copy(center);
    aerialControls.enableDamping = true;
    aerialControls.minDistance = 2;
    aerialControls.maxDistance = height * 2;
    aerialControls.maxPolarAngle = Math.PI / 2 - 0.05; // stay above the horizon — a bird's-eye view, not a ground-level peek
    aerialControls.update();
  }

  function exitAerial() {
    const landX = THREE.MathUtils.clamp(aerialControls.target.x, 0, apartmentSize.width);
    const landZ = THREE.MathUtils.clamp(aerialControls.target.z, 0, apartmentSize.depth);
    aerialControls.dispose();
    aerialControls = null;

    camera.position.set(landX, PLAYER_HEIGHT, landZ);
    camera.quaternion.setFromEuler(new THREE.Euler(0, lastYaw.y, 0, 'YXZ'));
    ground.setLockOnClickEnabled(true);
  }

  function toggleMode() {
    mode = mode === 'ground' ? 'aerial' : 'ground';
    if (mode === 'aerial') enterAerial();
    else exitAerial();
    onModeChange?.(mode);
  }

  function onKeyDown(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      toggleMode();
    }
  }
  document.addEventListener('keydown', onKeyDown);

  function update(dt) {
    if (mode === 'ground') ground.update(dt);
    else aerialControls?.update();
  }

  function dispose() {
    document.removeEventListener('keydown', onKeyDown);
    aerialControls?.dispose();
    ground.dispose();
  }

  return { update, toggleMode, dispose, get mode() { return mode; }, get isLocked() { return ground.isLocked; } };
}
