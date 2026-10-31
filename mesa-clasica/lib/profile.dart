import 'dart:math';

/// Fichas iniciales y reglas de recarga (fichas virtuales, sin valor real).
const startingChips = 1000000;
const rechargeBelow = 50000;
const rechargeRatingCost = 100;
const startingRating = 1000;

/// Perfil del jugador guardado en su teléfono. El identificador es único por teléfono
/// (la IP cambia en cada red, por eso no se usa).
class Profile {
  String deviceId;
  String name;
  int rating;
  int chips;
  int recharges;
  int games;
  int wins;
  int rounds;
  int roundWins;
  int roundStreak;
  int bestRoundStreak;
  int gameStreak;
  int bestGameStreak;
  Map<String, int> trophies;

  Profile({
    required this.deviceId,
    required this.name,
    this.rating = startingRating,
    this.chips = startingChips,
    this.recharges = 0,
    this.games = 0,
    this.wins = 0,
    this.rounds = 0,
    this.roundWins = 0,
    this.roundStreak = 0,
    this.bestRoundStreak = 0,
    this.gameStreak = 0,
    this.bestGameStreak = 0,
    Map<String, int>? trophies,
  }) : trophies = trophies ?? {};

  factory Profile.fresh(String name) => Profile(deviceId: newDeviceId(), name: name);

  int get trophyCount => trophies.values.fold(0, (a, b) => a + b);
  String get level => levelFor(rating);
  int get winRate => games == 0 ? 0 : (wins * 100 / games).round();
  bool get canRecharge => chips < rechargeBelow;

  /// Recarga el saldo; cada recarga cuesta puntos de ranking y queda registrada.
  bool recharge() {
    if (!canRecharge) return false;
    chips = startingChips;
    recharges++;
    rating = max(0, rating - rechargeRatingCost);
    return true;
  }

  Map<String, dynamic> toJson() => {
    'deviceId': deviceId,
    'name': name,
    'rating': rating,
    'chips': chips,
    'recharges': recharges,
    'games': games,
    'wins': wins,
    'rounds': rounds,
    'roundWins': roundWins,
    'roundStreak': roundStreak,
    'bestRoundStreak': bestRoundStreak,
    'gameStreak': gameStreak,
    'bestGameStreak': bestGameStreak,
    'trophies': trophies,
  };

  /// Lo que ven los demás jugadores.
  Map<String, dynamic> publicJson() => {
    'deviceId': deviceId,
    'rating': rating,
    'level': level,
    'chips': chips,
    'recharges': recharges,
    'roundStreak': roundStreak,
    'gameStreak': gameStreak,
    'trophies': trophyCount,
    'wins': wins,
    'games': games,
  };

  static Profile fromJson(Map<String, dynamic> j, {String? fallbackName}) {
    int i(String k, int d) => (j[k] is int) ? j[k] as int : d;
    return Profile(
      deviceId: (j['deviceId'] as String?)?.trim().isNotEmpty == true ? j['deviceId'] as String : newDeviceId(),
      name: (j['name'] as String?) ?? fallbackName ?? 'Jugador',
      rating: i('rating', startingRating),
      chips: max(0, i('chips', startingChips)),
      recharges: i('recharges', 0),
      games: i('games', 0),
      wins: i('wins', 0),
      rounds: i('rounds', 0),
      roundWins: i('roundWins', 0),
      roundStreak: i('roundStreak', 0),
      bestRoundStreak: i('bestRoundStreak', 0),
      gameStreak: i('gameStreak', 0),
      bestGameStreak: i('bestGameStreak', 0),
      trophies: {
        for (final e in ((j['trophies'] as Map?) ?? const {}).entries)
          if (e.value is int) e.key as String: e.value as int,
      },
    );
  }
}

String newDeviceId() {
  final r = Random.secure();
  return List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

/// Niveles por puntaje de ranking.
String levelFor(int rating) {
  if (rating < 900) return 'Novato';
  if (rating < 1100) return 'Aficionado';
  if (rating < 1300) return 'Tahúr';
  if (rating < 1500) return 'Maestro';
  return 'Leyenda';
}

enum StreakKind { round, game }

class Trophy {
  final String id;
  final String name;
  final String emoji;
  final StreakKind kind;
  final int streak;

  const Trophy(this.id, this.name, this.emoji, this.kind, this.streak);

  String get description =>
      kind == StreakKind.round ? '$streak rondas ganadas seguidas' : '$streak partidas ganadas seguidas';
}

const trophies = [
  Trophy('bronce', 'Bronce', '🥉', StreakKind.round, 3),
  Trophy('plata', 'Plata', '🥈', StreakKind.round, 5),
  Trophy('oro', 'Oro', '🥇', StreakKind.round, 7),
  Trophy('diamante', 'Diamante', '💎', StreakKind.round, 10),
  Trophy('campeon', 'Campeón', '🏆', StreakKind.game, 2),
  Trophy('invicto', 'Invicto', '👑', StreakKind.game, 3),
  Trophy('leyenda', 'Leyenda de la mesa', '🌟', StreakKind.game, 5),
];

Trophy trophyById(String id) => trophies.firstWhere((t) => t.id == id);

/// Puntos ELO que gana [winner] (y pierde [loser]) en un enfrentamiento.
int eloGain(int winner, int loser, {int k = 32}) {
  final expected = 1 / (1 + pow(10, (loser - winner) / 400));
  return max(1, (k * (1 - expected)).round());
}
