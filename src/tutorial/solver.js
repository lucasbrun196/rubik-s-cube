// Resolvedor pelo método das camadas (iniciante). Gera uma lista de passos, cada
// um com o algoritmo a fazer, a orientação em que o cubo deve ser segurado e uma
// explicação. Os giros são devolvidos no espaço local do cubo 3D.
import { AXES, normalizeTurns } from '../cube/moves.js';
import { CubeModel, pieceSolved, rot90, vec } from './CubeModel.js';

const WHITE = 'U';
const YELLOW = 'D';
const SIDES = ['F', 'R', 'B', 'L'];

/** Nome da cor no feminino (peça/aresta) e no masculino (centro). */
export const COLOR_NAMES = {
  U: ['branca', 'branco'],
  D: ['amarela', 'amarelo'],
  F: ['verde', 'verde'],
  B: ['azul', 'azul'],
  R: ['vermelha', 'vermelho'],
  L: ['laranja', 'laranja'],
};
const fem = (c) => COLOR_NAMES[c][0];
const masc = (c) => COLOR_NAMES[c][1];

export const STAGES = [
  {
    title: 'Cruz branca',
    goal: 'Com o branco em cima, forme uma cruz branca. Cada aresta também precisa combinar com o centro da lateral, formando um "T" em cada lado.',
  },
  {
    title: 'Cantos brancos',
    goal: 'Vire o cubo: branco para baixo. Encaixe os 4 cantos brancos para completar a primeira camada, sempre com R U R\' U\'.',
  },
  {
    title: 'Segunda camada',
    goal: 'Encaixe as 4 arestas do meio (as que não têm amarelo) com o algoritmo da direita ou o da esquerda.',
  },
  {
    title: 'Cruz amarela',
    goal: 'Forme uma cruz amarela no topo com F R U R\' U\' F\'. Por enquanto as laterais não precisam combinar.',
  },
  {
    title: 'Arestas amarelas',
    goal: 'Faça as laterais da cruz amarela combinarem com os centros usando R U R\' U R U2 R\'.',
  },
  {
    title: 'Posicionar cantos',
    goal: 'Leve cada canto amarelo ao seu lugar (mesmo que girado) com U R U\' L\' U R\' U\' L.',
  },
  {
    title: 'Girar cantos',
    goal: 'Gire os cantos até o amarelo ficar para cima com R\' D\' R D. As camadas de baixo vão bagunçar no meio do caminho: confie, elas voltam no final!',
  },
];

export const ALGS = {
  sexy: "R U R' U'",
  right: "U R U' R' U' F' U F",
  left: "U' L' U L U F U' F'",
  cross: "F R U R' U' F'",
  sune: "R U R' U R U2 R'",
  niklas: "U R U' L' U R' U' L",
  twist: "R' D' R D",
};
const U_TURNS = ['', 'U', 'U2', "U'"];
const repeat = (alg, n) => Array(n).fill(alg).join(' ');

// ------------------------------------------------------------------ notação

/** Direção de cada face num referencial { U, F } (vetores do espaço local). */
export function faceDir(frame, letter) {
  const right = vec.cross(frame.U, frame.F);
  switch (letter) {
    case 'U': return frame.U;
    case 'D': return vec.neg(frame.U);
    case 'F': return frame.F;
    case 'B': return vec.neg(frame.F);
    case 'R': return right;
    case 'L': return vec.neg(right);
    default: throw new Error(`Face desconhecida: ${letter}`);
  }
}

function dirToMove(dir, suffix) {
  const a = dir.findIndex((v) => v !== 0);
  const sign = dir[a];
  // Horário olhando para a face = giro negativo em torno da normal dela.
  const turns = suffix === '2' ? 2 : suffix === "'" ? sign : -sign;
  return { axis: AXES[a], layer: sign, turns };
}

/** "R U R' U'" -> giros no espaço local, segurando o cubo no referencial dado. */
export function parseAlg(alg, frame) {
  return alg
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ({ ...dirToMove(faceDir(frame, token[0]), token.slice(1)), notation: token }));
}

export function notationFor(move, frame) {
  if (move.layer === 0) return null;
  const dir = [0, 0, 0];
  dir[AXES.indexOf(move.axis)] = move.layer;
  const letter = 'UDFBRL'.split('').find((l) => vec.eq(faceDir(frame, l), dir));
  const t = normalizeTurns(move.turns);
  return letter + (t === 2 ? '2' : t === -move.layer ? '' : "'");
}

// ------------------------------------------------------------------ busca da cruz (IDA*)

// Cada "slot" é um lugar de adesivo: posição + normal. Os giros viram tabelas.
const SLOTS = [];
const SLOT_INDEX = new Map();
for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      const p = [x, y, z];
      for (let a = 0; a < 3; a++) {
        if (!p[a]) continue;
        const n = [0, 0, 0];
        n[a] = p[a];
        SLOT_INDEX.set(`${vec.key(p)}|${vec.key(n)}`, SLOTS.length);
        SLOTS.push({ p, n });
      }
    }
  }
}
const slotOf = (p, n) => SLOT_INDEX.get(`${vec.key(p)}|${vec.key(n)}`);

const FACE_MOVES = [];
for (let a = 0; a < 3; a++) {
  for (const sign of [1, -1]) {
    for (const turns of [-sign, sign, 2]) FACE_MOVES.push({ axis: AXES[a], layer: sign, turns });
  }
}
const MOVE_TABLES = FACE_MOVES.map((move) => {
  const a = AXES.indexOf(move.axis);
  const q = ((move.turns % 4) + 4) % 4;
  return SLOTS.map(({ p, n }) => {
    if (p[a] !== move.layer) return slotOf(p, n);
    let pp = p;
    let nn = n;
    for (let i = 0; i < q; i++) {
      pp = rot90(pp, a);
      nn = rot90(nn, a);
    }
    return slotOf(pp, nn);
  });
});

const distanceCache = new Map();
/** Distância (em giros) de cada estado de uma aresta até o estado `home`. */
function edgeDistances(home) {
  const key = home.join(',');
  if (distanceCache.has(key)) return distanceCache.get(key);
  const dist = new Map([[home[0] * 64 + home[1], 0]]);
  let frontier = [home];
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const [s0, s1] of frontier) {
      for (const table of MOVE_TABLES) {
        const k = table[s0] * 64 + table[s1];
        if (dist.has(k)) continue;
        dist.set(k, d);
        next.push([table[s0], table[s1]]);
      }
    }
    frontier = next;
  }
  distanceCache.set(key, dist);
  return dist;
}

/** Menor sequência que leva todas as arestas rastreadas para casa. */
function idaStar(edges, maxDepth = 10) {
  const state = edges.flatMap((e) => e.slots);
  const heuristic = (st) => {
    let h = 0;
    for (let i = 0; i < edges.length; i++) {
      h = Math.max(h, edges[i].dist.get(st[2 * i] * 64 + st[2 * i + 1]));
    }
    return h;
  };
  const path = [];
  const search = (st, g, bound, prev) => {
    const h = heuristic(st);
    if (h === 0) return true;
    if (g + h > bound) return false;
    for (let i = 0; i < FACE_MOVES.length; i++) {
      const move = FACE_MOVES[i];
      // Não repete a mesma face e fixa a ordem de faces opostas (comutam).
      if (prev && prev.axis === move.axis && prev.layer >= move.layer) continue;
      const table = MOVE_TABLES[i];
      path.push(move);
      if (search(st.map((s) => table[s]), g + 1, bound, move)) return true;
      path.pop();
    }
    return false;
  };
  for (let bound = heuristic(state); bound <= maxDepth; bound++) {
    if (search(state, 0, bound, null)) return path.slice();
  }
  throw new Error('Não encontrei solução para a cruz');
}

// ------------------------------------------------------------------ utilidades das etapas

function sidesOf(position, up) {
  // Componentes laterais de uma posição (remove a parte na direção de `up`).
  const dirs = [];
  for (let a = 0; a < 3; a++) {
    if (!position[a] || up[a]) continue;
    const d = [0, 0, 0];
    d[a] = position[a];
    dirs.push(d);
  }
  return dirs;
}

function sideName(frame, dir) {
  if (vec.eq(dir, frame.F)) return 'frente';
  if (vec.eq(dir, vec.neg(frame.F))) return 'trás';
  return vec.eq(dir, vec.cross(frame.U, frame.F)) ? 'direita' : 'esquerda';
}

/** Entre duas laterais vizinhas, a que fica na frente quando a outra é a direita. */
function frontFor(up, a, b) {
  return vec.eq(vec.cross(up, a), b) ? a : b;
}

/** Menor k tal que, após U^k, `test` é verdadeiro. */
function findUTurn(model, frame, test) {
  for (let k = 0; k < 4; k++) {
    if (test(model.clone().applyAll(parseAlg(U_TURNS[k], frame)))) return k;
  }
  throw new Error('Nenhum giro de U serve');
}

/** Quantas vezes repetir `alg` até `test` ser verdadeiro. */
function repetitions(model, frame, alg, test, max) {
  const sim = model.clone();
  const moves = parseAlg(alg, frame);
  for (let n = 1; n <= max; n++) {
    sim.applyAll(moves);
    if (test(sim)) return n;
  }
  throw new Error(`Repetições demais de ${alg}`);
}

/** Busca em largura pela menor sequência de algoritmos que atinge `goal`. */
function searchAlgs(model, options, goal, maxDepth) {
  if (goal(model)) return [];
  let frontier = [{ model, path: [] }];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const option of options) {
        const sim = node.model.clone().applyAll(parseAlg(option.alg, option.frame));
        const path = [...node.path, option];
        if (goal(sim)) return path;
        next.push({ model: sim, path });
      }
    }
    frontier = next;
  }
  throw new Error('Busca de algoritmos sem solução');
}

const ufr = (frame) => vec.add(frame.U, vec.add(frame.F, vec.cross(frame.U, frame.F)));
const yellowSticker = (piece) => piece.find((s) => s.c === YELLOW);
const isYellowEdge = (p) => p.length === 2 && p.some((s) => s.c === YELLOW);
const isYellowCorner = (p) => p.length === 3 && p.some((s) => s.c === YELLOW);

// ------------------------------------------------------------------ etapas

function solveCross({ m, C, push }) {
  const up = C[WHITE];
  const done = SIDES.filter((c) => pieceSolved(m.piece([WHITE, c]), C));
  const tracker = (c) => {
    const piece = m.piece([WHITE, c]);
    const w = piece.find((s) => s.c === WHITE);
    const o = piece.find((s) => s.c === c);
    const home = vec.add(up, C[c]);
    return {
      slots: [slotOf(w.p, w.n), slotOf(o.p, o.n)],
      dist: edgeDistances([slotOf(home, up), slotOf(home, C[c])]),
    };
  };

  while (done.length < 4) {
    // Resolve primeiro a aresta mais rápida, sem desfazer as já colocadas.
    let best = null;
    for (const c of SIDES.filter((s) => !done.includes(s))) {
      const path = idaStar([tracker(c), ...done.map(tracker)]);
      if (!best || path.length < best.path.length) best = { c, path };
    }
    const frame = { U: up, F: C[best.c] };
    const moves = best.path.map((mv) => ({ ...mv, notation: notationFor(mv, frame) }));
    const plural = done.length === 3 ? 'última' : done.length ? 'próxima' : 'primeira';
    push(0, frame, `Leve a ${plural} aresta, a branca e ${fem(best.c)}, para o topo, ao lado do centro ${masc(best.c)}. Siga as setas: ${moves.length} giro${moves.length > 1 ? 's' : ''}.`, moves);
    done.push(best.c);
  }
}

function solveFirstCorners({ m, C, push }) {
  const up = C[YELLOW];
  for (let guard = 0; guard < 16; guard++) {
    const unsolved = m
      .pieces()
      .filter((p) => p.length === 3 && p.some((s) => s.c === WHITE) && !pieceSolved(p, C));
    if (!unsolved.length) return;

    const top = unsolved.find((p) => vec.dot(p[0].p, up) === 1);
    if (top) {
      const colors = top.map((s) => s.c);
      const [a, b] = colors.filter((c) => c !== WHITE);
      const frame = { U: up, F: frontFor(up, C[a], C[b]) };
      const above = ufr(frame);
      const name = `branco, ${masc(a)} e ${masc(b)}`;
      const k = findUTurn(m, frame, (sim) => vec.eq(sim.piece(colors)[0].p, above));
      if (k) {
        push(1, frame, `Gire só o topo até o canto ${name} ficar bem em cima do lugar dele (frente-direita, entre os centros ${masc(a)} e ${masc(b)}).`, parseAlg(U_TURNS[k], frame));
      }
      const n = repetitions(m, frame, ALGS.sexy, (sim) => pieceSolved(sim.piece(colors), C), 6);
      push(1, frame, `Repita R U R' U' até o canto ${name} encaixar com o branco para baixo: ${n} vez${n > 1 ? 'es' : ''}.`, parseAlg(repeat(ALGS.sexy, n), frame));
    } else {
      const piece = unsolved[0];
      const [s1, s2] = sidesOf(piece[0].p, up);
      const frame = { U: up, F: frontFor(up, s1, s2) };
      push(1, frame, 'Este canto branco está embaixo, mas no lugar errado ou girado. Faça R U R\' U\' uma vez para tirá-lo de lá.', parseAlg(ALGS.sexy, frame));
    }
  }
  throw new Error('Cantos brancos sem solução');
}

function solveMiddle({ m, C, push }) {
  const up = C[YELLOW];
  for (let guard = 0; guard < 16; guard++) {
    const unsolved = m
      .pieces()
      .filter((p) => p.length === 2 && !p.some((s) => s.c === WHITE || s.c === YELLOW) && !pieceSolved(p, C));
    if (!unsolved.length) return;

    const top = unsolved.find((p) => vec.dot(p[0].p, up) === 1);
    if (top) {
      const upper = top.find((s) => vec.eq(s.n, up));
      const side = top.find((s) => s !== upper);
      const colors = [upper.c, side.c];
      const frame = { U: up, F: C[side.c] };
      const k = findUTurn(m, frame, (sim) => {
        const s = sim.piece(colors).find((st) => st.c === side.c);
        return vec.eq(s.n, C[side.c]);
      });
      if (k) {
        push(2, frame, `Gire só o topo até a aresta ${fem(side.c)} e ${fem(upper.c)} formar um "T" de cabeça para baixo: a cor da lateral (${fem(side.c)}) em cima do centro ${masc(side.c)}.`, parseAlg(U_TURNS[k], frame));
      }
      const right = vec.eq(C[upper.c], vec.cross(up, frame.F));
      push(2, frame, right
        ? `A outra cor da aresta (${fem(upper.c)}) tem que ir para a direita. Use o algoritmo da direita: U R U' R' U' F' U F.`
        : `A outra cor da aresta (${fem(upper.c)}) tem que ir para a esquerda. Use o algoritmo da esquerda: U' L' U L U F U' F'.`,
      parseAlg(right ? ALGS.right : ALGS.left, frame));
    } else {
      const [s1, s2] = sidesOf(unsolved[0][0].p, up);
      const frame = { U: up, F: frontFor(up, s1, s2) };
      push(2, frame, 'Esta aresta está na segunda camada, mas no lugar errado ou invertida. Use o algoritmo da direita para tirá-la de lá.', parseAlg(ALGS.right, frame));
    }
  }
  throw new Error('Segunda camada sem solução');
}

function solveYellowCross({ m, C, push }) {
  const up = C[YELLOW];
  const orientedEdges = (sim) =>
    sim.pieces().filter((p) => isYellowEdge(p) && vec.eq(yellowSticker(p).n, up));
  const options = SIDES.map((c) => ({ frame: { U: up, F: C[c] }, alg: ALGS.cross }));
  const path = searchAlgs(m, options, (sim) => orientedEdges(sim).length === 4, 3);

  for (const option of path) {
    const edges = orientedEdges(m);
    let text = 'Só o centro amarelo está certo no topo (um "ponto"). Faça F R U R\' U\' F\' de qualquer lado.';
    if (edges.length === 2) {
      const [a, b] = edges.map((p) => sideName(option.frame, sidesOf(p[0].p, up)[0]));
      const line = vec.eq(vec.add(edges[0][0].p, edges[1][0].p), vec.add(up, up));
      text = line
        ? `Há uma linha amarela. Segure-a ${a === 'frente' || a === 'trás' ? 'de frente para trás' : 'na horizontal'}, como está agora, e faça F R U R' U' F'.`
        : `Há um "L" amarelo. Segure-o com as pontas para ${a} e para ${b}, como está agora, e faça F R U R' U' F'.`;
    }
    push(3, option.frame, text, parseAlg(option.alg, option.frame));
  }
}

function solveYellowEdges({ m, C, push }) {
  const up = C[YELLOW];
  const edgesSolved = (sim) => sim.pieces().filter(isYellowEdge).every((p) => pieceSolved(p, C));
  const alignment = (sim) =>
    [0, 1, 2, 3].find((k) => edgesSolved(sim.clone().applyAll(parseAlg(U_TURNS[k], { U: up, F: C.F }))));

  const options = [];
  for (const c of SIDES) {
    for (let k = 0; k < 4; k++) {
      options.push({ frame: { U: up, F: C[c] }, pre: k, alg: `${U_TURNS[k]} ${ALGS.sune}` });
    }
  }
  const path = searchAlgs(m, options, (sim) => alignment(sim) !== undefined, 3);

  for (const option of path) {
    if (option.pre) {
      push(4, option.frame, 'Gire só o topo para deixar as arestas na posição certa para o algoritmo.', parseAlg(U_TURNS[option.pre], option.frame));
    }
    push(4, option.frame, 'Com o cubo segurado assim, faça R U R\' U R U2 R\'. Ele troca as arestas do topo de lugar sem desfazer a cruz.', parseAlg(ALGS.sune, option.frame));
  }
  const k = alignment(m);
  if (k) {
    const frame = { U: up, F: C.F };
    push(4, frame, 'Agora gire só o topo até todas as laterais da cruz amarela combinarem com os centros.', parseAlg(U_TURNS[k], frame));
  }
}

function solveCornerPositions({ m, C, push }) {
  const up = C[YELLOW];
  const placed = (p) => vec.eq(p[0].p, p.reduce((sum, s) => vec.add(sum, C[s.c]), [0, 0, 0]));
  const goal = (sim) => sim.pieces().filter(isYellowCorner).every(placed) && sim.pieces().filter(isYellowEdge).every((p) => pieceSolved(p, C));
  const options = SIDES.map((c) => ({ frame: { U: up, F: C[c] }, alg: ALGS.niklas }));
  const path = searchAlgs(m, options, goal, 3);

  for (const option of path) {
    const anchored = placed(m.pieceAt(ufr(option.frame)));
    push(5, option.frame, anchored
      ? 'O canto da frente-direita já está no lugar certo (as cores batem com os centros, mesmo girado). Mantenha-o ali e faça U R U\' L\' U R\' U\' L.'
      : 'Nenhum canto está no lugar certo ainda. Faça U R U\' L\' U R\' U\' L uma vez: depois disso um deles vai estar.',
    parseAlg(option.alg, option.frame));
  }
}

function solveCornerTwist({ m, C, push }) {
  const up = C[YELLOW];
  const yellowUp = (p) => vec.eq(yellowSticker(p).n, up);
  // Começa com um canto errado já na frente-direita, e não muda mais a frente.
  const frame =
    SIDES.map((c) => ({ U: up, F: C[c] })).find((f) => !yellowUp(m.pieceAt(ufr(f)))) ?? { U: up, F: C.F };
  const atUfr = (sim) => sim.pieceAt(ufr(frame));

  for (let guard = 0; guard < 8; guard++) {
    const wrong = m.pieces().filter((p) => isYellowCorner(p) && vec.dot(p[0].p, up) === 1 && !yellowUp(p));
    if (!wrong.length) break;
    const k = findUTurn(m, frame, (sim) => !yellowUp(atUfr(sim)));
    if (k) {
      push(6, frame, 'Gire só o topo (U) para trazer o próximo canto errado para a frente-direita. Não vire o cubo inteiro!', parseAlg(U_TURNS[k], frame));
    }
    const n = 2 * repetitions(m, frame, repeat(ALGS.twist, 2), (sim) => yellowUp(atUfr(sim)), 3);
    push(6, frame, `Repita R' D' R D até o amarelo do canto da frente-direita ficar para cima: ${n} vezes. As camadas de baixo vão bagunçar, é normal!`, parseAlg(repeat(ALGS.twist, n), frame));
  }
  const k = findUTurn(m, frame, (sim) => sim.isSolved());
  if (k) push(6, frame, 'Último passo: gire o topo para alinhar tudo!', parseAlg(U_TURNS[k], frame));
}

/**
 * Planeja a solução completa a partir do estado atual.
 * Cada passo: { stage, frame: { U, F }, text, moves: [{ axis, layer, turns, notation }] }.
 */
export function planSolution(model) {
  const m = model.clone();
  const C = m.centers();
  const steps = [];
  const ctx = {
    m,
    C,
    push(stage, frame, text, moves) {
      if (!moves.length) return;
      steps.push({ stage, frame, text, moves });
      m.applyAll(moves);
    },
  };
  solveCross(ctx);
  solveFirstCorners(ctx);
  solveMiddle(ctx);
  solveYellowCross(ctx);
  solveYellowEdges(ctx);
  solveCornerPositions(ctx);
  solveCornerTwist(ctx);
  return { steps, solved: m.isSolved() };
}

export { CubeModel };
