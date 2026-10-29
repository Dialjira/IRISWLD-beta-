import 'dart:math';

import 'package:flutter/material.dart';

import '../engine/cards.dart';
import 'theme.dart';

const cardRatio = 0.70;

Color suitColor(Suit s) => switch (s) {
  Suit.corazones || Suit.diamantes => Palette.red,
  Suit.picas || Suit.treboles => Palette.ink,
  Suit.oros => const Color(0xFFC08A12),
  Suit.copas => const Color(0xFFB3202E),
  Suit.espadas => const Color(0xFF1F4E9C),
  Suit.bastos => const Color(0xFF2F7D32),
};

/// Dibuja el símbolo de un palo dentro de [rect].
void paintSuit(Canvas canvas, Rect rect, Suit suit, {Color? color}) {
  final c = color ?? suitColor(suit);
  final fill = Paint()
    ..color = c
    ..isAntiAlias = true;
  final w = rect.width, h = rect.height;
  Offset p(double x, double y) => Offset(rect.left + x * w, rect.top + y * h);
  switch (suit) {
    case Suit.corazones:
      final path = Path()
        ..moveTo(p(0.5, 0.95).dx, p(0.5, 0.95).dy)
        ..cubicTo(
          p(0.1, 0.62).dx,
          p(0.1, 0.62).dy,
          p(-0.08, 0.3).dx,
          p(-0.08, 0.3).dy,
          p(0.25, 0.1).dx,
          p(0.25, 0.1).dy,
        )
        ..cubicTo(p(0.4, 0.02).dx, p(0.4, 0.02).dy, p(0.5, 0.15).dx, p(0.5, 0.15).dy, p(0.5, 0.25).dx, p(0.5, 0.25).dy)
        ..cubicTo(p(0.5, 0.15).dx, p(0.5, 0.15).dy, p(0.6, 0.02).dx, p(0.6, 0.02).dy, p(0.75, 0.1).dx, p(0.75, 0.1).dy)
        ..cubicTo(p(1.08, 0.3).dx, p(1.08, 0.3).dy, p(0.9, 0.62).dx, p(0.9, 0.62).dy, p(0.5, 0.95).dx, p(0.5, 0.95).dy)
        ..close();
      canvas.drawPath(path, fill);
    case Suit.diamantes:
      final path = Path()
        ..moveTo(p(0.5, 0.02).dx, p(0.5, 0.02).dy)
        ..quadraticBezierTo(p(0.7, 0.3).dx, p(0.7, 0.3).dy, p(0.9, 0.5).dx, p(0.9, 0.5).dy)
        ..quadraticBezierTo(p(0.7, 0.7).dx, p(0.7, 0.7).dy, p(0.5, 0.98).dx, p(0.5, 0.98).dy)
        ..quadraticBezierTo(p(0.3, 0.7).dx, p(0.3, 0.7).dy, p(0.1, 0.5).dx, p(0.1, 0.5).dy)
        ..quadraticBezierTo(p(0.3, 0.3).dx, p(0.3, 0.3).dy, p(0.5, 0.02).dx, p(0.5, 0.02).dy)
        ..close();
      canvas.drawPath(path, fill);
    case Suit.picas:
      final path = Path()
        ..moveTo(p(0.5, 0.02).dx, p(0.5, 0.02).dy)
        ..cubicTo(
          p(0.85, 0.32).dx,
          p(0.85, 0.32).dy,
          p(1.08, 0.5).dx,
          p(1.08, 0.5).dy,
          p(0.82, 0.72).dx,
          p(0.82, 0.72).dy,
        )
        ..cubicTo(
          p(0.68, 0.82).dx,
          p(0.68, 0.82).dy,
          p(0.55, 0.74).dx,
          p(0.55, 0.74).dy,
          p(0.52, 0.68).dx,
          p(0.52, 0.68).dy,
        )
        ..lineTo(p(0.62, 0.98).dx, p(0.62, 0.98).dy)
        ..lineTo(p(0.38, 0.98).dx, p(0.38, 0.98).dy)
        ..lineTo(p(0.48, 0.68).dx, p(0.48, 0.68).dy)
        ..cubicTo(
          p(0.45, 0.74).dx,
          p(0.45, 0.74).dy,
          p(0.32, 0.82).dx,
          p(0.32, 0.82).dy,
          p(0.18, 0.72).dx,
          p(0.18, 0.72).dy,
        )
        ..cubicTo(
          p(-0.08, 0.5).dx,
          p(-0.08, 0.5).dy,
          p(0.15, 0.32).dx,
          p(0.15, 0.32).dy,
          p(0.5, 0.02).dx,
          p(0.5, 0.02).dy,
        )
        ..close();
      canvas.drawPath(path, fill);
    case Suit.treboles:
      final r = w * 0.21;
      canvas.drawCircle(p(0.5, 0.26), r, fill);
      canvas.drawCircle(p(0.27, 0.56), r, fill);
      canvas.drawCircle(p(0.73, 0.56), r, fill);
      canvas.drawCircle(p(0.5, 0.5), r * 0.6, fill);
      final stem = Path()
        ..moveTo(p(0.47, 0.55).dx, p(0.47, 0.55).dy)
        ..lineTo(p(0.36, 0.98).dx, p(0.36, 0.98).dy)
        ..lineTo(p(0.64, 0.98).dx, p(0.64, 0.98).dy)
        ..lineTo(p(0.53, 0.55).dx, p(0.53, 0.55).dy)
        ..close();
      canvas.drawPath(stem, fill);
    case Suit.oros:
      final center = p(0.5, 0.5);
      final r = min(w, h) * 0.46;
      canvas.drawCircle(
        center,
        r,
        Paint()
          ..shader = RadialGradient(
            colors: [const Color(0xFFFFE08A), c, const Color(0xFF8A5F08)],
            stops: const [0, 0.7, 1],
          ).createShader(Rect.fromCircle(center: center, radius: r)),
      );
      final ring = Paint()
        ..color = const Color(0xFF7A5205)
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.09;
      canvas.drawCircle(center, r * 0.72, ring);
      for (var i = 0; i < 8; i++) {
        final a = i * pi / 4;
        canvas.drawCircle(
          center + Offset(cos(a), sin(a)) * r * 0.4,
          r * 0.08,
          Paint()..color = const Color(0xFF7A5205),
        );
      }
    case Suit.copas:
      final bowl = Path()
        ..moveTo(p(0.12, 0.12).dx, p(0.12, 0.12).dy)
        ..lineTo(p(0.88, 0.12).dx, p(0.88, 0.12).dy)
        ..cubicTo(
          p(0.88, 0.45).dx,
          p(0.88, 0.45).dy,
          p(0.7, 0.58).dx,
          p(0.7, 0.58).dy,
          p(0.56, 0.6).dx,
          p(0.56, 0.6).dy,
        )
        ..lineTo(p(0.56, 0.8).dx, p(0.56, 0.8).dy)
        ..lineTo(p(0.78, 0.92).dx, p(0.78, 0.92).dy)
        ..lineTo(p(0.22, 0.92).dx, p(0.22, 0.92).dy)
        ..lineTo(p(0.44, 0.8).dx, p(0.44, 0.8).dy)
        ..lineTo(p(0.44, 0.6).dx, p(0.44, 0.6).dy)
        ..cubicTo(
          p(0.3, 0.58).dx,
          p(0.3, 0.58).dy,
          p(0.12, 0.45).dx,
          p(0.12, 0.45).dy,
          p(0.12, 0.12).dx,
          p(0.12, 0.12).dy,
        )
        ..close();
      canvas.drawPath(bowl, fill);
      canvas.drawRect(
        Rect.fromLTRB(p(0.12, 0.12).dx, p(0, 0.12).dy, p(0.88, 0).dx, p(0, 0.2).dy),
        Paint()..color = const Color(0xFFE6C068),
      );
    case Suit.espadas:
      final blade = Path()
        ..moveTo(p(0.5, 0.0).dx, p(0.5, 0.0).dy)
        ..lineTo(p(0.6, 0.12).dx, p(0.6, 0.12).dy)
        ..lineTo(p(0.58, 0.66).dx, p(0.58, 0.66).dy)
        ..lineTo(p(0.42, 0.66).dx, p(0.42, 0.66).dy)
        ..lineTo(p(0.4, 0.12).dx, p(0.4, 0.12).dy)
        ..close();
      canvas.drawPath(blade, fill);
      final gold = Paint()..color = const Color(0xFFD4A33A);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTRB(p(0.16, 0).dx, p(0, 0.66).dy, p(0.84, 0).dx, p(0, 0.74).dy),
          Radius.circular(w * 0.04),
        ),
        gold,
      );
      canvas.drawRect(Rect.fromLTRB(p(0.45, 0).dx, p(0, 0.74).dy, p(0.55, 0).dx, p(0, 0.9).dy), fill);
      canvas.drawCircle(p(0.5, 0.94), w * 0.07, gold);
    case Suit.bastos:
      canvas.save();
      canvas.translate(p(0.5, 0.5).dx, p(0.5, 0.5).dy);
      canvas.rotate(-0.4);
      final club = Path()
        ..moveTo(-w * 0.08, h * 0.48)
        ..quadraticBezierTo(0, h * 0.53, w * 0.08, h * 0.48)
        ..lineTo(w * 0.15, -h * 0.05)
        ..quadraticBezierTo(w * 0.27, -h * 0.42, 0, -h * 0.5)
        ..quadraticBezierTo(-w * 0.27, -h * 0.42, -w * 0.15, -h * 0.05)
        ..close();
      canvas.drawPath(
        club,
        Paint()
          ..shader = const LinearGradient(colors: [Color(0xFFB07A3E), Color(0xFF7A4B1E), Color(0xFF5A3412)])
              .createShader(Rect.fromCenter(center: Offset.zero, width: w * 0.5, height: h)),
      );
      final knot = Paint()..color = c;
      for (final k in [Offset(w * 0.1, -h * 0.28), Offset(-w * 0.11, -h * 0.08), Offset(w * 0.07, h * 0.14)]) {
        canvas.drawCircle(k, w * 0.075, knot);
        canvas.drawCircle(k, w * 0.03, Paint()..color = const Color(0xFF5A3412));
      }
      // Hojas
      final leaf = Paint()..color = c;
      canvas.drawOval(Rect.fromCenter(center: Offset(-w * 0.2, -h * 0.36), width: w * 0.2, height: w * 0.1), leaf);
      canvas.drawOval(Rect.fromCenter(center: Offset(w * 0.22, -h * 0.2), width: w * 0.2, height: w * 0.1), leaf);
      canvas.restore();
  }
}

/// Carta boca arriba o boca abajo, dibujada en vector.
class CardView extends StatelessWidget {
  final PlayingCard? card;
  final double width;
  final bool selected;
  final bool dimmed;
  final bool glow;

  /// Marca de aviso (p. ej. carta suelta que no está en ningún juego).
  final bool warn;

  const CardView({
    super.key,
    required this.card,
    this.width = 60,
    this.selected = false,
    this.dimmed = false,
    this.glow = false,
    this.warn = false,
  });

  const CardView.back({super.key, this.width = 60})
    : card = null,
      selected = false,
      dimmed = false,
      glow = false,
      warn = false;

  @override
  Widget build(BuildContext context) {
    final h = width / cardRatio;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      width: width,
      height: h,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(width * 0.1),
        boxShadow: [
          BoxShadow(
            color: selected || glow ? Palette.gold.withValues(alpha: 0.75) : Colors.black.withValues(alpha: 0.45),
            blurRadius: selected || glow ? 14 : 6,
            spreadRadius: selected || glow ? 1 : 0,
            offset: Offset(0, selected ? 6 : 2),
          ),
        ],
      ),
      foregroundDecoration: dimmed
          ? BoxDecoration(color: Colors.black.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(width * 0.1))
          : warn
          ? BoxDecoration(
              borderRadius: BorderRadius.circular(width * 0.1),
              border: Border.all(color: const Color(0xFFFF9F43), width: 3),
              color: const Color(0x22FF9F43),
            )
          : null,
      child: CustomPaint(painter: card == null ? _BackPainter() : _FacePainter(card!), size: Size(width, h)),
    );
  }
}

class _FacePainter extends CustomPainter {
  final PlayingCard card;
  _FacePainter(this.card);

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final rr = RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(w * 0.1));
    canvas.drawRRect(
      rr,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFFFFFF), Palette.ivory, Color(0xFFF1E8D2)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawRRect(
      rr.deflate(0.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = const Color(0x33000000),
    );
    if (card.isJoker) return _joker(canvas, size);

    final suit = card.suit!;
    final color = suitColor(suit);
    final label = card.rankLabel;
    _corner(canvas, size, label, suit, color);
    canvas.save();
    canvas.translate(w, h);
    canvas.rotate(pi);
    _corner(canvas, size, label, suit, color);
    canvas.restore();

    final isFace = suit.isSpanish ? card.rank >= 10 : card.rank >= 11;
    if (isFace) {
      final panel = Rect.fromLTRB(w * 0.24, h * 0.17, w * 0.76, h * 0.83);
      final prr = RRect.fromRectAndRadius(panel, Radius.circular(w * 0.06));
      canvas.drawRRect(
        prr,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [color.withValues(alpha: 0.10), color.withValues(alpha: 0.22)],
          ).createShader(panel),
      );
      canvas.drawRRect(
        prr,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = w * 0.025
          ..color = Palette.goldDeep,
      );
      _text(canvas, label, Offset(w / 2, h * 0.42), w * 0.42, color, display: true);
      paintSuit(canvas, Rect.fromCenter(center: Offset(w / 2, h * 0.66), width: w * 0.26, height: w * 0.26), suit);
    } else {
      final s = card.rank == 1 ? w * 0.52 : w * 0.40;
      paintSuit(canvas, Rect.fromCenter(center: Offset(w / 2, h / 2), width: s, height: s), suit);
      if (card.rank != 1 && w >= 44) {
        _text(canvas, label, Offset(w / 2, h * 0.5), w * 0.2, Colors.white.withValues(alpha: 0.9), display: true);
      }
    }
  }

  void _corner(Canvas canvas, Size size, String label, Suit suit, Color color) {
    final w = size.width;
    _text(canvas, label, Offset(w * 0.17, w * 0.2), w * 0.27, color, display: true);
    paintSuit(canvas, Rect.fromCenter(center: Offset(w * 0.17, w * 0.47), width: w * 0.17, height: w * 0.17), suit);
  }

  void _joker(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final inner = RRect.fromRectAndRadius(
      Rect.fromLTRB(w * 0.08, h * 0.06, w * 0.92, h * 0.94),
      Radius.circular(w * 0.07),
    );
    canvas.drawRRect(
      inner,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF4A1E6E), Color(0xFF7B2C8F), Color(0xFF2B1446)],
        ).createShader(inner.outerRect),
    );
    final star = Path();
    final c = Offset(w / 2, h * 0.45);
    for (var i = 0; i < 10; i++) {
      final r = i.isEven ? w * 0.3 : w * 0.13;
      final a = -pi / 2 + i * pi / 5;
      final pt = c + Offset(cos(a), sin(a)) * r;
      i == 0 ? star.moveTo(pt.dx, pt.dy) : star.lineTo(pt.dx, pt.dy);
    }
    star.close();
    canvas.drawPath(
      star,
      Paint()
        ..shader = const LinearGradient(colors: [Color(0xFFFFF0B3), Palette.gold, Palette.goldDeep])
            .createShader(Rect.fromCircle(center: c, radius: w * 0.3)),
    );
    _text(canvas, 'COMODÍN', Offset(w / 2, h * 0.78), w * 0.13, Palette.gold, display: false);
  }

  void _text(Canvas canvas, String t, Offset center, double size, Color color, {required bool display}) {
    final tp = TextPainter(
      text: TextSpan(
        text: t,
        style: TextStyle(
          fontFamily: display ? 'Playfair' : 'Nunito',
          fontSize: size,
          color: color,
          fontWeight: FontWeight.w800,
          fontVariations: const [FontVariation('wght', 800)],
          height: 1,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, center - Offset(tp.width / 2, tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _FacePainter old) => old.card != card;
}

class _BackPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final rr = RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(w * 0.1));
    canvas.drawRRect(rr, Paint()..color = Palette.ivory);
    final inner = rr.deflate(w * 0.06);
    canvas.save();
    canvas.clipRRect(inner);
    canvas.drawRRect(
      inner,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF8E1B2C), Palette.wine, Color(0xFF3F0A15)],
        ).createShader(inner.outerRect),
    );
    final line = Paint()
      ..color = Palette.gold.withValues(alpha: 0.35)
      ..strokeWidth = max(0.6, w * 0.012);
    final step = w * 0.16;
    for (var x = -h; x < w + h; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x + h, h), line);
      canvas.drawLine(Offset(x + h, 0), Offset(x, h), line);
    }
    canvas.restore();
    canvas.drawRRect(
      inner,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = max(1, w * 0.02)
        ..color = Palette.gold,
    );
    final c = Offset(w / 2, h / 2);
    canvas.drawCircle(c, w * 0.2, Paint()..color = Palette.wine);
    canvas.drawCircle(
      c,
      w * 0.2,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = max(1, w * 0.025)
        ..color = Palette.gold,
    );
    final tp = TextPainter(
      text: TextSpan(
        text: 'MC',
        style: TextStyle(
          fontFamily: 'Playfair',
          fontSize: w * 0.17,
          color: Palette.gold,
          fontWeight: FontWeight.w800,
          fontVariations: const [FontVariation('wght', 800)],
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, c - Offset(tp.width / 2, tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
