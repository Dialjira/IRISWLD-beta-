import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../engine/variants.dart';
import '../net/client.dart';
import '../session.dart';
import 'rules_screen.dart';
import 'table_screen.dart';
import 'theme.dart';

/// Sala de espera. Cuando empieza la partida muestra la mesa en la misma ruta.
class LobbyScreen extends StatefulWidget {
  final Session session;
  const LobbyScreen({super.key, required this.session});

  @override
  State<LobbyScreen> createState() => _LobbyScreenState();
}

class _LobbyScreenState extends State<LobbyScreen> {
  late final StreamSubscription<String> _errSub;
  GameClient get client => widget.session.client;

  @override
  void initState() {
    super.initState();
    client.addListener(_changed);
    _errSub = client.errors.listen((e) {
      if (mounted) toast(context, e);
    });
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    client.removeListener(_changed);
    _errSub.cancel();
    widget.session.end();
    super.dispose();
  }

  Future<bool> _confirmLeave() async {
    final host = widget.session.isHost;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: const Color(0xFF0E2D21),
        title: Text('¿Salir de la mesa?', style: display(22)),
        content: Text(
          host
              ? 'Eres el anfitrión: la mesa se cerrará para todos.'
              : 'Podrás volver a entrar con el código mientras la mesa siga abierta.',
          style: body(15),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: Text('Quedarme', style: body(15, color: Palette.gold, weight: 800)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: Text('Salir', style: body(15, color: Palette.red, weight: 800)),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final lobby = client.lobby;
    final playing = client.view != null && lobby?['started'] == true;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmLeave() && context.mounted) Navigator.of(context).pop();
      },
      child: Scaffold(
        body: Felt(
          child: Stack(
            children: [
              if (playing)
                TableScreen(
                  client: client,
                  isHost: widget.session.isHost,
                  onLeave: () async {
                    if (await _confirmLeave() && context.mounted) Navigator.of(context).pop();
                  },
                )
              else
                SafeArea(child: lobby == null ? _connecting() : _lobby(lobby)),
              if (client.state == LinkState.reconnecting) _reconnectBanner(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _connecting() => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const CircularProgressIndicator(color: Palette.gold),
        const SizedBox(height: 16),
        Text('Entrando a la mesa…', style: body(16, weight: 700)),
      ],
    ),
  );

  Widget _reconnectBanner() => Positioned(
    top: 0,
    left: 0,
    right: 0,
    child: SafeArea(
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(color: Palette.wine, borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: [
            const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2, color: Palette.gold),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text('Se perdió la conexión. Reconectando…', style: body(14, weight: 700))),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text('Salir', style: body(14, color: Palette.gold, weight: 800)),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _lobby(Map<String, dynamic> lobby) {
    final host = widget.session.isHost;
    final code = lobby['code'] as String;
    final players = (lobby['players'] as List).cast<Map>();
    final variant = variantById(lobby['variant'] as String);
    final opts = (lobby['options'] as Map).cast<String, int>();
    final count = players.length;
    final canStart = count >= variant.minPlayers && count <= variant.maxPlayers;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        Row(
          children: [
            IconButton(
              onPressed: () async {
                if (await _confirmLeave() && mounted) Navigator.of(context).pop();
              },
              icon: const Icon(Icons.arrow_back_rounded, color: Palette.ivory),
            ),
            const Spacer(),
            IconButton(
              tooltip: 'Reglas',
              onPressed: () =>
                  Navigator.of(context).push(MaterialPageRoute(builder: (_) => RulesScreen(initial: variant.id))),
              icon: const Icon(Icons.menu_book_rounded, color: Palette.gold),
            ),
          ],
        ),
        Center(
          child: Text('Mesa', style: body(15, color: Palette.ivory.withValues(alpha: 0.7), weight: 700)),
        ),
        Center(
          child: Text(code, style: display(54, color: Palette.gold, weight: 800).copyWith(letterSpacing: 12)),
        ),
        if (host) ...[
          const SizedBox(height: 12),
          Center(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Palette.ivory,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [BoxShadow(color: Palette.gold.withValues(alpha: 0.35), blurRadius: 24)],
              ),
              child: QrImageView(
                data: lobby['address'] as String,
                size: 170,
                eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.circle, color: Palette.feltDeep),
                dataModuleStyle: const QrDataModuleStyle(
                  dataModuleShape: QrDataModuleShape.circle,
                  color: Palette.feltDeep,
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Los demás escanean este QR o escriben el código. Deben estar en tu mismo WiFi o conectados a tu punto de acceso.',
            textAlign: TextAlign.center,
            style: body(13, color: Palette.ivory.withValues(alpha: 0.65)),
          ),
        ],
        const SizedBox(height: 18),
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Jugadores ($count/4)', style: body(16, weight: 800)),
              const SizedBox(height: 10),
              for (var i = 0; i < 4; i++) _seatTile(i, i < players.length ? players[i] : null, lobby['you'] == i),
            ],
          ),
        ),
        const SizedBox(height: 16),
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(host ? 'Elige la modalidad' : 'Modalidad', style: body(16, weight: 800)),
              const SizedBox(height: 10),
              if (host)
                for (final v in variants)
                  _variantTile(v, v.id == variant.id, () => client.configure(v.id, v.defaults()))
              else
                _variantTile(variant, true, null),
              const SizedBox(height: 8),
              for (final o in variant.options) _option(o, opts[o.key] ?? o.defaultValue, host, variant, opts),
            ],
          ),
        ),
        const SizedBox(height: 20),
        if (host)
          GoldButton(
            label: canStart ? 'Repartir cartas' : _needPlayers(variant, count),
            icon: Icons.style_rounded,
            onPressed: canStart ? client.startGame : null,
          )
        else
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: Palette.gold),
              ),
              const SizedBox(width: 12),
              Text('Esperando a que el anfitrión reparta…', style: body(15, weight: 700)),
            ],
          ),
      ],
    );
  }

  String _needPlayers(Variant v, int count) {
    if (count > v.maxPlayers) return '${v.name}: máximo ${v.maxPlayers} jugadores';
    final missing = v.minPlayers - count;
    return missing == 1 ? 'Falta 1 jugador' : 'Faltan $missing jugadores';
  }

  Widget _seatTile(int i, Map? p, bool me) {
    final color = Palette.seats[i];
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: p == null ? Colors.transparent : color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: p == null ? Colors.white12 : color.withValues(alpha: 0.6)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: p == null ? Colors.white10 : color,
            child: p == null
                ? const Icon(Icons.chair_rounded, size: 16, color: Colors.white38)
                : Text((p['name'] as String).characters.first.toUpperCase(), style: display(16, color: Palette.ink)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              p == null ? 'Puesto libre' : '${p['name']}${me ? ' (tú)' : ''}',
              style: body(15, color: p == null ? Colors.white38 : Palette.ivory, weight: 700),
            ),
          ),
          if (p?['host'] == true) const Icon(Icons.star_rounded, color: Palette.gold, size: 20),
          if (p != null && p['connected'] != true) const Icon(Icons.wifi_off_rounded, color: Palette.red, size: 18),
        ],
      ),
    );
  }

  Widget _variantTile(Variant v, bool selected, VoidCallback? onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: selected
              ? LinearGradient(colors: [Palette.gold.withValues(alpha: 0.30), Palette.gold.withValues(alpha: 0.08)])
              : null,
          border: Border.all(color: selected ? Palette.gold : Colors.white12, width: selected ? 1.6 : 1),
        ),
        child: Row(
          children: [
            Icon(selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded, color: Palette.gold),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(v.name, style: display(19, color: selected ? Palette.gold : Palette.ivory)),
                  const SizedBox(height: 2),
                  Text(
                    '${v.tagline} · ${v.minPlayers == v.maxPlayers ? '${v.minPlayers}' : '${v.minPlayers}–${v.maxPlayers}'} jugadores',
                    style: body(12.5, color: Palette.ivory.withValues(alpha: 0.7)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _option(GameOption o, int value, bool host, Variant v, Map<String, int> opts) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(o.label, style: body(13.5, color: Palette.ivory.withValues(alpha: 0.8), weight: 700)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              for (var k = 0; k < o.values.length; k++)
                ChoiceChip(
                  label: Text(o.labels[k]),
                  selected: o.values[k] == value,
                  showCheckmark: false,
                  labelStyle: body(13, color: o.values[k] == value ? Palette.ink : Palette.ivory, weight: 800),
                  selectedColor: Palette.gold,
                  backgroundColor: Colors.black26,
                  side: BorderSide(color: Palette.gold.withValues(alpha: 0.35)),
                  onSelected: host && o.values[k] != value
                      ? (_) => client.configure(v.id, {...opts, o.key: o.values[k]})
                      : null,
                ),
            ],
          ),
        ],
      ),
    );
  }
}
