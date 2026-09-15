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

### 4b. Secuencia de arranque (js/boot.js)

La intro es un homenaje al encendido de una consola de 32 bits, en cuatro fases:
los cuatro símbolos (△ ○ ✕ □) se dibujan trazo por trazo con `stroke-dasharray`
y `stroke-dashoffset`, prenden en sus colores, se acomodan en rombo, y recién
entonces entra la marca. Al final una cortina sube y descubre el hero, que a su
vez entra escalonado.

Tres decisiones que la sostienen:

- **La barra mide carga real.** El porcentaje viene del `onProgress` del
  GLTFLoader, no de un temporizador. Si el modelo tarda, la intro espera.
- **El 3D arranca DESPUÉS de la primera fase.** Inicializar la escena y parsear
  el GLB bloquea el hilo principal cerca de dos segundos. Arrancándolo junto con
  la intro, los `setTimeout` de las fases se encolan y salen todos juntos al
  liberarse el hilo: la secuencia entera se aplasta en un frame. Reservar la
  fase del dibujo (`BOOT_DRAW_MS`) le da pista libre al gesto que hay que ver.
- **Dos pisos de tiempo, no uno.** Uno global evita el parpadeo cuando todo
  viene de caché; otro protege a la marca, medido desde que la marca *apareció*
  y no desde que arrancó la página, porque si el hilo se bloqueó la marca puede
  entrar tardísimo y durar cien milisegundos antes de que suba la cortina.

El largo de cada trazo se mide con `getTotalLength()` en vez de escribirse a
mano, así se puede cambiar cualquier símbolo en el HTML sin tocar el JS.

### 4b-bis. Cinemática de carga: el disco (js/intro.js, js/disc.js)

Cuando termina la parte 2D del arranque, el telón negro se queda y detrás
aparece la consola en primer plano: la tapa se abre, entra un disco, la tapa se
cierra, prende el LED y la cámara se aleja hasta descubrir la página. La carga
de la web se cuenta como lo que sería cargar un juego.

- **El disco no está en el GLB.** El modelo trae el lector (`reader_low`) y el
  mecanismo (`cdreader_low`), pero no el CD: se construye en `js/disc.js` con un
  `RingGeometry` a doble cara. No se modela el canto porque 1,2 mm a la escala
  del modelo es menos de un píxel. Posición y radio salen de **medir** el nodo
  del lector en tiempo de ejecución, no de constantes: el modelo se normaliza al
  cargar, así que cualquier número a mano se rompería al tocar `TARGET_WIDTH`.
- **El remate no salta.** La cámara termina exactamente en el encuadre que
  `scroll.js` calcula para el tope de la página (verificado: la cinemática cierra
  en `[0.392, 0.262, 0.399]` contra el objetivo `[0.396, 0.26, 0.396]`), así que
  al devolver el control no hay corte.
- **Todo por tiempo transcurrido, no por cadenas de `setTimeout`.** Si un frame
  tarda de más —parseo, shaders, una pestaña que vuelve del fondo— la línea de
  tiempo se evalúa igual en el tiempo real que corresponde.
- El disco **frena al abrir la tapa** y vuelve a girar al cerrarla, como el
  interruptor de tapa de una consola real.
- Se puede saltar con Escape o un click, y `prefers-reduced-motion` la omite.

Las marcas de tiempo son las constantes `T` arriba de `js/intro.js`: editar ahí
cambia el ritmo. La cinemática dura 3,85 s.

### 4c-bis. El arcade: televisor de tubo y discos elegibles

La sección del arcade es una sola columna centrada: televisor arriba, consola
abajo, y los tres juegos como discos que se eligen.

- **El mueble es todo CSS.** No se busca un televisor "realista" sino los cuatro
  rasgos que lo hacen leer como de tubo: carcasa gruesa, pantalla hundida con
  esquinas muy redondeadas, viñeta sobre el vidrio, y patas. Una distorsión de
  barril de verdad necesitaría un shader y no paga el costo para un adorno.
- **El vidrio es 4:3 y el juego 16:9**, así que se centra y quedan bandas negras
  arriba y abajo. Es lo que hace un tubo con material panorámico; estirarlo
  deformaría el pixel art que `image-rendering: pixelated` está preservando.
- **El televisor bootea cuando alguien lo mira.** El loop del arcade arranca
  junto con la página, así que los 3,6 segundos de octaedro girando terminaban
  mientras el visitante todavía estaba arriba de todo: para cuando llegaba al
  televisor ya estaba en el menú y no veía nunca el arranque. `replayBoot()` lo
  reinicia cuando la sección entra en pantalla, y no interrumpe una partida en
  curso.
- **Los discos son grandes a propósito.** Un CD mide 12 cm contra los 26 cm de
  ancho de la consola —casi la mitad—, y con discos chicos la escena se lee mal:
  parecen fichas al lado del aparato en vez de los discos que entran en él.
- **Elegir un juego es cambiar el disco**: la tapa se abre, sale el que estaba,
  baja el nuevo y la tapa se cierra, reutilizando el mismo clip y el mismo disco
  de la cinemática de carga. El juego arranca cuando el disco **toca la
  bandeja**, no al hacer click: si arranca antes, la animación se vuelve un
  adorno que tapa lo que ya empezó. Si el 3D no está disponible, el juego
  arranca igual — la animación es el envoltorio, no el contenido.
- A diferencia de la cinemática de carga, el cambio de disco **no toca la
  cámara**: el usuario está mirando el televisor, y moverle el encuadre mientras
  elige sería arrebatarle el control de una interacción que empezó él.

> Una trampa que hubo que atajar: `mountInto()` muda **toda** la cabina
> (`#arcade-machine`) al modal del botón POWER, y el hueco de la vitrina 3D vive
> adentro de ella. Sin sacarla antes, el canvas WebGL viajaba al modal y
> aparecía flotando abajo del juego. Se la mueve al hero al abrir y se la
> reubica al cerrar.

### 4d. Arrancar siempre desde arriba

Son dos cosas distintas y hacen falta las dos: el navegador **restaura** el
scroll al recargar (`history.scrollRestoration = 'manual'`) y además **salta al
ancla** si la URL trae hash. El hash se limpia solo cuando la navegación es una
recarga (`performance.getEntriesByType('navigation')[0].type === 'reload'`), para
no romper los enlaces directos a una sección que alguien comparta.

Mientras corre la intro el scroll queda bloqueado con `body.intro-lock`: la
página todavía no está.

### 4e. La tapa se alterna cuando se quiera

`toggleEject()` invierte la **intención** y reproduce desde donde la tapa esté
parada. Antes reposicionaba el tiempo al extremo opuesto, y cuando el flag
`lidOpen` quedaba desincronizado de la posición real —el scroll lo escribe por
posición, el botón por intención— la tapa saltaba de golpe al otro extremo y
volvía: se veía como un ciclo de abrir y cerrar. Sin tocar el tiempo, cada
pulsación invierte el sentido desde el punto exacto, incluso a mitad del
movimiento. `syncLidFromClip()` vuelve a deducir el estado desde el clip después
de que la cinemática o el scroll la hayan movido por posición.

### 4c. Hero de una pantalla + narrativa reubicada

El hero ocupa **una sola pantalla** y no secuestra el scroll: el movimiento lo
ponen la entrada escalonada y una deriva idle lenta del modelo, que se suspende
mientras el usuario arrastra y mientras el scroll maneja la tapa.

La narrativa larga —la sección alta con el contenido pegado, donde bajar *es*
abrir la tapa— vive ahora en `#restauracion`, donde el gesto significa algo.
Como hay un solo canvas WebGL en todo el documento, la vitrina viaja al slot de
la sección que está en pantalla mediante un `IntersectionObserver`.

> Ese observer **no** puede usar un `threshold` por proporción: la sección mide
> varias pantallas de alto, y un elemento de 2880px en un viewport de 900px
> nunca llega a estar 35% visible —su máximo es 31%—, así que no se dispararía
> nunca. El criterio es un `rootMargin` negativo: "la sección toca la banda
> central del viewport", que se cumple sea cual sea su alto.

### 5. Sincronización del Scroll y Cámara Cinespace (js/scroll.js)
- **Lerp Multi-Waypoint**: El progreso de desplazamiento vertical de la página se normaliza entre `0` y `1`. Se definen 5 waypoints clave (Hero, Restauración, Specs, Catálogo, Garantía).
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
