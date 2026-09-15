/* ==========================================================================
   RESET 32-BIT — NARRATIVA POR SCROLL (js/scrolly.js)

   El recurso central de las páginas de lanzamiento cinematográficas:

     una sección MUY alta  +  un contenido pegado adentro  =  tiempo de scroll

   Mientras la sección alta atraviesa el viewport, el contenido queda clavado
   en pantalla y lo que avanza no es la posición sino la ANIMACIÓN. El scroll
   deja de ser "bajar" y pasa a ser una línea de tiempo que maneja el usuario.

   Acá eso mueve tres cosas a la vez, todas derivadas del mismo número 0..1:
     · el clip "Lid Open" del GLB, cuadro por cuadro
     · la cámara, que se acerca y baja mientras la tapa se abre
     · los tres bloques de texto, que se relevan entre sí

   Por qué no se anima con requestAnimationFrame libre: si la animación
   avanzara sola, scrollear para arriba no la volvería atrás. Atada al scroll,
   el gesto es reversible y el usuario siente que la maneja él.
   ========================================================================== */

import { setLidProgress, setScrubMode } from './animations.js';

const state = {
  section: null,
  progress: 0,
  active: false,
  chapters: [],
};

/** Progreso 0..1 de la sección alta a través del viewport. */
function computeProgress() {
  const el = state.section;
  if (!el) return;

  const r = el.getBoundingClientRect();
  // Recorrido útil: desde que el tope toca el borde superior hasta que el
  // fondo lo alcanza. Fuera de eso, el progreso se satura en 0 o en 1.
  const travel = r.height - window.innerHeight;
  if (travel <= 0) { state.progress = 0; return; }

  const raw = -r.top / travel;
  state.progress = Math.min(1, Math.max(0, raw));

  // Solo tomamos el control de la tapa mientras la sección está en pantalla.
  const inView = r.top < window.innerHeight && r.bottom > 0;
  if (inView !== state.active) {
    state.active = inView;
    setScrubMode(inView);
  }
}

/**
 * Curva de la tapa dentro del recorrido.
 *
 * La tapa no se abre de punta a punta: el primer 18% del scroll es aire para
 * leer el titular, y a partir del 75% ya está abierta del todo, para que el
 * final del recorrido sirva de transición a la sección siguiente sin que
 * parezca que la animación se cortó.
 */
const lidCurve = (t) => Math.min(1, Math.max(0, (t - 0.18) / 0.57));

/**
 * Aplica el progreso a la escena. Se llama una vez por frame.
 * Devuelve true si tomó el control de la cámara, para que el orbitado suave
 * de scroll.js no le pelee el mismo frame: dos módulos interpolando la misma
 * cámara producen un temblor que parece un bug de rendimiento.
 */
export function updateScrolly(camera, controls) {
  if (!state.section) return false;

  const t = state.progress;

  if (state.active) {
    setLidProgress(lidCurve(t));

    if (camera && controls) {
      /* DISTANCIA FIJA, a propósito.
         La versión anterior acercaba la cámara mientras la tapa se abría. Se
         veía bien aislada, pero al crecer la consola invadía la columna del
         titular y las dos cosas se mezclaban. En una composición a dos
         columnas el objeto tiene que quedarse en la suya: el interés lo aporta
         el movimiento, no el tamaño.

         Así que el scroll mueve el ÁNGULO y la ALTURA de la cámara —la
         consola gira y se inclina— pero el radio no cambia, y por lo tanto
         tampoco cambia cuánto ocupa en pantalla. */
      const RADIUS = 0.60;
      const height = 0.32 - 0.10 * t;          // bajamos para ver entrar la tapa
      const angle = Math.PI / 4 + (t - 0.5) * 0.7;

      camera.position.lerp(
        { x: Math.cos(angle) * RADIUS, y: height, z: Math.sin(angle) * RADIUS },
        0.08
      );
      controls.target.lerp({ x: 0, y: 0.055, z: 0 }, 0.1);
    }
  }

  // Relevo de los bloques de texto: cada uno manda en su tercio del recorrido.
  state.chapters.forEach((el, i) => {
    const from = i / state.chapters.length;
    const to = (i + 1) / state.chapters.length;
    const on = t >= from - 0.04 && t < to + 0.04;
    el.classList.toggle('on', on);
  });

  return state.active;
}

export function initScrolly(sectionEl) {
  state.section = sectionEl;
  if (!sectionEl) return;

  state.chapters = [...sectionEl.querySelectorAll('[data-chapter]')];

  window.addEventListener('scroll', computeProgress, { passive: true });
  window.addEventListener('resize', computeProgress);
  computeProgress();
}

export const scrollyProgress = () => state.progress;

/**
 * Barra de progreso de lectura en la barra superior.
 *
 * Es el indicador más barato que existe —una línea que crece— y el que más
 * ayuda en una página larga: dice cuánto falta sin ocupar lugar.
 */
export function initReadingProgress() {
  const bar = document.getElementById('read-progress');
  if (!bar) return;

  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    bar.style.transform = `scaleX(${pct / 100})`;
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/**
 * Cifras que cuentan hacia arriba al entrar en pantalla.
 *
 * El número final se lee de data-count y el sufijo del texto que ya está en el
 * HTML, así que si el JS no corre el dato igual está escrito y es correcto.
 */
export function initCounters() {
  const els = document.querySelectorAll('[data-count]');
  if (!els.length) return;

  const run = (el) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix ?? '';
    const dur = 1100;
    const t0 = performance.now();

    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      // easeOutExpo: arranca rápido y frena, como un contador mecánico.
      const eased = k === 1 ? 1 : 1 - Math.pow(2, -10 * k);
      el.textContent = Math.round(target * eased) + suffix;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => { el.textContent = el.dataset.count + (el.dataset.suffix ?? ''); });
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      run(e.target);
      io.unobserve(e.target);
    }
  }, { threshold: 0.6 });

  els.forEach((el) => io.observe(el));
}
