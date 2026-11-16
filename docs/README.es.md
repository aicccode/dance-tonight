# Dance Tonight · Plan de 100 días de abdomen y quema de grasa (Escritorio)

Un juego de fitness al ritmo de la música y, a la vez, una herramienta de entrenamiento de baile en 3D. Los ejercicios de fitness se evalúan con la cámara según qué tan bien alcanzas cada posición, puntuando precisión y ritmo; los bailes complejos se centran en observar al entrenador, aprender los pasos y seguir la coreografía completa. El entrenador VRM en pantalla demuestra de forma continua y la voz te anticipa el siguiente movimiento.

Compatible con Windows, macOS y Linux. Todo funciona en local, sin servidor, y la imagen de la cámara nunca sale de tu ordenador.

## Funciones

| Modo | Descripción |
|---|---|
| **Entrenamiento de hoy** | Elige canciones automáticamente según el plan de 100 días para cubrir la duración del día. La densidad y variedad de ejercicios aumentan progresivamente con los días; cada 7.º día es de recuperación |
| **Desafío de velocidad** | Ideal para canciones rápidas de más de 125 BPM (electrónica, etc.). Un movimiento por compás, con puntuación en barra de vida: PERFECT +3, GREAT +1, GOOD −4, MISS −14; el desafío se pierde si la barra se vacía. Se puede activar la aceleración progresiva; cada canción tiene su propia tabla de clasificación |
| **Tutorial de ejercicios** | Practica un ejercicio a la vez. El entrenador demuestra en bucle, con una barra de coincidencia en tiempo real y un contador de repeticiones en pantalla |
| **Aprendizaje de danza contemporánea** | Un entrenador 3D impulsado por captura de movimiento real: importa archivos de mocap de Mixamo FBX / BVH / VRMA y aprende siguiéndolos. Velocidad de 0,25–1×, bucles por secciones, espejo, arrastrar para ver el movimiento en 360°, comparación lado a lado con la cámara |
| **Modo baile** | 27 movimientos de baile/variantes izquierda-derecha, cuatro coreografías (Groove de Luz de Estrellas / Swing del Barrio / Silueta Fluida / Escenario Giratorio), cada una con 4 secciones de 8 tiempos. Primero practica por secciones a velocidad lenta, luego elige una canción para la actuación completa; los movimientos complejos se enseñan paso a paso según su dominio, sin las limitaciones de la detección 2D de giros |

- **Estimación de calorías**: se calcula como "ejercicios realmente acertados × MET del ejercicio × segundos por tiempo × peso corporal + gasto basal" — los ejercicios fallados no queman calorías, mucho más razonable que multiplicar la duración de toda la canción por un factor fijo. Las tablas MET están en `web/js/core/moves.js` (`MOVE_MET`) y `web/js/dance/dancemoves.js` (`DANCE_MET`).
- **Abdomen y grasa corporal**: que se vean los abdominales depende del porcentaje de grasa corporal; entrenar el abdomen no elimina grasa localmente. Mantén el entrenamiento + registra tu cintura: una relación cintura/altura por debajo de 0,5 es una señal de progreso más fiable que el peso (el gráfico de tendencias de la página principal ahora muestra peso y cintura).
- **Movimientos de baile**: los básicos incluyen disco, palmada, corazón con los dedos, vogue, meneos de brazos, giro de caderas, el dub y el rebote; los avanzados incluyen body wave/roll del cuerpo, wave de brazos, pop de pecho, roll de hombros, paso lateral, grapevine, giros completos de 360° a izquierda y derecha, y la wave de espaldas. Los movimientos avanzados usan keyframes continuos de varios tiempos que pasan de verdad por el frente, el lateral y la espalda, con desplazamiento del peso adelante y atrás; durante la práctica se muestran indicaciones paso a paso y el avance de la demostración, sin necesidad de que la cámara reconozca tu espalda.
- **Entrenador 3D**: usa un avatar VRM con demostración en espejo (tú levantas la pierna izquierda, ella la derecha, como ante un espejo), alcanzando cada posición justo en el tiempo. La ventana del entrenador se puede arrastrar y redimensionar, y recuerda su posición. Sonríe cuando encadenas combos.
- **Entrenador de voz**: los 10 idiomas de la interfaz incluyen paquetes de voz sin conexión integrados, listos para usar:
  - El chino incluye la voz CosyVoice integrada «Longhua» (longhua_v3.1); los otros 9 idiomas (inglés / español / ruso / japonés / coreano / francés / alemán / portugués / árabe) se generan con las voces neuronales de Microsoft Edge: una sola voz femenina, con una calidad equiparable al chino; todos los paquetes se distribuyen con el repositorio, listos para usar;
  - Los paquetes de voz están en `assets/tts/`: `longhua_v3.1@zh/` para el chino y `edge@<idioma>/` para los demás; en Ajustes puedes reemplazar el paquete de tu idioma con tus propias grabaciones;
  - Cuenta atrás "tres, dos, uno" al empezar; cada serie comienza con avisos como "elevaciones de rodilla alternas";
  - Cada frase termina antes del tiempo que le corresponde, y la música baja automáticamente mientras habla;
  - Da ánimos a mitad del entrenamiento, como "ya va por la mitad" o "no pierdas el combo"; en el Modo Baile anuncia el nombre de cada movimiento ("dedo al cielo", "meneo a la izquierda"…).
- Los textos de las frases están en `web/js/core/cue_texts.js`; los 9 paquetes no chinos se regeneran con `python3 scripts/gen_voices_edge.py` (solo se regeneran las que faltan). También puedes subir tus propias grabaciones en Ajustes para reemplazar la voz del idioma actual.
- **Modo de práctica a ciegas**: cada movimiento se anuncia como "izquierda" o "derecha", con un tono de aviso en cada tiempo. Puedes seguirlo con auriculares y ojos cerrados.
- **Análisis de ritmo**: incluye Beat This! (el modelo de detección de tiempos de ISMIR 2024, cuantizado a int8, 22MB), ejecutándose en un Worker en segundo plano, unos 8 segundos por canción. Sobre 49 canciones de prueba:
  - El tempo se detectó correctamente en 48 (librosa solo acertó cerca de la mitad, confundiendo a menudo las canciones lentas con el doble de velocidad);
  - Las posiciones de los tiempos coinciden con el modelo PyTorch original con F = 0,995.
  - Si el modelo no carga, pasa automáticamente al algoritmo de ritmo integrado en JS puro.

## Ejercicios

**Ejercicios de fitness** (por nivel de desbloqueo):

| Nivel | Ejercicios | Zonas principales |
|---|---|---|
| 1 | 🙌 Brazos arriba · 👊 Puños izquierda/derecha | Cardio, hombros |
| 1 | 🍑 Sentadilla | Piernas y glúteos (profundidad según el ángulo de rodilla) |
| 1 | 🦵 Elevaciones de rodilla izq./der. · 🤸 Toes to fingertips | Abdominales, cadena posterior |
| 2 | ⭐ Jumping jacks | Cardio |
| 2 | ✖️ Rodilla izquierda a codo derecho / rodilla derecha a codo izquierdo | Oblicuos |
| 2 | 🦵 Elevaciones laterales de rodilla izq./der. · 🦶 Patadas frontales izq./der. | Oblicuos, glúteos, estabilidad del core |
| 3 | 🌙 Flexiones laterales izq./der. (se pueden mantener) | Laterales del abdomen |

**Movimientos de baile** (27 movimientos/variantes izquierda-derecha): dedo al cielo estilo disco, palmada al pecho, corazón con los dedos, pose de moda, meneos de brazos a izquierda y derecha, giro de caderas, el dub, rebote rítmico, además de body wave, círculo de cuerpo, waves de brazos a izquierda y derecha, pop de pecho, roll de hombros, pasos laterales a izquierda y derecha, grapevines a izquierda y derecha, giros completos a izquierda y derecha y la wave de espaldas.

¿Quieres aprender más jazz/danza contemporánea?: busca Jazz / Contemporary / Dance en [Mixamo](https://www.mixamo.com/), descarga con formato **FBX Binary** y Skin en **Without Skin**, luego importa en "Baile → Importar archivos de mocap" (puedes seleccionar decenas de archivos a la vez; se convierten uno a uno y los archivos dañados se listan por separado sin afectar al resto). Al importar, se detectan los esqueletos automáticamente (Mixamo, CMU, BVH habituales, VRMA), se corrigen ejes y orientación, se alinean las diferencias de postura A/T, se suaviza el temblor de la captura y se recortan los tramos estáticos del inicio y el final; los datos convertidos se guardan en `dances/` dentro del directorio de datos local.

**Crea tus propias coreografías**: en "Baile → Mis coreografías → Nueva coreografía", arrastra movimientos de la biblioteca de la derecha a la secuencia (suéltalos entre dos movimientos para insertarlos ahí), o haz clic en un movimiento para añadirlo tras el seleccionado; los de la secuencia se pueden reordenar arrastrando, borrar con Delete o espejar izquierda-derecha con un clic. Cada movimiento ocupa tiempo según su propia duración: los normales 1 tiempo, los giros/waves sus propios tiempos, y el mocap (tanto importado como contemporáneo integrado) se reproduce entero a velocidad original, empezando el siguiente movimiento en el tiempo inmediatamente posterior. Para una actuación, elige una canción y baila desde el primer movimiento hasta el final del último (la música se desvanece en consecuencia); la práctica por secciones divide automáticamente la secuencia en tramos de unos 8 tiempos. Las coreografías integradas se pueden "duplicar y editar" como punto de partida. Las coreografías se guardan en `data/data.json` del directorio de datos.

**Coreografías avanzadas**: "Silueta Fluida" se centra en las líneas del cuerpo, las waves de brazos y las isolaciones de pecho y hombros; "Escenario Giratorio" se centra en el trabajo lateral de pies, los giros completos y las combinaciones de espaldas. Los movimientos de varios tiempos se demuestran completos en 2 o 4 tiempos y nunca cambian a mitad de la animación.

## Ejecutar desde el código fuente (las tres plataformas)

Requiere Node.js 20 o superior.

```bash
npm install      # las dependencias vienen de npmmirror (ver .npmrc); tras instalar, MediaPipe/three.js/onnxruntime se copian a web/vendor automáticamente
npm start
```

`web/vendor/` es un directorio generado, no versionado: `scripts/vendor.mjs` lo reconstruye tras `npm install`, copiando las librerías de `node_modules` y el modelo de pose de `assets/models/`. La instalación no descarga nada.

El directorio `assets/` contiene los recursos integrados y se incluye en el empaquetado. El repositorio solo incluye el **paquete mínimo de verificación** (los recursos grandes o personales no se suben al repositorio):

| Ruta | Contenido |
|---|---|
| `assets/models/beat_this_final0.int8.onnx` | Modelo de tiempos (Beat This! int8, MIT, ver NOTICE) |
| `assets/avatars/RealMaster.vrm` `SportGirl.vrm` | Avatares de entrenador integrados (licencia de cada modelo, ver NOTICE) |
| `assets/dances/*.json` | 3 bailes de mocap integrados |
| `assets/tts/longhua_v3.1@zh/` `edge@<idioma>/` | Paquetes de voz sin conexión para los 10 idiomas, distribuidos con el repositorio; reemplazables con tus propias grabaciones en Ajustes |
| `samples/demo-song.mp3` | Canción de ejemplo para la verificación mínima |

**Flujo de verificación mínima**: `npm install && npm start` → Biblioteca de canciones → Añadir archivos → elige `samples/demo-song.mp3` → espera a que termine el análisis de ritmo → empieza el entrenamiento desde la página principal; o ve a la página "Baile" y sigue directamente un baile de mocap integrado.

**Más recursos**:
- Avatares VRM de entrenador: descarga un personaje que te guste de [VRoid Hub](https://hub.vroid.com/) (atento a los términos de licencia de cada modelo) e impórtalo en "Ajustes → Avatar del entrenador";
- Archivos de mocap: la página "Baile" de la app tiene un acceso a [Mixamo](https://www.mixamo.com/); descarga con **FBX Binary + Without Skin** e importa en lote;
- Canciones: impórtalas tú mismo; el contenido idéntico se guarda en una sola copia.

## Migración de datos entre dispositivos

La app no se conecta a internet ni requiere registro; todos los datos se guardan en local. Para llevar los datos a otro dispositivo, usa "Ajustes → Datos → Exportar paquete de datos" y genera un archivo `.dtx`: selección por categoría (entrenamientos / peso y cintura / mis coreografías / captura de movimiento importada / copias de canciones / análisis de ritmo / ajustes), compresión gzip y cifrado SM9 (modo SM4). La clave se deriva solo de la contraseña (mínimo 8 caracteres); la contraseña no se escribe en el archivo ni sale de tu equipo. La importación es incremental: el contenido se deduplica, así que lo que ya existe se conserva y solo se añade lo que falta. Los paquetes exportados por versiones anteriores con «cuenta + contraseña» se siguen importando sin problema.

## Licencia

Apache License 2.0 (ver [LICENSE](LICENSE)). Las licencias de los modelos y recursos de terceros se detallan una a una en [NOTICE](NOTICE) — presta especial atención a los términos de licencia individuales de los modelos VRM en `assets/avatars/` y verifícalos antes de distribuir públicamente o usar comercialmente.

## Empaquetado

| Plataforma | Comando | Artefacto |
|---|---|---|
| Linux | `npm run dist:linux` | `dist/Dance Tonight-x.y.z.AppImage` |
| Windows (en Windows) | `npm run dist:win` | Instalador NSIS |
| Windows (compilación cruzada en Linux) | `npm run dist:win-cross` | Versión portátil en zip; ejecuta `Dance Tonight.exe` tras descomprimir |
| macOS (debe ser en un Mac) | `npm run dist:mac` | dmg (arm64 + x64) |

La versión de macOS no está firmada con certificado de desarrollador, solo con firma ad-hoc. Al abrir por primera vez, haz clic derecho y elige "Abrir"; si avisa que la app "está dañada", ejecuta `xattr -cr "/Applications/Dance Tonight.app"`. Además, hay que permitir el acceso a la cámara en "Ajustes del sistema → Privacidad y seguridad → Cámara".

## Primer uso

1. **Biblioteca de canciones → Añadir carpeta completa**: elige tu directorio de música y el análisis de ritmo comienza en segundo plano. La música se copia al directorio de datos de la app (el contenido idéntico se guarda una sola vez), tras lo cual puedes borrar o mover los originales. Las canciones importadas anteriormente se copian automáticamente al arrancar.
2. Si vienes de una versión anterior, en **Ajustes → Datos** tienes «Importar datos antiguos» (`legacy.json`: entrenamientos, peso y fecha de inicio del plan, sin duplicados) e «Importar paquete de análisis de ritmo» (`beat_pack.json`: se empareja por huella del contenido, así que esas canciones no se reanalizan).
3. ¿Quieres tu propia voz? En **Ajustes → Entrenador de voz** sube grabaciones con el nombre del texto de cada frase para reemplazar la voz del idioma actual, o restaura el paquete integrado con un clic.
4. Primero practica cada ejercicio en **Tutorial de ejercicios** y luego empieza el entrenamiento desde la página principal.

Consejos de colocación: sitúate a 2,5–3 metros de la cámara con el cuerpo entero en el encuadre (incluidos los tobillos) y la luz de frente. Antes de cada canción, ponte de pie erguido con los brazos relajados a los lados durante unos 1 segundo para completar la calibración.

| Tecla | Acción |
|---|---|
| Espacio | Saltar calibración / pausar |
| Esc | Terminar esta canción |

## Dónde se guardan los datos

| Sistema | Ubicación |
|---|---|
| Windows | `%APPDATA%\Dance Tonight\` |
| macOS | `~/Library/Application Support/Dance Tonight/` |
| Linux | `~/.config/Dance Tonight/` |

En ese directorio, `data/data.json` guarda el progreso, las puntuaciones y el peso; `data/analysis/` guarda el análisis de ritmo de cada canción; `music/` guarda las copias de las canciones importadas; y `tts/`, `avatars/` y `dances/` guardan las voces que generes, los avatares importados y los bailes de mocap importados. Los archivos originales se pueden borrar tras importar; para hacer copia de seguridad o cambiar de ordenador, copia el directorio entero. Al eliminar una canción de la biblioteca, se borra también su copia en `music/` (tus archivos originales no se tocan).

## Desarrollo

```bash
npm test                          # pruebas unitarias y cobertura
python3 scripts/gen_voices_edge.py  # opcional: regenerar los paquetes de voz de los otros 9 idiomas (pip install edge-tts)
npm run test:coach                # 14 movimientos básicos de baile × 3 VRM, articulaciones reales al juez
npm run test:motion               # 13 movimientos avanzados × 5 fases × 3 VRM, verificar y capturar
npm run test:mocap                # bailes de mocap × 3 VRM, comprobación de render + interfaz/importación de aprendizaje
npm run e2e                       # flujo completo de Electron + las dos regresiones de entrenador anteriores
DT_E2E_EXE=dist/linux-unpacked/dance-tonight npm run e2e   # probar el programa empaquetado
node e2e/pose_gallery.mjs         # lámina de referencia de todas las poses fitness/baile (fotograma medio de movimientos continuos)
node e2e/coach_motion.mjs /tmp/dt-motion  # hoja de contacto de movimientos de cinco fases
node scripts/eval_beats.mjs <directorio-de-canciones> <resultado-de-referencia.json> beatthis   # evaluación de precisión de tiempos
```

Estructura de directorios:

| Directorio | Contenido |
|---|---|
| `electron/` | Proceso principal: ventanas, protocolo `app://` (aislamiento de origen cruzado, necesario para multihilo WASM), IPC, almacenamiento JSON local, gestión de paquetes de voz, gestión de VRM |
| `web/js/core/` | Catálogo de ejercicios, plan de 100 días, generación de cartas, frases de voz. Compartido entre proceso principal e interfaz |
| `web/js/analysis/` | Algoritmo de ritmo en JS puro, pre/post-procesado de Beat This!, Worker de análisis |
| `web/js/coach/` | Entrenador 3D: three.js + three-vrm, además de poses y curvas temporales |
| `web/js/voice/` | Planificación temporal de los avisos de voz (funciones puras) y reproducción con Web Audio |

## Limitaciones conocidas

- Los umbrales de evaluación de ejercicios solo se han probado en poses sintéticas, **aún no se han calibrado con personas reales**. Si un ejercicio está claramente bien hecho pero nunca puntúa completo, dímelo, o ajusta `MATCHERS` en `web/js/judge.js`.
- El reconocimiento usa solo una vista frontal 2D y no distingue bien la profundidad del cuerpo ni los movimientos de espaldas. Por eso **los ejercicios de fitness se limitan a poses fáciles de detectar de frente; los giros, las poses de espaldas y los movimientos con profundidad se usan solo para el aprendizaje guiado del baile**, sin puntuación por coincidencia de articulaciones.
- Los umbrales de los movimientos básicos de baile se calibraron solo en poses sintéticas; si al bailar de verdad la puntuación te parece demasiado laxa o estricta, ajusta `DANCE_MATCHERS` en `web/js/dance/dancemoves.js`. Los movimientos avanzados guiados se valoran por el seguimiento completado, no por la precisión de la postura de baile real.
- Las versiones de Windows y macOS hasta ahora solo se han empaquetado en Linux, **aún no se han probado en máquinas reales**.
