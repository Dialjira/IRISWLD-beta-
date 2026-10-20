---
name: cuadrantes-belen
description: "Mantener, ampliar y compilar la app Android «Cuadrantes Belén» (Capacitor + Leaflet) de la Estación de Policía Belén: GPS por cuadrante, cámaras, mapa de calor de delitos, lugares, Convive la Noche, alertas y nomenclatura de Medellín. Úsala para cualquier cambio, actualización de datos o nueva APK de este proyecto."
---

# Cuadrantes Belén — skill del proyecto

## 1. Para quién y para qué

Usuario: **Diego**, subintendente de la Policía Nacional, patrulla de vigilancia de la **Estación de Policía
Belén** (MEVAL, Distrito 5, Medellín). Entiende resultados, no código. Habla español; quiere respuestas
directas, cifras concretas, una APK que se instale y explicaciones claras. Protesta con razón cuando algo
que funcionaba se rompe.

La app existe para que un policía en la calle, con señal mala y poco tiempo, sepa **en qué cuadrante está,
qué dirección es, qué hay alrededor (cámaras, comercios, establecimientos nocturnos), a quién llamar y
cómo llegar**, y pueda **registrar lo que falta**. Cada decisión se mide contra eso:

- **Funciona sin señal.** Todos los datos van dentro de la APK. Internet es un extra (mapa base, Nominatim).
- **Cero pérdida de datos.** Las actualizaciones se firman con la MISMA llave y suben `versionCode`.
- **Pulgar y sol.** Botones grandes, pocos toques, alto contraste, modo oscuro.
- **Datos sensibles fuera del repo público.** Ver §6.

## 2. Carpeta del proyecto en el PC de Diego

```
C:\Users\diego\Downloads\MAPAS POLICE\
  IRISWLD-beta-\          clon del repositorio (rama de trabajo)
    app-cuadrantes\       la app (ver §3)
    cuadrantes\index.html app web de un archivo (primera versión, proyectos sobre el KML)
  firma\                  cuadrantes-belen.jks + LEEME-FIRMA.txt (contraseña). NUNCA al repo
  datos-privados\         CAMARAS_ESBEL.kml, PDFs y listas internas. NUNCA al repo
  datos-fuente\           descargas crudas: osm\, alc\, overture.parquet, conviva.json, belen.json
  entregas\               APKs generadas (CuadrantesBelen-X.Y.Z.apk) e informes CSV/KML
```

`tools/windows/instalar-mapas-police.ps1` crea esta estructura, clona el repo e instala dependencias.
Repositorio: `https://github.com/Dialjira/IRISWLD-beta-` · rama `ccr-911125b8-sxviui` · PR #1.

## 3. Arquitectura

Capacitor 7 + HTML/JS **sin bundler** (no hay Vite: `www/` se sirve tal cual).

```
app-cuadrantes/
  www/index.html            carga en este orden: capacitor.js, leaflet, leaflet-heat, data/*.js, js/geo.js, js/iconos.js, js/app.js
  www/js/geo.js             funciones puras (Node y navegador): geometría, nomenclatura Medellín, geocodificador
  www/js/iconos.js          44 categorías de lugares + 10 tipos de cámara (trazos SVG 24×24) → window.ICONOS
  www/js/app.js             toda la app (IIFE). Vistas: aqui, cuadrantes, zone, place, cam, punto, buscar, registros, mas, capas
  www/css/app.css           tokens claro/oscuro; sin `inset`, sin dvh (WebView viejo)
  www/data/cuadrantes.js    window.KML_BASE   — 28 cuadrantes del KML BELEN CUADRANTES (+ etiquetas)
  www/data/osm.js           window.OSM_DATA   — calles con geometría, barrios, direcciones OSM, calles por cuadrante
  www/data/alcaldia.js      window.ALCALDIA   — cámaras SIES-M/Metro/FDT/movilidad, 99 cuadrantes oficiales con tel, barrios, 88.677 placas, delitos 2015-2017
  www/data/lugares.js       window.LUGARES    — 13 k lugares (OSM + Overture + Alcaldía) [nombre, clave, etiqueta, lat, lng, dir, tel, fuente, cuadrante]
  www/data/conviva.js       window.CONVIVA    — 851 establecimientos Convive la Noche (200 ubicados)
  www/data/estacion.js      window.ESTACION   — número único y dependencia de los 28 cuadrantes (tabla de la estación)
  tools/                    scripts de datos (ver §5), iconos.py, vendor.js, windows/
  tests/geo.test.js         `npm test`
  android/                  proyecto nativo generado por Capacitor (versionCode/versionName en app/build.gradle)
```

Estado persistente (IndexedDB `cuadrantes`, almacén `kv` clave `db`): `records` (lugares/vías/zonas propios con
fotos en almacén `photos`), `settings` (capas, filtros, cuadrantes asignados, alertas), `camEdits` (estado/nota por
cámara), `camKml` y `sedes` (KML de cámaras importado), `track` (recorridos 14 días), `visits`. `delImp` = delitos CSV.
Al agregar campos a `settings`, añadirlos en `DEF_SETTINGS` y fusionarlos en `boot()` (ya fusiona `layers` y `heat`).

Plugins nativos se registran con `Capacitor.registerPlugin(n)` (no hay bundler): App, Haptics, Filesystem, Share,
StatusBar, SplashScreen. Exportar = `Filesystem.writeFile(CACHE)` + `Share.share({files})`.

## 4. Funciones (no romperlas)

- **GPS**: `navigator.geolocation` del WebView (NO el plugin Geolocation). Tarjeta superior: cuadrante (Belén u otra
  estación vía cuadrantes oficiales), placa oficial más cercana (`revAddr`), barrio oficial, precisión.
- **Alertas** (`checkAlerts`): salir de cuadrantes asignados, entrar a zonas críticas/riesgo/oscuras propias, <60 m de
  punto crítico o luminaria dañada. Vibración doble + tarjeta roja. Solo con la app abierta (opción pantalla encendida).
- **Guiar** (`setTarget`): flecha, distancia y rumbo en vivo; aviso al llegar (<25 m); Google Maps y Waze.
- **Buscar** (`searchResults`): dirección → `geoAddr` (placa oficial exacta/interpolada, si no cruces OSM), cámaras por
  número («cámara 182»), lugares, Convive («convive»), barrios, vías, Nominatim en línea.
- **Punto** (mantener presionado el mapa o resultado): cuadrante + teléfono, placa, cámaras a 200 m, sede más cercana, delitos a 150 m.
- **Cuadrante** pestañas: Resumen (dependencia, teléfono, cámaras, delitos, asignarme, barrios, nomenclatura, qué hay),
  Cámaras, Delitos (por tipo, día, modalidad, año, puesto), Lugares (chips por categoría con ícono), Calles, Datos.
- **Cámaras**: color = estado (ok/falla/fuera/nd), ícono = tipo (`ICONOS.camIcon`), borde = fuente. Marcar estado y nota
  por cámara. Importar KML de la estación: cruza por número (`camDigits`) a <250 m; color del estilo KML → estado
  (`ff2257ff` ok, `ff07c1ff` fuera, `ffb0279c` falla; azul `fff39621` = sede).
- **Capas**: cámaras (4 fuentes), mapa de calor con filtros tipo/año/día, Convive (cierre 2 o 4 a. m.), lugares por
  categoría, cuadrantes vecinos, recorrido. Íconos divIcon desde zoom 17 (lugares) y 16 (cámaras); antes, puntos canvas.
- **Registros**: lugares (CATS), vías (entran al índice de calles), zonas (ZONE_CATS, incluye «oscura»), cámaras propias;
  fotos; proyecto; exportar CSV/KML/GeoJSON; importar JSON/GeoJSON/KML y **CSV nombre+dirección** (se geocodifica).
- **Recorrido**: puntos cada 25 m/2 min, tiempo por cuadrante, exportar KML.

### Bugs ya resueltos — no deben volver

| Bug | Causa | Solución vigente |
|---|---|---|
| App bloqueada pidiendo Google Play Services, GPS muerto en Huawei/emulador | Plugin `@capacitor/geolocation` v7 exige Play Services | Usar `navigator.geolocation`; Capacitor pide el permiso. No reinstalar el plugin |
| Mapa en blanco (altura 0) en WebView viejo (Chrome 83) | CSS `inset` no soportado | `top/left/right/bottom` explícitos. Evitar `inset`, `dvh`, `:has` |
| Pestañas del cuadrante invisibles | Hijos del flex se encogían | `.sheet-body>*{flex-shrink:0}` |
| Placa «- 573» | Reverso OSM en cuadras largas | Si >150 m: «Carrera X cerca de Calle Y» |
| «21 - 8» en vez de «21 - 08» | Número de placa sin relleno | `padStart(2,'0')` en etiquetas |
| Cámaras «no encontradas» | Alcaldía usa «C57», el KML «CAM 057» | Comparar dígitos sin ceros (`camDigits`), prefijos C, MS-, LPR-, CF |
| Rango «Carreras 8DA a 102» | Errores de digitación en OSM | `rangeSummary` ignora números aislados (>25 del resto) |
| Establecimientos ubicados en Belén siendo de otra comuna | Calle inexistente → cruce lejano | `tools/conviva.js` valida comuna del punto (barrios oficiales ±80 m) |
| Inspección de policía como «sede más cercana» | OSM etiqueta todo como police | `sedes()` exige CAI/Estación/Subestación y excluye inspección/comisaría |

## 5. Datos: fuentes y cómo actualizarlos

Todo en `app-cuadrantes/tools/`. Trabajar en `datos-fuente\` (fuera del repo) y escribir solo los `www/data/*.js`.

1. **KML de cuadrantes** → `python tools/kml_a_json.py tools/BELEN_CUADRANTES.kml > belen.json` y luego
   `cuadrantes.js` (ver build en la conversación: añadir `lines:[]` y `attrs:{}` a puntos). El KML trae
   `xsi:schemaLocation` sin prefijo: el script lo quita.
2. **OpenStreetMap** → `bash tools/descargar_osm.sh` (Overpass; si `overpass-api.de` falla usar
   `OVERPASS=https://maps.mail.ru/osm/tools/overpass/api/interpreter`, reintenta) → `python tools/osm_por_cuadrante.py` → `osm-belen.json` → `osm.js`.
3. **Alcaldía** (servidor público `https://www.medellin.gov.co/servidormapas/rest/services`, usar `f=pjson`;
   `f=json` en carpetas devuelve error y el servidor es inestable: reintentar) →
   `python tools/descargar_alcaldia.py` → `python tools/datos_alcaldia.py alc belen.json www/data/alcaldia.js`.
   Capas: `seguridad_defensa/VM_Policia_MAP5` (0/10 CCTV, 2 cuadrantes con teléfono, 3 Metro, 5 FDT, 7 movilidad),
   `seguridad_defensa/VM_Indicador_Seguridad` (hurto/riña/homicidio 2015-2017; fechas sin hora, en UTC medianoche),
   `ServiciosCiudad/CartografiaBase_BN_Seguridad` (0 nomenclatura domiciliaria, 9 barrios),
   `educacion/VC_Sedes` (0,1), `deporte_recreac/VM_INDER` (18,22,39,40), `cultura/VM_Red_Bibliotecas` (0).
4. **Overture Maps** (lugares; Meta/Microsoft/Foursquare, CDLA): S3 con credenciales falla tras el proxy → leer por
   **HTTPS** la lista de `release/<última>/theme=places/type=place/*.parquet` con DuckDB y filtrar por `bbox`.
   Esquema actual: `names.primary`, `basic_category`, `taxonomy.primary/hierarchy`, `confidence`, `addresses[1].freeform`.
   Luego `python tools/lugares.py <datos-fuente> belen.json www/data/lugares.js` (clasifica con `RULES`, confianza ≥0.45,
   ≥0.7 para «otros/servicios/historic_site», deduplica por nombre a <60 m: OSM > Alcaldía > Overture).
5. **Convive la Noche** (PDF de la Secretaría de Desarrollo Económico) → `pdfplumber` → `conviva.json`
   [{nombre, dir, comuna, horario}] → `node tools/conviva.js conviva.json www/data/conviva.js`.
6. **Teléfonos de cuadrante** → `www/data/estacion.js` (tabla «Número único de cuadrante» de la estación). Prioridad
   sobre el teléfono de la Alcaldía (`zoneTel`).
7. Fuentes sin datos útiles (no perder tiempo): Cámara de Comercio de Medellín (solo totales por comuna),
   Superfinanciera (totales por municipio), datos.gov.co delitos (solo nivel municipio), web.archive.org (bloqueado).

## 6. Seguridad y privacidad (repositorio PÚBLICO)

- **Nunca** subir: `CAMARAS_ESBEL.kml` (estados internos de cámaras), PDFs/listas internas, `*.jks`,
  `keystore.properties`, APKs. El KML de cámaras se importa en la app y queda en el celular.
- Datos públicos sí embebidos: Alcaldía (servidor público), OSM, Overture, lista Convive la Noche (nombre, dirección,
  comuna, horario), teléfonos de cuadrante (se publican a la ciudadanía). Si Diego pide retirar algo, quitarlo del repo
  y ofrecerlo como archivo importable.
- `android:allowBackup="false"` + `data_extraction_rules.xml` (sin copia a la nube). Permisos: ubicación, internet, vibración.

## 7. Compilar y entregar la APK

1. Requisitos: Node 20+, JDK 21, Android SDK 35 (build-tools 35). En Windows, Android Studio trae SDK y JDK.
2. `npm ci` → `npm test` → `npm run vendor` → `npx cap sync android`.
3. Subir `versionCode` (+1) y `versionName` en `android/app/build.gradle`, `package.json` y `VERSION` en `app.js`.
4. Firma: `android/keystore.properties` (gitignored) apunta a `firma\cuadrantes-belen.jks`, alias `cuadrantes`.
   Sin esa llave no se puede actualizar sin desinstalar. `gradlew assembleRelease` →
   `apksigner verify` → copiar a `entregas\CuadrantesBelen-X.Y.Z.apk`.
5. Si Maven Central responde 429: init script con espejo
   `https://maven-central.storage-download.googleapis.com/maven2/` (`gradlew -I mirror.gradle ...`).
6. CI: `.github/workflows/apk-cuadrantes.yml` (usa el SDK del runner; firma si existen los secretos
   `ANDROID_KEYSTORE_BASE64` y `ANDROID_KEYSTORE_PASSWORD`; si no, debug).
7. Instalación para Diego en 3 pasos: pasar la APK al celular, permitir «instalar apps desconocidas», abrir y
   aceptar ubicación «Mientras se usa la app». Las versiones nuevas se instalan encima (misma llave).

## 8. Pipeline obligatorio en cada cambio

1. **Validar**: leer el código afectado y la tabla de bugs (§4).
2. **Cambiar** poco y localizado; reemplazos con ancla exacta (`assert old in s`).
3. **Probar**: `npm test` (geocodificador: mediana <20 m con placas oficiales; reverso oficial; placa exacta) +
   Playwright en Chromium móvil con GPS simulado (6.2297, -75.6018 → Cuadrante 9, «Calle 28 # 80A - 32»):
   sin errores de consola; importar CAMARAS_ESBEL.kml → «108 coinciden»; buscar «Cra 73A # 21-08» → C8 placa oficial;
   alerta al salir del cuadrante asignado; persistencia tras recargar.
   Si hay emulador: `adb install -r` sobre la versión anterior (prueba de actualización sin perder datos).
4. **Entregar**: APK firmada + resumen en español: qué cambió, qué se probó, qué quedó pendiente y por qué.

## 9. Cómo reportarle a Diego

En español, directo: qué cambió, cifras (cuántos lugares, cámaras, establecimientos ubicados), qué se probó y qué
no (decir si fue en navegador o en emulador), qué falta y la alternativa. Sin jerga. Si una fuente no tiene el dato
(p. ej. bancos completos), decirlo y ofrecer el camino: «Completar datos», registrar o importar CSV.
