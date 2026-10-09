import * as THREE from 'three';
import { normalizeTurns } from '../cube/moves.js';

const HALF = 1.78; // meia largura do contorno (as peças vão até ~1.48)
const EXPONENT = 2 / 5; // superelipse: quadrado de cantos arredondados
const TUBE = 0.055;
const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
const COLORS = {
  normal: new THREE.Color(0x5eead4),
  warn: new THREE.Color(0xffb020),
};

/** Trecho do contorno quadrado-arredondado em volta de uma camada (plano XY). */
class LayerOutline extends THREE.Curve {
  constructor(start, end) {
    super();
    this.start = start;
    this.end = end;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const a = this.start + (this.end - this.start) * t;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return target.set(
      Math.sign(c) * Math.pow(Math.abs(c), EXPONENT) * HALF,
      Math.sign(s) * Math.pow(Math.abs(s), EXPONENT) * HALF,
      0,
    );
  }
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Seta brilhante que abraça a camada que deve ser girada. Fica presa ao cubo
 * (gira junto com ele) e se posiciona sempre do lado visível.
 */
export class MoveArrow {
  constructor(parent) {
    this.root = new THREE.Group();
    this.pulse = new THREE.Group();
    this.root.add(this.pulse);
    this.root.visible = false;
    parent.add(this.root);

    this.uniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: COLORS.normal.clone() },
    };
    this.arcMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          // Faixas correndo na direção do giro.
          float stripe = fract(vUv.x * 7.0 - uTime * 1.4);
          float pulse = 0.55 + 0.45 * smoothstep(0.0, 0.45, stripe) * smoothstep(1.0, 0.55, stripe);
          float tail = smoothstep(0.0, 0.2, vUv.x);
          gl_FragColor = vec4(uColor * 2.2 * pulse, uOpacity * tail);
        }
      `,
    });
    this.headMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.normal.clone().multiplyScalar(2.4),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.arc = new THREE.Mesh(new THREE.BufferGeometry(), this.arcMaterial);
    const headGeometry = new THREE.ConeGeometry(0.16, 0.42, 20);
    this.heads = [new THREE.Mesh(headGeometry, this.headMaterial), new THREE.Mesh(headGeometry, this.headMaterial)];
    this.pulse.add(this.arc, ...this.heads);

    this.arcLength = 0;
    this.double = false;
    this.opacity = 0;
    this.visible = false;
    this.angle = null;
    this.builtAngle = null;
    this.key = null;
    this._v = new THREE.Vector3();
    this._up = new THREE.Vector3();
  }

  _build(center) {
    const half = this.arcLength / 2;
    const curve = new LayerOutline(center - half, center + half);
    this.arc.geometry.dispose();
    this.arc.geometry = new THREE.TubeGeometry(curve, 120, TUBE, 10, false);

    const place = (head, t) => {
      const tangent = curve.getTangentAt(t);
      head.position.copy(curve.getPointAt(t)).addScaledVector(tangent, 0.12);
      head.quaternion.setFromUnitVectors(Y, tangent);
    };
    place(this.heads[0], 1);
    place(this.heads[1], 0.5);
    this.heads[1].visible = this.double;
    this.builtAngle = center;
  }

  /** Mostra a seta para o giro { axis, layer, turns }. */
  show(move, { warn = false } = {}) {
    const turns = normalizeTurns(move.turns);
    const key = `${move.axis}${move.layer}${turns}${warn}`;
    if (key === this.key && this.visible) return;
    this.key = key;

    const axis = new THREE.Vector3();
    axis[move.axis] = 1;
    // A seta sempre gira no sentido anti-horário em torno de `direction`.
    // Como `direction` é um eixo, os eixos locais continuam alinhados ao cubo.
    const direction = axis.clone().multiplyScalar(turns === 2 ? 1 : Math.sign(turns));
    this.root.position.copy(axis).multiplyScalar(move.layer);
    this.root.quaternion.setFromUnitVectors(Z, direction);
    this.arcLength = THREE.MathUtils.degToRad(turns === 2 ? 250 : 150);
    this.double = turns === 2;

    const color = warn ? COLORS.warn : COLORS.normal;
    this.uniforms.uColor.value.copy(color);
    this.headMaterial.color.copy(color).multiplyScalar(2.4);
    this.opacity = 0; // reaparece suavemente a cada novo giro
    this.angle = null;
    this.builtAngle = null;
    this.visible = true;
  }

  hide() {
    this.visible = false;
    this.key = null;
  }

  /** Ângulo (no plano da camada) do lado mais visível para a câmera. */
  _visibleAngle(camera) {
    this.root.updateWorldMatrix(true, false);
    const cam = this.root.worldToLocal(this._v.copy(camera.position));
    const up = this._up.setFromMatrixColumn(camera.matrixWorld, 1).add(camera.position);
    this.root.worldToLocal(up).sub(cam);
    const length = cam.length();
    const planar = Math.hypot(cam.x, cam.y) / length;
    // De lado: centraliza no lado da camada voltado para a câmera.
    // De frente para a face: coloca o arco na parte de cima.
    return Math.atan2((cam.y / length) * planar + up.y * 0.45, (cam.x / length) * planar + up.x * 0.45);
  }

  update(dt, time, camera) {
    const target = this.visible ? 1 : 0;
    this.opacity += (target - this.opacity) * Math.min(1, dt * 7);
    this.root.visible = this.opacity > 0.01;
    if (!this.root.visible) return;

    this.uniforms.uTime.value = time;
    this.uniforms.uOpacity.value = this.opacity;
    this.headMaterial.opacity = this.opacity;
    this.pulse.scale.setScalar(1 + 0.02 * Math.sin(time * 5));

    const wanted = this._visibleAngle(camera);
    if (this.angle === null) this.angle = wanted;
    this.angle = wrap(this.angle + wrap(wanted - this.angle) * Math.min(1, dt * 6));
    if (this.builtAngle === null || Math.abs(wrap(this.angle - this.builtAngle)) > 0.015) {
      this._build(this.angle);
    }
  }
}
