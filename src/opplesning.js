// Opplesning: graveren leser sluttrapporten høyt med macOS-stemmen Nora.
// Slås på med npm start -- --les-opp. Gjør ingenting på andre plattformer.
import { spawn } from 'node:child_process';

const STEMME = 'Nora';
const TEMPO = 150; // ord i minuttet, litt saktere enn vanlig for begravelsesstemning
const MAKS_TEGN = 1000;

// Gjør markdown om til tekst som høres naturlig ut: ingen stjerner, kodetegn,
// emojier eller tabellstreker. Overskrifter får punktum så stemmen tar en pause.
export function renTekst(markdown) {
  return markdown
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .split('\n')
    .map((linje) => {
      if (/^\s*\|?[\s:|-]*-{3,}[\s:|-]*$/.test(linje)) return '';
      const overskrift = /^\s*#+\s/.test(linje);
      let t = linje
        .replace(/^\s*#+\s*/, '')
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_`|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (overskrift && t && !/[.!?:]$/.test(t)) t += '.';
      return t;
    })
    .filter(Boolean)
    .join('\n');
}

// Kutter ved slutten av siste hele setning innenfor maks tegn.
export function kortNed(tekst, maks = MAKS_TEGN) {
  if (tekst.length <= maks) return tekst;
  const bit = tekst.slice(0, maks);
  const slutt = Math.max(bit.lastIndexOf('. '), bit.lastIndexOf('.\n'), bit.lastIndexOf('! '), bit.lastIndexOf('? '));
  return slutt > 0 ? bit.slice(0, slutt + 1) : bit;
}

// kjør og plattform kan byttes ut i tester. Returnerer om opplesningen startet.
export function lesOpp(tekst, { kjør = spawn, plattform = process.platform } = {}) {
  if (plattform !== 'darwin') return false;
  kjør('say', ['-v', STEMME, '-r', String(TEMPO), kortNed(renTekst(tekst))], { stdio: 'ignore' });
  return true;
}

// Skiller --les-opp fra resten av argumentene, som er oppgaven.
export function taUtFlagg(argv) {
  return { lesOpp: argv.includes('--les-opp'), oppgave: argv.filter((a) => a !== '--les-opp').join(' ') };
}
