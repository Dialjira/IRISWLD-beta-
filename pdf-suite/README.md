# ArtCraft PDF — suite de documentos PDF para Android

App Android (APK) para crear, editar, organizar, traducir, reescribir y narrar documentos PDF desde el móvil.
Está hecha con Capacitor: la interfaz es web (pdf.js + pdf-lib) y usa los motores nativos de Android para la voz, compartir y guardar archivos.

## Funciones

| Área | Qué hace |
|---|---|
| **Escáner (tipo TapScanner)** | Visor con guía de documento y láser de escaneo animado, detección automática de bordes, anillo de captura automática, animación de escaneo tras cada foto, linterna, cuadrícula y modos Documento / Lote / Tarjeta ID (anverso y reverso en una hoja) / **Pasaporte** (lee y verifica la zona MRZ) / Libro / A texto / QR y códigos de barras. **Retoque con IA** (Gemini) con comparador antes/después y nombre automático del documento con IA. Recorte manual con lupa, corrección de perspectiva, 7 filtros (Mejorado, Sin sombras, Gris, B/N, Ahorro de tinta, Vívido), brillo y contraste, girar, reordenar e importar de la galería. Guarda en PDF con **texto seleccionable (OCR)** o en JPG. |
| **Editar texto de cualquier PDF** | Detecta las líneas del documento (digital o escaneado mediante OCR); al tocar una se reescribe en el mismo sitio con un tamaño, color y tipo de letra parecidos. El texto antiguo se elimina del archivo, así que no reaparece al buscar ni al copiar. |
| **Traducir conservando el diseño** | Traduce página a página y escribe la traducción en el lugar del original (también en escaneos). |
| **IA (Gemini recomendado)** | Elige el mejor modelo según tu clave (modo automático, máxima calidad o más rápido), muestra la respuesta mientras se escribe, reintenta y pasa a otro modelo si uno está saturado. Traducir, reescribir, resumir, corregir, simplificar, extraer datos, preguntar al documento y leer escaneos difíciles o manuscritos. También funciona con Claude, Groq y APIs compatibles con OpenAI; el proveedor se detecta a partir de la clave. |
| **Anotar** | Texto, lápiz, resaltador, tapar, recuadros, firma reutilizable, sellos (APROBADO, PAGADO… con fecha), imágenes y **censura permanente**. |
| **Páginas** | Girar, eliminar, duplicar, reordenar, extraer, insertar, dividir y unir. |
| **Convertir y proteger** | PDF a Word (.docx), PDF buscable (OCR), contraseña AES-256, quitar contraseña o restricciones, comprimir, exportar a JPG, marca de agua, numeración, formularios y metadatos. |
| **Narrar y dictar** | Voz IA natural de Gemini (16 voces, acento latino) o la mejor voz del teléfono en español latinoamericano; resaltado de frases, velocidad, **audiolibro WAV**; dictado de documentos. |
| **Biblioteca** | Miniaturas, favoritos, filtros, orden, búsqueda y deshacer en cada cambio. Bloqueo de la app con **huella** o PIN. **Quitar contraseña** de PDF (con la contraseña o eliminando restricciones de edición). |

## Instalar la APK

1. Copia `ArtCraft-PDF.apk` al teléfono (o descárgala del artefacto de GitHub Actions).
2. Ábrela y permite "Instalar apps de origen desconocido" cuando Android lo pida.
3. Instala y abre **ArtCraft PDF**. Para usar la IA: Ajustes → pega tu clave → Probar.

## Desarrollo

Requisitos: Node 20+, JDK 21 y Android SDK (API 35).

```bash
npm install
npm test            # pruebas del motor PDF y utilidades de texto
npm run dev         # interfaz en el navegador
npm run apk         # build web + sync + APK de depuración en android/app/build/outputs/apk/debug/
```

Sin SDK local: el workflow `.github/workflows/pdf-suite-apk.yml` compila la APK en cada push y la deja como artefacto descargable.

Estructura:

```
src/main.js        inicio, biblioteca, crear, escanear, unir, ajustes
src/docview.js     pestañas del documento (ver, editar, páginas, texto, IA, narrar, más)
src/editor.js      editor visual de página y firma
src/lib/ops.js     operaciones PDF (pdf-lib)
src/lib/pdfview.js render y extracción de texto (pdf.js)
src/lib/ai.js      proveedores de IA y tareas
src/lib/voice.js   narración y dictado
src/lib/ocr.js     OCR (Tesseract, en el dispositivo)
src/lib/store.js   biblioteca local (IndexedDB)
src/lib/native.js  guardar, compartir y "Abrir con…" en Android
src/lib/gemini.js  selección de modelo, streaming, reintentos y respaldo de Gemini
src/lib/contentedit.js  borrado del texto original en el flujo de contenido del PDF
src/lib/docx-export.js PDF a Word
src/scanner/       escáner (cámara, OpenCV, filtros, modos)
src/textedit.js    edición de texto existente y traducción con diseño
```

Para regenerar el icono: `python3 scripts/make-icons.py`.
