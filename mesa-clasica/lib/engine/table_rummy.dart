import 'dart:math';

import 'cards.dart';
import 'game.dart';
import 'melds.dart';

enum Scoring {
  /// El ganador suma la mano de los demás (Remis clásico).
  winnerTakes,

  /// Los perdedores suman su mano; quien llega a la meta queda eliminado.
  penaltyElimination,

  /// Los perdedores suman su mano; rondas fijas; gana el menor (Continental).
  penaltyRounds,

  /// Suma lo bajado, resta la mano (Rummy 500).
  plusMinus,
}

class Contract {
  final int sets;
  final int runs;
  const Contract(this.sets, this.runs);

  String get label {
    final parts = <String>[];
    if (sets > 0) parts.add(sets == 1 ? '1 trío' : '$sets tríos');
    if (runs > 0) parts.add(runs == 1 ? '1 escalera' : '$runs escaleras');
    return parts.join(' + ');
  }
}

typedef CardValue = int Function(PlayingCard c, {int? rank, bool lowAce});

class TableConfig {
  final String variant;
  final MeldRules rules;
  final int decks;
  final int jokers;
  final int Function(int players, int round) handSize;
  final int firstMeldMin;
  final bool rummyDouble;
  final Scoring scoring;
  final int target;
  final List<Contract>? contracts;
  final int buysPerRound;
  final bool digDiscard;
  final bool jokerSwap;
  final bool layoffNeedsMeld;

  /// Rehacer el mazo con el descarte cuando se agota (en Rummy 500 la ronda termina).
  final bool reshuffle;
  final CardValue value;

  const TableConfig({
    required this.variant,
    required this.rules,
    required this.handSize,
    required this.scoring,
    required this.target,
    required this.value,
    this.decks = 1,
    this.jokers = 0,
    this.firstMeldMin = 0,
    this.rummyDouble = false,
    this.contracts,
    this.buysPerRound = 0,
    this.digDiscard = false,
    this.jokerSwap = false,
    this.layoffNeedsMeld = true,
    this.reshuffle = true,
  });
}

class TableMeld {
  final int owner;
  Meld meld;

  /// Asiento al que se acredita cada carta (Rummy 500).
  final Map<int, int> credit;

  TableMeld(this.owner, this.meld, this.credit);
}

/// Motor para rummys que bajan juegos a la mesa.
class TableRummy implements CardGame {
  final TableConfig config;
  @override
  final List<Seat> seats;
  final Random rng;

  List<PlayingCard> stock = [];
  List<PlayingCard> discard = [];
  List<TableMeld> melds = [];
  late List<bool> hasMelded;
  late List<int> buysLeft;
  int current = 0;
  int dealer = 0;
  int round = 1;
  int reshuffles = 0;
  @override
  Phase phase = Phase.draw;
  bool meldedAtTurnStart = false;
  int? takenFromDiscard;
  int? mustUse;
  bool buyAvailable = false;
  String event = '';
  RoundResult? result;
  int? gameWinner;

  TableRummy(this.config, List<String> names, {Random? rng})
    : seats = [for (final n in names) Seat(n)],
      rng = rng ?? Random.secure() {
    dealer = seats.length - 1;
    _startRound();
  }

  MeldRules get rules => config.rules;
  Contract? get contract => config.contracts?[round - 1];
  List<int> get active => [
    for (var i = 0; i < seats.length; i++)
      if (!seats[i].eliminated) i,
  ];

  int _nextActive(int from) {
    var i = from;
    do {
      i = (i + 1) % seats.length;
    } while (seats[i].eliminated);
    return i;
  }

  void _startRound() {
    final deck = buildDeck(rules.deck, decks: config.decks, jokers: config.jokers, rng: rng);
    final n = config.handSize(active.length, round);
    for (final s in seats) {
      s.hand = [];
    }
    melds = [];
    hasMelded = List.filled(seats.length, false);
    buysLeft = List.filled(seats.length, config.buysPerRound);
    for (var k = 0; k < n; k++) {
      for (final i in active) {
        seats[i].hand.add(deck.removeLast());
      }
    }
    discard = [deck.removeLast()];
    stock = deck;
    current = _nextActive(dealer);
    phase = Phase.draw;
    meldedAtTurnStart = false;
    takenFromDiscard = null;
    mustUse = null;
    buyAvailable = false;
    reshuffles = 0;
    result = null;
    event = 'Ronda $round · empieza ${seats[current].name}';
  }

  @override
  void nextRound() {
    if (phase != Phase.roundOver) throw GameError('La ronda no ha terminado');
    round++;
    dealer = _nextActive(dealer);
    _startRound();
  }

  @override
  void apply(int seat, Map<String, dynamic> a) {
    final type = a['type'] as String?;
    if (phase == Phase.roundOver || phase == Phase.gameOver) {
      throw GameError('La ronda terminó');
    }
    if (type == 'buy') return _buy(seat);
    if (seat != current) throw GameError('No es tu turno');
    switch (type) {
      case 'drawStock':
        _needPhase(Phase.draw);
        if (!_ensureStock()) return;
        seats[seat].hand.add(stock.removeLast());
        buyAvailable = config.buysPerRound > 0 && discard.isNotEmpty;
        phase = Phase.play;
        event = '${seats[seat].name} robó del mazo';
      case 'drawDiscard':
        _needPhase(Phase.draw);
        if (discard.isEmpty) throw GameError('El descarte está vacío');
        final top = discard.length - 1;
        final idx = (a['index'] as int?) ?? top;
        if (idx < 0 || idx > top) throw GameError('Carta inválida');
        if (idx != top && !config.digDiscard) throw GameError('Solo puedes tomar la carta de arriba');
        final taken = discard.sublist(idx);
        discard.removeRange(idx, discard.length);
        seats[seat].hand.addAll(taken);
        if (taken.length > 1) {
          mustUse = taken.first.id;
        } else {
          takenFromDiscard = taken.first.id;
        }
        buyAvailable = false;
        phase = Phase.play;
        event = taken.length > 1
            ? '${seats[seat].name} tomó ${taken.length} cartas del descarte'
            : '${seats[seat].name} tomó del descarte';
      case 'meld':
        _needPhase(Phase.play);
        _meld(seat, [for (final g in a['groups'] as List) idsOf(g)]);
      case 'layoff':
        _needPhase(Phase.play);
        _layoff(seat, a['meld'] as int, idsOf(a['cards']));
      case 'swapJoker':
        _needPhase(Phase.play);
        _swapJoker(seat, a['meld'] as int, a['card'] as int);
      case 'discard':
        _needPhase(Phase.play);
        _discard(seat, a['card'] as int);
      default:
        throw GameError('Acción desconocida');
    }
  }

  void _needPhase(Phase p) {
    if (phase != p) {
      throw GameError(p == Phase.draw ? 'Ya robaste en este turno' : 'Primero debes robar');
    }
  }

  /// Rehace el mazo con el descarte (máximo 2 veces por ronda, para evitar rondas eternas).
  /// Devuelve false si la ronda terminó por falta de cartas.
  bool _ensureStock() {
    if (stock.isNotEmpty) return true;
    if (config.reshuffle && discard.length > 1 && reshuffles < 2) {
      reshuffles++;
      final top = discard.removeLast();
      stock = discard..shuffle(rng);
      discard = [top];
      return true;
    }
    _endRound(null);
    return false;
  }

  int _meldPoints(Meld m) {
    var sum = 0;
    for (var i = 0; i < m.cards.length; i++) {
      final low = m.type == MeldType.run && m.ranks[i] == 1;
      sum += config.value(m.cards[i], rank: m.ranks[i], lowAce: low);
    }
    return sum;
  }

  int handValue(int seat) =>
      seats[seat].hand.fold(0, (s, c) => s + config.value(c, rank: c.isJoker ? null : c.rank));

  List<PlayingCard> _pick(int seat, List<int> ids) {
    final hand = seats[seat].hand;
    if (ids.toSet().length != ids.length) throw GameError('Carta repetida');
    return [
      for (final id in ids)
        hand.firstWhere((c) => c.id == id, orElse: () => throw GameError('No tienes esa carta')),
    ];
  }

  void _meld(int seat, List<List<int>> groups) {
    if (groups.isEmpty) throw GameError('Selecciona cartas para bajar');
    final all = groups.expand((g) => g).toList();
    _pick(seat, all); // valida pertenencia y repetidas
    final parsed = <Meld>[];
    for (final g in groups) {
      final m = analyzeMeld(_pick(seat, g), rules);
      if (m == null) throw GameError('Ese juego no es válido');
      parsed.add(m);
    }
    final c = contract;
    if (!hasMelded[seat]) {
      if (c != null) {
        final sets = parsed.where((m) => m.type == MeldType.set).length;
        final runs = parsed.length - sets;
        if (sets != c.sets || runs != c.runs) {
          throw GameError('Para bajar necesitas: ${c.label}');
        }
      } else if (config.firstMeldMin > 0) {
        final pts = parsed.fold(0, (s, m) => s + _meldPoints(m));
        if (pts < config.firstMeldMin) {
          throw GameError('La primera bajada debe sumar ${config.firstMeldMin} (llevas $pts)');
        }
      }
    } else if (c != null) {
      throw GameError('Ya bajaste el contrato; ahora solo puedes añadir a juegos');
    }
    final hand = seats[seat].hand;
    for (final m in parsed) {
      hand.removeWhere((x) => m.cards.contains(x));
      melds.add(TableMeld(seat, m, {for (final x in m.cards) x.id: seat}));
    }
    if (mustUse != null && all.contains(mustUse)) mustUse = null;
    hasMelded[seat] = true;
    event = '${seats[seat].name} bajó ${parsed.length == 1 ? 'un juego' : '${parsed.length} juegos'}';
    _checkOut(seat);
  }

  void _layoff(int seat, int meldIndex, List<int> ids) {
    if (config.layoffNeedsMeld && !hasMelded[seat]) {
      throw GameError('Debes bajar antes de añadir a otros juegos');
    }
    if (meldIndex < 0 || meldIndex >= melds.length) throw GameError('Juego inválido');
    final cards = _pick(seat, ids);
    if (cards.isEmpty) throw GameError('Selecciona cartas');
    final tm = melds[meldIndex];
    final m = analyzeMeld([...tm.meld.cards, ...cards], rules, only: tm.meld.type);
    if (m == null) throw GameError('Esas cartas no encajan en ese juego');
    seats[seat].hand.removeWhere(cards.contains);
    tm.meld = m;
    for (final x in cards) {
      tm.credit[x.id] = seat;
    }
    if (mustUse != null && ids.contains(mustUse)) mustUse = null;
    event = '${seats[seat].name} añadió a un juego';
    _checkOut(seat);
  }

  void _swapJoker(int seat, int meldIndex, int cardId) {
    if (!config.jokerSwap) throw GameError('Cambiar comodines no está permitido');
    if (config.layoffNeedsMeld && !hasMelded[seat]) {
      throw GameError('Debes bajar antes de cambiar comodines');
    }
    if (meldIndex < 0 || meldIndex >= melds.length) throw GameError('Juego inválido');
    final natural = _pick(seat, [cardId]).single;
    if (natural.isJoker) throw GameError('Usa una carta natural');
    final tm = melds[meldIndex];
    for (final j in tm.meld.cards.where((c) => c.isJoker)) {
      final cards = [
        for (final c in tm.meld.cards)
          if (c != j) c,
        natural,
      ];
      final m = analyzeMeld(cards, rules, only: tm.meld.type);
      if (m != null && m.length == tm.meld.length) {
        tm.meld = m;
        tm.credit[natural.id] = seat;
        tm.credit.remove(j.id);
        final hand = seats[seat].hand;
        hand.remove(natural);
        hand.add(j);
        event = '${seats[seat].name} cambió un comodín';
        return;
      }
    }
    throw GameError('Esa carta no reemplaza ningún comodín de ese juego');
  }

  void _discard(int seat, int cardId) {
    final hand = seats[seat].hand;
    if (cardId == takenFromDiscard && hand.length > 1) {
      throw GameError('No puedes descartar la carta que tomaste del descarte');
    }
    if (mustUse != null && hand.any((c) => c.id == mustUse)) {
      throw GameError('Debes usar en un juego la carta más honda que tomaste');
    }
    final card = takeById(hand, cardId);
    discard.add(card);
    event = '${seats[seat].name} descartó';
    if (hand.isEmpty) {
      _endRound(seat);
      return;
    }
    current = _nextActive(seat);
    phase = Phase.draw;
    meldedAtTurnStart = hasMelded[current];
    takenFromDiscard = null;
    mustUse = null;
    buyAvailable = false;
  }

  void _buy(int seat) {
    if (config.buysPerRound == 0) throw GameError('No se permite comprar');
    if (seat == current) throw GameError('En tu turno toma del descarte');
    if (seats[seat].eliminated) throw GameError('Estás eliminado');
    if (!buyAvailable || discard.isEmpty) throw GameError('No hay carta para comprar');
    if (buysLeft[seat] <= 0) throw GameError('Ya no te quedan compras');
    if (hasMelded[seat]) throw GameError('Ya bajaste; no puedes comprar');
    final hand = seats[seat].hand;
    hand.add(discard.removeLast());
    if (stock.isNotEmpty) hand.add(stock.removeLast());
    buysLeft[seat]--;
    buyAvailable = false;
    event = '${seats[seat].name} compró el descarte';
  }

  void _checkOut(int seat) {
    if (seats[seat].hand.isEmpty) _endRound(seat);
  }

  void _endRound(int? winner) {
    final n = seats.length;
    final pts = List.filled(n, 0);
    final hv = [for (var i = 0; i < n; i++) handValue(i)];
    final rummy = winner != null && config.rummyDouble && !meldedAtTurnStart;
    final mult = rummy ? 2 : 1;
    String headline;
    switch (config.scoring) {
      case Scoring.winnerTakes:
        if (winner != null) {
          pts[winner] =
              [
                for (final i in active)
                  if (i != winner) hv[i],
              ].fold(0, (a, b) => a + b) *
              mult;
          seats[winner].score += pts[winner];
        }
      case Scoring.penaltyElimination:
      case Scoring.penaltyRounds:
        if (winner != null) {
          for (final i in active) {
            if (i == winner) continue;
            pts[i] = hv[i] * mult;
            seats[i].score += pts[i];
          }
        }
      case Scoring.plusMinus:
        for (final i in active) {
          var melded = 0;
          for (final tm in melds) {
            for (var k = 0; k < tm.meld.cards.length; k++) {
              final c = tm.meld.cards[k];
              if (tm.credit[c.id] == i) {
                final r = tm.meld.ranks[k];
                melded += config.value(c, rank: r, lowAce: tm.meld.type == MeldType.run && r == 1);
              }
            }
          }
          pts[i] = melded - hv[i];
          seats[i].score += pts[i];
        }
    }
    if (winner == null) {
      headline = 'Se acabó el mazo: nadie cerró';
    } else if (rummy) {
      headline = '¡${seats[winner].name} hizo RUMMY! Pago doble';
    } else {
      headline = '${seats[winner].name} cerró la ronda';
    }
    if (config.scoring == Scoring.penaltyElimination) {
      for (final i in active) {
        if (seats[i].score >= config.target) seats[i].eliminated = true;
      }
    }
    result = RoundResult(winner, headline, pts, [
      for (final s in seats) [...s.hand],
    ]);
    event = headline;
    phase = _gameOver() ? Phase.gameOver : Phase.roundOver;
  }

  bool _gameOver() {
    final idx = List.generate(seats.length, (i) => i);
    switch (config.scoring) {
      case Scoring.winnerTakes:
      case Scoring.plusMinus:
        final best = idx.reduce((a, b) => seats[a].score >= seats[b].score ? a : b);
        if (seats[best].score >= config.target) {
          gameWinner = best;
          return true;
        }
      case Scoring.penaltyElimination:
        final alive = active;
        if (alive.length <= 1) {
          gameWinner = alive.isEmpty
              ? idx.reduce((a, b) => seats[a].score <= seats[b].score ? a : b)
              : alive.single;
          return true;
        }
      case Scoring.penaltyRounds:
        if (round >= (config.contracts?.length ?? 1)) {
          gameWinner = idx.reduce((a, b) => seats[a].score <= seats[b].score ? a : b);
          return true;
        }
    }
    return false;
  }

  @override
  Map<String, dynamic> viewFor(int seat) {
    final top = config.digDiscard ? discard : discard.sublist(max(0, discard.length - 6));
    return {
      'game': 'table',
      'variant': config.variant,
      'phase': phase.name,
      'round': round,
      'rounds': config.contracts?.length,
      'contract': contract?.label,
      'current': current,
      'me': seat,
      'hand': cardsJson(seats[seat].hand),
      'players': [
        for (var i = 0; i < seats.length; i++)
          {
            'name': seats[i].name,
            'count': seats[i].hand.length,
            'score': seats[i].score,
            'melded': hasMelded[i],
            'eliminated': seats[i].eliminated,
            'connected': seats[i].connected,
            'buys': buysLeft[i],
          },
      ],
      'stock': stock.length,
      'discard': cardsJson(top),
      'discardTotal': discard.length,
      'melds': [
        for (final m in melds) {'owner': m.owner, 'type': m.meld.type.name, 'cards': cardsJson(m.meld.cards)},
      ],
      'mustUse': seat == current ? mustUse : null,
      'lockedDiscard': seat == current ? takenFromDiscard : null,
      'canBuy':
          buyAvailable &&
          seat != current &&
          buysLeft[seat] > 0 &&
          !hasMelded[seat] &&
          !seats[seat].eliminated,
      'event': event,
      'result': result?.toJson(),
      'winner': gameWinner,
      'rules': {
        'firstMeldMin': config.firstMeldMin,
        'rummyDouble': config.rummyDouble,
        'target': config.target,
        'jokerSwap': config.jokerSwap,
        'dig': config.digDiscard,
        'layoffNeedsMeld': config.layoffNeedsMeld,
        'scoring': config.scoring.name,
      },
    };
  }
}
