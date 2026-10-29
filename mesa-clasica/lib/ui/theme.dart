import 'dart:math';
import 'dart:ui';

import 'package:flutter/material.dart';

/// Paleta de la mesa.
abstract final class Palette {
  static const feltDeep = Color(0xFF062A1C);
  static const felt = Color(0xFF0C4A31);
  static const feltLight = Color(0xFF16714A);
  static const gold = Color(0xFFE6C068);
  static const goldDeep = Color(0xFFB8892E);
  static const ivory = Color(0xFFFFFBF0);
  static const ink = Color(0xFF1B1B22);
  static const red = Color(0xFFC62835);
  static const wine = Color(0xFF6E1423);
  static const night = Color(0xFF07130E);
  static const glass = Color(0x33000000);

  /// Colores de los jugadores por asiento.
  static const seats = [Color(0xFFE6C068), Color(0xFF5BC0EB), Color(0xFFF25F5C), Color(0xFF9BC53D)];
}

TextStyle display(double size, {Color color = Palette.ivory, double weight = 700}) => TextStyle(
  fontFamily: 'Playfair',
  fontSize: size,
  color: color,
  fontWeight: FontWeight.values[((weight / 100).round() - 1).clamp(0, 8)],
  fontVariations: [FontVariation('wght', weight)],
  height: 1.1,
);

TextStyle body(double size, {Color color = Palette.ivory, double weight = 500}) => TextStyle(
  fontFamily: 'Nunito',
  fontSize: size,
  color: color,
  fontWeight: FontWeight.values[((weight / 100).round() - 1).clamp(0, 8)],
  fontVariations: [FontVariation('wght', weight)],
);

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    fontFamily: 'Nunito',
    colorScheme: ColorScheme.fromSeed(
      seedColor: Palette.felt,
      brightness: Brightness.dark,
      primary: Palette.gold,
      onPrimary: Palette.ink,
      surface: const Color(0xFF0A2219),
    ),
    scaffoldBackgroundColor: Palette.feltDeep,
  );
  return base.copyWith(
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Palette.wine,
      contentTextStyle: body(15, weight: 700),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.black.withValues(alpha: 0.25),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Palette.gold, width: 1.5),
      ),
      labelStyle: body(15, color: Palette.ivory.withValues(alpha: 0.7)),
    ),
  );
}

/// Fondo de paño con viñeta y textura sutil.
class Felt extends StatelessWidget {
  final Widget child;
  const Felt({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(0, -0.2),
          radius: 1.25,
          colors: [Palette.feltLight, Palette.felt, Palette.feltDeep, Palette.night],
          stops: [0, 0.45, 0.85, 1],
        ),
      ),
      child: CustomPaint(painter: _FeltTexture(), child: child),
    );
  }
}

class _FeltTexture extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rng = Random(42);
    final p = Paint()..strokeWidth = 1;
    for (var i = 0; i < (size.width * size.height / 900).clamp(0, 2500); i++) {
      final o = Offset(rng.nextDouble() * size.width, rng.nextDouble() * size.height);
      p.color = (rng.nextBool() ? Colors.white : Colors.black).withValues(alpha: 0.035);
      canvas.drawLine(o, o + Offset(rng.nextDouble() * 3 - 1.5, rng.nextDouble() * 3 - 1.5), p);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Botón principal dorado con brillo.
class GoldButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool compact;
  final bool secondary;

  const GoldButton({
    super.key,
    required this.label,
    this.icon,
    this.onPressed,
    this.compact = false,
    this.secondary = false,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final colors = secondary
        ? [const Color(0xFF1E5A41), const Color(0xFF124330)]
        : [const Color(0xFFF6DB8E), Palette.gold, Palette.goldDeep];
    final fg = secondary ? Palette.ivory : Palette.ink;
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: enabled ? 1 : 0.4,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(compact ? 14 : 20),
          onTap: onPressed,
          child: Ink(
            padding: EdgeInsets.symmetric(horizontal: compact ? 14 : 22, vertical: compact ? 9 : 15),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(compact ? 14 : 20),
              gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: colors),
              border: Border.all(color: secondary ? Palette.gold.withValues(alpha: 0.45) : const Color(0x55FFFFFF)),
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 4)),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[Icon(icon, color: fg, size: compact ? 18 : 22), const SizedBox(width: 8)],
                Flexible(
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: body(compact ? 14 : 17, color: fg, weight: 800),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Panel translúcido.
class GlassPanel extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? border;
  const GlassPanel({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.border});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.28),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: border ?? Palette.gold.withValues(alpha: 0.25)),
          ),
          child: child,
        ),
      ),
    );
  }
}

void toast(BuildContext context, String msg) {
  final m = ScaffoldMessenger.maybeOf(context);
  m?.hideCurrentSnackBar();
  m?.showSnackBar(SnackBar(content: Text(msg), duration: const Duration(milliseconds: 2200)));
}
