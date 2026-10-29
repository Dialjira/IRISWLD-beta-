import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mesa_clasica/net/client.dart';
import 'package:mesa_clasica/net/host_server.dart';
import 'package:mesa_clasica/net/protocol.dart';

Future<void> until(bool Function() cond) async {
  for (var i = 0; i < 200 && !cond(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 20));
  }
  expect(cond(), isTrue);
}

void main() {
  test('QR: dirección ida y vuelta', () {
    const a = TableAddress(['192.168.1.5', '10.0.0.2'], 47800, 'ABCD');
    final b = TableAddress.parse(a.toUri())!;
    expect(b.hosts, a.hosts);
    expect(b.code, 'ABCD');
    expect(TableAddress.parse('https://evil'), isNull);
  });

  test('anfitrión + 2 invitados: sala, inicio, vistas privadas, error y reconexión', () async {
    final server = HostServer(variantId: 'colombiano');
    await server.start(announce: false, bindAddress: InternetAddress.loopbackIPv4);
    GameClient mk(String name, {String? key}) =>
        GameClient(hosts: ['127.0.0.1'], port: server.port, name: name, hostKey: key);
    final host = mk('Ana', key: server.hostKey);
    final b = mk('Beto');
    final c = mk('Caro');
    await host.connect();
    await until(() => host.isHost);
    await b.connect();
    await c.connect();
    await until(() => (host.lobby?['players'] as List?)?.length == 3);
    expect(b.isHost, isFalse);

    // Un invitado no puede iniciar ni configurar.
    b.startGame();
    b.configure('gin', {});
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(host.lobby!['started'], isFalse);
    expect(host.lobby!['variant'], 'colombiano');

    // Gin es solo para 2: debe dar error.
    host.configure('gin', {});
    await until(() => host.lobby!['variant'] == 'gin');
    final err = host.errors.first;
    host.startGame();
    expect(await err.timeout(const Duration(seconds: 2)), contains('2 jugadores'));

    host.configure('colombiano', {'first': 0});
    await until(() => host.lobby!['variant'] == 'colombiano' && (host.lobby!['options'] as Map)['first'] == 0);
    host.startGame();
    await until(() => host.view != null && b.view != null && c.view != null);
    expect((b.view!['hand'] as List).length, 9);
    expect(b.view!['me'], 1);
    expect(b.view!.containsKey('hands'), isFalse);

    // Jugar fuera de turno da error solo a quien lo intentó.
    final current = host.view!['current'] as int;
    final wrong = [host, b, c][(current + 1) % 3];
    final e2 = wrong.errors.first;
    wrong.action({'type': 'drawStock'});
    expect(await e2.timeout(const Duration(seconds: 2)), 'No es tu turno');

    // Turno válido se refleja en todos.
    final right = [host, b, c][current];
    right.action({'type': 'drawStock'});
    await until(() => c.view!['phase'] == 'play');

    // Reconexión: el invitado cae y vuelve con su token al mismo puesto.
    final token = c.token;
    final c2 = GameClient(hosts: ['127.0.0.1'], port: server.port, name: 'Caro');
    c2.token = token;
    await c.close();
    await until(() => ((host.view!['players'] as List)[2] as Map)['connected'] == false);
    await c2.connect();
    await until(() => c2.view != null);
    expect(c2.view!['me'], 2);
    expect(((host.view!['players'] as List)[2] as Map)['connected'], isTrue);

    // Nadie nuevo puede entrar con la partida empezada.
    final d = mk('Dani');
    await d.connect();
    expect(await d.errors.first.timeout(const Duration(seconds: 2)), contains('ya empezó'));

    await Future.wait([host.close(), b.close(), c2.close(), d.close()]);
    await server.stop();
  });
}
