// In-memory floor-plan data model for the editor: the same shape as
// data/sampleApartment.js, plus id generation, undo history, and
// localStorage persistence so a refresh doesn't lose work in progress.

const DRAFT_KEY = 'floorplan3d_editor_draft';
export const CUSTOM_APARTMENT_KEY = 'floorplan3d_custom_apartment';

const ROOM_TYPES = [
  { value: 'bedroom', label: 'غرفة نوم' },
  { value: 'bathroom', label: 'حمام' },
  { value: 'kitchen', label: 'مطبخ' },
  { value: 'corridor', label: 'ممر' },
  { value: 'living', label: 'غرفة معيشة' },
  { value: 'other', label: 'أخرى' },
];
export { ROOM_TYPES };

function emptyApartment() {
  return {
    dimensions: { width: 10, depth: 8, wallHeight: 2.7, wallThickness: 0.15, unit: 'm' },
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
  };
}

export class FloorPlanState {
  constructor() {
    this.data = emptyApartment();
    this.counters = { room: 0, wall: 0, door: 0, window: 0 };
    this.history = [];
    this.listeners = new Set();
    this._loadDraft();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify() {
    this._saveDraft();
    for (const fn of this.listeners) fn(this.data);
  }

  _snapshot() {
    this.history.push(JSON.stringify(this.data));
    if (this.history.length > 50) this.history.shift();
  }

  undo() {
    const previous = this.history.pop();
    if (!previous) return;
    this.data = JSON.parse(previous);
    this._notify();
  }

  clearAll() {
    this._snapshot();
    this.data = emptyApartment();
    this.counters = { room: 0, wall: 0, door: 0, window: 0 };
    this._notify();
  }

  setDimensions(partial) {
    this._snapshot();
    Object.assign(this.data.dimensions, partial);
    this._notify();
  }

  addWall(start, end) {
    this._snapshot();
    const id = `wall_${++this.counters.wall}`;
    this.data.walls.push({ id, start, end });
    this._notify();
    return id;
  }

  addRoom(bounds, name, type) {
    this._snapshot();
    const id = `room_${++this.counters.room}`;
    this.data.rooms.push({ id, name, type, bounds });
    this._notify();
    return id;
  }

  addDoor(wallId, offset, width) {
    this._snapshot();
    const id = `door_${++this.counters.door}`;
    this.data.doors.push({ id, wallId, offset, width });
    this._notify();
    return id;
  }

  addWindow(wallId, offset, width, sill, height) {
    this._snapshot();
    const id = `window_${++this.counters.window}`;
    this.data.windows.push({ id, wallId, offset, width, sill, height });
    this._notify();
    return id;
  }

  removeElement(kind, id) {
    this._snapshot();
    const collection = { room: 'rooms', wall: 'walls', door: 'doors', window: 'windows' }[kind];
    this.data[collection] = this.data[collection].filter((item) => item.id !== id);
    if (kind === 'wall') {
      this.data.doors = this.data.doors.filter((d) => d.wallId !== id);
      this.data.windows = this.data.windows.filter((w) => w.wallId !== id);
    }
    this._notify();
  }

  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  importJSON(json) {
    const parsed = JSON.parse(json);
    this._snapshot();
    this.data = parsed;
    this._notify();
  }

  saveAsCustomApartment() {
    localStorage.setItem(CUSTOM_APARTMENT_KEY, JSON.stringify(this.data));
  }

  _saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full/unavailable — the draft just won't persist across reloads.
    }
  }

  _loadDraft() {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) this.data = JSON.parse(saved);
    } catch {
      // Ignore corrupt/unavailable draft and start from an empty apartment.
    }
  }
}
