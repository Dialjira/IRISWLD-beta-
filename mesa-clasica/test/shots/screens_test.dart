// Genera capturas de las pantallas para revisión visual:
// flutter test test/shots --dart-define=SHOTS=/ruta/salida
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mesa_clasica/engine/game.dart';
import 'package:mesa_clasica/engine/knock_rummy.dart';
import 'package:mesa_clasica/engine/table_rummy.dart';
import 'package:mesa_clasica/engine/variants.dart';
import 'package:mesa_clasica/net/client.dart';
import 'package:mesa_clasica/ui/home_screen.dart';
import 'package:mesa_clasica/ui/table_screen.dart';
import 'package:mesa_clasica/ui/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../games_test.dart' show botTurn;

const out = String.fromEnvironment('SHOTS');

Future<void> loadFonts() async {
  Future<void> load(String family, String path) async {
    final loader = FontLoader(family)..addFont(File(path).readAsBytes().then((b) => ByteData.view(b.buffer)));
    await loader.load();
  }

  await load('Playfair', 'assets/fonts/PlayfairDisplay.ttf');
  await load('Nunito', 'assets/fonts/Nunito.ttf');
  final roboto =
      '${Platform.environment['FLUTTER_ROOT'] ?? '/opt/sdk/flutter'}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf';
  if (File(roboto).existsSync()) await load('MaterialIcons', roboto);
}

Future<void> shot(WidgetTester t, Widget w, String name) async {
  await t.pumpWidget(
    RepaintBoundary(
      key: const ValueKey('shot'),
      child: MaterialApp(debugShowCheckedModeBanner: false, theme: buildTheme(), home: w),
    ),
  );
  for (var i = 0; i < 20; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
  await t.runAsync(() async {
    final ro = t.renderObject<RenderRepaintBoundary>(find.byKey(const ValueKey('shot')));
    final img = await ro.toImage(pixelRatio: 1.5);
    final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
    File('$out/$name.png').writeAsBytesSync(bytes!.buffer.asUint8List());
  });
}

GameClient fakeClient(CardGame g, int seat, String variant, Map<String, int> opts) {
  final c = GameClient(hosts: const [], port: 0, name: 'x');
  c.lobby = {'started': true, 'options': opts, 'variant': variant};
  c.view = g.viewFor(seat);
  return c;
}

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({'name': 'Ana'});
    await loadFonts();
  });

  testWidgets('capturas', (t) async {
    if (out.isEmpty) return;
    t.view.physicalSize = const Size(1080, 2340);
    t.view.devicePixelRatio = 2.75;

    await shot(t, const HomeScreen(), '01_inicio');

    // Rummy colombiano a mitad de ronda, 4 jugadores.
    final v = variantById('colombiano');
    final g = v.create(['Ana', 'Beto', 'Caro', 'Dani'], v.defaults(), Random(3)) as TableRummy;
    var guard = 0;
    while (g.melds.length < 4 && guard++ < 400) {
      if (g.phase != Phase.draw && g.phase != Phase.play) {
        g.nextRound();
        continue;
      }
      botTurn(g);
    }
    while (g.current != 0 && g.phase == Phase.draw) {
      botTurn(g);
    }
    if (g.phase == Phase.draw) g.apply(0, {'type': 'drawStock'});
    final client = fakeClient(g, 0, 'colombiano', v.defaults());
    await shot(
      t,
      Scaffold(
        body: Felt(
          child: TableScreen(client: client, isHost: true, onLeave: () {}),
        ),
      ),
      '02_mesa_colombiano',
    );

    // Chinchón con baraja española.
    final vc = variantById('chinchon');
    final k = vc.create(['Ana', 'Beto', 'Caro'], vc.defaults(), Random(5)) as KnockRummy;
    k.current = 0;
    k.apply(0, {'type': 'drawStock'});
    await shot(
      t,
      Scaffold(
        body: Felt(
          child: TableScreen(client: fakeClient(k, 0, 'chinchon', vc.defaults()), isHost: false, onLeave: () {}),
        ),
      ),
      '03_mesa_chinchon',
    );

    // Resultado de ronda.
    if (g.phase == Phase.play) g.phase = Phase.draw;
    while (g.phase == Phase.draw || g.phase == Phase.play) {
      botTurn(g);
    }
    await shot(
      t,
      Scaffold(
        body: Felt(
          child: TableScreen(client: fakeClient(g, 0, 'colombiano', v.defaults()), isHost: true, onLeave: () {}),
        ),
      ),
      '04_resultado',
    );
  });
}
