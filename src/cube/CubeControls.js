import * as THREE from 'three';
import { AXES, HALF_PI } from './RubiksCube.js';

const BOX = new THREE.Box3(new THREE.Vector3(-1.5, -1.5, -1.5), new THREE.Vector3(1.5, 1.5, 1.5));
const DRAG_THRESHOLD = 7; // px até decidir a direção do giro da camada
const ORBIT_SPEED = 0.0078; // rad por pixel
const LAYER_RADIUS = 1.35; // quanto a peça "acompanha" o mouse
const INERTIA_DAMPING = 0.05; // fração da velocidade que sobra após 1s
const MAX_SPIN = 14; // rad/s
const FLICK_SPEED = 2.5; // rad/s para completar o giro ao soltar

export const DEFAULT_ORIENTATION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.42, -Math.PI / 4, 0, 'XYZ'),
);

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CubeControls {
  constructor({ dom, stage, cube }) {
    this.dom = dom;
    this.stage = stage;
    this.camera = stage.camera;
    this.cube = cube;
    this.group = cube.group;
    this.group.quaternion.copy(DEFAULT_ORIENTATION);

    this.pointers = new Map();
    this.mode = null; // 'orbit' | 'pending' | 'layer' | 'pinch'
    this.gesture = null;
    this.velocity = new THREE.Vector3(); // eixo (mundo) * rad/s
    this.resetAnim = null;
    this.hoveringCube = false;

    /** Chamado no primeiro toque/clique de cada gesto. */
    this.onInteract = null;

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._ray = new THREE.Ray();
    this._inverse = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();

    dom.addEventListener('pointerdown', this._onDown);
    dom.addEventListener('pointermove', this._onMove);
    dom.addEventListener('pointerup', this._onUp);
    dom.addEventListener('pointercancel', this._onUp);
    dom.addEventListener('lostpointercapture', this._onUp);
    dom.addEventListener('pointerleave', this._onLeave);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this._updateCursor();
  }

  // ---------------------------------------------------------------- geometria

  _hitTest(clientX, clientY) {
    const rect = this.dom.getBoundingClientRect();
    this._ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(this._ndc, this.camera);
    this.cube.root.updateMatrixWorld(true);
    this._inverse.copy(this.group.matrixWorld).invert();
    this._ray.copy(this._raycaster.ray).applyMatrix4(this._inverse);

    const point = this._ray.intersectBox(BOX, new THREE.Vector3());
    if (!point) return null;

    let axis = 'x';
    for (const a of AXES) if (Math.abs(point[a]) > Math.abs(point[axis])) axis = a;
    const normal = new THREE.Vector3();
    normal[axis] = Math.sign(point[axis]);
    return { point, normal, axis };
  }

  /** Ponto no espaço local do cubo -> pixels na tela. */
  _toScreen(local) {
    const rect = this.dom.getBoundingClientRect();
    const v = this._v.copy(local).applyMatrix4(this.group.matrixWorld).project(this.camera);
    return new THREE.Vector2(((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height);
  }

  _cameraAxis(column) {
    return new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, column).normalize();
  }

  /** Gira o cubo inteiro em torno dos eixos da tela (estilo trackball). */
  _rotateByScreenDelta(dx, dy) {
    const axis = this._cameraAxis(0).multiplyScalar(dy).addScaledVector(this._cameraAxis(1), dx);
    const length = axis.length();
    if (length < 1e-6) return null;
    axis.divideScalar(length);
    const angle = length * ORBIT_SPEED;
    this.group.quaternion.premultiply(this._q.setFromAxisAngle(axis, angle)).normalize();
    return { axis, angle };
  }

  /**
   * Faces relativas à câmera: F é a que mais encara a tela, U a que aponta
   * para cima e R para a direita. Cada uma: { axis, sign } no espaço do cubo.
   */
  viewFaces() {
    const toCamera = this._cameraAxis(2);
    const up = this._cameraAxis(1);
    const right = this._cameraAxis(0);
    const dirs = [];
    for (const axis of AXES) {
      for (const sign of [1, -1]) {
        const n = new THREE.Vector3();
        n[axis] = sign;
        n.applyQuaternion(this.group.quaternion);
        dirs.push({ axis, sign, n });
      }
    }
    const pick = (ref, exclude) =>
      dirs
        .filter((d) => !exclude.includes(d.axis))
        .reduce((best, d) => (d.n.dot(ref) > best.n.dot(ref) ? d : best));
    // Na visão isométrica duas faces encaram a câmera igualmente; como na
    // notação clássica, a da esquerda é a F e a da direita é a R.
    const F = pick(toCamera.clone().addScaledVector(right, -0.15), []);
    const U = pick(up, [F.axis]);
    const R = pick(right, [F.axis, U.axis]);
    const opposite = (f) => ({ axis: f.axis, sign: -f.sign });
    return {
      F: { axis: F.axis, sign: F.sign },
      U: { axis: U.axis, sign: U.sign },
      R: { axis: R.axis, sign: R.sign },
      B: opposite(F),
      D: opposite(U),
      L: opposite(R),
    };
  }

  // ---------------------------------------------------------------- eventos

  _onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    this.dom.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.onInteract?.();
    this.resetAnim = null;

    if (this.pointers.size === 2) {
      this._cancelGesture();
      this._startPinch();
      return;
    }
    if (this.pointers.size > 2) return;

    this.velocity.set(0, 0, 0);
    // Botão direito sempre gira a visão.
    const hit = e.button === 2 ? null : this._hitTest(e.clientX, e.clientY);
    if (hit && this.cube.canDrag()) {
      this.mode = 'pending';
      this.gesture = { pointerId: e.pointerId, hit, startX: e.clientX, startY: e.clientY };
    } else {
      this.mode = 'orbit';
      this.gesture = {
        pointerId: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        lastT: performance.now(),
      };
      this.cube.setHover(null);
    }
    this._updateCursor();
  };

  _onMove = (e) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this._hover(e.clientX, e.clientY);
      return;
    }
    p.x = e.clientX;
    p.y = e.clientY;

    if (this.mode === 'pinch') return this._updatePinch();
    if (!this.gesture || this.gesture.pointerId !== e.pointerId) return;

    if (this.mode === 'orbit') {
      this._orbitMove(e.clientX, e.clientY);
    } else if (this.mode === 'pending') {
      const dx = e.clientX - this.gesture.startX;
      const dy = e.clientY - this.gesture.startY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) this._beginLayer(dx, dy, e.clientX, e.clientY);
    } else if (this.mode === 'layer') {
      this._layerMove(e.clientX, e.clientY);
    }
  };

  _onUp = (e) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.dom.hasPointerCapture(e.pointerId)) this.dom.releasePointerCapture(e.pointerId);

    if (this.mode === 'pinch') {
      if (this.pointers.size < 2) {
        this.mode = null;
        this.gesture = null;
      }
    } else if (this.gesture?.pointerId === e.pointerId) {
      if (this.mode === 'layer') this._endLayer();
      else if (this.mode === 'orbit' && performance.now() - this.gesture.lastT > 80) {
        this.velocity.set(0, 0, 0);
      }
      this.mode = null;
      this.gesture = null;
    }

    if (e.pointerType === 'mouse') this._hover(e.clientX, e.clientY);
    this._updateCursor();
  };

  _onLeave = () => {
    if (this.pointers.size) return;
    this.hoveringCube = false;
    this.cube.setHover(null);
    this._updateCursor();
  };

  _onWheel = (e) => {
    e.preventDefault();
    this.onInteract?.();
    this.stage.zoomBy(Math.exp(e.deltaY * 0.0012));
  };

  // ---------------------------------------------------------------- gestos

  _hover(x, y) {
    if (!this.cube.canHover()) {
      this.cube.setHover(null);
      this.hoveringCube = false;
    } else {
      const hit = this._hitTest(x, y);
      this.cube.setHover(hit);
      this.hoveringCube = !!hit;
    }
    this._updateCursor();
  }

  _orbitMove(x, y) {
    const g = this.gesture;
    const dx = x - g.lastX;
    const dy = y - g.lastY;
    const now = performance.now();
    const dt = Math.max(1, now - g.lastT) / 1000;
    g.lastX = x;
    g.lastY = y;
    g.lastT = now;

    const r = this._rotateByScreenDelta(dx, dy);
    if (!r) return;
    const instant = r.axis.multiplyScalar(r.angle / dt);
    if (instant.length() > MAX_SPIN) instant.setLength(MAX_SPIN);
    this.velocity.lerp(instant, 0.5);
  }

  _beginLayer(dx, dy, x, y) {
    if (!this.cube.canDrag()) {
      this.mode = 'orbit';
      this.gesture = { pointerId: this.gesture.pointerId, lastX: x, lastY: y, lastT: performance.now() };
      this._updateCursor();
      return;
    }

    const { hit } = this.gesture;
    const drag = new THREE.Vector2(dx, dy);
    const origin = this._toScreen(hit.point);

    // Entre os dois eixos do plano da face, escolhe o que mais acompanha o arraste na tela.
    let best = null;
    for (const axis of AXES) {
      if (axis === hit.axis) continue;
      const dir = new THREE.Vector3();
      dir[axis] = 1;
      const screen = this._toScreen(hit.point.clone().add(dir)).sub(origin);
      const length = screen.length();
      if (length < 1e-3) continue;
      const score = Math.abs(screen.dot(drag)) / length;
      if (!best || score > best.score) best = { dir, screen, length, score };
    }
    if (!best) return;

    // Girar em torno de (normal × direção) move o ponto da face na direção do arraste.
    const r = new THREE.Vector3().crossVectors(hit.normal, best.dir);
    const rotAxis = AXES.find((a) => Math.abs(r[a]) > 0.5);
    const layer = THREE.MathUtils.clamp(Math.round(hit.point[rotAxis]), -1, 1);

    this.cube.setHover(null);
    this.cube.beginDrag(rotAxis, layer);
    this.mode = 'layer';
    Object.assign(this.gesture, {
      sign: Math.sign(r[rotAxis]),
      screenDir: best.screen.clone().normalize(),
      pxPerUnit: best.length,
      angle: 0,
      velocity: 0,
      lastT: performance.now(),
    });
    this._layerMove(x, y);
    this._updateCursor();
  }

  _layerMove(x, y) {
    const g = this.gesture;
    const along = new THREE.Vector2(x - g.startX, y - g.startY).dot(g.screenDir) / g.pxPerUnit;
    const angle = (g.sign * along) / LAYER_RADIUS;
    const now = performance.now();
    const dt = Math.max(1, now - g.lastT) / 1000;
    g.velocity = g.velocity * 0.5 + ((angle - g.angle) / dt) * 0.5;
    g.angle = angle;
    g.lastT = now;
    this.cube.setDragAngle(angle);
  }

  _endLayer() {
    const g = this.gesture;
    const velocity = performance.now() - g.lastT > 90 ? 0 : g.velocity;
    const quarters = g.angle / HALF_PI;
    let turns = Math.round(quarters);
    // Um "peteleco" completa o quarto de volta na direção do movimento.
    if (velocity > FLICK_SPEED) turns = Math.ceil(quarters - 0.12);
    else if (velocity < -FLICK_SPEED) turns = Math.floor(quarters + 0.12);
    this.cube.endDrag(THREE.MathUtils.clamp(turns, -2, 2));
  }

  _startPinch() {
    const [a, b] = [...this.pointers.values()];
    this.mode = 'pinch';
    this.gesture = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  }

  _updatePinch() {
    const [a, b] = [...this.pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    this.stage.zoomBy(this.gesture.distance / distance);
    this.gesture.distance = distance;
  }

  _cancelGesture() {
    if (this.mode === 'layer') this._endLayer();
    this.mode = null;
    this.gesture = null;
  }

  _updateCursor() {
    let cursor = 'grab';
    if (this.mode === 'orbit' || this.mode === 'layer' || this.mode === 'pinch') cursor = 'grabbing';
    else if (this.mode === 'pending' || this.hoveringCube) cursor = 'pointer';
    this.dom.style.cursor = cursor;
  }

  // ---------------------------------------------------------------- ações

  resetView() {
    this._animateTo(DEFAULT_ORIENTATION);
    this.stage.zoomTo(1);
  }

  /**
   * Gira a visão para segurar o cubo no referencial { U, F } (vetores do
   * espaço local): U para cima e F de frente, com a mesma inclinação da visão
   * padrão.
   */
  orientTo(frame) {
    const u = new THREE.Vector3(...frame.U);
    const f = new THREE.Vector3(...frame.F);
    const r = new THREE.Vector3().crossVectors(u, f);
    const basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, f));
    this._animateTo(DEFAULT_ORIENTATION.clone().multiply(basis.invert()));
  }

  _animateTo(target) {
    this.velocity.set(0, 0, 0);
    this.resetAnim = { from: this.group.quaternion.clone(), to: target.clone(), t: 0 };
  }

  /** Giro comemorativo em torno do eixo vertical da tela. */
  spin(speed = 13) {
    this.resetAnim = null;
    this.velocity.copy(this._cameraAxis(1)).multiplyScalar(speed);
  }

  update(dt) {
    if (this.resetAnim) {
      const a = this.resetAnim;
      a.t = Math.min(1, a.t + dt / 0.9);
      this.group.quaternion.slerpQuaternions(a.from, a.to, easeInOutCubic(a.t));
      if (a.t >= 1) this.resetAnim = null;
      return;
    }

    if (this.mode === 'orbit') return;
    const speed = this.velocity.length();
    if (speed > 1e-3) {
      this._v.copy(this.velocity).divideScalar(speed);
      this.group.quaternion.premultiply(this._q.setFromAxisAngle(this._v, speed * dt)).normalize();
      this.velocity.multiplyScalar(Math.pow(INERTIA_DAMPING, dt));
    }
  }
}
