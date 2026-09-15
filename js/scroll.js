/* ==========================================================================
   RESET 32-BIT — CÁMARA LIGADA AL SCROLL (js/scroll.js)

   Con el canvas contenido en la vitrina, atar la cámara al scroll GLOBAL de la
   página no tiene sentido: cuando la vitrina no está a la vista, da igual dónde
   mire la cámara.

   Lo que sí tiene sentido es atarla al recorrido de la vitrina POR el viewport:
   mientras sube por la pantalla, la cámara describe un arco suave alrededor de
   la consola. El efecto es que el objeto parece girar mientras scrolleás, y se
   detiene solo cuando lo agarrás con el mouse.
   ========================================================================== */

import * as THREE from 'three';

const ORBIT_DEG = 26;   // amplitud total del arco horizontal
const HEIGHT_MIN = 0.20;
const HEIGHT_MAX = 0.32;
const RADIUS = 0.56;

export const scrollState = {
  progress: 0.5,        // 0 = entrando por abajo, 1 = saliendo por arriba
  target: new THREE.Vector3(),
  desired: new THREE.Vector3(),
  enabled: true,
};

let container = null;
let dragging = false;

/**
 * Marca cuándo el usuario está arrastrando la consola.
 * OrbitControls emite 'start' al empezar el gesto y 'end' al soltarlo; es la
 * única forma pública de saberlo.
 */
export function bindControls(controls) {
  controls.addEventListener('start', () => { dragging = true; });
  controls.addEventListener('end', () => { dragging = false; });
}

export function initScrollSync(containerEl) {
  container = containerEl;
  const recompute = () => computeProgress();
  window.addEventListener('scroll', recompute, { passive: true });
  window.addEventListener('resize', recompute);
  computeProgress();
}

/**
 * Progreso de la vitrina a través del viewport, de 0 a 1.
 * Se calcula con el centro del elemento, no con scrollY: así funciona igual
 * esté la vitrina en el hero o mudada al catálogo.
 */
function computeProgress() {
  if (!container) return;
  const r = container.getBoundingClientRect();
  if (r.height === 0) return;

  const center = r.top + r.height / 2;
  const travel = window.innerHeight + r.height;
  const raw = 1 - (center + r.height / 2) / travel;
  scrollState.progress = Math.min(1, Math.max(0, raw));
}

/**
 * Interpola la cámara hacia la posición que corresponde al progreso actual.
 * Si el usuario está arrastrando, no tocamos nada: su gesto manda.
 */
export function updateScrollCamera(camera, controls) {
  if (!camera || !controls || !scrollState.enabled) return;

  /* Si el usuario está arrastrando, su gesto manda y no tocamos la cámara.
     OJO: no se puede preguntar por controls.state — no es una propiedad
     pública de OrbitControls, es una variable interna del módulo, así que
     siempre vale undefined. Hay que escuchar los eventos 'start' y 'end'
     que el propio control emite (ver bindControls). */
  if (dragging) return;

  const t = scrollState.progress;
  const angle = THREE.MathUtils.degToRad(-ORBIT_DEG / 2 + ORBIT_DEG * t) + Math.PI / 4;
  const height = HEIGHT_MIN + (HEIGHT_MAX - HEIGHT_MIN) * t;

  scrollState.desired.set(
    Math.cos(angle) * RADIUS,
    height,
    Math.sin(angle) * RADIUS
  );

  // Lerp suave: el 0.045 da un arrastre cinematográfico sin sentirse pesado.
  camera.position.lerp(scrollState.desired, 0.045);
  controls.target.lerp(scrollState.target.set(0, 0.055, 0), 0.08);
}

/** Se llama cuando la vitrina se muda de sección. */
export function setScrollContainer(el) {
  container = el;
  computeProgress();
}
