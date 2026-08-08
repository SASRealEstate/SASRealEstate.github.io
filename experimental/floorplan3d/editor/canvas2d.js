import { distance, snap, findNearestWall, findNearestEndpoint } from '../utils/geometry.js';
import { openPopover } from './popover.js';
import { ROOM_TYPES } from './state.js';

const ROOM_COLORS = {
  bedroom: '#e8ddc7',
  bathroom: '#cfe3ec',
  kitchen: '#f1e6b8',
  corridor: '#d8d5c8',
  living: '#d9e8d3',
  other: '#e2e2e2',
};

const ENDPOINT_SNAP_METERS = 0.3;
const GRID_SNAP_METERS = 0.1;
const OPENING_CLICK_RADIUS_METERS = 0.5;
const ANGLE_SNAP_DEGREES = 90;

// Drives the 2D canvas: view pan/zoom, the background sketch image,
// rendering, and all drawing tools (wall/room/door/window/select/calibrate).
// Coordinates are manual (worldToScreen/screenToWorld) rather than relying on
// ctx transforms, so grid/selection line widths stay crisp at any zoom level
// while wall thickness scales correctly with it.
export class CanvasEditor {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = state;

    this.view = { originX: -1, originZ: -1, scale: 45 };
    this.backgroundImage = null; // { img, x, z, metersPerPixel, baseMetersPerPixel, opacity }
    this.backgroundImageListeners = new Set();
    this.tool = 'select';
    this.selected = null; // { kind, id }
    this.selectionListeners = new Set();
    this.wallChainStart = null;
    this.roomDragStart = null;
    this.calibrationPoints = [];
    this.cursorWorld = null;
    this.isPanning = false;
    this.panKeys = { w: false, a: false, s: false, d: false };
    this._panLoopRunning = false;

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindEvents();
    state.onChange(() => {
      if (this.selected && !this._elementExists(this.selected)) this._setSelected(null);
      else this.draw();
    });
    this.draw();
  }

  setTool(tool) {
    this.tool = tool;
    this.wallChainStart = null;
    this.calibrationPoints = [];
    this._setSelected(null);
  }

  onSelectionChange(fn) {
    this.selectionListeners.add(fn);
    return () => this.selectionListeners.delete(fn);
  }

  deleteSelected() {
    if (!this.selected) return;
    this.state.removeElement(this.selected.kind, this.selected.id);
    this._setSelected(null);
  }

  _setSelected(selection) {
    this.selected = selection;
    for (const fn of this.selectionListeners) fn(selection);
    this.draw();
  }

  _elementExists({ kind, id }) {
    const collection = { room: 'rooms', wall: 'walls', door: 'doors', window: 'windows' }[kind];
    return this.state.data[collection].some((item) => item.id === id);
  }

  setBackgroundImage(img) {
    const baseMetersPerPixel = 10 / img.naturalWidth;
    this.backgroundImage = {
      img,
      x: 0,
      z: 0,
      metersPerPixel: baseMetersPerPixel,
      baseMetersPerPixel,
      opacity: 0.6,
      rotation: 0,
    };
    this._notifyBackgroundImageChange();
    this.draw();
  }

  setBackgroundOpacity(opacity) {
    if (this.backgroundImage) this.backgroundImage.opacity = opacity;
    this.draw();
  }

  // `degrees` is clockwise, matching how the slider reads to a user (drag
  // right = rotate right) — canvas rotate() is already clockwise for a
  // Y-down screen space, so no sign flip is needed here.
  setBackgroundRotation(degrees) {
    if (!this.backgroundImage) return;
    this.backgroundImage.rotation = (degrees * Math.PI) / 180;
    this.draw();
  }

  // Resizes the background image around its own center (so it doesn't drift
  // as you adjust it), relative to `baseMetersPerPixel` — the last "100%"
  // reference point, which is the initial guess on upload and gets moved to
  // wherever calibration lands (see _runCalibration), so this slider and the
  // two-point calibration tool never fight over what "actual size" means.
  setBackgroundScale(percent) {
    const bg = this.backgroundImage;
    if (!bg) return;
    const currentWidth = bg.img.naturalWidth * bg.metersPerPixel;
    const currentHeight = bg.img.naturalHeight * bg.metersPerPixel;
    const centerX = bg.x + currentWidth / 2;
    const centerZ = bg.z + currentHeight / 2;

    bg.metersPerPixel = bg.baseMetersPerPixel * (percent / 100);

    const newWidth = bg.img.naturalWidth * bg.metersPerPixel;
    const newHeight = bg.img.naturalHeight * bg.metersPerPixel;
    bg.x = centerX - newWidth / 2;
    bg.z = centerZ - newHeight / 2;
    this.draw();
  }

  onBackgroundImageChange(fn) {
    this.backgroundImageListeners.add(fn);
    return () => this.backgroundImageListeners.delete(fn);
  }

  _notifyBackgroundImageChange() {
    for (const fn of this.backgroundImageListeners) fn(this.backgroundImage);
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * devicePixelRatio;
    this.canvas.height = rect.height * devicePixelRatio;
    this.draw();
  }

  worldToScreen(p) {
    const dpr = devicePixelRatio;
    return {
      x: (p.x - this.view.originX) * this.view.scale * dpr,
      y: (p.z - this.view.originZ) * this.view.scale * dpr,
    };
  }

  screenToWorld(p) {
    const dpr = devicePixelRatio;
    return {
      x: p.x / (this.view.scale * dpr) + this.view.originX,
      z: p.y / (this.view.scale * dpr) + this.view.originZ,
    };
  }

  _eventWorldPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    // clientX/Y and getBoundingClientRect are in CSS pixels; screenToWorld
    // expects device pixels (it inverts worldToScreen, which multiplies by
    // devicePixelRatio) — skipping this conversion is what caused clicks to
    // land at the wrong world position on any display with devicePixelRatio
    // != 1 (e.g. Windows at 125%/150% scaling).
    return this.screenToWorld({
      x: (e.clientX - rect.left) * devicePixelRatio,
      y: (e.clientY - rect.top) * devicePixelRatio,
    });
  }

  _snapPoint(p, fromPoint) {
    const nearEndpoint = findNearestEndpoint(this.state.data.walls, p, ENDPOINT_SNAP_METERS);
    if (nearEndpoint) return { ...nearEndpoint.point };

    let snapped = { x: snap(p.x, GRID_SNAP_METERS), z: snap(p.z, GRID_SNAP_METERS) };

    if (fromPoint) {
      const dx = snapped.x - fromPoint.x;
      const dz = snapped.z - fromPoint.z;
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        const angle = Math.atan2(dz, dx);
        const snapRad = (ANGLE_SNAP_DEGREES * Math.PI) / 180;
        const snappedAngle = Math.round(angle / snapRad) * snapRad;
        snapped = {
          x: snap(fromPoint.x + Math.cos(snappedAngle) * len, GRID_SNAP_METERS),
          z: snap(fromPoint.z + Math.sin(snappedAngle) * len, GRID_SNAP_METERS),
        };
      }
    }
    return snapped;
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
  }

  _onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const cursorScreen = { x: (e.clientX - rect.left) * devicePixelRatio, y: (e.clientY - rect.top) * devicePixelRatio };
    const worldBefore = this.screenToWorld(cursorScreen);

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.view.scale = Math.max(10, Math.min(250, this.view.scale * factor));

    const worldAfter = this.screenToWorld(cursorScreen);
    this.view.originX += worldBefore.x - worldAfter.x;
    this.view.originZ += worldBefore.z - worldAfter.z;
    this.draw();
  }

  _onPointerDown(e) {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      this.isPanning = true;
      this._panStart = { x: e.clientX, y: e.clientY, originX: this.view.originX, originZ: this.view.originZ };
      return;
    }

    const world = this._eventWorldPoint(e);

    if (this.tool === 'wall') {
      const point = this._snapPoint(world, this.wallChainStart);
      if (this.wallChainStart) {
        if (distance(this.wallChainStart, point) > 0.05) {
          this.state.addWall({ ...this.wallChainStart }, point);
        }
      }
      this.wallChainStart = point;
    } else if (this.tool === 'room') {
      this.roomDragStart = this._snapPoint(world);
    } else if (this.tool === 'door' || this.tool === 'window') {
      this._placeOpening(e, world);
    } else if (this.tool === 'calibrate') {
      this.calibrationPoints.push(world);
      if (this.calibrationPoints.length === 2) this._runCalibration(e);
    } else if (this.tool === 'select') {
      this._selectAt(world);
    }
    this.draw();
  }

  _onPointerMove(e) {
    if (this.isPanning && this._panStart) {
      const dpr = devicePixelRatio;
      this.view.originX = this._panStart.originX - (e.clientX - this._panStart.x) / (this.view.scale * dpr);
      this.view.originZ = this._panStart.originZ - (e.clientY - this._panStart.y) / (this.view.scale * dpr);
      this.draw();
      return;
    }
    this.cursorWorld = this._eventWorldPoint(e);
    if (this.tool === 'wall' && this.wallChainStart) {
      this.cursorWorld = this._snapPoint(this.cursorWorld, this.wallChainStart);
    } else if (this.tool === 'room' && this.roomDragStart) {
      this.cursorWorld = this._snapPoint(this.cursorWorld);
    }
    this.draw();
  }

  _onPointerUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      return;
    }
    if (this.tool === 'room' && this.roomDragStart) {
      const end = this._snapPoint(this._eventWorldPoint(e));
      const start = this.roomDragStart;
      this.roomDragStart = null;
      const bounds = {
        x: [Math.min(start.x, end.x), Math.max(start.x, end.x)],
        z: [Math.min(start.z, end.z), Math.max(start.z, end.z)],
      };
      if (bounds.x[1] - bounds.x[0] >= 0.3 && bounds.z[1] - bounds.z[0] >= 0.3) {
        this._promptRoomDetails(e, bounds);
      }
      this.draw();
    }
  }

  _onKeyDown(e) {
    if (this._isTypingInField()) return;

    if (e.key === 'Escape') {
      this.wallChainStart = null;
      this.calibrationPoints = [];
      this.draw();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelected();
      return;
    }
    const panKey = { w: 'w', a: 'a', s: 's', d: 'd' }[e.key.toLowerCase()];
    if (panKey) {
      this.panKeys[panKey] = true;
      this._startPanLoop();
    }
  }

  _onKeyUp(e) {
    const panKey = { w: 'w', a: 'a', s: 's', d: 'd' }[e.key.toLowerCase()];
    if (panKey) this.panKeys[panKey] = false;
  }

  // Continuous keyboard panning (WASD), as an alternative to the
  // Shift/middle-drag mouse pan. Runs only while a pan key is held.
  _startPanLoop() {
    if (this._panLoopRunning) return;
    this._panLoopRunning = true;
    let last = performance.now();
    const PAN_SCREEN_SPEED = 600; // px/sec, independent of zoom level

    const step = (now) => {
      const anyKey = this.panKeys.w || this.panKeys.a || this.panKeys.s || this.panKeys.d;
      if (!anyKey) {
        this._panLoopRunning = false;
        return;
      }
      const dt = (now - last) / 1000;
      last = now;
      const worldSpeed = PAN_SCREEN_SPEED / (this.view.scale * devicePixelRatio);
      if (this.panKeys.w) this.view.originZ -= worldSpeed * dt;
      if (this.panKeys.s) this.view.originZ += worldSpeed * dt;
      if (this.panKeys.a) this.view.originX -= worldSpeed * dt;
      if (this.panKeys.d) this.view.originX += worldSpeed * dt;
      this.draw();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _isTypingInField() {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  }

  _promptRoomDetails(e, bounds) {
    openPopover({
      x: e.clientX,
      y: e.clientY,
      title: 'تفاصيل الغرفة',
      fields: [
        { name: 'name', label: 'اسم الغرفة', value: 'غرفة جديدة' },
        { name: 'type', label: 'النوع', type: 'select', options: ROOM_TYPES.map((t) => ({ value: t.value, label: t.label })) },
      ],
      onConfirm: ({ name, type }) => this.state.addRoom(bounds, name, type),
    });
  }

  _placeOpening(e, world) {
    const scaledRadius = OPENING_CLICK_RADIUS_METERS;
    const nearest = findNearestWall(this.state.data.walls, world, scaledRadius);
    if (!nearest) return;

    const wallLength = distance(nearest.wall.start, nearest.wall.end);
    const isDoor = this.tool === 'door';
    const defaultWidth = isDoor ? 0.9 : 1.2;

    const fields = [{ name: 'width', label: 'العرض (م)', type: 'number', step: '0.05', min: 0.3, value: defaultWidth }];
    if (!isDoor) {
      fields.push(
        { name: 'sill', label: 'ارتفاع العتبة (م)', type: 'number', step: '0.05', min: 0, value: 0.9 },
        { name: 'height', label: 'ارتفاع الفتحة (م)', type: 'number', step: '0.05', min: 0.2, value: 1.2 }
      );
    }

    openPopover({
      x: e.clientX,
      y: e.clientY,
      title: isDoor ? 'تفاصيل الباب' : 'تفاصيل النافذة',
      fields,
      onConfirm: (values) => {
        const width = Math.min(Math.max(values.width, 0.3), wallLength);
        const offset = Math.min(Math.max(nearest.offset - width / 2, 0), wallLength - width);
        if (isDoor) this.state.addDoor(nearest.wall.id, offset, width);
        else this.state.addWindow(nearest.wall.id, offset, width, values.sill, values.height);
      },
    });
  }

  _runCalibration(e) {
    const [a, b] = this.calibrationPoints;
    this.calibrationPoints = [];
    const pixelWorldDistance = distance(a, b);
    if (pixelWorldDistance < 0.01) return;

    openPopover({
      x: e.clientX,
      y: e.clientY,
      title: 'معايرة المقياس',
      fields: [{ name: 'meters', label: 'المسافة الفعلية بين النقطتين (م)', type: 'number', step: '0.05', min: 0.01, value: '' }],
      onConfirm: ({ meters }) => {
        if (!this.backgroundImage || !meters) return;
        const factor = meters / pixelWorldDistance;
        this.backgroundImage.metersPerPixel *= factor;
        this.backgroundImage.x = a.x - (a.x - this.backgroundImage.x) * factor;
        this.backgroundImage.z = a.z - (a.z - this.backgroundImage.z) * factor;
        // This calibrated size becomes the new "100%" for the resize slider,
        // so touching the slider afterward fine-tunes from here rather than
        // silently reverting to the pre-calibration guessed size.
        this.backgroundImage.baseMetersPerPixel = this.backgroundImage.metersPerPixel;
        this._notifyBackgroundImageChange();
        this.draw();
      },
    });
  }

  _selectAt(world) {
    let found = null;
    for (const door of this.state.data.doors) this._withOpeningPoint(door, (p) => {
      if (distance(world, p) < 0.3) found = { kind: 'door', id: door.id };
    });
    for (const win of this.state.data.windows) this._withOpeningPoint(win, (p) => {
      if (distance(world, p) < 0.3) found = { kind: 'window', id: win.id };
    });

    if (!found) {
      const nearestWall = findNearestWall(this.state.data.walls, world, 0.25);
      if (nearestWall) found = { kind: 'wall', id: nearestWall.wall.id };
    }

    if (!found) {
      for (const room of this.state.data.rooms) {
        const { x, z } = room.bounds;
        if (world.x >= x[0] && world.x <= x[1] && world.z >= z[0] && world.z <= z[1]) {
          found = { kind: 'room', id: room.id };
          break;
        }
      }
    }

    this._setSelected(found);
  }

  _withOpeningPoint(opening, fn) {
    const wall = this.state.data.walls.find((w) => w.id === opening.wallId);
    if (!wall) return;
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz) || 1;
    const mid = opening.offset + opening.width / 2;
    fn({ x: wall.start.x + (dx / length) * mid, z: wall.start.z + (dz / length) * mid });
  }

  draw() {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f6f4ee';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this._drawBackgroundImage();
    this._drawGrid();
    this._drawRooms();
    this._drawWalls();
    this._drawOpenings();
    this._drawToolPreview();
    this._drawScaleBar();
  }

  _drawBackgroundImage() {
    if (!this.backgroundImage) return;
    const { img, x, z, metersPerPixel, opacity, rotation } = this.backgroundImage;
    const width = img.naturalWidth * metersPerPixel;
    const height = img.naturalHeight * metersPerPixel;
    const topLeft = this.worldToScreen({ x, z });
    const bottomRight = this.worldToScreen({ x: x + width, z: z + height });
    const screenWidth = bottomRight.x - topLeft.x;
    const screenHeight = bottomRight.y - topLeft.y;
    const center = this.worldToScreen({ x: x + width / 2, z: z + height / 2 });

    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(center.x, center.y);
    ctx.rotate(rotation ?? 0);
    ctx.drawImage(img, -screenWidth / 2, -screenHeight / 2, screenWidth, screenHeight);
    ctx.restore();
  }

  _drawGrid() {
    const { ctx, canvas } = this;
    const topLeft = this.screenToWorld({ x: 0, y: 0 });
    const bottomRight = this.screenToWorld({ x: canvas.width, y: canvas.height });

    ctx.lineWidth = 1;
    for (let x = Math.floor(topLeft.x); x <= Math.ceil(bottomRight.x); x++) {
      ctx.strokeStyle = x % 5 === 0 ? '#c9c4b0' : '#e3dfd0';
      const s1 = this.worldToScreen({ x, z: topLeft.z });
      const s2 = this.worldToScreen({ x, z: bottomRight.z });
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    }
    for (let z = Math.floor(topLeft.z); z <= Math.ceil(bottomRight.z); z++) {
      ctx.strokeStyle = z % 5 === 0 ? '#c9c4b0' : '#e3dfd0';
      const s1 = this.worldToScreen({ x: topLeft.x, z });
      const s2 = this.worldToScreen({ x: bottomRight.x, z });
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    }
  }

  _drawRooms() {
    const { ctx } = this;
    for (const room of this.state.data.rooms) {
      const topLeft = this.worldToScreen({ x: room.bounds.x[0], z: room.bounds.z[0] });
      const bottomRight = this.worldToScreen({ x: room.bounds.x[1], z: room.bounds.z[1] });
      const isSelected = this.selected?.kind === 'room' && this.selected.id === room.id;

      ctx.fillStyle = ROOM_COLORS[room.type] ?? ROOM_COLORS.other;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
      ctx.globalAlpha = 1;

      if (isSelected) {
        ctx.strokeStyle = '#2f6690';
        ctx.lineWidth = 2;
        ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
      }

      ctx.fillStyle = '#26290f';
      ctx.font = '600 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      ctx.fillText(room.name, (topLeft.x + bottomRight.x) / 2, (topLeft.y + bottomRight.y) / 2);
    }
  }

  _drawWalls() {
    const { ctx } = this;
    for (const wall of this.state.data.walls) {
      const s1 = this.worldToScreen(wall.start);
      const s2 = this.worldToScreen(wall.end);
      const isSelected = this.selected?.kind === 'wall' && this.selected.id === wall.id;
      ctx.strokeStyle = isSelected ? '#2f6690' : '#4a4e0b';
      ctx.lineWidth = isSelected ? 6 : 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    }
  }

  _drawOpenings() {
    const { ctx } = this;
    const drawMarker = (opening, kind, color) => {
      this._withOpeningPoint(opening, (worldPoint) => {
        const p = this.worldToScreen(worldPoint);
        const isSelected = this.selected?.kind === kind && this.selected.id === opening.id;
        ctx.fillStyle = color;
        ctx.strokeStyle = isSelected ? '#2f6690' : '#ffffff';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    };
    for (const door of this.state.data.doors) drawMarker(door, 'door', '#b8922e');
    for (const win of this.state.data.windows) drawMarker(win, 'window', '#2f6690');
  }

  _drawToolPreview() {
    const { ctx } = this;
    if (this.tool === 'wall' && this.wallChainStart && this.cursorWorld) {
      const s1 = this.worldToScreen(this.wallChainStart);
      const s2 = this.worldToScreen(this.cursorWorld);
      ctx.strokeStyle = 'rgba(74,78,11,0.5)';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.tool === 'room' && this.roomDragStart && this.cursorWorld) {
      const s1 = this.worldToScreen(this.roomDragStart);
      const s2 = this.worldToScreen(this.cursorWorld);
      ctx.strokeStyle = 'rgba(47,102,144,0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
      ctx.setLineDash([]);
    }
    if (this.tool === 'calibrate' && this.calibrationPoints.length === 1) {
      const p = this.worldToScreen(this.calibrationPoints[0]);
      ctx.fillStyle = '#d93025';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Grid squares are already 1m (bold every 5m), but a labeled scale bar —
  // like a map's — makes "how big is this" unambiguous at a glance and stays
  // correct as the user zooms in/out, instead of relying on grid density alone.
  _drawScaleBar() {
    const { ctx, canvas } = this;
    const dpr = devicePixelRatio;
    const pxPerMeter = this.view.scale * dpr;

    const niceMeters = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
    let meters = niceMeters[0];
    for (const candidate of niceMeters) {
      if (candidate * pxPerMeter > 160) break;
      meters = candidate;
    }
    const barWidth = meters * pxPerMeter;
    const x0 = 20 * dpr;
    const y0 = canvas.height - 24 * dpr;

    ctx.strokeStyle = '#26290f';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + barWidth, y0);
    for (const capX of [x0, x0 + barWidth]) {
      ctx.moveTo(capX, y0 - 5 * dpr);
      ctx.lineTo(capX, y0 + 5 * dpr);
    }
    ctx.stroke();

    ctx.fillStyle = '#26290f';
    ctx.font = `${12 * dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillText(`${meters} م`, x0 + barWidth / 2, y0 - 10 * dpr);
  }
}
