import { invertMove, normalizeTurns, sameLayer } from '../cube/moves.js';
import { CubeModel } from './CubeModel.js';
import { MoveArrow } from './MoveArrow.js';
import { planSolution, STAGES } from './solver.js';

const sameFrame = (a, b) => a && b && a.U.join() === b.U.join() && a.F.join() === b.F.join();

/**
 * Guia o jogador pelo método das camadas: planeja a solução a partir do estado
 * atual, indica cada giro com uma seta no cubo e confere o que foi feito.
 * Giros fora do plano viram "correções" (desfazer) em vez de refazer o plano.
 */
export class Tutorial {
  constructor({ cube, controls, stage, panel }) {
    this.cube = cube;
    this.controls = controls;
    this.stage = stage;
    this.panel = panel;
    this.arrow = new MoveArrow(cube.group);

    /** 'off' | 'intro' | 'scrambling' | 'step' | 'done' */
    this.phase = 'off';
    this.plan = null;
    this.stepIndex = 0;
    this.moveIndex = 0;
    this.remaining = null; // quartos de volta que faltam no giro atual
    this.corrections = []; // pilha de giros para voltar ao plano
    this.lastFrame = null;
    this.totalMoves = 0;
  }

  get active() {
    return this.phase !== 'off';
  }

  get step() {
    return this.plan?.steps[this.stepIndex] ?? null;
  }

  get stageIndex() {
    return this.step ? this.step.stage : this.phase === 'done' ? STAGES.length : 0;
  }

  /** Próximo giro que o jogador deve fazer (correção ou do plano). */
  get expected() {
    if (this.phase !== 'step') return null;
    if (this.corrections.length) return this.corrections[this.corrections.length - 1];
    const move = this.step?.moves[this.moveIndex];
    if (!move) return null;
    return this.remaining === null ? move : { ...move, turns: this.remaining };
  }

  // ---------------------------------------------------------------- fases

  open() {
    this.phase = 'intro';
    this.plan = null;
    this.stage.sidePanel = true;
    this.panel.show();
    this._render();
  }

  close() {
    this.phase = 'off';
    this.plan = null;
    this.corrections = [];
    this.arrow.hide();
    this.cube.setHint(null);
    this.stage.sidePanel = false;
    this.panel.hide();
  }

  setScrambling() {
    this.phase = 'scrambling';
    this._render();
  }

  /** Planeja a solução a partir do cubo atual e começa o primeiro passo. */
  begin() {
    this.plan = planSolution(CubeModel.fromCube(this.cube));
    this.stepIndex = 0;
    this.moveIndex = 0;
    this.remaining = null;
    this.corrections = [];
    this.lastFrame = null;
    if (!this.plan.steps.length) {
      this.complete();
      return;
    }
    this.phase = 'step';
    this._enterStep();
    this._render();
  }

  /** Refaz o plano a partir de como o cubo está agora. */
  replan() {
    if (this.phase !== 'step' || this.cube.busy) return;
    const moves = this.totalMoves;
    this.begin();
    this.totalMoves = moves;
  }

  complete() {
    this.phase = 'done';
    this.corrections = [];
    this.arrow.hide();
    this.cube.setHint(null);
    this._render();
  }

  _enterStep() {
    const step = this.step;
    if (!step) return;
    if (!sameFrame(step.frame, this.lastFrame)) this.controls.orientTo(step.frame);
    this.lastFrame = step.frame;
  }

  _advance() {
    this.remaining = null;
    this.moveIndex++;
    if (this.moveIndex < this.step.moves.length) return;
    this.moveIndex = 0;
    this.stepIndex++;
    this._enterStep();
  }

  // ---------------------------------------------------------------- giros

  /** Chamado para todo giro concluído no cubo durante o tutorial. */
  onMove(move) {
    if (this.phase !== 'step') return;
    this.totalMoves++;
    const expected = this.expected;

    if (this.corrections.length) {
      const top = this.corrections[this.corrections.length - 1];
      if (sameLayer(top, move)) {
        const rest = normalizeTurns(top.turns - move.turns);
        if (rest === 0) this.corrections.pop();
        else this.corrections[this.corrections.length - 1] = { ...top, turns: rest };
      } else {
        this.corrections.push(invertMove(move));
      }
    } else if (expected && sameLayer(expected, move)) {
      // Mesma camada: conta quanto ainda falta (ex.: F2 feito como F + F).
      const rest = normalizeTurns(expected.turns - move.turns);
      if (rest === 0) this._advance();
      else this.remaining = rest;
    } else {
      this.corrections.push(invertMove(move));
    }
    this._render();
  }

  /** Faz por você o próximo giro indicado. */
  playNext() {
    const move = this.expected;
    if (!move || this.cube.busy) return;
    this.cube.turn(move, { source: 'tutorial', duration: 0.42 });
  }

  /** Faz por você o resto do passo atual (ou todas as correções). */
  playStep() {
    if (this.phase !== 'step' || this.cube.busy) return;
    let moves;
    if (this.corrections.length) {
      moves = [...this.corrections].reverse();
    } else {
      moves = this.step.moves.slice(this.moveIndex);
      if (this.remaining !== null) moves[0] = { ...moves[0], turns: this.remaining };
    }
    for (const move of moves) this.cube.turn(move, { source: 'tutorial', duration: 0.34 });
  }

  // ---------------------------------------------------------------- tela

  _render() {
    const step = this.step;
    this.panel.render({
      phase: this.phase,
      stage: this.stageIndex,
      text: step?.text,
      moves: step?.moves.map((m) => m.notation) ?? [],
      moveIndex: this.moveIndex,
      corrections: this.corrections.length,
      totalMoves: this.totalMoves,
      stepNumber: this._stepNumberInStage(),
    });
  }

  _stepNumberInStage() {
    if (!this.plan || !this.step) return null;
    const steps = this.plan.steps.filter((s) => s.stage === this.step.stage);
    return { current: steps.indexOf(this.step) + 1, total: steps.length };
  }

  update(dt, time) {
    const move = this.expected;
    if (move && !this.cube.busy) {
      this.arrow.show(move, { warn: this.corrections.length > 0 });
      this.cube.setHint(move);
    } else {
      this.arrow.hide();
      this.cube.setHint(null);
    }
    this.arrow.update(dt, time, this.stage.camera);
  }
}
