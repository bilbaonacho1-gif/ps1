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

/* Encuadres. El final replica lo que calcula scroll.js en el tope de la
   página (ver ORBIT_DEG / HEIGHT_MIN / RADIUS allá) para que el traspaso de
   control sea invisible. */
const NEAR = { radius: 0.27, height: 0.085, angle: Math.PI / 4 - 0.30 };
const FAR  = { radius: 0.56, height: 0.260, angle: Math.PI / 4 };

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

  // --- cámara: primer plano que se aleja hasta el encuadre del hero ---
  const k = ease(span(t, T.close, T.end));
  const radius = NEAR.radius + (FAR.radius - NEAR.radius) * k;
  const height = NEAR.height + (FAR.height - NEAR.height) * k;
  const angle  = NEAR.angle  + (FAR.angle  - NEAR.angle)  * k;

  if (camera) {
    camera.position.set(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    );
  }
  if (controls) controls.target.set(0, 0.055, 0);

  if (t >= T.reveal) reveal();
  if (t >= T.end) { finish(); return false; }

  return true;
}
