import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Sets up the base THREE.js scene: renderer, camera, lighting, ground and
// a resize handler.
//
// `controls` picks the camera scheme:
//  - 'orbit' (default) — inspection camera used by the 2D editor's live
//    preview, where there's no pointer-lock/walking, just "look at the model".
//  - 'none' — caller (the walkthrough page) wires up its own first-person
//    controls from movement/firstPersonControls.js instead.
export function createScene(canvas, { apartmentWidth, apartmentDepth, controls: controlsMode = 'orbit' }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f1ea);

  const camera = new THREE.PerspectiveCamera(
    55,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    100
  );
  const center = new THREE.Vector3(apartmentWidth / 2, 0, apartmentDepth / 2);
  camera.position.set(center.x - apartmentWidth * 0.6, apartmentWidth * 0.55, center.z + apartmentDepth * 0.8);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  resizeToContainer();

  let controls = null;
  if (controlsMode === 'orbit') {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 2;
    controls.maxDistance = Math.max(apartmentWidth, apartmentDepth) * 2;
    controls.update();
  }

  const ambientLight = new THREE.HemisphereLight(0xffffff, 0xcfc7ad, 0.75);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
  directionalLight.position.set(center.x + 6, 10, center.z - 4);
  directionalLight.target.position.copy(center);
  scene.add(directionalLight, directionalLight.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(apartmentWidth * 4, apartmentDepth * 4),
    new THREE.MeshStandardMaterial({ color: 0xb8b39a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.02, center.z);
  scene.add(ground);

  function resizeToContainer() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', resizeToContainer);

  return { scene, camera, renderer, controls, resizeToContainer };
}
