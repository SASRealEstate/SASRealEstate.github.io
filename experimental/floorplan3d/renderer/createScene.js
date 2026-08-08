import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Sets up the base THREE.js scene: renderer, camera, lighting, ground and
// a resize handler. Movement in Step 1 is an orbiting inspection camera —
// it exists only so the generated model can be viewed, and is expected to
// be replaced by first-person walking controls in Step 2 (see the
// movement/ folder placeholder described in experimental/README.md).
export function createScene(canvas, { apartmentWidth, apartmentDepth }) {
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

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 2;
  controls.maxDistance = Math.max(apartmentWidth, apartmentDepth) * 2;
  controls.update();

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
