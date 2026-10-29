import 'cards.dart';

/// Acción inválida; el mensaje se muestra al jugador.
class GameError implements Exception {
  final String message;
  GameError(this.message);
  @override
  String toString() => message;
}

/// Jugador sentado en la mesa (común a todos los motores).
class Seat {
  final String name;
  List<PlayingCard> hand = [];
  int score = 0;
  bool eliminated = false;
  bool connected = true;

  Seat(this.name);
}

/// Resultado de una ronda, para la pantalla de resultados.
class RoundResult {
  final int? winner;
  final String headline;

  /// Puntos de la ronda por asiento (positivos o negativos según la modalidad).
  final List<int> points;

  /// Manos reveladas al final de la ronda.
  final List<List<PlayingCard>> hands;

  /// Datos adicionales por modalidad (p. ej. juegos y carta muerta en Gin).
  final Map<String, dynamic> extra;

  RoundResult(this.winner, this.headline, this.points, this.hands, [this.extra = const {}]);

  Map<String, dynamic> toJson() => {
    'winner': winner,
    'headline': headline,
    'points': points,
    'hands': [
      for (final h in hands) [for (final c in h) c.toJson()],
    ],
    ...extra,
  };
}

enum Phase { draw, play, review, roundOver, gameOver }

/// Interfaz que el servidor usa para cualquier juego.
abstract class CardGame {
  List<Seat> get seats;
  Phase get phase;

  /// Aplica una acción del asiento [seat]. Lanza [GameError] si no es válida.
  void apply(int seat, Map<String, dynamic> action);

  /// Vista del juego para [seat]: nunca incluye las manos ajenas.
  Map<String, dynamic> viewFor(int seat);

  /// Empieza la siguiente ronda (después de `roundOver`).
  void nextRound();

  /// Plazo pendiente (p. ej. revisión de una bajada). El servidor llama a [onDeadline] al vencer.
  DateTime? get deadline => null;
  void onDeadline() {}

  /// Último evento, para que los clientes reproduzcan sonidos y animaciones.
  int fxSeq = 0;
  String fxKind = '';
  int fxSeat = -1;

  void fx(String kind, int seat) {
    fxSeq++;
    fxKind = kind;
    fxSeat = seat;
  }

  Map<String, dynamic> get fxJson => {'seq': fxSeq, 'kind': fxKind, 'seat': fxSeat};
}

List<List<int>> cardsJson(Iterable<PlayingCard> cards) => [for (final c in cards) c.toJson()];

PlayingCard takeById(List<PlayingCard> from, int id) {
  final i = from.indexWhere((c) => c.id == id);
  if (i < 0) throw GameError('No tienes esa carta');
  return from.removeAt(i);
}

List<int> idsOf(dynamic list) => [for (final x in (list as List)) x as int];
