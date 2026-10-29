import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'protocol.dart';

enum LinkState { connecting, connected, reconnecting, closed }

class Emote {
  final int seat;
  final String text;
  final DateTime at = DateTime.now();
  Emote(this.seat, this.text);
}

/// Conexión de un jugador con la mesa. Se reconecta sola con su token.
class GameClient extends ChangeNotifier {
  final List<String> hosts;
  final int port;
  final String name;
  final String? hostKey;

  WebSocket? _ws;
  String? token;
  bool isHost = false;
  LinkState state = LinkState.connecting;
  Map<String, dynamic>? lobby;
  Map<String, dynamic>? view;
  String? lastError;
  final _errors = StreamController<String>.broadcast();
  final _emotes = StreamController<Emote>.broadcast();
  bool _closing = false;
  String? _activeHost;

  GameClient({required this.hosts, required this.port, required this.name, this.hostKey});

  Stream<String> get errors => _errors.stream;
  Stream<Emote> get emotes => _emotes.stream;
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
    _send({'t': 'hello', 'name': name, 'token': ?token, 'hostKey': ?hostKey});
    ws.listen(_onData, onDone: _onDone, onError: (_) => _onDone());
    notifyListeners();
  }

  void _onData(dynamic data) {
    final m = decodeMsg(data);
    switch (m['t']) {
      case 'welcome':
        token = m['token'] as String;
        isHost = m['host'] == true;
      case 'lobby':
        lobby = m;
        if (m['started'] != true) view = null;
      case 'state':
        view = (m['view'] as Map).cast<String, dynamic>();
      case 'error':
        lastError = m['msg'] as String;
        _errors.add(lastError!);
      case 'emote':
        _emotes.add(Emote(m['seat'] as int, m['e'] as String));
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

  void action(Map<String, dynamic> a) => _send({'t': 'action', 'a': a});
  void configure(String variant, Map<String, int> options) =>
      _send({'t': 'config', 'variant': variant, 'options': options});
  void startGame() => _send({'t': 'start'});
  void nextRound() => _send({'t': 'next'});
  void newGame() => _send({'t': 'newGame'});
  void emote(String e) => _send({'t': 'emote', 'e': e});

  Future<void> close() async {
    _closing = true;
    state = LinkState.closed;
    await _ws?.close();
    await _errors.close();
    await _emotes.close();
  }
}
