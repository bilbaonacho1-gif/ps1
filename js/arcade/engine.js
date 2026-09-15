/* ==========================================================================
   RESET 32-BIT - MOTOR DEL ARCADE (js/arcade/engine.js)

   Runtime compartido por los tres juegos. Se ocupa de todo lo que no es
   "el juego" propiamente dicho: el bucle, el tiempo, las teclas, el sonido
   y los helpers de dibujo.

   Cada juego es un módulo que exporta un objeto con esta forma:

     {
       id, name, tagline, controls,
       create(api) -> { reset(), step(dt, input), draw(g) }
     }

   De ese modo agregar un cuarto juego es crear un archivo, sin tocar nada más.

   POR QUÉ UN PASO DE TIEMPO FIJO
   ------------------------------
   La física avanza siempre de a 1/120 s aunque el navegador entregue frames
   irregulares. Sin esto pasan dos cosas malas: en una máquina lenta los objetos
   se teletransportan y atraviesan paredes (tunneling), y la altura de un salto
   cambia según los FPS, o sea que el juego se siente distinto en cada PC.
   ========================================================================== */

export const W = 320;   // ancho interno del framebuffer
export const H = 180;   // alto interno
const FIXED_DT = 1 / 120;
const MAX_FRAME = 0.25; // techo por frame: evita simular minutos tras un alt-tab

/* Paleta común a los tres juegos. Que compartan colores es lo que hace que se
   vean como un mismo cartucho y no como tres cosas pegadas con cinta. */
export const PAL = {
  skyTop: '#5C94FC',
  skyBottom: '#9BD1FF',
  night: '#0B1026',
  hill: '#3B7D3B',
  hillDark: '#2E6B2E',
  ground: '#C46A2B',
  groundDark: '#8E4A1C',
  pipe: '#1FA65A',
  pipeDark: '#127A3F',
  pipeLight: '#5BD98C',
  coin: '#F2B705',
  coinDark: '#B98600',
  red: '#E03B30',
  redDark: '#9E241C',
  blue: '#2B5FD9',
  skin: '#F7C9A0',
  white: '#FFFFFF',
  black: '#1A1A1A',
  grey: '#6B7280',
};

// ------------------------------------------------------------------- audio

let audioCtx = null;
let muted = false;

export function setMuted(v) { muted = !!v; }
export function isMuted() { return muted; }

/**
 * Sintetiza un blip. No hay archivos de audio en el proyecto: todo se genera
 * con WebAudio, así que no suma peso de descarga ni pedidos al servidor.
 */
export function blip(freq, duration, type = 'square', gain = 0.05, slideTo = null) {
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  } catch { /* el audio jamás debe tumbar el juego */ }
}

/** Arpegio corto, para jingles de inicio y de game over. */
export function jingle(notes, step = 0.09, type = 'square', gain = 0.045) {
  notes.forEach((f, i) => setTimeout(() => blip(f, step * 1.6, type, gain), i * step * 1000));
}

// ---------------------------------------------------------------- utilidades

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const aabb = (ax, ay, aw, ah, bx, by, bw, bh) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

export function loadBest(id) {
  try { return parseInt(localStorage.getItem(`reset_arcade_${id}`) || '0', 10) || 0; }
  catch { return 0; }
}
export function saveBest(id, v) {
  try { localStorage.setItem(`reset_arcade_${id}`, String(v)); } catch { /* modo privado */ }
}

// ------------------------------------------------------------------- input

/**
 * Estado de entrada compartido. Se distingue "held" (mantenido) de "pressed"
 * (apretado en este frame), porque un menú necesita lo segundo y un salto
 * necesita lo primero.
 */
export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const state = {
    left: false, right: false, up: false, down: false,
    action: false, actionPressed: false,
    pointerDown: false, pointerX: 0, pointerY: 0, pointerActive: false,
    consume() { pressed.clear(); state.actionPressed = false; },
    wasPressed: (code) => pressed.has(code),
    isHeld: (code) => held.has(code),
    destroy: null,
  };

  const AXES = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
  };
  const ACTION = new Set(['Space', 'Enter', 'NumpadEnter', 'KeyZ']);

  // Solo interceptamos las teclas del juego cuando el arcade tiene el foco;
  // si no, robaríamos la barra espaciadora a toda la página.
  let focused = false;
  const setFocus = (v) => { focused = v; if (!v) { held.clear(); syncAxes(); } };

  function syncAxes() {
    state.left = [...Object.keys(AXES)].some((k) => AXES[k] === 'left' && held.has(k));
    state.right = [...Object.keys(AXES)].some((k) => AXES[k] === 'right' && held.has(k));
    state.up = [...Object.keys(AXES)].some((k) => AXES[k] === 'up' && held.has(k));
    state.down = [...Object.keys(AXES)].some((k) => AXES[k] === 'down' && held.has(k));
    state.action = [...ACTION].some((k) => held.has(k));
  }

  function onKeyDown(e) {
    if (!focused) return;
    if (!AXES[e.code] && !ACTION.has(e.code)) return;
    e.preventDefault(); // que la barra no scrollee la página mientras jugás
    if (!e.repeat) { pressed.add(e.code); if (ACTION.has(e.code)) state.actionPressed = true; }
    held.add(e.code);
    syncAxes();
  }
  function onKeyUp(e) {
    if (!AXES[e.code] && !ACTION.has(e.code)) return;
    held.delete(e.code);
    syncAxes();
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    state.pointerX = ((e.clientX - r.left) / r.width) * W;
    state.pointerY = ((e.clientY - r.top) / r.height) * H;
    state.pointerActive = true;
  }
  function onPointerDown(e) {
    e.preventDefault();
    canvas.focus();
    pointerPos(e);
    state.pointerDown = true;
    state.actionPressed = true;
    state.action = true;
    pressed.add('Space');
  }
  function onPointerMove(e) { pointerPos(e); }
  function onPointerUp() { state.pointerDown = false; state.action = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('focus', () => setFocus(true));
  canvas.addEventListener('blur', () => setFocus(false));
  canvas.addEventListener('pointerenter', () => setFocus(true));
  canvas.addEventListener('pointerleave', () => { if (document.activeElement !== canvas) setFocus(false); });

  state.destroy = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };
  state.setFocus = setFocus;

  return state;
}

// ------------------------------------------------------------------ dibujo

/**
 * Envoltorio del contexto 2D con helpers de pixel art.
 *
 * Todo se redondea a enteros a propósito: dibujar en coordenadas fraccionarias
 * hace que el navegador interpole y el pixel art salga borroso.
 */
export function createGfx(ctx) {
  const g = {
    ctx,
    clear(color) { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); },
    rect(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    },
    /** Rectángulo con borde de 1px, el look clásico de HUD de 16 bits. */
    panel(x, y, w, h, fill, border) {
      g.rect(x, y, w, h, border);
      g.rect(x + 1, y + 1, w - 2, h - 2, fill);
    },
    gradientSky(topColor, bottomColor, until = H) {
      const grd = ctx.createLinearGradient(0, 0, 0, until);
      grd.addColorStop(0, topColor);
      grd.addColorStop(1, bottomColor);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, until);
    },
    text(str, x, y, { size = 8, color = PAL.white, align = 'left', shadow = null } = {}) {
      ctx.font = `${size}px "Silkscreen", monospace`;
      ctx.textAlign = align;
      ctx.textBaseline = 'top';
      if (shadow) {
        ctx.fillStyle = shadow;
        ctx.fillText(str, Math.round(x) + 1, Math.round(y) + 1);
      }
      ctx.fillStyle = color;
      ctx.fillText(str, Math.round(x), Math.round(y));
      ctx.textAlign = 'left';
    },
    /** Parpadeo para los "PRESS START": devuelve true la mitad del tiempo. */
    blink(t, hz = 2) { return Math.floor(t * hz) % 2 === 0; },
    alpha(a, fn) { ctx.globalAlpha = a; fn(); ctx.globalAlpha = 1; },

    /**
     * Dithering ordenado 4x4 (matriz de Bayer).
     *
     * La PlayStation 1 mezclaba colores con esta técnica porque su framebuffer
     * era de 15 bits y no le alcanzaban los tonos para hacer degradés limpios.
     * Reproducirlo es lo que le da al render el "olor" a 1995.
     */
    dither(x, y, w, h, color, strength = 0.5) {
      const M = [
        [0, 8, 2, 10], [12, 4, 14, 6],
        [3, 11, 1, 9], [15, 7, 13, 5],
      ];
      const cut = strength * 16;
      ctx.fillStyle = color;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          if (M[j & 3][i & 3] < cut) ctx.fillRect(Math.round(x + i), Math.round(y + j), 1, 1);
        }
      }
    },
  };
  return g;
}

// -------------------------------------------------------------------- loop

/**
 * Bucle con acumulador. `onStep` recibe siempre el mismo dt; `onDraw` corre
 * una vez por frame real.
 */
export function createLoop(onStep, onDraw) {
  let rafId = null;
  let running = false;
  let last = 0;
  let acc = 0;

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME, (now - last) / 1000 || 0);
    last = now;
    acc += dt;
    let guard = 0;
    while (acc >= FIXED_DT && guard++ < 240) {
      onStep(FIXED_DT);
      acc -= FIXED_DT;
    }
    onDraw();
  }

  return {
    start() {
      if (running) return;
      running = true;
      acc = 0;
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    },
    get running() { return running; },
  };
}
