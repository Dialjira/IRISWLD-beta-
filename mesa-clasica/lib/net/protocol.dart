import 'dart:convert';
import 'dart:io';
import 'dart:math';

/// Puerto TCP del servidor de la mesa (HTTP + WebSocket).
const gamePort = 47800;

/// Puerto UDP donde el anfitrión anuncia su mesa.
const discoveryPort = 47801;

const announcePrefix = 'MESACLASICA';

const _codeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

String randomCode([Random? rng]) {
  final r = rng ?? Random.secure();
  return List.generate(4, (_) => _codeChars[r.nextInt(_codeChars.length)]).join();
}

String randomToken() {
  final r = Random.secure();
  return List.generate(24, (_) => r.nextInt(36).toRadixString(36)).join();
}

String encodeMsg(Map<String, dynamic> m) => jsonEncode(m);

Map<String, dynamic> decodeMsg(dynamic data) => jsonDecode(data as String) as Map<String, dynamic>;

/// Dirección donde se puede encontrar una mesa.
class TableAddress {
  final List<String> hosts;
  final int port;
  final String code;

  const TableAddress(this.hosts, this.port, this.code);

  /// Contenido del QR: mesaclasica://IP1,IP2:PUERTO/CODIGO
  String toUri() => 'mesaclasica://${hosts.join(',')}:$port/$code';

  static TableAddress? parse(String raw) {
    final m = RegExp(r'^mesaclasica://([0-9.,]+):(\d+)/([A-Z]{4})$').firstMatch(raw.trim());
    if (m == null) return null;
    return TableAddress(m.group(1)!.split(','), int.parse(m.group(2)!), m.group(3)!);
  }
}

/// Mesa anunciada en la red.
class Announcement {
  final String code;
  final String host;
  final int port;
  final String hostName;
  final String variant;
  final int players;

  Announcement(this.code, this.host, this.port, this.hostName, this.variant, this.players);

  String encode() => [announcePrefix, code, port, hostName.replaceAll('|', ' '), variant, players].join('|');

  static Announcement? decode(String raw, String fromHost) {
    final p = raw.split('|');
    if (p.length != 6 || p[0] != announcePrefix) return null;
    return Announcement(p[1], fromHost, int.tryParse(p[2]) ?? gamePort, p[3], p[4], int.tryParse(p[5]) ?? 0);
  }
}

bool _isPrivate(InternetAddress a) {
  final b = a.rawAddress;
  if (b.length != 4) return false;
  return b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168);
}

/// IPv4 privadas del teléfono, priorizando WiFi y punto de acceso.
Future<List<String>> localIPv4s() async {
  final ifaces = await NetworkInterface.list(type: InternetAddressType.IPv4, includeLoopback: false);
  int rank(NetworkInterface i) {
    final n = i.name.toLowerCase();
    if (n.startsWith('wlan') || n.startsWith('ap') || n.startsWith('swlan') || n.startsWith('en')) return 0;
    if (n.startsWith('rmnet') || n.startsWith('ccmni') || n.startsWith('tun')) return 2;
    return 1;
  }

  ifaces.sort((a, b) => rank(a) - rank(b));
  return [
    for (final i in ifaces)
      if (rank(i) < 2)
        for (final a in i.addresses)
          if (_isPrivate(a)) a.address,
  ];
}
