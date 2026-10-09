// Utilitários de giro sem dependência do Three.js (usados também nos testes).
// Um giro é { axis: 'x' | 'y' | 'z', layer: -1 | 0 | 1, turns }, em quartos de
// volta pela regra da mão direita em torno do eixo positivo.

export const AXES = ['x', 'y', 'z'];

/** Reduz um número de quartos de volta para -1, 1 ou 2 (0 = sem efeito). */
export function normalizeTurns(turns) {
  const m = ((turns % 4) + 4) % 4;
  return m === 3 ? -1 : m;
}

export function invertMove(move) {
  return { axis: move.axis, layer: move.layer, turns: normalizeTurns(-move.turns) };
}

export function sameLayer(a, b) {
  return a.axis === b.axis && a.layer === b.layer;
}
