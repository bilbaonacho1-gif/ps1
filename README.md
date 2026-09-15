# RESET // 32-Bit Retro Console Restoration Workshop

Una experiencia web 3D interactiva y minimalista de alto rendimiento para **RESET**, un taller artesanal dedicado a la restauración, recapado y recalibración de consolas de quinta generación (32-bit).

---

## 🚀 Cómo correr el proyecto localmente

Este proyecto está desarrollado con HTML5, CSS3 y JavaScript Vanilla (Módulos ES) sin bundlers ni pasos de compilación.

### Opción 1: Servidor Node.js integrado (Recomendado)
```bash
node tools/serve.mjs
```
Abre tu navegador en: [http://localhost:5173](http://localhost:5173)

### Opción 2: Cualquier servidor estático
```bash
npx serve .
# o con Python:
python -m http.server 8080
```

---

## 📜 Créditos Obligatorios del Modelo 3D (Licencia CC Attribution)

El modelo 3D de la consola PlayStation 1 incluido en `assets/models/ps1.glb` pertenece a su autor original y se distribuye bajo la siguiente licencia:

> **"Lisa Gordon, PS1 Final"** ([https://skfb.ly/oAxnL](https://skfb.ly/oAxnL)) by happylittlepolygons is licensed under Creative Commons Attribution ([http://creativecommons.org/licenses/by/4.0/](http://creativecommons.org/licenses/by/4.0/)).

---

## 🛡️ Guía de Defensa Técnica Oral

Esta sección detalla las decisiones de arquitectura 3D, WebGL y manipulaciones del DOM requeridas para la defensa del proyecto:

### 1. Configuración del Renderizado 3D y PBR (js/scene3d.js)
- **Espacio de Color y Mapeo de Tonos**: Se utiliza `THREE.ACESFilmicToneMapping` y `THREE.SRGBColorSpace`. Esto garantiza un rango dinámico fotorrealista donde los blancos no se queman y las sombras preservan detalle.
- **Ambiente y Reflexión de Metales**: Para evitar que los componentes metálicos (conectores RCA, tornillos, diodo óptico) se vean planos o de plástico, se utiliza `RoomEnvironment` procesado por `PMREMGenerator` (con intensidad `0.04`). Esto genera un mapa de radiancia equirrectangular en tiempo real que alimenta las propiedades de roughness y metalness del shader PBR.

### 2. Esquema de Iluminación y Sombras
- **Luz Direccional Principal**: Simulando la luz del sol o de estudio (`intensity: 2.5`), genera sombras suaves mediante `THREE.PCFSoftShadowMap` con un mapa de sombras de `2048x2048` píxeles y un `bias` compensado de `-0.0005` para eliminar artefactos de acné de sombra (*shadow acne*).
- **Luz de Contra (Rim Light)**: Luz direccional de tono azul frío colocada por detrás de la consola (`intensity: 1.4`), proyectando un contorno sutil sobre los bordes oscuros para despegar la figura del fondo.
- **Suelo Invisible**: Un plano horizontal con `THREE.ShadowMaterial(opacity: 0.22)` recibe exclusivamente las sombras arrojadas sin renderizar una superficie opaca visible.

### 3. Manipulación del GLB y Control de Animación (js/animations.js)
- **Nodos Jerárquicos**: El modelo contiene nodos con nombres exactos (`power_low`, `eject_low`, `reset_low`, `lid_low`, `gear_low`, `power_indicator_low`).
- **Estado Inicial Congelado**: Al cargar el GLB, la animación `"Lid Open"` (5 segundos) se congela en el frame 0 mediante:
  ```js
  action = mixer.clipAction(clip);
  action.play();
  action.paused = true;
  action.time = 0;
  mixer.update(0);
  ```
- **Control Bidireccional de la Tapa**: Al pulsar `EJECT`, se invierte la velocidad de reproducción (`action.timeScale = 1` para abrir, `action.timeScale = -1` para cerrar), deteniendo la animación exactamente al llegar a los extremos (`clip.duration` o `0`).
- **Emisión LED y Secuencia CRT**: Al encender (`POWER`), el material del nodo `power_indicator_low` (previamente clonado) interpola su propiedad `emissiveIntensity` de 0.0 a 2.8, activando una ventana CRT modal con efecto de mecanografiado línea por línea.

### 4. Raycasting y Proyección 3D a 2D (js/interact.js)
- **Detección de Clics y Hover**: Se utiliza `THREE.Raycaster` rastreando el puntero del ratón en coordenadas normalizadas (NDC `-1` a `+1`).
- **Tooltips Proyectados**: La posición tridimensional del nodo inspeccionado se convierte a píxeles de pantalla en tiempo real en cada frame mediante:
  ```js
  const worldPos = new THREE.Vector3();
  node.getWorldPosition(worldPos);
  worldPos.project(camera); // Convierte a coordenadas NDC (-1 a 1)
  const x = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-(worldPos.y * 0.5) + 0.5) * window.innerHeight;
  tooltipElement.style.left = `${x}px`;
  tooltipElement.style.top = `${y}px`;
  ```

### 5. Sincronización del Scroll y Cámara Cinespace (js/scroll.js)
- **Lerp Multi-Waypoint**: El progreso de desplazamiento vertical de la página se normaliza entre `0` y `1`. Se definen 5 waypoints clave (Hero, Proceso, Specs, Catálogo, Garantía).
- En cada frame del loop de animación, se interpola suavemente la posición y el objetivo (*lookAt*) de la cámara usando `lerpVectors` con un coeficiente de amortiguación de `0.06`, evitando saltos bruscos.

### 6. Rendimiento y Accesibilidad (js/main.js & css/style.css)
- **Single Render Loop**: Todo el renderizado se ejecuta a través de un único ciclo unificado con `renderer.setAnimationLoop`.
- **Pausa Automática en Offscreen**: Con `IntersectionObserver` y la `Page Visibility API`, el renderizado se detiene por completo si la página no está visible o la pestaña está minimizada, reduciendo el consumo de GPU a 0%.
- **Accesibilidad Total**: Todos los botones tridimensionales tienen su equivalente exacto en HTML en la barra de controles inferior para navegación por teclado y lectores de pantalla. Se incluye soporte completo para `prefers-reduced-motion` y temas claro/oscuro.

---

## 🛠️ Stack Tecnológico

- **HTML5 & CSS3 Vanilla** (Variables CSS, CSS Grid/Flexbox, CRT scanlines overlay, Google Fonts Archivo Black & Silkscreen)
- **JavaScript ES Modules** (Sin bundlers, producción lista para Netlify/Vercel)
- **Three.js r169** (incluido en `vendor/`, sin CDN)
- **GLTFLoader, OrbitControls, RoomEnvironment**

---

## 📦 Dependencias incluidas (`vendor/`)

Three.js r169 viene incluido en el repositorio en lugar de cargarse desde un
CDN, así que el sitio funciona sin conexión y no se rompe si el CDN se cae o
cambia de versión. El import map de `index.html` apunta a rutas relativas:

```json
{
  "imports": {
    "three": "./vendor/three/build/three.module.js",
    "three/addons/": "./vendor/three/addons/"
  }
}
```

Se incluyen solo los archivos que el proyecto usa realmente (~1,4 MB):

```
vendor/three/build/three.module.js
vendor/three/addons/controls/OrbitControls.js
vendor/three/addons/environments/RoomEnvironment.js
vendor/three/addons/loaders/GLTFLoader.js
vendor/three/addons/utils/BufferGeometryUtils.js   (lo requiere GLTFLoader)
```

Three.js es software libre bajo licencia MIT; el texto de la licencia está en
`vendor/three/LICENSE`.

Para actualizar a una versión nueva de Three.js:

```bash
npm pack three@<version>
tar xzf three-<version>.tgz
cp package/build/three.module.js vendor/three/build/
cp package/examples/jsm/controls/OrbitControls.js vendor/three/addons/controls/
cp package/examples/jsm/environments/RoomEnvironment.js vendor/three/addons/environments/
cp package/examples/jsm/loaders/GLTFLoader.js vendor/three/addons/loaders/
cp package/examples/jsm/utils/BufferGeometryUtils.js vendor/three/addons/utils/
```

> Las tipografías (Archivo, Inter, Silkscreen) se siguen cargando desde Google
> Fonts. Si también las querés offline, hay que descargarlas e incluirlas igual.
