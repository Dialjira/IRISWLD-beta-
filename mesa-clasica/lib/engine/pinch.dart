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

  /// Quién pinchó; -1 = pinchado automático.
  int? by;

  Fault(this.seat, this.kind, this.turn);

  Map<String, dynamic> toJson() => {'seat': seat, 'label': faultLabels[kind], 'pinched': pinched, 'by': by};
}

enum PinchMode { off, manual, auto }

/// Castigo para quien pincha en falso ignorando la advertencia.
enum FalsePinch { none, roundOut, gameOut, chips }

class PinchRules {
  final PinchMode mode;

  /// Castigo al pinchado: 0 = sale de la ronda; menos de 1000 = puntos que suma;
  /// 1000 o más = fichas que paga a quien lo pinchó.
  final int penalty;
  final FalsePinch falsePinch;
  final int falseChips;

  /// Plazo para pinchar: 1 = hasta que termina el turno siguiente; 2 = hasta que termina el
  /// siguiente turno del que falló; 3 = toda la ronda.
  final int window;

  /// Avisar en privado a quien va a cometer una falta (puede corregir o arriesgarse).
  final bool warnSelf;

  const PinchRules({
    this.mode = PinchMode.off,
    this.penalty = 0,
    this.falsePinch = FalsePinch.gameOut,
    this.falseChips = 50000,
    this.window = 2,
    this.warnSelf = true,
  });

  bool get enabled => mode != PinchMode.off;
  bool get manual => mode == PinchMode.manual;
  bool get auto => mode == PinchMode.auto;

  String get penaltyText => penalty == 0
      ? 'sale de la ronda'
      : penalty < 1000
      ? 'suma +$penalty'
      : 'paga ${formatChips(penalty)} fichas';

  Map<String, dynamic> toJson() => {
    'enabled': enabled,
    'mode': mode.name,
    'penalty': penalty,
    'false': falsePinch.name,
    'falseChips': falseChips,
    'window': window,
    'warnSelf': warnSelf,
  };
}

String formatChips(int n) {
  final s = n.abs().toString();
  final b = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write('.');
    b.write(s[i]);
  }
  return b.toString();
}

/// Pinchazo sin motivo: el cliente debe confirmar (`force`) para hacerlo igual.
class PinchWarning extends GameError {
  PinchWarning(super.message);
}

/// Aviso privado: la jugada es una falta. El cliente puede reenviarla con `risk` para hacerla igual.
class FaultWarning extends GameError {
  FaultWarning(super.message);
}

/// Movimiento de fichas que el servidor aplica a los saldos. [to] null = se reparte entre los demás.
class ChipMove {
  final int from;
  final int? to;
  final int amount;
  final String reason;
  ChipMove(this.from, this.to, this.amount, this.reason);
}

/// Registro de faltas y resolución de pinchazos, compartido por los motores que lo usan.
mixin Pinchable on CardGame {
  PinchRules get pinchRules;
  String get event;
  set event(String value);

  /// Turnos completados en la ronda; una falta se puede pinchar hasta que termina el turno siguiente.
  int turnSerial = 0;
  List<Fault> faults = [];
  List<int> falsePinches = [];
  late List<bool> roundOut;
  final List<Fault> _autoQueue = [];

  /// La acción en curso viene con `risk`: el jugador aceptó cometer la falta.
  bool riskAccepted = false;

  /// Fichas por mover; el servidor las retira con [takeChipMoves].
  final List<ChipMove> _chipMoves = [];

  List<ChipMove> takeChipMoves() {
    final out = [..._chipMoves];
    _chipMoves.clear();
    return out;
  }

  void resetPinch() {
    turnSerial = 0;
    faults = [];
    falsePinches = [];
    _autoQueue.clear();
    roundOut = List.filled(seats.length, false);
  }

  /// Sin pinchado lanza [blocked]; con pinchado registra la falta en silencio
  /// (en modo automático se castiga al terminar la acción).
  void fault(int seat, FaultKind kind, String blocked) {
    if (!pinchRules.enabled) throw GameError(blocked);
    if (pinchRules.warnSelf && !riskAccepted) {
      throw FaultWarning(
        pinchRules.auto
            ? '$blocked. Si sigues, la app te castigará: ${pinchRules.penaltyText}.'
            : '$blocked. Si sigues, te pueden pinchar (${pinchRules.penaltyText}).',
      );
    }
    final f = Fault(seat, kind, turnSerial);
    faults.add(f);
    if (pinchRules.auto) _autoQueue.add(f);
  }

  /// Aplica los castigos del pinchado automático pendientes.
  void flushAuto() {
    while (_autoQueue.isNotEmpty) {
      final f = _autoQueue.removeAt(0);
      if (!inRound(f.seat) || phase == Phase.roundOver || phase == Phase.gameOver) continue;
      f.pinched = true;
      f.by = -1;
      event = '¡Pinchado automático! ${seats[f.seat].name}: ${faultLabels[f.kind]} · ${pinchRules.penaltyText}';
      fx('pinch', f.seat);
      penalizeFault(f.seat, null);
    }
  }

  bool inRound(int seat) => !seats[seat].eliminated && !roundOut[seat];

  /// ¿Se puede pinchar todavía la falta [f]?
  bool isOpen(Fault f) {
    if (f.pinched || !inRound(f.seat)) return false;
    final elapsed = turnSerial - f.turn;
    return switch (pinchRules.window) {
      1 => elapsed <= 1,
      2 =>
        elapsed <=
            [
              for (var i = 0; i < seats.length; i++)
                if (inRound(i)) i,
            ].length,
      _ => true,
    };
  }

  Fault? openFaultFor(int pincher) {
    for (final f in faults.reversed) {
      if (f.seat != pincher && isOpen(f)) return f;
    }
    return null;
  }

  String get falseWarning => switch (pinchRules.falsePinch) {
    FalsePinch.none => 'No hay ningún motivo para pinchar. Pinchar igual no tiene castigo.',
    FalsePinch.roundOut => 'No hay ningún motivo para pinchar. Si pinchas igual, saldrás de la ronda.',
    FalsePinch.gameOut => 'No hay ningún motivo para pinchar. Si pinchas igual, saldrás de la partida.',
    FalsePinch.chips =>
      'No hay ningún motivo para pinchar. Si pinchas igual, pagarás ${formatChips(pinchRules.falseChips)} fichas.',
  };

  /// Resuelve un pinchazo de [pincher]. Sin falta abierta y sin [force] lanza [PinchWarning].
  ({int victim, bool hit}) resolvePinch(int pincher, {bool force = false}) {
    if (!pinchRules.enabled) throw GameError('Esta mesa juega sin pinchado');
    if (pinchRules.auto) throw GameError('En esta mesa el pinchado es automático');
    if (!inRound(pincher)) throw GameError('Estás fuera de la ronda');
    final f = openFaultFor(pincher);
    if (f != null) {
      f.pinched = true;
      f.by = pincher;
      penalizeFault(f.seat, pincher);
      return (victim: f.seat, hit: true);
    }
    if (faults.any((f) => f.seat == pincher && isOpen(f)) &&
        !faults.any((f) => f.seat != pincher && !f.pinched && inRound(f.seat))) {
      throw GameError('La falta que ves es tuya: no te puedes pinchar a ti mismo');
    }
    if (!force) {
      final expired = faults.lastWhere(
        (f) => f.seat != pincher && !f.pinched && inRound(f.seat),
        orElse: () => Fault(-1, FaultKind.badDown, 0),
      );
      if (expired.seat >= 0) {
        throw PinchWarning(
          'La falta de ${seats[expired.seat].name} ya no se puede pinchar: el plazo terminó. '
          '${falseWarning.substring(falseWarning.indexOf('.') + 2)}',
        );
      }
      throw PinchWarning(falseWarning);
    }
    falsePinches.add(pincher);
    punishFalse(pincher);
    return (victim: pincher, hit: false);
  }

  /// Castigo a quien cometió la falta. [pincher] null = pinchado automático.
  void penalizeFault(int seat, int? pincher) {
    final p = pinchRules.penalty;
    if (p == 0) {
      roundOut[seat] = true;
      onRoundOut(seat);
    } else if (p < 1000) {
      seats[seat].score += p;
    } else {
      _chipMoves.add(ChipMove(seat, pincher, p, 'Pinchado'));
    }
  }

  /// Castigo por pinchar en falso. [accused] recibe las fichas si las hay (si no, se reparten).
  void punishFalse(int pincher, {int? accused}) {
    switch (pinchRules.falsePinch) {
      case FalsePinch.none:
        return;
      case FalsePinch.chips:
        _chipMoves.add(ChipMove(pincher, accused, pinchRules.falseChips, 'Pinchazo en falso'));
      case FalsePinch.gameOut:
        seats[pincher].eliminated = true;
        roundOut[pincher] = true;
        onRoundOut(pincher);
      case FalsePinch.roundOut:
        roundOut[pincher] = true;
        onRoundOut(pincher);
    }
  }

  /// El motor ajusta turnos o termina la ronda cuando alguien queda fuera.
  void onRoundOut(int seat);

  String pinchHeadline(String pincher, String victim, bool hit) {
    if (hit) return '¡$pincher pinchó a $victim! $victim ${pinchRules.penaltyText}';
    final castigo = switch (pinchRules.falsePinch) {
      FalsePinch.none => '',
      FalsePinch.roundOut => ': sale de la ronda',
      FalsePinch.gameOut => ': sale de la partida',
      FalsePinch.chips => ': paga ${formatChips(pinchRules.falseChips)} fichas',
    };
    return 'Pinchazo en falso de $pincher$castigo';
  }

  Map<String, dynamic> pinchResultJson() => {
    'faults': [for (final f in faults) f.toJson()],
    'falsePinches': falsePinches,
  };
}
