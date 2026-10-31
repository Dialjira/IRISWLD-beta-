import 'package:flutter_test/flutter_test.dart';
import 'package:mesa_clasica/engine/pinch.dart';
import 'package:mesa_clasica/net/ledger.dart';
import 'package:mesa_clasica/profile.dart';

List<Profile> people(int n) => List.generate(n, (i) => Profile(deviceId: 'd$i', name: 'J$i'));

void main() {
  test('perfil nuevo: 1.000.000 de fichas y ranking 1000', () {
    final p = Profile.fresh('Ana');
    expect(p.chips, 1000000);
    expect(p.rating, 1000);
    expect(p.deviceId, hasLength(32));
    final back = Profile.fromJson(p.toJson());
    expect(back.deviceId, p.deviceId);
  });

  test('recarga solo con saldo bajo, cuenta recargas y cuesta ranking', () {
    final p = Profile.fresh('Ana');
    expect(p.recharge(), isFalse);
    p.chips = 20000;
    expect(p.recharge(), isTrue);
    expect(p.chips, 1000000);
    expect(p.recharges, 1);
    expect(p.rating, 900);
  });

  test('apuesta por ronda: cada perdedor paga al ganador, sin pasar de su saldo', () {
    final ps = people(3);
    ps[2].chips = 4000;
    final l = SessionLedger(ps, const BetRules(BetMode.round, 10000))..startGame();
    l.settleRound(winner: 0, points: [0, 30, 40], penaltyScoring: true, participants: [0, 1, 2]);
    expect(ps[0].chips, 1000000 + 10000 + 4000);
    expect(ps[1].chips, 990000);
    expect(ps[2].chips, 0);
    expect(l.roundChips, [14000, -10000, -4000]);
  });

  test('apuesta por punto con puntaje de castigo', () {
    final ps = people(2);
    final l = SessionLedger(ps, const BetRules(BetMode.point, 500))..startGame();
    l.settleRound(winner: 1, points: [22, 0], penaltyScoring: true, participants: [0, 1]);
    expect(ps[0].chips, 1000000 - 11000);
    expect(ps[1].chips, 1000000 + 11000);
  });

  test('bolsa por partida: el ganador se lleva todo', () {
    final ps = people(3);
    final l = SessionLedger(ps, const BetRules(BetMode.pot, 100000))..startGame();
    expect(l.pot, 300000);
    l.settleGame(winner: 2, participants: [0, 1, 2]);
    expect(ps[2].chips, 1000000 + 200000);
    expect(ps[0].chips, 900000);
  });

  test('pinchado en fichas: con destinatario o repartido', () {
    final ps = people(3);
    final l = SessionLedger(ps, const BetRules())..startRound();
    l.applyMoves([ChipMove(0, 2, 50000, 'Pinchado'), ChipMove(1, null, 10000, 'auto')], [0, 1, 2]);
    expect(ps[0].chips, 950000 + 5000);
    expect(ps[2].chips, 1050000 + 5000);
    expect(ps[1].chips, 990000);
  });

  test('ranking ELO y trofeos por rachas', () {
    final ps = people(2);
    final l = SessionLedger(ps, const BetRules());
    for (var r = 0; r < 3; r++) {
      l.startRound();
      l.settleRound(winner: 0, points: [0, 10], penaltyScoring: true, participants: [0, 1]);
    }
    expect(ps[0].roundStreak, 3);
    expect(ps[0].trophies['bronce'], 1);
    expect(l.newTrophies.single.id, 'bronce');
    l.settleGame(winner: 0, participants: [0, 1]);
    expect(ps[0].rating, 1016);
    expect(ps[1].rating, 984);
    expect(ps[0].wins, 1);
    l.settleGame(winner: 0, participants: [0, 1]);
    expect(ps[0].trophies['campeon'], 1);
    expect(ps[1].gameStreak, 0);
  });
}
