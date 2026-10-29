# Mesa Clásica — Diseño

Fecha: 2026-10-29 · Estado: aprobado

## Objetivo
App Android (APK) de juegos de mesa clásicos para 2–4 personas en la misma red
(WiFi o punto de acceso de un teléfono), visualmente llamativa, sin depender de un PC:
el teléfono que crea la mesa es el servidor.

Primera entrega: familia **Rummy / Remis** en todas sus modalidades.

## Modalidades
| Id | Nombre | Jugadores | Reglas base |
|---|---|---|---|
| `colombiano` | Rummy Colombiano | 2–4 | 2 barajas + 4 comodines; 10 cartas (2 j) / 9 (3–4 j); primera bajada ≥ 30 pts; 1 comodín por juego; cambio de comodín; "Rummy" (bajar todo de una) paga doble; eliminación a 100 pts; gana el último en pie |
| `clasico` | Remis / Rummy clásico | 2–4 | 1 baraja; 10 cartas (2 j) / 7 (3–4 j); el ganador suma la mano de los demás; partida a 100 |
| `continental` | Continental | 2–4 | 2 barajas + 4 comodines; 7 rondas (6→12 cartas): 2 tríos · trío+escalera · 2 escaleras · 3 tríos · 2 tríos+escalera · trío+2 escaleras · 3 escaleras; escaleras de 4; compra del descarte con castigo (3 por ronda); gana el menor puntaje |
| `r500` | Rummy 500 | 2–4 | 1 baraja + 2 comodines opcionales; se puede tomar del descarte en profundidad (la carta más honda debe usarse); suman cartas bajadas, restan las de la mano; partida a 500 |
| `gin` | Gin Rummy | 2 | 10 cartas; knock con ≤ 10 de carta muerta; gin +25; undercut +25; partida a 100 |
| `chinchon` | Chinchón | 2–4 | Baraja española 40/48 + comodines opcionales; 7 cartas; se cierra con ≤ 1 carta suelta de valor ≤ 5 (o 3); cerrar sin sueltas −10; chinchón (escalera de 7 sin comodín) gana; eliminación a 100 |

Las reglas de casa se eligen al crear la mesa (opciones por modalidad).

## Arquitectura
```
lib/engine/   Dart puro (sin Flutter): cartas, validación de juegos, motores y modalidades. Con pruebas.
lib/net/      Servidor del anfitrión (HttpServer + WebSocket en el teléfono), anuncio UDP,
              cliente, búsqueda de mesa por código.
lib/ui/       Tema, cartas vectoriales, pantallas (inicio, crear, unirse, sala, mesa, resultados).
```

- **Servidor autoritativo en el teléfono anfitrión.** Baraja, valida cada acción y envía a cada
  jugador solo su propia vista (las manos ajenas solo como cantidad). El anfitrión también juega
  conectándose a su propio servidor por 127.0.0.1, así todos usan el mismo camino de código.
- **Unirse:** QR con `mesaclasica://IP:PUERTO/CODIGO`, o código de 4 letras: el cliente escucha
  el anuncio UDP del anfitrión y, en paralelo, sondea la subred /24 en el puerto del juego
  (`GET /info`). Funciona también con el punto de acceso del teléfono.
- **Reconexión:** cada jugador recibe un token; al volver recupera su puesto.
- **Protocolo:** JSON por WebSocket. Cliente→anfitrión: `hello`, `action`, `start`, `config`,
  `next`. Anfitrión→cliente: `welcome`, `lobby`, `state`, `error`.

## Motores
- `TableRummy` (colombiano, clásico, continental, 500): robar → bajar / añadir / cambiar comodín →
  descartar. Ganchos por modalidad: valor de carta, primera bajada, contrato, compra, puntuación.
- `KnockRummy` (gin, chinchón): los juegos se forman en la mano; al cerrar, se calcula la mejor
  combinación de cada mano (DP por máscara de bits), se aplican las añadiduras automáticas y se puntúa.

## Visual
Mesa de paño verde con viñeta, acentos dorados, cartas vectoriales (francesa y española),
animaciones de reparto/robo/descarte, mano en abanico con selección múltiple, ordenar por palo o
valor, vibración, celebración al cerrar.

## Entrega
APK compilado localmente y flujo de GitHub Actions que publica el APK como artefacto.

## Pruebas
Pruebas unitarias del motor por modalidad (validación de juegos, flujo de turnos, puntuación) y
prueba de integración del servidor con varios clientes en local.

## Fuera de alcance (por ahora)
Juego por internet (relevo en la nube), bots, otros juegos (dominó, parqués, póker).
