#!/usr/bin/env bash
# Descarga de OpenStreetMap (Overpass) el área de los cuadrantes. Uso: bash tools/descargar_osm.sh
set -e
B='6.1925,-75.665,6.2500,-75.5755'; U=${OVERPASS:-https://overpass-api.de/api/interpreter}; mkdir -p osm
q() { for i in 1 2 3 4 5 6; do curl -sS -m 200 --data-urlencode "data=$2" "$U" -o "osm/$1.json" && head -c 20 "osm/$1.json" | grep -q '{' && return; sleep 8; done; echo "falló $1"; exit 1; }
q streets "[out:json][timeout:180];way[\"highway\"][\"name\"]($B);out tags geom;"
q pois "[out:json][timeout:180];(nwr[\"amenity\"]($B);nwr[\"shop\"]($B);nwr[\"office\"]($B);nwr[\"tourism\"]($B);nwr[\"leisure\"][\"name\"]($B);nwr[\"healthcare\"]($B);nwr[\"craft\"]($B);nwr[\"building\"][\"name\"]($B);nwr[\"historic\"]($B););out tags center;"
q places "[out:json][timeout:180];(nwr[\"place\"~\"neighbourhood|suburb|quarter|village|hamlet|locality\"]($B);relation[\"boundary\"=\"administrative\"][\"admin_level\"~\"8|9|10\"]($B););out tags center;"
q addr "[out:json][timeout:180];nwr[\"addr:street\"]($B);out tags center;"
echo "Listo. Luego: python3 tools/kml_a_json.py tools/BELEN_CUADRANTES.kml > belen.json && python3 tools/osm_por_cuadrante.py"
