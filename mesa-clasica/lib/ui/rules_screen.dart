import 'package:flutter/material.dart';

import '../engine/variants.dart';
import 'theme.dart';

class RulesScreen extends StatelessWidget {
  final String? initial;
  const RulesScreen({super.key, this.initial});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Text('Reglas', style: display(24)),
      ),
      body: Felt(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              GlassPanel(
                child: Text(
                  'En todas las modalidades se forman tríos (cartas del mismo valor) y escaleras '
                  '(cartas seguidas del mismo palo). En tu turno robas una carta del mazo o del '
                  'descarte y terminas descartando una. Las reglas de casa se eligen al crear la mesa.',
                  style: body(14.5),
                ),
              ),
              const SizedBox(height: 12),
              for (final v in variants)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: GlassPanel(
                    padding: EdgeInsets.zero,
                    child: Theme(
                      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                      child: ExpansionTile(
                        initiallyExpanded: v.id == initial,
                        iconColor: Palette.gold,
                        collapsedIconColor: Palette.gold,
                        title: Text(v.name, style: display(20, color: Palette.gold)),
                        subtitle: Text(
                          '${v.tagline} · ${v.minPlayers == v.maxPlayers ? '${v.minPlayers}' : '${v.minPlayers}–${v.maxPlayers}'} jugadores',
                          style: body(12.5, color: Palette.ivory.withValues(alpha: 0.7)),
                        ),
                        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        children: [Text(v.rulesText, style: body(14.5).copyWith(height: 1.45))],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
