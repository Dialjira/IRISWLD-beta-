import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import '../engine/game.dart';
import '../engine/pinch.dart';
import '../engine/variants.dart';
import '../profile.dart';
import 'ledger.dart';
import 'protocol.dart';

class _Player {
  final String token;
  String name;
  WebSocket? socket;
  final bool isHost;
  Profile profile;

  _Player(this.token, this.name, this.socket, this.isHost, this.profile);
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
  Timer? _deadlineTimer;
  DateTime? _armedFor;
  final List<_Player> _players = [];
  String variantId;
  Map<String, int> options;
  CardGame? game;
  BetRules bet = const BetRules();
  SessionLedger? ledger;
  List<int> _roundPlayers = [];
  bool _settled = false;
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
    _deadlineTimer?.cancel();
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

  void _error(WebSocket ws, String msg, {String? code}) => _send(ws, {'t': 'error', 'msg': msg, 'code': ?code});

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
        if (m['bet'] is Map) bet = BetRules.fromJson((m['bet'] as Map).cast<String, dynamic>());
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
        ledger = SessionLedger([for (final x in _players) x.profile], bet)..startGame();
        _roundPlayers = List.generate(n, (i) => i);
        _settled = false;
        _broadcastLobby();
        _broadcastState();
      case 'action':
        final g = game;
        if (g == null) return;
        try {
          g.apply(seat, (m['a'] as Map).cast<String, dynamic>());
        } on PinchWarning catch (e) {
          return _error(ws, e.message, code: 'pinchWarning');
        } on FaultWarning catch (e) {
          return _error(ws, e.message, code: 'faultWarning');
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
        ledger?.startRound();
        _roundPlayers = [
          for (var i = 0; i < g.seats.length; i++)
            if (!g.seats[i].eliminated) i,
        ];
        _settled = false;
        _broadcastState();
      case 'newGame':
        if (!p.isHost || game?.phase != Phase.gameOver) return;
        game = null;
        ledger = null;
        _broadcastLobby();
      case 'recharge':
        if (!p.profile.recharge()) {
          return _error(ws, 'Solo puedes recargar cuando tienes menos de ${formatChips(rechargeBelow)} fichas');
        }
        for (final x in _players) {
          _send(x.socket, {
            't': 'emote',
            'seat': seat,
            'e': 'Recargó fichas (${p.profile.recharges}ª vez)',
            'kind': 'text',
          });
        }
        _broadcastLobby();
        _broadcastState();
      case 'emote':
        final text = (m['e'] as String?)?.trim() ?? '';
        final isText = m['kind'] == 'text';
        if (text.isEmpty || text.length > (isText ? 80 : 16)) return;
        for (final x in _players) {
          _send(x.socket, {'t': 'emote', 'seat': seat, 'e': text, 'kind': isText ? 'text' : 'emoji'});
        }
    }
  }

  void _hello(WebSocket ws, Map<String, dynamic> m) {
    if (m['v'] != protocolVersion) {
      return _error(ws, 'Versión distinta de la app: todos deben instalar la misma versión de Mesa Clásica');
    }
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
    final profile = m['profile'] is Map
        ? Profile.fromJson((m['profile'] as Map).cast<String, dynamic>(), fallbackName: finalName)
        : Profile.fresh(finalName);
    profile.name = finalName;
    if (_players.any((x) => x.profile.deviceId == profile.deviceId)) {
      return _error(ws, 'Ese teléfono ya está en la mesa');
    }
    final p = _Player(randomToken(), finalName, ws, isHost, profile);
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
      'bet': bet.toJson(),
      'players': [
        for (final p in _players)
          {'name': p.name, 'connected': p.socket != null, 'host': p.isHost, 'profile': p.profile.publicJson()},
      ],
    };
    for (var i = 0; i < _players.length; i++) {
      _send(_players[i].socket, {...msg, 'you': i, 'me': _players[i].profile.toJson()});
    }
  }

  void _broadcastState() {
    final g = game;
    if (g == null) return;
    _settle(g);
    final table = {
      ...?ledger?.toJson(),
      'players': [for (final p in _players) p.profile.publicJson()],
    };
    for (var i = 0; i < _players.length; i++) {
      _send(_players[i].socket, {
        't': 'state',
        'view': g.viewFor(i),
        'table': table,
        'me': _players[i].profile.toJson(),
      });
    }
    _armDeadline(g);
  }

  /// Aplica fichas del pinchado y, al cerrar una ronda o partida, apuestas, ranking y trofeos.
  void _settle(CardGame g) {
    final l = ledger;
    if (l == null) return;
    if (g is Pinchable) l.applyMoves(g.takeChipMoves(), _roundPlayers);
    final over = g.phase == Phase.roundOver || g.phase == Phase.gameOver;
    if (!over || _settled) return;
    _settled = true;
    final v = g.viewFor(0);
    final r = (v['result'] as Map?)?.cast<String, dynamic>();
    final rules = (v['rules'] as Map?)?.cast<String, dynamic>() ?? const {};
    final penalty =
        rules['scoring'] == 'penaltyElimination' || rules['scoring'] == 'penaltyRounds' || rules['style'] == 'chinchon';
    if (r != null) {
      l.settleRound(
        winner: r['winner'] as int?,
        points: (r['points'] as List).cast<int>(),
        penaltyScoring: penalty,
        participants: _roundPlayers,
      );
    }
    if (g.phase == Phase.gameOver) {
      l.settleGame(winner: v['winner'] as int?, participants: List.generate(_players.length, (i) => i));
    }
  }

  /// Vigila el plazo del juego (p. ej. los 15 s para revisar una bajada).
  void _armDeadline(CardGame g) {
    final d = g.deadline;
    if (d == _armedFor) return;
    _deadlineTimer?.cancel();
    _armedFor = d;
    if (d == null) return;
    final wait = d.difference(DateTime.now());
    _deadlineTimer = Timer(wait.isNegative ? Duration.zero : wait, () {
      if (game != g) return;
      _armedFor = null;
      g.onDeadline();
      _broadcastState();
    });
  }
}
