// Tester for agentløkka med en falsk Anthropic-klient, så vi slipper API-kall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kjørAgent } from '../src/agent.js';

// Klient som svarer med svarene i rekkefølge, og gjentar det siste.
function falskKlient(...svar) {
  let kall = 0;
  return {
    get antallKall() { return kall; },
    messages: { create: async () => svar[Math.min(kall++, svar.length - 1)] },
  };
}

const tekstSvar = (tekst) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: tekst }] });
const verktøySvar = { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'ekko', input: {} }] };
const ekko = { definisjon: { name: 'ekko' }, kjør: async () => 'ok' };

// Fanger console.log mens fn kjører.
async function fangLogg(fn) {
  const linjer = [];
  const ekte = console.log;
  console.log = (t) => linjer.push(String(t));
  try {
    await fn();
  } finally {
    console.log = ekte;
  }
  return linjer;
}

test('prefiks rykker inn hver linje agenten logger', async () => {
  const klient = falskKlient(tekstSvar('første\nandre'));
  const linjer = await fangLogg(() => kjørAgent({ system: '', oppgave: 'x', verktøy: [], klient, prefiks: '  ⚖️ ' }));
  assert.deepEqual(linjer, ['  ⚖️ første\n  ⚖️ andre']);
});

test('maksIterasjoner overstyrer MAX_ITERASJONER', async () => {
  const klient = falskKlient(verktøySvar);
  await fangLogg(() => kjørAgent({ system: '', oppgave: 'x', verktøy: [ekko], klient, maksIterasjoner: 2 }));
  assert.equal(klient.antallKall, 2);
});

test('returnerer siste svar når modellen er ferdig', async () => {
  const klient = falskKlient(verktøySvar, tekstSvar('ferdig'));
  let svar;
  await fangLogg(async () => {
    svar = await kjørAgent({ system: '', oppgave: 'x', verktøy: [ekko], klient });
  });
  assert.equal(svar.content[0].text, 'ferdig');
});
