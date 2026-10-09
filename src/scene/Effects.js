import * as THREE from 'three';

class Confetti {
  constructor(colors, count = 420) {
    this.count = count;
    this.particles = [];
    this.active = false;
    this._dummy = new THREE.Object3D();

    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.07), material, count);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;

    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      color.set(colors[i % colors.length]).multiplyScalar(1.5);
      this.mesh.setColorAt(i, color);
      this.particles.push({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        axis: new THREE.Vector3(),
        angle: 0,
        spin: 0,
        life: 0,
        maxLife: 0,
        scale: 1,
        seed: Math.random() * 100,
      });
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  burst(origin) {
    for (const p of this.particles) {
      p.p.copy(origin).add(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 1.3));
      const dir = new THREE.Vector3().randomDirection();
      dir.y = Math.abs(dir.y) * 0.9 + 0.25;
      p.v.copy(dir.normalize()).multiplyScalar(5 + Math.random() * 9);
      p.axis.randomDirection();
      p.angle = Math.random() * Math.PI * 2;
      p.spin = 4 + Math.random() * 10;
      p.life = 0;
      p.maxLife = 2.8 + Math.random() * 1.8;
      p.scale = 0.7 + Math.random() * 0.8;
    }
    this.active = true;
    this.mesh.visible = true;
  }

  update(dt) {
    if (!this.active) return;
    let alive = 0;
    const d = this._dummy;
    const drag = Math.pow(0.12, dt);
    this.particles.forEach((p, i) => {
      p.life += dt;
      let s = 0;
      if (p.life < p.maxLife) {
        alive++;
        p.v.y -= 7 * dt;
        p.v.multiplyScalar(drag);
        p.v.x += Math.sin(p.life * 6 + p.seed) * dt * 1.6;
        p.v.z += Math.cos(p.life * 5 + p.seed) * dt * 1.6;
        p.p.addScaledVector(p.v, dt);
        p.angle += p.spin * dt;
        s = p.scale * Math.min(1, (p.maxLife - p.life) / 0.6);
      }
      d.position.copy(p.p);
      d.quaternion.setFromAxisAngle(p.axis, p.angle);
      d.scale.setScalar(s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) {
      this.active = false;
      this.mesh.visible = false;
    }
  }
}

class Sparks {
  constructor(colors, count = 360) {
    const dirs = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const lives = new Float32Array(count);
    const sizes = new Float32Array(count);
    const tints = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      v.randomDirection();
      dirs.set([v.x, v.y, v.z], i * 3);
      speeds[i] = 4 + Math.random() * 11;
      lives[i] = 0.8 + Math.random() * 1.4;
      sizes[i] = 2 + Math.random() * 4;
      c.set(Math.random() < 0.5 ? 0xffffff : colors[i % colors.length]);
      tints.set([c.r, c.g, c.b], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(tints, 3));

    this.uniforms = { uTime: { value: 99 }, uPixelRatio: { value: 1 } };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute vec3 aDir;
        attribute float aSpeed;
        attribute float aLife;
        attribute float aSize;
        attribute vec3 aColor;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float t = uTime;
          float k = 2.4;
          vec3 p = aDir * aSpeed * (1.0 - exp(-k * t)) / k;
          p.y -= 0.8 * t * t;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float life = clamp(t / aLife, 0.0, 1.0);
          vAlpha = (1.0 - life) * (1.0 - life);
          vColor = aColor * 2.2;
          float twinkle = 0.6 + 0.4 * sin(t * 24.0 + aSpeed * 13.0);
          gl_PointSize = aSize * uPixelRatio * twinkle * (30.0 / -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, a * a * vAlpha);
        }
      `,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  burst(origin, pixelRatio) {
    this.points.position.copy(origin);
    this.uniforms.uTime.value = 0;
    this.uniforms.uPixelRatio.value = pixelRatio;
    this.points.visible = true;
  }

  update(dt) {
    if (!this.points.visible) return;
    this.uniforms.uTime.value += dt;
    if (this.uniforms.uTime.value > 2.5) this.points.visible = false;
  }
}

class Shockwave {
  constructor() {
    this.uniforms = { uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0x9be7ff) } };
    const material = new THREE.ShaderMaterial({
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
        uniform float uAlpha;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float r = length(vUv * 2.0 - 1.0);
          float ring = smoothstep(0.7, 0.93, r) * smoothstep(1.0, 0.93, r);
          float inner = smoothstep(0.93, 0.0, r) * 0.12;
          gl_FragColor = vec4(uColor * 2.0, (ring + inner) * uAlpha);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.mesh.visible = false;
    this.t = 1;
  }

  burst(origin) {
    this.mesh.position.copy(origin);
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt, camera) {
    if (!this.mesh.visible) return;
    this.t += dt / 1.1;
    const e = 1 - Math.pow(1 - Math.min(this.t, 1), 3);
    this.mesh.scale.setScalar(2 + e * 14);
    this.mesh.quaternion.copy(camera.quaternion);
    this.uniforms.uAlpha.value = (1 - e) * 0.9;
    if (this.t >= 1) this.mesh.visible = false;
  }
}

export class Effects {
  constructor(stage, backdrop, colors) {
    this.stage = stage;
    this.backdrop = backdrop;
    this.confetti = new Confetti(colors);
    this.sparks = new Sparks(colors);
    this.shockwave = new Shockwave();
    stage.scene.add(this.confetti.mesh, this.sparks.points, this.shockwave.mesh);
  }

  /** Pequeno brilho no cenário a cada movimento. */
  pulse(amount = 0.12) {
    this.backdrop.flash = Math.min(1, this.backdrop.flash + amount);
  }

  celebrate(origin = new THREE.Vector3()) {
    this.confetti.burst(origin);
    this.sparks.burst(origin, this.stage.renderer.getPixelRatio());
    this.shockwave.burst(origin);
    this.backdrop.flash = 1;
    this.stage.bloomBoost = 1;
  }

  update(dt) {
    this.confetti.update(dt);
    this.sparks.update(dt);
    this.shockwave.update(dt, this.stage.camera);
  }
}
