// Startpunktet: npm start -- "spørsmålet ditt"
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

// npm start -- --les-opp: graveren leser sluttrapporten høyt med Nora.
const sluttTekst = svar?.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
if (flagg.lesOpp && sluttTekst) lesOpp(sluttTekst);
