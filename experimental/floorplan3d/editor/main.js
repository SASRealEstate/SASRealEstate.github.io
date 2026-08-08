import { FloorPlanState } from './state.js';
import { CanvasEditor } from './canvas2d.js';
import { Preview3D } from './preview3d.js';

const state = new FloorPlanState();
const editorCanvas = document.getElementById('editor-canvas');
const editor = new CanvasEditor(editorCanvas, state);

const previewCanvas = document.getElementById('preview-canvas');
const preview = new Preview3D(previewCanvas);

// Exposed for manual inspection/testing in the dev console.
window.__floorplanEditor = { state, editor, preview };
preview.update(state.data);
state.onChange((data) => preview.update(data));

// Tool buttons
const toolHints = {
  select: 'اختر عنصرًا لتحديده، ثم اضغط زر الحذف أدناه أو مفتاح Delete.',
  wall: 'انقر لبدء جدار، وانقر مرة أخرى لإنهاء كل ضلع ومتابعة السلسلة. اضغط Escape لإنهائها. الزوايا تلتصق تلقائيًا بـ 90°.',
  room: 'اسحب لرسم مستطيل الغرفة، ثم أدخل اسمها ونوعها.',
  door: 'انقر بالقرب من أحد الجدران لإضافة باب هناك.',
  window: 'انقر بالقرب من جدار خارجي لإضافة نافذة هناك.',
  calibrate: 'انقر نقطتين على الصورة تعرف المسافة الحقيقية بينهما (مثلاً طرفي بُعد مكتوب على الكروكي)، ثم أدخل تلك المسافة بالأمتار.',
};
const hintEl = document.getElementById('tool-hint');
for (const btn of document.querySelectorAll('.tool-btn')) {
  btn.addEventListener('click', () => {
    document.querySelector('.tool-btn.active')?.classList.remove('active');
    btn.classList.add('active');
    editor.setTool(btn.dataset.tool);
    hintEl.textContent = toolHints[btn.dataset.tool] ?? '';
  });
}

// Background sketch image
const imageScaleInput = document.getElementById('image-scale');
const imageScaleValue = document.getElementById('image-scale-value');
const imageRotateInput = document.getElementById('image-rotate');
const imageRotateValue = document.getElementById('image-rotate-value');

document.getElementById('image-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => editor.setBackgroundImage(img);
  img.src = URL.createObjectURL(file);
});
document.getElementById('image-opacity').addEventListener('input', (e) => {
  editor.setBackgroundOpacity(Number(e.target.value));
});
imageScaleInput.addEventListener('input', (e) => {
  editor.setBackgroundScale(Number(e.target.value));
  imageScaleValue.textContent = `${e.target.value}%`;
});
imageRotateInput.addEventListener('input', (e) => {
  editor.setBackgroundRotation(Number(e.target.value));
  imageRotateValue.textContent = `${e.target.value}°`;
});
// Fires on upload (resets both sliders) and after calibration (which only
// touches scale/position, not rotation) — reading the actual current values
// back from the image keeps both sliders honest regardless of which fired.
editor.onBackgroundImageChange((bg) => {
  imageScaleInput.value = 100;
  imageScaleValue.textContent = '100%';
  if (bg) {
    const degrees = Math.round((bg.rotation * 180) / Math.PI);
    imageRotateInput.value = degrees;
    imageRotateValue.textContent = `${degrees}°`;
  }
});

// Dimensions
const dimWidth = document.getElementById('dim-width');
const dimDepth = document.getElementById('dim-depth');
const dimHeight = document.getElementById('dim-height');
function syncDimensionInputs(data) {
  dimWidth.value = data.dimensions.width;
  dimDepth.value = data.dimensions.depth;
  dimHeight.value = data.dimensions.wallHeight;
}
syncDimensionInputs(state.data);
state.onChange(syncDimensionInputs);
for (const [input, key] of [[dimWidth, 'width'], [dimDepth, 'depth'], [dimHeight, 'wallHeight']]) {
  input.addEventListener('change', () => state.setDimensions({ [key]: Number(input.value) }));
}

// Selected-element panel + dedicated delete button (separate from Undo/Clear All)
const KIND_LABELS = { room: 'غرفة', wall: 'جدار', door: 'باب', window: 'نافذة' };
const selectionPanel = document.getElementById('selection-panel');
const selectionLabel = document.getElementById('selection-label');
function describeSelection(selection) {
  if (!selection) return '';
  if (selection.kind === 'room') {
    const room = state.data.rooms.find((r) => r.id === selection.id);
    return `غرفة — ${room?.name ?? ''}`;
  }
  return KIND_LABELS[selection.kind];
}
editor.onSelectionChange((selection) => {
  selectionPanel.hidden = !selection;
  selectionLabel.textContent = describeSelection(selection);
});
document.getElementById('delete-selected-btn').addEventListener('click', () => editor.deleteSelected());

// Undo / clear
document.getElementById('undo-btn').addEventListener('click', () => state.undo());
document.getElementById('clear-btn').addEventListener('click', () => {
  if (confirm('مسح كل عناصر المخطط الحالي؟ لا يمكن التراجع عن هذا بعد الإغلاق.')) state.clearAll();
});

// Export / import JSON
document.getElementById('export-btn').addEventListener('click', () => {
  const blob = new Blob([state.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'floorplan.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-btn').addEventListener('click', () => {
  const fileInput = document.getElementById('import-input');
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state.importJSON(reader.result);
    } catch {
      alert('تعذّرت قراءة الملف. تأكد أنه ملف JSON صالح تم تصديره من هذا المحرر.');
    }
  };
  reader.readAsText(file);
});

// Hand off to the full walkthrough page
document.getElementById('view-3d-btn').addEventListener('click', () => {
  state.saveAsCustomApartment();
  window.open('../index.html?source=custom', '_blank');
});
