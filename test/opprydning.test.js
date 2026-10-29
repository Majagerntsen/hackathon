// Tester for opprydnings-verktøyet. Hver diff brukes med ekte `git apply` på en
// kopi i en temp-mappe, så vi vet at patchen faktisk lar seg bruke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lagDiff, verktøy } from '../src/verktoy.js';

const foreslaaSletting = verktøy.find((v) => v.definisjon.name === 'foreslaa_sletting');

const tiLinjer = Array.from({ length: 10 }, (_, i) => `linje ${i + 1}`).join('\n') + '\n';

// Skriver innholdet til en fil, bruker diffen og returnerer det nye innholdet.
function brukDiff(innhold, områder) {
  const mappe = fs.mkdtempSync(path.join(os.tmpdir(), 'opprydning-'));
  fs.writeFileSync(path.join(mappe, 'fil.js'), innhold);
  fs.writeFileSync(path.join(mappe, 'p.patch'), lagDiff('fil.js', innhold, områder));
  const res = spawnSync('git', ['apply', 'p.patch'], { cwd: mappe, encoding: 'utf8' });
  assert.equal(res.status, 0, `git apply feilet: ${res.stderr}`);
  return fs.readFileSync(path.join(mappe, 'fil.js'), 'utf8');
}

const uten = (innhold, ...nr) => innhold.split('\n').filter((_, i) => !nr.includes(i + 1)).join('\n');

test('sletter ett område midt i fila', () => {
  assert.equal(brukDiff(tiLinjer, [{ fra_linje: 4, til_linje: 5 }]), uten(tiLinjer, 4, 5));
});

test('områder nær hverandre slås sammen til én hunk', () => {
  const diff = lagDiff('fil.js', tiLinjer, [{ fra_linje: 2, til_linje: 2 }, { fra_linje: 6, til_linje: 6 }]);
  assert.equal(diff.match(/^@@/gm).length, 1);
  assert.equal(brukDiff(tiLinjer, [{ fra_linje: 2, til_linje: 2 }, { fra_linje: 6, til_linje: 6 }]), uten(tiLinjer, 2, 6));
});

test('områder langt fra hverandre gir egne hunks med riktig forskyvning', () => {
  const lang = Array.from({ length: 30 }, (_, i) => `l${i + 1}`).join('\n') + '\n';
  const områder = [{ fra_linje: 20, til_linje: 22 }, { fra_linje: 3, til_linje: 4 }];
  // git apply bryr seg ikke om startlinja på ny-siden, så den må sjekkes her.
  assert.deepEqual(lagDiff('fil.js', lang, områder).match(/^@@.*@@$/gm), ['@@ -1,7 +1,5 @@', '@@ -17,9 +15,6 @@']);
  assert.equal(brukDiff(lang, områder), uten(lang, 3, 4, 20, 21, 22));
});

test('sletter til og med siste linje', () => {
  assert.equal(brukDiff(tiLinjer, [{ fra_linje: 8, til_linje: 10 }]), uten(tiLinjer, 8, 9, 10));
});

test('sletter hele fila', () => {
  assert.equal(brukDiff(tiLinjer, [{ fra_linje: 1, til_linje: 10 }]), '');
});

test('fil uten linjeskift på slutten, siste linje beholdes', () => {
  assert.equal(brukDiff('a\nb\nc', [{ fra_linje: 2, til_linje: 2 }]), 'a\nc');
});

test('fil uten linjeskift på slutten, siste linje slettes', () => {
  assert.equal(brukDiff('a\nb\nc', [{ fra_linje: 3, til_linje: 3 }]), 'a\nb\n');
});

// Feilene kastes før noe skrives, så disse rører verken repoet eller patch-fila.
test('avviser stier utenfor hjemsokt-repo', async () => {
  await assert.rejects(
    foreslaaSletting.kjør({ fil: '../package.json', fra_linje: 1, til_linje: 1, begrunnelse: 'x' }),
    /utenfor hjemsokt-repo/,
  );
});

test('avviser linjer utenfor fila og tom begrunnelse', async () => {
  const fil = 'src/utils/dato.js';
  await assert.rejects(foreslaaSletting.kjør({ fil, fra_linje: 1, til_linje: 9999, begrunnelse: 'x' }), /har bare/);
  await assert.rejects(foreslaaSletting.kjør({ fil, fra_linje: 3, til_linje: 2, begrunnelse: 'x' }), /heltall/);
  await assert.rejects(foreslaaSletting.kjør({ fil, fra_linje: 1, til_linje: 1, begrunnelse: ' ' }), /begrunnelse/);
});
