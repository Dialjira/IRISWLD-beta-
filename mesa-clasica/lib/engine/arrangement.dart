import 'cards.dart';
import 'melds.dart';

/// Mejor forma de agrupar una mano: juegos y cartas sueltas ("carta muerta").
class Arrangement {
  final List<Meld> melds;
  final List<PlayingCard> deadwood;
  final int deadValue;

  Arrangement(this.melds, this.deadwood, this.deadValue);
}

/// Busca la agrupación que minimiza el valor de la carta muerta
/// (programación dinámica sobre máscaras; manos de hasta ~12 cartas).
Arrangement bestArrangement(List<PlayingCard> hand, MeldRules rules, int Function(PlayingCard) value) {
  final n = hand.length;
  final minSize = rules.minSet < rules.minRun ? rules.minSet : rules.minRun;
  final full = (1 << n) - 1;
  final meldOf = <int, Meld>{};
  final masksByLow = List.generate(n, (_) => <int>[]);
  for (var mask = 1; mask <= full; mask++) {
    final bits = _bitCount(mask);
    if (bits < minSize) continue;
    final cards = [
      for (var i = 0; i < n; i++)
        if ((mask >> i) & 1 == 1) hand[i],
    ];
    final m = analyzeMeld(cards, rules);
    if (m != null) {
      meldOf[mask] = m;
      masksByLow[_lowBit(mask)].add(mask);
    }
  }
  final memo = <int, int>{0: 0};
  final choice = <int, int>{};
  int best(int mask) {
    final cached = memo[mask];
    if (cached != null) return cached;
    final low = _lowBit(mask);
    var res = value(hand[low]) + best(mask & ~(1 << low));
    var pick = 0;
    for (final m in masksByLow[low]) {
      if (m & mask != m) continue;
      final v = best(mask & ~m);
      if (v < res) {
        res = v;
        pick = m;
      }
    }
    memo[mask] = res;
    choice[mask] = pick;
    return res;
  }

  final total = best(full);
  final melds = <Meld>[];
  final dead = <PlayingCard>[];
  var mask = full;
  while (mask != 0) {
    final pick = choice[mask]!;
    if (pick == 0) {
      final low = _lowBit(mask);
      dead.add(hand[low]);
      mask &= ~(1 << low);
    } else {
      melds.add(meldOf[pick]!);
      mask &= ~pick;
    }
  }
  return Arrangement(melds, dead, total);
}

int _bitCount(int x) {
  var c = 0;
  while (x != 0) {
    x &= x - 1;
    c++;
  }
  return c;
}

int _lowBit(int x) {
  var i = 0;
  while ((x >> i) & 1 == 0) {
    i++;
  }
  return i;
}
