import * as THREE from 'three';

/**
 * Estúdio escuro com algumas softboxes, usado só para gerar os reflexos
 * (PMREM). Intensidades contidas para os adesivos não estourarem no bloom.
 */
export function createStudioEnvironment(renderer) {
  const scene = new THREE.Scene();

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float h = smoothstep(-0.4, 1.0, vDir.y);
          vec3 col = mix(vec3(0.012, 0.01, 0.025), vec3(0.11, 0.12, 0.2), h);
          col += vec3(0.08, 0.02, 0.12) * pow(max(0.0, -vDir.z), 3.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  scene.add(sky);

  const panel = (width, height, color, intensity, position) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.copy(position);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };

  panel(16, 7, 0xffffff, 2.4, new THREE.Vector3(2, 20, 6)); // softbox de cima
  panel(4, 14, 0x67e8f9, 1.6, new THREE.Vector3(-19, 3, 5)); // faixa ciano
  panel(4, 14, 0xf0abfc, 1.6, new THREE.Vector3(19, 1, -6)); // faixa magenta
  panel(12, 3, 0xffffff, 0.7, new THREE.Vector3(0, -3, 22)); // preenchimento frontal
  panel(8, 8, 0x818cf8, 0.9, new THREE.Vector3(-6, -18, -8)); // rebote de baixo

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.035).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return texture;
}
