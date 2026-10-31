import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mesa_clasica/net/client.dart';
import 'package:mesa_clasica/net/host_server.dart';
import 'package:mesa_clasica/engine/cards.dart';
import 'package:mesa_clasica/engine/game.dart';
import 'package:mesa_clasica/engine/table_rummy.dart';
import 'package:mesa_clasica/net/protocol.dart';
import 'package:mesa_clasica/profile.dart';

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

  test('apuesta pactada: al cerrar la ronda el perdedor paga y se guarda el perfil', () async {
    final server = HostServer(variantId: 'clasico');
    await server.start(announce: false, bindAddress: InternetAddress.loopbackIPv4);
    final saved = <String, Map<String, dynamic>>{};
    GameClient mk(String name, {String? key}) {
      final prof = Profile.fresh(name).toJson();
      return GameClient(
        hosts: ['127.0.0.1'],
        port: server.port,
        name: name,
        hostKey: key,
        profile: prof,
        onProfile: (me) => saved[name] = me,
      );
    }

    final a = mk('Ana', key: server.hostKey);
    final b = mk('Beto');
    await a.connect();
    await until(() => a.isHost);
    await b.connect();
    await until(() => (a.lobby?['players'] as List?)?.length == 2);
    final pub = ((a.lobby!['players'] as List)[1] as Map)['profile'] as Map;
    expect(pub['chips'], 1000000);
    expect(pub['level'], 'Aficionado');

    a.configureBet('clasico', {}, {'mode': 'round', 'amount': 50000});
    await until(() => (a.lobby!['bet'] as Map)['mode'] == 'round');
    a.startGame();
    await until(() => a.view != null && b.view != null);

    // Ana se queda con una sola carta y la descarta: gana la ronda.
    final g = server.game as TableRummy;
    g.current = 0;
    g.phase = Phase.play;
    g.seats[0].hand = [const PlayingCard(900, Suit.picas, 9)];
    a.action({'type': 'discard', 'card': 900});
    await until(() => b.view?['phase'] == 'roundOver' || b.view?['phase'] == 'gameOver');
    expect((b.table!['chips'] as List), [50000, -50000]);
    await until(() => saved['Beto']?['chips'] == 950000);
    expect(saved['Ana']!['roundWins'], 1);

    // Recarga: con saldo alto no se puede.
    final err = b.errors.first;
    b.recharge();
    expect(await err.timeout(const Duration(seconds: 2)), contains('menos de'));

    await Future.wait([a.close(), b.close()]);
    await server.stop();
  });

  test('una versión distinta de la app no puede entrar', () async {
    final server = HostServer(variantId: 'clasico');
    await server.start(announce: false, bindAddress: InternetAddress.loopbackIPv4);
    final ws = await WebSocket.connect('ws://127.0.0.1:${server.port}/ws');
    ws.add(encodeMsg({'t': 'hello', 'name': 'Viejo'}));
    final reply = decodeMsg(await ws.first.timeout(const Duration(seconds: 2)));
    expect(reply['msg'], contains('Versión distinta'));
    await ws.close();
    await server.stop();
  });
}
