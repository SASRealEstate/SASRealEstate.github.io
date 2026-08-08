import { buildApartmentGeometry } from '../geometry/buildGeometry.js';
import { createScene } from '../renderer/createScene.js';

const REBUILD_DEBOUNCE_MS = 200;

// Live 3D preview pane for the editor. Reuses the exact Step 1 modules
// (buildApartmentGeometry, createScene) so the editor never duplicates
// geometry logic — whatever the 3D walkthrough page renders, this renders.
export class Preview3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.currentGroup = null;
    this.debounceHandle = null;

    const { scene, camera, renderer, controls } = createScene(canvas, { apartmentWidth: 10, apartmentDepth: 8 });
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
  }

  update(apartmentData) {
    clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => this._rebuild(apartmentData), REBUILD_DEBOUNCE_MS);
  }

  _rebuild(apartmentData) {
    if (this.currentGroup) {
      this.scene.remove(this.currentGroup);
      disposeGroup(this.currentGroup);
    }
    if (apartmentData.walls.length === 0 && apartmentData.rooms.length === 0) {
      this.currentGroup = null;
      return;
    }
    const { group } = buildApartmentGeometry(apartmentData);
    this.scene.add(group);
    this.currentGroup = group;
  }
}

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of materials) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}
