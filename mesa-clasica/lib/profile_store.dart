import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'profile.dart';

/// Perfil propio y jugadores conocidos, guardados en el teléfono.
abstract final class ProfileStore {
  static const _key = 'profile';
  static const _knownKey = 'known_players';

  static Future<Profile> load({String? name}) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    Profile p;
    try {
      p = raw == null ? Profile.fresh(name ?? 'Jugador') : Profile.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      p = Profile.fresh(name ?? 'Jugador');
    }
    if (name != null && name.isNotEmpty) p.name = name;
    await save(p);
    return p;
  }

  static Future<void> save(Profile p) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(p.toJson()));
  }

  /// Guarda lo que el anfitrión dice de este jugador (solo si es el mismo teléfono).
  static Future<void> saveFromHost(Map<String, dynamic> me) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw != null) {
      final current = jsonDecode(raw) as Map<String, dynamic>;
      if (current['deviceId'] != me['deviceId']) return;
    }
    await prefs.setString(_key, jsonEncode(Profile.fromJson(me).toJson()));
  }

  /// Ranking de las personas con las que se ha jugado, por puntaje.
  static Future<List<Map<String, dynamic>>> known() async {
    final prefs = await SharedPreferences.getInstance();
    try {
      final m = jsonDecode(prefs.getString(_knownKey) ?? '{}') as Map<String, dynamic>;
      final list = [for (final v in m.values) (v as Map).cast<String, dynamic>()];
      list.sort((a, b) => (b['rating'] as int? ?? 0) - (a['rating'] as int? ?? 0));
      return list;
    } catch (_) {
      return [];
    }
  }

  /// Registra a los jugadores de una partida terminada.
  static Future<void> recordTable(List<({String name, Map<String, dynamic> pub})> players) async {
    final prefs = await SharedPreferences.getInstance();
    Map<String, dynamic> m;
    try {
      m = jsonDecode(prefs.getString(_knownKey) ?? '{}') as Map<String, dynamic>;
    } catch (_) {
      m = {};
    }
    final now = DateTime.now().toIso8601String();
    for (final p in players) {
      final id = p.pub['deviceId'] as String?;
      if (id == null) continue;
      final prev = (m[id] as Map?)?.cast<String, dynamic>() ?? {};
      m[id] = {...p.pub, 'name': p.name, 'together': (prev['together'] as int? ?? 0) + 1, 'lastSeen': now};
    }
    await prefs.setString(_knownKey, jsonEncode(m));
  }
}
