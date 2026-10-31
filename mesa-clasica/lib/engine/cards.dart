import 'dart:math';

/// Tipo de baraja.
enum DeckKind { french, spanish40, spanish48 }

/// Palos franceses (0-3) y españoles (4-7).
enum Suit { picas, corazones, diamantes, treboles, oros, copas, espadas, bastos }

extension SuitInfo on Suit {
  bool get isRed => this == Suit.corazones || this == Suit.diamantes || this == Suit.oros || this == Suit.copas;
  bool get isSpanish => index >= 4;
  String get label =>
      const ['Picas', 'Corazones', 'Diamantes', 'Tréboles', 'Oros', 'Copas', 'Espadas', 'Bastos'][index];
}

/// Carta. `suit == null` indica comodín (rank 0).
class PlayingCard {
  final int id;
  final Suit? suit;
  final int rank;

  const PlayingCard(this.id, this.suit, this.rank);
  const PlayingCard.joker(this.id) : suit = null, rank = 0;

  bool get isJoker => suit == null;

  List<int> toJson() => [id, suit?.index ?? -1, rank];

  static PlayingCard fromJson(List<dynamic> j) {
    final s = j[1] as int;
    return PlayingCard(j[0] as int, s < 0 ? null : Suit.values[s], j[2] as int);
  }

  String get rankLabel {
    if (isJoker) return '★';
    if (suit!.isSpanish) {
      return switch (rank) {
        1 => 'A',
        10 => 'S',
        11 => 'C',
        12 => 'R',
        _ => '$rank',
      };
    }
    return switch (rank) {
      1 => 'A',
      11 => 'J',
      12 => 'Q',
      13 => 'K',
      _ => '$rank',
    };
  }

  @override
  String toString() => isJoker ? 'JK#$id' : '$rankLabel${suit!.label[0]}#$id';

  @override
  bool operator ==(Object other) => other is PlayingCard && other.id == id;
  @override
  int get hashCode => id;
}

/// Rangos válidos en orden de escalera para cada baraja.
List<int> rankSequence(DeckKind kind) => switch (kind) {
  DeckKind.french => List.generate(13, (i) => i + 1),
  DeckKind.spanish40 => const [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
  DeckKind.spanish48 => List.generate(12, (i) => i + 1),
};

List<Suit> suitsOf(DeckKind kind) => kind == DeckKind.french
    ? const [Suit.picas, Suit.corazones, Suit.diamantes, Suit.treboles]
    : const [Suit.oros, Suit.copas, Suit.espadas, Suit.bastos];

/// Construye y baraja [decks] barajas más [jokers] comodines.
List<PlayingCard> buildDeck(DeckKind kind, {int decks = 1, int jokers = 0, Random? rng}) {
  final cards = <PlayingCard>[];
  var id = 0;
  for (var d = 0; d < decks; d++) {
    for (final s in suitsOf(kind)) {
      for (final r in rankSequence(kind)) {
        cards.add(PlayingCard(id++, s, r));
      }
    }
  }
  for (var j = 0; j < jokers; j++) {
    cards.add(PlayingCard.joker(id++));
  }
  cards.shuffle(rng ?? Random.secure());
  return cards;
}
