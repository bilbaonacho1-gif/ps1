/* ==========================================================================
   BLOCK SMASH - rompe bloques (js/arcade/block-smash.js)

   Un breakout con bloques "?". Dos detalles que lo separan de un breakout
   genérico y que conviene poder explicar:

   1. El rebote en la paleta NO es un espejo del ángulo de entrada. El ángulo
      de salida depende de DÓNDE pegó la pelota en la paleta: al borde sale
      abierta, al centro sale casi vertical. Sin esto el jugador no tiene
      control y el juego se vuelve una lotería.

   2. La colisión resuelve por el eje de menor penetración. Si no, una pelota
      rápida que entra por la esquina de un bloque rebota para cualquier lado.
   ========================================================================== */

import { W, H, PAL, rand, clamp, blip, jingle } from './engine.js';

const PADDLE_W = 34, PADDLE_H = 5, PADDLE_Y = H - 16;
const BALL_R = 2;
const SPEED_START = 118;
const SPEED_MAX = 215;
const MAX_BOUNCE_ANGLE = 1.05; // ~60° respecto de la vertical

const COLS = 10, ROWS = 5;
const BRICK_W = 26, BRICK_H = 11;
const MARGIN_X = (W - COLS * BRICK_W) / 2;
const MARGIN_Y = 30;

export default {
  id: 'block-smash',
  name: 'BLOCK SMASH',
  tagline: 'ROMPÉ TODOS LOS BLOQUES',
  controls: '← →  /  MOUSE — MOVER',

  create(api) {
    const s = {
      paddleX: W / 2 - PADDLE_W / 2,
      ball: { x: W / 2, y: PADDLE_Y - 8, vx: 0, vy: 0 },
      stuck: true,       // la pelota arranca pegada a la paleta
      bricks: [],
      lives: 3,
      score: 0,
      level: 1,
      particles: [],
      shake: 0,
      dead: false,
    };

    function buildLevel() {
      s.bricks = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          // Las filas de arriba aguantan dos golpes: dan progresión sin
          // necesidad de agregar mecánicas nuevas.
          const hp = r < 2 ? 2 : 1;
          s.bricks.push({
            x: MARGIN_X + c * BRICK_W, y: MARGIN_Y + r * BRICK_H,
            w: BRICK_W - 2, h: BRICK_H - 2, hp, row: r,
          });
        }
      }
    }

    function resetBall() {
      s.stuck = true;
      s.ball.x = s.paddleX + PADDLE_W / 2;
      s.ball.y = PADDLE_Y - BALL_R - 2;
      s.ball.vx = 0;
      s.ball.vy = 0;
    }

    function launch() {
      if (!s.stuck) return;
      s.stuck = false;
      const speed = Math.min(SPEED_MAX, SPEED_START + (s.level - 1) * 16);
      const a = rand(-0.5, 0.5);
      s.ball.vx = Math.sin(a) * speed;
      s.ball.vy = -Math.cos(a) * speed;
      blip(520, 0.08, 'square', 0.04, 780);
    }

    function reset() {
      s.paddleX = W / 2 - PADDLE_W / 2;
      s.lives = 3; s.score = 0; s.level = 1;
      s.particles.length = 0; s.shake = 0; s.dead = false;
      buildLevel();
      resetBall();
    }

    function burst(x, y, color, n = 7) {
      for (let i = 0; i < n; i++) {
        s.particles.push({ x, y, color, vx: rand(-60, 60), vy: rand(-70, 10), life: rand(0.25, 0.55), max: 0.55 });
      }
    }

    function hitBrick(b, i) {
      b.hp--;
      if (b.hp <= 0) {
        s.bricks.splice(i, 1);
        s.score += 10 * (b.row < 2 ? 2 : 1);
        burst(b.x + b.w / 2, b.y + b.h / 2, b.row < 2 ? PAL.red : PAL.coin);
        blip(660, 0.05, 'square', 0.04, 990);
      } else {
        s.score += 3;
        burst(b.x + b.w / 2, b.y + b.h / 2, PAL.white, 3);
        blip(380, 0.04, 'square', 0.035);
      }
      api.setScore(s.score);

      if (s.bricks.length === 0) {
        s.level++;
        buildLevel();
        resetBall();
        jingle([523, 659, 784, 1047]);
      }
    }

    function step(dt, input) {
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 14);

      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.life -= dt;
        if (p.life <= 0) { s.particles.splice(i, 1); continue; }
        p.vy += 260 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }

      if (s.dead) return;

      // --- paleta: teclado o mouse, lo que se use último ---
      const speed = 190;
      if (input.left) s.paddleX -= speed * dt;
      if (input.right) s.paddleX += speed * dt;
      if (input.pointerActive && input.pointerDown) s.paddleX = input.pointerX - PADDLE_W / 2;
      s.paddleX = clamp(s.paddleX, 2, W - PADDLE_W - 2);

      if (s.stuck) {
        s.ball.x = s.paddleX + PADDLE_W / 2;
        s.ball.y = PADDLE_Y - BALL_R - 2;
        if (input.actionPressed) launch();
        return;
      }

      const b = s.ball;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // --- paredes ---
      if (b.x - BALL_R < 2) { b.x = 2 + BALL_R; b.vx = Math.abs(b.vx); blip(300, 0.03, 'square', 0.03); }
      if (b.x + BALL_R > W - 2) { b.x = W - 2 - BALL_R; b.vx = -Math.abs(b.vx); blip(300, 0.03, 'square', 0.03); }
      if (b.y - BALL_R < 22) { b.y = 22 + BALL_R; b.vy = Math.abs(b.vy); blip(300, 0.03, 'square', 0.03); }

      // --- paleta: el ángulo depende del punto de impacto ---
      if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y - BALL_R <= PADDLE_Y + PADDLE_H &&
          b.x >= s.paddleX - BALL_R && b.x <= s.paddleX + PADDLE_W + BALL_R) {
        const hit = clamp((b.x - (s.paddleX + PADDLE_W / 2)) / (PADDLE_W / 2), -1, 1);
        const speedNow = Math.min(SPEED_MAX, Math.hypot(b.vx, b.vy) + 2);
        const angle = hit * MAX_BOUNCE_ANGLE;
        b.vx = Math.sin(angle) * speedNow;
        b.vy = -Math.cos(angle) * speedNow;
        b.y = PADDLE_Y - BALL_R;
        blip(440, 0.05, 'square', 0.04, 560);
      }

      // --- bloques: se resuelve por el eje de menor penetración ---
      for (let i = s.bricks.length - 1; i >= 0; i--) {
        const k = s.bricks[i];
        if (b.x + BALL_R < k.x || b.x - BALL_R > k.x + k.w ||
            b.y + BALL_R < k.y || b.y - BALL_R > k.y + k.h) continue;

        const overlapX = Math.min(b.x + BALL_R - k.x, k.x + k.w - (b.x - BALL_R));
        const overlapY = Math.min(b.y + BALL_R - k.y, k.y + k.h - (b.y - BALL_R));
        if (overlapX < overlapY) {
          b.vx = -b.vx;
          b.x += b.vx > 0 ? overlapX : -overlapX;
        } else {
          b.vy = -b.vy;
          b.y += b.vy > 0 ? overlapY : -overlapY;
        }
        hitBrick(k, i);
        break; // un bloque por frame: evita rebotes múltiples contradictorios
      }

      // --- se fue abajo ---
      if (b.y - BALL_R > H) {
        s.lives--;
        s.shake = 1;
        blip(220, 0.3, 'sawtooth', 0.05, 70);
        if (s.lives <= 0) {
          s.dead = true;
          api.gameOver(s.score);
        } else {
          resetBall();
        }
      }
    }

    function draw(g) {
      const sx = s.shake > 0 ? (Math.random() - 0.5) * 4 * s.shake : 0;
      g.ctx.save();
      g.ctx.translate(Math.round(sx), 0);

      g.clear(PAL.night);
      // Degradé de fondo con dithering: el truco visual de la PS1.
      g.dither(0, 22, W, 40, '#1B2A55', 0.55);
      g.dither(0, 62, W, 40, '#141F40', 0.35);

      // marco
      g.rect(0, 20, W, 2, PAL.grey);
      g.rect(0, 20, 2, H - 20, PAL.grey);
      g.rect(W - 2, 20, 2, H - 20, PAL.grey);

      for (const k of s.bricks) {
        const base = k.hp > 1 ? PAL.red : PAL.coin;
        const dark = k.hp > 1 ? PAL.redDark : PAL.coinDark;
        g.rect(k.x, k.y, k.w, k.h, dark);
        g.rect(k.x + 1, k.y + 1, k.w - 2, k.h - 2, base);
        // signo de interrogación
        g.rect(k.x + 10, k.y + 3, 5, 2, dark);
        g.rect(k.x + 13, k.y + 5, 2, 2, dark);
        g.rect(k.x + 11, k.y + 6, 3, 2, dark);
        g.rect(k.x + 11, k.y + 9, 2, 1, dark);
      }

      // paleta (una tubería acostada, para que combine con los otros juegos)
      g.rect(s.paddleX, PADDLE_Y, PADDLE_W, PADDLE_H, PAL.pipeDark);
      g.rect(s.paddleX + 1, PADDLE_Y + 1, PADDLE_W - 2, 2, PAL.pipe);
      g.rect(s.paddleX + 2, PADDLE_Y + 1, 4, 1, PAL.pipeLight);

      // pelota
      g.rect(s.ball.x - BALL_R, s.ball.y - BALL_R, BALL_R * 2, BALL_R * 2, PAL.white);

      for (const p of s.particles) {
        g.alpha(clamp(p.life / p.max, 0, 1), () => g.rect(p.x, p.y, 2, 2, p.color));
      }
      g.ctx.restore();

      // vidas
      for (let i = 0; i < s.lives; i++) g.rect(W - 12 - i * 7, H - 12, 4, 4, PAL.red);
      g.text(`NIVEL ${s.level}`, 6, H - 14, { size: 8, color: PAL.white, shadow: PAL.black });

      if (s.stuck && !s.dead) {
        g.text('ESPACIO PARA LANZAR', W / 2, H - 40, {
          size: 8, align: 'center',
          color: g.blink(performance.now() / 1000) ? PAL.white : 'rgba(255,255,255,0.35)',
          shadow: PAL.black,
        });
      }
    }

    return { reset, step, draw };
  },
};
