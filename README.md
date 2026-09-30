# Osservatorio Webcam — Italia

Cruscotto per tenere d'occhio le webcam pubbliche italiane (piazze, mare, montagna, meteo, traffico). Applicazione statica, senza build, senza API key e senza backend: le webcam si aggiungono incollando un link e vengono salvate nel browser (`localStorage`). Vista **Muro** multi-cam e vista **Mappa** (Leaflet). Progetto SerMarkuz Lab.

## Pubblicazione su GitHub Pages

1. Apri **Settings → Pages**.
2. Imposta **Source: Deploy from a branch**.
3. Seleziona branch `main` e cartella `/ (root)`, poi **Save**.
4. Il sito sarà disponibile su `https://sermarkuz.github.io/WebCamITALIA/`.

## Uso

Premi **+ Aggiungi** e incolla il link dello stream: l'app riconosce YouTube, embed Skyline, Windy, iframe generico, flussi `.m3u8` e immagini JPG/PNG/WebP. Puoi assegnare categoria e posizione, visualizzare le webcam sul muro o sulla mappa ed esportare/importare l'elenco in JSON.

Nota: alcuni siti impediscono di essere inseriti in iframe. In quei casi usa, quando disponibile, il link **Embed** ufficiale oppure il pulsante **Apri nella fonte**.

## Struttura

- `index.html` — interfaccia
- `styles.css` — stile
- `app.js` — logica dell'applicazione
- `.nojekyll` — pubblicazione statica diretta con GitHub Pages

## Licenza

MIT — vedi `LICENSE`.
