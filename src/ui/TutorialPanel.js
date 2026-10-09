import { STAGES } from '../tutorial/solver.js';

const LEGEND = `
  <details class="tutor-legend">
    <summary>Como ler os giros</summary>
    <p><b>R</b> direita · <b>L</b> esquerda · <b>U</b> cima · <b>D</b> baixo · <b>F</b> frente · <b>B</b> trás</p>
    <p>A letra sozinha é um quarto de volta no sentido <b>horário</b>, olhando de frente para aquela face.
       Com <b>'</b> é anti-horário, e com <b>2</b> é meia volta.</p>
    <p>O cubo gira sozinho para a posição de cada passo. Se você virar a visão, a seta continua certa.</p>
  </details>`;

/** Painel lateral do tutorial. Só desenha; as ações vão para `onAction`. */
export class TutorialPanel {
  constructor() {
    this.el = document.getElementById('tutor');
    this.track = document.getElementById('tutor-track');
    this.body = document.getElementById('tutor-body');
    this.actions = document.getElementById('tutor-actions');
    this.onAction = null;

    this.track.innerHTML = STAGES.map((s) => `<li title="${s.title}"></li>`).join('');
    this.el.addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button || button.disabled) return;
      if (e.detail > 0) button.blur();
      this.onAction?.(button.dataset.action);
    });
  }

  show() {
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('show'));
  }

  hide() {
    this.el.classList.remove('show');
    this.el.hidden = true;
  }

  render(view) {
    this.el.dataset.phase = view.phase;
    [...this.track.children].forEach((li, i) => {
      li.className = i < view.stage ? 'done' : i === view.stage && view.phase === 'step' ? 'current' : '';
    });

    const legendOpen = this.body.querySelector('.tutor-legend')?.open;
    const { body, actions } = this[`_${view.phase}`]?.(view) ?? { body: '', actions: '' };
    this.body.innerHTML = body;
    this.actions.innerHTML = actions;
    const legend = this.body.querySelector('.tutor-legend');
    if (legend && legendOpen) legend.open = true;
  }

  _intro(view) {
    return {
      body: `
        <h3 class="tutor-title">Aprenda a resolver o cubo</h3>
        <p class="tutor-text">Vamos usar o <b>método das camadas</b>, o mais usado por iniciantes.
          Em cada passo, uma <b class="tutor-accent">seta brilhante</b> mostra no cubo qual camada girar e para que lado.
          Você faz o giro arrastando a peça, ou clica para eu fazer.</p>
        <ol class="tutor-stage-list">${STAGES.map((s) => `<li>${s.title}</li>`).join('')}</ol>
        ${LEGEND}`,
      actions: `<button class="btn-primary" data-action="start" type="button">Começar</button>`,
    };
  }

  _scrambling() {
    return {
      body: `
        <h3 class="tutor-title">Embaralhando…</h3>
        <p class="tutor-text">Veja o cubo se misturar. Em seguida começamos pela <b>cruz branca</b>.</p>`,
      actions: '',
    };
  }

  _step(view) {
    const stage = STAGES[view.stage];
    const warn = view.corrections > 0;
    const chips = view.moves
      .map((notation, i) => {
        const state = i < view.moveIndex ? 'done' : i === view.moveIndex && !warn ? 'current' : '';
        return `<span class="chip ${state}">${notation}</span>`;
      })
      .join('');
    const counter = view.stepNumber && view.stepNumber.total > 1
      ? `<span class="tutor-counter">passo ${view.stepNumber.current} de ${view.stepNumber.total}</span>`
      : '';
    const message = warn
      ? `<b>Ops! Esse giro não fazia parte do passo.</b> Desfaça seguindo a <b class="tutor-warn-accent">seta laranja</b>
         (ou <kbd>Ctrl</kbd>+<kbd>Z</kbd>)${view.corrections > 1 ? `: faltam ${view.corrections} giros` : ''}.
         Se preferir, recalcule a partir de como o cubo está.`
      : view.text;

    return {
      body: `
        <div class="tutor-stage-label">Etapa ${view.stage + 1} de ${STAGES.length}</div>
        <h3 class="tutor-title">${stage.title}</h3>
        <p class="tutor-goal">${stage.goal}</p>
        <div class="tutor-step${warn ? ' warn' : ''}">
          ${counter}
          <p>${message}</p>
          <div class="tutor-chips" aria-label="Giros deste passo">${chips}</div>
        </div>
        ${LEGEND}`,
      actions: warn
        ? `<button class="tutor-btn" data-action="next" type="button">Desfazer por mim</button>
           <button class="tutor-btn" data-action="replan" type="button">Recalcular daqui</button>`
        : `<button class="tutor-btn" data-action="next" type="button">Fazer o próximo giro</button>
           <button class="tutor-btn" data-action="step" type="button">Fazer o passo todo</button>`,
    };
  }

  _done(view) {
    return {
      body: `
        <div class="tutor-trophy" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>
        </div>
        <h3 class="tutor-title">Parabéns, você resolveu!</h3>
        <p class="tutor-text">Você completou as 7 etapas do método das camadas${view.totalMoves ? ` em <b>${view.totalMoves} giros</b>` : ''}.
          Pratique mais algumas vezes e logo vai resolver sem ajuda!</p>`,
      actions: `<button class="btn-primary" data-action="again" type="button">Praticar de novo</button>
                <button class="tutor-btn" data-action="exit" type="button">Sair do tutorial</button>`,
    };
  }
}
