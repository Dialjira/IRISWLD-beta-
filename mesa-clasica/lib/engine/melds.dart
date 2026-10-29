import 'cards.dart';

enum MeldType { set, run }

/// Reglas para validar tríos (set) y escaleras (run).
class MeldRules {
  final DeckKind deck;
  final int minSet;

  /// 0 = sin límite.
  final int maxSet;
  final int minRun;

  /// En un trío no puede repetirse palo (útil con 2 barajas).
  final bool setDistinctSuits;

  /// Máximo de comodines por juego; -1 = sin límite.
  final int maxJokers;

  /// Mínimo de cartas naturales por juego.
  final int minNaturals;
  final bool noAdjacentJokers;

  /// El As puede ir después del Rey (Q-K-A).
  final bool aceHigh;

  const MeldRules({
    this.deck = DeckKind.french,
    this.minSet = 3,
    this.maxSet = 4,
    this.minRun = 3,
    this.setDistinctSuits = true,
    this.maxJokers = -1,
    this.minNaturals = 1,
    this.noAdjacentJokers = false,
    this.aceHigh = true,
  });
}

/// Juego válido. [ranks] es el valor que representa cada carta (As alto = 14).
class Meld {
  final MeldType type;
  final List<PlayingCard> cards;
  final List<int> ranks;
  final Suit? suit;

  Meld(this.type, this.cards, this.ranks, this.suit);

  int get length => cards.length;
}

/// Analiza [cards] como juego. Si es ambiguo prefiere trío cuando las
/// naturales comparten valor y escalera en otro caso.
Meld? analyzeMeld(List<PlayingCard> cards, MeldRules r, {MeldType? only}) {
  final naturals = cards.where((c) => !c.isJoker).toList();
  final jokers = cards.where((c) => c.isJoker).toList();
  if (naturals.isEmpty || naturals.length < r.minNaturals) return null;
  if (r.maxJokers >= 0 && jokers.length > r.maxJokers) return null;
  final sameRank = naturals.every((c) => c.rank == naturals.first.rank);
  if (only != MeldType.run && (only == MeldType.set || sameRank)) {
    final s = _asSet(naturals, jokers, r);
    if (s != null || only == MeldType.set) return s;
  }
  final run = _asRun(naturals, jokers, r);
  if (run != null || only == MeldType.run) return run;
  return only == null ? _asSet(naturals, jokers, r) : null;
}

bool isValidMeld(List<PlayingCard> cards, MeldRules r, {MeldType? only}) => analyzeMeld(cards, r, only: only) != null;

Meld? _asSet(List<PlayingCard> naturals, List<PlayingCard> jokers, MeldRules r) {
  final rank = naturals.first.rank;
  if (naturals.any((c) => c.rank != rank)) return null;
  final total = naturals.length + jokers.length;
  if (total < r.minSet) return null;
  if (r.maxSet > 0 && total > r.maxSet) return null;
  if (r.setDistinctSuits) {
    final suits = naturals.map((c) => c.suit).toSet();
    if (suits.length != naturals.length) return null;
    if (total > suitsOf(r.deck).length) return null;
  }
  if (r.noAdjacentJokers && jokers.length > naturals.length) return null;
  final ordered = [...naturals]..sort((a, b) => a.suit!.index - b.suit!.index);
  // Intercalar comodines entre naturales.
  final out = <PlayingCard>[];
  var j = 0;
  for (final n in ordered) {
    out.add(n);
    if (j < jokers.length) out.add(jokers[j++]);
  }
  while (j < jokers.length) {
    out.add(jokers[j++]);
  }
  return Meld(MeldType.set, out, List.filled(out.length, rank), null);
}

Meld? _asRun(List<PlayingCard> naturals, List<PlayingCard> jokers, MeldRules r) {
  final suit = naturals.first.suit;
  if (naturals.any((c) => c.suit != suit)) return null;
  final total = naturals.length + jokers.length;
  if (total < r.minRun) return null;
  final seq = rankSequence(r.deck);
  final canHigh = r.aceHigh && r.deck == DeckKind.french;
  final maxPos = seq.length - 1 + (canHigh ? 1 : 0);
  if (total > seq.length) return null;

  final aces = <int>[];
  for (var i = 0; i < naturals.length; i++) {
    if (!seq.contains(naturals[i].rank)) return null;
    if (canHigh && naturals[i].rank == 1) aces.add(i);
  }
  // Probar cada combinación de As bajo/alto.
  for (var mask = 0; mask < (1 << aces.length); mask++) {
    final pos = <int, PlayingCard>{};
    var dup = false;
    for (var i = 0; i < naturals.length; i++) {
      final ai = aces.indexOf(i);
      final p = (ai >= 0 && (mask >> ai) & 1 == 1) ? seq.length : seq.indexOf(naturals[i].rank);
      if (pos.containsKey(p)) {
        dup = true;
        break;
      }
      pos[p] = naturals[i];
    }
    if (dup) continue;
    final keys = pos.keys.toList()..sort();
    var lo = keys.first, hi = keys.last;
    final gaps = (hi - lo + 1) - keys.length;
    if (gaps > jokers.length) continue;
    var extra = jokers.length - gaps;
    var high = true;
    var ok = true;
    while (extra > 0) {
      if (high && hi < maxPos) {
        hi++;
      } else if (lo > 0) {
        lo--;
      } else if (hi < maxPos) {
        hi++;
      } else {
        ok = false;
        break;
      }
      high = !high;
      extra--;
    }
    if (!ok || hi - lo + 1 > seq.length) continue;
    final cards = <PlayingCard>[];
    final ranks = <int>[];
    var ji = 0;
    var prevJoker = false;
    for (var p = lo; p <= hi; p++) {
      final c = pos[p];
      if (c == null) {
        if (r.noAdjacentJokers && prevJoker) {
          ok = false;
          break;
        }
        cards.add(jokers[ji++]);
        prevJoker = true;
      } else {
        cards.add(c);
        prevJoker = false;
      }
      ranks.add(p == seq.length ? 14 : seq[p]);
    }
    if (!ok) continue;
    return Meld(MeldType.run, cards, ranks, suit);
  }
  return null;
}
