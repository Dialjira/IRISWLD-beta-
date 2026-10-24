# ArtCraft PDF — suite de documentos PDF para Android

App Android (APK) para crear, editar, organizar, traducir, reescribir y narrar documentos PDF desde el móvil.
Está hecha con Capacitor: la interfaz es web (pdf.js + pdf-lib) y usa los motores nativos de Android para la voz, compartir y guardar archivos.

## Funciones

| Área | Qué hace |
|---|---|
| **Abrir** | PDF del teléfono, de Drive o desde "Abrir con…" en cualquier app. PDF con contraseña: lectura, y luego "copia editable". |
| **Crear** | Documento nuevo escrito, dictado por voz o redactado con IA. Tamaños A4, Carta, Oficio, Legal y A5. |
| **Escanear** | Fotos con la cámara o de la galería, con filtros Gris / Documento / Blanco y negro → PDF. |
| **Editar** | Escribir texto encima, lápiz, resaltador, tapar (corrector blanco), recuadros, firma a mano (se guarda para reutilizarla) e imágenes. |
| **Páginas** | Girar, eliminar, duplicar, reordenar, extraer a un PDF nuevo, insertar página en blanco u otro PDF, dividir por rangos o cada N páginas, unir varios PDF. |
| **Texto** | Extraer y editar el texto, buscar, OCR para escaneos (español, inglés y otros idiomas, en el teléfono), crear un PDF nuevo con el texto reescrito. |
| **IA** | Traducir (20 idiomas), reescribir en 8 estilos, resumir, corregir, simplificar, ampliar, extraer datos clave, instrucción libre y chat "pregunta al documento". Con tu clave de Claude, Gemini, Groq u otra API compatible con OpenAI. |
| **Narrar** | Lee en voz alta el documento, el texto editado o la traducción, frase por frase, con resaltado, velocidad, tono e idioma. |
| **Más** | Marca de agua, numerar páginas, rellenar formularios, comprimir, exportar páginas a JPG, propiedades, duplicar, compartir y guardar en Documentos/ArtCraftPDF. |

Todo cambio se puede **deshacer** (botón ↶ arriba). Los PDF se guardan solo en el teléfono; a la IA solo se envía el texto que procesas.

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
```

Para regenerar el icono: `python3 scripts/make-icons.py`.
