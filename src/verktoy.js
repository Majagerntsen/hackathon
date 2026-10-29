// Verktøyene agenten kan bruke. Et verktøy er en definisjon (det modellen ser)
// og en kjør-funksjon (det som faktisk skjer). kjør: null betyr stub: den
// sendes ikke til modellen før dere har implementert den.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROT = path.resolve(import.meta.dirname, '..');
export const REPO = path.join(ROT, 'hjemsokt-repo');
export const GIT_LOGG = path.join(ROT, 'data/git-logg.json');

const MAKS_TREFF = 50;

function alleFiler(mappe) {
  return fs.readdirSync(mappe, { withFileTypes: true }).flatMap((d) => {
    if (d.name === 'node_modules' || d.name === '.git') return [];
    const full = path.join(mappe, d.name);
    return d.isDirectory() ? alleFiler(full) : [full];
  });
}

function sokIRepo({ monster, regex = false, maks_treff = MAKS_TREFF } = {}) {
  if (typeof monster !== 'string' || !monster.trim()) {
    throw new Error('Mangler «monster». Send f.eks. {"monster": "TODO"} eller {"monster": "require\\\\(", "regex": true}.');
  }
  let test;
  if (regex) {
    let re;
    try {
      re = new RegExp(monster, 'i');
    } catch (e) {
      throw new Error(`Ugyldig regex «${monster}»: ${e.message}`);
    }
    test = (linje) => re.test(linje);
  } else {
    const nål = monster.toLowerCase();
    test = (linje) => linje.toLowerCase().includes(nål);
  }

  const grense = Math.min(Math.max(1, Number(maks_treff) || MAKS_TREFF), 200);
  const treff = [];
  let totalt = 0;
  for (const fil of alleFiler(REPO)) {
    const linjer = fs.readFileSync(fil, 'utf8').split('\n');
    linjer.forEach((linje, i) => {
      if (!test(linje)) return;
      totalt++;
      if (treff.length < grense) treff.push(`${path.relative(REPO, fil)}:${i + 1}: ${linje.trim()}`);
    });
  }

  if (totalt === 0) return `Ingen treff på «${monster}».`;
  const hale = totalt > treff.length ? `\n… ${totalt - treff.length} treff til. Snevre inn søket.` : '';
  return treff.join('\n') + hale;
}

const MAKS_PER_KATEGORI = 30;
const IDENT = '[\\p{L}\\p{N}_$]';
const DYNAMISK_LASTING = /\b(?:import|require)\s*\(\s*(?:`[^`]*\$\{|[^'"`\s)])/;

function finnReferanser({ navn } = {}) {
  if (typeof navn !== 'string' || !navn.trim()) {
    throw new Error('Mangler «navn». Send f.eks. {"navn": "beregnRabatt"} eller {"navn": "moment"}.');
  }
  // En filsti som "src/utils/legacyCsv.js" søkes som modulnavnet «legacyCsv».
  const søk = path.posix.basename(navn.trim().replace(/\\/g, '/')).replace(/\.[cm]?js$/, '');
  const n = søk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ord = new RegExp(`(?<!${IDENT})${n}(?!${IDENT})`, 'u');
  const definisjon = new RegExp(
    `\\b(?:function\\*?|class|const|let|var)\\s+${n}(?!${IDENT})|^\\s*(?:async\\s+)?${n}\\s*(?::|\\([^)]*\\)\\s*\\{)`,
    'u',
  );
  const eksport = new RegExp(`\\bexports\\.${n}(?!${IDENT})|module\\.exports\\s*=`, 'u');
  const kortEksport = new RegExp(`^${n}\\s*,?$`, 'u');
  // Navnet står bare inne i strenger når det forsvinner sammen med streng-literalene.
  const bareIStreng = (t) => !ord.test(t.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""'));
  const pakkenøkkel = new RegExp(`^"${n}"\\s*:`, 'u');
  const importLinje = /\brequire\s*\(|^import\b|\bfrom\s+['"]/;

  const k = { bruk: [], import: [], test: [], indirekte: [], dok: [], kommentar: [], definisjon: [] };
  const definisjonsmapper = new Set();
  const dynamisk = [];

  for (const fil of alleFiler(REPO)) {
    const rel = path.relative(REPO, fil).replace(/\\/g, '/');
    const mappe = path.posix.dirname(rel);
    if (path.posix.basename(rel).replace(/\.[cm]?js$/, '') === søk) {
      k.definisjon.push(`${rel} (selve fila)`);
      definisjonsmapper.add(mappe);
    }
    const erTest = /(^|\/)test\/|\.test\.js$/.test(rel);
    let iKommentar = false;
    let iEksport = false;

    fs.readFileSync(fil, 'utf8').split('\n').forEach((linje, i) => {
      const t = linje.trim();
      const varKommentar = iKommentar || /^(\/\/|\/\*|\*)/.test(t);
      if (!iKommentar && t.startsWith('/*') && !t.includes('*/')) iKommentar = true;
      else if (iKommentar && t.includes('*/')) iKommentar = false;
      const varEksport = iEksport;
      if (/module\.exports\s*=\s*\{/.test(t) && !t.includes('}')) iEksport = true;
      else if (iEksport && t.startsWith('}')) iEksport = false;

      if (!varKommentar && DYNAMISK_LASTING.test(t)) dynamisk.push({ mappe, linje: `${rel}:${i + 1}: ${t}` });
      if (!ord.test(linje)) return;

      const treff = `${rel}:${i + 1}: ${t}`;
      if (rel.endsWith('.md')) k.dok.push(treff);
      else if (rel.endsWith('.json')) {
        if (pakkenøkkel.test(t)) k.definisjon.push(treff);
        else if (bareIStreng(t)) k.indirekte.push(treff);
        else k.bruk.push(treff);
      } else if (varKommentar) k.kommentar.push(treff);
      else if (importLinje.test(t)) (erTest ? k.test : k.import).push(treff);
      else if (definisjon.test(t)) {
        k.definisjon.push(treff);
        definisjonsmapper.add(mappe);
      } else if (eksport.test(t) || (varEksport && kortEksport.test(t))) k.definisjon.push(treff);
      else if (erTest) k.test.push(treff);
      else if (bareIStreng(t)) k.indirekte.push(treff);
      else k.bruk.push(treff);
    });
  }

  if (Object.values(k).every((liste) => liste.length === 0)) {
    return `Fant ikke «${søk}» noe sted i hjemsokt-repo. Sjekk stavemåten (søket skiller mellom store og små bokstaver), eller bruk sok_i_repo.`;
  }

  const seksjoner = [
    ['Bruk i kode', k.bruk],
    ['Import/require', k.import],
    ['Bruk i tester', k.test],
    ['Nevnt i strenger (config, npm-scripts, dynamisk lasting)', k.indirekte],
    ['Nevnt i dokumentasjon', k.dok],
    ['I kommentarer eller utkommentert kode (teller ikke som bruk)', k.kommentar],
    ['Definert eller eksportert (teller ikke som bruk)', k.definisjon],
  ]
    .filter(([, liste]) => liste.length)
    .map(([tittel, liste]) => {
      const vist = liste.slice(0, MAKS_PER_KATEGORI).map((l) => `  ${l}`).join('\n');
      const hale = liste.length > MAKS_PER_KATEGORI ? `\n  … ${liste.length - MAKS_PER_KATEGORI} til` : '';
      return `${tittel} (${liste.length}):\n${vist}${hale}`;
    });

  const direkte = k.bruk.length + k.import.length;
  let konklusjon;
  if (direkte > 0) {
    konklusjon = `«${søk}» er i bruk (${direkte} direkte treff). Ikke dødt.`;
  } else if (k.indirekte.length) {
    konklusjon =
      `Ingen direkte bruk, men «${søk}» står i strenger. Det kan lastes indirekte, f.eks. som "fil.funksjon" ` +
      'i config, som plugin-navn eller fra et npm-script. Les de linjene før du konkluderer.';
  } else if (k.dok.length) {
    konklusjon = `Ingen bruk i koden, men «${søk}» er nevnt i dokumentasjonen. Det kan brukes fra et annet repo. Ikke fjern uten å sjekke.`;
  } else if (k.test.length) {
    konklusjon = `«${søk}» brukes bare i tester. Trolig død produksjonskode, men testene må i så fall fjernes sammen med den.`;
  } else {
    konklusjon =
      `Fant ingen bruk av «${søk}» i hjemsokt-repo. Det betyr ikke sikkert at det er dødt: kode kan lastes ` +
      'dynamisk, npm-pakker kan brukes fra npm-scripts eller eslint-«extends», og andre repoer kan bruke det.';
  }
  const lasterHer = dynamisk.filter((d) => definisjonsmapper.has(d.mappe));
  if (direkte === 0 && lasterHer.length) {
    konklusjon +=
      '\nOBS: mappen der det er definert laster filer dynamisk, så navnet kan brukes uten å stå i koden:\n' +
      lasterHer.map((d) => `  ${d.linje}`).join('\n');
  }

  return `Referanser til «${søk}»:\n\n${seksjoner.join('\n\n')}\n\nKonklusjon: ${konklusjon}`;
}

// Modellen sender stier i mange varianter: "./src/x.js", "src\\x.js", "hjemsokt-repo/src/x.js".
// Gjør dem om til / relativt til repo-roten, slik git-loggen og sok_i_repo bruker dem.
function normaliserSti(fil) {
  return fil.trim().replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '').replace(/^hjemsokt-repo\//, '');
}

function lesFil({ fil } = {}) {
  if (typeof fil !== 'string' || !fil.trim()) {
    throw new Error('Mangler «fil». Send f.eks. {"fil": "src/server.js"}.');
  }
  const full = path.resolve(REPO, normaliserSti(fil));
  const relativ = path.relative(REPO, full);
  if (!relativ || relativ.startsWith('..') || path.isAbsolute(relativ)) {
    throw new Error(`«${fil}» må ligge i hjemsokt-repo.`);
  }

  let innhold;
  try {
    innhold = fs.readFileSync(full, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`Fant ikke «${fil}» i hjemsokt-repo. Bruk sok_i_repo for å finne riktig sti.`);
    }
    if (e.code === 'EISDIR') throw new Error(`«${fil}» er en mappe, ikke en fil.`);
    throw e;
  }
  return innhold
    .replace(/\r?\n$/, '')
    .split(/\r?\n/)
    .map((linje, i) => `${i + 1}: ${linje}`)
    .join('\n');
}

function hentGitHistorikk({ fil } = {}) {
  if (typeof fil !== 'string' || !fil.trim()) {
    throw new Error('Mangler «fil». Send f.eks. {"fil": "src/utils/legacyCsv.js"}.');
  }
  const nøkkel = normaliserSti(fil);

  let logg;
  try {
    logg = JSON.parse(fs.readFileSync(GIT_LOGG, 'utf8'));
  } catch (e) {
    throw new Error(`Fant ikke git-loggen i ${path.relative(process.cwd(), GIT_LOGG)}: ${e.message}`);
  }

  const commits = logg.filer?.[nøkkel];
  if (!commits) {
    const navn = path.posix.basename(nøkkel);
    const lignende = Object.keys(logg.filer ?? {}).filter((f) => path.posix.basename(f) === navn);
    const hint = lignende.length
      ? ` Mente du ${lignende.map((f) => `«${f}»`).join(', ')}?`
      : ' Bruk sok_i_repo for å finne riktig sti.';
    throw new Error(`Ingen git-historikk for «${nøkkel}».${hint}`);
  }
  if (commits.length === 0) return `«${nøkkel}» finnes i loggen, men har ingen commits.`;

  const linjer = [...commits]
    .sort((a, b) => b.dato.localeCompare(a.dato))
    .map((c) => `${c.dato} ${c.hash} ${c.forfatter}: ${c.melding}`);
  const merknad = logg.merknad ? `\n\nMerknad: ${logg.merknad}` : '';
  return `Historikk for ${nøkkel} (${commits.length} commits, nyeste først):\n` + linjer.join('\n') + merknad;
}

// Opprydnings-PR: samler opp slettingene agenten foreslår og skriver dem som
// en patch og en PR-tekst. Rører aldri hjemsokt-repo, bare filene i ROT.
const PATCH = path.join(ROT, 'opprydning.patch');
const PR_TEKST = path.join(ROT, 'opprydning-pr.md');
const KONTEKST = 3;

// Alle forslag i denne kjøringen: { fil, fra_linje, til_linje, begrunnelse, linjer }.
const forslag = [];

function splittLinjer(innhold) {
  const harSluttNy = innhold.endsWith('\n');
  return { linjer: (harSluttNy ? innhold.slice(0, -1) : innhold).split('\n'), harSluttNy };
}

function lesLinjer(fil) {
  return splittLinjer(fs.readFileSync(path.join(REPO, fil), 'utf8'));
}

function sjekkSti(fil) {
  if (typeof fil !== 'string' || !fil.trim()) throw new Error('Mangler «fil», f.eks. "src/utils/legacyCsv.js".');
  const full = path.resolve(REPO, normaliserSti(fil));
  if (!full.startsWith(REPO + path.sep)) throw new Error(`«${fil}» ligger utenfor hjemsokt-repo.`);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error(`Fant ikke fila «${fil}» i hjemsokt-repo.`);
  return path.relative(REPO, full).split(path.sep).join('/');
}

// Unified diff for én fil der bare hele linjer slettes. Områder nær hverandre
// slås sammen til én hunk, slik git gjør.
export function lagDiff(fil, innhold, områder) {
  const { linjer, harSluttNy } = splittLinjer(innhold);
  const slett = new Set(områder.flatMap((o) => Array.from({ length: o.til_linje - o.fra_linje + 1 }, (_, i) => o.fra_linje + i)));

  const grupper = [];
  for (const o of [...områder].sort((a, b) => a.fra_linje - b.fra_linje)) {
    const start = Math.max(1, o.fra_linje - KONTEKST);
    const slutt = Math.min(linjer.length, o.til_linje + KONTEKST);
    const forrige = grupper.at(-1);
    if (forrige && start <= forrige.slutt + 1) forrige.slutt = Math.max(forrige.slutt, slutt);
    else grupper.push({ start, slutt });
  }

  let slettetFør = 0;
  const hunks = grupper.map(({ start, slutt }) => {
    const ut = [];
    let slettet = 0;
    for (let n = start; n <= slutt; n++) {
      ut.push((slett.has(n) ? '-' : ' ') + linjer[n - 1]);
      if (slett.has(n)) slettet++;
      if (n === linjer.length && !harSluttNy) ut.push('\\ No newline at end of file');
    }
    const gammelLengde = slutt - start + 1;
    const nyLengde = gammelLengde - slettet;
    const nyStart = nyLengde === 0 ? start - slettetFør - 1 : start - slettetFør;
    slettetFør += slettet;
    return `@@ -${start},${gammelLengde} +${nyStart},${nyLengde} @@\n${ut.join('\n')}`;
  });

  return `diff --git a/${fil} b/${fil}\n--- a/${fil}\n+++ b/${fil}\n${hunks.join('\n')}\n`;
}

function lagPatch() {
  const filer = [...new Set(forslag.map((f) => f.fil))].sort();
  return filer
    .map((fil) => lagDiff(fil, fs.readFileSync(path.join(REPO, fil), 'utf8'), forslag.filter((f) => f.fil === fil)))
    .join('');
}

function lagPrTekst() {
  const antallLinjer = forslag.reduce((sum, f) => sum + f.linjer.length, 0);
  const deler = [
    '# 🪦 Opprydning: begraver død kode',
    '',
    `Graveren har funnet ${forslag.length} stykke(r) død kode som trygt kan fjernes (${antallLinjer} linjer).`,
    'Bare funn vurdert som 🟢 trygge er tatt med.',
    '',
    '| Fil | Linjer |',
    '| --- | --- |',
    ...forslag.map((f) => `| \`${f.fil}\` | ${f.fra_linje}–${f.til_linje} |`),
    '',
    '## Nekrologer',
  ];
  for (const f of forslag) {
    deler.push(
      '',
      `### \`${f.fil}\`, linje ${f.fra_linje}–${f.til_linje}`,
      '',
      f.begrunnelse.trim(),
      '',
      '<details><summary>Koden som begraves</summary>',
      '',
      '```js',
      ...f.linjer,
      '```',
      '',
      '</details>',
    );
  }
  deler.push('', '---', '', 'Bruk patchen fra roten av kodekirkegarden:', '', '```bash', 'git apply --directory=hjemsokt-repo opprydning.patch', '```', '');
  return deler.join('\n');
}

function sjekkPatch() {
  const res = spawnSync('git', ['apply', '--check', '--directory=hjemsokt-repo', PATCH], { cwd: ROT, encoding: 'utf8' });
  if (res.error) return 'kunne ikke kjøre git apply --check';
  return res.status === 0 ? 'git apply --check: OK' : `git apply --check feilet: ${res.stderr.trim()}`;
}

function foreslåSletting({ fil, fra_linje, til_linje, begrunnelse } = {}) {
  const relativ = sjekkSti(fil);
  const { linjer } = lesLinjer(relativ);
  if (!Number.isInteger(fra_linje) || !Number.isInteger(til_linje) || fra_linje < 1 || til_linje < fra_linje) {
    throw new Error('fra_linje og til_linje må være heltall der 1 ≤ fra_linje ≤ til_linje.');
  }
  if (til_linje > linjer.length) throw new Error(`«${relativ}» har bare ${linjer.length} linjer.`);
  if (typeof begrunnelse !== 'string' || !begrunnelse.trim()) {
    throw new Error('Mangler «begrunnelse»: skriv nekrologen som skal stå i PR-teksten.');
  }
  const kollisjon = forslag.find((f) => f.fil === relativ && fra_linje <= f.til_linje && f.fra_linje <= til_linje);
  if (kollisjon) {
    throw new Error(`Overlapper med et tidligere forslag i ${relativ} (linje ${kollisjon.fra_linje}–${kollisjon.til_linje}).`);
  }

  const slettet = linjer.slice(fra_linje - 1, til_linje);
  forslag.push({ fil: relativ, fra_linje, til_linje, begrunnelse, linjer: slettet });
  fs.writeFileSync(PATCH, lagPatch());
  fs.writeFileSync(PR_TEKST, lagPrTekst());

  return [
    `La til sletting av ${relativ}:${fra_linje}–${til_linje} (${slettet.length} linjer). Totalt ${forslag.length} forslag.`,
    sjekkPatch(),
    `Skrev ${path.relative(ROT, PATCH)} og ${path.relative(ROT, PR_TEKST)}.`,
    'Linjene som slettes:',
    ...slettet.map((l, i) => `${fra_linje + i}: ${l}`),
  ].join('\n');
}

export const verktøy = [
  {
    definisjon: {
      name: 'sok_i_repo',
      description:
        'Søker gjennom alle filene i hjemsokt-repo (kode, tester, config, package.json) og returnerer ' +
        'treff som «fil:linje: tekst». Bruk det for å finne hvor noe er definert eller brukt, f.eks. et ' +
        'funksjonsnavn, et pakkenavn, "TODO", "it.skip" eller "featureFlags". Vanlig tekstsøk uten ' +
        'hensyn til store og små bokstaver. Sett regex: true for regulære uttrykk. Gir maks 50 treff ' +
        'som standard, så søk smalt hvis du får for mange.',
      input_schema: {
        type: 'object',
        properties: {
          monster: { type: 'string', description: 'Teksten eller regexen du søker etter.' },
          regex: { type: 'boolean', description: 'Tolk monster som regulært uttrykk. Standard false.' },
          maks_treff: { type: 'number', description: 'Maks antall treff (1–200). Standard 50.' },
        },
        required: ['monster'],
      },
    },
    kjør: async (input) => sokIRepo(input),
  },
  {
    definisjon: {
      name: 'les_fil',
      description:
        'Leser innholdet i én fil i hjemsokt-repo, med linjenumre. Oppgi stien relativt til roten av ' +
        'repoet, f.eks. "src/services/bookingService.js". Bruk det når et søketreff ser mistenkelig ut ' +
        'og du trenger å se sammenhengen rundt.',
      input_schema: {
        type: 'object',
        properties: {
          fil: { type: 'string', description: 'Sti relativt til hjemsokt-repo.' },
        },
        required: ['fil'],
      },
    },
    kjør: async (input) => lesFil(input),
  },
  {
    definisjon: {
      name: 'finn_referanser',
      description:
        'Finner alle steder et navn (funksjon, variabel, pakke eller fil) brukes i hjemsokt-repo, ' +
        'utenom der det er definert. Svarer med en liste over filer og linjer, og sier tydelig fra hvis ' +
        'det ikke finnes noen. Husk at kode kan brukes indirekte: via strenger i config, dynamisk ' +
        'import, npm-scripts eller fra andre repoer. Null treff betyr ikke alltid at noe er dødt.',
      input_schema: {
        type: 'object',
        properties: {
          navn: { type: 'string', description: 'Navnet du vil finne bruk av, f.eks. "beregnRabatt" eller "moment".' },
        },
        required: ['navn'],
      },
    },
    kjør: async (input) => finnReferanser(input),
  },
  {
    definisjon: {
      name: 'hent_git_historikk',
      description:
        'Henter commit-historikken for én fil i hjemsokt-repo: dato, forfatter og melding, nyeste først. ' +
        'Bruk det for å si når noe sist ble rørt og av hvem, f.eks. «sist endret av Mona i 2021».',
      input_schema: {
        type: 'object',
        properties: {
          fil: { type: 'string', description: 'Sti relativt til hjemsokt-repo, f.eks. "src/utils/legacyCsv.js".' },
        },
        required: ['fil'],
      },
    },
    kjør: async (input) => hentGitHistorikk(input),
  },
  {
    definisjon: {
      name: 'foreslaa_sletting',
      description:
        'Foreslår å slette et linjeområde i en fil i hjemsokt-repo, og legger det til i opprydnings-PR-en. ' +
        'Repoet endres ikke. Verktøyet skriver opprydning.patch (unified diff med alle forslagene så langt) ' +
        'og opprydning-pr.md (PR-tekst med nekrologene). Bruk det BARE på funn du har undersøkt og vurdert ' +
        'som 🟢 trygge å fjerne, aldri på noe som kan brukes indirekte (config-strenger, dynamisk lasting, ' +
        'andre repoer). Les fila først så linjenumrene stemmer, og ta med hele enheten (f.eks. hele funksjonen ' +
        'og kommentaren over). Kall det én gang per område. Svaret viser linjene som slettes, så du kan ' +
        'kontrollere at det ble riktig.',
      input_schema: {
        type: 'object',
        properties: {
          fil: { type: 'string', description: 'Sti relativt til hjemsokt-repo, f.eks. "src/utils/legacyCsv.js".' },
          fra_linje: { type: 'integer', description: 'Første linje som skal slettes (1-basert, inklusiv).' },
          til_linje: { type: 'integer', description: 'Siste linje som skal slettes (inklusiv).' },
          begrunnelse: {
            type: 'string',
            description: 'Nekrologen: hva koden var, når den sist ble rørt og hvorfor den trygt kan begraves. Havner i PR-teksten.',
          },
        },
        required: ['fil', 'fra_linje', 'til_linje', 'begrunnelse'],
      },
    },
    kjør: async (input) => foreslåSletting(input),
  },
];
