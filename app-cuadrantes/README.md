# Cuadrantes Belén (app Android)

App para patrulla: con el GPS del celular dice **en qué cuadrante estás**, la
**dirección aproximada** (nomenclatura de Medellín) y **qué hay alrededor**. Además
permite **registrar a mano** lo que falta en el mapa: negocios, empresas, locales,
residencias, calles, carreras y zonas críticas.

Los cuadrantes vienen del KML `BELEN CUADRANTES` (28 cuadrantes de la Estación
Belén, la Subestación Altavista y los CAI Guayabal y La Macarena). Todo lo demás
ya está dentro de la app, así que **funciona sin señal**:

- **OpenStreetMap**: calles, barrios y lugares.
- **Servidor de mapas público de la Alcaldía de Medellín**:
  - cámaras de la Policía (SIES-M), del Metro, de fotodetección y de movilidad;
  - cuadrantes oficiales con teléfono;
  - barrios oficiales;
  - 88.677 placas de nomenclatura domiciliaria;
  - delitos georreferenciados 2015–2017.

## Instalar en el celular (3 pasos)

1. Pasa el archivo `CuadrantesBelen-1.1.0.apk` al celular (WhatsApp, Drive o cable).
2. Ábrelo. Android pide permitir «instalar apps desconocidas» para esa app
   (Archivos, Drive o WhatsApp): acepta y toca **Instalar**.
3. Abre **Cuadrantes Belén** y acepta el permiso de **ubicación** («Mientras se usa la app»).

## Qué hace

| Pestaña | Para qué |
|---|---|
| **Aquí** | Cuadrante actual (también de otras estaciones fuera de Belén), placa oficial más cercana, barrio oficial, precisión del GPS, **llamar al cuadrante**, cámaras a menos de 200 m, sede policial más cercana, lugares a 400 m y recorrido del día. Vibra al cambiar de cuadrante. |
| **Cuadrantes** | Los 28 cuadrantes. Cada uno: resumen (teléfono, barrios, rango de calles y carreras), **cámaras** con su estado, **delitos** (por tipo, día de la semana, modalidad y año, y puesto entre los 28), lugares, calles y datos del KML. |
| **Buscar** | Dirección («Calle 30A # 80-15», «Cra 76 No. 32-10») → placa oficial exacta o interpolada, cuadrante, cámaras cercanas, sede más cercana, **Guiar**, Google Maps, Waze y Street View. También busca cámaras por número («cámara 182»), lugares, barrios y vías. Mantener presionado el mapa abre lo mismo para cualquier punto. |
| **Registros** | Tus datos: lugares (16 tipos: negocio, local, empresa, residencia, unidad, colegio, salud, banco, iglesia, entidad pública/JAC, parque, parqueadero/taller, punto crítico, cámara…), calles/carreras que faltan y zonas. Cada uno con dirección, teléfono, contacto, horario, notas, proyecto y fotos. Se exportan a **Excel (CSV)**, **Google Earth (KML)** y GeoJSON. |
| **Más** | Mapa base, **turno y alertas** (cuadrantes asignados, zonas críticas, recorrido, pantalla encendida), **importar el KML de cámaras** de la estación, mapa sin señal, respaldo y otros KML. |
| **Capas** (botón en el mapa) | Cámaras de la Policía, del Metro, de fotodetección y de movilidad (con imagen pública), **mapa de calor de delitos** con filtros por tipo, año y día, cuadrantes de otras estaciones y recorrido. Importar delitos recientes desde CSV. |

**Alertas** (con la app abierta): al salir de tus cuadrantes asignados, al
entrar a una zona crítica, de riesgo u oscura que hayas dibujado y al pasar a
menos de 60 m de un punto crítico o de una luminaria dañada. Vibra dos veces y
la tarjeta de arriba se pone roja.

**Guiar**: flecha y distancia en vivo hasta el destino. Vibra al llegar.

**Cámaras**: estado en colores (operativa, con fallas, fuera de servicio).
Puedes marcar el estado y dejar notas en cada una. Si importas el KML de
cámaras de la estación, se cruzan por número con las de la Alcaldía. También
se exportan a CSV.

Cada lugar abre en **Google Maps**, **Cómo llegar** y **Street View**, y si tiene
teléfono, se puede llamar. Los lugares de OpenStreetMap se pueden **completar**
(teléfono, contacto, fotos): la app guarda tu versión sobre la original.

**Cómo registrar:** botón verde **Registrar** → elige *Lugar*, *Calle/carrera* o
*Zona*. Para un lugar, mueve el mapa hasta que la cruz quede encima (o toca «Mi
GPS») y confirma. Para calles y zonas, toca el mapa en cada esquina. La app
calcula sola el cuadrante y sugiere la dirección.

## Datos y privacidad

- El KML de cámaras de la estación, los estados marcados y las notas quedan
  **solo en el celular**. No están en este repositorio, que es público.
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
- `tools/descargar_alcaldia.py` y `tools/datos_alcaldia.py` actualizan
  `www/data/alcaldia.js` desde el servidor de mapas de la Alcaldía.
- `tools/kml_a_json.py` convierte el KML y `tools/osm_por_cuadrante.py` asigna
  calles, barrios, lugares y direcciones de OpenStreetMap a cada cuadrante
  (necesita las descargas de Overpass en `osm/`).
- La compilación usa Capacitor 7 (Android 6.0 en adelante, objetivo API 35).
