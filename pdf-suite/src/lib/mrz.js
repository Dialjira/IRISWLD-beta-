// Lectura de la zona MRZ de pasaportes (TD3, 2×44) y documentos de identidad (TD1, 3×30) según ICAO 9303.

const VAL = (c) => (c === '<' ? 0 : /\d/.test(c) ? +c : c.charCodeAt(0) - 55);
export function checkDigit(s) {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += VAL(s[i]) * w[i % 3];
  return String(sum % 10);
}

/** Limpia una línea leída por OCR: mayúsculas, sin espacios, símbolos parecidos a "<" convertidos. */
export function cleanLine(l) {
  return l.toUpperCase().replace(/[«‹(\[{]/g, '<').replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '');
}

const toDigits = (s) => s.replace(/O|Q|D/g, '0').replace(/I|L/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/B/g, '8').replace(/G/g, '6');
const toLetters = (s) => s.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B').replace(/2/g, 'Z');

/** Intenta corregir un campo numérico para que cuadre con su dígito de control. */
function fixField(field, check) {
  const c = toDigits(check);
  if (checkDigit(field) === c) return { value: field, ok: true };
  const alt = toDigits(field);
  if (checkDigit(alt) === c) return { value: alt, ok: true };
  return { value: field, ok: false };
}

function date(yymmdd, future) {
  if (!/^\d{6}$/.test(yymmdd)) return '';
  const yy = +yymmdd.slice(0, 2), now = new Date().getFullYear() % 100;
  // Caducidad: siglo actual; nacimiento: si el año es mayor que el actual, siglo pasado
  const year = future ? 2000 + yy : (yy > now ? 1900 + yy : 2000 + yy);
  return `${year}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

const names = (field) => {
  const [sur, given = ''] = field.split('<<');
  return { surname: sur.replace(/</g, ' ').trim(), givenNames: given.replace(/</g, ' ').replace(/\s+/g, ' ').trim() };
};

/** Busca y analiza la MRZ en un texto OCR. Devuelve null si no la encuentra. */
export function parseMRZ(text) {
  const lines = String(text).split(/\n/).map(cleanLine).filter(l => l.length >= 25 && (l.match(/</g) || []).length >= 2);
  // TD3: dos líneas de 44
  for (let i = 0; i + 1 < lines.length; i++) {
    const a = lines[i].padEnd(44, '<').slice(0, 44), b = lines[i + 1].padEnd(44, '<').slice(0, 44);
    if (!/^[PIVAC]/.test(a) || lines[i].length < 40 || lines[i + 1].length < 40) continue;
    const num = fixField(b.slice(0, 9), b[9]);
    const birth = fixField(toDigits(b.slice(13, 19)), b[19]);
    const exp = fixField(toDigits(b.slice(21, 27)), b[27]);
    const composite = num.value + b[9] + birth.value + b[19] + exp.value + b[27] + b.slice(28, 43);
    return {
      format: 'TD3', type: a.slice(0, 2).replace(/</g, ''), issuer: toLetters(a.slice(2, 5)).replace(/</g, ''), ...names(toLetters(a.slice(5))),
      number: num.value.replace(/</g, ''), nationality: toLetters(b.slice(10, 13)).replace(/</g, ''), birthDate: date(birth.value, false),
      sex: { M: 'M', F: 'F' }[b[20]] || 'X', expiryDate: date(exp.value, true), personal: b.slice(28, 42).replace(/</g, ''),
      valid: { number: num.ok, birth: birth.ok, expiry: exp.ok, final: checkDigit(composite) === toDigits(b[43]) },
      lines: [a, b],
    };
  }
  // TD1: tres líneas de 30
  for (let i = 0; i + 2 < lines.length; i++) {
    const [a, b, c] = [lines[i], lines[i + 1], lines[i + 2]].map(l => l.padEnd(30, '<').slice(0, 30));
    if (!/^[IAC]/.test(a)) continue;
    const num = fixField(a.slice(5, 14), a[14]);
    const birth = fixField(toDigits(b.slice(0, 6)), b[6]);
    const exp = fixField(toDigits(b.slice(8, 14)), b[14]);
    return {
      format: 'TD1', type: a.slice(0, 2).replace(/</g, ''), issuer: toLetters(a.slice(2, 5)).replace(/</g, ''), ...names(toLetters(c)),
      number: num.value.replace(/</g, ''), nationality: toLetters(b.slice(15, 18)).replace(/</g, ''), birthDate: date(birth.value, false),
      sex: { M: 'M', F: 'F' }[b[7]] || 'X', expiryDate: date(exp.value, true), personal: a.slice(15, 30).replace(/</g, ''),
      valid: { number: num.ok, birth: birth.ok, expiry: exp.ok, final: true }, lines: [a, b, c],
    };
  }
  return null;
}

export const FIELD_LABELS = {
  surname: 'Apellidos', givenNames: 'Nombres', number: 'Número de documento', nationality: 'Nacionalidad', birthDate: 'Fecha de nacimiento',
  sex: 'Sexo', expiryDate: 'Fecha de caducidad', issuer: 'País emisor', type: 'Tipo', personal: 'Nº personal',
};
