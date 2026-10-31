import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'protocol.dart';

enum LinkState { connecting, connected, reconnecting, closed }

class Emote {
  final int seat;
  final String text;

  /// true = mensaje escrito; false = emoji o frase rápida.
  final bool isText;
  final DateTime at = DateTime.now();
  Emote(this.seat, this.text, {this.isText = false});
}

/// Conexión de un jugador con la mesa. Se reconecta sola con su token.
class GameClient extends ChangeNotifier {
  final List<String> hosts;
  final int port;
  final String name;
  final String? hostKey;

  /// Perfil propio que se envía al entrar (fichas, ranking, trofeos).
  final Map<String, dynamic>? profile;

  /// Se llama cada vez que el anfitrión envía el perfil actualizado de este jugador.
  final void Function(Map<String, dynamic> me)? onProfile;

  WebSocket? _ws;
  String? token;
  bool isHost = false;
  LinkState state = LinkState.connecting;
  Map<String, dynamic>? lobby;
  Map<String, dynamic>? view;

  /// Datos de la mesa: fichas, bolsa, ranking y trofeos (del anfitrión).
  Map<String, dynamic>? table;
  String? lastError;
  final _errors = StreamController<String>.broadcast();
  final _emotes = StreamController<Emote>.broadcast();
  final _pinchWarnings = StreamController<String>.broadcast();
  final _faultWarnings = StreamController<({String msg, Map<String, dynamic> action})>.broadcast();
  Map<String, dynamic>? _lastAction;
  bool _closing = false;
  String? _activeHost;

  GameClient({required this.hosts, required this.port, required this.name, this.hostKey, this.profile, this.onProfile});

  Stream<String> get errors => _errors.stream;
  Stream<Emote> get emotes => _emotes.stream;

  /// Advertencia al pinchar sin motivo: la interfaz pide confirmar.
  Stream<String> get pinchWarnings => _pinchWarnings.stream;

  /// Aviso privado: la jugada enviada es una falta; se puede reenviar con `risk`.
  Stream<({String msg, Map<String, dynamic> action})> get faultWarnings => _faultWarnings.stream;
  bool get started => lobby?['started'] == true && view != null;

  /// Conecta probando cada IP. Lanza si ninguna responde.
  Future<void> connect() async {
    Object? last;
    for (final h in [?_activeHost, ...hosts]) {
      try {
        final ws = await WebSocket.connect('ws://$h:$port/ws').timeout(const Duration(seconds: 4));
        _activeHost = h;
        _attach(ws);
        return;
      } catch (e) {
        last = e;
      }
    }
    throw last ?? StateError('Sin conexión');
  }

  void _attach(WebSocket ws) {
    _ws = ws;
    ws.pingInterval = const Duration(seconds: 5);
    state = LinkState.connected;
    _send({
      't': 'hello',
      'v': protocolVersion,
      'name': name,
      'token': ?token,
      'hostKey': ?hostKey,
      'profile': ?profile,
    });
    ws.listen(_onData, onDone: _onDone, onError: (_) => _onDone());
    notifyListeners();
  }

  void _onData(dynamic data) {
    final m = decodeMsg(data);
    final me = m['me'];
    if (me is Map) onProfile?.call(me.cast<String, dynamic>());
    switch (m['t']) {
      case 'welcome':
        token = m['token'] as String;
        isHost = m['host'] == true;
      case 'lobby':
        lobby = m;
        if (m['started'] != true) view = null;
      case 'state':
        view = (m['view'] as Map).cast<String, dynamic>();
        table = (m['table'] as Map?)?.cast<String, dynamic>();
      case 'error':
        lastError = m['msg'] as String;
        if (m['code'] == 'pinchWarning') {
          _pinchWarnings.add(lastError!);
        } else if (m['code'] == 'faultWarning' && _lastAction != null) {
          _faultWarnings.add((msg: lastError!, action: _lastAction!));
        } else {
          _errors.add(lastError!);
        }
      case 'emote':
        _emotes.add(Emote(m['seat'] as int, m['e'] as String, isText: m['kind'] == 'text'));
    }
    notifyListeners();
  }

  void _onDone() {
    _ws = null;
    if (_closing) return;
    state = LinkState.reconnecting;
    notifyListeners();
    _reconnect();
  }

  Future<void> _reconnect() async {
    while (!_closing && _ws == null) {
      await Future<void>.delayed(const Duration(seconds: 2));
      if (_closing) return;
      try {
        await connect();
      } catch (_) {}
    }
  }

  void _send(Map<String, dynamic> m) {
    try {
      _ws?.add(encodeMsg(m));
    } catch (_) {}
  }

  void action(Map<String, dynamic> a) {
    _lastAction = a;
    _send({'t': 'action', 'a': a});
  }

  void configure(String variant, Map<String, int> options) =>
      _send({'t': 'config', 'variant': variant, 'options': options});
  void startGame() => _send({'t': 'start'});
  void nextRound() => _send({'t': 'next'});
  void newGame() => _send({'t': 'newGame'});
  void emote(String e) => _send({'t': 'emote', 'e': e});
  void message(String text) => _send({'t': 'emote', 'e': text, 'kind': 'text'});
  void recharge() => _send({'t': 'recharge'});
  void configureBet(String variant, Map<String, int> options, Map<String, dynamic> bet) =>
      _send({'t': 'config', 'variant': variant, 'options': options, 'bet': bet});

  Future<void> close() async {
    _closing = true;
    state = LinkState.closed;
    await _ws?.close();
    await _errors.close();
    await _emotes.close();
    await _pinchWarnings.close();
    await _faultWarnings.close();
  }
}
