import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import '../engine/game.dart';
import '../engine/variants.dart';
import 'protocol.dart';

class _Player {
  final String token;
  String name;
  WebSocket? socket;
  final bool isHost;

  _Player(this.token, this.name, this.socket, this.isHost);
}

/// Servidor autoritativo que corre dentro del teléfono que crea la mesa.
class HostServer {
  final String code;

  /// Clave que solo conoce el cliente local del anfitrión.
  final String hostKey = randomToken();
  final Random? rng;

  HttpServer? _http;
  RawDatagramSocket? _udp;
  Timer? _announceTimer;
  final List<_Player> _players = [];
  String variantId;
  Map<String, int> options;
  CardGame? game;
  int port = gamePort;
  List<String> hosts = [];

  HostServer({required this.variantId, Map<String, int>? options, String? code, this.rng})
    : code = code ?? randomCode(),
      options = options ?? variantById(variantId).defaults();

  Variant get variant => variantById(variantId);
  bool get started => game != null;
  TableAddress get address => TableAddress(hosts, port, code);

  Future<void> start({bool announce = true, InternetAddress? bindAddress}) async {
    for (var p = gamePort; p < gamePort + 10; p++) {
      try {
        _http = await HttpServer.bind(bindAddress ?? InternetAddress.anyIPv4, p, shared: false);
        port = p;
        break;
      } on SocketException {
        continue;
      }
    }
    if (_http == null) throw StateError('No se pudo abrir el puerto de la mesa');
    _http!.listen(_onRequest, onError: (_) {});
    hosts = await localIPv4s();
    if (announce) await _startAnnouncing();
  }

  Future<void> stop() async {
    _announceTimer?.cancel();
    _udp?.close();
    for (final p in _players) {
      await p.socket?.close();
    }
    await _http?.close(force: true);
  }

  Future<void> _startAnnouncing() async {
    try {
      _udp = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      _udp!.broadcastEnabled = true;
    } on SocketException {
      return;
    }
    void send() {
      final msg = utf8.encode(Announcement(code, '', port, _hostName, variantId, _players.length).encode());
      final targets = <String>{'255.255.255.255'};
      for (final h in hosts) {
        final parts = h.split('.');
        targets.add('${parts[0]}.${parts[1]}.${parts[2]}.255');
      }
      for (final t in targets) {
        try {
          _udp?.send(msg, InternetAddress(t), discoveryPort);
        } catch (_) {}
      }
    }

    send();
    _announceTimer = Timer.periodic(const Duration(seconds: 1), (_) async {
      if (_announceTimer!.tick % 10 == 0) hosts = await localIPv4s();
      send();
    });
  }

  String get _hostName => _players.where((p) => p.isHost).map((p) => p.name).firstOrNull ?? 'Anfitrión';

  Future<void> _onRequest(HttpRequest req) async {
    req.response.headers.set('Access-Control-Allow-Origin', '*');
    if (req.uri.path == '/info') {
      req.response.headers.contentType = ContentType.json;
      req.response.write(
        jsonEncode({
          'app': 'mesaclasica',
          'code': code,
          'host': _hostName,
          'variant': variantId,
          'players': _players.length,
          'started': started,
        }),
      );
      await req.response.close();
      return;
    }
    if (req.uri.path == '/ws' && WebSocketTransformer.isUpgradeRequest(req)) {
      final ws = await WebSocketTransformer.upgrade(req);
      ws.pingInterval = const Duration(seconds: 5);
      ws.listen((data) => _onMessage(ws, data), onDone: () => _onClose(ws), onError: (_) => _onClose(ws));
      return;
    }
    req.response.statusCode = HttpStatus.notFound;
    await req.response.close();
  }

  _Player? _playerOf(WebSocket ws) => _players.where((p) => p.socket == ws).firstOrNull;

  void _send(WebSocket? ws, Map<String, dynamic> m) {
    if (ws == null) return;
    try {
      ws.add(encodeMsg(m));
    } catch (_) {}
  }

  void _error(WebSocket ws, String msg) => _send(ws, {'t': 'error', 'msg': msg});

  void _onMessage(WebSocket ws, dynamic data) {
    Map<String, dynamic> m;
    try {
      m = decodeMsg(data);
    } catch (_) {
      return;
    }
    if (m['t'] == 'hello') return _hello(ws, m);
    final p = _playerOf(ws);
    if (p == null) return _error(ws, 'Primero debes unirte');
    final seat = _players.indexOf(p);
    switch (m['t']) {
      case 'config':
        if (!p.isHost || started) return;
        final id = m['variant'] as String? ?? variantId;
        if (variants.every((v) => v.id != id)) return;
        if (id != variantId) options = variantById(id).defaults();
        variantId = id;
        final opts = (m['options'] as Map?)?.cast<String, dynamic>() ?? {};
        for (final o in variant.options) {
          final v = opts[o.key];
          if (v is int && o.values.contains(v)) options[o.key] = v;
        }
        _broadcastLobby();
      case 'start':
        if (!p.isHost || started) return;
        final n = _players.length;
        if (n < variant.minPlayers || n > variant.maxPlayers) {
          return _error(
            ws,
            variant.minPlayers == variant.maxPlayers
                ? '${variant.name} es para ${variant.minPlayers} jugadores'
                : '${variant.name} es para ${variant.minPlayers} a ${variant.maxPlayers} jugadores',
          );
        }
        game = variant.create([for (final x in _players) x.name], options, rng);
        for (var i = 0; i < n; i++) {
          game!.seats[i].connected = _players[i].socket != null;
        }
        _broadcastLobby();
        _broadcastState();
      case 'action':
        final g = game;
        if (g == null) return;
        try {
          g.apply(seat, (m['a'] as Map).cast<String, dynamic>());
        } on GameError catch (e) {
          return _error(ws, e.message);
        } catch (_) {
          return _error(ws, 'Acción inválida');
        }
        _broadcastState();
      case 'next':
        final g = game;
        if (g == null || g.phase != Phase.roundOver) return;
        g.nextRound();
        _broadcastState();
      case 'newGame':
        if (!p.isHost || game?.phase != Phase.gameOver) return;
        game = null;
        _broadcastLobby();
      case 'emote':
        final e = m['e'];
        if (e is! String || e.length > 16) return;
        for (final x in _players) {
          _send(x.socket, {'t': 'emote', 'seat': seat, 'e': e});
        }
    }
  }

  void _hello(WebSocket ws, Map<String, dynamic> m) {
    final token = m['token'] as String?;
    final name = ((m['name'] as String?) ?? '').trim();
    final existing = _players.where((p) => p.token == token).firstOrNull;
    if (existing != null) {
      existing.socket = ws;
      if (name.isNotEmpty && !started) existing.name = name;
      final seat = _players.indexOf(existing);
      if (started) game!.seats[seat].connected = true;
      _send(ws, {'t': 'welcome', 'token': existing.token, 'seat': seat, 'host': existing.isHost});
      _broadcastLobby();
      if (started) _broadcastState();
      return;
    }
    if (started) return _error(ws, 'La partida ya empezó');
    if (_players.length >= 4) return _error(ws, 'La mesa está llena');
    final isHost = m['hostKey'] == hostKey;
    var finalName = name.isEmpty ? 'Jugador ${_players.length + 1}' : name;
    if (finalName.length > 16) finalName = finalName.substring(0, 16);
    final p = _Player(randomToken(), finalName, ws, isHost);
    _players.add(p);
    _send(ws, {'t': 'welcome', 'token': p.token, 'seat': _players.length - 1, 'host': isHost});
    _broadcastLobby();
  }

  void _onClose(WebSocket ws) {
    final p = _playerOf(ws);
    if (p == null) return;
    p.socket = null;
    if (started) {
      game!.seats[_players.indexOf(p)].connected = false;
      _broadcastLobby();
      _broadcastState();
    } else if (!p.isHost) {
      _players.remove(p);
      _broadcastLobby();
    }
  }

  void _broadcastLobby() {
    final msg = {
      't': 'lobby',
      'code': code,
      'address': address.toUri(),
      'variant': variantId,
      'options': options,
      'started': started,
      'players': [
        for (final p in _players) {'name': p.name, 'connected': p.socket != null, 'host': p.isHost},
      ],
    };
    for (var i = 0; i < _players.length; i++) {
      _send(_players[i].socket, {...msg, 'you': i});
    }
  }

  void _broadcastState() {
    final g = game;
    if (g == null) return;
    for (var i = 0; i < _players.length; i++) {
      _send(_players[i].socket, {'t': 'state', 'view': g.viewFor(i)});
    }
  }
}
