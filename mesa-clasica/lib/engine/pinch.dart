import 'game.dart';

/// Faltas que el pinchado deja pasar para que los demás las canten.
enum FaultKind { tookDiscard, discardFits, badDown, badLayoff }

const faultLabels = {
  FaultKind.tookDiscard: 'Tomó del descarte y no la usó para bajarse',
  FaultKind.discardFits: 'Botó una carta que entraba en un juego de la mesa',
  FaultKind.badDown: 'Se bajó con un juego mal armado o sin el mínimo',
  FaultKind.badLayoff: 'Pegó una carta donde no entraba',
};

class Fault {
  final int seat;
  final FaultKind kind;
  final int turn;
  bool pinched = false;
  int? by;

  Fault(this.seat, this.kind, this.turn);

  Map<String, dynamic> toJson() => {'seat': seat, 'label': faultLabels[kind], 'pinched': pinched, 'by': by};
}

class PinchRules {
  final bool enabled;

  /// 0 = el castigado sale de la ronda; si no, puntos que suma.
  final int penalty;

  /// Castigar también al que pincha en falso.
  final bool punishFalse;

  const PinchRules({this.enabled = false, this.penalty = 0, this.punishFalse = true});

  Map<String, dynamic> toJson() => {'enabled': enabled, 'penalty': penalty, 'punishFalse': punishFalse};
}

/// Registro de faltas y resolución de pinchazos, compartido por los motores que lo usan.
mixin Pinchable on CardGame {
  PinchRules get pinchRules;

  /// Turnos completados en la ronda; una falta se puede pinchar hasta que termina el turno siguiente.
  int turnSerial = 0;
  List<Fault> faults = [];
  List<int> falsePinches = [];
  late List<bool> roundOut;

  void resetPinch() {
    turnSerial = 0;
    faults = [];
    falsePinches = [];
    roundOut = List.filled(seats.length, false);
  }

  /// Sin pinchado lanza [blocked]; con pinchado registra la falta en silencio.
  void fault(int seat, FaultKind kind, String blocked) {
    if (!pinchRules.enabled) throw GameError(blocked);
    faults.add(Fault(seat, kind, turnSerial));
  }

  bool inRound(int seat) => !seats[seat].eliminated && !roundOut[seat];

  Fault? openFaultFor(int pincher) {
    for (final f in faults.reversed) {
      if (!f.pinched && f.seat != pincher && f.turn >= turnSerial - 1 && inRound(f.seat)) return f;
    }
    return null;
  }

  /// Resuelve un pinchazo de [pincher]. Devuelve el castigado y si el pinchazo fue correcto.
  ({int victim, bool hit}) resolvePinch(int pincher) {
    if (!pinchRules.enabled) throw GameError('Esta mesa juega sin pinchado');
    if (!inRound(pincher)) throw GameError('Estás fuera de la ronda');
    final f = openFaultFor(pincher);
    if (f != null) {
      f.pinched = true;
      f.by = pincher;
      penalize(f.seat);
      return (victim: f.seat, hit: true);
    }
    falsePinches.add(pincher);
    if (pinchRules.punishFalse) penalize(pincher);
    return (victim: pincher, hit: false);
  }

  void penalize(int seat) {
    if (pinchRules.penalty == 0) {
      roundOut[seat] = true;
      onRoundOut(seat);
    } else {
      seats[seat].score += pinchRules.penalty;
    }
  }

  /// El motor ajusta turnos o termina la ronda cuando alguien queda fuera.
  void onRoundOut(int seat);

  String pinchHeadline(String pincher, String victim, bool hit) {
    final castigo = pinchRules.penalty == 0 ? 'sale de la ronda' : '+${pinchRules.penalty}';
    if (hit) return '¡$pincher pinchó a $victim! $victim $castigo';
    return pinchRules.punishFalse ? 'Pinchazo en falso de $pincher: $castigo' : 'Pinchazo en falso de $pincher';
  }

  Map<String, dynamic> pinchResultJson() => {
    'faults': [for (final f in faults) f.toJson()],
    'falsePinches': falsePinches,
  };
}
