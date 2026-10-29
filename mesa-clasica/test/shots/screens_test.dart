// Genera capturas de las pantallas para revisión visual:
// flutter test test/shots --dart-define=SHOTS=/ruta/salida
import 'dart:io';
import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mesa_clasica/engine/game.dart';
import 'package:mesa_clasica/engine/cards.dart';
import 'package:mesa_clasica/engine/knock_rummy.dart';
import 'package:mesa_clasica/engine/poker_rummy.dart';
import 'package:mesa_clasica/engine/table_rummy.dart';
import 'package:mesa_clasica/engine/variants.dart';
import 'package:mesa_clasica/net/client.dart';
import 'package:mesa_clasica/ui/home_screen.dart';
import 'package:mesa_clasica/ui/sfx.dart';
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
    // En pruebas no hay plugin de audio.
    Sfx.soundOn.value = false;
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

    // Póker colombiano: la mano de la foto, completa.
    final vp = variantById('poker');
    final pk = vp.create(['Ana', 'Beto', 'Caro'], vp.defaults(), Random(9)) as PokerRummy;
    var id = 500;
    PlayingCard pc(int r, Suit s) => PlayingCard(id++, s, r);
    final photo = [
      pc(6, Suit.treboles), pc(6, Suit.picas), pc(6, Suit.corazones), //
      pc(4, Suit.treboles), pc(4, Suit.corazones), pc(4, Suit.picas), //
      pc(13, Suit.corazones), pc(1, Suit.corazones), pc(2, Suit.corazones), //
      pc(7, Suit.picas), pc(8, Suit.picas), pc(9, Suit.picas), //
      pc(13, Suit.treboles), pc(13, Suit.diamantes), pc(13, Suit.picas),
    ];
    pk.current = 0;
    pk.phase = Phase.play;
    pk.seats[0].hand = [...photo];
    await shot(
      t,
      Scaffold(
        body: Felt(
          child: TableScreen(client: fakeClient(pk, 0, 'poker', vp.defaults()), isHost: true, onLeave: () {}),
        ),
      ),
      '05_poker_mano_completa',
    );

    // La mano de la captura del usuario: 51 en juegos y 4 sueltas, antes y después de robar.
    PlayingCard sc(int r, Suit s) => PlayingCard(id++, s, r);
    final shotHand = [
      sc(2, Suit.picas), sc(2, Suit.corazones), sc(2, Suit.treboles), //
      sc(5, Suit.picas), sc(5, Suit.diamantes), sc(5, Suit.treboles), //
      sc(6, Suit.treboles), sc(7, Suit.treboles), sc(8, Suit.treboles), sc(9, Suit.treboles), //
      sc(1, Suit.corazones), sc(9, Suit.corazones), sc(10, Suit.picas), sc(10, Suit.picas),
    ];
    for (final full in [0, 1]) {
      final o = {...vp.defaults(), 'full': full};
      final g2 = vp.create(['Daniel', 'Nathalia'], o, Random(4)) as PokerRummy;
      g2.current = 0;
      g2.phase = Phase.play;
      g2.seats[0].hand = [...shotHand, sc(12, Suit.diamantes)];
      await shot(
        t,
        Scaffold(
          body: Felt(
            child: TableScreen(client: fakeClient(g2, 0, 'poker', o), isHost: true, onLeave: () {}),
          ),
        ),
        full == 0 ? '07_poker_51_listo' : '08_poker_mano_completa_faltan',
      );
    }
    // Turno de robar, y el descarte es la carta que completa los 51.
    final o3 = vp.defaults();
    final g3 = vp.create(['Daniel', 'Nathalia'], o3, Random(4)) as PokerRummy;
    g3.current = 0;
    g3.phase = Phase.draw;
    g3.seats[0].hand = [...shotHand.sublist(0, 9), ...shotHand.sublist(10)];
    g3.discard = [sc(9, Suit.treboles)];
    await shot(
      t,
      Scaffold(
        body: Felt(
          child: TableScreen(client: fakeClient(g3, 0, 'poker', o3), isHost: true, onLeave: () {}),
        ),
      ),
      '09_poker_descarte_te_baja',
    );

    // Póker con pinchado: revisión de una bajada vista por otro jugador.
    final popts = {...vp.defaults(), 'pinch': 1};
    final pp = vp.create(['Ana', 'Beto', 'Caro'], popts, Random(9)) as PokerRummy;
    pp.current = 0;
    pp.phase = Phase.play;
    pp.seats[0].hand = [...photo];
    pp.apply(0, {
      'type': 'goDown',
      'groups': [
        for (var g = 0; g < 5; g++) [for (final c in photo.sublist(g * 3, g * 3 + 3)) c.id],
      ],
    });
    await shot(
      t,
      Scaffold(
        body: Felt(
          child: TableScreen(client: fakeClient(pp, 1, 'poker', popts), isHost: false, onLeave: () {}),
        ),
      ),
      '06_poker_revision_pinchar',
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
