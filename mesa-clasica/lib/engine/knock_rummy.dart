import 'dart:math';

import 'arrangement.dart';
import 'cards.dart';
import 'game.dart';
import 'melds.dart';

enum KnockStyle { gin, chinchon }

class KnockConfig {
  final String variant;
  final KnockStyle style;
  final MeldRules rules;
  final int jokers;
  final int handSize;

  /// Gin: carta muerta máxima para tocar. Chinchón: valor máximo de la carta suelta (0 = cualquiera).
  final int knockLimit;
  final int target;
  final int Function(PlayingCard) value;

  const KnockConfig({
    required this.variant,
    required this.style,
    required this.rules,
    required this.handSize,
    required this.knockLimit,
    required this.target,
    required this.value,
    this.jokers = 0,
  });
}

/// Motor para rummys que se cierran desde la mano (Gin Rummy, Chinchón).
class KnockRummy extends CardGame {
  final KnockConfig config;
  @override
  final List<Seat> seats;
  final Random rng;

  List<PlayingCard> stock = [];
  List<PlayingCard> discard = [];
  int current = 0;
  int dealer = 0;
  int round = 1;
  @override
  Phase phase = Phase.draw;
  int? takenFromDiscard;
  String event = '';
  RoundResult? result;
  int? gameWinner;

  KnockRummy(this.config, List<String> names, {Random? rng})
    : seats = [for (final n in names) Seat(n)],
      rng = rng ?? Random.secure() {
    dealer = seats.length - 1;
    _startRound();
  }

  bool get isGin => config.style == KnockStyle.gin;
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
    final deck = buildDeck(config.rules.deck, jokers: config.jokers, rng: rng);
    for (final s in seats) {
      s.hand = [];
    }
    for (var k = 0; k < config.handSize; k++) {
      for (final i in active) {
        seats[i].hand.add(deck.removeLast());
      }
    }
    discard = [deck.removeLast()];
    stock = deck;
    current = _nextActive(dealer);
    phase = Phase.draw;
    takenFromDiscard = null;
    result = null;
    event = 'Ronda $round · empieza ${seats[current].name}';
    fx('deal', current);
  }

  @override
  void nextRound() {
    if (phase != Phase.roundOver) throw GameError('La ronda no ha terminado');
    round++;
    dealer = _nextActive(dealer);
    _startRound();
  }

  Arrangement arrange(List<PlayingCard> hand) => bestArrangement(hand, config.rules, config.value);

  @override
  void apply(int seat, Map<String, dynamic> a) {
    if (phase == Phase.roundOver || phase == Phase.gameOver) throw GameError('La ronda terminó');
    if (seat != current) throw GameError('No es tu turno');
    final hand = seats[seat].hand;
    switch (a['type']) {
      case 'drawStock':
        if (phase != Phase.draw) throw GameError('Ya robaste en este turno');
        if (stock.isEmpty) {
          if (isGin || discard.length <= 1) return _endRound(null);
          final top = discard.removeLast();
          stock = discard..shuffle(rng);
          discard = [top];
        }
        hand.add(stock.removeLast());
        phase = Phase.play;
        event = '${seats[seat].name} robó del mazo';
        fx('draw', seat);
      case 'drawDiscard':
        if (phase != Phase.draw) throw GameError('Ya robaste en este turno');
        if (discard.isEmpty) throw GameError('El descarte está vacío');
        final c = discard.removeLast();
        hand.add(c);
        takenFromDiscard = c.id;
        phase = Phase.play;
        event = '${seats[seat].name} tomó del descarte';
        fx('drawDiscard', seat);
      case 'discard':
      case 'knock':
        if (phase != Phase.play) throw GameError('Primero debes robar');
        final id = a['card'] as int;
        if (id == takenFromDiscard) throw GameError('No puedes descartar la carta que tomaste');
        final knock = a['type'] == 'knock';
        final rest = [
          for (final c in hand)
            if (c.id != id) c,
        ];
        if (rest.length == hand.length) throw GameError('No tienes esa carta');
        if (knock) _checkKnock(rest);
        discard.add(takeById(hand, id));
        if (knock) return _endRound(seat);
        event = '${seats[seat].name} descartó';
        fx('discard', seat);
        if (isGin && stock.length <= 2) return _endRound(null);
        current = _nextActive(seat);
        phase = Phase.draw;
        takenFromDiscard = null;
      default:
        throw GameError('Acción desconocida');
    }
  }

  void _checkKnock(List<PlayingCard> rest) {
    final arr = arrange(rest);
    if (isGin) {
      if (arr.deadValue > config.knockLimit) {
        throw GameError('Para tocar necesitas ${config.knockLimit} o menos de carta muerta (tienes ${arr.deadValue})');
      }
    } else {
      final ok =
          arr.deadwood.isEmpty ||
          (arr.deadwood.length == 1 &&
              (config.knockLimit == 0 || config.value(arr.deadwood.single) <= config.knockLimit));
      if (!ok) {
        final lim = config.knockLimit == 0 ? '' : ' de valor ${config.knockLimit} o menos';
        throw GameError('Para cerrar puedes dejar como máximo una carta suelta$lim');
      }
    }
  }

  /// Chinchón: escalera de 7 del mismo palo sin comodines.
  bool _isChinchon(List<PlayingCard> hand) {
    if (hand.length != 7 || hand.any((c) => c.isJoker)) return false;
    final m = analyzeMeld(hand, config.rules, only: MeldType.run);
    return m != null;
  }

  /// Añade automáticamente la carta muerta de un rival a los juegos de quien cerró.
  List<PlayingCard> _layoff(List<PlayingCard> dead, List<Meld> onto) {
    final left = [...dead];
    var changed = true;
    while (changed) {
      changed = false;
      for (final c in [...left]) {
        for (var k = 0; k < onto.length; k++) {
          final m = analyzeMeld([...onto[k].cards, c], config.rules, only: onto[k].type);
          if (m != null) {
            onto[k] = m;
            left.remove(c);
            changed = true;
            break;
          }
        }
      }
    }
    return left;
  }

  int _sum(List<PlayingCard> cs) => cs.fold(0, (s, c) => s + config.value(c));

  void _endRound(int? closer) {
    final n = seats.length;
    final pts = List.filled(n, 0);
    final arrs = <int, Arrangement>{for (final i in active) i: arrange(seats[i].hand)};
    final meldsJson = List<List<List<List<int>>>>.generate(n, (_) => []);
    final deadJson = List<List<List<int>>>.generate(n, (_) => []);
    String headline;

    if (closer == null) {
      headline = 'Se acabó el mazo: mano nula';
      for (final i in active) {
        meldsJson[i] = [for (final m in arrs[i]!.melds) cardsJson(m.cards)];
        deadJson[i] = cardsJson(arrs[i]!.deadwood);
      }
    } else {
      final closerArr = arrs[closer]!;
      final onto = [...closerArr.melds];
      final deadOf = <int, List<PlayingCard>>{};
      final allowLayoff = !(isGin && closerArr.deadwood.isEmpty);
      for (final i in active) {
        if (i == closer) continue;
        deadOf[i] = allowLayoff ? _layoff(arrs[i]!.deadwood, onto) : arrs[i]!.deadwood;
        meldsJson[i] = [for (final m in arrs[i]!.melds) cardsJson(m.cards)];
        deadJson[i] = cardsJson(deadOf[i]!);
      }
      meldsJson[closer] = [for (final m in onto) cardsJson(m.cards)];
      deadJson[closer] = cardsJson(closerArr.deadwood);
      final name = seats[closer].name;

      if (isGin) {
        final other = deadOf.keys.single;
        final dK = closerArr.deadValue, dD = _sum(deadOf[other]!);
        if (dK == 0) {
          pts[closer] = 25 + dD;
          headline = '¡$name hizo GIN!';
        } else if (dD <= dK) {
          pts[other] = 25 + dK - dD;
          headline = '¡Undercut de ${seats[other].name}!';
        } else {
          pts[closer] = dD - dK;
          headline = '$name tocó';
        }
        for (var i = 0; i < n; i++) {
          seats[i].score += pts[i];
        }
      } else {
        if (_isChinchon(seats[closer].hand)) {
          headline = '¡CHINCHÓN de $name! Gana la partida';
          result = RoundResult(
            closer,
            headline,
            pts,
            [
              for (final s in seats) [...s.hand],
            ],
            {'melds': meldsJson, 'dead': deadJson},
          );
          event = headline;
          gameWinner = closer;
          phase = Phase.gameOver;
          fx('gameOver', closer);
          return;
        }
        pts[closer] = closerArr.deadwood.isEmpty ? -10 : closerArr.deadValue;
        for (final e in deadOf.entries) {
          pts[e.key] = _sum(e.value);
        }
        for (final i in active) {
          seats[i].score += pts[i];
          if (seats[i].score > config.target) seats[i].eliminated = true;
        }
        headline = closerArr.deadwood.isEmpty ? '¡$name cerró limpio! −10' : '$name cerró';
      }
    }
    result = RoundResult(
      closer,
      headline,
      pts,
      [
        for (final s in seats) [...s.hand],
      ],
      {'melds': meldsJson, 'dead': deadJson},
    );
    event = headline;
    phase = _gameOver() ? Phase.gameOver : Phase.roundOver;
    fx(phase == Phase.gameOver ? 'gameOver' : 'roundOver', closer ?? -1);
  }

  bool _gameOver() {
    final idx = List.generate(seats.length, (i) => i);
    if (isGin) {
      final best = idx.reduce((a, b) => seats[a].score >= seats[b].score ? a : b);
      if (seats[best].score >= config.target) {
        gameWinner = best;
        return true;
      }
      return false;
    }
    final alive = active;
    if (alive.length <= 1) {
      gameWinner = alive.isEmpty ? idx.reduce((a, b) => seats[a].score <= seats[b].score ? a : b) : alive.single;
      return true;
    }
    return false;
  }

  @override
  Map<String, dynamic> viewFor(int seat) => {
    'game': 'knock',
    'variant': config.variant,
    'phase': phase.name,
    'round': round,
    'current': current,
    'me': seat,
    'hand': cardsJson(seats[seat].hand),
    'players': [
      for (var i = 0; i < seats.length; i++)
        {
          'name': seats[i].name,
          'count': seats[i].hand.length,
          'score': seats[i].score,
          'eliminated': seats[i].eliminated,
          'connected': seats[i].connected,
        },
    ],
    'stock': stock.length,
    'discard': cardsJson(discard.sublist(max(0, discard.length - 6))),
    'discardTotal': discard.length,
    'lockedDiscard': seat == current ? takenFromDiscard : null,
    'event': event,
    'fx': fxJson,
    'result': result?.toJson(),
    'winner': gameWinner,
    'rules': {'knockLimit': config.knockLimit, 'target': config.target, 'style': config.style.name},
  };
}
