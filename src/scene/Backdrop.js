import * as THREE from 'three';
import { CAMERA_TARGET } from './Stage.js';

const NOISE_GLSL = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a = pow(a, 1.8);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

export class Backdrop {
  constructor(stage) {
    this.stage = stage;
    this.scene = stage.scene;
    this.flash = 0;
    this.pointer = new THREE.Vector2();
    this.parallax = new THREE.Group();
    this.scene.add(this.parallax);

    this.uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: stage.renderer.getPixelRatio() },
    };

    this._nebula();
    this._stars();
    this._dust();
    this._halo();
    this._pedestal();

    window.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });
  }

  _nebula() {
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float t = uTime * 0.018;
          float n1 = fbm(d * 2.1 + vec3(t, -t * 0.6, t * 0.4));
          float n2 = fbm(d * 3.4 - vec3(t * 0.7, t * 0.3, -t) + n1 * 1.6);
          float n3 = fbm(d * 6.0 + n2 * 2.0 + t);

          vec3 col = vec3(0.0025, 0.003, 0.009);
          col += vec3(0.04, 0.006, 0.075) * smoothstep(0.45, 0.88, n2);
          col += vec3(0.0, 0.025, 0.045) * smoothstep(0.5, 0.92, n1);
          col += vec3(0.05, 0.01, 0.035) * smoothstep(0.62, 0.95, n3) * 0.6;

          // Mais luz atrás do cubo, escurecendo nas bordas.
          float behind = smoothstep(0.1, -0.95, d.z);
          col *= 0.25 + 0.75 * behind;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), material);
    mesh.renderOrder = -10;
    this.parallax.add(mesh);
  }

  _stars() {
    const count = 2600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const palette = [0xffffff, 0xcfe0ff, 0xa9c4ff, 0xffd9f2, 0xfff1c9, 0x9ff3ff].map((c) => new THREE.Color(c));
    const v = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(55 + Math.random() * 80);
      positions.set([v.x, v.y, v.z], i * 3);
      const c = palette[Math.floor(Math.random() * palette.length)];
      const bright = Math.random() < 0.06 ? 2.2 : 0.55 + Math.random() * 0.6;
      colors.set([c.r * bright, c.g * bright, c.b * bright], i * 3);
      sizes[i] = Math.random() < 0.06 ? 2.6 + Math.random() * 2 : 0.8 + Math.random() * 1.3;
      phases[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aPhase;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 2.2) + aPhase * 40.0);
          vColor = aColor;
          vAlpha = twinkle;
          gl_PointSize = aSize * uPixelRatio * (260.0 / -mv.z);
        }
      `,
      fragmentShader: POINT_FRAGMENT,
    });

    this.stars = new THREE.Points(geometry, material);
    this.stars.renderOrder = -5;
    this.parallax.add(this.stars);
  }

  _dust() {
    const count = 320;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const palette = [0x5eead4, 0x818cf8, 0xe879f9, 0x38bdf8].map((c) => new THREE.Color(c));

    for (let i = 0; i < count; i++) {
      let x, z;
      do {
        x = (Math.random() * 2 - 1) * 16;
        z = -18 + Math.random() * 24;
      } while (Math.hypot(x, z) < 4.2);
      positions.set([x, (Math.random() * 2 - 1) * 10, z], i * 3);
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = 2 + Math.random() * 5;
      phases[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aPhase;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * (0.12 + aPhase * 0.25) + 10.0, 20.0) - 10.0;
          p.x += sin(uTime * 0.25 + aPhase * 30.0) * 0.6;
          p.z += cos(uTime * 0.2 + aPhase * 20.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float edge = smoothstep(10.0, 7.0, abs(p.y));
          float near = smoothstep(1.5, 5.0, -mv.z);
          vColor = aColor;
          vAlpha = edge * near * (0.07 + 0.07 * sin(uTime * 1.3 + aPhase * 12.0));
          gl_PointSize = aSize * uPixelRatio * (70.0 / -mv.z);
        }
      `,
      fragmentShader: POINT_FRAGMENT,
    });

    this.dust = new THREE.Points(geometry, material);
    this.scene.add(this.dust);
  }

  _halo() {
    this.haloUniforms = {
      uTime: this.uniforms.uTime,
      uIntensity: { value: 0.4 },
      uColorA: { value: new THREE.Color(0x2563eb) },
      uColorB: { value: new THREE.Color(0xa21caf) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.haloUniforms,
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
        uniform float uIntensity;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float ang = atan(p.y, p.x);
          float glow = exp(-r * r * 5.0) * 0.8 + exp(-r * 3.0) * 0.25;
          float rays = 0.8 + 0.2 * sin(ang * 7.0 + uTime * 0.35) * sin(ang * 3.0 - uTime * 0.2);
          vec3 col = mix(uColorA, uColorB, 0.5 + 0.5 * sin(ang + uTime * 0.3));
          float a = glow * rays * smoothstep(1.0, 0.6, r) * uIntensity;
          gl_FragColor = vec4(col * a, 1.0);
        }
      `,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), material);
    this.halo.position.set(0, -0.3, -5);
    this.halo.lookAt(CAMERA_TARGET.clone().add(new THREE.Vector3(0, 3, 12)));
    this.scene.add(this.halo);
  }

  _pedestal() {
    const y = -2.95;
    this.pedestal = new THREE.Group();
    this.pedestal.position.y = y;
    this.scene.add(this.pedestal);

    const flat = (geometry, uniforms, fragment) => {
      const material = new THREE.ShaderMaterial({
        uniforms: { uTime: this.uniforms.uTime, uIntensity: { value: 1 }, ...uniforms },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          varying vec2 vPos;
          void main() {
            vPos = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: fragment,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      this.pedestal.add(mesh);
      return mesh;
    };

    const colors = {
      uColorA: { value: new THREE.Color(0x22d3ee) },
      uColorB: { value: new THREE.Color(0x8b5cf6) },
    };

    // Poça de luz sob o cubo.
    this.pool = flat(
      new THREE.CircleGeometry(4.2, 96),
      colors,
      /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vPos;
        void main() {
          float r = length(vPos) / 4.2;
          float g = exp(-r * r * 6.0) * 0.45 + smoothstep(1.0, 0.0, r) * 0.05;
          vec3 col = mix(uColorA, uColorB, 0.5 + 0.5 * sin(atan(vPos.y, vPos.x) * 2.0 + uTime * 0.4));
          gl_FragColor = vec4(col * g * uIntensity, 1.0);
        }
      `,
    );

    // Anel principal com arcos girando.
    this.ring = flat(
      new THREE.RingGeometry(2.62, 2.78, 256, 1),
      colors,
      /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vPos;
        void main() {
          float r = length(vPos);
          float ang = atan(vPos.y, vPos.x);
          float w = (r - 2.62) / 0.16;
          float edge = smoothstep(0.0, 0.35, w) * smoothstep(1.0, 0.65, w);
          float dash = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(ang * 3.0 - uTime * 0.9));
          vec3 col = mix(uColorA, uColorB, 0.5 + 0.5 * sin(ang + uTime * 0.5));
          gl_FragColor = vec4(col * edge * (0.25 + 1.2 * dash) * uIntensity, 1.0);
        }
      `,
    );

    // Anel externo com marcações.
    this.ticks = flat(
      new THREE.RingGeometry(3.25, 3.36, 512, 1),
      colors,
      /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vPos;
        void main() {
          float ang = atan(vPos.y, vPos.x) / 6.2831853 + 0.5;
          float tick = step(0.55, fract(ang * 120.0 + uTime * 0.06));
          float sweep = pow(0.5 + 0.5 * sin(ang * 6.2831853 + uTime * 0.6), 6.0);
          vec3 col = mix(uColorB, uColorA, sweep);
          gl_FragColor = vec4(col * tick * (0.12 + 0.6 * sweep) * uIntensity, 1.0);
        }
      `,
    );

    // Cortina holográfica subindo do anel.
    const curtainMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uIntensity: { value: 1 }, ...colors },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
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
        uniform float uIntensity;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;
        void main() {
          float fade = pow(1.0 - vUv.y, 3.0);
          float lines = 0.6 + 0.4 * sin(vUv.x * 6.2831853 * 48.0 + uTime * 1.5);
          float scan = 0.7 + 0.3 * sin(vUv.y * 40.0 - uTime * 4.0);
          vec3 col = mix(uColorA, uColorB, vUv.y + 0.3 * sin(vUv.x * 6.2831853 + uTime * 0.5));
          gl_FragColor = vec4(col * fade * lines * scan * 0.1 * uIntensity, 1.0);
        }
      `,
    });
    const curtain = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 1.8, 128, 1, true), curtainMaterial);
    curtain.position.y = 0.9;
    this.pedestal.add(curtain);
    this.curtain = curtain;
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
    this.uniforms.uPixelRatio.value = this.stage.renderer.getPixelRatio();
    this.flash = Math.max(0, this.flash - dt * 1.3);

    this.haloUniforms.uIntensity.value = 0.22 + this.flash * 1.2;
    const pedestalGlow = 1 + this.flash * 1.4;
    for (const m of [this.pool, this.ring, this.ticks, this.curtain]) {
      m.material.uniforms.uIntensity.value = pedestalGlow;
    }

    // Leve paralaxe do céu acompanhando o mouse.
    const k = 1 - Math.exp(-dt * 2);
    this.parallax.rotation.y += (this.pointer.x * 0.05 + time * 0.004 - this.parallax.rotation.y) * k;
    this.parallax.rotation.x += (this.pointer.y * 0.03 - this.parallax.rotation.x) * k;
    this.dust.rotation.y = this.parallax.rotation.y * 1.8;
  }
}
