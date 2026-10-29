// Genera el ícono de la app en todas las densidades:
// flutter test test/shots/icon_test.dart --dart-define=ICON=true
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mesa_clasica/engine/cards.dart';
import 'package:mesa_clasica/ui/card_view.dart';
import 'package:mesa_clasica/ui/theme.dart';

import 'screens_test.dart' show loadFonts;

const enabled = bool.fromEnvironment('ICON');

class AppIcon extends StatelessWidget {
  final bool round;
  const AppIcon({super.key, this.round = false});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(round ? 256 : 96),
      child: Container(
        width: 512,
        height: 512,
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0, -0.3),
            radius: 1,
            colors: [Palette.feltLight, Palette.felt, Palette.feltDeep],
          ),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Transform.translate(
              offset: const Offset(-70, 20),
              child: Transform.rotate(
                angle: -0.3,
                child: const CardView(card: PlayingCard(1, Suit.corazones, 1), width: 190),
              ),
            ),
            Transform.translate(
              offset: const Offset(70, 20),
              child: Transform.rotate(
                angle: 0.3,
                child: const CardView(card: PlayingCard(2, Suit.oros, 1), width: 190),
              ),
            ),
            Transform.translate(
              offset: const Offset(0, -6),
              child: const CardView(card: PlayingCard(3, Suit.picas, 1), width: 200),
            ),
          ],
        ),
      ),
    );
  }
}

void main() {
  setUpAll(loadFonts);

  testWidgets('ícono', (t) async {
    if (!enabled) return;
    t.view.physicalSize = const Size(512, 512);
    t.view.devicePixelRatio = 1;
    const sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192};
    for (final round in [false, true]) {
      await t.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Center(
            child: RepaintBoundary(
              key: const ValueKey('icon'),
              child: AppIcon(round: round),
            ),
          ),
        ),
      );
      await t.pump();
      await t.runAsync(() async {
        final ro = t.renderObject<RenderRepaintBoundary>(find.byKey(const ValueKey('icon')));
        for (final e in sizes.entries) {
          final img = await ro.toImage(pixelRatio: e.value / 512);
          final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
          final name = round ? 'ic_launcher_round.png' : 'ic_launcher.png';
          File('android/app/src/main/res/mipmap-${e.key}/$name').writeAsBytesSync(bytes!.buffer.asUint8List());
        }
        final big = await ro.toImage(pixelRatio: 1);
        final bytes = await big.toByteData(format: ui.ImageByteFormat.png);
        if (!round) File('assets/icon-512.png').writeAsBytesSync(bytes!.buffer.asUint8List());
      });
    }
  });
}
