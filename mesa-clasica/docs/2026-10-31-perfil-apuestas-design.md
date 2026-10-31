# Perfil, ranking, fichas, apuestas, trofeos y pinchado 2 — Diseño

Fecha: 2026-10-31 · Estado: aprobado · Versión de la app: 1.3 (protocolo 3)

## Pinchado
- Opción «Pinchado»: No / Manual (¡Pinchar!) / Automático (la app castiga sola).
- Manual: si no hay falta abierta, el servidor responde con una advertencia
  (`code: pinchWarning`); el cliente pide confirmación y reenvía con `force`.
- Castigo al pinchado: sale de la ronda, +25, +50 o paga 10.000 / 50.000 / 100.000 fichas
  a quien lo pinchó (en automático se reparten entre los demás).
- Pinchar en falso (ignorando la advertencia): sale de la partida (por defecto), sale de la
  ronda, paga 50.000 fichas o sin castigo.

## Perfil y ranking
- Identificador único por teléfono (la IP cambia de red en red), guardado en el teléfono.
- Ranking ELO desde 1000 (K = 32, contra cada rival al terminar la partida); niveles
  Novato, Aficionado, Tahúr, Maestro y Leyenda.
- Estadísticas: partidas, ganadas, rondas ganadas y mejores rachas.
- Cada teléfono guarda las estadísticas de las personas con las que ha jugado (ranking de la mesa).

## Fichas y apuestas (virtuales, sin valor real)
- 1.000.000 de fichas iniciales.
- Apuesta pactada en la sala: sin apuesta, por ronda, por punto o bolsa por partida.
- Recarga cuando el saldo baja de 50.000: vuelve a 1.000.000, cuesta 100 puntos de ranking y
  queda registrada a la vista de todos.
- El anfitrión lleva los saldos de la sesión (`SessionLedger`) y envía a cada jugador su
  perfil actualizado, que el teléfono guarda.

## Trofeos
- Rachas de rondas: Bronce (3), Plata (5), Oro (7), Diamante (10).
- Rachas de partidas: Campeón (2), Invicto (3), Leyenda de la mesa (5).

## Comunicación y visual
- Emociones animadas, frases rápidas y mensajes de hasta 80 caracteres, en grande en la
  pantalla de todos.
- La carta robada vuela boca arriba y queda marcada «NUEVA» hasta que termina el turno.
- Versión de protocolo en el saludo: un teléfono con otra versión no puede entrar.
