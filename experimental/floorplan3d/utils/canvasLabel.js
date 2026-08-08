import * as THREE from 'three';

// Builds a small billboard sprite with text rendered onto a canvas texture.
// Used to label rooms in the generated 3D scene so the hard-coded/generated
// data can be visually cross-checked against the source floor plan.
export function createTextSprite(text, { fontSize = 48, color = '#26290f' } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const padding = 16;

  ctx.direction = 'rtl';
  ctx.font = `600 ${fontSize}px sans-serif`;
  const textWidth = ctx.measureText(text).width;

  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding * 2;

  // Canvas size changes reset the 2D context state, so direction/font/etc.
  // must be re-applied after resizing.
  ctx.direction = 'rtl';
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText(text, canvas.width - padding, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
  const sprite = new THREE.Sprite(material);

  const scale = 0.012;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);

  return sprite;
}
