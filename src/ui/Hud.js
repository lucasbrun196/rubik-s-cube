const $ = (id) => document.getElementById(id);

export function formatTime(ms) {
  const total = Math.floor(ms / 10);
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

const ICON_SOUND_ON =
  '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>';
const ICON_SOUND_OFF = '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>';

export class Hud {
  constructor() {
    this.el = {
      time: $('stat-time'),
      timeStat: $('stat-time').closest('.stat'),
      moves: $('stat-moves'),
      best: $('stat-best'),
      toast: $('toast'),
      win: $('win'),
      winBadge: $('win-badge'),
      winTime: $('win-time'),
      winMoves: $('win-moves'),
      hint: $('hint'),
      help: $('help'),
      soundIcon: $('icon-sound'),
      buttons: {
        scramble: $('btn-scramble'),
        undo: $('btn-undo'),
        solve: $('btn-solve'),
        tutorial: $('btn-tutorial'),
        view: $('btn-view'),
        sound: $('btn-sound'),
        help: $('btn-help'),
        again: $('win-again'),
        helpClose: $('help-close'),
      },
    };

    this.el.buttons.help.addEventListener('click', () => this.toggleHelp(true));
    this.el.buttons.helpClose.addEventListener('click', () => this.toggleHelp(false));
    this.el.help.addEventListener('click', (e) => {
      if (e.target === this.el.help) this.toggleHelp(false);
    });
  }

  on(name, fn) {
    this.el.buttons[name].addEventListener('click', (e) => {
      // Clique com mouse não deixa foco no botão, senão o Espaço o "clicaria" de novo.
      if (e.detail > 0) e.currentTarget.blur();
      fn();
    });
  }

  setTime(ms) {
    this.el.time.textContent = formatTime(ms);
  }

  setMoves(n) {
    this.el.moves.textContent = String(n);
  }

  setBest(best) {
    this.el.best.textContent = best ? formatTime(best.time) : '—';
    this.el.best.title = best ? `${best.moves} movimentos` : '';
  }

  /** 'idle' | 'ready' | 'running' | 'done' */
  setTimerState(state) {
    this.el.timeStat.dataset.state = state;
  }

  setControls({ canScramble, canUndo, canSolve }) {
    this.el.buttons.scramble.disabled = !canScramble;
    this.el.buttons.undo.disabled = !canUndo;
    this.el.buttons.solve.disabled = !canSolve;
  }

  setTutorialMode(on) {
    document.body.classList.toggle('tutorial-mode', on);
    this.el.buttons.tutorial.setAttribute('aria-pressed', String(on));
  }

  setSound(on) {
    this.el.soundIcon.innerHTML = on ? ICON_SOUND_ON : ICON_SOUND_OFF;
    this.el.buttons.sound.setAttribute('aria-pressed', String(on));
    this.el.buttons.sound.querySelector('span').textContent = on ? 'Som' : 'Mudo';
  }

  toast(message, duration = 2600) {
    const el = this.el.toast;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  showWin({ time, moves, record }) {
    this.el.winTime.textContent = formatTime(time);
    this.el.winMoves.textContent = `${moves} movimento${moves === 1 ? '' : 's'}`;
    this.el.winBadge.hidden = !record;
    this.el.win.classList.add('show');
  }

  hideWin() {
    this.el.win.classList.remove('show');
  }

  dismissHint() {
    this.el.hint.classList.add('faded');
  }

  toggleHelp(open = this.el.help.hidden) {
    this.el.help.hidden = !open;
  }

  get helpOpen() {
    return !this.el.help.hidden;
  }
}
