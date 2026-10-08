// Parses a CSV birthdate string into the internal ddmmyyyy normal form
// (DECISIONS "Geburtsdatum-Normalform"). Pure, no I/O. `heute` is injectable so the
// future-date boundary is reproducible in tests, instead of depending on the real clock.

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Compares only the calendar day, local time, no hours/minutes.
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Accepts dd.mm.yyyy or yyyy-mm-dd (DECISIONS "Erwartetes Geburtsdatums-Format").
export function parseBirthdate(input, { heute = new Date() } = {}) {
  if (typeof input !== 'string') return { ok: false, messageId: 'datum_format' };
  const s = input.trim();
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);

  let day;
  let month;
  let year;
  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else if (ymd) {
    year = Number(ymd[1]);
    month = Number(ymd[2]);
    day = Number(ymd[3]);
  } else {
    return { ok: false, messageId: 'datum_format' };
  }

  // JS Date rolls invalid day/month combinations over into the next month (e.g. 31.04 -> 01.05);
  // comparing the components back catches that instead of silently accepting a wrong date.
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { ok: false, messageId: 'datum_ungueltig' };
  }

  if (startOfDay(date) > startOfDay(heute)) {
    return { ok: false, messageId: 'datum_zukunft' };
  }

  return { ok: true, ddmmyyyy: `${pad2(day)}${pad2(month)}${year}` };
}
