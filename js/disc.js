/* ==========================================================================
   RESET 32-BIT — EL DISCO (js/disc.js)

   El GLB no trae disco: tiene el lector (`reader_low`) y el mecanismo
   (`cdreader_low`), pero el CD no existe. Se construye acá.

   Por qué un anillo plano y no un cilindro: un CD real tiene 1,2 mm de
   espesor. A la escala de este modelo eso es menos de un píxel en pantalla, o
   sea que modelar el canto cuesta geometría que nadie va a ver. Un
   RingGeometry a doble cara se lee igual desde arriba —que es de donde se lo
   mira— y es una sola llamada de dibujo.

   Nada de coordenadas a mano: la posición y el radio salen de MEDIR el nodo
   del lector en tiempo de ejecución. El modelo se normaliza al cargar
   (ver scene3d.js), así que cualquier número escrito a mano acá se rompería
   al cambiar TARGET_WIDTH.
   ========================================================================== */

import * as THREE from 'three';

export const discState = {
  mesh: null,
  spin: 0,        // velocidad angular actual, rad/s
  spinTarget: 0,  // a la que tiende
  restY: 0,       // apoyado en el lector
  liftY: 0,       // arriba, antes de entrar
};

/**
 * Crea el disco y lo cuelga del pivote del modelo, para que acompañe la
 * flotación idle y el giro de la consola en vez de quedar flotando aparte.
 */
export function createDisc(sceneState) {
  const { model, nodes } = sceneState;
  const anchor = nodes['reader_low'] ?? nodes['cdreader_low'];
  if (!model || !anchor) return null;

  // Medida en mundo, ya normalizada.
  const box = new THREE.Box3().setFromObject(anchor);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const outer = Math.min(size.x, size.z) * 0.47;
  const inner = outer * 0.17;

  const geo = new THREE.RingGeometry(inner, outer, 96, 1);
  geo.rotateX(-Math.PI / 2);   // el anillo nace vertical; lo acostamos

  const mat = new THREE.MeshStandardMaterial({
    color: 0xc9d2de,
    metalness: 1.0,
    roughness: 0.24,
    side: THREE.DoubleSide,
    envMapIntensity: 1.05,
  });

  const disc = new THREE.Mesh(geo, mat);
  disc.castShadow = false;     // una sombra de disco dentro de la bandeja no
  disc.receiveShadow = false;  // se ve y cuesta un pase de sombra mas

  /* El punto medido esta en mundo; el disco cuelga del pivote, asi que hay que
     pasarlo a coordenadas locales del pivote o quedaria desplazado apenas la
     consola gire. */
  const local = model.worldToLocal(center.clone());
  disc.position.set(local.x, local.y, local.z);

  discState.restY = local.y + size.y * 0.06;
  discState.liftY = discState.restY + Math.max(size.x, size.z) * 0.9;
  disc.position.y = discState.liftY;
  disc.visible = false;

  model.add(disc);
  discState.mesh = disc;
  return disc;
}

/**
 * Posicion del disco en su recorrido de entrada, 0 = arriba, 1 = apoyado.
 * Muestra el disco en cuanto empieza a bajar y lo oculta si vuelve a 0.
 */
export function setDropProgress(t) {
  const d = discState.mesh;
  if (!d) return;
  const k = Math.max(0, Math.min(1, t));
  d.visible = k > 0.001;
  d.position.y = discState.liftY + (discState.restY - discState.liftY) * k;
}

/** Velocidad a la que deberia girar. Se llega suave, no de golpe. */
export function setSpinTarget(radPerSec) {
  discState.spinTarget = radPerSec;
}

export function isDiscIn() {
  return !!discState.mesh?.visible;
}

/** Llamar una vez por frame desde el loop. */
export function updateDisc(dt) {
  const d = discState.mesh;
  if (!d || !d.visible) return;
  // Inercia: un disco no arranca ni frena instantaneo.
  discState.spin += (discState.spinTarget - discState.spin) * Math.min(1, dt * 1.8);
  d.rotation.y += discState.spin * dt;
}
