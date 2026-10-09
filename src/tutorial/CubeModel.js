// Modelo abstrato do cubo: 54 adesivos com posição (p), normal (n) e cor (c),
// em coordenadas inteiras do espaço local do cubo. A cor é a letra da face de
// origem (U = branco, D = amarelo, F = verde, B = azul, R = vermelho, L = laranja).

const AXIS_INDEX = { x: 0, y: 1, z: 2 };

export const vec = {
  eq: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  neg: (a) => [-a[0], -a[1], -a[2]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  key: (a) => `${a[0]},${a[1]},${a[2]}`,
};

/** Gira um vetor inteiro +90° em torno do eixo (regra da mão direita). */
export function rot90(v, axis) {
  const [x, y, z] = v;
  if (axis === 0) return [x, -z, y];
  if (axis === 1) return [z, y, -x];
  return [-y, x, z];
}

const isCenter = (p) => (p[0] !== 0) + (p[1] !== 0) + (p[2] !== 0) === 1;

export class CubeModel {
  constructor(stickers) {
    this.stickers = stickers;
  }

  /** Lê o estado atual do cubo 3D (precisa estar parado). */
  static fromCube(cube) {
    return new CubeModel(
      cube.stickers.map((s) => {
        const n = s.normal.clone().applyQuaternion(s.cubie.quaternion);
        const p = s.cubie.position;
        return {
          p: [Math.round(p.x), Math.round(p.y), Math.round(p.z)],
          n: [Math.round(n.x), Math.round(n.y), Math.round(n.z)],
          c: s.face,
        };
      }),
    );
  }

  /** Cubo resolvido na orientação original. */
  static solved() {
    const faces = { R: [1, 0, 0], L: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1] };
    const stickers = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const p = [x, y, z];
          for (const [c, n] of Object.entries(faces)) {
            const axis = n.findIndex((v) => v !== 0);
            if (p[axis] === n[axis]) stickers.push({ p: p.slice(), n: n.slice(), c });
          }
        }
      }
    }
    return new CubeModel(stickers);
  }

  clone() {
    return new CubeModel(this.stickers.map((s) => ({ p: s.p.slice(), n: s.n.slice(), c: s.c })));
  }

  apply(move) {
    const axis = AXIS_INDEX[move.axis];
    const q = ((move.turns % 4) + 4) % 4;
    if (!q) return this;
    for (const s of this.stickers) {
      if (s.p[axis] !== move.layer) continue;
      for (let i = 0; i < q; i++) {
        s.p = rot90(s.p, axis);
        s.n = rot90(s.n, axis);
      }
    }
    return this;
  }

  applyAll(moves) {
    for (const m of moves) this.apply(m);
    return this;
  }

  /** Direção atual do centro de cada cor: { U: [x,y,z], ... }. */
  centers() {
    const map = {};
    for (const s of this.stickers) if (isCenter(s.p)) map[s.c] = s.n;
    return map;
  }

  /** Peças (exceto centros) como listas de adesivos. */
  pieces() {
    const groups = new Map();
    for (const s of this.stickers) {
      if (isCenter(s.p)) continue;
      const key = vec.key(s.p);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    return [...groups.values()];
  }

  /** A peça que tem exatamente essas cores. */
  piece(colors) {
    return this.pieces().find(
      (p) => p.length === colors.length && colors.every((c) => p.some((s) => s.c === c)),
    );
  }

  pieceAt(position) {
    return this.pieces().find((p) => vec.eq(p[0].p, position));
  }

  isSolved() {
    const centers = this.centers();
    return this.stickers.every((s) => vec.eq(s.n, centers[s.c]));
  }
}

/** Cada adesivo da peça está na face do centro da sua cor. */
export function pieceSolved(piece, centers) {
  return piece.every((s) => vec.eq(s.n, centers[s.c]));
}
