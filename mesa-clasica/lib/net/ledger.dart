import 'dart:math';

import '../engine/pinch.dart';
import '../profile.dart';

enum BetMode { none, round, point, pot }

/// Apuesta pactada en la sala (fichas virtuales).
class BetRules {
  final BetMode mode;
  final int amount;

  const BetRules([this.mode = BetMode.none, this.amount = 0]);

  static const roundAmounts = [10000, 50000, 100000];
  static const pointAmounts = [100, 500, 1000];
  static const potAmounts = [50000, 100000, 500000];

  static BetRules fromJson(Map<String, dynamic>? j) {
    if (j == null) return const BetRules();
    final mode = BetMode.values.where((m) => m.name == j['mode']).firstOrNull ?? BetMode.none;
    final allowed = switch (mode) {
      BetMode.none => const [0],
      BetMode.round => roundAmounts,
      BetMode.point => pointAmounts,
      BetMode.pot => potAmounts,
    };
    final amount = j['amount'] is int && allowed.contains(j['amount']) ? j['amount'] as int : allowed.first;
    return BetRules(mode, amount);
  }

  Map<String, dynamic> toJson() => {'mode': mode.name, 'amount': amount};

  String get label => switch (mode) {
    BetMode.none => 'Sin apuesta',
    BetMode.round => '${formatChips(amount)} por ronda',
    BetMode.point => '${formatChips(amount)} por punto',
    BetMode.pot => 'Bolsa de ${formatChips(amount)} por partida',
  };
}

/// Fichas, estadísticas, ranking y trofeos de los jugadores durante la sesión.
/// El servidor es la autoridad; cada teléfono guarda su propio perfil con lo que recibe.
class SessionLedger {
  final List<Profile> profiles;
  BetRules bet;
  int pot = 0;

  /// Movimiento de fichas por asiento desde el inicio de la ronda.
  late List<int> roundChips;

  /// Cambio de ranking por asiento en la última partida terminada.
  late List<int> ratingDelta;

  /// Trofeos ganados en el último cierre (asiento, id).
  List<({int seat, String id})> newTrophies = [];

  SessionLedger(this.profiles, this.bet) {
    roundChips = List.filled(profiles.length, 0);
    ratingDelta = List.filled(profiles.length, 0);
  }

  int _pay(int from, int to, int amount) {
    final paid = min(amount, profiles[from].chips);
    profiles[from].chips -= paid;
    profiles[to].chips += paid;
    roundChips[from] -= paid;
    roundChips[to] += paid;
    return paid;
  }

  void startRound() {
    roundChips = List.filled(profiles.length, 0);
    newTrophies = [];
  }

  /// Al empezar la partida: con bolsa, cada uno pone su parte.
  void startGame() {
    startRound();
    ratingDelta = List.filled(profiles.length, 0);
    pot = 0;
    if (bet.mode != BetMode.pot) return;
    for (var i = 0; i < profiles.length; i++) {
      final paid = min(bet.amount, profiles[i].chips);
      profiles[i].chips -= paid;
      roundChips[i] -= paid;
      pot += paid;
    }
  }

  /// Fichas del pinchado. Sin destinatario se reparten entre los demás participantes.
  void applyMoves(List<ChipMove> moves, List<int> participants) {
    for (final m in moves) {
      if (m.to != null) {
        _pay(m.from, m.to!, m.amount);
        continue;
      }
      final others = participants.where((p) => p != m.from).toList();
      if (others.isEmpty) continue;
      final share = m.amount ~/ others.length;
      for (final o in others) {
        _pay(m.from, o, share);
      }
    }
  }

  /// Cierre de una ronda: apuesta, estadísticas y rachas.
  void settleRound({
    required int? winner,
    required List<int> points,
    required bool penaltyScoring,
    required List<int> participants,
  }) {
    final losers = participants.where((p) => p != winner).toList();
    if (winner != null) {
      switch (bet.mode) {
        case BetMode.none || BetMode.pot:
          break;
        case BetMode.round:
          for (final l in losers) {
            _pay(l, winner, bet.amount);
          }
        case BetMode.point:
          if (penaltyScoring) {
            for (final l in losers) {
              _pay(l, winner, bet.amount * max(0, points[l]));
            }
          } else if (losers.isNotEmpty) {
            final share = (max(0, points[winner]) / losers.length).ceil();
            for (final l in losers) {
              _pay(l, winner, bet.amount * share);
            }
          }
      }
    }
    for (final p in participants) {
      final prof = profiles[p];
      prof.rounds++;
      if (p == winner) {
        prof.roundWins++;
        prof.roundStreak++;
        prof.bestRoundStreak = max(prof.bestRoundStreak, prof.roundStreak);
        _award(p, StreakKind.round, prof.roundStreak);
      } else {
        prof.roundStreak = 0;
      }
    }
  }

  /// Cierre de la partida: bolsa, ranking (ELO contra cada rival) y rachas de partidas.
  void settleGame({required int? winner, required List<int> participants}) {
    ratingDelta = List.filled(profiles.length, 0);
    if (winner != null && pot > 0) {
      profiles[winner].chips += pot;
      roundChips[winner] += pot;
      pot = 0;
    }
    if (winner != null) {
      for (final l in participants.where((p) => p != winner)) {
        final g = eloGain(profiles[winner].rating, profiles[l].rating);
        ratingDelta[winner] += g;
        ratingDelta[l] -= g;
      }
    }
    for (final p in participants) {
      final prof = profiles[p];
      prof.rating = max(0, prof.rating + ratingDelta[p]);
      prof.games++;
      if (p == winner) {
        prof.wins++;
        prof.gameStreak++;
        prof.bestGameStreak = max(prof.bestGameStreak, prof.gameStreak);
        _award(p, StreakKind.game, prof.gameStreak);
      } else {
        prof.gameStreak = 0;
      }
    }
  }

  void _award(int seat, StreakKind kind, int streak) {
    for (final t in trophies) {
      if (t.kind == kind && t.streak == streak) {
        profiles[seat].trophies[t.id] = (profiles[seat].trophies[t.id] ?? 0) + 1;
        newTrophies.add((seat: seat, id: t.id));
      }
    }
  }

  Map<String, dynamic> toJson() => {
    'bet': bet.toJson(),
    'pot': pot,
    'chips': roundChips,
    'rating': ratingDelta,
    'trophies': [
      for (final t in newTrophies) {'seat': t.seat, 'id': t.id},
    ],
  };
}
