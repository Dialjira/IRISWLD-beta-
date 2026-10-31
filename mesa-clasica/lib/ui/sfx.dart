import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Sonidos y vibraciones de la mesa, con ajustes guardados en el teléfono.
abstract final class Sfx {
  static final soundOn = ValueNotifier<bool>(true);
  static final vibrationOn = ValueNotifier<bool>(true);
  static final Map<String, AudioPlayer> _players = {};
  static bool _broken = false;

  static Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      soundOn.value = p.getBool('sound') ?? true;
      vibrationOn.value = p.getBool('vibration') ?? true;
    } catch (_) {}
  }

  static Future<void> setSound(bool on) async {
    soundOn.value = on;
    final p = await SharedPreferences.getInstance();
    await p.setBool('sound', on);
    if (on) play('turn');
  }

  static Future<void> setVibration(bool on) async {
    vibrationOn.value = on;
    final p = await SharedPreferences.getInstance();
    await p.setBool('vibration', on);
    if (on) HapticFeedback.mediumImpact();
  }

  /// Reproduce `assets/sfx/<name>.wav`. Nunca falla: sin audio, simplemente no suena.
  static void play(String name) {
    if (!soundOn.value || _broken) return;
    unawaited(_play(name));
  }

  static Future<void> _play(String name) async {
    try {
      final player = _players.putIfAbsent(name, () => AudioPlayer()..setReleaseMode(ReleaseMode.stop));
      await player.stop();
      await player.play(AssetSource('sfx/$name.wav'), mode: PlayerMode.lowLatency);
    } on MissingPluginException {
      _broken = true;
    } catch (_) {}
  }

  /// Sonido propio de cada emoción; las frases y los mensajes tienen el suyo.
  static String emoteSound(String text, {bool isText = false}) {
    if (isText) return 'emo_message';
    return switch (text) {
      '👏' => 'emo_clap',
      '😂' => 'emo_laugh',
      '🔥' => 'emo_fire',
      '😡' => 'emo_angry',
      '😮' => 'emo_wow',
      '🎉' => 'emo_party',
      '😎' => 'emo_cool',
      '🙏' => 'emo_pray',
      '💩' => 'emo_poop',
      '👑' => 'emo_crown',
      _ => 'emo_phrase',
    };
  }

  static void tap() {
    if (vibrationOn.value) HapticFeedback.selectionClick();
  }

  static void light() {
    if (vibrationOn.value) HapticFeedback.lightImpact();
  }

  static void medium() {
    if (vibrationOn.value) HapticFeedback.mediumImpact();
  }

  static void heavy() {
    if (vibrationOn.value) HapticFeedback.heavyImpact();
  }

  /// Patrón: golpes repetidos con [gap] entre cada uno.
  static void pattern(int times, {Duration gap = const Duration(milliseconds: 110)}) {
    if (!vibrationOn.value) return;
    for (var i = 0; i < times; i++) {
      Future<void>.delayed(gap * i, HapticFeedback.heavyImpact);
    }
  }
}
