// Tester for opplesningen. say byttes ut med en falsk kjør-funksjon, så testene
// er stille og virker på alle plattformer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renTekst, kortNed, lesOpp, taUtFlagg } from '../src/opplesning.js';

test('renTekst: fjerner markdown, kodetegn og emojier', () => {
  const md = '## 🪦 Nekrolog\n\n**Hva:** Funksjonen `eksporterCsv` i [legacyCsv](src/utils/legacyCsv.js).\n- 🟢 Trygt å begrave';
  assert.equal(renTekst(md), 'Nekrolog.\nHva: Funksjonen eksporterCsv i legacyCsv.\nTrygt å begrave');
});

test('renTekst: tabeller og skillelinjer forsvinner', () => {
  assert.equal(renTekst('| fil | score |\n|---|---|\n| a.js | 3 |\n---\nSlutt.'), 'fil score\na.js 3\nSlutt.');
});

test('kortNed: lar kort tekst være i fred', () => {
  assert.equal(kortNed('Hvil i fred.', 100), 'Hvil i fred.');
});

test('kortNed: kutter ved siste hele setning innenfor grensen', () => {
  assert.equal(kortNed('Første setning. Andre setning. Tredje setning.', 35), 'Første setning. Andre setning.');
});

test('lesOpp: kaller say med Nora og renset tekst', () => {
  let kall;
  const ok = lesOpp('**Hvil** i fred 🪦', { kjør: (...args) => { kall = args; }, plattform: 'darwin' });
  assert.equal(ok, true);
  assert.equal(kall[0], 'say');
  assert.deepEqual(kall[1].slice(0, 2), ['-v', 'Nora']);
  assert.equal(kall[1].at(-1), 'Hvil i fred');
});

test('lesOpp: gjør ingenting utenfor macOS', () => {
  let kalt = false;
  assert.equal(lesOpp('Hei', { kjør: () => { kalt = true; }, plattform: 'linux' }), false);
  assert.equal(kalt, false);
});

test('taUtFlagg: finner --les-opp og fjerner det fra oppgaven', () => {
  assert.deepEqual(taUtFlagg(['--les-opp', 'Finn', 'død', 'kode']), { lesOpp: true, oppgave: 'Finn død kode' });
  assert.deepEqual(taUtFlagg(['Finn', 'kode']), { lesOpp: false, oppgave: 'Finn kode' });
});
