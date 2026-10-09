import * as THREE from 'three';
import { AXES, normalizeTurns } from '../cube/RubiksCube.js';

const BEST_KEY = 'rubik-s-cube:best';
const SCRAMBLE_LENGTH = 22;

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) || null;
  } catch {
    return null;
  }
}

function saveBest(best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    /* armazenamento indisponível */
  }
}

function generateScramble(length) {
  const moves = [];
  let lastAxis = null;
  while (moves.length < length) {
    const axis = AXES[Math.floor(Math.random() * 3)];
    if (axis === lastAxis) continue;
    lastAxis = axis;
    moves.push({
      axis,
      layer: Math.random() < 0.5 ? -1 : 1,
      turns: [1, -1, 2][Math.floor(Math.random() * 3)],
    });
  }
  return moves;
}

/** Junta giros consecutivos da mesma camada e remove os que se anulam. */
function simplify(moves) {
  const out = [];
  for (const m of moves) {
    const top = out[out.length - 1];
    if (top && top.axis === m.axis && top.layer === m.layer) {
      top.turns = normalizeTurns(top.turns + m.turns);
      if (top.turns === 0) out.pop();
    } else {
      out.push({ axis: m.axis, layer: m.layer, turns: m.turns });
    }
  }
  return out;
}

const FACE_KEYS = ['U', 'D', 'L', 'R', 'F', 'B'];
// Fatias do meio seguem o sentido da face indicada (notação padrão).
const SLICE_KEYS = { M: 'L', E: 'D', S: 'F' };

export class Game {
  constructor({ cube, controls, hud, sound, fx, tutorial }) {
    this.cube = cube;
    this.controls = controls;
    this.hud = hud;
    this.sound = sound;
    this.fx = fx;
    this.tutorial = tutorial;

    /** Giros desde o último estado resolvido: { axis, layer, turns, source }. */
    this.history = [];
    /** 'free' | 'scrambling' | 'ready' | 'running' | 'solving' | 'solved' | 'tutorial' */
    this.state = 'free';
    this.moves = 0;
    this.startTime = 0;
    this.best = loadBest();

    cube.onMove = (move, source) => this._handleMove(move, source);
    tutorial.panel.onAction = (action) => this._tutorialAction(action);
    hud.setBest(this.best);
    hud.setSound(sound.enabled);
    hud.setTimerState('idle');
    this._refresh();
  }

  get scripted() {
    return this.state === 'scrambling' || this.state === 'solving';
  }

  _refresh() {
    const last = this.history[this.history.length - 1];
    const idle = !this.scripted && !this.cube.intro && !this.cube.scripted;
    const tutorial = this.state === 'tutorial';
    this.hud.setControls({
      canScramble: idle && !tutorial,
      canUndo: idle && last?.source === 'user',
      canSolve: idle && !tutorial && this.history.length > 0,
    });
  }

  _handleMove(move, source) {
    const manual = source === 'user' || source === 'undo';
    this.sound.click(manual ? 1 : source === 'tutorial' ? 0.8 : 0.4);
    if (source === 'user' || source === 'scramble' || source === 'tutorial') {
      this.history.push({ ...move, source });
    }

    if (this.state === 'tutorial') {
      if (source !== 'scramble') this._tutorialMove(move);
      this._refresh();
      return;
    }

    if (manual) {
      if (this.state === 'ready') {
        this.state = 'running';
        this.startTime = performance.now();
        this.hud.setTimerState('running');
      } else if (this.state === 'solved') {
        this.state = 'free';
        this.moves = 0;
        this.hud.setTime(0);
        this.hud.setTimerState('idle');
        this.hud.hideWin();
      }
      this.moves++;
      this.hud.setMoves(this.moves);
      this.hud.dismissHint();
      this.fx.pulse(0.14);
    }

    if (source !== 'scramble' && this.cube.isSolved()) {
      const depth = this.history.length;
      this.history = [];
      if (this.state === 'running') this._win();
      else if (this.state === 'free' && depth >= 8) {
        this.fx.celebrate(this.cube.root.position);
        this.sound.win();
        this.hud.toast('Cubo resolvido! ✨');
      }
    }
    this._refresh();
  }

  _win() {
    const time = performance.now() - this.startTime;
    this.state = 'solved';
    this.hud.setTime(time);
    this.hud.setTimerState('done');

    const record = !this.best || time < this.best.time;
    if (record) {
      this.best = { time, moves: this.moves };
      saveBest(this.best);
      this.hud.setBest(this.best);
    }
    this.hud.showWin({ time, moves: this.moves, record });
    this.fx.celebrate(this.cube.root.position);
    this.controls.spin();
    this.sound.win();
  }

  update() {
    if (this.state === 'running') this.hud.setTime(performance.now() - this.startTime);
    const intro = !!this.cube.intro;
    if (intro !== this._intro) {
      this._intro = intro;
      this._refresh();
    }
  }

  // ---------------------------------------------------------------- ações

  /** Anima um embaralhamento e resolve quando ele termina. */
  _runScramble() {
    this.sound.whoosh();
    this.fx.pulse(0.5);
    const turns = generateScramble(SCRAMBLE_LENGTH).map((m) =>
      this.cube.turn(m, { source: 'scramble', duration: 0.085 }),
    );
    this._refresh();
    return turns[turns.length - 1];
  }

  async scramble() {
    if (this.scripted || this.state === 'tutorial' || this.cube.intro || this.cube.dragging) return;
    this.cube.flush();
    this.hud.hideWin();
    this.state = 'scrambling';
    this.moves = 0;
    this.hud.setMoves(0);
    this.hud.setTime(0);
    this.hud.setTimerState('idle');

    await this._runScramble();

    this.state = 'ready';
    this.hud.setTimerState('ready');
    this.hud.toast('Embaralhado! O cronômetro começa no seu primeiro movimento.', 3200);
    this._refresh();
  }

  async solve() {
    if (this.scripted || this.state === 'tutorial' || this.cube.intro || this.cube.dragging) return;
    this.cube.flush();
    const sequence = simplify(this.history)
      .reverse()
      .map((m) => ({ axis: m.axis, layer: m.layer, turns: normalizeTurns(-m.turns) }));
    if (!sequence.length) {
      this.hud.toast('O cubo já está resolvido!');
      return;
    }

    this.state = 'solving';
    this.hud.hideWin();
    this.hud.setTimerState('idle');
    this._refresh();

    const duration = THREE.MathUtils.clamp(3 / sequence.length, 0.075, 0.2);
    const turns = sequence.map((m) => this.cube.turn(m, { source: 'solve', duration }));
    await turns[turns.length - 1];

    this.state = 'free';
    this.history = [];
    this.moves = 0;
    this.hud.setMoves(0);
    this.hud.setTime(0);
    this.fx.celebrate(this.cube.root.position);
    this.sound.win();
    this.hud.toast('Resolvido automaticamente ✨');
    this._refresh();
  }

  undo() {
    if (this.scripted || this.cube.intro || this.cube.dragging) return;
    const last = this.history[this.history.length - 1];
    if (!last || last.source !== 'user') return;
    this.history.pop();
    this.cube.turn({ axis: last.axis, layer: last.layer, turns: normalizeTurns(-last.turns) }, { source: 'undo' });
    this._refresh();
  }

  // ---------------------------------------------------------------- tutorial

  /** Botão "Tutorial": abre o painel (ou sai, se já estiver nele). */
  toggleTutorial() {
    if (this.state === 'tutorial') return this.exitTutorial();
    if (this.scripted || this.cube.intro || this.cube.dragging) return;
    this.cube.flush();
    this.hud.hideWin();
    this.state = 'tutorial';
    this.moves = 0;
    this.hud.setMoves(0);
    this.hud.setTime(0);
    this.hud.setTimerState('idle');
    this.hud.setTutorialMode(true);
    this.tutorial.open();
    this._refresh();
  }

  exitTutorial() {
    if (this.state !== 'tutorial' || this.cube.scripted) return;
    this.tutorial.close();
    this.state = 'free';
    this.hud.setTutorialMode(false);
    this._refresh();
  }

  /** Começa a resolver; se o cubo estiver resolvido, embaralha antes. */
  async _beginTutorial() {
    if (this.cube.busy) return;
    this.tutorial.totalMoves = 0;
    this.moves = 0;
    this.hud.setMoves(0);
    if (this.cube.isSolved()) {
      this.tutorial.setScrambling();
      await this._runScramble();
      if (this.state !== 'tutorial') return;
    }
    this.tutorial.begin();
    this._refresh();
  }

  _tutorialAction(action) {
    this.sound.unlock();
    if (action === 'start' || action === 'again') this._beginTutorial();
    else if (action === 'next') this.tutorial.playNext();
    else if (action === 'step') this.tutorial.playStep();
    else if (action === 'replan') this.tutorial.replan();
    else if (action === 'exit') this.exitTutorial();
  }

  _tutorialMove(move) {
    this.moves++;
    this.hud.setMoves(this.moves);
    this.hud.dismissHint();
    this.fx.pulse(0.1);

    const stageBefore = this.tutorial.stageIndex;
    this.tutorial.onMove(move);

    if (this.cube.isSolved()) {
      this.history = [];
      if (this.tutorial.phase === 'step') {
        this.tutorial.complete();
        this.fx.celebrate(this.cube.root.position);
        this.controls.spin(9);
        this.sound.win();
      }
    } else if (this.tutorial.stageIndex > stageBefore) {
      // Etapa concluída!
      this.fx.pulse(0.6);
      this.sound.chime();
    }
  }

  handleKey(e) {
    if (e.repeat) return;
    if (this.hud.helpOpen) {
      if (e.key === 'Escape') this.hud.toggleHelp(false);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.toUpperCase();
    if (key === ' ') {
      e.preventDefault();
      this.controls.resetView();
      return;
    }
    if (key === 'N') return this.scramble();
    if (key === 'T') return this.toggleTutorial();
    if (this.scripted || this.cube.intro || this.cube.scripted) return;

    const faces = this.controls.viewFaces();
    let move = null;
    if (FACE_KEYS.includes(key)) {
      const f = faces[key];
      move = { axis: f.axis, layer: f.sign, turns: e.shiftKey ? f.sign : -f.sign };
    } else if (SLICE_KEYS[key]) {
      const f = faces[SLICE_KEYS[key]];
      move = { axis: f.axis, layer: 0, turns: e.shiftKey ? f.sign : -f.sign };
    }
    if (!move) return;

    this.sound.unlock();
    this.cube.turn(move, { source: 'user', duration: 0.18 });
  }
}
