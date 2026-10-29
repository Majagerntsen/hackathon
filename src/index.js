// Startpunktet: npm start -- "spørsmålet ditt"
import fs from 'node:fs';
import path from 'node:path';
import { kjørAgent } from './agent.js';
import { system, eksempelOppgave } from './prompt.js';
import { verktøy } from './verktoy.js';
import { lesOpp, taUtFlagg } from './opplesning.js';

try {
  process.loadEnvFile();
} catch {
  // Ingen .env — da må ANTHROPIC_API_KEY være satt i miljøet.
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Mangler ANTHROPIC_API_KEY. Kopier .env.example til .env og lim inn nøkkelen.');
  process.exit(1);
}

const flagg = taUtFlagg(process.argv.slice(2));
const oppgave = flagg.oppgave || eksempelOppgave;
console.log(`\n🎃 ${oppgave}\n`);

const svar = await kjørAgent({ system, oppgave, verktøy });

const sluttTekst = svar?.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

// Sluttrapporten lagres som Markdown i stedet for å skrives i terminalen.
if (svar?.stop_reason === 'end_turn' && sluttTekst) {
  const RAPPORT = path.resolve(import.meta.dirname, '../rapport.md');
  const tidspunkt = new Date().toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
  fs.writeFileSync(RAPPORT, `${sluttTekst}\n\n---\n\n_Generert ${tidspunkt} · Oppgave: «${oppgave}»_\n`);
  console.log(`\n📄 Rapporten er lagret i ${path.relative(process.cwd(), RAPPORT)}`);
}

// npm start -- --les-opp: graveren leser sluttrapporten høyt med Nora.
if (flagg.lesOpp && sluttTekst) lesOpp(sluttTekst);
