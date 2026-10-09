import './style.css';
import { Stage } from './scene/Stage.js';
import { Backdrop } from './scene/Backdrop.js';
import { Effects } from './scene/Effects.js';
import { RubiksCube, FACES } from './cube/RubiksCube.js';
import { CubeControls } from './cube/CubeControls.js';
import { Sound } from './audio/Sound.js';
import { Hud } from './ui/Hud.js';
import { TutorialPanel } from './ui/TutorialPanel.js';
import { Tutorial } from './tutorial/Tutorial.js';
import { Game } from './game/Game.js';

const canvas = document.getElementById('scene');
const stage = new Stage(canvas);
const backdrop = new Backdrop(stage);
const cube = new RubiksCube();
stage.scene.add(cube.root);

const fx = new Effects(stage, backdrop, FACES.map((f) => f.color));
const controls = new CubeControls({ dom: canvas, stage, cube });
const sound = new Sound();
const hud = new Hud();
const tutorial = new Tutorial({ cube, controls, stage, panel: new TutorialPanel() });
const game = new Game({ cube, controls, hud, sound, fx, tutorial });

controls.onInteract = () => sound.unlock();

hud.on('scramble', () => game.scramble());
hud.on('again', () => game.scramble());
hud.on('undo', () => game.undo());
hud.on('solve', () => game.solve());
hud.on('tutorial', () => game.toggleTutorial());
hud.on('view', () => controls.resetView());
hud.on('sound', () => {
  sound.unlock();
  hud.setSound(sound.toggle());
});
window.addEventListener('keydown', (e) => game.handleKey(e));

stage.onUpdate((dt, time) => {
  controls.update(dt);
  cube.root.position.y = Math.sin(time * 0.9) * 0.07;
  cube.update(dt, time);
  tutorial.update(dt, time);
  backdrop.update(dt, time);
  fx.update(dt);
  game.update();
});

cube.playIntro();
stage.start();
requestAnimationFrame(() => document.body.classList.add('ready'));

// Acesso para depuração no console durante o desenvolvimento.
if (import.meta.env.DEV) window.rubik = { stage, cube, controls, game, tutorial };
