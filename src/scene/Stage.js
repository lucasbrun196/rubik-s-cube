import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createStudioEnvironment } from './studioEnvironment.js';

export const CAMERA_TARGET = new THREE.Vector3(0, -0.55, 0);
const CAMERA_DIR = new THREE.Vector3(0, 0.24, 1).normalize();
const FIT_RADIUS_V = 4.1; // raio que precisa caber na altura da tela
const FIT_RADIUS_H = 3.4; // e na largura (telas em pé)
const BLOOM_STRENGTH = 0.55;

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.setClearColor(0x020309, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
    this.zoom = 1.25;
    this.zoomTarget = 1;
    this.baseDistance = 12;
    this.bloomBoost = 0;
    /** true enquanto um painel lateral (tutorial) ocupa parte da tela. */
    this.sidePanel = false;
    this.focus = { x: 0, y: 0, zoom: 1 };

    this.scene.environment = createStudioEnvironment(this.renderer);
    this.scene.environmentIntensity = 1.4;

    this._setupLights();

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_STRENGTH, 0.5, 0.98);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.updaters = [];
    this._size = { w: 0, h: 0, ratio: 0 };
    this._syncSize();
  }

  _setupLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x9fb4ff, 0x16071f, 0.25));

    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 7, 8);
    s.add(key);

    const rim = new THREE.DirectionalLight(0x8a7dff, 1.2);
    rim.position.set(-6, 3, -7);
    s.add(rim);

    const fill = new THREE.DirectionalLight(0x5ad1ff, 0.3);
    fill.position.set(-5, -4, 5);
    s.add(fill);

    this.cyanLight = new THREE.PointLight(0x2ee6ff, 9, 0, 2);
    this.magentaLight = new THREE.PointLight(0xff3bd4, 9, 0, 2);
    s.add(this.cyanLight, this.magentaLight);
  }

  /**
   * Conferido a cada quadro: cobre redimensionamento, mudança de zoom/DPR do
   * navegador e janelas que começam ocultas (tamanho zero).
   */
  _syncSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio, 2);
    const size = this._size;
    if (!w || !h || (w === size.w && h === size.h && ratio === size.ratio)) return;
    Object.assign(size, { w, h, ratio });

    const aspect = w / h;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    // Distância para a esfera do cubo caber na vertical e na horizontal.
    const halfV = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    this.baseDistance = Math.max(FIT_RADIUS_V / Math.sin(halfV), FIT_RADIUS_H / Math.sin(halfH));
  }

  zoomBy(factor) {
    this.zoomTo(this.zoomTarget * factor);
  }

  zoomTo(value) {
    this.zoomTarget = THREE.MathUtils.clamp(value, 0.62, 1.8);
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  start() {
    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const time = now / 1000;
      this._syncSize();
      for (const fn of this.updaters) fn(dt, time);
      this._update(dt, time);
      this.composer.render();
    });
  }

  _update(dt, time) {
    const k = 1 - Math.exp(-dt * 7);
    this.zoom += (this.zoomTarget - this.zoom) * k;

    // Com um painel lateral aberto, desloca a imagem para o cubo ficar livre:
    // para a esquerda no desktop, para cima (e mais longe) no celular.
    const { w, h } = this._size;
    const target = { x: 0, y: 0, zoom: 1 };
    if (this.sidePanel && w > 760) target.x = Math.min(210, w * 0.16);
    else if (this.sidePanel) Object.assign(target, { y: Math.min(h * 0.16, 140), zoom: 1.2 });
    for (const key of ['x', 'y', 'zoom']) this.focus[key] += (target[key] - this.focus[key]) * k;
    if (Math.abs(this.focus.x) > 0.5 || Math.abs(this.focus.y) > 0.5) {
      this.camera.setViewOffset(w, h, this.focus.x, this.focus.y, w, h);
    } else if (this.camera.view?.enabled) {
      this.camera.clearViewOffset();
    }

    this.camera.position
      .copy(CAMERA_DIR)
      .multiplyScalar(this.baseDistance * this.zoom * this.focus.zoom)
      .add(CAMERA_TARGET);
    this.camera.lookAt(CAMERA_TARGET);

    const a = time * 0.45;
    this.cyanLight.position.set(Math.cos(a) * 5.5, 2.5 + Math.sin(a * 1.3) * 1.5, Math.sin(a) * 5.5);
    this.magentaLight.position.set(Math.cos(a + Math.PI) * 5.5, -1.5 + Math.cos(a * 0.9) * 1.5, Math.sin(a + Math.PI) * 5.5);

    this.bloomBoost = Math.max(0, this.bloomBoost - dt * 0.9);
    this.bloom.strength = BLOOM_STRENGTH + this.bloomBoost * 0.9;
  }
}
