import 'dart:math';

import 'arrangement.dart';
import 'cards.dart';
import 'game.dart';
import 'melds.dart';
import 'pinch.dart';

class PokerConfig {
  final String variant;
  final MeldRules rules;
  final int decks;
  final int jokers;
  final int handSize;

  /// Puntos mínimos de la bajada.
  final int minDown;
  final PinchRules pinch;

  /// Cobrar toda la mano en vez de solo las cartas sueltas.
  final bool payWholeHand;

  /// true: hay que bajarse con las 15 cartas en juegos. false: basta con juegos que sumen el mínimo.
  final bool fullHand;
  final int target;
  final int Function(PlayingCard c, {int? rank}) value;
  final Duration reviewTime;

  const PokerConfig({
    required this.variant,
    required this.rules,
    required this.minDown,
    required this.target,
    required this.value,
    this.decks = 2,
    this.jokers = 0,
    this.handSize = 14,
    this.pinch = const PinchRules(),
    this.payWholeHand = false,
    this.fullHand = false,
    this.reviewTime = const Duration(seconds: 15),
  });
}

/// Póker colombiano: te bajas con ternas, cuartas o escaleras que suman el mínimo
/// (o, en la regla de mano completa, con las 15 cartas en juegos). La ronda termina ahí.
class PokerRummy extends CardGame with Pinchable {
  final PokerConfig config;
  @override
  final List<Seat> seats;
  final Random rng;
  final DateTime Function() now;

  List<PlayingCard> stock = [];
  List<PlayingCard> discard = [];
  int current = 0;
  int dealer = 0;
  int round = 1;
  int reshuffles = 0;
  @override
  Phase phase = Phase.draw;
  int? takenFromDiscard;
  @override
  String event = '';
  RoundResult? result;
  int? gameWinner;

  /// Bajada en revisión (o la ganadora al terminar la ronda).
  int? downSeat;
  List<List<PlayingCard>> downGroups = [];
  bool downValid = false;
  DateTime? reviewEnds;

  PokerRummy(this.config, List<String> names, {Random? rng, DateTime Function()? now})
    : seats = [for (final n in names) Seat(n)],
      rng = rng ?? Random.secure(),
      now = now ?? DateTime.now {
    dealer = seats.length - 1;
    _startRound();
  }

  @override
  PinchRules get pinchRules => config.pinch;
  MeldRules get rules => config.rules;
  List<int> get active => [
    for (var i = 0; i < seats.length; i++)
      if (!seats[i].eliminated) i,
  ];

  int _nextInRound(int from) {
    var i = from;
    for (var k = 0; k < seats.length; k++) {
      i = (i + 1) % seats.length;
      if (inRound(i)) return i;
    }
    return from;
  }

  void _startRound() {
    resetPinch();
    final deck = buildDeck(rules.deck, decks: config.decks, jokers: config.jokers, rng: rng);
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
    current = _nextInRound(dealer);
    phase = Phase.draw;
    takenFromDiscard = null;
    downSeat = null;
    downGroups = [];
    reviewEnds = null;
    reshuffles = 0;
    result = null;
    event = 'Ronda $round · empieza ${seats[current].name}';
    fx('deal', current);
  }

  @override
  void nextRound() {
    if (phase != Phase.roundOver) throw GameError('La ronda no ha terminado');
    resetPinch();
    round++;
    dealer = _nextInRound(dealer);
    _startRound();
  }

  int cardPoints(PlayingCard c, int? rank) => config.value(c, rank: rank);

  int meldPoints(Meld m) {
    var s = 0;
    for (var i = 0; i < m.cards.length; i++) {
      s += cardPoints(m.cards[i], m.ranks[i]);
    }
    return s;
  }

  /// Mejor bajada posible con [hand], o null si todavía no alcanza (mínimo de puntos y,
  /// con mano completa, todas las cartas en juegos).
  Arrangement? bestDown(List<PlayingCard> hand) {
    final arr = bestArrangement(hand, rules, (c) => 1 + cardPoints(c, null));
    if (config.fullHand && (arr.deadwood.isNotEmpty || hand.length < config.handSize + 1)) return null;
    if (arr.melds.fold(0, (s, m) => s + meldPoints(m)) < config.minDown) return null;
    return arr;
  }

  @override
  DateTime? get deadline => phase == Phase.review ? reviewEnds : null;

  @override
  void onDeadline() {
    if (phase != Phase.review) return;
    _finishDown();
  }

  @override
  void apply(int seat, Map<String, dynamic> a) {
    _apply(seat, a);
    flushAuto();
  }

  void _apply(int seat, Map<String, dynamic> a) {
    final type = a['type'] as String?;
    if (phase == Phase.roundOver || phase == Phase.gameOver) throw GameError('La ronda terminó');
    if (type == 'pinch') return _pinch(seat, force: a['force'] == true);
    if (phase == Phase.review) throw GameError('Esperando la revisión de la bajada');
    if (seat != current) throw GameError('No es tu turno');
    final hand = seats[seat].hand;
    switch (type) {
      case 'drawStock':
        if (phase != Phase.draw) throw GameError('Ya robaste en este turno');
        if (stock.isEmpty) {
          if (discard.length <= 1 || reshuffles >= 2) return _endRound(null);
          reshuffles++;
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
        final top = discard.last;
        if (!config.pinch.enabled && bestDown([...hand, top]) == null) {
          throw GameError('Solo puedes tomar el descarte si con esa carta te bajas');
        }
        hand.add(discard.removeLast());
        takenFromDiscard = top.id;
        phase = Phase.play;
        event = '${seats[seat].name} tomó del descarte';
        fx('drawDiscard', seat);
      case 'discard':
        if (phase != Phase.play) throw GameError('Primero debes robar');
        final id = a['card'] as int;
        if (takenFromDiscard != null) {
          if (id == takenFromDiscard) throw GameError('No puedes botar la carta que tomaste');
          fault(seat, FaultKind.tookDiscard, 'Tomaste del descarte: debes bajarte en este turno');
        }
        discard.add(takeById(hand, id));
        event = '${seats[seat].name} botó una carta';
        fx('discard', seat);
        _endTurn(seat);
      case 'goDown':
        if (phase != Phase.play) throw GameError('Primero debes robar');
        _goDown(seat, [for (final g in a['groups'] as List) idsOf(g)]);
      default:
        throw GameError('Acción desconocida');
    }
  }

  void _endTurn(int seat) {
    turnSerial++;
    current = _nextInRound(seat);
    phase = Phase.draw;
    takenFromDiscard = null;
  }

  void _goDown(int seat, List<List<int>> groups) {
    final hand = seats[seat].hand;
    final ids = groups.expand((g) => g).toList();
    if (ids.toSet().length != ids.length) throw GameError('Carta repetida');
    final byId = {for (final c in hand) c.id: c};
    if (ids.isEmpty || ids.any((id) => !byId.containsKey(id))) throw GameError('Selecciona tus juegos');
    if (config.fullHand && ids.length != hand.length) {
      throw GameError('Para bajarte deben ir todas tus cartas en juegos');
    }
    final cards = [
      for (final g in groups) [for (final id in g) byId[id]!],
    ];
    final melds = [for (final g in cards) analyzeMeld(g, rules)];
    final valid = melds.every((m) => m != null);
    final pts = valid ? melds.fold(0, (s, m) => s + meldPoints(m!)) : 0;
    final ok = valid && pts >= config.minDown;
    if (!ok) {
      fault(
        seat,
        FaultKind.badDown,
        valid ? 'Tu bajada suma $pts; el mínimo es ${config.minDown}' : 'Hay un juego mal armado en tu bajada',
      );
      // Pinchado automático: la bajada no vale y se castiga al terminar la acción.
      if (config.pinch.auto) return;
    }
    downSeat = seat;
    downGroups = [for (var i = 0; i < cards.length; i++) melds[i]?.cards ?? cards[i]];
    downValid = ok;
    if (config.pinch.manual) {
      phase = Phase.review;
      reviewEnds = now().add(config.reviewTime);
      event = '${seats[seat].name} se bajó · revisen su juego';
      fx('goDown', seat);
    } else {
      fx('goDown', seat);
      _finishDown();
    }
  }

  void _finishDown() {
    reviewEnds = null;
    _endRound(downSeat);
  }

  void _pinch(int seat, {bool force = false}) {
    if (phase == Phase.review) {
      final victim = downSeat!;
      if (seat == victim) throw GameError('No puedes pincharte a ti mismo');
      if (!inRound(seat)) throw GameError('Estás fuera de la ronda');
      if (!downValid) {
        final f = faults.lastWhere((f) => f.seat == victim && f.kind == FaultKind.badDown);
        f.pinched = true;
        f.by = seat;
        event = pinchHeadline(seats[seat].name, seats[victim].name, true);
        fx('pinch', victim);
        reviewEnds = null;
        downSeat = null;
        downGroups = [];
        // Sigue su turno con las cartas devueltas: debe botar (o queda fuera, según el castigo).
        phase = Phase.play;
        current = victim;
        penalizeFault(victim, seat);
        return;
      }
      if (!force) throw PinchWarning(falseWarning);
      falsePinches.add(seat);
      event = pinchHeadline(seats[seat].name, seats[seat].name, false);
      fx('falsePinch', seat);
      punishFalse(seat, accused: victim);
      if (phase == Phase.review) _finishDown();
      return;
    }
    final r = resolvePinch(seat, force: force);
    event = pinchHeadline(seats[seat].name, seats[r.victim].name, r.hit);
    fx(r.hit ? 'pinch' : 'falsePinch', r.victim);
  }

  @override
  void onRoundOut(int seat) {
    final left = [
      for (var i = 0; i < seats.length; i++)
        if (inRound(i)) i,
    ];
    if (left.length <= 1) {
      downSeat = left.isEmpty ? null : left.single;
      downGroups = [];
      _endRound(downSeat);
      return;
    }
    if (current == seat) {
      phase = Phase.draw;
      takenFromDiscard = null;
      current = _nextInRound(seat);
    }
  }

  void _endRound(int? winner) {
    final n = seats.length;
    final pts = List.filled(n, 0);
    final deadJson = List<List<List<int>>>.generate(n, (_) => []);
    final meldsJson = List<List<List<List<int>>>>.generate(n, (_) => []);
    for (final i in active) {
      if (i == winner) continue;
      final hand = seats[i].hand;
      if (roundOut[i] || config.payWholeHand) {
        pts[i] = hand.fold(0, (s, c) => s + cardPoints(c, null));
        deadJson[i] = cardsJson(hand);
      } else {
        final arr = bestArrangement(hand, rules, (c) => cardPoints(c, null));
        pts[i] = arr.deadValue;
        meldsJson[i] = [for (final m in arr.melds) cardsJson(m.cards)];
        deadJson[i] = cardsJson(arr.deadwood);
      }
      seats[i].score += pts[i];
    }
    if (winner != null) {
      meldsJson[winner] = [for (final g in downGroups) cardsJson(g)];
      final down = downGroups.expand((g) => g).toSet();
      deadJson[winner] = cardsJson(seats[winner].hand.where((c) => !down.contains(c)));
    }
    for (final i in active) {
      if (seats[i].score >= config.target) seats[i].eliminated = true;
    }
    final headline = winner == null
        ? 'Se acabó el mazo: nadie se bajó'
        : downGroups.isEmpty
        ? '${seats[winner].name} gana: los demás quedaron fuera'
        : '¡${seats[winner].name} se bajó y gana la ronda!';
    result = RoundResult(
      winner,
      headline,
      pts,
      [
        for (final s in seats) [...s.hand],
      ],
      {'melds': meldsJson, 'dead': deadJson, ...pinchResultJson()},
    );
    event = headline;
    phase = Phase.roundOver;
    final alive = active;
    if (alive.length <= 1) {
      gameWinner = alive.isEmpty
          ? List.generate(n, (i) => i).reduce((a, b) => seats[a].score <= seats[b].score ? a : b)
          : alive.single;
      phase = Phase.gameOver;
    }
    fx(phase == Phase.gameOver ? 'gameOver' : 'roundOver', winner ?? -1);
  }

  @override
  Map<String, dynamic> viewFor(int seat) {
    final left = reviewEnds?.difference(now()).inMilliseconds;
    return {
      'game': 'poker',
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
            'out': roundOut[i],
            'connected': seats[i].connected,
          },
      ],
      'stock': stock.length,
      'discard': cardsJson(discard.sublist(max(0, discard.length - 6))),
      'discardTotal': discard.length,
      'lockedDiscard': seat == current ? takenFromDiscard : null,
      'down': downSeat == null || phase != Phase.review
          ? null
          : {
              'seat': downSeat,
              'groups': [for (final g in downGroups) cardsJson(g)],
            },
      'reviewMs': left == null ? null : max(0, left),
      'event': event,
      'fx': fxJson,
      'result': result?.toJson(),
      'winner': gameWinner,
      'rules': {
        'minDown': config.minDown,
        'fullHand': config.fullHand,
        'handSize': config.handSize,
        'target': config.target,
        'pinch': config.pinch.toJson(),
        'scoring': 'penaltyElimination',
      },
    };
  }
}
