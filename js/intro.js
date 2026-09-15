/* ==========================================================================
   RESET 32-BIT — CINEMÁTICA DE CARGA (js/intro.js)

   La carga de la página se cuenta como lo que sería cargar un juego: la
   consola en primer plano, la tapa se abre, entra el disco, la tapa se cierra,
   prende el LED y la cámara se aleja hasta descubrir la página.

   El remate es lo que hace que no se sienta un video pegado adelante: la
   cámara termina EXACTAMENTE donde el módulo de scroll la quiere al tope de
   la página, así que cuando se le devuelve el control no hay salto. Cualquier
   diferencia mínima la absorbe el lerp de scroll.js.

   Todo se maneja por tiempo transcurrido y no por cadenas de setTimeout: si un
   frame tarda de más —parseo, compilación de shaders, una pestaña que vuelve
   del fondo— la línea de tiempo no se desfasa, simplemente se evalúa en el
   tiempo real que corresponde.
   ========================================================================== */

import * as THREE from 'three';
import { setLidProgress, setScrubMode, setLed, syncLidFromClip } from './animations.js';
import { createDisc, setDropProgress, setSpinTarget, updateDisc } from './disc.js';

/* Marcas de la línea de tiempo, en segundos. Editar acá para ajustar el ritmo:
   cada fase arranca donde termina la anterior. */
const T = {
  hold:   0.20,   // primer plano quieto, tapa cerrada
  open:   1.00,   // la tapa termina de abrirse
  drop:   1.70,   // el disco termina de bajar
  close:  2.45,   // la tapa termina de cerrarse
  power:  2.75,   // prende el LED
  reveal: 3.15,   // aparece la página, con la cámara todavía alejándose
  end:    3.85,   // fin: el control vuelve al scroll
};

/* Encuadres, en orden de aparición.

   NEAR es un primer plano bajo y cerrado: sirve para la tapa abriéndose,
   porque el gesto llena la pantalla. Pero para VER ENTRAR EL DISCO no sirve —
   tan cerca y tan de costado, el disco baja fuera de cuadro.

   Por eso DISC: la cámara se retira y se pone de frente mientras la tapa se
   abre, y se queda quieta durante toda la bajada del disco. El movimiento
   acompaña un momento y se detiene en el otro; una cámara que sigue viajando
   mientras pasa lo importante le roba atención a lo importante.

   FAR replica lo que calcula scroll.js en el tope de la página (ver ORBIT_DEG
   / HEIGHT_MIN / RADIUS allá) para que el traspaso de control sea invisible. */
const NEAR = { radius: 0.27, height: 0.085, angle: Math.PI / 4 - 0.30 };
const DISC = { radius: 0.44, height: 0.225, angle: Math.PI / 4 + 0.26 };
const FAR  = { radius: 0.56, height: 0.260, angle: Math.PI / 4 };

/** Interpola un encuadre y lo escribe en la cámara. */
function frame(camera, a, b, k) {
  const radius = a.radius + (b.radius - a.radius) * k;
  const height = a.height + (b.height - a.height) * k;
  const angle  = a.angle  + (b.angle  - a.angle)  * k;
  camera.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
}

const state = {
  active: false,
  t0: 0,
  onReveal: null,
  onDone: null,
  revealed: false,
  ready: false,
};

/** Suave en los dos extremos: sin tirones al arrancar ni al frenar. */
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
/** Progreso normalizado dentro de un tramo [a, b]. */
const span = (t, a, b) => clamp01((t - a) / (b - a));

export const introActive = () => state.active;

/* ---------------------------------------------------------------- cambio de CD

   Elegir un juego es cambiar el disco: la tapa se abre, el que estaba sale, baja
   el nuevo y la tapa se cierra. Es la misma maquinaria que la cinemática de
   carga —mismo clip, mismo disco— pero SIN tocar la cámara: acá el usuario está
   mirando el televisor, y moverle el encuadre mientras elige sería arrebatarle
   el control de una interacción que empezó él. */

const INS = { open: 0.60, out: 0.95, drop: 1.45, close: 2.10 };

const insert = { active: false, t0: 0, onIn: null, done: false };

export const insertActive = () => insert.active;

/**
 * Arranca el cambio de disco. `onIn` se llama cuando el disco toca la bandeja,
 * que es el momento en que corresponde que el juego empiece.
 * Devuelve false si no se puede (sin modelo, o con la intro corriendo).
 */
export function startInsert(onIn) {
  if (!state.ready || state.active) return false;
  insert.active = true;
  insert.done = false;
  insert.t0 = performance.now();
  insert.onIn = onIn ?? null;
  setScrubMode(true);
  return true;
}

function updateInsert() {
  const t = (performance.now() - insert.t0) / 1000;

  // Tapa: abre, espera el cambio, cierra.
  if (t < INS.drop) setLidProgress(ease(span(t, 0, INS.open)));
  else setLidProgress(1 - ease(span(t, INS.drop, INS.close)));

  // Disco: sale y vuelve a entrar.
  if (t < INS.out) setDropProgress(1 - ease(span(t, INS.open, INS.out)));
  else setDropProgress(ease(span(t, INS.out, INS.drop)));

  if (!insert.done && t >= INS.drop) {
    insert.done = true;
    const cb = insert.onIn;
    insert.onIn = null;
    cb?.();
  }

  if (t >= INS.close) {
    insert.active = false;
    setScrubMode(false);
    syncLidFromClip();
  }
}

/** Crea el disco. Se llama una vez, apenas el modelo está disponible. */
export function initIntro(sceneState) {
  createDisc(sceneState);
  state.ready = true;
}

export function startIntro({ onReveal, onDone }) {
  state.onReveal = onReveal;
  state.onDone = onDone;

  if (!state.ready) { finish(); return; }   // sin modelo no hay cinemática

  state.active = true;
  state.revealed = false;
  state.t0 = performance.now();

  /* Modo scrub: mientras dura la cinemática la tapa la maneja esta línea de
     tiempo, y ni los botones ni el scroll pueden pelearle. */
  setScrubMode(true);
  setLidProgress(0);
  setDropProgress(0);
  setSpinTarget(0);
  setLed(0);
}

/**
 * Corta la cinemática y deja todo en su estado final.
 * La usa el botón de saltar y también prefers-reduced-motion.
 */
export function skipIntro() {
  if (!state.active) { finish(); return; }
  setLidProgress(0);
  setDropProgress(1);
  setSpinTarget(9);
  setLed(2.8);
  reveal();
  finish();
}

function reveal() {
  if (state.revealed) return;
  state.revealed = true;
  state.onReveal?.();
}

function finish() {
  state.active = false;
  setScrubMode(false);
  /* El flag de la tapa se recalcula desde el clip: la cinemática la movió por
     posición y el botón razona por intención. Sin esto el primer click quedaría
     invertido. */
  syncLidFromClip();
  const done = state.onDone;
  state.onDone = null;
  done?.();
}

/**
 * Avanza la cinemática. Devuelve true mientras tiene tomada la cámara, para
 * que el loop no deje que scroll.js ni scrolly.js la muevan el mismo frame.
 */
export function updateIntro(camera, controls, dt) {
  updateDisc(dt);

  /* El cambio de disco devuelve false: no toma la cámara, así que el orbitado
     ligado al scroll sigue mandando mientras el disco entra. */
  if (insert.active) { updateInsert(); return false; }

  if (!state.active) return false;

  const t = (performance.now() - state.t0) / 1000;

  // --- tapa: se abre, espera a que entre el disco, se cierra ---
  if (t < T.drop) {
    setLidProgress(ease(span(t, T.hold, T.open)));
  } else {
    setLidProgress(1 - ease(span(t, T.drop, T.close)));
  }

  // --- disco: baja y arranca a girar ---
  const drop = ease(span(t, T.open, T.drop));
  setDropProgress(drop);
  if (t >= T.drop) setSpinTarget(t >= T.power ? 9 : 3);

  // --- LED ---
  if (t >= T.power) setLed(2.8);

  /* --- cámara: NEAR mientras abre la tapa, quieta en DISC mientras entra el
         disco, y de ahí al encuadre del hero. --- */
  if (camera) {
    if (t < T.close) {
      frame(camera, NEAR, DISC, ease(span(t, T.hold, T.open)));
    } else {
      frame(camera, DISC, FAR, ease(span(t, T.close, T.end)));
    }
  }
  if (controls) controls.target.set(0, 0.055, 0);

  if (t >= T.reveal) reveal();
  if (t >= T.end) { finish(); return false; }

  return true;
}
