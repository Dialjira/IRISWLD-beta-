import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../engine/arrangement.dart';
import '../engine/cards.dart';
import '../engine/melds.dart';
import '../engine/variants.dart';
import '../net/client.dart';
import 'card_view.dart';
import 'rules_screen.dart';
import 'sfx.dart';
import 'table_widgets.dart';
import 'theme.dart';

enum _Sort { manual, suit, rank, melds }

/// Mesa de juego. Funciona para los dos motores (bajar a la mesa y cerrar desde la mano).
class TableScreen extends StatefulWidget {
  final GameClient client;
  final bool isHost;
  final VoidCallback onLeave;
  const TableScreen({super.key, required this.client, required this.isHost, required this.onLeave});

  @override
  State<TableScreen> createState() => _TableScreenState();
}

class _TableScreenState extends State<TableScreen> {
  List<int> _order = [];
  final Set<int> _selected = {};
  List<List<int>> _staged = [];
  _Sort _sort = _Sort.suit;
  final Map<int, String> _emotes = {};
  final Map<int, Timer> _emoteTimers = {};
  StreamSubscription<Emote>? _emoteSub;
  int? _lastCurrent;
  int? _lastRound;
  int? _lastFx;
  List<PlayingCard> _lastDiscard = [];

  // Animaciones
  final _rootKey = GlobalKey();
  final _stockKey = GlobalKey();
  final _discardKey = GlobalKey();
  final _handKey = GlobalKey();
  final Map<int, GlobalKey> _badgeKeys = {};
  final List<_Flight> _flights = [];
  int _flightSeq = 0;
  ({String text, Color color, int seq})? _stamp;
  ({String text, int seq})? _banner;

  // Revisión de bajada (Póker con pinchado)
  DateTime? _reviewEnds;
  Timer? _ticker;

  // Mano completa (Póker): cálculo en caché
  String? _arrKey;
  Arrangement? _arrCache;
  String? _completeAnnounced;

  GameClient get client => widget.client;
  Map<String, dynamic> get view => client.view!;
  int get me => view['me'] as int;
  bool get isTable => view['game'] == 'table';
  bool get isPoker => view['game'] == 'poker';
  bool get pinchOn => ((rulesInfo['pinch'] as Map?)?['enabled']) == true;
  bool get inRound => players[me]['out'] != true && players[me]['eliminated'] != true;
  GlobalKey _badgeKey(int seat) => _badgeKeys.putIfAbsent(seat, GlobalKey.new);
  String get phase => view['phase'] as String;
  bool get myTurn => view['current'] == me && (phase == 'draw' || phase == 'play');
  List<Map<String, dynamic>> get players => [
    for (final p in view['players'] as List) (p as Map).cast<String, dynamic>(),
  ];
  Map<String, dynamic> get rulesInfo => (view['rules'] as Map).cast<String, dynamic>();
  Map<String, int> get options => ((client.lobby?['options'] as Map?) ?? {}).cast<String, int>();
  MeldRules get meldRules => meldRulesFor(view['variant'] as String, options);
  Variant get variant => variantById(view['variant'] as String);

  Map<int, PlayingCard> get _handById => {for (final c in cardsOf(view['hand'])) c.id: c};
  List<PlayingCard> get hand {
    final byId = _handById;
    return [for (final id in _order) ?byId[id]];
  }

  List<PlayingCard> get selectedCards => [
    for (final c in hand)
      if (_selected.contains(c.id)) c,
  ];

  @override
  void initState() {
    super.initState();
    client.addListener(_sync);
    _emoteSub = client.emotes.listen(_showEmote);
    _sync();
  }

  @override
  void didUpdateWidget(covariant TableScreen old) {
    super.didUpdateWidget(old);
    if (old.client != widget.client) {
      old.client.removeListener(_sync);
      _emoteSub?.cancel();
      widget.client.addListener(_sync);
      _emoteSub = widget.client.emotes.listen(_showEmote);
      _lastRound = null;
      _sync();
    }
  }

  @override
  void dispose() {
    client.removeListener(_sync);
    _emoteSub?.cancel();
    for (final t in _emoteTimers.values) {
      t.cancel();
    }
    _ticker?.cancel();
    super.dispose();
  }

  void _showEmote(Emote e) {
    _emoteTimers[e.seat]?.cancel();
    setState(() => _emotes[e.seat] = e.text);
    _emoteTimers[e.seat] = Timer(const Duration(milliseconds: 2600), () {
      if (mounted) setState(() => _emotes.remove(e.seat));
    });
  }

  void _sync() {
    if (client.view == null) return;
    final ids = _handById.keys.toSet();
    final round = view['round'] as int;
    if (round != _lastRound) {
      _order = [];
      _selected.clear();
      _staged = [];
    }
    _order = [
      for (final id in _order)
        if (ids.contains(id)) id,
      for (final id in ids)
        if (!_order.contains(id)) id,
    ];
    _selected.removeWhere((id) => !ids.contains(id));
    _staged = [
      for (final g in _staged)
        if (g.every(ids.contains)) g,
    ];
    if (_sort != _Sort.manual) _applySort();

    final current = view['current'] as int;
    final fx = (view['fx'] as Map?)?.cast<String, dynamic>();
    final seq = fx?['seq'] as int?;
    if (seq != null && seq != _lastFx) {
      // Al conectarse a una partida empezada solo se anima el reparto.
      if (_lastFx != null || fx!['kind'] == 'deal') _onFx(fx!);
      _lastFx = seq;
    }
    if (current == me && _lastCurrent != me && phase == 'draw') {
      Sfx.play('turn');
      Sfx.medium();
      _showBanner('¡Tu turno!');
    }
    _syncReview();
    _announceComplete();
    _lastCurrent = current;
    _lastRound = round;
    _lastDiscard = cardsOf(view['discard']);
    if (mounted) setState(() {});
  }

  // ---------- Sonido, vibración y animación ----------

  void _onFx(Map<String, dynamic> fx) {
    final kind = fx['kind'] as String;
    final seat = fx['seat'] as int;
    final mine = seat == me;
    final name = seat >= 0 && seat < players.length ? players[seat]['name'] as String : '';
    GlobalKey place(int s) => s == me ? _handKey : _badgeKey(s);
    switch (kind) {
      case 'deal':
        Sfx.play('shuffle');
        _dealAnimation();
      case 'draw':
        Sfx.play('draw');
        _fly(null, _stockKey, place(seat));
      case 'drawDiscard':
        Sfx.play('draw');
        _fly(_lastDiscard.isEmpty ? null : _lastDiscard.last, _discardKey, place(seat));
      case 'discard':
        Sfx.play('discard');
        final d = cardsOf(view['discard']);
        _fly(d.isEmpty ? null : d.last, place(seat), _discardKey);
      case 'meld' || 'layoff' || 'swap' || 'buy':
        Sfx.play('meld');
        if (mine) Sfx.light();
      case 'goDown':
        Sfx.play('goDown');
        Sfx.medium();
        _showBanner(mine ? '¡Te bajaste!' : '¡$name se bajó!');
      case 'pinch':
        Sfx.play('pinch');
        _showStamp('¡PINCHADO!', Palette.red);
        mine ? Sfx.pattern(3) : Sfx.heavy();
      case 'falsePinch':
        Sfx.play('falsePinch');
        _showStamp('¡Pinchazo en falso!', const Color(0xFFE08A1E));
        if (mine) Sfx.pattern(2);
      case 'roundOver' || 'gameOver':
        final won = kind == 'gameOver' ? view['winner'] == me : seat == me;
        Sfx.play(won ? 'win' : 'knock');
        won ? Sfx.pattern(2) : Sfx.heavy();
    }
  }

  Offset? _centerOf(GlobalKey k) {
    final box = k.currentContext?.findRenderObject() as RenderBox?;
    final root = _rootKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || root == null || !box.attached) return null;
    return box.localToGlobal(box.size.center(Offset.zero), ancestor: root);
  }

  void _fly(PlayingCard? card, GlobalKey from, GlobalKey to, {Duration delay = Duration.zero}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final a = _centerOf(from), b = _centerOf(to);
      if (a == null || b == null || !mounted) return;
      final f = _Flight(_flightSeq++, card, a, b, delay);
      setState(() => _flights.add(f));
      Timer(delay + _Flight.duration + const Duration(milliseconds: 50), () {
        if (mounted) setState(() => _flights.remove(f));
      });
    });
  }

  void _dealAnimation() {
    final seats = [
      for (var k = 1; k <= players.length; k++)
        if (players[(me + k) % players.length]['eliminated'] != true) (me + k) % players.length,
    ];
    var n = 0;
    for (var r = 0; r < 4; r++) {
      for (final s in seats) {
        final d = Duration(milliseconds: 90 * n++);
        _fly(null, _stockKey, s == me ? _handKey : _badgeKey(s), delay: d);
        Timer(d, () => Sfx.play('deal'));
      }
    }
  }

  void _showStamp(String text, Color color) {
    final seq = (_stamp?.seq ?? 0) + 1;
    setState(() => _stamp = (text: text, color: color, seq: seq));
    Timer(const Duration(milliseconds: 1800), () {
      if (mounted && _stamp?.seq == seq) setState(() => _stamp = null);
    });
  }

  void _showBanner(String text) {
    final seq = (_banner?.seq ?? 0) + 1;
    _banner = (text: text, seq: seq);
    Timer(const Duration(milliseconds: 1500), () {
      if (mounted && _banner?.seq == seq) setState(() => _banner = null);
    });
  }

  void _syncReview() {
    final ms = view['reviewMs'] as int?;
    if (phase == 'review' && ms != null) {
      _reviewEnds ??= DateTime.now().add(Duration(milliseconds: ms));
      _ticker ??= Timer.periodic(const Duration(milliseconds: 200), (_) {
        if (mounted) setState(() {});
      });
    } else {
      _reviewEnds = null;
      _ticker?.cancel();
      _ticker = null;
    }
  }

  /// Póker sin pinchado: avisa una vez por turno cuando la mano ya se puede bajar.
  void _announceComplete() {
    if (!isPoker || pinchOn || !myTurn || phase != 'play') return;
    final key = '${view['round']}-${_handById.keys.join(',')}';
    if (_completeAnnounced == key) return;
    if (_pokerArrangement()?.complete == true) {
      _completeAnnounced = key;
      Sfx.play('meld');
      Sfx.pattern(2);
      _showBanner('¡Mano completa!');
    }
  }

  /// Agrupación de la mano en el Póker: juegos, puntos y si está completa.
  ({Arrangement arr, int points, bool complete})? _pokerArrangement() {
    final cards = hand;
    if (cards.isEmpty || cards.length > 15) return null;
    final key = (cards.map((c) => c.id).toList()..sort()).join(',');
    if (key != _arrKey) {
      _arrKey = key;
      _arrCache = bestArrangement(cards, meldRules, (c) => 1 + pokerValue(c));
    }
    final arr = _arrCache!;
    var pts = 0;
    for (final m in arr.melds) {
      for (var i = 0; i < m.cards.length; i++) {
        pts += pokerValue(m.cards[i], rank: m.ranks[i]);
      }
    }
    final min = rulesInfo['minDown'] as int? ?? 51;
    return (arr: arr, points: pts, complete: arr.deadwood.isEmpty && cards.length == 15 && pts >= min);
  }

  int _rankKey(PlayingCard c) => c.isJoker ? 99 : c.rank;

  void _applySort() {
    final byId = _handById;
    final cards = [for (final id in _order) ?byId[id]];
    switch (_sort) {
      case _Sort.manual:
        return;
      case _Sort.suit:
        cards.sort((a, b) {
          final s = (a.suit?.index ?? 99) - (b.suit?.index ?? 99);
          return s != 0 ? s : _rankKey(a) - _rankKey(b);
        });
      case _Sort.rank:
        cards.sort((a, b) {
          final r = _rankKey(a) - _rankKey(b);
          return r != 0 ? r : (a.suit?.index ?? 99) - (b.suit?.index ?? 99);
        });
      case _Sort.melds:
        if (cards.length > 15) {
          _sort = _Sort.suit;
          return _applySort();
        }
        final arr = bestArrangement(cards, meldRules, _deadValue);
        final dead = [...arr.deadwood]..sort((a, b) => _rankKey(a) - _rankKey(b));
        cards
          ..clear()
          ..addAll([for (final m in arr.melds) ...m.cards, ...dead]);
    }
    _order = [for (final c in cards) c.id];
  }

  int _deadValue(PlayingCard c) => isPoker
      ? 1 + pokerValue(c)
      : isTable
      ? (c.isJoker ? 0 : min(c.rank, 10))
      : knockValueFor(view['variant'] as String)(c);

  void _setSort(_Sort s) {
    setState(() {
      _sort = s;
      _applySort();
    });
  }

  void _act(Map<String, dynamic> a) {
    Sfx.light();
    client.action(a);
  }

  void _pinch() {
    Sfx.heavy();
    client.action({'type': 'pinch'});
  }

  void _goDown() {
    if (!pinchOn) {
      final p = _pokerArrangement();
      if (p == null || !p.complete) return toast(context, 'Tu mano todavía no está completa');
      _act({
        'type': 'goDown',
        'groups': [
          for (final m in p.arr.melds) [for (final c in m.cards) c.id],
        ],
      });
      return;
    }
    final groups = [..._staged];
    final staged = groups.expand((g) => g).toSet();
    final rest = [
      for (final c in hand)
        if (!staged.contains(c.id)) c.id,
    ];
    if (rest.isNotEmpty) {
      final sel = rest.where(_selected.contains).toList();
      if (sel.length != rest.length) return toast(context, 'Agrupa todas tus cartas antes de bajarte');
      groups.add(sel);
    }
    _act({'type': 'goDown', 'groups': groups});
  }

  void _toggle(PlayingCard c) {
    Sfx.tap();
    setState(() => _selected.contains(c.id) ? _selected.remove(c.id) : _selected.add(c.id));
  }

  // ---------- Acciones ----------

  bool get canDraw => myTurn && phase == 'draw';
  bool get canPlay => myTurn && phase == 'play';

  void _tapStock() {
    if (canDraw) _act({'type': 'drawStock'});
  }

  /// [index] es la posición dentro del descarte visible.
  Future<void> _tapDiscard(int index) async {
    final shown = (view['discard'] as List).length;
    if (canDraw) {
      if (index != shown - 1) {
        final n = shown - index;
        final ok = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            backgroundColor: const Color(0xFF0E2D21),
            title: Text('Tomar $n cartas', style: display(22)),
            content: Text('La carta más honda debes usarla en un juego en este turno.', style: body(15)),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: Text('Cancelar', style: body(15, color: Palette.gold)),
              ),
              TextButton(
                onPressed: () => Navigator.pop(c, true),
                child: Text('Tomar', style: body(15, color: Palette.gold, weight: 800)),
              ),
            ],
          ),
        );
        if (ok != true) return;
      }
      final offset = (view['discardTotal'] as int) - shown;
      _act({'type': 'drawDiscard', 'index': offset + index});
      return;
    }
    if (canPlay && _selected.length == 1) _discard();
  }

  void _discard() {
    if (_selected.length != 1) return toast(context, 'Selecciona una carta para descartar');
    _act({'type': 'discard', 'card': _selected.single});
  }

  void _knock() {
    if (_selected.length != 1) return toast(context, 'Selecciona la carta que vas a descartar al cerrar');
    _act({'type': 'knock', 'card': _selected.single});
  }

  void _stage() {
    final sel = selectedCards;
    if (sel.isEmpty) return;
    if (!pinchOn && analyzeMeld(sel, meldRules) == null) return toast(context, 'Ese grupo no es un juego válido');
    setState(() {
      _staged.add([for (final c in sel) c.id]);
      _selected.clear();
    });
  }

  void _meld() {
    final groups = [..._staged];
    final sel = selectedCards;
    if (sel.isNotEmpty) {
      if (!pinchOn && analyzeMeld(sel, meldRules) == null) {
        return toast(context, 'Lo seleccionado no es un juego válido');
      }
      groups.add([for (final c in sel) c.id]);
    }
    if (groups.isEmpty) return toast(context, 'Selecciona un trío o una escalera');
    _act({'type': 'meld', 'groups': groups});
  }

  bool _fits(List<PlayingCard> meld, MeldType type, List<PlayingCard> sel) =>
      sel.isNotEmpty && analyzeMeld([...meld, ...sel], meldRules, only: type) != null;

  bool _swaps(List<PlayingCard> meld, MeldType type, List<PlayingCard> sel) {
    if (rulesInfo['jokerSwap'] != true || sel.length != 1 || sel.single.isJoker) return false;
    for (final j in meld.where((c) => c.isJoker)) {
      final m = analyzeMeld(
        [
          for (final c in meld)
            if (c != j) c,
          sel.single,
        ],
        meldRules,
        only: type,
      );
      if (m != null && m.length == meld.length) return true;
    }
    return false;
  }

  Future<void> _tapMeld(int index, List<PlayingCard> meld, MeldType type) async {
    if (!canPlay) return;
    final sel = selectedCards;
    if (sel.isEmpty) return toast(context, 'Selecciona cartas de tu mano para añadir');
    if (pinchOn) {
      // Con pinchado la app no valida: la jugada se hace y los demás deciden si pinchar.
      _act({
        'type': 'layoff',
        'meld': index,
        'cards': [for (final c in sel) c.id],
      });
      return;
    }
    final fits = _fits(meld, type, sel);
    final swaps = _swaps(meld, type, sel);
    if (fits && swaps) {
      final choice = await showModalBottomSheet<String>(
        context: context,
        backgroundColor: const Color(0xFF0E2D21),
        builder: (c) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.add_circle_rounded, color: Palette.gold),
                title: Text('Añadir al juego', style: body(16, weight: 800)),
                onTap: () => Navigator.pop(c, 'layoff'),
              ),
              ListTile(
                leading: const Icon(Icons.swap_horiz_rounded, color: Palette.gold),
                title: Text('Cambiar por el comodín', style: body(16, weight: 800)),
                onTap: () => Navigator.pop(c, 'swap'),
              ),
            ],
          ),
        ),
      );
      if (choice == 'layoff') {
        _act({
          'type': 'layoff',
          'meld': index,
          'cards': [for (final c in sel) c.id],
        });
      }
      if (choice == 'swap') _act({'type': 'swapJoker', 'meld': index, 'card': sel.single.id});
    } else if (swaps) {
      _act({'type': 'swapJoker', 'meld': index, 'card': sel.single.id});
    } else if (fits) {
      _act({
        'type': 'layoff',
        'meld': index,
        'cards': [for (final c in sel) c.id],
      });
    } else {
      toast(context, 'Esas cartas no encajan en ese juego');
    }
  }

  /// Gin / Chinchón: ¿se puede cerrar descartando la carta seleccionada?
  bool get _canKnock {
    if (isTable || !canPlay || _selected.length != 1) return false;
    final rest = [
      for (final c in hand)
        if (c.id != _selected.single) c,
    ];
    final value = knockValueFor(view['variant'] as String);
    final arr = bestArrangement(rest, meldRules, value);
    final limit = rulesInfo['knockLimit'] as int;
    if (rulesInfo['style'] == 'gin') return arr.deadValue <= limit;
    return arr.deadwood.isEmpty || (arr.deadwood.length == 1 && (limit == 0 || value(arr.deadwood.single) <= limit));
  }

  String _statusText() {
    if (phase == 'review') return '';
    if (!inRound && phase != 'roundOver' && phase != 'gameOver') return 'Estás fuera de esta ronda';
    if (!myTurn) {
      if (phase == 'roundOver' || phase == 'gameOver') return '';
      return 'Turno de ${players[view['current'] as int]['name']}';
    }
    if (isPoker) {
      if (phase == 'draw') return pinchOn ? 'Tu turno · roba' : 'Tu turno · roba (el descarte solo si te bajas con él)';
      if (!pinchOn && view['lockedDiscard'] != null) return 'Tomaste el descarte: bájate';
      if (!pinchOn && _pokerArrangement()?.complete == true) return '¡Mano completa! Bájate';
      return pinchOn ? 'Bota una carta o bájate' : 'Bota una carta';
    }
    if (phase == 'draw') return 'Tu turno · roba del mazo o del descarte';
    if (!isTable) return 'Descarta una carta o cierra';
    if (view['mustUse'] != null) return 'Usa en un juego la carta más honda que tomaste';
    final melded = players[me]['melded'] == true;
    if (!melded && view['contract'] != null) return 'Contrato: ${view['contract']}';
    final min = rulesInfo['firstMeldMin'] as int? ?? 0;
    if (!melded && min > 0) return 'Primera bajada: mínimo $min puntos';
    return 'Baja, añade a la mesa o descarta';
  }

  // ---------- Construcción ----------

  @override
  Widget build(BuildContext context) {
    if (client.view == null) return const SizedBox.shrink();
    final showResult = phase == 'roundOver' || phase == 'gameOver';
    return Stack(
      key: _rootKey,
      children: [
        SafeArea(
          child: Column(
            children: [
              _topBar(),
              _opponents(),
              Expanded(
                child: isPoker
                    ? _pokerCenter()
                    : isTable
                    ? _tableMelds()
                    : _knockCenter(),
              ),
              _piles(),
              const SizedBox(height: 4),
              _eventLine(),
              _actions(),
              if (_staged.isNotEmpty) _stagedRow(),
              KeyedSubtree(key: _handKey, child: _handArea()),
              _bottomBar(),
            ],
          ),
        ),
        for (final f in _flights) _FlyingCard(key: ValueKey(f.id), flight: f),
        if (phase == 'review') Positioned.fill(child: _reviewOverlay()),
        if (_banner != null) _bannerView(),
        if (_stamp != null) Positioned.fill(child: _stampView()),
        if (showResult) Positioned.fill(child: _resultOverlay()),
      ],
    );
  }

  Widget _topBar() {
    final round = view['round'];
    final rounds = view['rounds'];
    final contract = view['contract'];
    final sub = rounds != null ? 'Ronda $round de $rounds · $contract' : 'Ronda $round · meta ${rulesInfo['target']}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 2, 4, 0),
      child: Row(
        children: [
          IconButton(
            onPressed: widget.onLeave,
            icon: const Icon(Icons.close_rounded, color: Palette.ivory),
          ),
          Expanded(
            child: Column(
              children: [
                Text(variant.name, style: display(19, color: Palette.gold)),
                Text(sub, style: body(12, color: Palette.ivory.withValues(alpha: 0.7), weight: 700)),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Reacciones',
            onPressed: _emotePicker,
            icon: const Icon(Icons.emoji_emotions_rounded, color: Palette.gold),
          ),
          IconButton(
            tooltip: 'Reglas',
            onPressed: () =>
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => RulesScreen(initial: variant.id))),
            icon: const Icon(Icons.menu_book_rounded, color: Palette.gold),
          ),
        ],
      ),
    );
  }

  void _emotePicker() {
    const emotes = ['👏', '😂', '😮', '😡', '🔥', '🙏', '😎', '¡Rummy!', '¡Vamos!', '¡Uy!'];
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0E2D21),
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Wrap(
            spacing: 10,
            runSpacing: 10,
            alignment: WrapAlignment.center,
            children: [
              for (final e in emotes)
                ActionChip(
                  label: Text(e, style: body(20, weight: 800)),
                  backgroundColor: Colors.black26,
                  side: BorderSide(color: Palette.gold.withValues(alpha: 0.4)),
                  onPressed: () {
                    client.emote(e);
                    Navigator.pop(c);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _opponents() {
    final n = players.length;
    final others = [for (var k = 1; k < n; k++) (me + k) % n];
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 10, 8, 6),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final i in others)
            KeyedSubtree(
              key: _badgeKey(i),
              child: PlayerBadge(
                seat: i,
                player: players[i],
                active: view['current'] == i && (phase == 'draw' || phase == 'play'),
                emote: _emotes[i],
                compact: n == 4,
              ),
            ),
        ],
      ),
    );
  }

  Widget _tableMelds() {
    final melds = [for (final m in view['melds'] as List) (m as Map).cast<String, dynamic>()];
    if (melds.isEmpty) {
      return Center(
        child: Text(
          'Aquí se bajan los juegos',
          style: display(18, color: Palette.ivory.withValues(alpha: 0.25), weight: 600),
        ),
      );
    }
    final sel = selectedCards;
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        alignment: WrapAlignment.center,
        children: [
          for (var k = 0; k < melds.length; k++)
            Builder(
              builder: (context) {
                final m = melds[k];
                final cards = cardsOf(m['cards']);
                final type = m['type'] == 'run' ? MeldType.run : MeldType.set;
                final owner = m['owner'] as int;
                final accepts = canPlay && !pinchOn && (_fits(cards, type, sel) || _swaps(cards, type, sel));
                return GestureDetector(
                  onTap: () => _tapMeld(k, cards, type),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.fromLTRB(6, 6, 6, 6),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: accepts ? Palette.gold : Palette.seats[owner % 4].withValues(alpha: 0.45),
                        width: accepts ? 2 : 1,
                      ),
                      boxShadow: accepts
                          ? [BoxShadow(color: Palette.gold.withValues(alpha: 0.5), blurRadius: 12)]
                          : null,
                    ),
                    child: CardRow(cards: cards, cardWidth: 36, overlap: cards.length > 6 ? 0.62 : 0.5),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _knockCenter() {
    final cards = hand;
    if (cards.isEmpty || cards.length > 13) return const SizedBox.shrink();
    final value = knockValueFor(view['variant'] as String);
    final arr = bestArrangement(cards, meldRules, value);
    final selDead = _selected.length == 1 && canPlay
        ? bestArrangement(
            [
              for (final c in cards)
                if (c.id != _selected.single) c,
            ],
            meldRules,
            value,
          ).deadValue
        : null;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Tus juegos', style: body(13, color: Palette.ivory.withValues(alpha: 0.65), weight: 700)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: [
              for (final m in arr.melds)
                Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Palette.gold.withValues(alpha: 0.5)),
                  ),
                  child: CardRow(cards: m.cards, cardWidth: 30),
                ),
              if (arr.melds.isEmpty) Text('Aún sin juegos', style: body(13, color: Colors.white38)),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(20)),
            child: Text(
              selDead != null
                  ? 'Carta muerta ${arr.deadValue} → $selDead al descartar'
                  : 'Carta muerta: ${arr.deadValue}',
              style: body(14, color: Palette.gold, weight: 800),
            ),
          ),
        ],
      ),
    );
  }

  Widget _piles() {
    final discard = cardsOf(view['discard']);
    final total = view['discardTotal'] as int;
    final dig = rulesInfo['dig'] == true;
    final pileWidth = 60.0;
    Widget discardWidget;
    if (dig && discard.length > 1) {
      final step = 22.0;
      discardWidget = SizedBox(
        width: min(MediaQuery.of(context).size.width - 140, pileWidth + step * (discard.length - 1)),
        height: pileWidth / cardRatio + 8,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          reverse: true,
          child: SizedBox(
            width: pileWidth + step * (discard.length - 1),
            height: pileWidth / cardRatio + 8,
            child: Stack(
              children: [
                for (var i = 0; i < discard.length; i++)
                  Positioned(
                    left: i * step,
                    top: 4,
                    child: GestureDetector(
                      onTap: () => _tapDiscard(i),
                      child: CardView(card: discard[i], width: pileWidth, glow: canDraw && i == discard.length - 1),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    } else {
      final top = discard.isEmpty ? null : discard.last;
      discardWidget = GestureDetector(
        onTap: top == null ? null : () => _tapDiscard(discard.length - 1),
        child: SizedBox(
          width: pileWidth + 8,
          height: pileWidth / cardRatio + 8,
          child: Stack(
            children: [
              if (discard.length > 1)
                Positioned(
                  left: 4,
                  top: 6,
                  child: Transform.rotate(
                    angle: -0.08,
                    child: CardView(card: discard[discard.length - 2], width: pileWidth),
                  ),
                ),
              Positioned(
                left: 2,
                top: 2,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 300),
                  transitionBuilder: (child, a) => ScaleTransition(
                    scale: Tween(begin: 1.3, end: 1.0).animate(CurvedAnimation(parent: a, curve: Curves.easeOutBack)),
                    child: FadeTransition(opacity: a, child: child),
                  ),
                  child: top == null
                      ? Container(
                          key: const ValueKey('empty'),
                          width: pileWidth,
                          height: pileWidth / cardRatio,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: Colors.white24, width: 1.5),
                          ),
                        )
                      : CardView(key: ValueKey(top.id), card: top, width: pileWidth, glow: canDraw),
                ),
              ),
            ],
          ),
        ),
      );
    }
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        KeyedSubtree(
          key: _stockKey,
          child: StockPile(count: view['stock'] as int, glow: canDraw, width: pileWidth, onTap: _tapStock),
        ),
        const SizedBox(width: 18),
        Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            KeyedSubtree(key: _discardKey, child: discardWidget),
            const SizedBox(height: 4),
            Text('Descarte · $total', style: body(12, color: Palette.ivory.withValues(alpha: 0.75), weight: 700)),
          ],
        ),
        if (pinchOn && inRound && (phase == 'draw' || phase == 'play')) ...[
          const SizedBox(width: 14),
          Padding(
            padding: const EdgeInsets.only(top: 18),
            child: PinchButton(onPressed: _pinch),
          ),
        ],
        if (view['canBuy'] == true) ...[
          const SizedBox(width: 12),
          Padding(
            padding: const EdgeInsets.only(top: 24),
            child: GoldButton(
              label: 'Comprar (${players[me]['buys']})',
              icon: Icons.shopping_bag_rounded,
              compact: true,
              onPressed: () => _act({'type': 'buy'}),
            ),
          ),
        ],
      ],
    );
  }

  Widget _eventLine() {
    final event = view['event'] as String? ?? '';
    final status = _statusText();
    return Column(
      children: [
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          child: Text(
            event,
            key: ValueKey(event),
            style: body(12.5, color: Palette.ivory.withValues(alpha: 0.6), weight: 600),
          ),
        ),
        const SizedBox(height: 4),
        AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
          decoration: BoxDecoration(
            color: myTurn ? Palette.gold.withValues(alpha: 0.18) : Colors.transparent,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(status, style: body(14, color: myTurn ? Palette.gold : Palette.ivory, weight: 800)),
        ),
      ],
    );
  }

  Widget _actions() {
    if (!canPlay) return const SizedBox(height: 8);
    final sel = selectedCards;
    final buttons = <Widget>[];
    if (isPoker) {
      if (pinchOn) {
        buttons.add(
          GoldButton(label: '+ Grupo', compact: true, secondary: true, onPressed: sel.isNotEmpty ? _stage : null),
        );
      }
      buttons.add(
        GoldButton(
          label: 'Botar',
          icon: Icons.upload_rounded,
          compact: true,
          secondary: true,
          onPressed: sel.length == 1 ? _discard : null,
        ),
      );
      final ready = pinchOn ? _staged.isNotEmpty : _pokerArrangement()?.complete == true;
      buttons.add(
        GoldButton(label: '¡Bajarme!', icon: Icons.download_rounded, compact: true, onPressed: ready ? _goDown : null),
      );
    } else if (isTable) {
      final valid = pinchOn ? sel.isNotEmpty : sel.length >= 3 && analyzeMeld(sel, meldRules) != null;
      final contractLocked = view['contract'] != null && players[me]['melded'] == true;
      if (!contractLocked) {
        buttons.add(GoldButton(label: '+ Grupo', compact: true, secondary: true, onPressed: valid ? _stage : null));
        buttons.add(
          GoldButton(
            label: _staged.isEmpty ? 'Bajar' : 'Bajar ${_staged.length + (valid ? 1 : 0)}',
            icon: Icons.download_rounded,
            compact: true,
            onPressed: valid || _staged.isNotEmpty ? _meld : null,
          ),
        );
      }
      buttons.add(
        GoldButton(
          label: 'Descartar',
          icon: Icons.upload_rounded,
          compact: true,
          onPressed: sel.length == 1 ? _discard : null,
        ),
      );
    } else {
      final gin = rulesInfo['style'] == 'gin';
      buttons.add(
        GoldButton(
          label: 'Descartar',
          icon: Icons.upload_rounded,
          compact: true,
          secondary: true,
          onPressed: sel.length == 1 ? _discard : null,
        ),
      );
      buttons.add(
        GoldButton(
          label: gin ? 'Tocar' : 'Cerrar',
          icon: Icons.flag_rounded,
          compact: true,
          onPressed: _canKnock ? _knock : null,
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
      child: Wrap(spacing: 8, runSpacing: 6, alignment: WrapAlignment.center, children: buttons),
    );
  }

  Widget _stagedRow() {
    final byId = _handById;
    return SizedBox(
      height: 58,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        children: [
          for (var g = 0; g < _staged.length; g++)
            GestureDetector(
              onTap: () => setState(() => _staged.removeAt(g)),
              child: Container(
                margin: const EdgeInsets.only(right: 8),
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Palette.gold, width: 1.4),
                  color: Palette.gold.withValues(alpha: 0.12),
                ),
                child: Row(
                  children: [
                    CardRow(cards: [for (final id in _staged[g]) ?byId[id]], cardWidth: 30, overlap: 0.55),
                    const Icon(Icons.close_rounded, size: 16, color: Palette.gold),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _handArea() {
    final staged = _staged.expand((g) => g).toSet();
    final cards = [
      for (final c in hand)
        if (!staged.contains(c.id)) c,
    ];
    final mustUse = view['mustUse'] as int?;
    return LayoutBuilder(
      builder: (context, c) {
        final w = c.maxWidth - 16;
        final cardW = (w / 6.4).clamp(46.0, 70.0);
        final cardH = cardW / cardRatio;
        final n = cards.length;
        final minStep = cardW * 0.42;
        final perRow = max(1, min(n, ((w - cardW) / minStep).floor() + 1));
        final rows = n == 0 ? 1 : (n / perRow).ceil();
        final rowGap = cardH * 0.58;
        final height = cardH + (rows - 1) * rowGap + 18;
        return SizedBox(
          height: height,
          width: c.maxWidth,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              for (var i = 0; i < n; i++)
                Builder(
                  builder: (context) {
                    final row = i ~/ perRow;
                    final inRow = min(perRow, n - row * perRow);
                    final col = i - row * perRow;
                    final step = inRow > 1 ? min(cardW * 0.72, (w - cardW) / (inRow - 1)) : 0.0;
                    final rowWidth = cardW + step * (inRow - 1);
                    final left = 8 + (w - rowWidth) / 2 + col * step;
                    final sel = _selected.contains(cards[i].id);
                    final top = 16 + row * rowGap - (sel ? 16 : 0);
                    final mid = (inRow - 1) / 2;
                    final angle = rows == 1 ? (col - mid) * 0.025 : 0.0;
                    return AnimatedPositioned(
                      key: ValueKey(cards[i].id),
                      duration: const Duration(milliseconds: 220),
                      curve: Curves.easeOutCubic,
                      left: left,
                      top: top + (rows == 1 ? (col - mid).abs() * (col - mid).abs() * 0.6 : 0),
                      child: TweenAnimationBuilder<double>(
                        tween: Tween(begin: 0, end: 1),
                        duration: const Duration(milliseconds: 380),
                        curve: Curves.easeOutBack,
                        builder: (context, t, child) => Transform.translate(
                          offset: Offset(0, (1 - t) * -70),
                          child: Opacity(opacity: t.clamp(0.0, 1.0), child: child),
                        ),
                        child: GestureDetector(
                          onTap: () => _toggle(cards[i]),
                          child: Transform.rotate(
                            angle: angle,
                            child: CardView(card: cards[i], width: cardW, selected: sel, glow: cards[i].id == mustUse),
                          ),
                        ),
                      ),
                    );
                  },
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _bottomBar() {
    final mine = players[me];
    Widget sortChip(String label, _Sort s) => Padding(
      padding: const EdgeInsets.only(left: 6),
      child: ChoiceChip(
        label: Text(label),
        selected: _sort == s,
        showCheckmark: false,
        visualDensity: VisualDensity.compact,
        labelStyle: body(12, color: _sort == s ? Palette.ink : Palette.ivory, weight: 800),
        selectedColor: Palette.gold,
        backgroundColor: Colors.black26,
        side: BorderSide(color: Palette.gold.withValues(alpha: 0.35)),
        onSelected: (_) => _setSort(s),
      ),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 0, 10, 6),
      child: Row(
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: Palette.seats[me % 4],
                child: Text(
                  (mine['name'] as String).characters.first.toUpperCase(),
                  style: display(14, color: Palette.ink),
                ),
              ),
              if (_emotes[me] != null) Positioned(bottom: 30, left: -6, child: EmoteBubble(text: _emotes[me]!)),
            ],
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '${mine['score']} pts · ${hand.length} cartas',
              overflow: TextOverflow.ellipsis,
              style: body(13, weight: 800),
            ),
          ),
          sortChip('Palo', _Sort.suit),
          sortChip('Valor', _Sort.rank),
          if (hand.length <= (isPoker ? 15 : 13)) sortChip('Juegos', _Sort.melds),
        ],
      ),
    );
  }

  Widget _resultOverlay() {
    final result = (view['result'] as Map?)?.cast<String, dynamic>();
    if (result == null) return const SizedBox.shrink();
    final over = phase == 'gameOver';
    final winner = view['winner'] as int?;
    final roundWinner = result['winner'] as int?;
    final points = (result['points'] as List).cast<int>();
    final hands = result['hands'] as List;
    final meldsBySeat = result['melds'] as List?;
    final deadBySeat = result['dead'] as List?;
    final penalty =
        rulesInfo['scoring'] == 'penaltyElimination' ||
        rulesInfo['scoring'] == 'penaltyRounds' ||
        rulesInfo['style'] == 'chinchon';
    final celebrate = over || roundWinner == me;
    return Stack(
      children: [
        Positioned.fill(child: Container(color: Colors.black.withValues(alpha: 0.6))),
        SafeArea(
          child: Center(
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.85, end: 1),
              duration: const Duration(milliseconds: 420),
              curve: Curves.easeOutBack,
              builder: (context, s, child) => Transform.scale(scale: s, child: child),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: GlassPanel(
                  border: Palette.gold,
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (over) const Icon(Icons.emoji_events_rounded, color: Palette.gold, size: 56),
                        Text(
                          over && winner != null
                              ? '¡${players[winner]['name']} gana la partida!'
                              : result['headline'] as String,
                          textAlign: TextAlign.center,
                          style: display(24, color: Palette.gold),
                        ),
                        if (over)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              result['headline'] as String,
                              textAlign: TextAlign.center,
                              style: body(14, weight: 700),
                            ),
                          ),
                        const SizedBox(height: 14),
                        for (var i = 0; i < players.length; i++)
                          Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: Colors.black26,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: i == roundWinner ? Palette.gold : Colors.white12),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    CircleAvatar(radius: 6, backgroundColor: Palette.seats[i % 4]),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        '${players[i]['name']}${i == me ? ' (tú)' : ''}',
                                        style: body(15, weight: 800),
                                      ),
                                    ),
                                    if (points[i] != 0)
                                      Text(
                                        '${points[i] > 0 ? '+' : ''}${points[i]}',
                                        style: body(
                                          15,
                                          color: (penalty ? points[i] > 0 : points[i] < 0)
                                              ? const Color(0xFFFF8A80)
                                              : Palette.gold,
                                          weight: 900,
                                        ),
                                      ),
                                    const SizedBox(width: 12),
                                    Text(
                                      'Total ${players[i]['score']}',
                                      style: body(13, color: Palette.ivory.withValues(alpha: 0.75), weight: 700),
                                    ),
                                  ],
                                ),
                                if (players[i]['eliminated'] == true)
                                  Text('Eliminado', style: body(12, color: Palette.red, weight: 800)),
                                const SizedBox(height: 6),
                                SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: meldsBySeat != null
                                      ? Row(
                                          children: [
                                            for (final m in (meldsBySeat[i] as List))
                                              Padding(
                                                padding: const EdgeInsets.only(right: 6),
                                                child: CardRow(cards: cardsOf(m), cardWidth: 26, overlap: 0.5),
                                              ),
                                            if ((deadBySeat![i] as List).isNotEmpty) ...[
                                              const SizedBox(width: 4),
                                              Opacity(
                                                opacity: 0.6,
                                                child: CardRow(
                                                  cards: cardsOf(deadBySeat[i]),
                                                  cardWidth: 26,
                                                  overlap: 0.4,
                                                ),
                                              ),
                                            ],
                                          ],
                                        )
                                      : CardRow(cards: cardsOf(hands[i]), cardWidth: 26, overlap: 0.45),
                                ),
                              ],
                            ),
                          ),
                        ..._faultsSummary(result),
                        const SizedBox(height: 8),
                        if (!over)
                          GoldButton(label: 'Siguiente ronda', icon: Icons.replay_rounded, onPressed: client.nextRound),
                        if (over && widget.isHost)
                          GoldButton(label: 'Nueva partida', icon: Icons.replay_rounded, onPressed: client.newGame),
                        if (over && !widget.isHost)
                          Text(
                            'El anfitrión puede empezar una nueva partida',
                            textAlign: TextAlign.center,
                            style: body(13, color: Palette.ivory.withValues(alpha: 0.7)),
                          ),
                        const SizedBox(height: 8),
                        GoldButton(
                          label: 'Salir de la mesa',
                          secondary: true,
                          compact: true,
                          onPressed: widget.onLeave,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        if (celebrate) const Positioned.fill(child: Confetti()),
      ],
    );
  }

  List<Widget> _faultsSummary(Map<String, dynamic> result) {
    final faults = [for (final f in (result['faults'] as List? ?? const [])) (f as Map).cast<String, dynamic>()];
    final falses = (result['falsePinches'] as List? ?? const []).cast<int>();
    if (faults.isEmpty && falses.isEmpty) return const [];
    String name(int s) => players[s]['name'] as String;
    return [
      const SizedBox(height: 4),
      Text('Faltas de la ronda', style: body(14, color: Palette.gold, weight: 800)),
      const SizedBox(height: 4),
      for (final f in faults)
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                f['pinched'] == true ? Icons.push_pin_rounded : Icons.visibility_off_rounded,
                size: 16,
                color: f['pinched'] == true ? Palette.red : Colors.white54,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '${name(f['seat'] as int)}: ${f['label']} · '
                  '${f['pinched'] == true ? 'lo pinchó ${name(f['by'] as int)}' : 'nadie lo pinchó'}',
                  style: body(12.5, weight: 600),
                ),
              ),
            ],
          ),
        ),
      for (final s in falses) Text('${name(s)} pinchó en falso', style: body(12.5, color: Colors.white70, weight: 600)),
      const SizedBox(height: 6),
    ];
  }

  Widget _pokerCenter() {
    final min = rulesInfo['minDown'] as int? ?? 51;
    if (pinchOn) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.push_pin_rounded, color: Palette.red, size: 30),
              const SizedBox(height: 6),
              Text('Se juega con pinchado', style: display(18, color: Palette.gold)),
              const SizedBox(height: 4),
              Text(
                'La app no te avisa si tu juego está bien. Arma tus grupos con «+ Grupo» y bájate con las '
                '15 cartas y $min puntos o más. Si ves un error de otro, ¡píncha!',
                textAlign: TextAlign.center,
                style: body(13, color: Palette.ivory.withValues(alpha: 0.75)),
              ),
            ],
          ),
        ),
      );
    }
    final p = _pokerArrangement();
    if (p == null) return const SizedBox.shrink();
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Tus juegos', style: body(13, color: Palette.ivory.withValues(alpha: 0.65), weight: 700)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: [
              for (final m in p.arr.melds)
                Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Palette.gold.withValues(alpha: 0.5)),
                  ),
                  child: CardRow(cards: m.cards, cardWidth: 28),
                ),
              if (p.arr.melds.isEmpty) Text('Aún sin juegos', style: body(13, color: Colors.white38)),
            ],
          ),
          const SizedBox(height: 10),
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: p.complete ? Palette.gold : Colors.black26,
              borderRadius: BorderRadius.circular(20),
              boxShadow: p.complete ? [BoxShadow(color: Palette.gold.withValues(alpha: 0.6), blurRadius: 18)] : null,
            ),
            child: Text(
              p.complete
                  ? '¡Mano completa! ${p.points} puntos'
                  : 'En juego: ${p.points} pts · sueltas: ${p.arr.deadwood.length} · mínimo $min',
              style: body(14, color: p.complete ? Palette.ink : Palette.gold, weight: 800),
            ),
          ),
        ],
      ),
    );
  }

  Widget _reviewOverlay() {
    final down = (view['down'] as Map?)?.cast<String, dynamic>();
    if (down == null) return const SizedBox.shrink();
    final seat = down['seat'] as int;
    final groups = [for (final g in down['groups'] as List) cardsOf(g)];
    final left = _reviewEnds?.difference(DateTime.now()).inMilliseconds ?? 0;
    final frac = (left / 15000).clamp(0.0, 1.0);
    final mine = seat == me;
    return Container(
      color: Colors.black.withValues(alpha: 0.55),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(16),
      child: GlassPanel(
        border: Palette.gold,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              mine ? 'Te bajaste · esperando revisión' : '${players[seat]['name']} se bajó',
              textAlign: TextAlign.center,
              style: display(22, color: Palette.gold),
            ),
            const SizedBox(height: 4),
            Text(
              mine ? 'Si nadie te pincha, ganas la ronda.' : '¿Está bien su juego? Si ves un error, ¡píncha!',
              textAlign: TextAlign.center,
              style: body(13.5, weight: 700),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                for (final g in groups)
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0.6, end: 1),
                    duration: const Duration(milliseconds: 450),
                    curve: Curves.easeOutBack,
                    builder: (context, t, child) => Transform.scale(scale: t, child: child),
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: Colors.black26,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Palette.gold.withValues(alpha: 0.5)),
                      ),
                      child: CardRow(cards: g, cardWidth: 32),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: frac,
                minHeight: 8,
                backgroundColor: Colors.white12,
                color: frac < 0.3 ? Palette.red : Palette.gold,
              ),
            ),
            const SizedBox(height: 4),
            Text('${(left / 1000).ceil()} s', textAlign: TextAlign.center, style: body(13, weight: 800)),
            if (!mine && inRound) ...[
              const SizedBox(height: 12),
              Center(child: PinchButton(onPressed: _pinch, big: true)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _bannerView() {
    final b = _banner!;
    return Positioned(
      top: 110,
      left: 0,
      right: 0,
      child: IgnorePointer(
        child: Center(
          child: TweenAnimationBuilder<double>(
            key: ValueKey(b.seq),
            tween: Tween(begin: 0, end: 1),
            duration: const Duration(milliseconds: 420),
            curve: Curves.easeOutBack,
            builder: (context, t, child) => Transform.translate(
              offset: Offset(0, (1 - t) * -40),
              child: Opacity(opacity: t.clamp(0.0, 1.0), child: child),
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 10),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFF6DB8E), Palette.gold, Palette.goldDeep]),
                borderRadius: BorderRadius.circular(30),
                boxShadow: [BoxShadow(color: Palette.gold.withValues(alpha: 0.5), blurRadius: 20)],
              ),
              child: Text(b.text, style: display(22, color: Palette.ink, weight: 800)),
            ),
          ),
        ),
      ),
    );
  }

  Widget _stampView() {
    final st = _stamp!;
    return IgnorePointer(
      child: Center(
        child: TweenAnimationBuilder<double>(
          key: ValueKey(st.seq),
          tween: Tween(begin: 0, end: 1),
          duration: const Duration(milliseconds: 520),
          curve: Curves.elasticOut,
          builder: (context, t, child) => Transform.rotate(
            angle: -0.18,
            child: Transform.scale(
              scale: 2.4 - 1.4 * t,
              child: Opacity(opacity: t.clamp(0.0, 1.0), child: child),
            ),
          ),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: st.color, width: 5),
            ),
            child: Text(st.text, style: display(38, color: st.color, weight: 900)),
          ),
        ),
      ),
    );
  }
}

class _Flight {
  static const duration = Duration(milliseconds: 420);
  final int id;
  final PlayingCard? card;
  final Offset from;
  final Offset to;
  final Duration delay;
  _Flight(this.id, this.card, this.from, this.to, this.delay);
}

/// Carta que vuela de un lugar a otro de la mesa.
class _FlyingCard extends StatefulWidget {
  final _Flight flight;
  const _FlyingCard({super.key, required this.flight});

  @override
  State<_FlyingCard> createState() => _FlyingCardState();
}

class _FlyingCardState extends State<_FlyingCard> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: _Flight.duration);

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(widget.flight.delay, () {
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const w = 46.0;
    final f = widget.flight;
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        if (_c.value == 0) return const SizedBox.shrink();
        final t = Curves.easeInOutCubic.transform(_c.value);
        final arc = sin(t * pi) * -40;
        final p = Offset.lerp(f.from, f.to, t)! + Offset(0, arc);
        return Positioned(
          left: p.dx - w / 2,
          top: p.dy - w / cardRatio / 2,
          child: IgnorePointer(
            child: Transform.rotate(
              angle: (1 - t) * 0.6,
              child: Opacity(opacity: (1.2 - t).clamp(0.0, 1.0), child: child),
            ),
          ),
        );
      },
      child: f.card == null ? const CardView.back(width: w) : CardView(card: f.card, width: w),
    );
  }
}
