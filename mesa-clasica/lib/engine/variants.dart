import 'dart:math';

import 'cards.dart';
import 'game.dart';
import 'knock_rummy.dart';
import 'melds.dart';
import 'pinch.dart';
import 'poker_rummy.dart';
import 'table_rummy.dart';

/// Opción configurable al crear la mesa.
class GameOption {
  final String key;
  final String label;
  final List<int> values;
  final List<String> labels;
  final int defaultValue;

  const GameOption(this.key, this.label, this.values, this.labels, this.defaultValue);
}

class Variant {
  final String id;
  final String name;
  final String tagline;
  final String rulesText;
  final int minPlayers;
  final int maxPlayers;
  final List<GameOption> options;
  final CardGame Function(List<String> names, Map<String, int> opts, Random? rng) create;

  const Variant({
    required this.id,
    required this.name,
    required this.tagline,
    required this.rulesText,
    required this.minPlayers,
    required this.maxPlayers,
    required this.options,
    required this.create,
  });

  Map<String, int> defaults() => {for (final o in options) o.key: o.defaultValue};
}

const _yesNo = ['No', 'Sí'];

int _face(PlayingCard c, int? rank) => rank == null ? c.rank : (rank == 14 ? 1 : rank);

/// Valores de carta del Rummy Colombiano: 2-10 su número, J-Q-K 10, As 15 (1 en A-2-3), comodín 30.
int colombianoValue(PlayingCard c, {int? rank, bool lowAce = false}) {
  if (c.isJoker && rank == null) return 30;
  final r = _face(c, rank);
  if (r == 1) return lowAce ? 1 : 15;
  return r >= 10 ? 10 : r;
}

/// Remis clásico: As 1, figuras 10.
int clasicoValue(PlayingCard c, {int? rank, bool lowAce = false}) {
  if (c.isJoker && rank == null) return 25;
  final r = _face(c, rank);
  return r >= 10 ? 10 : r;
}

/// Continental: comodín 50, As 20, 8 a K 10, 2 a 7 5.
int continentalValue(PlayingCard c, {int? rank, bool lowAce = false}) {
  if (c.isJoker && rank == null) return 50;
  final r = _face(c, rank);
  if (r == 1) return 20;
  return r >= 8 ? 10 : 5;
}

/// Rummy 500: As 15 (1 en A-2-3), figuras 10, números su valor, comodín 15.
int r500Value(PlayingCard c, {int? rank, bool lowAce = false}) {
  if (c.isJoker && rank == null) return 15;
  final r = _face(c, rank);
  if (r == 1) return lowAce ? 1 : 15;
  return r >= 10 ? 10 : r;
}

int ginValue(PlayingCard c) => c.rank >= 10 ? 10 : c.rank;

int chinchonValue(PlayingCard c) => c.isJoker ? 25 : c.rank;

/// Reglas de juegos por modalidad (las usa el motor y la pantalla para validar en vivo).
MeldRules meldRulesFor(String id, Map<String, int> o) => switch (id) {
  'colombiano' => MeldRules(maxJokers: o['jokers'] ?? 1, minNaturals: 2),
  'clasico' => MeldRules(aceHigh: o['aceHigh'] != 0),
  'continental' => const MeldRules(
    minRun: 4,
    maxSet: 0,
    setDistinctSuits: false,
    minNaturals: 2,
    noAdjacentJokers: true,
  ),
  'gin' => const MeldRules(aceHigh: false),
  'chinchon' => MeldRules(
    deck: o['deck'] == 48 ? DeckKind.spanish48 : DeckKind.spanish40,
    aceHigh: false,
    maxJokers: 1,
    minNaturals: 2,
  ),
  'poker' || 'la51' => MeldRules(
    minRun: o['run'] ?? 3,
    wrapRuns: o['wrap'] != 0,
    aceHigh: o['wrap'] == 0,
    maxJokers: (o['jokers'] ?? 0) > 0 ? 1 : 0,
    minNaturals: 2,
  ),
  _ => const MeldRules(),
};

/// Valor de carta suelta para mostrar la carta muerta en Gin y Chinchón.
/// Póker colombiano y La 51: 2–9 su número; 10, J, Q, K y As valen 10; comodín suelto 20.
int pokerValue(PlayingCard c, {int? rank, bool lowAce = false}) {
  if (c.isJoker && rank == null) return 20;
  final r = rank ?? c.rank;
  return r == 1 || r >= 10 ? 10 : r;
}

PinchRules pinchRulesFrom(Map<String, int> o) => PinchRules(
  mode: PinchMode.values[(o['pinch'] ?? 0).clamp(0, 2)],
  penalty: o['penalty'] ?? 0,
  falsePinch: FalsePinch.values[(o['false'] ?? 2).clamp(0, 3)],
  window: o['window'] ?? 2,
  warnSelf: (o['warn'] ?? 1) == 1,
);

const _pinchOptions = [
  GameOption('pinch', 'Pinchado', [0, 1, 2], ['No', 'Manual (¡Pinchar!)', 'Automático'], 0),
  GameOption(
    'penalty',
    'Castigo al pinchado',
    [0, 25, 50, 10000, 50000, 100000],
    ['Sale de la ronda', '+25 puntos', '+50 puntos', 'Paga 10.000 fichas', 'Paga 50.000 fichas', 'Paga 100.000 fichas'],
    0,
  ),
  GameOption(
    'false',
    'Pinchar en falso (ignorando la advertencia)',
    [2, 1, 3, 0],
    ['Sale de la partida', 'Sale de la ronda', 'Paga 50.000 fichas', 'Sin castigo'],
    2,
  ),
  GameOption(
    'window',
    'Plazo para pinchar',
    [2, 1, 3],
    ['Hasta que vuelva a jugar el que falló', 'Solo el turno siguiente', 'Toda la ronda'],
    2,
  ),
  GameOption('warn', 'Avisarme antes de cometer una falta', [1, 0], ['Sí', 'No'], 1),
];

int Function(PlayingCard) knockValueFor(String id) => id == 'gin' ? ginValue : chinchonValue;

const continentalContracts = [
  Contract(2, 0),
  Contract(1, 1),
  Contract(0, 2),
  Contract(3, 0),
  Contract(2, 1),
  Contract(1, 2),
  Contract(0, 3),
];

final List<Variant> variants = [
  Variant(
    id: 'poker',
    name: 'Póker Colombiano',
    tagline: '14 cartas · bájate con 51 o más en ternas y escaleras',
    rulesText:
        'Se juega con 2 barajas. Cada jugador recibe 14 cartas. En tu turno robas del mazo (o tomas '
        'el descarte, pero solo si con esa carta te bajas) y botas una. Te bajas cuando tienes '
        'ternas, cuartas (mismo valor, palos distintos) o escaleras (mismo palo, desde 3 cartas; '
        'con vuelta K-A-2 si se acuerda) que suman el mínimo; las cartas sueltas se quedan en tu '
        'mano. Con la regla de mano completa, en cambio, deben ir las 15 cartas en juegos. Quien '
        'se baja gana la ronda; los demás suman sus cartas sueltas. Quien llega a la meta queda '
        'eliminado.\n'
        'Pinchado: si se activa, la app no avisa los errores (tomar el descarte y no bajarse, '
        'bajarse mal). Los demás tienen hasta que termina el turno siguiente, o 15 segundos tras '
        'una bajada, para tocar ¡Pinchar!.\n'
        'Valores: 2–9 su número · 10, J, Q, K y As 10 · comodín suelto 20.',
    minPlayers: 2,
    maxPlayers: 4,
    options: const [
      GameOption('full', 'Bajarse con', [0, 1], ['Juegos de 51 o más', 'Mano completa (15 cartas)'], 0),
      GameOption('min', 'Mínimo para bajarse', [51, 71, 81], ['51', '71', '81'], 51),
      GameOption('run', 'Escalera mínima', [3, 4], ['3 cartas', '4 cartas'], 3),
      GameOption('wrap', 'Escalera con vuelta (K-A-2)', [1, 0], ['Sí', 'No'], 1),
      GameOption('jokers', 'Comodines', [0, 2, 4], ['Sin comodines', '2', '4'], 0),
      GameOption('pay', 'Los perdedores pagan', [0, 1], ['Cartas sueltas', 'Toda la mano'], 0),
      GameOption('target', 'Eliminación a', [100, 200, 300], ['100', '200', '300'], 100),
      ..._pinchOptions,
    ],
    create: (names, o, rng) => PokerRummy(
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
      names,
      rng: rng,
    ),
  ),
  Variant(
    id: 'la51',
    name: 'La 51',
    tagline: '14 cartas · baja 51 y pega a la mesa',
    rulesText:
        'Con 2 barajas y 14 cartas por jugador. Para bajarte por primera vez tus juegos deben sumar '
        'el mínimo (51). Después puedes pegar cartas a cualquier juego de la mesa. Solo puedes '
        'tomar el descarte si usas esa carta para bajar o pegar en ese turno. Si ya te bajaste, no '
        'puedes botar una carta que entra en un juego de la mesa. Gana la ronda quien se queda sin '
        'cartas; los demás suman lo que les quedó. Quien llega a la meta queda eliminado.\n'
        'Pinchado: si se activa, la app deja pasar esas faltas (y bajar o pegar mal) y los demás '
        'pueden tocar ¡Pinchar! hasta que termina el turno siguiente.\n'
        'Valores: 2–9 su número · 10, J, Q, K y As 10 · comodín suelto 20.',
    minPlayers: 2,
    maxPlayers: 4,
    options: const [
      GameOption('min', 'Mínimo para bajarse', [51, 71, 81], ['51', '71', '81'], 51),
      GameOption('run', 'Escalera mínima', [3, 4], ['3 cartas', '4 cartas'], 3),
      GameOption('wrap', 'Escalera con vuelta (K-A-2)', [1, 0], ['Sí', 'No'], 1),
      GameOption('jokers', 'Comodines', [0, 2, 4], ['Sin comodines', '2', '4'], 0),
      GameOption('target', 'Eliminación a', [100, 200, 300], ['100', '200', '300'], 100),
      ..._pinchOptions,
    ],
    create: (names, o, rng) => TableRummy(
      TableConfig(
        variant: 'la51',
        rules: meldRulesFor('la51', o),
        decks: 2,
        jokers: o['jokers']!,
        handSize: (_, _) => 14,
        firstMeldMin: o['min']!,
        discardMustBeUsed: true,
        discardFitsFault: true,
        pinch: pinchRulesFrom(o),
        scoring: Scoring.penaltyElimination,
        target: o['target']!,
        value: pokerValue,
      ),
      names,
      rng: rng,
    ),
  ),
  Variant(
    id: 'colombiano',
    name: 'Rummy Colombiano',
    tagline: '2 barajas · 4 comodines · paga doble el Rummy',
    rulesText:
        'Forma tríos (mismo valor, palos distintos) y escaleras (mismo palo, 3 o más). '
        'La primera bajada debe sumar el mínimo acordado. Solo puedes añadir a juegos de la mesa '
        'después de bajar. Si tienes la carta que un comodín reemplaza, puedes cambiarla y '
        'quedarte con el comodín. Quien bota todas sus cartas cierra; los demás suman lo que '
        'les quedó en la mano. Si cierras bajando todo en un solo turno ("Rummy"), pagan doble. '
        'Quien llega a la meta queda eliminado; gana el último en pie.\n'
        'Valores: 2–10 su número · J, Q, K 10 · As 15 (1 en A-2-3) · comodín 30.',
    minPlayers: 2,
    maxPlayers: 4,
    options: const [
      GameOption('cards', 'Cartas por jugador', [0, 7, 9, 10, 13], ['Auto (10 / 9)', '7', '9', '10', '13'], 0),
      GameOption('first', 'Primera bajada mínima', [0, 30, 40, 51], ['Sin mínimo', '30', '40', '51'], 30),
      GameOption('jokers', 'Comodines por juego', [1, 2, -1], ['1', '2', 'Sin límite'], 1),
      GameOption('target', 'Eliminación a', [100, 150, 200, 300], ['100', '150', '200', '300'], 100),
      GameOption('double', 'Rummy paga doble', [1, 0], ['Sí', 'No'], 1),
      GameOption('swap', 'Cambiar comodín', [1, 0], ['Sí', 'No'], 1),
    ],
    create: (names, o, rng) => TableRummy(
      TableConfig(
        variant: 'colombiano',
        rules: meldRulesFor('colombiano', o),
        decks: 2,
        jokers: 4,
        handSize: (p, _) => o['cards']! > 0 ? o['cards']! : (p == 2 ? 10 : 9),
        firstMeldMin: o['first']!,
        rummyDouble: o['double'] == 1,
        jokerSwap: o['swap'] == 1,
        scoring: Scoring.penaltyElimination,
        target: o['target']!,
        value: colombianoValue,
      ),
      names,
      rng: rng,
    ),
  ),
  Variant(
    id: 'clasico',
    name: 'Remis Clásico',
    tagline: '1 baraja · el que cierra cobra',
    rulesText:
        'Roba del mazo o del descarte, baja tríos o escaleras de 3 o más y descarta. '
        'Puedes añadir cartas a cualquier juego de la mesa una vez hayas bajado. Quien se queda '
        'sin cartas gana la ronda y suma los puntos que quedaron en las manos de los demás. '
        'Gana la partida quien llegue primero a la meta.\n'
        'Valores: As 1 · 2–10 su número · J, Q, K 10.',
    minPlayers: 2,
    maxPlayers: 4,
    options: const [
      GameOption('target', 'Partida a', [100, 200, 500], ['100', '200', '500'], 100),
      GameOption('double', 'Rummy paga doble', [1, 0], ['Sí', 'No'], 1),
      GameOption('aceHigh', 'As después del Rey (Q-K-A)', [1, 0], ['Sí', 'No'], 1),
      GameOption('layoff', 'Añadir sin haber bajado', [0, 1], _yesNo, 0),
    ],
    create: (names, o, rng) => TableRummy(
      TableConfig(
        variant: 'clasico',
        rules: meldRulesFor('clasico', o),
        handSize: (p, _) => p == 2 ? 10 : 7,
        rummyDouble: o['double'] == 1,
        layoffNeedsMeld: o['layoff'] != 1,
        scoring: Scoring.winnerTakes,
        target: o['target']!,
        value: clasicoValue,
      ),
      names,
      rng: rng,
    ),
  ),
  Variant(
    id: 'continental',
    name: 'Continental',
    tagline: '7 rondas con contrato · compra del descarte',
    rulesText:
        'Cada ronda exige un contrato para bajar: 2 tríos · trío y escalera · 2 escaleras · '
        '3 tríos · 2 tríos y escalera · trío y 2 escaleras · 3 escaleras. Se reparten 6 cartas en '
        'la primera ronda y una más en cada ronda. Las escaleras son de 4 o más. Después de bajar '
        'el contrato solo puedes añadir a juegos. Si el jugador de turno roba del mazo, los demás '
        'pueden comprar el descarte llevándose una carta de castigo. Al terminar las 7 rondas gana '
        'quien tenga menos puntos.\n'
        'Valores: comodín 50 · As 20 · 8 a K 10 · 2 a 7 5.',
    minPlayers: 2,
    maxPlayers: 4,
    options: const [
      GameOption('buys', 'Compras por ronda', [3, 0, 99], ['3', 'Sin compras', 'Ilimitadas'], 3),
      GameOption('swap', 'Cambiar comodín', [1, 0], ['Sí', 'No'], 1),
    ],
    create: (names, o, rng) => TableRummy(
      TableConfig(
        variant: 'continental',
        rules: meldRulesFor('continental', o),
        decks: 2,
        jokers: 4,
        handSize: (_, round) => 5 + round,
        contracts: continentalContracts,
        buysPerRound: o['buys']!,
        jokerSwap: o['swap'] == 1,
        scoring: Scoring.penaltyRounds,
        target: 0,
        value: continentalValue,
      ),
      names,
      rng: rng,
    ),
  ),
  Variant(
    id: 'r500',
    name: 'Rummy 500',
    tagline: 'Suma lo que bajas · descarte a la vista',
    rulesText:
        'El descarte queda extendido: puedes tomar cualquier carta llevándote también '
        'todas las que están encima, pero la más honda debes usarla en un juego ese mismo turno. '
        'Puedes añadir a juegos de cualquiera; los puntos son para quien añade. Al cerrar la ronda '
        'cada uno suma lo que bajó y resta lo que le quedó en la mano (si se acaba el mazo, la ronda termina ahí). Gana quien llegue a la meta.\n'
        'Valores: As 15 (1 en A-2-3) · J, Q, K y 10 valen 10 · 2–9 su número · comodín 15.',
    minPlayers: 2,
    maxPlayers: 4,
    options: const [
      GameOption('target', 'Partida a', [500, 300, 1000], ['500', '300', '1000'], 500),
      GameOption('jokers', 'Comodines', [2, 0], ['2', 'Sin comodines'], 2),
    ],
    create: (names, o, rng) => TableRummy(
      TableConfig(
        variant: 'r500',
        rules: meldRulesFor('r500', o),
        jokers: o['jokers']!,
        handSize: (p, _) => p == 2 ? 13 : 7,
        digDiscard: true,
        reshuffle: false,
        layoffNeedsMeld: false,
        jokerSwap: true,
        scoring: Scoring.plusMinus,
        target: o['target']!,
        value: r500Value,
      ),
      names,
      rng: rng,
    ),
  ),
  Variant(
    id: 'gin',
    name: 'Gin Rummy',
    tagline: 'Mano a mano · toca con 10 o menos',
    rulesText:
        'Cada jugador recibe 10 cartas y forma juegos en la mano. Puedes tocar (cerrar) '
        'al descartar si tu carta muerta suma el límite o menos. El rival puede acomodar sus '
        'cartas sueltas en tus juegos. Si cierras sin carta muerta haces GIN (+25). Si el rival '
        'queda con igual o menos carta muerta que tú, hace undercut (+25). El As vale 1 y va '
        'solo antes del 2.\nValores: As 1 · 2–10 su número · J, Q, K 10.',
    minPlayers: 2,
    maxPlayers: 2,
    options: const [
      GameOption('target', 'Partida a', [100, 250, 50], ['100', '250', '50'], 100),
      GameOption('knock', 'Tocar con', [10, 5, 0], ['10 o menos', '5 o menos', 'Solo Gin'], 10),
    ],
    create: (names, o, rng) => KnockRummy(
      KnockConfig(
        variant: 'gin',
        style: KnockStyle.gin,
        rules: meldRulesFor('gin', o),
        handSize: 10,
        knockLimit: o['knock']!,
        target: o['target']!,
        value: ginValue,
      ),
      names,
      rng: rng,
    ),
  ),
  Variant(
    id: 'chinchon',
    name: 'Chinchón',
    tagline: 'Baraja española · cierra y suma menos',
    rulesText:
        'Con baraja española, cada jugador recibe 7 cartas y forma juegos en la mano '
        '(tríos o escaleras de 3 del mismo palo). Al descartar puedes cerrar si te queda como '
        'máximo una carta suelta del valor acordado. Los demás acomodan sus cartas en tus juegos '
        'y suman sus sueltas. Si cierras sin sueltas restas 10. Si haces Chinchón (escalera de 7 '
        'del mismo palo sin comodín) ganas la partida. Quien pase la meta queda eliminado.\n'
        'Valores: cada carta su número (Sota 10, Caballo 11, Rey 12) · comodín 25.',
    minPlayers: 2,
    maxPlayers: 4,
    options: const [
      GameOption('deck', 'Baraja', [40, 48], ['40 cartas', '48 cartas'], 40),
      GameOption('jokers', 'Comodines', [2, 0], ['2', 'Sin comodines'], 2),
      GameOption('close', 'Cerrar con suelta de', [5, 3, 0], ['5 o menos', '3 o menos', 'Cualquiera'], 5),
      GameOption('target', 'Eliminación al pasar de', [100, 50], ['100', '50'], 100),
    ],
    create: (names, o, rng) => KnockRummy(
      KnockConfig(
        variant: 'chinchon',
        style: KnockStyle.chinchon,
        rules: meldRulesFor('chinchon', o),
        jokers: o['jokers']!,
        handSize: 7,
        knockLimit: o['close']!,
        target: o['target']!,
        value: chinchonValue,
      ),
      names,
      rng: rng,
    ),
  ),
];

Variant variantById(String id) => variants.firstWhere((v) => v.id == id);
