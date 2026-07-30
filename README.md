# Inventura Storyous – mobilní PWA

První funkční verze aplikace pro mobilní inventuru.

## Co umí

- import skladových karet z CSV,
- filtrace podle skladu a kategorie,
- vyhledávání podle názvu nebo kódu,
- ruční zadávání skutečného množství,
- hlasové zadání v Chrome na Androidu,
- průběžné ukládání do telefonu,
- export výsledku do CSV,
- export a import kompletní zálohy JSON,
- po prvním načtení funguje i bez internetu.

## Spuštění na počítači

V adresáři aplikace spusťte:

```bash
python3 -m http.server 8080
```

Potom otevřete:

```text
http://localhost:8080
```

## Spuštění na telefonu ve stejné Wi‑Fi

1. Na počítači zjistěte lokální IP adresu, například `192.168.1.25`.
2. Spusťte server:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

3. V telefonu otevřete:

```text
http://192.168.1.25:8080
```

4. V Chrome zvolte **Přidat na plochu**.

Pro trvalé používání je vhodné aplikaci nasadit na HTTPS hosting, například GitHub Pages, Netlify nebo vlastní server.

## Formát importního CSV

Použijte středník nebo čárku jako oddělovač.

Povinné sloupce:

- `nazev`
- `jednotka`

Volitelné sloupce:

- `kod`
- `sklad`
- `kategorie`
- `poradi`

Příklad:

```csv
kod;nazev;jednotka;sklad;kategorie;poradi
PU05;Pilsner Urquell 0,5 l;ks;BAR;Lahvové pivo;10
HRAN;Hranolky 9x9;kg;GRILL;Mražené;20
```

## Hlasové zadávání

Funguje přes prohlížeč Chrome na Androidu. Příklad:

- „Plzeň čtrnáct kusů“
- „Hranolky šestnáct celá pět kila“

Aplikace nabídne nejpravděpodobnější skladovou kartu a před uložením vyžaduje potvrzení.

## Důležité omezení první verze

Tato verze zatím neposílá data přímo do Storyous. Výsledkem je CSV, které lze dál upravit nebo použít jako podklad pro zápis. Přímé napojení bude vyžadovat ověření možností API Storyous nebo automatizaci webové administrace.
