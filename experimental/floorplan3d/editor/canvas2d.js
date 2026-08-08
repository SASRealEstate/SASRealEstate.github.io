import { distance, snap, projectPointOntoSegment, findNearestWall, findNearestEndpoint } from './geometry.js';
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
    this.backgroundImage = null; // { img, x, z, metersPerPixel, opacity }
    this.tool = 'select';
    this.selected = null; // { kind, id }
    this.wallChainStart = null;
    this.roomDragStart = null;
    this.calibrationPoints = [];
    this.cursorWorld = null;
    this.isPanning = false;

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindEvents();
    state.onChange(() => this.draw());
    this.draw();
  }

  setTool(tool) {
    this.tool = tool;
    this.wallChainStart = null;
    this.calibrationPoints = [];
    this.selected = null;
    this.draw();
  }

  setBackgroundImage(img) {
    this.backgroundImage = {
      img,
      x: 0,
      z: 0,
      metersPerPixel: 10 / img.naturalWidth,
      opacity: 0.6,
    };
    this.draw();
  }

  setBackgroundOpacity(opacity) {
    if (this.backgroundImage) this.backgroundImage.opacity = opacity;
    this.draw();
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
    return this.screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
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
    if (e.key === 'Escape') {
      this.wallChainStart = null;
      this.calibrationPoints = [];
      this.draw();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected && !this._isTypingInField()) {
      this.state.removeElement(this.selected.kind, this.selected.id);
      this.selected = null;
    }
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
        this.draw();
      },
    });
  }

  _selectAt(world) {
    for (const door of this.state.data.doors) this._withOpeningPoint(door, (p) => {
      if (distance(world, p) < 0.3) this.selected = { kind: 'door', id: door.id };
    });
    for (const win of this.state.data.windows) this._withOpeningPoint(win, (p) => {
      if (distance(world, p) < 0.3) this.selected = { kind: 'window', id: win.id };
    });
    if (this.selected) return;

    const nearestWall = findNearestWall(this.state.data.walls, world, 0.25);
    if (nearestWall) {
      this.selected = { kind: 'wall', id: nearestWall.wall.id };
      return;
    }

    for (const room of this.state.data.rooms) {
      const { x, z } = room.bounds;
      if (world.x >= x[0] && world.x <= x[1] && world.z >= z[0] && world.z <= z[1]) {
        this.selected = { kind: 'room', id: room.id };
        return;
      }
    }
    this.selected = null;
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
  }

  _drawBackgroundImage() {
    if (!this.backgroundImage) return;
    const { img, x, z, metersPerPixel, opacity } = this.backgroundImage;
    const topLeft = this.worldToScreen({ x, z });
    const bottomRight = this.worldToScreen({ x: x + img.naturalWidth * metersPerPixel, z: z + img.naturalHeight * metersPerPixel });
    this.ctx.globalAlpha = opacity;
    this.ctx.drawImage(img, topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    this.ctx.globalAlpha = 1;
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
}
