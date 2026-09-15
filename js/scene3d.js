/* ==========================================================================
   RESET 32-BIT — ESCENA 3D (js/scene3d.js)

   Render, luces, carga del GLB y normalización del modelo.

   Cambio de arquitectura respecto de la primera versión: el canvas ya NO es
   un elemento fijo a pantalla completa, sino que vive dentro de la vitrina.
   Eso trae tres consecuencias que se ven en este archivo:

   1. El tamaño sale del contenedor, no de window. Se observa con
      ResizeObserver, porque la vitrina puede cambiar de tamaño sin que la
      ventana cambie (por ejemplo al mudarse al catálogo).
   2. El renderer es transparente (alpha) y la escena no pinta fondo: así se
      ve el degradé y el cono de luz que dibuja el CSS de la vitrina.
   3. Ya no hay modo claro/oscuro: la página es oscura y punto.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const sceneState = {
  scene: null,
  camera: null,
  renderer: null,
  container: null,
  model: null,       // pivote (lo que rota y flota)
  modelInner: null,  // el gltf.scene ya escalado y centrado
  mixer: null,
  clip: null,
  nodes: {},
  isMobile: false,
};

/**
 * Ancho objetivo de la consola, en unidades de escena.
 *
 * El GLB de Sketchfab viene en escala y offset arbitrarios: mide
 * 2.84 x 1.80 x 2.78 unidades, no está centrado en XZ (su centro cae en
 * z = 0.35) y no apoya en el piso (su base está en y = 0.0267).
 *
 * La cámara y los límites de órbita están calculados para una consola de
 * ~0.35 unidades de ancho apoyada en el origen. Sin normalizar, la cámara
 * queda DENTRO del modelo y no hay forma de verlo.
 */
const TARGET_WIDTH = 0.35;

const checkIsMobile = () =>
  window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Ajusta renderer y cámara al tamaño real del contenedor.
 * Se llama al inicio y cada vez que la vitrina cambia de medida.
 */
export function resizeToContainer() {
  const { renderer, camera, container } = sceneState;
  if (!renderer || !camera || !container) return;

  const rect = container.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, sceneState.isMobile ? 1 : 2));
  renderer.setSize(w, h, false); // false: no tocar el CSS, lo maneja la hoja de estilos
}

export function initScene(canvasEl, onProgress, onLoaded) {
  sceneState.isMobile = checkIsMobile();
  sceneState.container = canvasEl.parentElement;

  const scene = new THREE.Scene();
  scene.background = null; // transparente: se ve la vitrina de CSS detrás
  sceneState.scene = scene;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 50);
  camera.position.set(0.34, 0.24, 0.44);
  camera.lookAt(0, 0.05, 0);
  sceneState.camera = camera;

  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !sceneState.isMobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sceneState.renderer = renderer;

  resizeToContainer();

  // La vitrina cambia de tamaño sin que cambie la ventana (al mudarse de
  // sección, o cuando el grid se reacomoda). ResizeObserver lo cubre.
  if (sceneState.container && 'ResizeObserver' in window) {
    new ResizeObserver(() => resizeToContainer()).observe(sceneState.container);
  }

  /* Entorno de reflexiones. Sin esto el metalness del PBR no tiene nada que
     reflejar y el plástico se ve de plastilina. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // --- luces: clave cálida, relleno tenue, contra fría ---
  const key = new THREE.DirectionalLight(0xFFF3E4, 2.6);
  key.position.set(2.2, 4.2, 2.8);
  key.castShadow = !sceneState.isMobile;
  if (key.castShadow) {
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    key.shadow.camera.near = 0.2;
    key.shadow.camera.far = 8;
    key.shadow.camera.left = -0.6;
    key.shadow.camera.right = 0.6;
    key.shadow.camera.top = 0.6;
    key.shadow.camera.bottom = -0.6;
  }
  scene.add(key);
  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.55));

  const rim = new THREE.DirectionalLight(0x5B8CFF, 1.9);
  rim.position.set(-2.6, 1.4, -2.4);
  scene.add(rim);

  // Piso invisible que solo recibe la sombra.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.ShadowMaterial({ opacity: 0.38 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = !sceneState.isMobile;
  scene.add(floor);

  // ------------------------------------------------------- carga del GLB

  new GLTFLoader().load(
    'assets/models/ps1.glb',
    (gltf) => {
      const model = gltf.scene;

      /* Normalización. Envolvemos el modelo en un pivote: el modelo interno
         carga el offset de centrado y el pivote queda limpio en el origen,
         para que la flotación idle pueda escribir position.y sin pisar ese
         offset. */
      const pivot = new THREE.Group();

      const rawBox = new THREE.Box3().setFromObject(model);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      model.scale.setScalar(TARGET_WIDTH / Math.max(rawSize.x, rawSize.z));
      model.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);

      pivot.add(model);
      sceneState.model = pivot;
      sceneState.modelInner = model;

      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = !sceneState.isMobile;
        child.receiveShadow = !sceneState.isMobile;
        if (child.material) {
          child.material.roughness = Math.min(child.material.roughness ?? 0.5, 0.85);
        }
      });

      // Nombres reales del GLB, confirmados con tools/inspect-glb.mjs
      for (const name of [
        'playstation_low', 'body_low', 'lid_low', 'gear_low',
        'eject_low', 'power_low', 'reset_low', 'reader_low',
        'cdreader_low', 'memcard1_low', 'memcard2_low', 'power_indicator_low',
      ]) {
        const obj = model.getObjectByName(name);
        if (obj) sceneState.nodes[name] = obj;
      }

      // El LED necesita material propio: si no, al encenderlo se iluminaría
      // toda la consola, porque el GLB comparte un único material.
      const led = sceneState.nodes['power_indicator_low']?.children?.[0];
      if (led?.isMesh) {
        led.material = led.material.clone();
        led.material.emissive = new THREE.Color(0xFF2200);
        led.material.emissiveIntensity = 0;
      }

      if (gltf.animations?.length) {
        sceneState.mixer = new THREE.AnimationMixer(model);
        sceneState.clip = gltf.animations[0]; // "Lid Open", 5.0 s
      }

      scene.add(pivot);
      onLoaded?.(sceneState);
    },
    (xhr) => {
      if (!onProgress) return;
      onProgress(xhr.lengthComputable ? Math.round((xhr.loaded / xhr.total) * 100) : 60);
    },
    (err) => {
      console.error('No se pudo cargar assets/models/ps1.glb', err);
      // Aunque falle el 3D, el resto de la página y el arcade siguen andando.
      onLoaded?.(sceneState);
    }
  );
}
