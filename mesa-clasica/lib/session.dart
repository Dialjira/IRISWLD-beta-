import 'package:shared_preferences/shared_preferences.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'net/client.dart';
import 'net/host_server.dart';
import 'net/protocol.dart';

/// Partida en curso: el servidor (si este teléfono es anfitrión) y la conexión del jugador.
class Session {
  final HostServer? server;
  final GameClient client;

  Session._(this.server, this.client);

  bool get isHost => server != null;

  /// Crea la mesa en este teléfono y se conecta a ella.
  static Future<Session> host(String name, {String variant = 'colombiano'}) async {
    final server = HostServer(variantId: variant);
    await server.start();
    final client = GameClient(hosts: ['127.0.0.1'], port: server.port, name: name, hostKey: server.hostKey);
    try {
      await client.connect();
    } catch (_) {
      await server.stop();
      rethrow;
    }
    await _keepAwake(true);
    return Session._(server, client);
  }

  static Future<Session> join(TableAddress address, String name) async {
    final client = GameClient(hosts: address.hosts, port: address.port, name: name);
    await client.connect();
    await _keepAwake(true);
    return Session._(null, client);
  }

  Future<void> end() async {
    await client.close();
    await server?.stop();
    await _keepAwake(false);
  }

  static Future<void> _keepAwake(bool on) async {
    try {
      await WakelockPlus.toggle(enable: on);
    } catch (_) {}
  }
}

Future<String> loadName() async {
  final p = await SharedPreferences.getInstance();
  return p.getString('name') ?? '';
}

Future<void> saveName(String name) async {
  final p = await SharedPreferences.getInstance();
  await p.setString('name', name);
}
