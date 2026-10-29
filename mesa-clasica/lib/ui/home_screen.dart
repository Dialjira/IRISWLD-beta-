import 'dart:math';

import 'package:flutter/material.dart';

import '../engine/cards.dart';
import '../session.dart';
import 'card_view.dart';
import 'join_screen.dart';
import 'lobby_screen.dart';
import 'rules_screen.dart';
import 'theme.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  final _name = TextEditingController();
  late final AnimationController _intro = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
    ..forward();
  bool _busy = false;

  static const _fan = [
    PlayingCard(1, Suit.picas, 1),
    PlayingCard(2, Suit.corazones, 13),
    PlayingCard.joker(3),
    PlayingCard(4, Suit.oros, 1),
    PlayingCard(5, Suit.diamantes, 12),
  ];

  @override
  void initState() {
    super.initState();
    loadName().then((n) => setState(() => _name.text = n));
  }

  @override
  void dispose() {
    _intro.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<String?> _checkName() async {
    final n = _name.text.trim();
    if (n.isEmpty) {
      toast(context, 'Escribe tu nombre para la mesa');
      return null;
    }
    await saveName(n);
    return n;
  }

  Future<void> _create() async {
    final n = await _checkName();
    if (n == null) return;
    setState(() => _busy = true);
    try {
      final s = await Session.host(n);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => LobbyScreen(session: s)));
    } catch (e) {
      if (mounted) toast(context, 'No se pudo crear la mesa. ¿Estás conectado a un WiFi o punto de acceso?');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _join() async {
    final n = await _checkName();
    if (n == null || !mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => JoinScreen(name: n)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Felt(
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, c) => SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: c.maxHeight),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SizedBox(height: 24),
                      SizedBox(height: 190, child: _buildFan()),
                      const SizedBox(height: 18),
                      ShaderMask(
                        shaderCallback: (r) => const LinearGradient(
                          colors: [Color(0xFFFFF0B8), Palette.gold, Palette.goldDeep],
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                        ).createShader(r),
                        child: Text('Mesa Clásica', style: display(46, weight: 800)),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Rummy · Remis · Continental · Chinchón',
                        style: body(15, color: Palette.ivory.withValues(alpha: 0.75), weight: 600),
                      ),
                      const SizedBox(height: 34),
                      GlassPanel(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            TextField(
                              controller: _name,
                              maxLength: 16,
                              textCapitalization: TextCapitalization.words,
                              style: body(18, weight: 700),
                              decoration: const InputDecoration(
                                labelText: 'Tu nombre',
                                counterText: '',
                                prefixIcon: Icon(Icons.person_rounded, color: Palette.gold),
                              ),
                            ),
                            const SizedBox(height: 16),
                            GoldButton(
                              label: _busy ? 'Abriendo mesa…' : 'Crear mesa',
                              icon: Icons.table_restaurant_rounded,
                              onPressed: _busy ? null : _create,
                            ),
                            const SizedBox(height: 12),
                            GoldButton(
                              label: 'Unirme a una mesa',
                              icon: Icons.qr_code_scanner_rounded,
                              secondary: true,
                              onPressed: _busy ? null : _join,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                      TextButton.icon(
                        onPressed: () =>
                            Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RulesScreen())),
                        icon: const Icon(Icons.menu_book_rounded, color: Palette.gold),
                        label: Text('Reglas de cada modalidad', style: body(15, color: Palette.gold, weight: 700)),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Juega con 2 a 4 personas en el mismo WiFi o con el punto de acceso de un teléfono.',
                        textAlign: TextAlign.center,
                        style: body(13, color: Palette.ivory.withValues(alpha: 0.55)),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFan() {
    return AnimatedBuilder(
      animation: _intro,
      builder: (context, _) => Stack(
        alignment: Alignment.bottomCenter,
        clipBehavior: Clip.none,
        children: [
          for (var i = 0; i < _fan.length; i++)
            Builder(
              builder: (context) {
                final t = Curves.easeOutBack.transform(((_intro.value - i * 0.08) / 0.6).clamp(0.0, 1.0));
                final angle = (i - 2) * 0.22 * t;
                return Transform(
                  alignment: Alignment.bottomCenter,
                  transform: Matrix4.identity()
                    ..translateByDouble(0, (1 - t) * 60, 0, 1)
                    ..rotateZ(angle),
                  child: Opacity(
                    opacity: t.clamp(0.0, 1.0),
                    child: Padding(
                      padding: EdgeInsets.only(bottom: 10 + (2 - (i - 2).abs()) * 6.0),
                      child: Transform.rotate(
                        angle: sin(i) * 0.02,
                        child: CardView(card: _fan[i], width: 104),
                      ),
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}
