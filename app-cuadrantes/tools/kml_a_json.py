import re,json,sys
import xml.etree.ElementTree as ET
ns={'k':'http://www.opengis.net/kml/2.2'}
# El KML original declara xsi:schemaLocation sin el prefijo; se quita antes de leerlo.
t=ET.fromstring(re.sub(r'\s[a-zA-Z]+:schemaLocation="[^"]*"','',open(sys.argv[1],encoding='utf-8').read()).encode('utf-8'))
polys=[];pts=[]
for pm in t.iter('{http://www.opengis.net/kml/2.2}Placemark'):
    name=(pm.findtext('k:name',default='',namespaces=ns) or '').strip()
    desc=pm.findtext('k:description',default='',namespaces=ns) or ''
    attrs={}
    for k,v in re.findall(r'<td>([^<]*)</td>\s*<td>([^<]*)</td>',desc):
        if k.strip(): attrs[k.strip()]=v.strip()
    for p in pm.iter('{http://www.opengis.net/kml/2.2}Polygon'):
        rings=[]
        for c in p.iter('{http://www.opengis.net/kml/2.2}coordinates'):
            ring=[[round(float(a.split(',')[1]),6),round(float(a.split(',')[0]),6)] for a in c.text.split()]
            rings.append(ring)
        polys.append({'name':name,'attrs':attrs,'rings':rings})
    for p in pm.iter('{http://www.opengis.net/kml/2.2}Point'):
        a=p.findtext('k:coordinates',namespaces=ns).strip().split(',')
        pts.append({'name':name,'ll':[round(float(a[1]),6),round(float(a[0]),6)]})
print(json.dumps({'name':t.find('k:Document/k:name',ns).text,'polys':polys,'points':pts},separators=(',',':'),ensure_ascii=False))
