import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CubeModel, pieceSolved } from '../src/tutorial/CubeModel.js';
import { planSolution, parseAlg, notationFor } from '../src/tutorial/solver.js';
import { AXES } from '../src/cube/moves.js';

// Gerador determinístico para os testes serem reproduzíveis.
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function scramble(random, length = 30) {
  const moves = [];
  for (let i = 0; i < length; i++) {
    moves.push({
      axis: AXES[Math.floor(random() * 3)],
      layer: Math.floor(random() * 3) - 1, // inclui as camadas do meio
      turns: [1, -1, 2][Math.floor(random() * 3)],
    });
  }
  return moves;
}

test('a notação respeita o referencial', () => {
  const frame = { U: [0, 1, 0], F: [0, 0, 1] };
  const [r, u, rPrime, f2] = parseAlg("R U R' F2", frame);
  assert.deepEqual([r.axis, r.layer, r.turns], ['x', 1, -1]);
  assert.deepEqual([u.axis, u.layer, u.turns], ['y', 1, -1]);
  assert.deepEqual([rPrime.axis, rPrime.layer, rPrime.turns], ['x', 1, 1]);
  assert.deepEqual([f2.axis, f2.layer, f2.turns], ['z', 1, 2]);
  assert.equal(notationFor({ axis: 'x', layer: -1, turns: 1 }, frame), 'L');
  // Segurando com o branco para baixo e o vermelho na frente.
  const flipped = { U: [0, -1, 0], F: [1, 0, 0] };
  assert.equal(notationFor(parseAlg('R', flipped)[0], flipped), 'R');
});

test("R U R' U' seis vezes volta ao início", () => {
  const m = CubeModel.solved();
  const frame = { U: [0, 1, 0], F: [0, 0, 1] };
  m.applyAll(parseAlg("R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U R' U'", frame));
  assert.ok(m.isSolved());
});

test('cubo resolvido não precisa de passos', () => {
  const plan = planSolution(CubeModel.solved());
  assert.equal(plan.steps.length, 0);
  assert.ok(plan.solved);
});

test('resolve 400 embaralhamentos aleatórios, etapa por etapa', () => {
  const random = rng(42);
  let maxMoves = 0;
  let total = 0;
  const started = performance.now();

  for (let i = 0; i < 400; i++) {
    const model = CubeModel.solved().applyAll(scramble(random));
    const plan = planSolution(model);
    assert.ok(plan.solved, `embaralhamento ${i} não foi resolvido`);

    // Confere de forma independente, aplicando os passos num clone.
    const sim = model.clone();
    let lastStage = 0;
    for (const step of plan.steps) {
      assert.ok(step.stage >= lastStage, 'as etapas não podem voltar');
      assert.ok(step.text && step.moves.length);
      for (const move of step.moves) assert.ok(move.notation, 'todo giro tem notação');
      if (step.stage !== lastStage) checkStagesDone(sim, step.stage);
      lastStage = step.stage;
      sim.applyAll(step.moves);
    }
    assert.ok(sim.isSolved());

    const moves = plan.steps.reduce((n, s) => n + s.moves.length, 0);
    maxMoves = Math.max(maxMoves, moves);
    total += moves;
  }

  const ms = (performance.now() - started) / 400;
  console.log(`média ${(total / 400).toFixed(0)} giros, máximo ${maxMoves}, ${ms.toFixed(1)} ms por plano`);
  assert.ok(ms < 150, 'planejar precisa ser rápido');
});

/** Quando uma etapa começa, todas as anteriores precisam estar prontas. */
function checkStagesDone(model, stage) {
  const C = model.centers();
  const pieces = model.pieces();
  const has = (p, c) => p.some((s) => s.c === c);
  const whiteEdges = pieces.filter((p) => p.length === 2 && has(p, 'U'));
  const whiteCorners = pieces.filter((p) => p.length === 3 && has(p, 'U'));
  const middle = pieces.filter((p) => p.length === 2 && !has(p, 'U') && !has(p, 'D'));
  if (stage > 0) assert.ok(whiteEdges.every((p) => pieceSolved(p, C)), 'cruz branca');
  if (stage > 1) assert.ok(whiteCorners.every((p) => pieceSolved(p, C)), 'cantos brancos');
  if (stage > 2) assert.ok(middle.every((p) => pieceSolved(p, C)), 'segunda camada');
}
