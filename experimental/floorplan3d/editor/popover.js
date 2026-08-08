// Tiny floating form used by the drawing tools to ask for details (room
// name/type, door/window width...) right where the user clicked, instead of
// blocking native prompt()/alert() dialogs.
export function openPopover({ x, y, title, fields, onConfirm }) {
  const existing = document.querySelector('.editor-popover');
  if (existing) existing.remove();

  const popover = document.createElement('form');
  popover.className = 'editor-popover';
  popover.style.left = `${x}px`;
  popover.style.top = `${y}px`;

  const heading = document.createElement('strong');
  heading.textContent = title;
  popover.appendChild(heading);

  const inputs = {};
  for (const field of fields) {
    const label = document.createElement('label');
    label.textContent = field.label;

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      for (const opt of field.options) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        input.appendChild(option);
      }
    } else {
      input = document.createElement('input');
      input.type = field.type ?? 'text';
      if (field.step) input.step = field.step;
      if (field.min !== undefined) input.min = field.min;
    }
    input.value = field.value ?? '';
    inputs[field.name] = input;
    label.appendChild(input);
    popover.appendChild(label);
  }

  const actions = document.createElement('div');
  actions.className = 'editor-popover-actions';
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'submit';
  confirmBtn.textContent = 'تأكيد';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'إلغاء';
  cancelBtn.onclick = () => popover.remove();
  actions.append(confirmBtn, cancelBtn);
  popover.appendChild(actions);

  popover.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = {};
    for (const [name, input] of Object.entries(inputs)) {
      values[name] = input.type === 'number' ? Number(input.value) : input.value;
    }
    popover.remove();
    onConfirm(values);
  });

  document.body.appendChild(popover);
  const firstInput = popover.querySelector('input, select');
  if (firstInput) firstInput.focus();

  // Keep the popover on-screen if it was opened near the edge.
  const rect = popover.getBoundingClientRect();
  if (rect.right > window.innerWidth) popover.style.left = `${window.innerWidth - rect.width - 12}px`;
  if (rect.bottom > window.innerHeight) popover.style.top = `${window.innerHeight - rect.height - 12}px`;
}
