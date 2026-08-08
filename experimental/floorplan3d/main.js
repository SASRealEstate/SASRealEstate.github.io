import { FEATURE_ENABLED, SHOW_DEV_OVERLAY } from './config.js';
import { sampleApartment } from './data/sampleApartment.js';
import { buildApartmentGeometry } from './geometry/buildGeometry.js';

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

async function boot() {
  const [{ createScene }] = await Promise.all([import('./renderer/createScene.js')]);

  const { group, wallColliders } = buildApartmentGeometry(sampleApartment);

  const { scene, camera, renderer, controls } = createScene(canvas, {
    apartmentWidth: sampleApartment.dimensions.width,
    apartmentDepth: sampleApartment.dimensions.depth,
  });

  scene.add(group);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  // Exposed for manual inspection in the dev console — this page doubles as
  // the developer/test interface for Step 1/2 work.
  window.__floorplan3d = { apartment: sampleApartment, wallColliders, scene, camera, renderer, controls };
}
