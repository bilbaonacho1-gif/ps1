/* ==========================================================================
   PIPE SNAKE - la viborita, pero es un caño (js/arcade/pipe-snake.js)

   Notas de diseño:

   1. La serpiente NO se mueve en tiempo continuo: avanza de a una celda cada
      TICK segundos. Eso es lo que hace que el juego se sienta a grilla y no a
      "cosa que se desliza". El resto del motor sigue corriendo a 120 Hz.

   2. Los giros se encolan (hasta 2). Sin la cola, en un tick rápido perdés la
      segunda tecla de una maniobra en L y la serpiente no gira. Con ella,
      podés adelantarte al movimiento como en el arcade original.

   3. Se prohíbe el giro de 180° contra el propio cuello: es la muerte tonta
      más frecuente y no aporta nada.
   ========================================================================== */

import { W, H, PAL, randInt, blip, jingle } from './engine.js';

const CELL = 8;
const TOP = 24;                              // franja del HUD
const COLS = Math.floor(W / CELL);           // 40
const ROWS = Math.floor((H - TOP) / CELL);   // 19

const TICK_START = 0.16;
const TICK_MIN = 0.07;
const TICK_STEP = 0.0035;   // se acelera con cada moneda

export default {
  id: 'pipe-snake',
  name: 'PIPE SNAKE',
  tagline: 'EL CAÑO QUE NO PARA DE CRECER',
  controls: '← ↑ → ↓ — GIRAR',

  create(api) {
    const s = {
      body: [],          // [{x,y}] cabeza primero
      dir: { x: 1, y: 0 },
      queue: [],
      coin: { x: 0, y: 0 },
      tick: TICK_START,
      acc: 0,
      score: 0,
      dead: false,
      flash: 0,
      grow: 0,
    };

    const key = (x, y) => y * COLS + x;

    function placeCoin() {
      const taken = new Set(s.body.map((p) => key(p.x, p.y)));
      // Elegimos entre las celdas libres, no al azar con reintentos: con la
      // serpiente larga, el reintento puede tardar muchísimo.
      const free = [];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) if (!taken.has(key(x, y))) free.push({ x, y });
      }
      if (!free.length) return;
      s.coin = free[randInt(0, free.length - 1)];
    }

    function reset() {
      const cy = Math.floor(ROWS / 2);
      s.body = [{ x: 6, y: cy }, { x: 5, y: cy }, { x: 4, y: cy }];
      s.dir = { x: 1, y: 0 };
      s.queue.length = 0;
      s.tick = TICK_START;
      s.acc = 0;
      s.score = 0;
      s.dead = false;
      s.flash = 0;
      s.grow = 0;
      placeCoin();
    }

    function enqueue(x, y) {
      if (s.queue.length >= 2) return;
      // Comparamos contra el último giro encolado, no contra la dirección
      // actual: si no, dos giros seguidos válidos se descartan.
      const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
      if (last.x === -x && last.y === -y) return; // 180° prohibido
      if (last.x === x && last.y === y) return;   // repetido
      s.queue.push({ x, y });
    }

    function advance() {
      if (s.queue.length) s.dir = s.queue.shift();

      const head = s.body[0];
      const nx = head.x + s.dir.x;
      const ny = head.y + s.dir.y;

      // paredes
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return die();
      // cuerpo (la cola se libera en el mismo tick si no estamos creciendo)
      const limit = s.grow > 0 ? s.body.length : s.body.length - 1;
      for (let i = 0; i < limit; i++) {
        if (s.body[i].x === nx && s.body[i].y === ny) return die();
      }

      s.body.unshift({ x: nx, y: ny });
      if (s.grow > 0) s.grow--;
      else s.body.pop();

      if (nx === s.coin.x && ny === s.coin.y) {
        s.grow += 2;
        s.score += 10;
        s.flash = 1;
        s.tick = Math.max(TICK_MIN, s.tick - TICK_STEP);
        api.setScore(s.score);
        blip(880, 0.07, 'square', 0.04, 1320);
        placeCoin();
      }
    }

    function die() {
      if (s.dead) return;
      s.dead = true;
      jingle([440, 330, 247, 165], 0.1, 'sawtooth', 0.05);
      api.gameOver(s.score);
    }

    function step(dt, input) {
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 5);
      if (s.dead) return;

      if (input.wasPressed('ArrowLeft') || input.wasPressed('KeyA')) enqueue(-1, 0);
      if (input.wasPressed('ArrowRight') || input.wasPressed('KeyD')) enqueue(1, 0);
      if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) enqueue(0, -1);
      if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) enqueue(0, 1);

      s.acc += dt;
      while (s.acc >= s.tick && !s.dead) {
        s.acc -= s.tick;
        advance();
      }
    }

    function draw(g) {
      g.clear('#0E1628');

      // Grilla tenue: ayuda a leer las distancias antes de girar.
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if ((x + y) % 2 === 0) g.rect(x * CELL, TOP + y * CELL, CELL, CELL, '#121C33');
        }
      }

      // borde
      g.rect(0, TOP - 2, W, 2, PAL.grey);
      g.rect(0, H - 2, W, 2, PAL.grey);
      g.rect(0, TOP, 1, H - TOP, PAL.grey);
      g.rect(W - 1, TOP, 1, H - TOP, PAL.grey);

      // moneda
      const cx = s.coin.x * CELL, cy = TOP + s.coin.y * CELL;
      g.rect(cx + 2, cy + 1, 4, 6, PAL.coinDark);
      g.rect(cx + 3, cy + 2, 2, 4, PAL.coin);

      // cuerpo: se dibuja como tubería, con la cabeza más clara
      for (let i = s.body.length - 1; i >= 0; i--) {
        const p = s.body[i];
        const x = p.x * CELL, y = TOP + p.y * CELL;
        const isHead = i === 0;
        g.rect(x, y, CELL, CELL, isHead ? PAL.pipeDark : PAL.pipeDark);
        g.rect(x + 1, y + 1, CELL - 2, CELL - 2, isHead ? PAL.pipeLight : PAL.pipe);
        if (isHead) {
          // ojos mirando hacia donde va
          const ex = s.dir.x, ey = s.dir.y;
          g.rect(x + 3 + ex * 2, y + 2 + ey * 1, 1, 1, PAL.black);
          g.rect(x + 3 + ex * 2, y + 5 + ey * 1, 1, 1, PAL.black);
        }
      }

      if (s.flash > 0) g.alpha(s.flash * 0.25, () => g.clear(PAL.white));

      g.text(`LARGO ${s.body.length}`, 6, H - 14, { size: 8, color: PAL.white, shadow: PAL.black });
    }

    return { reset, step, draw };
  },
};
