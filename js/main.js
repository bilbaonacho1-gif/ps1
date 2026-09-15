/* ==========================================================================
   RESET 32-BIT — ORQUESTADOR (js/main.js)

   Arranca los dos sistemas independientes de la página —el arcade 2D y la
   escena 3D— y cablea la interfaz: fichas giratorias, mudanza de la vitrina,
   entrada por scroll y el modal de encendido.

   El arcade se inicia PRIMERO y por separado: no depende de Three.js ni del
   GLB, así que si el modelo tardara o fallara, los juegos andan igual.
   ========================================================================== */

import * as THREE from 'three';
import { initScene, sceneState, resizeToContainer } from './scene3d.js';
import {
  initAnimations, toggleEject, togglePower, toggleAutoRotation,
  resetAll, updateAnimations, closeConsole, animState,
} from './animations.js';
import { initInteraction, updateInteractions, interactState } from './interact.js';
import { initScrollSync, updateScrollCamera, setScrollContainer, bindControls } from './scroll.js';
import { initScrolly, updateScrolly, initReadingProgress, initCounters } from './scrolly.js';
import {
  initArcade, playById, toggleArcadeSound, focusArcade,
  getStats, coverDataURL, listGames,
} from './arcade.js';

/* Tres motivos independientes pueden pausar el render 3D, así que llevamos un
   flag por cada uno y derivamos la pausa de los tres. Con una sola variable se
   pisaban entre sí: el handler de visibilitychange reactivaba el render aunque
   la vitrina estuviera fuera de pantalla. */
const pause = { offscreen: false, tabHidden: false, modalOpen: false };
let paused = false;
const syncPause = () => { paused = pause.offscreen || pause.tabHidden || pause.modalOpen; };

const clock = new THREE.Clock();

document.addEventListener('DOMContentLoaded', () => {
  initArcadeSystem();
  init3DSystem();
  wireUI();
  buildFlipCards();
  buildGameChips();
  buildScoreStrip();
  wireTestimonials();
  setupReveal();
  initReadingProgress();
  initCounters();
  initScrolly(document.getElementById('hero'));
  if (location.search.includes('debug')) exposeDiagnostics();
});

/**
 * Diagnóstico bajo demanda: se abre la página con ?debug y se escribe
 * `reset3d()` en la consola del navegador.
 *
 * Existe porque el 3D solo se puede verificar en un navegador real con la
 * ventana visible: con la pestaña oculta el navegador suspende
 * requestAnimationFrame y nada se dibuja. Esto imprime, en una sola línea,
 * todo lo que hace falta para saber dónde se cortó la cadena.
 */
function exposeDiagnostics() {
  window.reset3d = () => {
    const c = document.getElementById('webgl-canvas');
    const v = document.getElementById('vitrine');
    const r = v?.getBoundingClientRect();
    const info = {
      modeloCargado: !!sceneState.model,
      nodosEncontrados: Object.keys(sceneState.nodes).length,
      clip: sceneState.clip?.name ?? 'ninguno',
      renderPausado: paused,
      motivosDePausa: { ...pause },
      vitrina: r ? { ancho: Math.round(r.width), alto: Math.round(r.height), top: Math.round(r.top) } : 'no existe',
      bufferCanvas: c ? `${c.width}x${c.height}` : 'no existe',
      camara: sceneState.camera
        ? sceneState.camera.position.toArray().map((n) => +n.toFixed(3))
        : 'no existe',
      webglPerdido: c?.getContext('webgl2')?.isContextLost?.() ?? 'n/d',
    };
    console.table(info);
    return info;
  };
  console.info('Diagnóstico listo. Escribí  reset3d()  y apretá Enter.');
}

// ------------------------------------------------------------------ arcade

function initArcadeSystem() {
  const canvas = document.getElementById('arcade-screen');
  const machine = document.getElementById('arcade-machine');
  if (canvas && machine) initArcade(canvas, machine);
}

// ---------------------------------------------------------------------- 3D

function init3DSystem() {
  const canvas = document.getElementById('webgl-canvas');
  const loader = document.getElementById('loader');
  const fill = document.getElementById('loader-fill');
  const status = document.getElementById('loader-status');
  if (!canvas) return;

  initScene(
    canvas,
    (percent) => {
      if (fill) fill.style.width = `${percent}%`;
      if (status) status.textContent = `Cargando modelo ${percent}%`;
      loader?.setAttribute('aria-valuenow', String(percent));
    },
    (state) => {
      if (fill) fill.style.width = '100%';
      setTimeout(() => loader?.classList.add('hidden'), 260);

      /* El loop arranca SIEMPRE, aunque el modelo no haya cargado: así la
         vitrina al menos se pinta y no queda un rectángulo muerto. Lo que sí
         depende del modelo son las animaciones y el raycasting. */
      watchVisibility(state.container);
      initScrollSync(state.container);
      startLoop();

      if (!state.model) return;

      initAnimations(state);
      initInteraction(state, {
        onEject: () => toggleEject(),
        onPower: () => syncPowerButton(togglePower()),
        onReset: () => resetAll(),
      });
      if (interactState.controls) bindControls(interactState.controls);

      /* Un re-medido diferido: al cargar, las fuentes web todavía pueden estar
         cambiando la altura del texto del hero, y eso mueve la vitrina. Si el
         renderer se dimensionó con el tamaño viejo, queda estirado. */
      requestAnimationFrame(() => resizeToContainer());
      setTimeout(() => resizeToContainer(), 400);
    }
  );
}

function startLoop() {
  const { renderer, scene, camera } = sceneState;
  if (!renderer) return;

  renderer.setAnimationLoop(() => {
    if (paused) return;
    const dt = clock.getDelta();
    updateAnimations(dt, clock.getElapsedTime(), sceneState.model);
    // El hero fijado manda sobre la cámara mientras está en pantalla;
    // fuera de él vuelve el orbitado suave ligado al scroll.
    if (!updateScrolly(camera, interactState.controls)) {
      updateScrollCamera(camera, interactState.controls);
    }
    updateInteractions(camera);
    renderer.render(scene, camera);
  });
}

function watchVisibility(container) {
  if (container && 'IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        for (const e of entries) pause.offscreen = !e.isIntersecting;
        syncPause();
      },
      { threshold: 0.02 }
    ).observe(container);
  }

  document.addEventListener('visibilitychange', () => {
    pause.tabHidden = document.hidden;
    syncPause();
  });

  // Mientras el modal tapa la vitrina, toda la GPU es para el arcade.
  window.addEventListener('reset:crt', (e) => {
    pause.modalOpen = !!e.detail?.open;
    syncPause();
  });
}

// ---------------------------------------------------- mudanza de la vitrina

/**
 * Mueve la vitrina a otra sección.
 *
 * Es el mismo recurso que usa el arcade: un único nodo que cambia de padre.
 * Reparentar un canvas no destruye su contexto WebGL, así que la escena sigue
 * viva y no hay que recrear nada; solo re-medir, porque el contenedor nuevo
 * puede tener otro tamaño.
 */
function moveVitrine(targetId) {
  const vitrine = document.getElementById('vitrine');
  const target = document.getElementById(targetId);
  if (!vitrine || !target || vitrine.parentElement === target) return;

  target.appendChild(vitrine);
  setScrollContainer(vitrine);
  resizeToContainer();
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ------------------------------------------------------------ fichas 3D/2D

/**
 * Construye las fichas giratorias del arcade.
 *
 * Cara A: portada del juego y su nombre. Cara B: TUS estadísticas reales,
 * leídas de localStorage, más el botón para jugarlo. Se ordenan por partidas
 * jugadas, así que el orden cambia solo a medida que usás el arcade.
 *
 * Cada ficha es un <button> con aria-pressed, no un div: así se puede girar
 * con Enter o con la barra espaciadora y un lector de pantalla anuncia el
 * estado.
 */
function buildFlipCards() {
  const deck = document.getElementById('card-deck');
  if (!deck) return;

  const render = () => {
    const stats = getStats();
    deck.innerHTML = '';

    stats.forEach((g, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'flip';
      card.setAttribute('aria-pressed', 'false');
      card.setAttribute('aria-label', `${g.name}. Tocá para ver tus estadísticas.`);

      card.innerHTML = `
        <span class="flip-inner">
          <span class="flip-face flip-front">
            <span class="flip-rank">#${i + 1}</span>
            <img class="flip-cover" src="${coverDataURL(g.id)}" alt="">
            <span>
              <span class="flip-name">${g.name}</span>
              <span class="flip-tag">${g.tagline}</span>
            </span>
          </span>
          <span class="flip-face flip-back">
            <span>
              <span class="stat-row"><span class="stat-k">Récord</span><span class="stat-v">${g.best.toLocaleString('es-AR')}</span></span>
              <span class="stat-row"><span class="stat-k">Partidas</span><span class="stat-v">${g.plays}</span></span>
            </span>
            <span class="btn btn-sm flip-play" data-play="${g.id}">Jugar ahora</span>
          </span>
        </span>`;

      // El giro es del botón entero; el "Jugar" de la cara B no debe girarla
      // de vuelta, así que corta la propagación.
      card.addEventListener('click', (e) => {
        const play = e.target.closest('[data-play]');
        if (play) {
          e.stopPropagation();
          playById(play.dataset.play);
          document.getElementById('arcade-screen')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          focusArcade();
          return;
        }
        const open = card.getAttribute('aria-pressed') === 'true';
        card.setAttribute('aria-pressed', String(!open));
      });

      deck.appendChild(card);
    });
  };

  render();
  // El arcade avisa cuando cambian las estadísticas y las fichas se repintan.
  window.addEventListener('reset:stats', render);
}

/**
 * Chips de selección directa debajo del televisor.
 *
 * El menú del canvas se maneja con las flechas, pero eso hay que descubrirlo.
 * Estos botones dicen qué juegos hay y arrancan el que toques, sin que nadie
 * tenga que adivinar el control.
 */
function buildGameChips() {
  const bar = document.getElementById('game-chips');
  if (!bar) return;

  const games = listGames();
  bar.innerHTML = '';

  games.forEach((g) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'game-chip';
    chip.setAttribute('aria-current', 'false');
    chip.innerHTML = `<b>${g.name}</b><span>${g.controls}</span>`;
    chip.addEventListener('click', () => {
      playById(g.id);
      focusArcade();
      bar.querySelectorAll('.game-chip').forEach((c) => c.setAttribute('aria-current', 'false'));
      chip.setAttribute('aria-current', 'true');
    });
    bar.appendChild(chip);
  });
}

/**
 * Giro de las fichas de testimonio.
 *
 * Están escritas en el HTML (no generadas), así que acá solo se conecta el
 * mismo gesto que usan las fichas del arcade: aria-pressed alterna, y el CSS
 * hace la rotación. Un único atributo gobierna el estado visual y el
 * accesible a la vez.
 */
function wireTestimonials() {
  document.querySelectorAll('.testi').forEach((card) => {
    card.addEventListener('click', () => {
      const open = card.getAttribute('aria-pressed') === 'true';
      card.setAttribute('aria-pressed', String(!open));
    });
  });
}

/** Marcador resumen: total de partidas, mejor marca y juego favorito. */
function buildScoreStrip() {
  const strip = document.getElementById('score-strip');
  if (!strip) return;

  const render = () => {
    const stats = getStats();
    const partidas = stats.reduce((n, g) => n + g.plays, 0);
    const mejor = Math.max(0, ...stats.map((g) => g.best));
    // getStats ya viene ordenado por partidas, así que el favorito es el primero.
    const favorito = partidas ? stats[0].name.split(' ').pop() : '—';

    strip.innerHTML = `
      <div class="score-cell"><b>${partidas}</b><span>Partidas</span></div>
      <div class="score-cell"><b>${mejor.toLocaleString('es-AR')}</b><span>Mejor marca</span></div>
      <div class="score-cell"><b>${favorito}</b><span>Tu favorito</span></div>`;
  };

  render();
  window.addEventListener('reset:stats', render);
}

// ------------------------------------------------------------- entrada UI

function setupReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  // Sin IntersectionObserver el contenido debe quedar visible igual.
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (!entry.isIntersecting) return;
      // Desfasaje corto entre elementos: entran en cascada, no en bloque.
      setTimeout(() => entry.target.classList.add('in'), i * 60);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  items.forEach((el) => io.observe(el));

  /* Red de seguridad. Una animación de entrada que no dispara deja el texto
     invisible para siempre, y eso es mucho peor que perderse el efecto.
     Hay escenarios reales donde el observer nunca se ejecuta: viewport de
     tamaño cero, pestaña que nunca se pinta, o el usuario que aterriza con
     un #hash muy abajo. A los 2 segundos mostramos todo, pase lo que pase. */
  setTimeout(() => {
    items.forEach((el) => el.classList.add('in'));
    io.disconnect();
  }, 2000);
}

function syncPowerButton(on) {
  const btn = document.getElementById('btn-power');
  if (btn) btn.textContent = on ? 'Apagar consola' : 'Encender consola';
}

function wireUI() {
  document.getElementById('btn-eject')?.addEventListener('click', () => {
    /* Dentro del hero la tapa la maneja el scroll, así que el botón no la
       abre: te LLEVA al punto del recorrido donde ya está abierta. Además de
       evitar que dos cosas peleen por la misma animación, le enseña al
       visitante que el scroll es el control. */
    const hero = document.getElementById('hero');
    if (animState.scrubbing && hero) {
      const travel = hero.offsetHeight - window.innerHeight;
      window.scrollTo({ top: hero.offsetTop + travel * 0.62, behavior: 'smooth' });
      return;
    }
    toggleEject();
  });

  document.getElementById('btn-power')?.addEventListener('click', () => {
    syncPowerButton(togglePower());
  });

  document.getElementById('btn-rotate')?.addEventListener('click', (e) => {
    const on = toggleAutoRotation();
    e.currentTarget.textContent = on ? 'Detener rotación' : 'Rotar 360°';
  });

  document.getElementById('crt-close')?.addEventListener('click', () => {
    closeConsole();
    syncPowerButton(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && animState.powerOn) {
      closeConsole();
      syncPowerButton(false);
    }
  });

  document.getElementById('arcade-sound')?.addEventListener('click', (e) => {
    const on = toggleArcadeSound();
    e.currentTarget.textContent = `Sonido: ${on ? 'on' : 'off'}`;
    e.currentTarget.setAttribute('aria-pressed', String(on));
  });

  // "Ver en 3D": la vitrina se muda a la ranura del catálogo.
  document.querySelectorAll('.btn-3d').forEach((btn) => {
    btn.addEventListener('click', () => {
      const inCatalog = document.getElementById('vitrine')?.parentElement?.id === 'vitrine-catalog';
      moveVitrine(inCatalog ? 'vitrine-home' : 'vitrine-catalog');
      document.querySelectorAll('.btn-3d').forEach((b) => {
        b.textContent = inCatalog ? 'Ver en 3D' : 'Volver arriba';
      });
    });
  });

  document.querySelectorAll('.btn-buy').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const model = e.currentTarget.dataset.model;
      alert(`Reserva anotada para el ${model}. Te escribimos para coordinar la entrega.`);
    });
  });

  document.getElementById('btn-cta')?.addEventListener('click', () => {
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
  });
}
