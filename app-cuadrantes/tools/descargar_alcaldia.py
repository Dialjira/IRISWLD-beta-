"""Descarga capas públicas del servidor de mapas de la Alcaldía de Medellín a alc/*.json.
Uso: python3 tools/descargar_alcaldia.py   (luego tools/datos_alcaldia.py)"""
import json, os, time, urllib.request, urllib.parse
R = 'https://www.medellin.gov.co/servidormapas/rest/services/'
ENV = '-75.672,6.165,-75.565,6.26'
CAPAS = [  # (servicio, capa, archivo, campos)
    ('seguridad_defensa/VM_Policia_MAP5', 0, 'cctv', '*'), ('seguridad_defensa/VM_Policia_MAP5', 10, 'vmgcctv', '*'),
    ('seguridad_defensa/VM_Policia_MAP5', 2, 'cuadrantes', '*'), ('seguridad_defensa/VM_Policia_MAP5', 3, 'metro', '*'),
    ('seguridad_defensa/VM_Policia_MAP5', 5, 'fdt', '*'), ('seguridad_defensa/VM_Policia_MAP5', 7, 'cctvmov', '*'),
    *[('seguridad_defensa/VM_Indicador_Seguridad', i, n, '*') for i, n in enumerate(
        ['hurto2015', 'hurto2016', 'hurto2017', 'rina2015', 'rina2016', 'rina2017', 'homicidio2015', 'homicidio2016', 'homicidio2017'])],
    ('ServiciosCiudad/CartografiaBase_BN_Seguridad', 9, 'barrios', '*'),
    ('ServiciosCiudad/CartografiaBase_BN_Seguridad', 0, 'nomenclatura', 'objectid,via,placa,latitud,longitud'),
]
def get(url):
    for i in range(8):
        try:
            d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=150).read())
            if 'error' in d: raise RuntimeError(d['error'])
            return d
        except Exception as e:
            err = e; time.sleep(6)
    raise err
os.makedirs('alc', exist_ok=True)
for svc, layer, name, fields in CAPAS:
    out, off = [], 0
    while True:
        q = {'where': '1=1', 'outFields': fields, 'returnGeometry': 'false' if name == 'nomenclatura' else 'true', 'outSR': '4326', 'f': 'pjson',
             'resultOffset': off, 'resultRecordCount': 2000, 'orderByFields': 'objectid', 'geometry': ENV,
             'geometryType': 'esriGeometryEnvelope', 'inSR': '4326', 'spatialRel': 'esriSpatialRelIntersects'}
        d = get(f'{R}{svc}/MapServer/{layer}/query?' + urllib.parse.urlencode(q))
        f = d.get('features', []); out += f
        if not f or (not d.get('exceededTransferLimit') and len(f) < 1000): break
        off += len(f)
    json.dump(out, open(f'alc/{name}.json', 'w'), ensure_ascii=False); print(name, len(out))
