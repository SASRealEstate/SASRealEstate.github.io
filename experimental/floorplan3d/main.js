import { FEATURE_ENABLED, SHOW_DEV_OVERLAY } from './config.js';
import { sampleApartment } from './data/sampleApartment.js';
import { buildApartmentGeometry } from './geometry/buildGeometry.js';
import { CUSTOM_APARTMENT_KEY } from './editor/state.js';

const overlay = document.getElementById('overlay');
const canvas = document.getElementById('scene-canvas');

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

async function boot() {
  const [{ createScene }] = await Promise.all([import('./renderer/createScene.js')]);

  const apartment = loadApartmentData();
  const { group, wallColliders } = buildApartmentGeometry(apartment);

  const { scene, camera, renderer, controls } = createScene(canvas, {
    apartmentWidth: apartment.dimensions.width,
    apartmentDepth: apartment.dimensions.depth,
  });

  scene.add(group);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  // Exposed for manual inspection in the dev console — this page doubles as
  // the developer/test interface for Step 1/2 work.
  window.__floorplan3d = { apartment, wallColliders, scene, camera, renderer, controls };
}
