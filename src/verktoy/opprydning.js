// Opprydnings-PR: samler opp slettingene agenten foreslår og skriver dem som
// en patch og en PR-tekst. Rører aldri hjemsokt-repo, bare filene i ROT.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROT = path.resolve(import.meta.dirname, '../..');
const REPO = path.join(ROT, 'hjemsokt-repo');
const PATCH = path.join(ROT, 'opprydning.patch');
const PR_TEKST = path.join(ROT, 'opprydning-pr.md');
const KONTEKST = 3;

// Alle forslag i denne kjøringen: { fil, fra_linje, til_linje, begrunnelse, linjer }.
const forslag = [];

function lesLinjer(fil) {
  const innhold = fs.readFileSync(path.join(REPO, fil), 'utf8');
  const harSluttNy = innhold.endsWith('\n');
  return { linjer: (harSluttNy ? innhold.slice(0, -1) : innhold).split('\n'), harSluttNy };
}

function sjekkSti(fil) {
  if (typeof fil !== 'string' || !fil.trim()) throw new Error('Mangler «fil», f.eks. "src/utils/legacyCsv.js".');
  const full = path.resolve(REPO, fil);
  if (!full.startsWith(REPO + path.sep)) throw new Error(`«${fil}» ligger utenfor hjemsokt-repo.`);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error(`Fant ikke fila «${fil}» i hjemsokt-repo.`);
  return path.relative(REPO, full).split(path.sep).join('/');
}

// Unified diff for én fil der bare hele linjer slettes. Områder nær hverandre
// slås sammen til én hunk, slik git gjør.
function diffForFil(fil, områder) {
  const { linjer, harSluttNy } = lesLinjer(fil);
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
  return filer.map((fil) => diffForFil(fil, forslag.filter((f) => f.fil === fil))).join('');
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

export const foreslaaSletting = {
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
};
