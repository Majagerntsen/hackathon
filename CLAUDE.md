# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Hva dette er

Hackaton-oppgave: en liten agent (Anthropic SDK, ren Node/ESM, ingen rammeverk) som graver i `hjemsokt-repo/`, finner død kode og skriver «nekrologer» over det som trygt kan fjernes. Koden, identifikatorene og promptene er på norsk, inkludert æøå i identifikatorer (`kjørAgent`, `verktøy`, `kjør`).

## Kommandoer

```bash
npm install
cp .env.example .env                  # sett ANTHROPIC_API_KEY
npm start                             # kjører eksempelOppgave fra src/verktoy.js
npm start -- "Hvilke pakker i package.json brukes ikke?"
```

Krever Node >= 20.12 (`process.loadEnvFile()`). Rotprosjektet har ingen tester, lint eller byggesteg. Valgfrie env-variabler: `MODELL` (standard `claude-sonnet-5-5`) og `MAX_ITERASJONER` (standard 10).

## Arkitektur

- `src/index.js`: laster `.env`, tar oppgaven fra argv (eller `eksempelOppgave`) og kaller `kjørAgent`.
- `src/agent.js`: agentløkka. Kaller `messages.create`, logger tekst og verktøykall i farger, kjører alle `tool_use`-blokker og sender resultatene tilbake i én `user`-melding. Stopper på `end_turn`, `refusal`, `max_tokens` eller `MAX_ITERASJONER`. Når et verktøy kaster en feil, går meldingen tilbake som `tool_result` med `is_error: true`, så modellen kan prøve igjen.
- `src/verktoy.js`: systemprompt, eksempeloppgave og verktøylisten. Hvert verktøy er `{ definisjon, kjør }`, der `definisjon` er Anthropic-verktøyskjemaet. **Bare verktøy med en `kjør`-funksjon sendes til modellen** (filtreres i `agent.js`). Stubbene `les_fil`, `finn_referanser` og `hent_git_historikk` har `kjør: null` og TODO-kommentarer som beskriver tenkt implementasjon. `sok_i_repo` er det eneste ferdige verktøyet, og `sokIRepo` kan gjenbrukes av de andre.
- Verktøy som tar filstier må resolve mot `REPO` og avvise stier som havner utenfor (`../`-triks).
- `definisjon.description` er det modellen leser for å skjønne når verktøyet skal brukes. Skriv den som til en ny kollega.

## Data agenten undersøker

- `hjemsokt-repo/` («romvakt», en Express-bookingtjeneste) er **testdata, ikke et prosjekt**. Ikke kjør `npm install` eller tester der, og ikke rydd i den døde koden. Det er nettopp den agenten skal finne. Fella den inneholder med vilje: kode som ser død ut, men brukes indirekte. Jobber lastes via `"fil.funksjon"`-strenger i `config/default.js`, plugins lastes dynamisk fra `src/plugins/`, og `formaterBookingForLonn` brukes fra et eksternt repo (`lonn-integrasjon`). Agenten bør fange slike tilfeller.
- `data/git-logg.json`: simulert git-historikk på formen `{ repo, merknad, filer: { "<sti relativt til hjemsokt-repo>": [{ hash, dato, forfatter, melding }] } }`, nyeste først. `hjemsokt-repo` har ingen ekte `.git`, så historikk skal hentes herfra.
