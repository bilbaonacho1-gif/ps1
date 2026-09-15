/* ==========================================================================
   RESET 32-BIT — INTERACCIÓN CON EL MODELO (js/interact.js)

   Raycasting sobre los botones de la consola, etiquetas flotantes y órbita.

   Detalle clave desde que el canvas dejó de ser pantalla completa: las
   coordenadas del puntero se normalizan contra el RECTÁNGULO DEL CANVAS, no
   contra la ventana. Usar innerWidth/innerHeight acá haría que el rayo apunte
   a un lugar distinto del que tocaste, con un error igual al offset de la
   vitrina dentro de la página.
   ========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const interactState = {
  controls: null,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  hovered: null,
  meshes: [],
  tooltips: {},
  canvas: null,
};

const BUTTONS = {
  eject_low: 'tooltip-eject',
  power_low: 'tooltip-power',
  reset_low: 'tooltip-reset',
};

export function initInteraction(sceneState, callbacks) {
  const { camera, renderer, nodes } = sceneState;
  const canvas = renderer.domElement;
  interactState.canvas = canvas;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.target.set(0, 0.055, 0);

  /* Zoom desactivado a propósito. OrbitControls llama preventDefault en la
     rueda, así que con el zoom activo la página no scrollea mientras el
     puntero está sobre la vitrina. La distancia la fija el módulo de scroll. */
  controls.enableZoom = false;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.update();
  interactState.controls = controls;

  // Mallas clickeables
  interactState.meshes.length = 0;
  for (const key of Object.keys(BUTTONS)) {
    nodes[key]?.traverse((child) => {
      if (child.isMesh) {
        child.userData.buttonKey = key;
        interactState.meshes.push(child);
      }
    });
  }

  for (const [key, id] of Object.entries(BUTTONS)) {
    interactState.tooltips[key] = { el: document.getElementById(id), node: nodes[key] };
  }

  /** Normaliza un evento de puntero a coordenadas de dispositivo (-1..1). */
  function toNDC(e) {
    const r = canvas.getBoundingClientRect();
    interactState.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    interactState.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function hit() {
    interactState.raycaster.setFromCamera(interactState.pointer, camera);
    const found = interactState.raycaster.intersectObjects(interactState.meshes, true);
    return found.length ? found[0].object.userData.buttonKey : null;
  }

  function onMove(e) {
    toNDC(e);
    const key = hit();
    if (key === interactState.hovered) return;
    interactState.hovered = key;
    for (const [k, t] of Object.entries(interactState.tooltips)) {
      t.el?.classList.toggle('visible', k === key);
    }
    canvas.style.cursor = key ? 'pointer' : 'grab';
  }

  function onClick(e) {
    /* Recalculamos desde el evento en vez de reutilizar el último movimiento:
       en pantallas táctiles no hay hover previo, así que el puntero guardado
       estaría en (0,0) y el toque pegaría en el centro de la vitrina. */
    toNDC(e);
    const key = hit();
    if (key === 'eject_low') callbacks.onEject?.();
    else if (key === 'power_low') callbacks.onPower?.();
    else if (key === 'reset_low') callbacks.onReset?.();
  }

  function onLeave() {
    interactState.hovered = null;
    for (const t of Object.values(interactState.tooltips)) t.el?.classList.remove('visible');
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onClick);
  canvas.addEventListener('pointerleave', onLeave);

  // En táctil, la órbita no debe secuestrar el scroll vertical de la página.
  if (sceneState.isMobile) canvas.style.touchAction = 'pan-y';
}

/**
 * Proyecta la posición 3D del botón bajo el cursor a píxeles de pantalla y
 * mueve ahí la etiqueta. Se llama una vez por frame desde el loop principal.
 */
export function updateInteractions(camera) {
  interactState.controls?.update();

  const key = interactState.hovered;
  if (!key) return;

  const t = interactState.tooltips[key];
  if (!t?.el || !t.node || !interactState.canvas) return;

  const p = new THREE.Vector3();
  t.node.getWorldPosition(p);
  p.project(camera);

  // Las etiquetas son position:fixed, así que sumamos el offset del canvas.
  const r = interactState.canvas.getBoundingClientRect();
  t.el.style.left = `${r.left + (p.x * 0.5 + 0.5) * r.width}px`;
  t.el.style.top = `${r.top + (-p.y * 0.5 + 0.5) * r.height}px`;
}
