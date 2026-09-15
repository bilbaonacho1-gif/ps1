/* ==========================================================================
   SUPER PIPE DASH - endless runner (js/arcade/pipe-dash.js)

   Corrés solo, saltás tuberías, juntás monedas. La dificultad sube con la
   velocidad, y la separación entre obstáculos baja con ella pero nunca por
   debajo de lo que alcanza a saltar el personaje: un endless runner deja de
   ser justo en el momento en que genera algo imposible.
   ========================================================================== */

import { W, H, PAL, rand, clamp, aabb, blip } from './engine.js';

const GROUND_Y = 148;
const GRAVITY = 900;
const JUMP_V = -300;
const JUMP_CUT = 0.45;   // soltar temprano recorta el ascenso
const COYOTE = 0.08;     // margen para saltar tras dejar el piso
const BUFFER = 0.12;     // margen para registrar un salto antes de aterrizar

const SPEED_START = 95;
const SPEED_MAX = 260;
const SPEED_RAMP = 3.2;

const PW = 12, PH = 16, PX = 54;

export default {
  id: 'pipe-dash',
  name: 'SUPER PIPE DASH',
  tagline: 'ESQUIVÁ LAS TUBERÍAS',
  controls: 'ESPACIO / CLICK — SALTAR',

  create(api) {
    const s = {
      t: 0, speed: 0, dist: 0, coins: 0, dead: false,
      p: { y: 0, vy: 0, onGround: true, leftGroundAt: -Infinity, anim: 0 },
      obstacles: [], pickups: [], particles: [], clouds: [], hills: [],
      spawnIn: 1, bufferedAt: -Infinity, shake: 0,
    };

    function reset() {
      s.t = 0; s.speed = SPEED_START; s.dist = 0; s.coins = 0; s.dead = false;
      s.spawnIn = 1; s.bufferedAt = -Infinity; s.shake = 0;
      s.obstacles.length = 0; s.pickups.length = 0; s.particles.length = 0;
      s.p.y = GROUND_Y - PH; s.p.vy = 0; s.p.onGround = true;
      s.p.leftGroundAt = -Infinity; s.p.anim = 0;
      s.clouds = Array.from({ length: 5 }, () => ({ x: rand(0, W), y: rand(16, 60), s: rand(0.6, 1.2) }));
      s.hills = Array.from({ length: 6 }, (_, i) => ({ x: i * 70 + rand(-12, 12), h: rand(26, 52), w: rand(58, 96) }));
    }

    function jump() {
      const p = s.p;
      if (!(p.onGround || (s.t - p.leftGroundAt) < COYOTE)) return;
      p.vy = JUMP_V;
      p.onGround = false;
      p.leftGroundAt = -Infinity;
      s.bufferedAt = -Infinity;
      blip(420, 0.10, 'square', 0.045, 760);
    }

    function burst(x, y, color, n = 8) {
      for (let i = 0; i < n; i++) {
        s.particles.push({ x, y, color, vx: rand(-70, 70), vy: rand(-110, -20), life: rand(0.3, 0.7), max: 0.7 });
      }
    }

    function arcOfCoins(x, topY) {
      for (let i = 0; i < 4; i++) {
        const k = i / 3;
        s.pickups.push({ x: x + k * 34, y: topY + Math.sin(Math.PI * k) * -12 + 10, spin: rand(0, 6) });
      }
    }

    function spawn() {
      // La separación se acorta con la velocidad, con piso en 108 px.
      const gap = clamp(340 - s.speed * 0.55, 108, 240);
      s.spawnIn = (gap + rand(-24, 40)) / s.speed;

      const roll = Math.random();
      if (roll < 0.62) {
        const h = [16, 22, 30][Math.floor(rand(0, 3))];
        s.obstacles.push({ type: 'pipe', x: W + 12, y: GROUND_Y - h, w: 16, h });
        if (Math.random() < 0.55) arcOfCoins(W + 20, GROUND_Y - h - 26);
      } else if (roll < 0.86) {
        const h = [18, 24][Math.floor(rand(0, 2))];
        s.obstacles.push({ type: 'pipe', x: W + 12, y: GROUND_Y - h, w: 14, h });
        s.obstacles.push({ type: 'pipe', x: W + 27, y: GROUND_Y - h, w: 14, h });
        if (Math.random() < 0.7) arcOfCoins(W + 26, GROUND_Y - h - 30);
      } else {
        // Bloque flotante: obliga a NO saltar. Rompe el automatismo.
        s.obstacles.push({ type: 'block', x: W + 12, y: GROUND_Y - 54, w: 18, h: 16 });
        if (Math.random() < 0.6) {
          for (let i = 0; i < 3; i++) s.pickups.push({ x: W + 16 + i * 11, y: GROUND_Y - 14, spin: rand(0, 6) });
        }
      }
    }

    function die() {
      if (s.dead) return;
      s.dead = true;
      s.shake = 1;
      s.p.vy = -180;
      burst(PX + PW / 2, s.p.y + PH / 2, PAL.red, 14);
      api.gameOver(score());
    }

    const score = () => Math.floor(s.dist / 8) + s.coins * 10;

    function step(dt, input) {
      s.t += dt;
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 14);

      // --- parallax ---
      const sp = s.dead ? s.speed * 0.2 : s.speed;
      for (const c of s.clouds) {
        c.x -= sp * 0.06 * c.s * dt;
        if (c.x < -34) { c.x = W + rand(4, 40); c.y = rand(16, 60); c.s = rand(0.6, 1.2); }
      }
      for (const h of s.hills) {
        h.x -= sp * 0.28 * dt;
        if (h.x + h.w < -6) { h.x = W + rand(10, 60); h.h = rand(26, 52); h.w = rand(58, 96); }
      }

      // --- partículas ---
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.life -= dt;
        if (p.life <= 0) { s.particles.splice(i, 1); continue; }
        p.vy += GRAVITY * 0.55 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }

      const p = s.p;

      if (s.dead) {
        // Caída final del personaje, sin colisiones.
        p.vy += GRAVITY * dt;
        p.y += p.vy * dt;
        return;
      }

      s.speed = Math.min(SPEED_MAX, s.speed + SPEED_RAMP * dt);
      s.dist += s.speed * dt;
      api.setScore(score());

      if (input.actionPressed) { s.bufferedAt = s.t; jump(); }

      p.vy += GRAVITY * dt;
      if (!input.action && p.vy < 0) p.vy *= (1 - JUMP_CUT * dt * 60);
      p.y += p.vy * dt;

      if (p.y >= GROUND_Y - PH) {
        p.y = GROUND_Y - PH;
        p.vy = 0;
        if (!p.onGround) blip(180, 0.05, 'triangle', 0.022);
        p.onGround = true;
      } else if (p.onGround) {
        p.onGround = false;
        p.leftGroundAt = s.t;
      }
      if (p.onGround) p.anim += s.speed * dt * 0.42;

      // Jump buffer: salto pedido poco antes de tocar el piso.
      if (p.onGround && (s.t - s.bufferedAt) < BUFFER) jump();

      s.spawnIn -= dt;
      if (s.spawnIn <= 0) spawn();

      for (let i = s.obstacles.length - 1; i >= 0; i--) {
        const o = s.obstacles[i];
        o.x -= s.speed * dt;
        if (o.x + o.w < -20) { s.obstacles.splice(i, 1); continue; }
        if (aabb(PX, p.y, PW, PH, o.x, o.y, o.w, o.h)) die();
      }
      for (let i = s.pickups.length - 1; i >= 0; i--) {
        const c = s.pickups[i];
        c.x -= s.speed * dt;
        c.spin += dt * 9;
        if (c.x < -12) { s.pickups.splice(i, 1); continue; }
        if (aabb(PX, p.y, PW, PH, c.x - 4, c.y - 4, 8, 8)) {
          s.pickups.splice(i, 1);
          s.coins++;
          burst(c.x, c.y, PAL.coin, 6);
          blip(880, 0.07, 'square', 0.04, 1320);
        }
      }
    }

    // ------------------------------------------------------------- dibujo

    function drawPipe(g, o) {
      g.rect(o.x + 1, o.y + 7, o.w - 2, o.h - 7, PAL.pipe);
      g.rect(o.x + 3, o.y + 7, 2, o.h - 7, PAL.pipeLight);
      g.rect(o.x + o.w - 4, o.y + 7, 2, o.h - 7, PAL.pipeDark);
      g.rect(o.x - 1, o.y, o.w + 2, 7, PAL.pipe);
      g.rect(o.x + 1, o.y + 1, 2, 5, PAL.pipeLight);
      g.rect(o.x + o.w - 2, o.y + 1, 2, 5, PAL.pipeDark);
    }

    function drawBlock(g, o) {
      g.rect(o.x, o.y, o.w, o.h, PAL.coinDark);
      g.rect(o.x + 1, o.y + 1, o.w - 2, o.h - 2, PAL.coin);
      g.rect(o.x + 6, o.y + 4, 6, 2, PAL.coinDark);
      g.rect(o.x + 10, o.y + 6, 2, 3, PAL.coinDark);
      g.rect(o.x + 8, o.y + 8, 3, 2, PAL.coinDark);
      g.rect(o.x + 8, o.y + 11, 2, 2, PAL.coinDark);
    }

    function drawPlayer(g) {
      const p = s.p, x = PX, y = Math.round(p.y);
      const frame = Math.floor(p.anim) % 4;

      // piernas
      if (!p.onGround) { g.rect(x + 1, y + 13, 4, 3, PAL.redDark); g.rect(x + 7, y + 12, 4, 4, PAL.redDark); }
      else if (frame === 0 || frame === 2) { g.rect(x + 2, y + 13, 3, 3, PAL.redDark); g.rect(x + 7, y + 13, 3, 3, PAL.redDark); }
      else if (frame === 1) { g.rect(x, y + 13, 4, 3, PAL.redDark); g.rect(x + 8, y + 12, 3, 4, PAL.redDark); }
      else { g.rect(x + 3, y + 12, 3, 4, PAL.redDark); g.rect(x + 7, y + 13, 4, 3, PAL.redDark); }

      g.rect(x + 1, y + 6, 10, 8, PAL.red);       // torso
      g.rect(x + 1, y + 12, 10, 2, PAL.redDark);
      g.rect(x + 2, y + 2, 8, 5, PAL.skin);        // cara
      g.rect(x + 1, y, 9, 3, PAL.blue);            // gorra
      g.rect(x + 8, y + 2, 4, 1, PAL.blue);        // visera
      g.rect(x + 7, y + 3, 1, 2, PAL.black);       // ojo
    }

    function draw(g) {
      const sx = s.shake > 0 ? (Math.random() - 0.5) * 5 * s.shake : 0;
      const sy = s.shake > 0 ? (Math.random() - 0.5) * 5 * s.shake : 0;
      g.ctx.save();
      g.ctx.translate(Math.round(sx), Math.round(sy));

      g.gradientSky(PAL.skyTop, PAL.skyBottom, GROUND_Y);

      for (const c of s.clouds) {
        g.rect(c.x, c.y, 16 * c.s, 5 * c.s, PAL.white);
        g.rect(c.x + 4 * c.s, c.y - 4 * c.s, 9 * c.s, 5 * c.s, PAL.white);
      }
      for (const h of s.hills) {
        g.ctx.fillStyle = PAL.hill;
        g.ctx.beginPath();
        g.ctx.moveTo(Math.round(h.x), GROUND_Y);
        g.ctx.lineTo(Math.round(h.x + h.w / 2), GROUND_Y - Math.round(h.h));
        g.ctx.lineTo(Math.round(h.x + h.w), GROUND_Y);
        g.ctx.closePath();
        g.ctx.fill();
      }

      g.rect(0, GROUND_Y, W, H - GROUND_Y, PAL.ground);
      g.rect(0, GROUND_Y, W, 3, PAL.groundDark);
      const off = Math.floor(s.dist) % 16;
      for (let x = -off; x < W + 16; x += 16) {
        g.rect(x, GROUND_Y + 8, 8, 2, PAL.groundDark);
        g.rect(x + 8, GROUND_Y + 18, 8, 2, PAL.groundDark);
      }

      for (const o of s.obstacles) (o.type === 'pipe' ? drawPipe : drawBlock)(g, o);
      for (const c of s.pickups) {
        const w = Math.max(1, Math.round(Math.abs(Math.cos(c.spin)) * 6));
        g.rect(c.x - w / 2 - 1, c.y - 4, w + 2, 8, PAL.coinDark);
        g.rect(c.x - w / 2, c.y - 3, w, 6, PAL.coin);
      }

      drawPlayer(g);

      for (const p of s.particles) {
        g.alpha(clamp(p.life / p.max, 0, 1), () => g.rect(p.x, p.y, 2, 2, p.color));
      }
      g.ctx.restore();

      g.text(`MONEDAS ${String(s.coins).padStart(2, '0')}`, 6, H - 14, { size: 8, color: PAL.white, shadow: PAL.black });
    }

    return { reset, step, draw };
  },
};
