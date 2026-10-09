import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AXES, normalizeTurns } from './moves.js';

export { AXES, normalizeTurns };
export const HALF_PI = Math.PI / 2;

const CUBIE_SIZE = 0.95;
const STICKER_SIZE = 0.78;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const IDENTITY = new THREE.Quaternion();

// Esquema de cores ocidental: branco em cima, verde na frente, vermelho à direita.
export const FACES = [
  { key: 'R', normal: new THREE.Vector3(1, 0, 0), color: 0xff2a4f },
  { key: 'L', normal: new THREE.Vector3(-1, 0, 0), color: 0xff8a1f },
  { key: 'U', normal: new THREE.Vector3(0, 1, 0), color: 0xf4f6ff },
  { key: 'D', normal: new THREE.Vector3(0, -1, 0), color: 0xffd83a },
  { key: 'F', normal: new THREE.Vector3(0, 0, 1), color: 0x14e07f },
  { key: 'B', normal: new THREE.Vector3(0, 0, -1), color: 0x2e7dff },
];

const clamp = THREE.MathUtils.clamp;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => {
  const c1 = 1.1;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function roundedRect(size, radius) {
  const s = size / 2;
  const r = radius;
  const shape = new THREE.Shape();
  shape.moveTo(-s + r, -s);
  shape.lineTo(s - r, -s);
  shape.quadraticCurveTo(s, -s, s, -s + r);
  shape.lineTo(s, s - r);
  shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(-s + r, s);
  shape.quadraticCurveTo(-s, s, -s, s - r);
  shape.lineTo(-s, -s + r);
  shape.quadraticCurveTo(-s, -s, -s + r, -s);
  return shape;
}

function createStickerGeometry() {
  const geometry = new THREE.ExtrudeGeometry(roundedRect(STICKER_SIZE, 0.13), {
    depth: 0.006,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geometry.translate(0, 0, 0.008);
  return geometry;
}

function snapQuaternion(q) {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const e = m.elements;
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) e[i] = Math.round(e[i]);
  q.setFromRotationMatrix(m);
}

export class RubiksCube {
  constructor() {
    /** root: posição/flutuação. group: orientação controlada pelo usuário. */
    this.root = new THREE.Group();
    this.group = new THREE.Group();
    this.root.add(this.group);
    this.pivot = new THREE.Object3D();
    this.group.add(this.pivot);

    this.cubies = [];
    this.stickers = [];
    this.queue = [];
    this.current = null;
    this.dragging = null;
    this.hovered = null;
    this.hint = null;
    this.intro = null;

    /** (move, source) => void, chamado quando um giro termina. */
    this.onMove = null;

    this._build();
  }

  _build() {
    const bodyGeometry = new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 4, 0.11);
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0b0b12,
      roughness: 0.36,
      metalness: 0.2,
      clearcoat: 0.6,
      clearcoatRoughness: 0.28,
    });
    const stickerGeometry = createStickerGeometry();

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;

          const cubie = new THREE.Group();
          cubie.position.set(x, y, z);
          cubie.add(new THREE.Mesh(bodyGeometry, bodyMaterial));

          for (const face of FACES) {
            const axis = AXES.find((a) => face.normal[a] !== 0);
            if (cubie.position[axis] !== face.normal[axis]) continue;

            const material = new THREE.MeshPhysicalMaterial({
              color: face.color,
              emissive: face.color,
              emissiveIntensity: 0,
              roughness: 0.2,
              metalness: 0,
              clearcoat: 1,
              clearcoatRoughness: 0.06,
            });
            const mesh = new THREE.Mesh(stickerGeometry, material);
            mesh.position.copy(face.normal).multiplyScalar(CUBIE_SIZE / 2 - 0.006);
            mesh.quaternion.setFromUnitVectors(Z_AXIS, face.normal);
            cubie.add(mesh);

            this.stickers.push({
              mesh,
              material,
              cubie,
              face: face.key,
              normal: face.normal.clone(),
              hover: 0,
              layer: 0,
              flash: 0,
              inLayer: false,
            });
          }

          this.cubies.push(cubie);
          this.group.add(cubie);
        }
      }
    }
  }

  // ---------------------------------------------------------------- estado

  get busy() {
    return !!(this.intro || this.current || this.dragging || this.queue.length);
  }

  /** Há giros automáticos (embaralhar/resolver) em andamento? */
  get scripted() {
    return (
      (this.current && this.current.source !== 'user' && this.current.source !== 'undo') ||
      this.queue.some((m) => m.source !== 'user' && m.source !== 'undo')
    );
  }

  isSolved() {
    const colors = new Map();
    const n = new THREE.Vector3();
    for (const s of this.stickers) {
      n.copy(s.normal).applyQuaternion(s.cubie.quaternion);
      const key = `${Math.round(n.x)},${Math.round(n.y)},${Math.round(n.z)}`;
      const seen = colors.get(key);
      if (seen === undefined) colors.set(key, s.face);
      else if (seen !== s.face) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- camadas

  _attachLayer(axis, layer) {
    this.pivot.rotation.set(0, 0, 0);
    const cubies = this.cubies.filter((c) => Math.round(c.position[axis]) === layer);
    // Com o pivot sem rotação, a transformação local da peça é a mesma.
    for (const c of cubies) this.pivot.add(c);
    return cubies;
  }

  _detachLayer(cubies) {
    const q = this.pivot.quaternion;
    for (const c of cubies) {
      c.position.applyQuaternion(q);
      c.quaternion.premultiply(q);
      c.position.set(Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z));
      snapQuaternion(c.quaternion);
      this.group.add(c);
    }
    this.pivot.rotation.set(0, 0, 0);
  }

  _setLayerGlow(cubies, on) {
    for (const s of this.stickers) s.inLayer = on && cubies.includes(s.cubie);
  }

  // ---------------------------------------------------------------- giros na fila

  /** Enfileira um giro { axis, layer, turns }. Resolve quando ele termina. */
  turn(move, { source = 'user', duration = 0.2 } = {}) {
    return new Promise((resolve) => {
      this.queue.push({ ...move, source, duration, resolve });
    });
  }

  _startNext() {
    const m = this.queue.shift();
    const cubies = this._attachLayer(m.axis, m.layer);
    const manual = m.source === 'user' || m.source === 'undo';
    this.current = {
      ...m,
      from: 0,
      to: m.turns * HALF_PI,
      t: 0,
      cubies,
      ease: manual ? easeOutBack : easeInOutCubic,
    };
  }

  _finishCurrent() {
    const c = this.current;
    this.pivot.rotation[c.axis] = c.to;
    this._detachLayer(c.cubies);
    this._setLayerGlow(c.cubies, false);
    this.current = null;

    const manual = c.source === 'user' || c.source === 'undo';
    for (const s of this.stickers) {
      if (c.cubies.includes(s.cubie)) s.flash = Math.max(s.flash, manual ? 0.55 : 0.22);
    }

    const turns = normalizeTurns(c.turns);
    if (turns !== 0) this.onMove?.({ axis: c.axis, layer: c.layer, turns }, c.source);
    c.resolve?.();
  }

  /** Conclui instantaneamente tudo que está animando ou na fila. */
  flush() {
    if (this.current) this._finishCurrent();
    while (this.queue.length) {
      this._startNext();
      this._finishCurrent();
    }
  }

  // ---------------------------------------------------------------- arraste manual

  /** Pode começar a arrastar uma camada? Acelera giros manuais pendentes. */
  canDrag() {
    if (this.intro || this.dragging || this.scripted) return false;
    this.flush();
    return true;
  }

  canHover() {
    return !this.busy;
  }

  beginDrag(axis, layer) {
    const cubies = this._attachLayer(axis, layer);
    this._setLayerGlow(cubies, true);
    this.dragging = { axis, layer, cubies, angle: 0 };
  }

  setDragAngle(angle) {
    if (!this.dragging) return;
    this.dragging.angle = angle;
    this.pivot.rotation[this.dragging.axis] = angle;
  }

  /** Solta a camada, encaixando no múltiplo de 90° indicado por `turns`. */
  endDrag(turns) {
    const d = this.dragging;
    if (!d) return;
    this.dragging = null;
    const to = turns * HALF_PI;
    const distance = Math.abs(to - d.angle) / HALF_PI;
    this.current = {
      axis: d.axis,
      layer: d.layer,
      turns,
      from: d.angle,
      to,
      t: 0,
      duration: clamp(0.12 + distance * 0.16, 0.12, 0.32),
      cubies: d.cubies,
      source: 'user',
      ease: distance < 0.08 ? easeOutCubic : easeOutBack,
    };
  }

  // ---------------------------------------------------------------- destaque

  _stickerAt(hit) {
    const target = new THREE.Vector3();
    for (const a of AXES) {
      target[a] = a === hit.axis ? hit.normal[a] : clamp(Math.round(hit.point[a]), -1, 1);
    }
    const cubie = this.cubies.find((c) => c.position.distanceToSquared(target) < 0.01);
    if (!cubie) return null;
    const n = new THREE.Vector3();
    for (const s of this.stickers) {
      if (s.cubie !== cubie) continue;
      n.copy(s.normal).applyQuaternion(cubie.quaternion);
      if (n.dot(hit.normal) > 0.9) return s;
    }
    return null;
  }

  setHover(hit) {
    this.hovered = hit && this.canHover() ? this._stickerAt(hit) : null;
  }

  /** Faz pulsar as peças da camada { axis, layer } (dica do tutorial). */
  setHint(move) {
    this.hint = move ? { axis: move.axis, layer: move.layer } : null;
  }

  // ---------------------------------------------------------------- introdução

  playIntro() {
    const items = this.cubies.map((c) => {
      const home = c.position.clone();
      const dir = home.clone().normalize();
      const scatter = new THREE.Vector3().randomDirection().multiplyScalar(2.5);
      const start = home.clone().addScaledVector(dir, 6 + Math.random() * 5).add(scatter);
      const spin = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
      );
      const delay = 0.15 + Math.random() * 0.45 + (1 - home.y) * 0.12;
      c.position.copy(start);
      c.quaternion.copy(spin);
      return { c, home, start, spin, delay };
    });
    this.intro = { t: 0, items };
  }

  _updateIntro(dt) {
    const intro = this.intro;
    intro.t += dt;
    let done = true;
    for (const it of intro.items) {
      const k = clamp((intro.t - it.delay) / 1.15, 0, 1);
      if (k < 1) done = false;
      const e = easeOutCubic(k);
      it.c.position.lerpVectors(it.start, it.home, e);
      it.c.quaternion.slerpQuaternions(it.spin, IDENTITY, easeOutCubic(Math.min(1, k * 1.15)));
    }
    if (done) {
      for (const it of intro.items) {
        it.c.position.copy(it.home);
        it.c.quaternion.identity();
      }
      this.intro = null;
    }
  }

  // ---------------------------------------------------------------- loop

  update(dt, time) {
    if (this.intro) this._updateIntro(dt);

    if (!this.current && !this.dragging && !this.intro && this.queue.length) this._startNext();

    if (this.current) {
      const c = this.current;
      c.t += dt;
      const k = Math.min(1, c.t / c.duration);
      this.pivot.rotation[c.axis] = c.from + (c.to - c.from) * c.ease(k);
      if (k >= 1) this._finishCurrent();
    }

    const pulse = 0.45 + 0.12 * Math.sin(time * 7);
    const hintPulse = 0.07 + 0.07 * Math.sin(time * 4.5);
    const hint = this.hint && !this.current && !this.dragging && !this.intro ? this.hint : null;
    const hoverRate = Math.min(1, dt * 14);
    const layerRate = Math.min(1, dt * 10);
    for (const s of this.stickers) {
      s.flash = Math.max(0, s.flash - dt * 2.4);
      s.hover += ((s === this.hovered ? pulse : 0) - s.hover) * hoverRate;
      const hinted = hint && Math.round(s.cubie.position[hint.axis]) === hint.layer;
      s.layer += ((s.inLayer ? 0.16 : hinted ? hintPulse : 0) - s.layer) * layerRate;
      s.material.emissiveIntensity = Math.max(s.hover, s.layer) + s.flash;
    }
  }
}
