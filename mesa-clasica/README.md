# Mesa Clásica

Juegos de mesa clásicos para Android, para 2 a 4 personas en la misma red
(WiFi o punto de acceso de un teléfono). No necesita PC ni internet: el
teléfono que crea la mesa es el servidor.

## Modalidades (familia Rummy / Remis)

- **Póker Colombiano**: 14 cartas; te bajas con ternas, cuartas o escaleras (con vuelta K-A-2)
  que sumen 51 o más, o, con la regla de mano completa, con las 15 cartas en juegos. Opcional:
  **pinchado** (la app deja pasar las faltas y los demás las cantan con «¡Pinchar!»).
- **La 51**: bajada de 51 y pegue a los juegos de la mesa, también con pinchado opcional.
- **Rummy Colombiano**: 2 barajas + 4 comodines, primera bajada mínima, cambio de comodín,
  "Rummy" paga doble, eliminación por puntos.
- **Remis Clásico**: 1 baraja, el que cierra cobra.
- **Continental**: 7 rondas con contrato y compra del descarte.
- **Rummy 500**: descarte a la vista, suma lo bajado y resta la mano.
- **Gin Rummy**: mano a mano, tocar, gin y undercut.
- **Chinchón**: baraja española de 40 o 48 cartas.

Las reglas de casa se eligen al crear la mesa. Detalle en `docs/`.

## Cómo jugar

1. Todos instalan el APK.
2. Uno toca **Crear mesa**: aparece un código de 4 letras y un QR.
3. Los demás tocan **Unirme a una mesa** y escanean el QR, escriben el código o
   eligen la mesa en "Mesas cerca".
4. El anfitrión elige la modalidad y toca **Repartir cartas**.

Si alguien pierde la conexión, la app se reconecta sola y recupera su puesto.

Sonido y vibración se activan o desactivan desde la pantalla de inicio. Los efectos de sonido
se generan con `python3 tool/gen_sfx.py` (sintetizados, sin licencias de terceros).

## Desarrollo

```bash
flutter pub get
flutter test test/melds_test.dart test/games_test.dart test/poker_test.dart test/server_test.dart test/ledger_test.dart
flutter build apk --release
```

- `lib/engine/`: reglas en Dart puro (con pruebas).
- `lib/net/`: servidor en el teléfono anfitrión (HTTP + WebSocket), anuncio UDP, cliente.
- `lib/ui/`: pantallas y cartas vectoriales.
- `test/shots/`: genera capturas: `flutter test test/shots --dart-define=SHOTS=/ruta`.

El flujo `.github/workflows/mesa-clasica-apk.yml` compila el APK en cada cambio y lo deja
como artefacto descargable en GitHub Actions.

Tipografías Playfair Display y Nunito bajo licencia SIL OFL (`assets/fonts/`).
