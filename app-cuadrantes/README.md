# Cuadrantes Belén (app Android)

App para patrulla: con el GPS del celular dice **en qué cuadrante estás**, la
**dirección aproximada** (nomenclatura de Medellín) y **qué hay alrededor**. Además
permite **registrar a mano** lo que falta en el mapa: negocios, empresas, locales,
residencias, calles, carreras y zonas críticas.

Los cuadrantes vienen del KML `BELEN CUADRANTES` (28 cuadrantes de la Estación
Belén, la Subestación Altavista y los CAI Guayabal y La Macarena). Las calles,
los barrios, los lugares y las direcciones vienen de OpenStreetMap y ya están
dentro de la app, así que **funciona sin señal**.

## Instalar en el celular (3 pasos)

1. Pasa el archivo `CuadrantesBelen-1.0.0.apk` al celular (WhatsApp, Drive o cable).
2. Ábrelo. Android pide permitir «instalar apps desconocidas» para esa app
   (Archivos, Drive o WhatsApp): acepta y toca **Instalar**.
3. Abre **Cuadrantes Belén** y acepta el permiso de **ubicación** («Mientras se usa la app»).

## Qué hace

| Pestaña | Para qué |
|---|---|
| **Aquí** | Cuadrante actual, dirección aproximada («Carrera 80 # 28 - 27»), barrio, precisión del GPS y lugares a menos de 400 m. Vibra y avisa al cambiar de cuadrante. Botones: Google Maps, Compartir (texto para WhatsApp con link) y Registrar aquí. |
| **Cuadrantes** | Lista de los 28 cuadrantes con buscador. Cada uno tiene: resumen (barrios, rango de calles y carreras, cuánto hay de cada tipo), lugares por categoría, calles y direcciones conocidas, y los datos del KML. |
| **Buscar** | Escribe una dirección («Calle 30A # 80-15», «Cra 76 No. 32-10», «CL 9 SUR 79 20») y te dice en qué cuadrante cae, sin internet. También busca lugares, barrios, vías y números de cuadrante. Con señal, puede buscar además en OpenStreetMap. |
| **Registros** | Tus datos: lugares (16 tipos: negocio, local, empresa, residencia, unidad, colegio, salud, banco, iglesia, entidad pública/JAC, parque, parqueadero/taller, punto crítico, cámara…), calles/carreras que faltan y zonas. Cada uno con dirección, teléfono, contacto, horario, notas, proyecto y fotos. Se exportan a **Excel (CSV)**, **Google Earth (KML)** y GeoJSON. |
| **Más** | Mapa base (calles, OpenStreetMap, satélite), descargar el mapa para usarlo sin señal, respaldo para cambiar de celular, cargar otro KML y contexto del modelo de cuadrantes. |

Cada lugar abre en **Google Maps**, **Cómo llegar** y **Street View**, y si tiene
teléfono, se puede llamar. Los lugares de OpenStreetMap se pueden **completar**
(teléfono, contacto, fotos): la app guarda tu versión sobre la original.

**Cómo registrar:** botón verde **Registrar** → elige *Lugar*, *Calle/carrera* o
*Zona*. Para un lugar, mueve el mapa hasta que la cruz quede encima (o toca «Mi
GPS») y confirma. Para calles y zonas, toca el mapa en cada esquina. La app
calcula sola el cuadrante y sugiere la dirección.

## Datos y privacidad

- Los registros y fotos quedan **solo en el celular** (no hay copia automática a
  la nube). Usa **Más → Exportar respaldo** para guardarlos o pasarlos a otro equipo.
- Sin internet funcionan: cuadrantes, GPS, calles, lugares, direcciones y
  buscador. El mapa de fondo necesita señal la primera vez; lo que ves queda
  guardado y en **Más** se puede descargar completo (~15 MB).
- Las direcciones calculadas son aproximadas (error típico de 30 m). Verifica en terreno.
- Datos de calles y lugares: © colaboradores de OpenStreetMap (ODbL).

## Firma de la APK (importante)

La APK está firmada con la llave `cuadrantes-belen.jks`, que **no está en este
repositorio** (es público). Guárdala junto con su contraseña: las
actualizaciones deben firmarse con la misma llave para instalarse encima sin
borrar los datos. Para que GitHub compile versiones firmadas, crea en el
repositorio los secretos `ANDROID_KEYSTORE_BASE64` (el .jks en base64) y
`ANDROID_KEYSTORE_PASSWORD`. Sin ellos, el workflow genera una APK de prueba (debug).

## Para desarrolladores

```bash
cd app-cuadrantes
npm ci
npm test                 # pruebas del buscador de direcciones con direcciones reales
npm run vendor           # copia Leaflet, Capacitor y fuentes a www/
npx cap sync android
cd android && ./gradlew assembleRelease   # requiere android/keystore.properties
```

- `www/` es la app (HTML/JS sin compilador). `www/js/geo.js` tiene la
  geometría y la nomenclatura (Calle # Carrera - metros).
- `tools/kml_a_json.py` convierte el KML y `tools/osm_por_cuadrante.py` asigna
  calles, barrios, lugares y direcciones de OpenStreetMap a cada cuadrante
  (necesita las descargas de Overpass en `osm/`).
- La compilación usa Capacitor 7 (Android 6.0 en adelante, objetivo API 35).
