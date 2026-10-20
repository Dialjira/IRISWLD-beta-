# Cuadrantes Belén

App web (un solo archivo, `index.html`) para ver los cuadrantes del KML
`BELEN CUADRANTES` sobre un mapa y planear proyectos encima.

## Qué hace

- **Cuadrantes**: los 28 polígonos del KML con su número, coloreados por
  estación/CAI. Buscar por número, código o estación; filtrar por estación;
  ver área, perímetro y todos los campos del KML de cada cuadrante.
- **Proyectos**: crear proyectos (nombre, estado, color, descripción) y
  dibujar en el mapa **puntos, líneas (rutas) y áreas**. Cada elemento
  muestra su medida (m / km / ha) y en qué cuadrantes cae.
- **Exportar** cada proyecto a KML (Google Earth / My Maps) o GeoJSON, y
  hacer copia de seguridad de todo en JSON.
- **Importar** proyectos desde JSON, GeoJSON o KML.
- **Cargar KML**: reemplazar los cuadrantes por los polígonos de otro KML.
- Mapa base: calles, satélite u OpenStreetMap.

Los proyectos se guardan en el navegador (localStorage). Exporta para
moverlos a otro equipo.

## Uso

Abrir `cuadrantes/index.html` en el navegador (doble clic o GitHub Pages).
Necesita internet para la librería del mapa (Leaflet) y el mapa base.

Dibujo: elegir Punto, Línea o Área → tocar el mapa. En líneas y áreas,
doble clic o «Terminar» para cerrar; «Deshacer» quita el último vértice;
Esc cancela.
