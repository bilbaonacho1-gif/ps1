# PROMPT PARA ANTIGRAVITY

Actuá como un desarrollador frontend senior especializado en WebGL y experiencias 3D.

---

## CONTEXTO: el modelo 3D YA EXISTE

En `assets/models/ps1.glb` hay una consola PlayStation 1 ya modelada, texturizada y **animada**. No lo generes ni lo reemplaces. Ya lo inspeccioné, estos son los datos reales:

- **14.538 triángulos / 11.999 vértices** — liviano, no hace falta optimizarlo.
- **1 material PBR** (`lambert1`) con baseColor + metallicRoughness + normal + AO. Un solo draw call.
- **1 animación: `"Lid Open"`, duración 5.0 segundos.** Anima tres nodos a la vez: `lid_low` (la tapa se levanta), `eject_low` (el botón se hunde) y `gear_low` (el engranaje gira).
- **Cada pieza es un nodo independiente**, con estos nombres exactos:

```
playstation_low
├── body_low              7.238 tris   cuerpo
├── lid_low               1.616 tris   tapa           <- animada
├── gear_low              1.144 tris   engranaje      <- animado
├── eject_low               160 tris   boton EJECT    <- animado
├── power_low               160 tris   boton POWER
├── reset_low               160 tris   boton RESET
├── reader_low              848 tris   lector
├── cdreader_low            584 tris   lente del CD
├── memcard1_low          1.224 tris   memory card 1
├── memcard2_low          1.224 tris   memory card 2
└── power_indicator_low     180 tris   LED de encendido
```

**Aprovechá esos nombres.** Buscá los nodos con `scene.getObjectByName('power_low')` etc. y hacé cada botón interactivo por separado. Esa es la diferencia entre una landing con un objeto muerto y una con un objeto vivo.

**Importante:** el modelo viene en reposo con la tapa ABIERTA. Al cargar, congelá el clip en el frame 0 para que arranque cerrada:
```js
action = mixer.clipAction(clip);
action.play();
action.paused = true;
action.time = 0;
mixer.update(0);
```

**Crédito obligatorio** (licencia CC Attribution, va en el footer y en el README):
> "Lisa Gordon, PS1 Final" (https://skfb.ly/oAxnL) by happylittlepolygons is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

---

## EL PRODUCTO

Una tienda de **consolas retro restauradas**. No somos Sony: somos un taller que consigue consolas de los 90, las restaura, las testea y las vende con garantía. Nombre de la marca: **RESET** (o proponé uno mejor, pero corto y de una palabra).

No uses logos de Sony ni de Nintendo. Referí a las consolas de forma genérica y descriptiva.

---

## STACK

- HTML5 + CSS3 + JavaScript **vanilla**. Sin React, sin frameworks de UI.
- **Three.js r169** por import map desde CDN:
  ```html
  <script type="importmap">
  {"imports":{
    "three":"https://unpkg.com/three@0.169.0/build/three.module.js",
    "three/addons/":"https://unpkg.com/three@0.169.0/examples/jsm/"
  }}
  </script>
  ```
- `GLTFLoader`, `OrbitControls`, `RoomEnvironment` (de `three/addons/`).
- Módulos ES. Sin bundler: se sirve estático y se despliega en Vercel/Netlify sin build.

## ARCHIVOS

```
index.html
/css/style.css
/js/main.js        -> bootstrap, loop de render, resize
/js/scene3d.js     -> escena, luces, carga del GLB, materiales
/js/interact.js    -> raycasting sobre los botones, hover, click
/js/animations.js  -> control del clip "Lid Open", secuencia del disco
/js/scroll.js      -> sincronizacion scroll <-> camara
/assets/models/ps1.glb   (YA EXISTE)
README.md
```

---

## DIRECCIÓN DE ARTE: minimalismo con alma retro

La clave es la tensión entre dos cosas: **layout de museo de diseño** (limpio, aireado, tipografía grande, muchísimo espacio en blanco) y **detalles de los 90** que aparecen de a poco. No es una página "gamer" con neones y degradés morados. Es una galería donde la pieza expuesta es una consola.

**Paleta** — sobria, derivada del plástico real de la consola:
- Fondo: blanco hueso `#F4F2ED` (modo claro) y `#14151A` (modo oscuro)
- Gris plástico de la consola: `#D6D2C4`
- Texto: casi negro `#1A1A1A`
- Acentos, usados con cuentagotas (solo en CTAs y datos): rojo `#E03B30`, azul `#2B5FD9`, amarillo `#F2B705`, verde `#1FA65A`

Esos cuatro son los colores de los botones del control de la época. Úsalos **poco**: un botón, un número, un subrayado. Si los usás en bloques grandes, se cae en lo infantil.

**Tipografía** — dos voces en contraste:
- Títulos: una grotesca ancha y pesada (Archivo Black, Anton o similar de Google Fonts), en tamaños enormes (`clamp(3rem, 10vw, 9rem)`), tracking negativo, todo en minúscula o todo en mayúscula pero consistente.
- Datos, etiquetas y precios: una **monoespaciada pixelada** (Silkscreen o VT323 de Google Fonts) en tamaño chico, con `letter-spacing` amplio y en mayúsculas. Ahí es donde entra la nostalgia, no en los títulos.

**Detalles de época** — sutiles, nunca decorativos de más:
- Overlay de **scanlines CRT** muy tenue (`repeating-linear-gradient`, opacidad 0.03) sobre toda la página.
- Un leve **viñeteado** en los bordes del canvas, como una tele vieja.
- Los precios y specs escritos como una **ficha técnica**: etiqueta monoespaciada a la izquierda, valor a la derecha, línea punteada entre medio.
- Micro-etiquetas tipo `[ 001 ]`, `[ 002 ]` numerando las secciones.
- Cursor custom sobre el canvas.

**Movimiento**: transiciones con `cubic-bezier(0.16, 1, 0.3, 1)`. Nada de `ease`. Todo entra desde abajo con un desfasaje de 60ms entre elementos.

**Lo que NO quiero**: degradés morado-cian, glassmorphism, tarjetas con sombra difusa, emojis de decoración, pixel art literal de Mario. La nostalgia se sugiere con tipografía y textura, no se grita.

---

## LA EXPERIENCIA 3D

**Setup de render** (crítico para que el PBR se vea bien):
```js
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Sin environment el metalness no refleja nada y la consola se ve de plastilina:
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
```

Luces: una direccional principal con `castShadow` (mapa 2048, `bias: -0.0005`), una ambiental suave, y una luz de contra fría para separar la consola del fondo. Piso invisible con `ShadowMaterial` para que apoye la sombra.

**Estados e interacción:**

1. **Reposo**: la consola flota centrada, con rotación idle muy lenta en Y y un bobbing casi imperceptible. Tapa cerrada.

2. **Hover sobre cada botón** (raycasting contra `power_low`, `eject_low`, `reset_low`): el botón se ilumina apenas y aparece una etiqueta flotante en tipografía pixelada con su nombre — `POWER`, `EJECT`, `RESET`. La etiqueta sigue la posición del botón proyectada a 2D.

3. **Click en EJECT**: corre el clip `"Lid Open"` hacia adelante. La tapa se levanta, el botón se hunde, el engranaje gira. Segundo click: el mismo clip con `timeScale = -1` para cerrarla.

4. **Click en POWER**: el LED (`power_indicator_low`) se enciende con material `emissive` que sube progresivamente, y en un CRT al lado aparece la secuencia de booteo — texto pixelado que escribe línea por línea sobre fondo negro. Es el momento wow de la página.

5. **Click en RESET**: todo vuelve al estado inicial con una animación suave.

6. **OrbitControls**: `enableDamping: true`, `enablePan: false`, zoom acotado (`minDistance`/`maxDistance`), `maxPolarAngle` limitado para que no se vea por debajo del piso.

7. **Scroll**: la cámara recorre la consola mientras bajás — al principio la ves en 3/4, después de frente, después un plano cerrado del lector con la tapa abierta. Interpolá con lerp sobre el scroll normalizado, nunca saltos. La consola **acompaña** las secciones, no desaparece.

---

## RENDIMIENTO (se evalúa)

- 60 FPS estables en desktop. Un solo `requestAnimationFrame` (usá `renderer.setAnimationLoop`).
- Pausá el render cuando el canvas sale de pantalla, con `IntersectionObserver`.
- `resize` con debounce.
- En mobile: pixel ratio a 1, sombras desactivadas, `OrbitControls` que no secuestre el scroll vertical de la página.
- Pantalla de carga con porcentaje real, usando el callback `onProgress` del `GLTFLoader`.

## ESTRUCTURA DE LA PÁGINA

1. **Hero** — canvas a pantalla completa, título enorme, una línea de subtítulo, y una sola instrucción discreta en monoespaciada: `CLICK EN EJECT PARA ABRIR`.
2. **[ 001 ] El proceso** — cómo se restaura una consola, en 4 pasos numerados. Texto y números grandes, sin iconos.
3. **[ 002 ] Ficha técnica** — specs de la consola en formato de tabla con líneas punteadas.
4. **[ 003 ] El catálogo** — 3 modelos disponibles con precio y estado (Restaurada / Como nueva / Sellada).
5. **[ 004 ] Garantía** — por qué comprar acá.
6. **CTA final** — un solo botón, grande, en rojo.
7. **Footer** — con el crédito CC del modelo 3D.

## RESPONSIVE Y ACCESIBILIDAD

- Mobile first. En pantallas chicas la consola es más chica y el texto manda.
- `prefers-reduced-motion`: reemplazar animaciones por fades.
- Contraste AA, navegación por teclado en todos los botones, `alt` en todo.
- Los botones 3D también accesibles: duplicá las acciones en botones HTML reales para que funcionen sin mouse.

## ENTREGABLES

- `README.md` con: cómo correrlo local, el crédito CC del modelo, y una sección explicando **cómo funciona el renderizado, la iluminación y la manipulación del DOM** (lo tengo que defender oralmente).
- Código **comentado en español**, explicando el porqué de cada decisión 3D.

## REGLAS

- Nada de `// TODO`. Todo funcional.
- No toques `assets/models/ps1.glb`.
- Cero assets externos más allá de Three.js y Google Fonts. Texturas extra, generalas con Canvas 2D.
- Entregá el código completo, archivo por archivo.
