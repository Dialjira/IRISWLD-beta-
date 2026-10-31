import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../engine/variants.dart';
import '../net/discovery.dart';
import '../net/protocol.dart';
import '../session.dart';
import 'lobby_screen.dart';
import 'theme.dart';

class JoinScreen extends StatefulWidget {
  final String name;
  const JoinScreen({super.key, required this.name});

  @override
  State<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends State<JoinScreen> {
  final _code = TextEditingController();
  final _scanner = TableScanner();
  List<Announcement> _nearby = [];
  StreamSubscription<List<Announcement>>? _sub;
  String? _status;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _scanner.start().then((_) {
      _sub = _scanner.tables.listen((t) => mounted ? setState(() => _nearby = t) : null);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _scanner.stop();
    _code.dispose();
    super.dispose();
  }

  Future<void> _connect(TableAddress addr) async {
    setState(() {
      _busy = true;
      _status = 'Conectando con la mesa ${addr.code}…';
    });
    try {
      final s = await Session.join(addr, widget.name);
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => LobbyScreen(session: s)));
    } catch (_) {
      if (!mounted) return;
      setState(() => _status = null);
      toast(context, 'No se pudo conectar. Revisa que estén en la misma red.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _searchCode() async {
    final code = _code.text.trim().toUpperCase();
    if (code.length != 4) {
      toast(context, 'El código tiene 4 letras');
      return;
    }
    final near = _nearby.where((a) => a.code == code).firstOrNull;
    if (near != null) return _connect(TableAddress([near.host], near.port, code));
    setState(() {
      _busy = true;
      _status = 'Buscando la mesa $code en la red…';
    });
    final addr = await findTableByCode(code);
    if (!mounted) return;
    if (addr == null) {
      setState(() {
        _busy = false;
        _status = null;
      });
      toast(context, 'No encontré la mesa $code. Prueba escaneando el QR.');
      return;
    }
    await _connect(addr);
  }

  Future<void> _scanQr() async {
    final addr = await Navigator.of(context)
        .push<TableAddress>(MaterialPageRoute(builder: (_) => const QrScanScreen()));
    if (addr != null) await _connect(addr);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Text('Unirme a una mesa', style: display(22)),
      ),
      body: Felt(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            children: [
              GlassPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Escanea el QR del anfitrión', style: body(16, weight: 800)),
                    const SizedBox(height: 4),
                    Text(
                      'Es la forma más rápida: aparece en la pantalla de quien creó la mesa.',
                      style: body(13, color: Palette.ivory.withValues(alpha: 0.65)),
                    ),
                    const SizedBox(height: 14),
                    GoldButton(
                      label: 'Escanear QR',
                      icon: Icons.qr_code_scanner_rounded,
                      onPressed: _busy ? null : _scanQr,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              GlassPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('O escribe el código', style: body(16, weight: 800)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _code,
                            maxLength: 4,
                            textAlign: TextAlign.center,
                            textCapitalization: TextCapitalization.characters,
                            inputFormatters: [
                              FilteringTextInputFormatter.allow(RegExp('[a-zA-Z]')),
                              TextInputFormatter.withFunction((o, n) => n.copyWith(text: n.text.toUpperCase())),
                            ],
                            style: display(30, color: Palette.gold).copyWith(letterSpacing: 10),
                            decoration: const InputDecoration(counterText: '', hintText: 'ABCD'),
                            onSubmitted: (_) => _searchCode(),
                          ),
                        ),
                        const SizedBox(width: 12),
                        GoldButton(label: 'Entrar', compact: true, onPressed: _busy ? null : _searchCode),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              GlassPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Text('Mesas cerca', style: body(16, weight: 800)),
                        const Spacer(),
                        const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Palette.gold),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (_nearby.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Text(
                          'Buscando en la red… Si no aparece, usa el QR o el código.',
                          style: body(13, color: Palette.ivory.withValues(alpha: 0.6)),
                        ),
                      ),
                    for (final a in _nearby)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: CircleAvatar(
                          backgroundColor: Palette.gold,
                          child: Text(a.code.substring(0, 1), style: display(18, color: Palette.ink)),
                        ),
                        title: Text('Mesa de ${a.hostName}', style: body(16, weight: 800)),
                        subtitle: Text(
                          '${variants.where((v) => v.id == a.variant).firstOrNull?.name ?? a.variant} · ${a.players} en la mesa · ${a.code}',
                          style: body(13, color: Palette.ivory.withValues(alpha: 0.7)),
                        ),
                        trailing: const Icon(Icons.chevron_right_rounded, color: Palette.gold),
                        onTap: _busy ? null : () => _connect(TableAddress([a.host], a.port, a.code)),
                      ),
                  ],
                ),
              ),
              if (_status != null) ...[
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Palette.gold),
                    ),
                    const SizedBox(width: 12),
                    Flexible(child: Text(_status!, style: body(14, weight: 700))),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class QrScanScreen extends StatefulWidget {
  const QrScanScreen({super.key});

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  bool _done = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: Text('Escanear QR', style: display(22)),
      ),
      body: Stack(
        children: [
          MobileScanner(
            onDetect: (capture) {
              if (_done) return;
              for (final b in capture.barcodes) {
                final addr = TableAddress.parse(b.rawValue ?? '');
                if (addr != null) {
                  _done = true;
                  HapticFeedback.mediumImpact();
                  Navigator.of(context).pop(addr);
                  return;
                }
              }
            },
          ),
          Center(
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                border: Border.all(color: Palette.gold, width: 3),
                borderRadius: BorderRadius.circular(24),
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 48,
            child: Text('Apunta al QR de la mesa', textAlign: TextAlign.center, style: body(16, weight: 700)),
          ),
        ],
      ),
    );
  }
}
