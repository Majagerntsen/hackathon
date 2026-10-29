// Djevelens advokat: en egen underagent som prøver å bevise at et funn LEVER
// før graveren får begrave det. Den får bare lesende verktøy, sitt eget
// systemprompt og egne runder, og svarer med en dom graveren kan bruke.
import { kjørAgent } from '../agent.js';

const lilla = (t) => `\x1b[35m${t}\x1b[0m`;
const PREFIKS = lilla('    ⚖️  ');
const MAKS_RUNDER = 8;

export const advokatSystem = `Du er djevelens advokat på kodekirkegården. Graveren vil begrave kode i
hjemsokt-repo, og din jobb er å forsvare den: finn bevis for at koden fortsatt LEVER.
Let særlig etter indirekte bruk som et vanlig navnesøk ikke fanger:
- strenger på formen "fil.funksjon" i config (f.eks. config/default.js) som lastes dynamisk
- moduler som lastes dynamisk fra en mappe (require/import med variabel sti, readdirSync)
- npm-scripts i package.json og tester som importerer koden
- andre repoer eller tjenester nevnt i README eller kommentarer (f.eks. eksterne integrasjoner)
Siter fil og linje for hvert bevis. Ikke dikt opp bevis: finner du ingenting etter et grundig søk,
innrøm at koden er død. Svar kort på norsk, og avslutt med nøyaktig én linje:
DOM: LEVER  (du fant bevis for bruk)
DOM: DØD    (du fant ingen bruk)`;

// Tolker advokatens svar. Mangler dom-linja, er dommen USIKKER.
export function tolkDom(tekst) {
  const treff = tekst.match(/^\s*DOM:\s*(LEVER|DØD)\s*$/im);
  const begrunnelse = tekst.replace(/^\s*DOM:.*$/gim, '').trim();
  return { dom: treff ? treff[1].toUpperCase() : 'USIKKER', begrunnelse };
}

// Advokaten skal bare lese: ingen stubber, ikke seg selv og ingen sletting.
export function advokatVerktøy(alle) {
  return alle.filter((v) => v.kjør && !['kryssforhor', 'foreslaa_sletting'].includes(v.definisjon.name));
}

const KONKLUSJON = {
  LEVER: '🔴 Advokaten fant liv. IKKE begrav dette, legg det under «Ikke grav opp».',
  DØD: '🟢 Advokaten fant ingen tegn til liv. Trygt å begrave.',
  USIKKER: '🟡 Advokaten kom ikke til en dom. Merk funnet «sjekk først».',
};

// kjørAgent og hentVerktøy sendes inn så testene kan bytte dem ut. verktoy.js
// importeres dynamisk for å unngå sirkulær import (den importerer oss).
export function lagKryssforhor({
  kjørAgent: kjør = kjørAgent,
  hentVerktøy = async () => (await import('../verktoy.js')).verktøy,
} = {}) {
  return {
    definisjon: {
      name: 'kryssforhor',
      description:
        'Sender et funn til djevelens advokat: en egen agent som leter etter bevis for at koden ' +
        'fortsatt brukes (config-strenger, dynamisk lasting, npm-scripts, eksterne repoer). ' +
        'Kall dette for hvert funn FØR du merker det 🟢 trygt eller foreslår sletting. ' +
        'Svarer med en dom: LEVER (🔴 ikke rør), DØD (🟢 trygt) eller USIKKER (🟡 sjekk først).',
      input_schema: {
        type: 'object',
        properties: {
          navn: { type: 'string', description: 'Navnet på det som skal begraves, f.eks. "eksporterCsv" eller "moment".' },
          fil: { type: 'string', description: 'Fila det ligger i, relativt til hjemsokt-repo.' },
          begrunnelse: { type: 'string', description: 'Hvorfor du mener det er dødt.' },
        },
        required: ['navn', 'fil', 'begrunnelse'],
      },
    },
    kjør: async ({ navn, fil, begrunnelse }) => {
      console.log(lilla(`\n    ⚖️  Djevelens advokat forsvarer «${navn}» i ${fil}`));
      const svar = await kjør({
        system: advokatSystem,
        oppgave: `Graveren vil begrave «${navn}» i ${fil}.\nGraverens begrunnelse: ${begrunnelse}\nBevis at det lever.`,
        verktøy: advokatVerktøy(await hentVerktøy()),
        prefiks: PREFIKS,
        maksIterasjoner: MAKS_RUNDER,
      });
      const tekst = (svar?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const { dom, begrunnelse: forsvar } = tolkDom(tekst);
      console.log(lilla(`    ⚖️  Dom: ${dom}\n`));
      return `Dom: ${dom}\n${KONKLUSJON[dom]}\n\nAdvokatens forsvar:\n${forsvar || '(ingen begrunnelse)'}`;
    },
  };
}

export const kryssforhor = lagKryssforhor();
