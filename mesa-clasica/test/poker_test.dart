import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:mesa_clasica/engine/cards.dart';
import 'package:mesa_clasica/engine/game.dart';
import 'package:mesa_clasica/engine/melds.dart';
import 'package:mesa_clasica/engine/pinch.dart';
import 'package:mesa_clasica/engine/poker_rummy.dart';
import 'package:mesa_clasica/engine/table_rummy.dart';
import 'package:mesa_clasica/engine/variants.dart';

var _id = 9000;
PlayingCard c(int rank, Suit s) => PlayingCard(_id++, s, rank);
const P = Suit.picas, C = Suit.corazones, D = Suit.diamantes, T = Suit.treboles;
List<int> ids(List<PlayingCard> cs) => [for (final x in cs) x.id];

class Clock {
  DateTime t = DateTime(2026);
  DateTime call() => t;
}

PokerRummy poker(int players, [Map<String, int>? opts, Clock? clock]) {
  final v = variantById('poker');
  final o = {...v.defaults(), 'warn': 0, ...?opts};
  return PokerRummy(
    PokerConfig(
      variant: 'poker',
      rules: meldRulesFor('poker', o),
      jokers: o['jokers']!,
      minDown: o['min']!,
      payWholeHand: o['pay'] == 1,
      fullHand: o['full'] == 1,
      target: o['target']!,
      pinch: pinchRulesFrom(o),
      value: pokerValue,
    ),
    List.generate(players, (i) => 'J$i'),
    rng: Random(1),
    now: clock?.call,
  );
}

TableRummy la51(int players, [Map<String, int>? opts]) {
  final v = variantById('la51');
  return v.create(List.generate(players, (i) => 'J$i'), {...v.defaults(), 'warn': 0, ...?opts}, Random(1))
      as TableRummy;
}

/// La mano de la foto: 6-6-6, 4-4-4, K-A-2 de corazones, 7-8-9 de picas y K-K-K.
List<List<PlayingCard>> photoHand() => [
  [c(6, T), c(6, P), c(6, C)],
  [c(4, T), c(4, C), c(4, P)],
  [c(13, C), c(1, C), c(2, C)],
  [c(7, P), c(8, P), c(9, P)],
  [c(13, T), c(13, D), c(13, P)],
];

void main() {
  group('Escaleras con vuelta', () {
    final wrap = meldRulesFor('poker', {'run': 3, 'wrap': 1});
    final noWrap = meldRulesFor('poker', {'run': 3, 'wrap': 0});
    test('K-A-2 y Q-K-A valen con vuelta; sin vuelta solo Q-K-A', () {
      expect(analyzeMeld([c(13, C), c(1, C), c(2, C)], wrap)?.type, MeldType.run);
      expect(analyzeMeld([c(12, C), c(13, C), c(1, C), c(2, C), c(3, C)], wrap), isNotNull);
      expect(analyzeMeld([c(12, C), c(13, C), c(1, C)], noWrap), isNotNull);
      expect(analyzeMeld([c(13, C), c(1, C), c(2, C)], noWrap), isNull);
      expect(analyzeMeld([c(13, C), c(2, C), c(3, C)], wrap), isNull);
    });
  });

  group('Póker colombiano', () {
    test('reparte 14 cartas con 2 barajas', () {
      final g = poker(4);
      expect(g.seats[0].hand.length, 14);
      expect(g.stock.length, 104 - 56 - 1);
    });

    test('la mano de la foto se baja (106 puntos) y gana la ronda', () {
      final g = poker(2);
      final groups = photoHand();
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = groups.expand((x) => x).toList();
      g.seats[1].hand = [c(9, D), c(3, T), c(12, C)];
      expect(g.bestDown(g.seats[0].hand), isNotNull);
      g.apply(0, {
        'type': 'goDown',
        'groups': [for (final x in groups) ids(x)],
      });
      expect(g.phase, Phase.roundOver);
      expect(g.result!.winner, 0);
      expect(g.result!.points, [0, 9 + 3 + 10]);
    });

    test('sin pinchado: bajada incompleta o tomar descarte inútil se bloquean', () {
      final g = poker(2, {'full': 1});
      final groups = photoHand();
      g.current = 0;
      g.phase = Phase.play;
      final hand = groups.expand((x) => x).toList()..removeLast();
      g.seats[0].hand = [...hand, c(9, D)];
      expect(
        () => g.apply(0, {
          'type': 'goDown',
          'groups': [
            ...[for (final x in groups.take(4)) ids(x)],
            ids(g.seats[0].hand.sublist(12)),
          ],
        }),
        throwsA(isA<GameError>()),
      );
      g.phase = Phase.draw;
      g.seats[0].hand = [c(2, P), c(5, D)];
      g.discard = [c(9, T)];
      expect(() => g.apply(0, {'type': 'drawDiscard'}), throwsA(isA<GameError>()));
    });

    test('con pinchado: tomar el descarte y botar es falta y se puede pinchar', () {
      final g = poker(3, {'pinch': 1, 'penalty': 0});
      g.current = 0;
      g.phase = Phase.draw;
      g.seats[0].hand = [c(2, P), c(5, D)];
      g.discard = [c(9, T)];
      g.apply(0, {'type': 'drawDiscard'});
      g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.first.id});
      expect(g.current, 1);
      g.apply(2, {'type': 'pinch'});
      expect(g.roundOut[0], isTrue);
      expect(g.event, contains('pinchó'));
      expect(g.faults.single.pinched, isTrue);
    });

    test('la ventana se cierra cuando termina el turno siguiente', () {
      final g = poker(3, {'pinch': 1, 'penalty': 25, 'window': 1});
      g.current = 0;
      g.phase = Phase.draw;
      g.seats[0].hand = [c(2, P), c(5, D)];
      g.discard = [c(9, T)];
      g.apply(0, {'type': 'drawDiscard'});
      g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.first.id});
      g.apply(1, {'type': 'drawStock'});
      g.apply(1, {'type': 'discard', 'card': g.seats[1].hand.first.id});
      // Ya no hay falta abierta: advertencia, y si insiste, sale de la partida.
      expect(() => g.apply(2, {'type': 'pinch'}), throwsA(isA<PinchWarning>()));
      expect(g.seats[2].eliminated, isFalse);
      g.apply(2, {'type': 'pinch', 'force': true});
      expect(g.seats[2].eliminated, isTrue);
      expect(g.seats[0].score, 0);
    });

    test('bajada mal armada: revisión, pinchazo y castigo', () {
      final clock = Clock();
      final g = poker(3, {'pinch': 1, 'penalty': 50}, clock);
      final groups = photoHand();
      groups[3] = [c(7, P), c(8, P), c(10, P)];
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = groups.expand((x) => x).toList();
      g.apply(0, {
        'type': 'goDown',
        'groups': [for (final x in groups) ids(x)],
      });
      expect(g.phase, Phase.review);
      expect(g.viewFor(1)['down'], isNotNull);
      g.apply(2, {'type': 'pinch'});
      expect(g.seats[0].score, 50);
      expect(g.phase, Phase.play);
      expect(g.current, 0);
      expect(g.seats[0].hand.length, 15);
    });

    test('bajada buena pinchada en falso: castiga al que pinchó y gana el que se bajó', () {
      final g = poker(3, {'pinch': 1, 'penalty': 25});
      final groups = photoHand();
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = groups.expand((x) => x).toList();
      g.apply(0, {
        'type': 'goDown',
        'groups': [for (final x in groups) ids(x)],
      });
      expect(() => g.apply(1, {'type': 'pinch'}), throwsA(isA<PinchWarning>()));
      g.apply(1, {'type': 'pinch', 'force': true});
      expect(g.phase, Phase.roundOver);
      expect(g.result!.winner, 0);
      expect(g.seats[1].eliminated, isTrue);
    });

    test('si nadie pincha en 15 segundos, la bajada (aunque mala) se queda', () {
      final clock = Clock();
      final g = poker(2, {'pinch': 1}, clock);
      final groups = photoHand();
      groups[3] = [c(7, P), c(8, P), c(10, P)];
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = groups.expand((x) => x).toList();
      g.apply(0, {
        'type': 'goDown',
        'groups': [for (final x in groups) ids(x)],
      });
      expect(g.deadline, clock.t.add(const Duration(seconds: 15)));
      clock.t = clock.t.add(const Duration(seconds: 16));
      g.onDeadline();
      expect(g.phase, Phase.roundOver);
      expect(g.result!.winner, 0);
      expect((g.result!.toJson()['faults'] as List).single['pinched'], isFalse);
    });

    test('regla de 51: te bajas con juegos de 51 y las sueltas se quedan en la mano', () {
      // La mano de la captura: 2-2-2, 5-5-5, 6-7-8-9 de tréboles (51) y 4 sueltas.
      final groups = [
        [c(2, P), c(2, C), c(2, T)],
        [c(5, P), c(5, D), c(5, T)],
        [c(6, T), c(7, T), c(8, T), c(9, T)],
      ];
      final loose = [c(1, C), c(9, C), c(10, P), c(10, P), c(4, D)];
      final full = poker(2, {'full': 1});
      final hand = [...groups.expand((x) => x), ...loose];
      expect(full.bestDown(hand), isNull);
      final g = poker(2);
      expect(g.bestDown(hand), isNotNull);
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = [...hand];
      g.seats[1].hand = [c(3, D)];
      g.apply(0, {
        'type': 'goDown',
        'groups': [for (final x in groups) ids(x)],
      });
      expect(g.phase, Phase.roundOver);
      expect(g.result!.winner, 0);
      expect(g.result!.points, [0, 3]);
      expect((g.result!.toJson()['dead'] as List)[0], hasLength(5));
      // Con 50 no alcanza.
      final h = poker(2);
      h.current = 0;
      h.phase = Phase.play;
      final low = [
        [c(2, P), c(2, C), c(2, T)],
        [c(5, P), c(5, D), c(5, T)],
      ];
      h.seats[0].hand = [...low.expand((x) => x), c(9, D)];
      expect(
        () => h.apply(0, {
          'type': 'goDown',
          'groups': [for (final x in low) ids(x)],
        }),
        throwsA(isA<GameError>()),
      );
    });

    test('castigo pactado en fichas: el pinchado paga al que pinchó', () {
      final g = poker(3, {'pinch': 1, 'penalty': 50000, 'false': 3});
      g.current = 0;
      g.phase = Phase.draw;
      g.seats[0].hand = [c(2, P), c(5, D)];
      g.discard = [c(9, T)];
      g.apply(0, {'type': 'drawDiscard'});
      g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.first.id});
      g.apply(2, {'type': 'pinch'});
      final moves = g.takeChipMoves();
      expect(moves.single.from, 0);
      expect(moves.single.to, 2);
      expect(moves.single.amount, 50000);
      g.apply(1, {'type': 'pinch', 'force': true});
      expect(g.takeChipMoves().single.amount, 50000);
    });

    test('pinchado automático: la app castiga sola y no se puede pinchar a mano', () {
      final g = poker(3, {'pinch': 2, 'penalty': 25});
      g.current = 0;
      g.phase = Phase.draw;
      g.seats[0].hand = [c(2, P), c(5, D)];
      g.discard = [c(9, T)];
      g.apply(0, {'type': 'drawDiscard'});
      g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.first.id});
      expect(g.seats[0].score, 25);
      expect(g.faults.single.by, -1);
      expect(g.event, contains('automático'));
      expect(() => g.apply(1, {'type': 'pinch'}), throwsA(isA<GameError>()));
    });

    test('pinchado automático: bajada mala no vale y sigue el turno', () {
      final g = poker(2, {'pinch': 2, 'penalty': 50});
      final groups = photoHand();
      groups[3] = [c(7, P), c(8, P), c(10, P)];
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = groups.expand((x) => x).toList();
      g.apply(0, {
        'type': 'goDown',
        'groups': [for (final x in groups) ids(x)],
      });
      expect(g.phase, Phase.play);
      expect(g.seats[0].score, 50);
    });

    test('sin pinchado no se puede pinchar', () {
      final g = poker(2);
      expect(() => g.apply(1, {'type': 'pinch'}), throwsA(isA<GameError>()));
    });
  });

  group('Plazo y avisos del pinchado', () {
    /// D se baja con 33 (falta) y bota; devuelve la partida lista para el turno de N.
    TableRummy faultyDown(Map<String, int> opts) {
      final g = la51(2, {'pinch': 1, 'penalty': 25, ...opts});
      final clubs = [c(3, T), c(4, T), c(5, T)];
      final mix = [c(3, P), c(3, C), c(3, D), c(4, P), c(4, C), c(4, D)];
      g.current = 0;
      g.phase = Phase.draw;
      g.seats[0].hand = [...clubs, ...mix, c(6, C), c(9, T)];
      g.seats[1].hand = [c(2, D), c(7, P), c(8, P)];
      g.stock = [for (var i = 0; i < 10; i++) c(13, D)];
      g.apply(0, {'type': 'drawStock'});
      g.apply(0, {
        'type': 'meld',
        'groups': [ids(clubs), ids(mix)],
        'risk': true,
      });
      g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.last.id});
      return g;
    }

    test('por defecto se puede pinchar hasta que vuelve a jugar el que falló', () {
      final g = faultyDown({});
      g.apply(1, {'type': 'drawStock'});
      g.apply(1, {'type': 'discard', 'card': g.seats[1].hand.first.id});
      g.apply(0, {'type': 'drawStock'});
      g.apply(1, {'type': 'pinch'});
      expect(g.seats[0].score, 25);
    });

    test('con plazo corto, pinchar tarde explica que el plazo terminó', () {
      final g = faultyDown({'window': 1});
      g.apply(1, {'type': 'drawStock'});
      g.apply(1, {'type': 'discard', 'card': g.seats[1].hand.first.id});
      expect(
        () => g.apply(1, {'type': 'pinch'}),
        throwsA(isA<PinchWarning>().having((e) => e.message, 'mensaje', contains('plazo'))),
      );
    });

    test('toda la ronda: se puede pinchar mucho después', () {
      final g = faultyDown({'window': 3});
      for (var k = 0; k < 3; k++) {
        g.apply(1, {'type': 'drawStock'});
        g.apply(1, {'type': 'discard', 'card': g.seats[1].hand.first.id});
        g.apply(0, {'type': 'drawStock'});
        g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.first.id});
      }
      g.apply(1, {'type': 'pinch'});
      expect(g.seats[0].score, 25);
    });

    test('nadie se puede pinchar a sí mismo', () {
      final g = faultyDown({});
      expect(
        () => g.apply(0, {'type': 'pinch'}),
        throwsA(
          isA<GameError>()
              .having((e) => e, 'no es advertencia', isNot(isA<PinchWarning>()))
              .having((e) => e.message, 'mensaje', contains('tuya')),
        ),
      );
    });

    test('aviso privado antes de cometer una falta; arriesgarse la comete', () {
      final g = la51(2, {'pinch': 1, 'warn': 1});
      final low = [c(2, P), c(3, P), c(4, P)];
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = [...low, c(9, C)];
      expect(
        () => g.apply(0, {
          'type': 'meld',
          'groups': [ids(low)],
        }),
        throwsA(isA<FaultWarning>().having((e) => e.message, 'mensaje', contains('te pueden pinchar'))),
      );
      expect(g.melds, isEmpty);
      g.apply(0, {
        'type': 'meld',
        'groups': [ids(low)],
        'risk': true,
      });
      expect(g.melds.length, 1);
      expect(g.faults.length, 1);
    });

    test('sin aviso privado la falta pasa en silencio', () {
      final g = la51(2, {'pinch': 1, 'warn': 0});
      final low = [c(2, P), c(3, P), c(4, P)];
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = [...low, c(9, C)];
      g.apply(0, {
        'type': 'meld',
        'groups': [ids(low)],
      });
      expect(g.faults.length, 1);
    });
  });

  group('La 51', () {
    void setup(TableRummy g, List<PlayingCard> hand) {
      g.current = 0;
      g.phase = Phase.play;
      g.meldedAtTurnStart = false;
      g.seats[0].hand = [...hand];
      g.stock = [c(13, D), c(12, D), c(2, T), c(3, D)];
      g.discard = [c(9, D)];
    }

    test('primera bajada menor a 51: bloqueada sin pinchado, falta con pinchado', () {
      final low = [c(2, P), c(3, P), c(4, P)];
      final g = la51(2);
      setup(g, [...low, c(9, C)]);
      expect(
        () => g.apply(0, {
          'type': 'meld',
          'groups': [ids(low)],
        }),
        throwsA(isA<GameError>()),
      );
      final p = la51(3, {'pinch': 1, 'penalty': 25});
      final low2 = [c(2, P), c(3, P), c(4, P)];
      setup(p, [...low2, c(9, C)]);
      p.apply(0, {
        'type': 'meld',
        'groups': [ids(low2)],
      });
      expect(p.melds.length, 1);
      p.apply(1, {'type': 'pinch'});
      expect(p.seats[0].score, 25);
    });

    test('botar una carta que entra en un juego de la mesa', () {
      final g = la51(2);
      final run = [c(4, P), c(5, P), c(6, P)];
      g.melds.add(TableMeld(1, analyzeMeld(run, g.rules)!, {}));
      final seven = c(7, P);
      setup(g, [seven, c(9, C)]);
      g.hasMelded[0] = true;
      expect(() => g.apply(0, {'type': 'discard', 'card': seven.id}), throwsA(isA<GameError>()));
      final p = la51(2, {'pinch': 1});
      p.melds.add(TableMeld(1, analyzeMeld([c(4, P), c(5, P), c(6, P)], p.rules)!, {}));
      final seven2 = c(7, P);
      setup(p, [seven2, c(9, C)]);
      p.hasMelded[0] = true;
      p.apply(0, {'type': 'discard', 'card': seven2.id});
      p.apply(1, {'type': 'pinch'});
      expect(p.phase, Phase.roundOver);
      expect(p.result!.winner, 1);
    });

    test('tomar el descarte obliga a usarlo', () {
      final g = la51(2);
      g.current = 0;
      g.phase = Phase.draw;
      g.seats[0].hand = [c(2, P), c(9, C)];
      g.discard = [c(13, D)];
      expect(() => g.apply(0, {'type': 'drawDiscard'}), throwsA(isA<GameError>()));
    });
  });
}
