import 'package:flutter/material.dart';

import '../engine/pinch.dart';
import '../profile.dart';
import '../profile_store.dart';
import 'theme.dart';

/// Estadísticas, trofeos y ranking de las personas con las que se ha jugado.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Profile? _me;
  List<Map<String, dynamic>> _known = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final me = await ProfileStore.load();
    final known = await ProfileStore.known();
    if (mounted) {
      setState(() {
        _me = me;
        _known = known;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = _me;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Text('Mi perfil', style: display(24)),
      ),
      body: Felt(
        child: SafeArea(
          child: me == null
              ? const Center(child: CircularProgressIndicator(color: Palette.gold))
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  children: [
                    _header(me),
                    const SizedBox(height: 12),
                    _stats(me),
                    const SizedBox(height: 12),
                    _trophies(me),
                    const SizedBox(height: 12),
                    _ranking(me),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _header(Profile me) => GlassPanel(
    border: Palette.gold,
    child: Row(
      children: [
        CircleAvatar(
          radius: 30,
          backgroundColor: Palette.gold,
          child: Text(me.name.characters.first.toUpperCase(), style: display(28, color: Palette.ink)),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(me.name, style: display(24)),
              Text('${me.level} · ${me.rating} puntos de ranking', style: body(14, color: Palette.gold, weight: 800)),
              const SizedBox(height: 4),
              Text(
                '${formatChips(me.chips)} fichas · ${me.recharges} ${me.recharges == 1 ? 'recarga' : 'recargas'}',
                style: body(13, color: Palette.ivory.withValues(alpha: 0.75), weight: 700),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _stats(Profile me) {
    Widget tile(String label, String value) => Expanded(
      child: Column(
        children: [
          Text(value, style: display(22, color: Palette.gold)),
          Text(
            label,
            textAlign: TextAlign.center,
            style: body(12, color: Palette.ivory.withValues(alpha: 0.7)),
          ),
        ],
      ),
    );
    return GlassPanel(
      child: Column(
        children: [
          Row(
            children: [
              tile('Partidas', '${me.games}'),
              tile('Ganadas', '${me.wins}'),
              tile('Efectividad', '${me.winRate}%'),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              tile('Rondas ganadas', '${me.roundWins}'),
              tile('Mejor racha de rondas', '${me.bestRoundStreak}'),
              tile('Mejor racha de partidas', '${me.bestGameStreak}'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _trophies(Profile me) => GlassPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Trofeos', style: body(16, weight: 800)),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final t in trophies)
              Opacity(
                opacity: (me.trophies[t.id] ?? 0) > 0 ? 1 : 0.35,
                child: Container(
                  width: 100,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.black26,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: (me.trophies[t.id] ?? 0) > 0 ? Palette.gold : Colors.white12),
                  ),
                  child: Column(
                    children: [
                      Text(t.emoji, style: const TextStyle(fontSize: 30)),
                      Text(t.name, textAlign: TextAlign.center, style: body(13, weight: 800)),
                      Text(
                        t.description,
                        textAlign: TextAlign.center,
                        style: body(10.5, color: Palette.ivory.withValues(alpha: 0.65)),
                      ),
                      if ((me.trophies[t.id] ?? 0) > 1)
                        Text('×${me.trophies[t.id]}', style: body(12, color: Palette.gold, weight: 900)),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ],
    ),
  );

  Widget _ranking(Profile me) {
    final rows = [
      {...me.publicJson(), 'name': '${me.name} (tú)', 'mine': true},
      ..._known.where((k) => k['deviceId'] != me.deviceId),
    ]..sort((a, b) => (b['rating'] as int? ?? 0) - (a['rating'] as int? ?? 0));
    return GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Ranking de tu mesa', style: body(16, weight: 800)),
          Text(
            'Las personas con las que has jugado en este teléfono.',
            style: body(12, color: Palette.ivory.withValues(alpha: 0.6)),
          ),
          const SizedBox(height: 8),
          for (var i = 0; i < rows.length; i++)
            Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: rows[i]['mine'] == true ? Palette.gold.withValues(alpha: 0.15) : Colors.black26,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  SizedBox(
                    width: 28,
                    child: Text(
                      i < 3 ? ['🥇', '🥈', '🥉'][i] : '${i + 1}',
                      style: body(15, weight: 900, color: Palette.gold),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${rows[i]['name']}', style: body(14.5, weight: 800)),
                        Text(
                          '${rows[i]['level'] ?? levelFor(rows[i]['rating'] as int? ?? 0)} · '
                          '${rows[i]['wins'] ?? 0} ganadas de ${rows[i]['games'] ?? 0}'
                          '${(rows[i]['trophies'] as int? ?? 0) > 0 ? ' · 🏆${rows[i]['trophies']}' : ''}',
                          style: body(12, color: Palette.ivory.withValues(alpha: 0.7)),
                        ),
                      ],
                    ),
                  ),
                  Text('${rows[i]['rating']}', style: display(18, color: Palette.gold)),
                ],
              ),
            ),
          if (rows.length == 1)
            Text('Juega una partida para empezar tu ranking.', style: body(13, color: Colors.white38)),
        ],
      ),
    );
  }
}
