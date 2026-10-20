/* Íconos y catálogo de categorías de lugares y cámaras.
   Cada ícono es un trazo SVG de 24×24 pensado para verse blanco sobre un círculo de color. */
(function(root){
'use strict';
const P={ // trazos (stroke) — se dibujan con stroke="currentColor"
  banco:'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3z',
  cajero:'M4 5h16v14H4zM8 15h8M12 8v4M10 9.5c0-1 4-1 4 0s-4 1-4 2 4 1 4 0',
  giros:'M4 8h13l-3-3M20 16H7l3 3',
  ferreteria:'M14 4l6 6-3 3-6-6zM11 7L4 18l2 2 11-7',
  supermercado:'M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01',
  tienda:'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  licorera:'M10 3h4v4l2 3v11H8V10l2-3zM8 13h8',
  bar:'M5 4h14l-7 8zM12 12v8M8 20h8',
  panaderia:'M4 14c0-5 3.5-8 8-8s8 3 8 8v4H4zM9 9.5v4M12 8.5v5M15 9.5v4',
  cafe:'M4 9h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM16 11h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3',
  comida_rapida:'M4 11c0-4 3.5-6 8-6s8 2 8 6zM3 14h18M5 17h14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2',
  restaurante:'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 8h3v10',
  hospital:'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  farmacia:'M9.5 4.5l10 10a3.5 3.5 0 0 1-5 5l-10-10a3.5 3.5 0 0 1 5-5zM7 12l5-5',
  salud:'M3 12h4l2-5 4 10 2-5h6',
  colegio:'M3 9l9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5',
  universidad:'M2 9l10-5 10 5-10 5zM6 11v5c3.5 2.5 8.5 2.5 12 0v-5M22 9v6',
  biblioteca:'M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-1 2.5 15-3.5 1z',
  iglesia:'M12 2v6M9.5 4.5h5M5 21V12l7-4 7 4v9zM10 21v-4h4v4',
  hotel:'M3 20V8M3 14h18v6M21 14v-3a3 3 0 0 0-3-3h-7v6M7 11.5h.01',
  gasolinera:'M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M5 10h9M14 8h2l3 3v6a1.5 1.5 0 0 1-3 0v-3h-2',
  parqueadero:'M8 20V4h5a4 4 0 0 1 0 8H8',
  taller:'M14.5 4.5a4 4 0 0 0-5 5L4 15l5 5 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-3z',
  repuestos:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  centro_comercial:'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  gimnasio:'M2 12h2M20 12h2M6 7v10M18 7v10M4 9v6M20 9v6M6 12h12',
  cancha:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8l4 3-1.5 4.5h-5L8 11zM12 3v5M21 11l-5 0M3 11h5M8.5 15.5L6 19.5M15.5 15.5l2.5 4',
  parque:'M12 3l5 7h-3l4 6H6l4-6H7zM12 16v5',
  belleza:'M6 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8.5 8.5L20 19M8.5 15.5L20 5',
  ropa:'M8 3l4 3 4-3 5 4-3 3v11H6V10L3 7z',
  celulares:'M7 2h10v20H7zM11 18h2',
  mascotas:'M12 13c-3 0-6 3-6 5.5S9 21 12 19.5 18 21 18 18.5 15 13 12 13zM6 9a1.8 2.2 0 1 0 .01 0M18 9a1.8 2.2 0 1 0 .01 0M9.5 5a1.8 2.2 0 1 0 .01 0M14.5 5a1.8 2.2 0 1 0 .01 0',
  papeleria:'M4 20l1-5L16 4l4 4L9 19zM14 6l4 4',
  muebles:'M4 18v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6M2 13h3v5h14v-5h3M6 18v2M18 18v2M7 10V7h10v3',
  gobierno:'M5 21V4M5 4h12l-2 4 2 4H5',
  policia:'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z',
  transporte:'M5 4h14v12H5zM5 11h14M7 19v-3M17 19v-3M8 14h.01M16 14h.01',
  oficina:'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
  industria:'M3 21V10l5 3V10l5 3V10l5 3V4h3v17z',
  edificio:'M5 21V3h14v18M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3',
  comercio:'M3 9l2-5h14l2 5M3 9c0 2 4 2 4.5 0 .5 2 4 2 4.5 0 .5 2 4 2 4.5 0 .5 2 4.5 2 4.5 0M5 11v9h14v-9',
  servicios:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8',
  otros:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  conviva:'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5zM17 3l.7 1.6L19.3 5l-1.6.7L17 7.3l-.7-1.6L14.7 5l1.6-.4z',
  // cámaras
  cam_ptz:'M4 9h16M6 9a6 6 0 0 0 12 0M12 12a1.5 1.5 0 1 0 .01 0M12 4v5',
  cam_fija:'M3 7l13 4-2 5-12-4zM16 11l4 1-1 3-4-1M6 13l-1 6H2',
  cam_lpr:'M3 7h18v10H3zM6 10.5h1.5M9 10.5h1.5M13 10.5h1.5M16.5 10.5H18M6 13.5h12',
  cam_multi:'M7 8a3 3 0 1 0 .01 0M17 8a3 3 0 1 0 .01 0M12 15a3 3 0 1 0 .01 0',
  cam_facial:'M12 3a6 7 0 1 0 .01 0M9.5 9h.01M14.5 9h.01M9.5 13c1.5 1.3 3.5 1.3 5 0M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4',
  cam_analitica:'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 .01 0',
  cam_metro:'M5 20V5l7 9 7-9v15',
  cam_fdt:'M4 16a8 8 0 1 1 16 0M12 16l4-5M8 16h8',
  cam_mov:'M9 2h6v20H9zM12 6a1.5 1.5 0 1 0 .01 0M12 11a1.5 1.5 0 1 0 .01 0M12 16a1.5 1.5 0 1 0 .01 0',
  cam_mia:'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3 3 0 1 0 .01 0'
};
// Catálogo de lugares: clave → [etiqueta, color, grupo]
const CAT={
  banco:['Banco','#0C8599','finanzas'],cajero:['Cajero automático','#0C8599','finanzas'],giros:['Giros / corresponsal','#15AABF','finanzas'],
  ferreteria:['Ferretería','#E67700','comercio'],supermercado:['Supermercado','#2F9E44','comercio'],tienda:['Tienda / minimercado','#37B24D','comercio'],
  licorera:['Licorera','#9C36B5','comida'],bar:['Bar / discoteca','#862E9C','comida'],panaderia:['Panadería','#D9480F','comida'],cafe:['Café / heladería','#A0522D','comida'],
  comida_rapida:['Comidas rápidas','#F76707','comida'],restaurante:['Restaurante','#E8590C','comida'],
  hospital:['Hospital / clínica','#C92A2A','salud'],farmacia:['Farmacia / droguería','#E03131','salud'],salud:['Consultorio / salud','#F03E3E','salud'],
  colegio:['Colegio','#1971C2','educacion'],universidad:['Universidad / instituto','#1864AB','educacion'],biblioteca:['Biblioteca','#1C7ED6','educacion'],
  iglesia:['Iglesia','#7048E8','religion'],hotel:['Hotel / motel / hospedaje','#D6336C','comercio'],
  gasolinera:['Estación de servicio','#495057','transporte'],parqueadero:['Parqueadero','#495057','transporte'],taller:['Taller / lavadero','#5C677D','transporte'],
  repuestos:['Motos, carros y repuestos','#5C677D','transporte'],transporte:['Transporte','#364FC7','transporte'],
  centro_comercial:['Centro comercial','#2B8A3E','comercio'],gimnasio:['Gimnasio','#66A80F','recreacion'],cancha:['Cancha / escenario deportivo','#5C940D','recreacion'],
  parque:['Parque','#2F9E44','recreacion'],belleza:['Peluquería / belleza','#E64980','comercio'],ropa:['Ropa y calzado','#C2255C','comercio'],
  celulares:['Celulares y tecnología','#4263EB','comercio'],mascotas:['Mascotas / veterinaria','#A47148','comercio'],papeleria:['Papelería / impresión','#3B5BDB','comercio'],
  muebles:['Muebles y hogar','#B08968','comercio'],comercio:['Otro comercio','#40C057','comercio'],
  gobierno:['Entidad pública','#364FC7','seguridad'],policia:['Policía / bomberos','#1D3D8F','seguridad'],
  oficina:['Oficina / empresa','#7048E8','oficinas'],industria:['Industria / bodega','#868E96','oficinas'],edificio:['Edificio / unidad','#A47148','edificios'],
  servicios:['Servicios','#868E96','otros'],otros:['Otro','#868E96','otros'],conviva:['Convive la Noche','#5F3DC4','comida']
};
// Las categorías de los registros propios usan el mismo ícono.
const REC_ICON={negocio:'tienda',local:'comercio',empresa:'oficina',residencia:'edificio',unidad:'edificio',comida:'restaurante',educacion:'colegio',salud:'salud',
  banco:'banco',iglesia:'iglesia',publico:'gobierno',parque:'parque',transporte:'taller',critico:'otros',camara:'cam_mia',luminaria:'otros',policia:'policia',otro:'otros'};
function camIcon(c){
  const t=(c.tipo||'').toLowerCase();
  if(c.src==='metro')return'cam_metro';if(c.src==='fdt')return'cam_fdt';if(c.src==='mov')return'cam_mov';if(c.src==='rec'||c.src==='kml')return t.includes('lpr')?'cam_lpr':t.includes('ptz')?'cam_ptz':'cam_mia';
  if(t.includes('lpr'))return'cam_lpr';if(t.includes('multi'))return'cam_multi';if(t.includes('facial'))return'cam_facial';
  if(t.includes('analit')||t.includes('citra'))return'cam_analitica';if(t.includes('soterrado'))return'cam_fija';return'cam_ptz';
}
const CAM_TYPE_NAME={cam_ptz:'PTZ o fija',cam_fija:'Soterrado',cam_lpr:'Lectura de placas (LPR)',cam_multi:'Multisensor',cam_facial:'Reconocimiento facial',cam_analitica:'Analítica / CITRA',
  cam_metro:'Metro',cam_fdt:'Fotodetección',cam_mov:'Movilidad',cam_mia:'Registrada por mí'};
const svg=(k,size=14,sw=2)=>`<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${P[k]||P.otros}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
root.ICONOS={P,CAT,REC_ICON,camIcon,CAM_TYPE_NAME,svg};
})(window);
