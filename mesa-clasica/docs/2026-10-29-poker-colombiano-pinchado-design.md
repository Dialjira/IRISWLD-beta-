# Póker colombiano, La 51, pinchado, sonido y animaciones — Diseño

Fecha: 2026-10-29 · Estado: aprobado

## Modalidades nuevas

### Póker colombiano (mano completa)
- 2 barajas (opcional comodines). Se reparten 14 cartas.
- Turno: robar del mazo o tomar el descarte, y botar una.
- Te bajas cuando, con 15 cartas (después de robar), **todas** forman ternas, cuartas o
  escaleras y suman el mínimo (51 por defecto). La ronda termina ahí: ganas la ronda.
- Ternas/cuartas: mismo valor, palos distintos. Escaleras: mismo palo, desde 3 cartas
  (o 4), con vuelta K-A-2 (opcional).
- Valores: 2–9 su número; 10, J, Q, K y As valen 10; comodín vale la carta que reemplaza
  (suelto en la mano, 20).
- Tomar del descarte obliga a bajarse en ese turno.
- Cobro: los demás suman el valor de sus cartas sueltas (o de toda la mano, opcional);
  quien llega a la meta queda eliminado; gana el último en pie.

### La 51 (bajada y pegue)
- Igual reparto y valores. Te bajas parcialmente con el mínimo (51/71/81) y luego pegas
  cartas a cualquier juego de la mesa. Gana la ronda quien se queda sin cartas.
- Tomar del descarte solo para usar esa carta en un juego o pegue ese mismo turno.

## Pinchado (regla de casa, activable)
- **Apagado:** la app bloquea las faltas y avisa.
- **Encendido:** la app no avisa y acepta estas faltas:
  1. Tomar del descarte y no bajarse / no usar esa carta ese turno.
  2. Botar una carta que entra en un juego ya bajado en la mesa (La 51).
  3. Bajarse mal: juego inválido o por debajo del mínimo.
  4. Pegar una carta donde no entra (La 51).
- Cualquier otro jugador puede tocar **¡Pinchar!**. Ventana: desde la falta hasta que el
  siguiente jugador termina su turno. Al bajarse en el Póker hay 15 s de revisión.
- Pinchazo correcto: castigo al que falló (sale de la ronda, +25 o +50; configurable).
- Pinchazo en falso: mismo castigo al que pinchó, o ninguno (configurable).
- Si nadie pincha a tiempo, la falta pasa. Los resultados muestran todas las faltas.
- Con pinchado encendido la app no muestra ayudas de validez (como en la mesa real).

## Sonido, vibración y animación (todas las modalidades)
- Sonidos sintetizados propios: barajar, repartir, robar, descartar, bajar, tu turno,
  error, pinchazo, victoria.
- Vibraciones: tu turno, mano completa, te pincharon, ganaste, error.
- Animaciones: reparto al iniciar ronda, cartas que vuelan entre mazo, descarte, rivales y
  mano, sello "¡PINCHADO!", aviso "¡Tu turno!".
- Ajustes de sonido y vibración en la pantalla de inicio.

## Implementación
- `MeldRules.wrapRuns` para escaleras con vuelta.
- `PokerRummy` (nuevo motor) para mano completa; `TableRummy` gana faltas y pinchado.
- `CardGame` expone un plazo (`deadline`) que el servidor vigila con un temporizador.
- Las vistas incluyen `fx` (secuencia, tipo y asiento del último evento) para sonidos y
  animaciones en los clientes.
