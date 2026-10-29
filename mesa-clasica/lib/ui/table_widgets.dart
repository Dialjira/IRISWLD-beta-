import 'dart:math';

import 'package:flutter/material.dart';

import '../engine/cards.dart';
import 'card_view.dart';
import 'theme.dart';

List<PlayingCard> cardsOf(dynamic j) => [for (final x in (j as List? ?? const [])) PlayingCard.fromJson(x as List)];

/// Fila de cartas superpuestas (juegos de la mesa, manos reveladas).
class CardRow extends StatelessWidget {
  final List<PlayingCard> cards;
  final double cardWidth;
  final double overlap;
  const CardRow({super.key, required this.cards, this.cardWidth = 34, this.overlap = 0.5});

  @override
  Widget build(BuildContext context) {
    if (cards.isEmpty) return SizedBox(height: cardWidth / cardRatio);
    final step = cardWidth * (1 - overlap);
    return SizedBox(
      width: cardWidth + step * (cards.length - 1),
      height: cardWidth / cardRatio,
      child: Stack(
        children: [
          for (var i = 0; i < cards.length; i++)
            Positioned(
              left: i * step,
              child: CardView(card: cards[i], width: cardWidth),
            ),
        ],
      ),
    );
  }
}

/// Insignia de un jugador: avatar, nombre, cartas, puntos y turno.
class PlayerBadge extends StatefulWidget {
  final int seat;
  final Map<String, dynamic> player;
  final bool active;
  final String? emote;
  final bool compact;
  const PlayerBadge({
    super.key,
    required this.seat,
    required this.player,
    required this.active,
    this.emote,
    this.compact = false,
  });

  @override
  State<PlayerBadge> createState() => _PlayerBadgeState();
}

class _PlayerBadgeState extends State<PlayerBadge> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.player;
    final color = Palette.seats[widget.seat % 4];
    final out = p['eliminated'] == true;
    final offline = p['connected'] == false;
    final name = p['name'] as String;
    return Opacity(
      opacity: out ? 0.45 : 1,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.topCenter,
        children: [
          AnimatedBuilder(
            animation: _pulse,
            builder: (context, child) => Container(
              padding: const EdgeInsets.fromLTRB(8, 8, 10, 8),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: widget.active ? 0.38 : 0.24),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: widget.active ? color : Colors.white12, width: widget.active ? 2 : 1),
                boxShadow: widget.active
                    ? [BoxShadow(color: color.withValues(alpha: 0.25 + 0.35 * _pulse.value), blurRadius: 18)]
                    : null,
              ),
              child: child,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    CircleAvatar(
                      radius: 17,
                      backgroundColor: color,
                      child: Text(name.characters.first.toUpperCase(), style: display(17, color: Palette.ink)),
                    ),
                    if (p['melded'] == true)
                      const Positioned(
                        right: -4,
                        bottom: -4,
                        child: CircleAvatar(
                          radius: 8,
                          backgroundColor: Palette.feltLight,
                          child: Icon(Icons.check_rounded, size: 12, color: Colors.white),
                        ),
                      ),
                  ],
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: widget.compact ? 70 : 110),
                      child: Text(name, overflow: TextOverflow.ellipsis, style: body(13.5, weight: 800)),
                    ),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.style_rounded, size: 13, color: Palette.gold),
                        Text(' ${p['count']}', style: body(12.5, color: Palette.gold, weight: 800)),
                        const SizedBox(width: 8),
                        Text(
                          '${p['score']} pts',
                          style: body(12, color: Palette.ivory.withValues(alpha: 0.75), weight: 700),
                        ),
                        if (offline) ...[
                          const SizedBox(width: 6),
                          const Icon(Icons.wifi_off_rounded, size: 13, color: Palette.red),
                        ],
                      ],
                    ),
                    if (out) Text('Eliminado', style: body(11, color: Palette.red, weight: 800)),
                  ],
                ),
              ],
            ),
          ),
          if (widget.emote != null) Positioned(top: -30, child: EmoteBubble(text: widget.emote!)),
        ],
      ),
    );
  }
}

class EmoteBubble extends StatelessWidget {
  final String text;
  const EmoteBubble({super.key, required this.text});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      key: ValueKey(text),
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 380),
      curve: Curves.elasticOut,
      builder: (context, t, child) => Transform.scale(scale: t, child: child),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: Palette.ivory,
          borderRadius: BorderRadius.circular(14),
          boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 8)],
        ),
        child: Text(text, style: body(16, color: Palette.ink, weight: 800)),
      ),
    );
  }
}

/// Mazo boca abajo con contador.
class StockPile extends StatelessWidget {
  final int count;
  final bool glow;
  final double width;
  final VoidCallback? onTap;
  const StockPile({super.key, required this.count, this.glow = false, this.width = 62, this.onTap});

  @override
  Widget build(BuildContext context) {
    final layers = min(4, (count / 8).ceil());
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: width + 8,
            height: width / cardRatio + 8,
            child: Stack(
              children: [
                if (count == 0)
                  Container(
                    width: width,
                    height: width / cardRatio,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(width * 0.1),
                      border: Border.all(color: Colors.white24, width: 1.5),
                    ),
                  ),
                for (var i = 0; i < layers; i++)
                  Positioned(
                    left: i * 2.0,
                    top: (layers - i) * 2.0,
                    child: i == layers - 1
                        ? AnimatedContainer(
                            duration: const Duration(milliseconds: 300),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(width * 0.1),
                              boxShadow: glow
                                  ? [
                                      BoxShadow(
                                        color: Palette.gold.withValues(alpha: 0.8),
                                        blurRadius: 18,
                                        spreadRadius: 2,
                                      ),
                                    ]
                                  : null,
                            ),
                            child: CardView.back(width: width),
                          )
                        : CardView.back(width: width),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Text('Mazo · $count', style: body(12, color: Palette.ivory.withValues(alpha: 0.75), weight: 700)),
        ],
      ),
    );
  }
}

/// Confeti para celebrar.
class Confetti extends StatefulWidget {
  const Confetti({super.key});

  @override
  State<Confetti> createState() => _ConfettiState();
}

class _ConfettiState extends State<Confetti> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 4))..forward();
  final _rng = Random();
  late final _bits = List.generate(
    90,
    (_) => (
      x: _rng.nextDouble(),
      delay: _rng.nextDouble() * 0.35,
      speed: 0.6 + _rng.nextDouble() * 0.7,
      spin: _rng.nextDouble() * 12,
      color: [
        Palette.gold,
        Palette.red,
        Palette.ivory,
        const Color(0xFF5BC0EB),
        const Color(0xFF9BC53D),
      ][_rng.nextInt(5)],
    ),
  );

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => CustomPaint(painter: _ConfettiPainter(_bits, _c.value), size: Size.infinite),
      ),
    );
  }
}

class _ConfettiPainter extends CustomPainter {
  final List<({double x, double delay, double speed, double spin, Color color})> bits;
  final double t;
  _ConfettiPainter(this.bits, this.t);

  @override
  void paint(Canvas canvas, Size size) {
    for (final b in bits) {
      final lt = ((t - b.delay) * b.speed * 1.6).clamp(0.0, 1.2);
      if (lt <= 0) continue;
      final y = -20 + lt * (size.height + 40);
      final x = b.x * size.width + sin(lt * 8 + b.spin) * 24;
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(lt * b.spin);
      canvas.drawRect(
        const Rect.fromLTWH(-4, -2.5, 8, 5),
        Paint()..color = b.color.withValues(alpha: (1.2 - lt).clamp(0.0, 1.0)),
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _ConfettiPainter old) => old.t != t;
}
