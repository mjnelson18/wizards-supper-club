// Made-up data for local development and the smoke test. It copies the shape
// and the known quirks of the real Sheet (Tom hosting twice in the 7th circuit,
// Craig's 7th-circuit evening dated after the 8th began, dates only from the
// 7th circuit on) but the scores are random. Never deployed: the workflow
// always reads the real Sheet.

type Member = string;

const FOUNDERS: Member[] = ['Calum', 'Charles', 'Craig', 'Daniel', 'James', 'Max', 'Michael', 'Thomas'];
const LATER: Member[] = ['Calum', 'Charles', 'Craig', 'Daniel', 'James', 'Michael', 'Thomas', 'Jonathan', 'Jeremy'];

const FIRST = ['Gilded', 'Crooked', 'Smoking', 'Hungry', 'Velvet', 'Copper', 'Midnight', 'Salted', 'Wandering', 'Brass', 'Hollow', 'Scarlet'];
const SECOND = ['Ladle', 'Cauldron', 'Owl', 'Lantern', 'Spoon', 'Griddle', 'Pestle', 'Hearth', 'Trencher', 'Skillet', 'Larder', 'Tankard'];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function makeSample(): { evenings: string; scores: string; status: string } {
  const rand = mulberry32(20261118);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const shuffle = <T,>(xs: T[]) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const evenings: (string | number)[][] = [['Evening ID', 'Circuit', 'No. in circuit', 'Date', 'Chooser', 'Restaurant', 'Average score']];
  const scores: (string | number)[][] = [['Evening ID', 'Wizard', 'Status', 'Score', 'Source']];
  const used = new Set<string>();
  const harsh: Record<string, number> = {
    Calum: 0.6, Charles: 0.2, Craig: -0.1, Daniel: 0.3, James: -0.3, Max: 0.1, Michael: -0.7, Thomas: -0.4, Jonathan: -0.2, Jeremy: 0.1,
  };

  const restaurant = () => {
    for (;;) {
      const name = `The ${pick(FIRST)} ${pick(SECOND)}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
  };

  let c7Date = new Date(Date.UTC(2025, 9, 9));
  for (let circuit = 1; circuit <= 8; circuit++) {
    const members = circuit <= 4 ? FOUNDERS : LATER;
    let hosts = shuffle(members);
    if (circuit === 3) hosts = hosts.slice(0, 7); // one member never hosted
    if (circuit === 7) {
      // Tom hosts 2nd and 6th; Craig goes last, after the 8th circuit started.
      const rest = hosts.filter((h) => h !== 'Thomas' && h !== 'Craig');
      hosts = [rest[0], 'Thomas', rest[1], rest[2], rest[3], 'Thomas', rest[4], rest[5], rest[6], 'Craig'];
    }
    if (circuit === 8) hosts = ['Charles'];

    hosts.forEach((chooser, i) => {
      const number = i + 1;
      const id = `C${circuit}-${String(number).padStart(2, '0')}`;
      let date = '';
      if (circuit === 7) {
        date = number === 10 ? '2026-10-22' : iso(c7Date);
        c7Date = new Date(c7Date.getTime() + (28 + Math.floor(rand() * 14)) * 86_400_000);
      }
      if (circuit === 8) date = '2026-09-03';
      const name = id === 'C8-01' ? 'Golden Phoenix' : restaurant();
      evenings.push([id, circuit, number, date, chooser, name, '']);

      if (id === 'C8-01') {
        // The one evening quoted in full in the build spec.
        const real: [string, number][] = [['Calum', 8], ['Charles', 6], ['James', 5], ['Jeremy', 5], ['Jonathan', 4], ['Thomas', 4], ['Michael', 3]];
        for (const [w, s] of real) scores.push([id, w, 'Scored', s, 'sample']);
        scores.push([id, 'Craig', 'DNA', '', 'sample'], [id, 'Daniel', 'DNA', '', 'sample']);
        return;
      }

      const quality = 5.2 + rand() * 4;
      for (const w of members) {
        const r = rand();
        const old = circuit <= 6;
        let status = 'Scored';
        if (w !== chooser) {
          if (r < 0.2) status = 'DNA';
          else if (old && r < 0.38) status = 'UNK';
          else if (!old && r < 0.27) status = 'TBC';
          else if (r > 0.97) status = 'Average';
          else if (r > 0.94) status = 'Imputed';
        }
        let score: string | number = '';
        if (status === 'Scored' || status === 'Imputed') {
          const raw = quality + harsh[w] + (rand() - 0.5) * 3 + (w === chooser ? 0.5 : 0);
          const clamped = Math.min(10, Math.max(1, raw));
          score = rand() < 0.75 ? Math.round(clamped) : Math.round(clamped * 10) / 10;
        }
        scores.push([id, w, status, score, 'sample']);
      }
    });
  }

  const status = toCsv([
    ['key', 'value'],
    ['baton_holder', 'James'],
    ['next_date', '2026-12-10'],
    ['next_restaurant', 'The Wandering Larder'],
  ]);
  return { evenings: toCsv(evenings), scores: toCsv(scores), status };
}
