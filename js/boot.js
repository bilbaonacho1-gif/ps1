/* ==========================================================================
   RESET 32-BIT — SECUENCIA DE ARRANQUE (js/boot.js)

   Homenaje al encendido de una consola de quinta generación, con la misma
   estructura que usa cualquier intro cinematográfica: primero un gesto que
   se reconoce, después la marca, y recién al final la página.

     1. DRAW    los cuatro símbolos se dibujan trazo por trazo, uno tras otro
     2. LIT     prenden en color y dan un pulso
     3. SETTLE  se juntan y encogen; entra la marca y la barra
     4. OUT     la cortina sube y descubre el hero, que entra escalonado

   Dos reglas que hacen que no se sienta un truco:

   · La barra mide carga REAL. El porcentaje viene del GLTFLoader, no de un
     temporizador. Si el modelo tarda, la intro espera; no miente.

   · Hay un piso de tiempo. Con el modelo en caché la carga termina en 80ms y
     la secuencia se vería como un parpadeo raro. El piso garantiza que se
     entienda lo que pasó, sin castigar a nadie: es más corto que lo que tarda
     el GLB la primera vez, así que en la práctica solo actúa al recargar.
   ========================================================================== */

/* Duraciones de cada fase, en ms. Los mismos números están en el CSS; acá
   viven los saltos entre fases, allá las transiciones de cada propiedad. */
const T = {
  lit: 700,     // los 4 símbolos terminan de dibujarse a los ~650
  settle: 1050, // se acomodan y entra la marca
  floor: 2000,  // piso global: nunca salir antes de esto
  dwell: 650,   // lo que la marca tiene que quedarse en pantalla, si o si
  curtain: 900, // lo que tarda la cortina en subir
};

const state = {
  el: null,
  fill: null,
  pct: null,
  label: null,
  t0: 0,
  markAt: 0,
  loaded: false,
  done: false,
};

/** Respeta la preferencia del sistema: sin motion, la intro no actúa. */
const reduced = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Prepara el dibujo trazo por trazo.
 *
 * stroke-dasharray necesita el largo exacto de cada trazo, y ese largo
 * depende de la forma. Medirlo con getTotalLength() en vez de hardcodearlo
 * significa que se puede cambiar cualquier símbolo en el HTML sin tocar el JS.
 */
function measureStrokes(root) {
  root.querySelectorAll('.glyph svg > *').forEach((shape) => {
    let len = 0;
    try {
      len = shape.getTotalLength();
    } catch {
      /* getTotalLength no existe para <rect> en algunos motores: el perímetro
         se calcula a mano y listo. */
      const w = parseFloat(shape.getAttribute('width')) || 0;
      const h = parseFloat(shape.getAttribute('height')) || 0;
      len = (w + h) * 2;
    }
    if (!len || !isFinite(len)) len = 200;
    shape.style.setProperty('--len', len.toFixed(1));
  });
}

export function initBoot() {
  const el = document.getElementById('boot');
  if (!el) return;

  state.el = el;
  state.fill = document.getElementById('boot-fill');
  state.pct = document.getElementById('boot-pct');
  state.label = document.getElementById('boot-stage-label');
  state.t0 = performance.now();

  if (reduced()) {
    // Sin animación: se muestra el estado final y se sale apenas cargue.
    el.classList.add('draw', 'lit', 'settle', 'mark');
    return;
  }

  measureStrokes(el);

  // Un frame de aire para que el navegador registre el estado inicial: si se
  // agrega la clase en el mismo tick, no hay transición, hay salto.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('draw'));
  });

  setTimeout(() => el.classList.add('lit'), T.lit);
  setTimeout(() => {
    el.classList.add('settle', 'mark');
    state.markAt = performance.now();
    if (state.label) state.label.textContent = 'Cargando modelo';
  }, T.settle);
}

/** Progreso real de descarga del GLB, 0..100. */
export function setBootProgress(percent) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  if (state.fill) state.fill.style.width = `${p}%`;
  if (state.pct) state.pct.textContent = String(p);
  state.el?.setAttribute('aria-valuenow', String(p));
}

/**
 * Avisa que la escena terminó de cargar. La salida ocurre cuando se cumplen
 * las dos condiciones: cargado Y piso de tiempo cumplido.
 */
export function finishBoot() {
  if (state.loaded) return;
  state.loaded = true;

  setBootProgress(100);
  if (state.label) state.label.textContent = 'Listo';

  if (reduced()) { exit(); return; }
  scheduleExit();
}

/**
 * Cuanto falta para poder salir. Cero significa "ya".
 *
 * Son dos condiciones, no una. El piso global evita el parpadeo cuando todo
 * viene de cache. El dwell protege a la marca: si el hilo se bloqueo parseando
 * el GLB, la fase de la marca puede entrar tardisimo y quedarse cien
 * milisegundos antes de que suba la cortina, que se ve como un error. Medir
 * desde que la marca APARECIO —y no desde que arranco la pagina— hace que se
 * lea siempre, rapido o lento el equipo.
 */
function timeLeft() {
  const now = performance.now();
  const floorLeft = T.floor - (now - state.t0);
  // Si la marca todavia no entro, volvemos a preguntar mas adelante.
  const markLeft = state.markAt ? T.dwell - (now - state.markAt) : T.dwell;
  return Math.max(0, floorLeft, markLeft);
}

function scheduleExit() {
  const wait = timeLeft();
  if (wait <= 0) exit();
  else setTimeout(scheduleExit, wait);
}

function exit() {
  if (state.done) return;
  state.done = true;

  const el = state.el;
  if (!el) { document.body.classList.add('booted'); return; }

  el.classList.add('out');

  /* El hero entra mientras la cortina todavía está subiendo. Encadenar las
     dos cosas en vez de esperar a que termine la primera es lo que hace que
     se sienta una transición y no dos animaciones pegadas. */
  setTimeout(() => document.body.classList.add('booted'), 180);

  // Fuera del árbol: un overlay a pantalla completa, aunque esté transparente,
  // sigue componiéndose en cada frame.
  setTimeout(() => el.classList.add('gone'), T.curtain + 400);
}

/**
 * Cuánto hay que esperar antes de arrancar trabajo pesado en el hilo principal.
 *
 * Inicializar la escena y parsear el GLB bloquea el hilo cerca de dos segundos.
 * Si eso arranca junto con la intro, los setTimeout de las fases se encolan y
 * salen todos juntos al liberarse el hilo: la secuencia entera se aplasta en un
 * frame y no se ve nada. Reservando la primera fase —el dibujo de los cuatro
 * símbolos, que es el gesto que hay que ver— el resto puede competir con la
 * carga sin que se note, porque ya son elementos estáticos.
 *
 * No agrega espera percibida: el piso de T.floor es más largo que esto.
 */
export const BOOT_DRAW_MS = T.lit;

/**
 * Red de seguridad.
 *
 * El boot tapa la página entera. Si la escena nunca avisa que cargó —GLB
 * caído, WebGL no disponible, una excepción antes del callback— sin esto la
 * página queda detrás de un rectángulo negro para siempre. Preferimos entrar
 * sin intro antes que no entrar.
 */
export function armBootFailsafe(ms = 12000) {
  setTimeout(() => {
    if (!state.done) {
      if (state.label) state.label.textContent = 'Listo';
      exit();
    }
  }, ms);
}
