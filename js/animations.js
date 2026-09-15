/* ==========================================================================
   RESET 32-BIT — ANIMACIONES DE LA CONSOLA (js/animations.js)

   Controla el clip "Lid Open" del GLB, el LED de encendido y la secuencia de
   arranque que da paso al arcade.
   ========================================================================== */

import * as THREE from 'three';
import { mountInto, mountHome, focusArcade } from './arcade.js';

export const animState = {
  mixer: null,
  clip: null,
  action: null,
  lidOpen: false,
  powerOn: false,
  autoRotate: false,
  scrubbing: false,
  dragging: false,
  lastInput: -1e9,
  led: null,
  ledTarget: 0,
  ledCurrent: 0,
};

/* La secuencia de arranque es la antesala del juego, no el contenido. Si se
   hace larga, el visitante se aburre antes de llegar a jugar. */
const BOOT = [
  'BIOS 3.0 (1995-12-04)',
  'R3000A @ 33.86MHz ......... OK',
  'RAM 2048 KB / VRAM 1024 KB  OK',
  'MEMORY CARD 1 ............. RESET 1MB',
  'CD-ROM .................... CARTUCHO DE PRUEBA',
];

export function initAnimations(sceneState) {
  if (sceneState.mixer && sceneState.clip) {
    animState.mixer = sceneState.mixer;
    animState.clip = sceneState.clip;

    /* El modelo viene en reposo con la tapa ABIERTA. Reproducimos el clip y lo
       congelamos en el frame 0 para que arranque cerrada. */
    const action = animState.mixer.clipAction(animState.clip);
    action.play();
    action.paused = true;
    action.time = 0;
    animState.action = action;
    animState.mixer.update(0);
  }

  animState.led = sceneState.nodes['power_indicator_low']?.children?.[0] ?? null;
}

/**
 * Lleva la tapa a un punto exacto del clip, entre 0 y 1.
 *
 * Es lo que permite que el scroll "rasque" la animación en vez de dispararla:
 * en vez de dejar correr el mixer con el delta del reloj, le fijamos el tiempo
 * a mano y pedimos una actualización de cero segundos, que recalcula las poses
 * sin avanzar el reloj. Scrolleás para arriba y la tapa se cierra sola.
 */
export function setLidProgress(t) {
  const a = animState.action;
  if (!a || !animState.clip) return;
  a.paused = true;
  a.time = Math.max(0, Math.min(1, t)) * animState.clip.duration;
  animState.mixer.update(0);
  animState.lidOpen = t > 0.5;
}

/** Mientras el scroll manda sobre la tapa, los botones no deben pelearle. */
export function setScrubMode(on) { animState.scrubbing = !!on; }

/** Abre o cierra la tapa reproduciendo el mismo clip hacia adelante o atrás. */
export function toggleEject() {
  if (animState.scrubbing) return;
  const a = animState.action;
  if (!a || !animState.clip) return;

  a.paused = false;
  if (!animState.lidOpen) {
    a.timeScale = 1;
    if (a.time >= animState.clip.duration) a.time = 0;
    animState.lidOpen = true;
  } else {
    a.timeScale = -1;
    if (a.time <= 0) a.time = animState.clip.duration;
    animState.lidOpen = false;
  }
}

export function togglePower() {
  animState.powerOn = !animState.powerOn;
  if (animState.powerOn) {
    animState.ledTarget = 2.8;
    openConsole();
  } else {
    closeConsole();
  }
  return animState.powerOn;
}

export function toggleAutoRotation() {
  animState.autoRotate = !animState.autoRotate;
  return animState.autoRotate;
}

export function resetAll(onReset) {
  if (animState.lidOpen) toggleEject();
  if (animState.powerOn) closeConsole();
  animState.autoRotate = false;
  onReset?.();
}

/** Loop: mixer, LED y flotación idle del pivote. */
export function updateAnimations(dt, elapsed, pivot) {
  const a = animState.action;
  // Con el scroll al mando, el mixer no avanza solo: lo posiciona setLidProgress.
  if (animState.mixer && a && !a.paused && !animState.scrubbing) {
    animState.mixer.update(dt);
    if (a.timeScale > 0 && a.time >= animState.clip.duration) {
      a.time = animState.clip.duration;
      a.paused = true;
    } else if (a.timeScale < 0 && a.time <= 0) {
      a.time = 0;
      a.paused = true;
    }
  }

  if (animState.led?.material) {
    animState.ledCurrent += (animState.ledTarget - animState.ledCurrent) * 0.1;
    animState.led.material.emissiveIntensity = animState.ledCurrent;
  }

  if (pivot) {
    pivot.position.y = Math.sin(elapsed * 1.4) * 0.004;

    if (animState.autoRotate) {
      pivot.rotation.y += 0.007;            // giro pedido con el boton
    } else if (!animState.scrubbing && !animState.dragging &&
               performance.now() - animState.lastInput > IDLE_WAIT) {
      /* Deriva idle: seis veces mas lenta que el giro del boton, apenas
         suficiente para que la consola no parezca una foto. Se corta mientras
         el scroll maneja la tapa —dos cosas moviendose a la vez marean— y
         mientras el usuario esta arrastrando, porque pelearle al dedo es la
         forma mas rapida de que un visor 3D se sienta roto. */
      pivot.rotation.y += 0.0012;
    }
  }
}

/** Espera antes de retomar la deriva idle despues de que el usuario suelta. */
const IDLE_WAIT = 2600;

/**
 * La llama interact.js al empezar y terminar un arrastre.
 *
 * Deliberadamente NO se engancha al evento 'change' de OrbitControls: ese
 * evento tambien se dispara cuando el scroll mueve la camara por codigo, o
 * sea en todos los frames, y la deriva idle no arrancaria nunca.
 */
export function setDragging(on) {
  animState.dragging = on;
  animState.lastInput = performance.now();
}

// -------------------------------------------------------- arranque / CRT

function openConsole() {
  const modal = document.getElementById('crt-modal');
  const term = document.getElementById('crt-terminal');
  if (!modal || !term) return;

  term.textContent = '';
  term.hidden = false;
  modal.classList.add('visible');

  // Avisamos para que se pause el render 3D mientras el modal tapa la vitrina.
  window.dispatchEvent(new CustomEvent('reset:crt', { detail: { open: true } }));

  let line = 0;
  let char = 0;

  (function type() {
    if (!animState.powerOn) return; // cancelado: apagaron la consola
    if (line >= BOOT.length) {
      setTimeout(showArcade, 450);
      return;
    }
    const text = BOOT[line];
    if (char < text.length) {
      term.textContent += text[char++];
      setTimeout(type, 12);
    } else {
      term.textContent += '\n';
      line++; char = 0;
      setTimeout(type, 80);
    }
  })();
}

/**
 * Trae la cabina del arcade al modal.
 *
 * Es un único nodo del DOM que vive en la sección ARCADE y se muda acá. Mover
 * el elemento no destruye el contexto 2D ni la partida en curso, así que no hay
 * dos juegos ni dos estados que mantener sincronizados.
 */
function showArcade() {
  if (!animState.powerOn) return;
  const mount = document.getElementById('crt-mount');
  if (!mount) return;
  mountInto(mount);
  focusArcade();
}

export function closeConsole() {
  const modal = document.getElementById('crt-modal');
  modal?.classList.remove('visible');

  // La cabina vuelve a su lugar: el arcade sigue jugable en la sección.
  mountHome();

  const term = document.getElementById('crt-terminal');
  if (term) term.textContent = '';

  animState.powerOn = false;
  animState.ledTarget = 0;

  window.dispatchEvent(new CustomEvent('reset:crt', { detail: { open: false } }));
}
