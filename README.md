# Rubik's Cube

Cubo mágico 3D interativo para a web, feito com [Three.js](https://threejs.org) e [Vite](https://vite.dev).

## Como rodar

```bash
npm install
npm run dev
```

Para gerar a versão de produção em `dist/`:

```bash
npm run build
```

Para rodar os testes do resolvedor do tutorial:

```bash
npm test
```

## Hospedar na Vercel

O projeto já vem configurado (`vercel.json`): build com `npm run build`, saída em `dist/` e cache longo para os arquivos com hash em `/assets`.

**Pelo site (recomendado):** em [vercel.com/new](https://vercel.com/new), importe o repositório `lucasbrun196/rubik-s-cube` e clique em **Deploy** — não precisa mudar nenhuma configuração. A partir daí, cada push na `main` publica o site, e cada pull request ganha uma URL de pré-visualização.

**Pelo terminal:**

```bash
npx vercel
```

Na primeira vez ele pede login e cria o projeto; use `npx vercel --prod` para publicar em produção.

## Como jogar

| Ação | Mouse / toque | Teclado |
| --- | --- | --- |
| Girar o cubo inteiro | Arraste **fora** do cubo (ou botão direito em qualquer lugar) | `Espaço` centraliza a visão |
| Mover uma camada | Arraste **sobre** uma peça na direção desejada | `U` `D` `L` `R` `F` `B`, `M` `E` `S` (`Shift` = anti-horário) |
| Zoom | Scroll / pinça | — |
| Embaralhar | Botão **Embaralhar** | `N` |
| Desfazer | Botão **Desfazer** | `Ctrl+Z` |
| Tutorial | Botão **Tutorial** | `T` |

As teclas de face são relativas à visão atual: `F` é a face da frente (na visão inclinada, a da esquerda), `U` a de cima e `R` a da direita.

Depois de embaralhar, o cronômetro começa no primeiro movimento e para quando o cubo é resolvido. O melhor tempo fica salvo no navegador.

## Tutorial

O botão **Tutorial** ensina a resolver o cubo pelo **método das camadas**, em 7 etapas:
cruz branca, cantos brancos, segunda camada, cruz amarela, arestas amarelas, posicionar cantos e girar cantos.

- O tutorial lê o estado atual do cubo (ou embaralha, se ele estiver resolvido) e planeja a solução inteira.
- Em cada passo, o cubo gira sozinho para a posição certa, uma **seta brilhante** abraça a camada que deve ser girada e o painel mostra o algoritmo em notação (`R U R' U'`...).
- Você faz o giro arrastando a peça (ou pelo teclado), ou clica em **Fazer o próximo giro** / **Fazer o passo todo**.
- Se fizer um giro diferente, a seta fica **laranja** e mostra como desfazê-lo; também dá para **recalcular** a partir de como o cubo está.

## Estrutura

```
src/
  main.js                 monta a cena e liga tudo
  cube/RubiksCube.js      peças, giros de camada, animação e detecção de resolvido
  cube/CubeControls.js    mouse/toque: girar a visão x arrastar camadas, inércia, zoom
  scene/Stage.js          renderer, câmera, luzes e pós-processamento (bloom)
  scene/Backdrop.js       nebulosa, estrelas, poeira, halo e pedestal holográfico
  scene/Effects.js        confete, faíscas e onda de choque da vitória
  scene/studioEnvironment.js  ambiente de estúdio para os reflexos
  game/Game.js            estados do jogo, cronômetro, histórico, embaralhar/resolver
  tutorial/CubeModel.js   modelo abstrato do cubo (adesivos com posição, normal e cor)
  tutorial/solver.js      resolvedor pelo método das camadas, com explicações de cada passo
  tutorial/Tutorial.js    acompanha os giros do jogador, correções, seta e brilho da camada
  tutorial/MoveArrow.js   seta 3D animada em volta da camada a girar
  ui/TutorialPanel.js     painel do tutorial
  audio/Sound.js          sons sintetizados com Web Audio
  ui/Hud.js               interface (placar, avisos, ajuda)
tests/solver.test.mjs     resolve centenas de embaralhamentos e confere cada etapa
```
