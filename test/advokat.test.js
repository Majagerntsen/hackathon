// Tester for djevelens advokat. Underagenten byttes ut med en falsk kjørAgent,
// så vi tester det advokaten gjør med svaret, ikke modellen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tolkDom, advokatVerktøy, lagKryssforhor } from '../src/verktoy/advokat.js';

const svarMed = (tekst) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: tekst }] });
const verktøyNavnet = (name, kjør = async () => '') => ({ definisjon: { name }, kjør });

test('tolkDom: DOM: LEVER betyr at koden lever', () => {
  assert.deepEqual(tolkDom('Fant den i config.\nDOM: LEVER'), { dom: 'LEVER', begrunnelse: 'Fant den i config.' });
});

test('tolkDom: DOM: DØD betyr at koden kan begraves', () => {
  assert.equal(tolkDom('Ingen bruk.\nDOM: DØD').dom, 'DØD');
});

test('tolkDom: uten dom-linje blir det USIKKER', () => {
  assert.equal(tolkDom('Hmm, vanskelig å si.').dom, 'USIKKER');
});

test('advokatVerktøy: tar bort stubber, seg selv og sletting', () => {
  const alle = [
    verktøyNavnet('sok_i_repo'),
    { definisjon: { name: 'les_fil' }, kjør: null },
    verktøyNavnet('kryssforhor'),
    verktøyNavnet('foreslaa_sletting'),
  ];
  assert.deepEqual(advokatVerktøy(alle).map((v) => v.definisjon.name), ['sok_i_repo']);
});

test('kryssforhor: sender funnet og bare lesende verktøy til underagenten', async () => {
  let fikk;
  const kryssforhor = lagKryssforhor({
    kjørAgent: async (args) => {
      fikk = args;
      return svarMed('Ingen bruk.\nDOM: DØD');
    },
    hentVerktøy: async () => [verktøyNavnet('sok_i_repo'), verktøyNavnet('kryssforhor')],
  });
  await kryssforhor.kjør({ navn: 'eksporterCsv', fil: 'src/utils/legacyCsv.js', begrunnelse: 'ingen kaller den' });
  assert.match(fikk.oppgave, /eksporterCsv/);
  assert.match(fikk.oppgave, /src\/utils\/legacyCsv\.js/);
  assert.match(fikk.oppgave, /ingen kaller den/);
  assert.deepEqual(fikk.verktøy.map((v) => v.definisjon.name), ['sok_i_repo']);
});

test('kryssforhor: LEVER gir beskjed om ikke å begrave', async () => {
  const kryssforhor = lagKryssforhor({
    kjørAgent: async () => svarMed('Lastes via "rydding.slettGamle" i config/default.js.\nDOM: LEVER'),
    hentVerktøy: async () => [],
  });
  const svar = await kryssforhor.kjør({ navn: 'slettGamle', fil: 'src/jobber/rydding.js', begrunnelse: 'x' });
  assert.match(svar, /LEVER/);
  assert.match(svar, /🔴/);
  assert.match(svar, /config\/default\.js/);
});

test('kryssforhor: DØD gir grønt lys', async () => {
  const kryssforhor = lagKryssforhor({ kjørAgent: async () => svarMed('Ingen spor.\nDOM: DØD'), hentVerktøy: async () => [] });
  assert.match(await kryssforhor.kjør({ navn: 'a', fil: 'b', begrunnelse: 'c' }), /🟢/);
});

test('kryssforhor: advokat som går tom for runder gir 🟡', async () => {
  const kryssforhor = lagKryssforhor({ kjørAgent: async () => undefined, hentVerktøy: async () => [] });
  assert.match(await kryssforhor.kjør({ navn: 'a', fil: 'b', begrunnelse: 'c' }), /🟡/);
});
