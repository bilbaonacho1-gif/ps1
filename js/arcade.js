/* ==========================================================================
   RESET 32-BIT - CABINA DEL ARCADE (js/arcade.js)

   Máquina de estados que vive sobre un único canvas de 320x180:

     boot  ->  select  ->  playing  ->  gameover  ->  select
                  ^___________________________________|

   Todo el menú se dibuja DENTRO del canvas y no en HTML. Es más trabajo, pero
   es lo que hace que se sienta una consola y no una página web con un juego
   embebido: la tipografía, el parpadeo y el pixelado son los mismos en el menú
   y en la partida.

   La cabina es una sola y se MUDA entre la sección de la página y el modal del
   botón POWER (mountInto). Mover el nodo en el DOM no destruye el contexto 2D
   ni el estado de la partida, así que no hace falta duplicar nada.
   ========================================================================== */

import {
  W, H, PAL, createInput, createGfx, createLoop,
  loadBest, saveBest, blip, jingle, setMuted, isMuted, clamp,
} from './arcade/engine.js';

import pipeDash from './arcade/pipe-dash.js';
import blockSmash from './arcade/block-smash.js';
import pipeSnake from './arcade/pipe-snake.js';

const GAMES = [pipeDash, blockSmash, pipeSnake];

let canvas = null;
let gfx = null;
let input = null;
let loop = null;
let root = null;          // nodo que se muda entre la sección y el modal
let homeParent = null;    // dónde vive por defecto

const app = {
  phase: 'boot',
  t: 0,
  bootDone: false,
  index: 0,
  game: null,        // instancia activa
  def: null,         // definición del juego activo
  score: 0,
  best: 0,
  lastScore: 0,
  transition: 0,     // 0..1, fundido entre pantallas
};

// --------------------------------------------------------------- API juegos

const gameApi = {
  setScore(n) { app.score = n; },
  gameOver(finalScore) {
    app.lastScore = finalScore;
    app.score = finalScore;
    const id = app.def.id;
    if (finalScore > app.best) { app.best = finalScore; saveBest(id, finalScore); }
    // Pequeña demora: deja ver la explosión antes de tapar con el cartel.
    setTimeout(() => { if (app.phase === 'playing') app.phase = 'gameover'; }, 700);
  },
};

// ------------------------------------------------------------------- lógica

function startGame(i) {
  app.index = clamp(i, 0, GAMES.length - 1);
  app.def = GAMES[app.index];
  app.game = app.def.create(gameApi);
  app.game.reset();
  app.score = 0;
  app.best = loadBest(app.def.id);
  app.phase = 'playing';
  app.transition = 1;
  bumpPlays(app.def.id);
  // Las fichas de la página leen estas estadísticas: avisamos para que se
  // repinten sin tener que consultarlas en un intervalo.
  window.dispatchEvent(new CustomEvent('reset:stats'));
  jingle([523, 784], 0.07);
}

function backToSelect() {
  app.phase = 'select';
  app.game = null;
  app.transition = 1;
  blip(330, 0.06, 'square', 0.035);
}

function step(dt) {
  app.t += dt;
  if (app.transition > 0) app.transition = Math.max(0, app.transition - dt * 3);

  switch (app.phase) {
    case 'boot':
      // El arranque dura 3.6s y se puede saltear, como toda buena intro.
      if (app.t > 3.6 || input.actionPressed) { app.phase = 'select'; app.transition = 1; }
      break;

    case 'select': {
      if (input.wasPressed('ArrowLeft') || input.wasPressed('KeyA')) {
        app.index = (app.index + GAMES.length - 1) % GAMES.length;
        blip(440, 0.04, 'square', 0.03);
      }
      if (input.wasPressed('ArrowRight') || input.wasPressed('KeyD')) {
        app.index = (app.index + 1) % GAMES.length;
        blip(440, 0.04, 'square', 0.03);
      }
      if (input.actionPressed) startGame(app.index);
      break;
    }

    case 'playing':
      app.game.step(dt, input);
      break;

    case 'gameover':
      if (input.actionPressed) startGame(app.index);
      else if (input.wasPressed('Escape')) backToSelect();
      break;
  }

  // El input se consume al final del paso lógico: así un mismo "pressed"
  // no dispara dos veces si en un frame corren varios pasos de física.
  input.consume();
}

// ------------------------------------------------------------------ dibujo

function draw() {
  switch (app.phase) {
    case 'boot': drawBoot(); break;
    case 'select': drawSelect(); break;
    case 'playing': app.game.draw(gfx); drawHud(); break;
    case 'gameover': app.game.draw(gfx); drawHud(); drawGameOver(); break;
  }

  // Fundido a negro entre pantallas.
  if (app.transition > 0) {
    gfx.alpha(app.transition, () => gfx.clear('#000'));
  }
}

/**
 * Arranque estilo PlayStation: un rombo se arma en el aire, gira y aparece el
 * logo con las letras temblando.
 *
 * El temblor no es un capricho: la PS1 no tenía coma flotante en su GPU y
 * redondeaba las coordenadas de los vértices a enteros, así que la geometría
 * "vibraba" al moverse. Es la firma visual de la consola, y acá la imitamos
 * redondeando a propósito las posiciones de dibujo.
 */
function drawBoot() {
  gfx.clear('#000');
  const t = app.t;

  // --- fase 1: el rombo se arma y gira ---
  if (t > 0.35) {
    const appear = clamp((t - 0.35) / 0.9, 0, 1);
    const spin = t * 1.6;
    const scale = 26 * appear;
    const cx = W / 2, cy = 74;

    // Octaedro: 6 vértices. Proyección ortográfica simple.
    const verts = [
      [0, -1, 0], [0, 1, 0],
      [1, 0, 0], [-1, 0, 0],
      [0, 0, 1], [0, 0, -1],
    ].map(([x, y, z]) => {
      const rx = x * Math.cos(spin) - z * Math.sin(spin);
      const rz = x * Math.sin(spin) + z * Math.cos(spin);
      // Redondeo intencional: el "vertex snapping" de la PS1.
      return [Math.round(cx + rx * scale), Math.round(cy + y * scale * 0.85), rz];
    });

    const edges = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2]];
    gfx.ctx.lineWidth = 1;
    for (const [a, b] of edges) {
      const depth = (verts[a][2] + verts[b][2]) / 2;
      gfx.ctx.strokeStyle = depth > 0 ? '#E8E4D8' : '#6A6A78';
      gfx.ctx.beginPath();
      gfx.ctx.moveTo(verts[a][0] + 0.5, verts[a][1] + 0.5);
      gfx.ctx.lineTo(verts[b][0] + 0.5, verts[b][1] + 0.5);
      gfx.ctx.stroke();
    }
  }

  // --- fase 2: el logo, con las letras temblando ---
  if (t > 1.7) {
    const a = clamp((t - 1.7) / 0.7, 0, 1);
    gfx.alpha(a, () => {
      const word = 'RESET';
      const size = 22;
      gfx.ctx.font = `${size}px "Silkscreen", monospace`;
      const total = gfx.ctx.measureText(word).width;
      let x = (W - total) / 2;
      for (const ch of word) {
        // ±1px de jitter por letra: el temblor de vértices.
        const jx = Math.round((Math.random() - 0.5) * 1.8);
        const jy = Math.round((Math.random() - 0.5) * 1.8);
        gfx.text(ch, x + jx, 112 + jy, { size, color: '#E8E4D8' });
        x += gfx.ctx.measureText(ch).width;
      }
    });
  }

  if (t > 2.5) {
    gfx.alpha(clamp((t - 2.5) / 0.6, 0, 1), () => {
      gfx.text('RESET COMPUTER ENTERTAINMENT', W / 2, 142, { size: 8, align: 'center', color: '#8A8A98' });
    });
  }

  if (t > 3.0 && gfx.blink(app.t, 2)) {
    gfx.text('PULSÁ ESPACIO', W / 2, 160, { size: 8, align: 'center', color: '#4A4A58' });
  }
}

function drawSelect() {
  gfx.clear('#0A0E1A');
  gfx.dither(0, 0, W, H, '#141B33', 0.5);

  gfx.text('SELECCIONÁ UN JUEGO', W / 2, 12, { size: 8, align: 'center', color: PAL.grey });

  // Tres "cajas de disco" en fila; la elegida se levanta y se ilumina.
  const boxW = 74, boxH = 52, gap = 12;
  const totalW = GAMES.length * boxW + (GAMES.length - 1) * gap;
  const startX = (W - totalW) / 2;

  GAMES.forEach((game, i) => {
    const sel = i === app.index;
    const x = startX + i * (boxW + gap);
    const y = 34 + (sel ? -4 : 0);

    gfx.panel(x, y, boxW, boxH, sel ? '#1E2A4D' : '#131A2E', sel ? PAL.coin : '#2A3350');
    drawCover(gfx, game.id, x + 4, y + 4, boxW - 8, boxH - 22, sel);

    gfx.text(game.name.split(' ').pop(), x + boxW / 2, y + boxH - 14, {
      size: 8, align: 'center', color: sel ? PAL.white : PAL.grey,
    });

    const best = loadBest(game.id);
    if (best > 0) {
      gfx.text(`${best}`, x + boxW / 2, y + boxH + 3, { size: 8, align: 'center', color: PAL.coinDark });
    }
  });

  const def = GAMES[app.index];
  gfx.text(def.name, W / 2, 104, { size: 14, align: 'center', color: PAL.coin, shadow: PAL.black });
  gfx.text(def.tagline, W / 2, 124, { size: 8, align: 'center', color: PAL.white });
  gfx.text(def.controls, W / 2, 138, { size: 8, align: 'center', color: PAL.grey });

  gfx.text('← →  ELEGIR', 8, H - 13, { size: 8, color: PAL.grey });
  gfx.text(gfx.blink(app.t) ? 'ESPACIO  JUGAR' : '', W - 8, H - 13, { size: 8, align: 'right', color: PAL.coin });
}

/**
 * Miniportadas dibujadas a mano, una por juego.
 * Recibe el gfx por parámetro para poder dibujarlas también fuera de la
 * pantalla del arcade (por ejemplo en las fichas giratorias de la página).
 */
function drawCover(g, id, x, y, w, h, sel) {
  if (id === 'pipe-dash') {
    g.ctx.fillStyle = sel ? PAL.skyTop : '#3A5E9E';
    g.ctx.fillRect(x, y, w, h);
    g.rect(x, y + h - 6, w, 6, PAL.ground);
    g.rect(x + w - 18, y + h - 16, 10, 10, PAL.pipe);
    g.rect(x + w - 20, y + h - 18, 14, 4, PAL.pipe);
    g.rect(x + 12, y + h - 16, 6, 5, PAL.red);
    g.rect(x + 12, y + h - 20, 6, 3, PAL.blue);
  } else if (id === 'block-smash') {
    g.ctx.fillStyle = sel ? '#1B2A55' : '#141F40';
    g.ctx.fillRect(x, y, w, h);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        g.rect(x + 3 + c * 11, y + 4 + r * 6, 9, 4, r === 0 ? PAL.red : PAL.coin);
      }
    }
    g.rect(x + w / 2 - 8, y + h - 5, 16, 3, PAL.pipe);
    g.rect(x + w / 2 + 4, y + h - 12, 2, 2, PAL.white);
  } else {
    g.ctx.fillStyle = sel ? '#121C33' : '#0E1628';
    g.ctx.fillRect(x, y, w, h);
    const pts = [[3, 5], [4, 5], [5, 5], [5, 4], [5, 3], [6, 3], [7, 3]];
    for (const [cx, cy] of pts) g.rect(x + cx * 6, y + cy * 5, 5, 4, PAL.pipe);
    g.rect(x + 7 * 6, y + 3 * 5, 5, 4, PAL.pipeLight);
    g.rect(x + 2 * 6 + 1, y + 2 * 5 + 1, 3, 3, PAL.coin);
  }
}

/**
 * Renderiza la portada de un juego a un PNG en memoria, para usarla como
 * imagen en las fichas de la página. Se dibuja chica y el CSS la escala con
 * image-rendering: pixelated, así se mantiene el pixel art nítido.
 */
export function coverDataURL(id, w = 120, h = 46) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawCover(createGfx(ctx), id, 0, 0, w, h, true);
  return c.toDataURL('image/png');
}

// ------------------------------------------------------ partidas jugadas

const playsKey = (id) => `reset_plays_${id}`;

function getPlays(id) {
  try { return parseInt(localStorage.getItem(playsKey(id)) || '0', 10) || 0; }
  catch { return 0; }
}
function bumpPlays(id) {
  try { localStorage.setItem(playsKey(id), String(getPlays(id) + 1)); }
  catch { /* modo privado: la estadística simplemente no persiste */ }
}

/**
 * Estadísticas reales de cada juego, ordenadas por partidas jugadas.
 * Es lo que alimenta las fichas giratorias: no son datos inventados, salen de
 * lo que jugó esta persona en este navegador.
 */
export function getStats() {
  return GAMES
    .map((g) => ({
      id: g.id, name: g.name, tagline: g.tagline, controls: g.controls,
      best: loadBest(g.id), plays: getPlays(g.id),
    }))
    .sort((a, b) => b.plays - a.plays || b.best - a.best);
}

function drawHud() {
  gfx.rect(0, 0, W, 18, 'rgba(10,14,26,0.78)');
  gfx.text(app.def.name, 6, 5, { size: 8, color: PAL.grey });
  gfx.text(`${String(app.score).padStart(5, '0')}`, W - 6, 5, { size: 8, align: 'right', color: PAL.coin });
  gfx.text(`REC ${String(app.best).padStart(5, '0')}`, W - 62, 5, { size: 8, align: 'right', color: PAL.grey });
}

function drawGameOver() {
  gfx.rect(0, 58, W, 62, 'rgba(10,14,26,0.86)');
  gfx.rect(0, 58, W, 1, PAL.coin);
  gfx.rect(0, 119, W, 1, PAL.coin);

  const isRecord = app.lastScore >= app.best && app.lastScore > 0;
  gfx.text(isRecord ? '¡NUEVO RÉCORD!' : 'GAME OVER', W / 2, 66, {
    size: 14, align: 'center', color: isRecord ? PAL.coin : PAL.red, shadow: PAL.black,
  });
  gfx.text(`PUNTAJE  ${app.lastScore}`, W / 2, 88, { size: 8, align: 'center', color: PAL.white });
  gfx.text(gfx.blink(app.t) ? 'ESPACIO REINTENTAR   ·   ESC MENÚ' : '', W / 2, 104, {
    size: 8, align: 'center', color: PAL.grey,
  });
}

// -------------------------------------------------------------------- setup

/**
 * Inicializa la cabina. Idempotente.
 * @param {HTMLCanvasElement} canvasEl
 * @param {HTMLElement} rootEl  nodo que se muda entre sección y modal
 */
export function initArcade(canvasEl, rootEl) {
  if (canvas) return;
  canvas = canvasEl;
  root = rootEl;
  homeParent = rootEl.parentElement;

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false; // pixel art nítido al escalar
  gfx = createGfx(ctx);

  input = createInput(canvas);
  // Escape no pasa por createInput (no es tecla de juego), lo captamos acá.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.phase === 'gameover') backToSelect();
  });

  app.best = loadBest(GAMES[0].id);
  loop = createLoop(step, draw);
  loop.start();
}

/** Mueve la cabina dentro de otro contenedor (el modal del botón POWER). */
export function mountInto(container) {
  if (!root || !container || root.parentElement === container) return;
  container.appendChild(root);
}

/** Devuelve la cabina a su lugar en la sección ARCADE. */
export function mountHome() {
  if (!root || !homeParent || root.parentElement === homeParent) return;
  homeParent.appendChild(root);
}

/** Arranca un juego por id desde afuera (los botones accesibles del HTML). */
export function playById(id) {
  const i = GAMES.findIndex((g) => g.id === id);
  if (i >= 0) startGame(i);
}

export function listGames() {
  return GAMES.map((g) => ({ id: g.id, name: g.name, tagline: g.tagline, controls: g.controls }));
}

export function pauseArcade() { loop?.stop(); }
export function resumeArcade() { loop?.start(); }
export function toggleArcadeSound() { setMuted(!isMuted()); return !isMuted(); }
export function focusArcade() { canvas?.focus(); input?.setFocus(true); }
