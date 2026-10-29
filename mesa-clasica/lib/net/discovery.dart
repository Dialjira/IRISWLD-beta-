import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

import 'protocol.dart';

const _channel = MethodChannel('mesaclasica/net');

/// En Android hace falta un MulticastLock para recibir anuncios por broadcast.
Future<void> setMulticastLock(bool on) async {
  try {
    await _channel.invokeMethod(on ? 'acquireMulticast' : 'releaseMulticast');
  } catch (_) {}
}

/// Escucha las mesas que se anuncian en la red local.
class TableScanner {
  RawDatagramSocket? _socket;
  final _found = <String, Announcement>{};
  final _seen = <String, DateTime>{};
  final _controller = StreamController<List<Announcement>>.broadcast();
  Timer? _prune;

  Stream<List<Announcement>> get tables => _controller.stream;
  List<Announcement> get current => _found.values.toList();

  Future<void> start() async {
    await setMulticastLock(true);
    try {
      _socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, discoveryPort, reuseAddress: true);
      _socket!.broadcastEnabled = true;
      _socket!.listen((e) {
        if (e != RawSocketEvent.read) return;
        final d = _socket?.receive();
        if (d == null) return;
        final a = Announcement.decode(utf8.decode(d.data, allowMalformed: true), d.address.address);
        if (a == null) return;
        _found[a.code] = a;
        _seen[a.code] = DateTime.now();
        _controller.add(current);
      });
    } on SocketException {
      // Sin broadcast: queda la búsqueda por subred.
    }
    _prune = Timer.periodic(const Duration(seconds: 2), (_) {
      final now = DateTime.now();
      final before = _found.length;
      _seen.removeWhere((code, t) {
        final old = now.difference(t).inSeconds > 5;
        if (old) _found.remove(code);
        return old;
      });
      if (before != _found.length) _controller.add(current);
    });
  }

  Future<void> stop() async {
    _prune?.cancel();
    _socket?.close();
    await _controller.close();
    await setMulticastLock(false);
  }
}

/// Busca una mesa por código: primero por anuncio y en paralelo sondeando la subred.
Future<TableAddress?> findTableByCode(String code, {Duration timeout = const Duration(seconds: 10)}) async {
  code = code.toUpperCase().trim();
  final result = Completer<TableAddress?>();
  final scanner = TableScanner();
  await scanner.start();
  final hit = scanner.current.where((a) => a.code == code).firstOrNull;
  if (hit != null) {
    await scanner.stop();
    return TableAddress([hit.host], hit.port, code);
  }
  final sub = scanner.tables.listen((list) {
    final a = list.where((a) => a.code == code).firstOrNull;
    if (a != null && !result.isCompleted) result.complete(TableAddress([a.host], a.port, code));
  });
  unawaited(
    _scanSubnets(code, () => result.isCompleted).then((a) {
      if (a != null && !result.isCompleted) result.complete(a);
    }),
  );
  final timer = Timer(timeout, () {
    if (!result.isCompleted) result.complete(null);
  });
  final found = await result.future;
  timer.cancel();
  await sub.cancel();
  await scanner.stop();
  return found;
}

Future<TableAddress?> _scanSubnets(String code, bool Function() done) async {
  final ips = await localIPv4s();
  final client = HttpClient()..connectionTimeout = const Duration(milliseconds: 700);
  try {
    for (final ip in ips) {
      final base = ip.substring(0, ip.lastIndexOf('.'));
      final targets = [for (var h = 1; h < 255; h++) '$base.$h'];
      // Lotes en paralelo para no saturar el teléfono.
      for (var i = 0; i < targets.length; i += 48) {
        if (done()) return null;
        final batch = targets.sublist(i, (i + 48).clamp(0, targets.length));
        final res = await Future.wait(batch.map((h) => _probe(client, h, code)));
        final hit = res.whereType<TableAddress>().firstOrNull;
        if (hit != null) return hit;
      }
    }
  } finally {
    client.close(force: true);
  }
  return null;
}

Future<TableAddress?> _probe(HttpClient client, String host, String code) async {
  try {
    final req = await client.get(host, gamePort, '/info');
    final res = await req.close().timeout(const Duration(seconds: 1));
    final body = await res.transform(utf8.decoder).join().timeout(const Duration(seconds: 1));
    final j = jsonDecode(body) as Map<String, dynamic>;
    if (j['app'] == 'mesaclasica' && j['code'] == code) return TableAddress([host], gamePort, code);
  } catch (_) {}
  return null;
}
