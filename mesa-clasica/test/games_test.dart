import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:mesa_clasica/engine/arrangement.dart';
import 'package:mesa_clasica/engine/cards.dart';
import 'package:mesa_clasica/engine/game.dart';
import 'package:mesa_clasica/engine/knock_rummy.dart';
import 'package:mesa_clasica/engine/melds.dart';
import 'package:mesa_clasica/engine/poker_rummy.dart';
import 'package:mesa_clasica/engine/table_rummy.dart';
import 'package:mesa_clasica/engine/variants.dart';

var _id = 5000;
PlayingCard c(int rank, Suit s) => PlayingCard(_id++, s, rank);
PlayingCard jk() => PlayingCard.joker(_id++);
const P = Suit.picas, C = Suit.corazones, D = Suit.diamantes, T = Suit.treboles;
List<int> ids(List<PlayingCard> cs) => [for (final x in cs) x.id];

TableRummy table(String id, int players, [Map<String, int>? opts]) {
  final v = variantById(id);
  return v.create(List.generate(players, (i) => 'J$i'), {...v.defaults(), ...?opts}, Random(1)) as TableRummy;
}

KnockRummy knock(String id, int players, [Map<String, int>? opts]) {
  final v = variantById(id);
  return v.create(List.generate(players, (i) => 'J$i'), {...v.defaults(), ...?opts}, Random(1)) as KnockRummy;
}

/// Deja la mesa lista para que el asiento 0 juegue con [hand] tras robar [draw].
void setup(TableRummy g, List<PlayingCard> hand, {List<PlayingCard>? others, PlayingCard? draw}) {
  g.current = 0;
  g.phase = Phase.draw;
  g.meldedAtTurnStart = g.hasMelded[0];
  g.seats[0].hand = [...hand];
  for (var i = 1; i < g.seats.length; i++) {
    g.seats[i].hand = [...?others];
  }
  g.stock = [c(13, D), c(12, D), draw ?? c(2, T)];
  g.discard = [c(9, D)];
}

void main() {
  group('Rummy Colombiano', () {
    test('reparte 10 cartas a 2 jugadores y 9 a 3', () {
      expect(table('colombiano', 2).seats[0].hand.length, 10);
      expect(table('colombiano', 3).seats[0].hand.length, 9);
      expect(table('colombiano', 2).stock.length, 108 - 20 - 1);
    });

    test('la primera bajada exige el mínimo de puntos', () {
      final g = table('colombiano', 2);
      final low = [c(2, P), c(3, P), c(4, P)];
      setup(g, [...low, c(9, C), c(13, T)], others: [c(5, D)]);
      g.apply(0, {'type': 'drawStock'});
      expect(
        () => g.apply(0, {
          'type': 'meld',
          'groups': [ids(low)],
        }),
        throwsA(isA<GameError>()),
      );
      final high = [c(10, C), c(11, C), c(12, C)];
      g.seats[0].hand.addAll(high);
      g.apply(0, {
        'type': 'meld',
        'groups': [ids(low), ids(high)],
      });
      expect(g.melds.length, 2);
      expect(g.hasMelded[0], isTrue);
    });

    test('no se puede tomar el turno de otro', () {
      final g = table('colombiano', 2);
      g.current = 0;
      expect(() => g.apply(1, {'type': 'drawStock'}), throwsA(isA<GameError>()));
    });

    test('Rummy (bajar todo de una) cobra doble a los demás', () {
      final g = table('colombiano', 2);
      final a = [c(13, P), c(13, C), c(13, D)];
      final b = [c(10, T), c(11, T), c(12, T)];
      setup(g, [...a, ...b], others: [c(9, P), c(5, C)], draw: c(4, D));
      g.apply(0, {'type': 'drawStock'});
      g.apply(0, {
        'type': 'meld',
        'groups': [ids(a), ids(b)],
      });
      g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.single.id});
      expect(g.phase, Phase.roundOver);
      expect(g.seats[1].score, (9 + 5) * 2);
      expect(g.result!.headline, contains('RUMMY'));
    });

    test('cambiar un comodín de la mesa por la carta real', () {
      final g = table('colombiano', 2);
      final joker = jk();
      final real = c(8, C);
      setup(g, [real, c(2, D), c(3, D)], others: [c(5, D)]);
      g.melds.add(TableMeld(1, analyzeMeldOrFail([c(7, C), joker, c(9, C)]), {}));
      g.hasMelded[0] = true;
      g.apply(0, {'type': 'drawStock'});
      g.apply(0, {'type': 'swapJoker', 'meld': 0, 'card': real.id});
      expect(g.seats[0].hand.contains(joker), isTrue);
      expect(g.melds[0].meld.cards.contains(real), isTrue);
    });

    test('quien llega a la meta queda eliminado y gana el último', () {
      final g = table('colombiano', 2, {'target': 100});
      final a = [c(13, P), c(13, C), c(13, D)];
      setup(g, [...a, c(2, C)], others: [for (var i = 0; i < 12; i++) c(13, T)]);
      g.hasMelded[0] = true;
      g.meldedAtTurnStart = true;
      g.apply(0, {'type': 'drawStock'});
      g.apply(0, {
        'type': 'meld',
        'groups': [ids(a)],
      });
      g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.firstWhere((x) => x.rank == 2 && x.suit == T).id});
      final last = g.seats[0].hand.single;
      expect(g.phase, Phase.draw);
      g.current = 0;
      g.phase = Phase.play;
      g.apply(0, {'type': 'discard', 'card': last.id});
      expect(g.seats[1].eliminated, isTrue);
      expect(g.phase, Phase.gameOver);
      expect(g.gameWinner, 0);
    });
  });

  group('Continental', () {
    test('ronda 1 reparte 6 cartas y exige 2 tríos', () {
      final g = table('continental', 3);
      expect(g.seats[0].hand.length, 6);
      final s1 = [c(4, P), c(4, C), c(4, D)];
      final run = [c(5, T), c(6, T), c(7, T), c(8, T)];
      setup(g, [...s1, ...run]);
      g.apply(0, {'type': 'drawStock'});
      expect(
        () => g.apply(0, {
          'type': 'meld',
          'groups': [ids(s1), ids(run)],
        }),
        throwsA(isA<GameError>()),
      );
    });

    test('comprar el descarte da una carta de castigo y solo tras robar del mazo', () {
      final g = table('continental', 3);
      setup(g, [c(2, P)], others: [c(3, C)]);
      expect(() => g.apply(1, {'type': 'buy'}), throwsA(isA<GameError>()));
      g.apply(0, {'type': 'drawStock'});
      g.apply(1, {'type': 'buy'});
      expect(g.seats[1].hand.length, 3);
      expect(g.buysLeft[1], 2);
      expect(() => g.apply(2, {'type': 'buy'}), throwsA(isA<GameError>()));
    });

    test('al terminar la ronda 7 gana el menor puntaje', () {
      final g = table('continental', 2);
      g.round = 7;
      final a = [c(4, P), c(5, P), c(6, P), c(7, P)];
      final b = [c(4, C), c(5, C), c(6, C), c(7, C)];
      final d = [c(4, D), c(5, D), c(6, D), c(7, D)];
      setup(g, [...a, ...b, ...d], others: [c(1, T)]);
      g.apply(0, {'type': 'drawStock'});
      g.apply(0, {
        'type': 'meld',
        'groups': [ids(a), ids(b), ids(d)],
      });
      g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.single.id});
      expect(g.phase, Phase.gameOver);
      expect(g.seats[1].score, 20);
      expect(g.gameWinner, 0);
    });
  });

  group('Rummy 500', () {
    test('tomar del descarte en profundidad obliga a usar la carta más honda', () {
      final g = table('r500', 2);
      setup(g, [c(7, C), c(8, C), c(2, D)]);
      final deep = c(9, C);
      g.discard = [c(3, T), deep, c(5, P), c(6, D)];
      g.apply(0, {'type': 'drawDiscard', 'index': 1});
      expect(g.seats[0].hand.length, 6);
      expect(() => g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.last.id}), throwsA(isA<GameError>()));
      g.apply(0, {
        'type': 'meld',
        'groups': [
          ids([g.seats[0].hand[0], g.seats[0].hand[1], deep]),
        ],
      });
      g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.last.id});
      expect(g.current, 1);
    });

    test('se suma lo bajado y se resta la mano', () {
      final g = table('r500', 2);
      final a = [c(10, P), c(10, C), c(10, D)];
      setup(g, [...a, c(4, T)], others: [c(13, T), c(2, P)]);
      g.apply(0, {'type': 'drawStock'});
      g.apply(0, {
        'type': 'meld',
        'groups': [ids(a)],
      });
      g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.first.id});
      g.current = 0;
      g.phase = Phase.play;
      g.apply(0, {'type': 'discard', 'card': g.seats[0].hand.single.id});
      expect(g.result!.points, [30, -12]);
    });
  });

  group('Gin Rummy', () {
    test('tocar exige carta muerta dentro del límite y se puntúa la diferencia', () {
      final g = knock('gin', 2);
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = [
        c(1, P),
        c(2, P),
        c(3, P),
        c(5, C),
        c(5, D),
        c(5, T),
        c(9, C),
        c(10, C),
        c(11, C),
        c(2, D),
        c(13, T),
      ];
      g.seats[1].hand = [c(7, P), c(7, C), c(7, D), c(12, P), c(12, C), c(12, D), c(4, T), c(6, T), c(8, T), c(13, P)];
      final k = g.seats[0].hand.last;
      g.apply(0, {'type': 'knock', 'card': k.id});
      expect(g.phase, Phase.roundOver);
      // Muerta del que toca: 2. Rival: 4+6+8+10 = 28.
      expect(g.result!.points, [26, 0]);
    });

    test('undercut si el rival queda con igual o menos', () {
      final g = knock('gin', 2);
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = [
        c(1, P),
        c(2, P),
        c(3, P),
        c(5, C),
        c(5, D),
        c(5, T),
        c(9, C),
        c(10, C),
        c(11, C),
        c(8, D),
        c(13, T),
      ];
      g.seats[1].hand = [c(7, P), c(7, C), c(7, D), c(12, P), c(12, C), c(12, D), c(4, T), c(5, T), c(6, T), c(3, D)];
      expect(() => g.apply(0, {'type': 'knock', 'card': g.seats[0].hand[0].id}), throwsA(isA<GameError>()));
      g.apply(0, {'type': 'knock', 'card': g.seats[0].hand.last.id});
      expect(g.result!.points, [0, 25 + 8 - 3]);
    });
  });

  group('Chinchón', () {
    test('cerrar con una suelta de 5 o menos; los demás suman', () {
      final g = knock('chinchon', 2, {'jokers': 0});
      const O = Suit.oros, co = Suit.copas, E = Suit.espadas, B = Suit.bastos;
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = [c(1, O), c(2, O), c(3, O), c(7, co), c(7, E), c(7, B), c(4, B), c(12, E)];
      g.seats[1].hand = [c(4, O), c(10, co), c(11, E), c(5, B), c(6, B), c(2, E), c(12, co)];
      g.apply(0, {'type': 'knock', 'card': g.seats[0].hand.last.id});
      // El 4 de oros se acomoda en A-2-3 de oros: 10+11+5+6+2+12 = 46.
      expect(g.result!.points, [4, 46]);
    });

    test('chinchón gana la partida', () {
      final g = knock('chinchon', 2, {'jokers': 0});
      const O = Suit.oros;
      g.current = 0;
      g.phase = Phase.play;
      g.seats[0].hand = [c(1, O), c(2, O), c(3, O), c(4, O), c(5, O), c(6, O), c(7, O), c(12, Suit.bastos)];
      g.apply(0, {'type': 'knock', 'card': g.seats[0].hand.last.id});
      expect(g.phase, Phase.gameOver);
      expect(g.gameWinner, 0);
    });
  });

  group('Simulación completa', () {
    for (final v in variants) {
      for (var players = v.minPlayers; players <= v.maxPlayers; players++) {
        test('${v.name} con $players jugadores termina sin errores', () {
          final poker = v.id == 'poker';
          for (var seed = 0; seed < (v.id == 'continental' || poker ? 1 : 3); seed++) {
            final opts = {...v.defaults(), if (poker) 'jokers': 4};
            final g = v.create(List.generate(players, (i) => 'B$i'), opts, Random(seed * 31 + players));
            var steps = 0;
            var rounds = 0;
            while (g.phase != Phase.gameOver) {
              // Bajarse con las 15 cartas es difícil para el bot: basta con ver rondas completas.
              if (poker && rounds >= 2) break;
              expect(++steps, lessThan(50000), reason: 'partida sin fin');
              if (g.phase == Phase.roundOver) {
                rounds++;
                g.nextRound();
                continue;
              }
              botTurn(g);
              // Las vistas nunca revelan manos ajenas.
              final view = g.viewFor(0);
              expect((view['hand'] as List).length, g.seats[0].hand.length);
            }
            if (!poker) expect(g.viewFor(0)['winner'], isNotNull);
          }
        });
      }
    }
  });
}

dynamic analyzeMeldOrFail(List<PlayingCard> cs) {
  final g = table('colombiano', 2);
  return bestArrangement(cs, g.rules, (x) => 1).melds.single;
}

final _botRng = Random(7);

/// Jugador automático sencillo para la simulación.
void botTurn(CardGame g) {
  if (g is TableRummy) {
    final s = g.current;
    g.apply(s, {'type': 'drawStock'});
    if (g.phase != Phase.play) return;
    final arr = bestArrangement(g.seats[s].hand, g.rules, (x) => x.isJoker ? 0 : 10);
    var groups = arr.melds;
    final contract = g.contract;
    if (contract != null) {
      final sets = groups.where((m) => m.type == MeldType.set).take(contract.sets).toList();
      final runs = groups.where((m) => m.type == MeldType.run).take(contract.runs).toList();
      groups = g.hasMelded[s] || sets.length < contract.sets || runs.length < contract.runs ? [] : [...sets, ...runs];
    }
    if (groups.isNotEmpty) {
      try {
        g.apply(s, {
          'type': 'meld',
          'groups': [for (final m in groups) ids(m.cards)],
        });
      } on GameError {
        // Mínimo o contrato no cumplido.
      }
    }
    if (g.phase != Phase.play) return;
    for (final card in [...g.seats[s].hand]) {
      if (g.seats[s].hand.length <= 1) break;
      for (var k = 0; k < g.melds.length; k++) {
        try {
          g.apply(s, {
            'type': 'layoff',
            'meld': k,
            'cards': [card.id],
          });
          break;
        } on GameError {
          continue;
        }
      }
      if (g.phase != Phase.play) return;
    }
    if (g.phase != Phase.play) return;
    final hand = g.seats[s].hand;
    final dead = bestArrangement(hand, g.rules, (x) => x.isJoker ? 0 : 10).deadwood;
    final waiting = g.contract != null && !g.hasMelded[s] && _botRng.nextInt(3) == 0;
    final pool = (dead.isEmpty || waiting ? [...hand] : [...dead])..shuffle(_botRng);
    for (final card in [...pool, ...hand]) {
      try {
        g.apply(s, {'type': 'discard', 'card': card.id});
        return;
      } on GameError {
        continue;
      }
    }
    fail('el bot no pudo descartar');
  } else if (g is PokerRummy) {
    final s = g.current;
    g.apply(s, {'type': 'drawStock'});
    if (g.phase != Phase.play) return;
    final hand = g.seats[s].hand;
    final full = g.completeHand(hand);
    if (full != null) {
      g.apply(s, {
        'type': 'goDown',
        'groups': [for (final m in full.melds) ids(m.cards)],
      });
      return;
    }
    final dead = bestArrangement(hand, g.rules, (x) => x.isJoker ? 0 : 1).deadwood;
    final pool = (dead.isEmpty ? [...hand] : [...dead])..shuffle(_botRng);
    g.apply(s, {'type': 'discard', 'card': pool.first.id});
  } else if (g is KnockRummy) {
    final s = g.current;
    g.apply(s, {'type': 'drawStock'});
    if (g.phase != Phase.play) return;
    final hand = [...g.seats[s].hand];
    for (final card in hand) {
      try {
        g.apply(s, {'type': 'knock', 'card': card.id});
        return;
      } on GameError {
        continue;
      }
    }
    final arr = g.arrange(hand);
    final drop = arr.deadwood.isNotEmpty
        ? (arr.deadwood..sort((a, b) => g.config.value(b) - g.config.value(a))).first
        : hand.first;
    g.apply(s, {'type': 'discard', 'card': drop.id});
  }
}
