const STORAGE_KEY = 'rubik-s-cube:sound';

function load() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Efeitos sonoros sintetizados com Web Audio (nenhum arquivo de áudio). */
export class Sound {
  constructor() {
    this.enabled = load();
    this.ctx = null;
  }

  /** Precisa ser chamado a partir de um gesto do usuário. */
  unlock() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);

      const length = Math.floor(this.ctx.sampleRate * 0.6);
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off');
    } catch {
      /* armazenamento indisponível */
    }
    return this.enabled;
  }

  get _ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  _envelope(peak, attack, release, at) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
    g.connect(this.master);
    return g;
  }

  /** "Clack" plástico de uma camada encaixando. */
  click(volume = 1) {
    if (!this._ready) return;
    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1700 + Math.random() * 1200;
    band.Q.value = 1.4;
    src.connect(band).connect(this._envelope(0.55 * volume, 0.003, 0.06, t));
    src.start(t, Math.random() * 0.4);
    src.stop(t + 0.08);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240 + Math.random() * 40, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.07);
    osc.connect(this._envelope(0.3 * volume, 0.004, 0.08, t));
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** Varredura de ruído ao embaralhar. */
  whoosh() {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.5;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(3800, t + 0.45);
    filter.frequency.exponentialRampToValueAtTime(900, t + 0.9);
    src.connect(filter).connect(this._envelope(0.35, 0.25, 0.65, t));
    src.start(t);
    src.stop(t + 1);
  }

  /** Duas notas suaves ao concluir uma etapa do tutorial. */
  chime() {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    [659.25, 987.77].forEach((freq, i) => {
      const at = t + i * 0.11;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(this._envelope(0.18, 0.01, 0.7, at));
      osc.start(at);
      osc.stop(at + 0.8);
    });
  }

  /** Arpejo brilhante de vitória. */
  win() {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    notes.forEach((freq, i) => {
      const at = t + i * 0.085;
      for (const [type, mult, peak] of [['triangle', 1, 0.22], ['sine', 2, 0.07]]) {
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq * mult;
        osc.connect(this._envelope(peak, 0.01, 1.1, at));
        osc.start(at);
        osc.stop(at + 1.2);
      }
    });
    // Brilho final.
    const at = t + notes.length * 0.085;
    [1046.5, 1318.51, 1567.98, 2093].forEach((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(this._envelope(0.09, 0.02, 1.8, at));
      osc.start(at);
      osc.stop(at + 2);
    });
  }
}
