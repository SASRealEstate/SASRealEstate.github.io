import { FEATURE_ENABLED, SHOW_DEV_OVERLAY } from './config.js';
import { sampleApartment } from './data/sampleApartment.js';
import { buildApartmentGeometry } from './geometry/buildGeometry.js';
import { CUSTOM_APARTMENT_KEY } from './editor/state.js';

const overlay = document.getElementById('overlay');
const canvas = document.getElementById('scene-canvas');
const lockHint = document.getElementById('lock-hint');
const aerialHint = document.getElementById('aerial-hint');

if (SHOW_DEV_OVERLAY) {
  overlay.hidden = false;
}

if (!FEATURE_ENABLED) {
  canvas.hidden = true;
  document.getElementById('disabled-message').hidden = false;
} else {
  boot();
}

// If opened from the 2D editor's "view full walkthrough" button, load the
// apartment it saved instead of the Step 1 hard-coded fixture.
function loadApartmentData() {
  const useCustom = new URLSearchParams(location.search).get('source') === 'custom';
  if (!useCustom) return sampleApartment;
  try {
    const saved = localStorage.getItem(CUSTOM_APARTMENT_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Fall through to the sample apartment below.
  }
  return sampleApartment;
}

// Starts the player in the corridor if there is one (the room every other
// room in a real apartment connects through), else the first room, else the
// apartment's geometric center as a last resort.
function findStartPosition(apartment) {
  const room = apartment.rooms.find((r) => r.type === 'corridor') ?? apartment.rooms[0];
  if (room) {
    return {
      x: (room.bounds.x[0] + room.bounds.x[1]) / 2,
      z: (room.bounds.z[0] + room.bounds.z[1]) / 2,
    };
  }
  return { x: apartment.dimensions.width / 2, z: apartment.dimensions.depth / 2 };
}

async function boot() {
  const [{ createScene }, { createViewModeController }] = await Promise.all([
    import('./renderer/createScene.js'),
    import('./movement/viewModeController.js'),
  ]);

  const apartment = loadApartmentData();
  const { group, wallColliders } = buildApartmentGeometry(apartment);

  const { scene, camera, renderer } = createScene(canvas, {
    apartmentWidth: apartment.dimensions.width,
    apartmentDepth: apartment.dimensions.depth,
    controls: 'none',
  });

  scene.add(group);

  function updateHints() {
    if (movement.mode === 'aerial') {
      lockHint.hidden = true;
      aerialHint.hidden = false;
    } else {
      aerialHint.hidden = true;
      lockHint.hidden = movement.isLocked;
    }
  }

  const movement = createViewModeController({
    camera,
    renderer,
    wallColliders,
    startPosition: findStartPosition(apartment),
    apartmentSize: { width: apartment.dimensions.width, depth: apartment.dimensions.depth },
    onLockChange: updateHints,
    onModeChange: updateHints,
  });
  updateHints();

  let lastTime = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1); // clamp to avoid a huge jump after a tab was backgrounded
    lastTime = now;
    movement.update(dt);
    renderer.render(scene, camera);
  });

  // Exposed for manual inspection in the dev console — this page doubles as
  // the developer/test interface for Step 1/2 work.
  window.__floorplan3d = { apartment, wallColliders, scene, camera, renderer, movement };
}
