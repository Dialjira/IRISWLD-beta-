import 'package:flutter_test/flutter_test.dart';
import 'package:mesa_clasica/engine/arrangement.dart';
import 'package:mesa_clasica/engine/cards.dart';
import 'package:mesa_clasica/engine/melds.dart';

var _id = 1000;
PlayingCard c(int rank, Suit s) => PlayingCard(_id++, s, rank);
PlayingCard jk() => PlayingCard.joker(_id++);
const P = Suit.picas, C = Suit.corazones, D = Suit.diamantes, T = Suit.treboles;

void main() {
  const r = MeldRules();

  test('trío de palos distintos es válido; palo repetido no', () {
    expect(analyzeMeld([c(7, P), c(7, C), c(7, D)], r)?.type, MeldType.set);
    expect(analyzeMeld([c(7, P), c(7, P), c(7, D)], r), isNull);
    expect(
      analyzeMeld([c(7, P), c(7, P), c(7, D)], const MeldRules(setDistinctSuits: false, maxSet: 0))?.type,
      MeldType.set,
    );
  });

  test('escaleras: consecutivas del mismo palo, As bajo o alto, sin vuelta', () {
    expect(analyzeMeld([c(5, C), c(3, C), c(4, C)], r)?.type, MeldType.run);
    expect(analyzeMeld([c(1, C), c(2, C), c(3, C)], r), isNotNull);
    expect(analyzeMeld([c(12, C), c(13, C), c(1, C)], r), isNotNull);
    expect(analyzeMeld([c(13, C), c(1, C), c(2, C)], r), isNull);
    expect(analyzeMeld([c(12, C), c(13, C), c(1, C)], const MeldRules(aceHigh: false)), isNull);
    expect(analyzeMeld([c(3, C), c(4, D), c(5, C)], r), isNull);
  });

  test('comodines rellenan huecos y respetan el límite', () {
    final m = analyzeMeld([c(3, T), jk(), c(5, T)], r)!;
    expect(m.type, MeldType.run);
    expect(m.ranks, [3, 4, 5]);
    expect(analyzeMeld([c(3, T), jk(), jk()], const MeldRules(maxJokers: 1)), isNull);
    expect(analyzeMeld([c(9, T), c(9, C), jk()], const MeldRules(maxJokers: 1))?.type, MeldType.set);
    expect(analyzeMeld([jk(), jk(), jk()], r), isNull);
    expect(analyzeMeld([c(3, T), jk(), jk(), c(6, T)], const MeldRules(noAdjacentJokers: true)), isNull);
  });

  test('escalera mínima de 4 en Continental', () {
    const cont = MeldRules(minRun: 4);
    expect(analyzeMeld([c(3, T), c(4, T), c(5, T)], cont, only: MeldType.run), isNull);
    expect(analyzeMeld([c(3, T), c(4, T), c(5, T), c(6, T)], cont), isNotNull);
  });

  test('baraja española de 40: el 7 sigue con la Sota', () {
    const es = MeldRules(deck: DeckKind.spanish40, aceHigh: false);
    expect(analyzeMeld([c(6, Suit.oros), c(7, Suit.oros), c(10, Suit.oros)], es), isNotNull);
    expect(analyzeMeld([c(7, Suit.oros), c(8, Suit.oros), c(9, Suit.oros)], es), isNull);
  });

  test('mejor agrupación minimiza la carta muerta', () {
    final hand = [
      c(1, P), c(2, P), c(3, P), c(4, P), //
      c(4, C), c(4, D), //
      c(9, T), c(13, C), c(12, D), c(5, T),
    ];
    final a = bestArrangement(hand, const MeldRules(aceHigh: false), (x) => x.rank >= 10 ? 10 : x.rank);
    // Mejor: A-2-3 y 4-4-4 (muerta 9+10+10+5 = 34) frente a A-2-3-4 (muerta 4+4+9+10+10+5 = 42).
    expect(a.deadValue, 34);
    expect(a.melds.length, 2);
  });
}
