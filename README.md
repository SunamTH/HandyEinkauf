# 🛒 SmartCart – Intelligente Einkaufslisten-App mit Supermarkt-Laufweg-Optimierung

**Version:** `1.1.1`

**SmartCart** ist eine moderne, vollständig offline-fähige Mobile-App (Android, iOS & Web/PWA) zur Erstellung, Verwaltung und intelligenten Sortierung von Einkaufszetteln. Sie lernt die exakte Laufreihenfolge deiner Supermärkte (z. B. REWE, ALDI, LIDL) inklusive optionaler **Spezifikationen/Marken**, sortiert deine Einkaufslisten automatisch entsprechend deines Weges durch die Gänge und passt sich durch **Live-Optimierung** dynamisch an, wenn Waren im Markt umgeräumt wurden.

---

## 📱 1-Klick Handy-Download (Android `.apk` & iOS/Web)

Du kannst die fertige App direkt auf deinem Smartphone herunterladen (kein Entpacken einer ZIP-Datei nötig):

- 🤖 **Android App (`.apk` Direkt-Download):**  
  👉 **[SmartCart.apk direkt herunterladen](https://github.com/SunamTH/HandyEinkauf/releases/latest/download/SmartCart.apk)**
- 🌐 **Offline HTML-Einzeldatei (Android & iOS):**  
  👉 **[SmartCart_Handy_App.html direkt herunterladen](https://github.com/SunamTH/HandyEinkauf/releases/latest/download/SmartCart_Handy_App.html)**
- 📦 **Alle Versionen & Release-Übersicht:**  
  👉 **[GitHub Releases (Latest)](https://github.com/SunamTH/HandyEinkauf/releases/latest)**

---

## ✨ Hauptfunktionen

1. **Mehrere benannte Einkaufszettel verwalten (Speichern, Wechseln, Neu & Umbenennen)**
   - Direkt oben im Einkaufszettel-Tab befindet sich die **Einkaufszettel-Verwaltung**: Du kannst beliebig viele Einkaufszettel mit eigenem Namen anlegen (z. B. *„Wocheneinkauf“*, *„Grillparty Samstag“*, *„Drogerie & Vorrat“*), jederzeit zwischen gespeicherten Einkaufszetteln wechseln, sie per Klick umbenennen, explizit speichern (`💾 Speichern` zusätzlich zur automatischen Speicherung) oder löschen.
2. **Optionale Spezifikation / Marke für Waren & Supermarkt-Einträge**
   - Sowohl Artikel auf dem Einkaufszettel als auch Einträge in der Supermarkt-Sortierliste unterstützen ein optionales Feld **„Spezifikation / Marke“** (z. B. `Milch` mit Spezifikation `Weihenstephan` oder `Oatly`, bearbeitbar per `✎`).
   - **Mehrfache Einträge pro Warengruppe**: Dieselbe Warengruppe kann im selben Supermarkt mehrfach vorkommen – mit unterschiedlichen Spezifikationen **und/oder** als allgemeine Warengruppe ohne Spezifikation (z. B. `Milch (Oatly)` bei Pflanzendrinks und `Milch` im Kühlregal).
   - **Exakte Matching-Regel mit Fallback**: Eine Einkaufslisten-Ware mit Spezifikation trifft auf einen spezifizierten Supermarkt-Eintrag nur bei **exakter Übereinstimmung der normalisierten Spezifikation** (Unicode NFC, Leerzeichen bereinigt, Groß-/Kleinschreibung ignoriert). Gibt es keinen exakten Treffer, fällt sie automatisch auf den allgemeinen Eintrag **ohne Spezifikation** derselben Warengruppe zurück. Eine unspezifizierte Ware matcht ausschließlich allgemeine Einträge ohne Spezifikation.
   - Bestehende gespeicherte Daten ohne Spezifikation werden beim Laden automatisch und rückwärtskompatibel migriert.
3. **Unbekannte Waren ganz am Anfang & Aufnahme per Long-Press**
   - Waren, die noch nicht in der Sortierliste des ausgewählten Supermarkts vorhanden sind, erscheinen unter den offenen Waren **ganz am Anfang** (vor allen bekannten/sortierten Supermarkt-Waren) mit einer deutlichen Kennzeichnung.
   - **Long-Press zum Hinzufügen**: Durch längeres Drücken (ca. 0,55 s) auf eine noch unbekannte Ware wird sie (inkl. optionaler Spezifikation) direkt in die Sortierliste des aktuellen Supermarkts aufgenommen und der Einkaufszettel sofort neu sortiert. Danach lässt sie sich im Supermarkt-Tab wie gewohnt an ihre exakte Position verschieben.
   - **Sauberes Abhaken**: Werden unbekannte Waren abgehakt, wandern sie regulär in den erledigten Bereich (sortiert nach bekannten Marktpositionen, gefolgt von erledigten unbekannten Waren in Ursprungsreihenfolge) und lösen keine falschen Live-Optimierungs-Rückfragen aus.
4. **Manuelle & echte Foto-basierte Einkaufslisten-Erstellung (Tesseract.js OCR + Bild-Vorverarbeitung)**
   - Schnelles Hinzufügen von Artikeln inklusive Mengenangaben (z. B. `2x Vollmilch`, `500g Mehl`) und optionaler Spezifikation/Marke.
   - **Echter Kamera- & Foto-Scanner mit Tesseract.js**: Fotografiere handgeschriebene oder gedruckte Einkaufszettel direkt mit dem Smartphone (`capture="environment"`). Vor der Texterkennung optimiert eine HTML5-Canvas-Vorverarbeitung (`preprocessImageForOcr`) automatisch Auflösung, Graustufen-Kontrast (Auto-Levels) und Hintergrund-Aufhellung. Anschließend liest **Tesseract.js v5 (`deu`)** den echten Text auf dem Foto aus (ohne jemals falsche Demo-Daten für echte Fotos einzufügen). Zusätzlich stehen **3 integrierte Demo-Einkaufszettel** zum sofortigen Testen bereit.
5. **Individuelle Supermarkt-Konfigurationen (Sortier-Vorlage, Vorige Ware & Drag-and-Drop mit Auto-Scroll)**
   - Vorgefertigte deutsche Standard-Märkte (**REWE**, **ALDI**, **LIDL**) mit realistischer Abteilungs- und Warenreihenfolge (Obst & Gemüse → Backwaren → Kühlregal → Fleisch/Wurst → Trockensortiment → Getränke → Tiefkühl → Haushalt/Drogerie).
   - **Sortierung beim Anlegen wählen**: Beim Erstellen eines neuen Supermarkts kannst du auswählen, ob die **Standard-Sortierung** oder die komplette **Sortierung eines bestehenden Supermarkts** übernommen werden soll (`createSupermarketWithSorting`).
   - **Neues Produkt exakt über die vorige Ware einfügen**: Neue Waren (inkl. optionaler Spezifikation) lassen sich im Supermarkt-Konfigurator über ein Autocomplete-Suchfeld direkt hinter einer bestehenden *vorigen Ware* (oder per Schnellbutton auf Position 1 am Eingang) einfügen (`addSupermarketKnownItemAfter`).
   - **Komfortables Verschieben per Drag & Drop (`☰`) mit automatischem Rand-Scrollen**: Verschiebe Waren im Supermarkt per Finger (Touch inkl. schwebender Vorschau) oder Maus am Zieh-Griff (`☰`). Sobald du eine Ware an den oberen oder unteren Rand des sichtbaren Listenbereichs ziehst, **scrollt die Liste automatisch und flüssig mit** (`requestAnimationFrame`), sodass auch lange Supermarkt-Listen mühelos umsortiert werden können. Zusätzlich stehen **Bearbeiten (`✎`)**, **Gezielt verschieben (`⇄`)** (`moveSupermarketItemAfter`) und Pfeilbuttons (`↑`/`↓`) bereit.
6. **Automatische Reihenfolge-Anpassung bei Marktwechsel**
   - Ein Tipp auf einen anderen Supermarkt sortiert den gesamten Einkaufszettel sofort in Echtzeit nach der Laufreihenfolge des gewählten Marktes um.
7. **Übersichtliches Abhaken & Rückgängig-Funktion (Uncheck)**
   - **Erledigte Waren oben ausgegraut**: Abgehakte Artikel wandern nach oben in den ausgegrauten Bereich *„Bereits abgehakt (Erledigt)“*.
   - **Offene Waren direkt darunter**: Erst eventuelle spät hinzugefügte Prioritäts-Artikel, dann noch unbekannte Waren (per Long-Press aufnehmbar) und direkt danach alle bekannten Artikel in exakter Supermarkt-Laufreihenfolge mit Hervorhebung der nächsten Ware im Gang.
   - **1-Tap Rückgängig**: Ein versehentlich abgehakter Artikel wird durch Antippen wieder aktiviert und **exakt an seiner ursprünglichen, supermarkt-optimierten Position** unter den offenen Waren einsortiert.
8. **Intelligentes nachträgliches Hinzufügen („Bereits vorbeigelaufen“-Erkennung)**
   - Fügst du während des Einkaufs eine bekannte Ware hinzu, an deren Abteilung du im Supermarkt bereits vorbeigelaufen bist (weil du schon Waren abgehakt hast, die im Markt *hinter* dieser neuen Ware liegen), erkennt SmartCart dies automatisch.
   - Die neue Ware wird mit dem Hinweis *„Nachträglich hinzugefügt • Als Nächstes“* **ganz oben als nächste offene Ware** eingereiht, damit du sie nicht vergisst und sofort umkehren bzw. sie als Nächstes greifen kannst.
9. **Selbstlernende Live-Optimierung (Ein-/Ausschaltbar)**
   - Direkt auf dem Einkaufszettel lässt sich der Schalter **„Live-Optimierung“** aktivieren oder deaktivieren.
   - **Wenn aktiviert (EIN)**: Hakst du eine bekannte Ware ab, obwohl laut Supermarkt-Konfiguration noch andere bekannte offene Waren *vor* ihr auf dem Weg gelegen hätten, fragt die App nach:
     > *„Reihenfolge im Supermarkt anpassen? Du hast ‚[Ware]‘ vor ‚[Übersprungene Waren]‘ abgehakt. Soll die Konfiguration für [Supermarkt] automatisch angepasst werden?“*
   - Bei Bestätigung wird die Supermarkt-Konfiguration dauerhaft aktualisiert (unter Erhalt eventueller Spezifikationen).
   - **Wenn deaktiviert (AUS)**: Du kannst Waren in beliebiger Reihenfolge ohne Rückfrage abhaken.
10. **Ausschließlich dateibasierter Export & Import von Einkaufslisten (`.smartcart.json`)**
    - Im Tab **„Export / Import“** werden Einkaufslisten ausschließlich über standardisierte `.smartcart.json`-Dateien ausgetauscht (veraltete Share-Codes oder reine Text-Exporte wurden vollständig entfernt):
      - **Auf Gerät speichern**: Speichert die aktive Einkaufsliste als `.smartcart.json`-Datei auf dem Gerät – in der nativen Android-APK direkt über `@capacitor/filesystem` (Dokumenten-Ordner, mit sauberem Fallback), im Browser/PWA per Datei-Download.
      - **Als Datei teilen (WhatsApp, Mail, Messenger)**: Teilt die `.smartcart.json`-Datei direkt über den nativen Teilen-Dialog des Betriebssystems – in der nativen Android-APK über `@capacitor/filesystem` (`CACHE`) + `@capacitor/share` (`files: [fileUri]`) und im mobilen Browser über die Web Share API Level 2 (`navigator.share({ files })` mit `canShare`-Prüfung und automatischem Datei-Speichern-Fallback).
      - **Aus Datei importieren**: Importiert `.smartcart.json`- oder `.json`-Dateien auf jedem anderen Gerät mit strikter Validierung und wählbarem Modus (*Als neuen Einkaufszettel anlegen*, *In aktuellen Zettel zusammenführen (Merge)* oder *Aktuellen Zettel ersetzen*). Mengen, Spezifikationen und Abhak-Status bleiben vollständig erhalten und die Liste wird sofort für den lokalen Supermarkt sortiert.
    - Vorbereiteter `SyncAdapter`-Layer für lokale Tab-Synchronisation (`BroadcastChannel`) und zukünftige Echtzeit-Synchronisation.

---

## 📱 Installation auf dem Smartphone (3 Wege)

### Weg 1: Sofort-Start als Einzeldatei (Ohne Installation / Offline per WhatsApp, Telegram, AirDrop)
Im Ordner [`dist/SmartCart_Handy_App.html`](file:///home/manus/.gemini/antigravity/scratch/smartcart-app/dist/SmartCart_Handy_App.html) befindet sich eine **eigenständige Single-File-HTML-App**, in der sämtliche Stylesheets, die komplette Core-Engine und das UI eingebettet sind.
1. Sende die Datei `dist/SmartCart_Handy_App.html` per WhatsApp, Telegram, E-Mail, USB-Kabel oder Google Drive an dein Android-Smartphone (oder iPhone).
2. Öffne die Datei im mobilen Browser (Chrome, Firefox, Samsung Internet, Safari).
3. Die App läuft sofort inklusive lokalem Speicher (`localStorage`) und lädt bei bestehender Internetverbindung automatisch Tesseract.js für echte Kamera-OCR nach.

### Weg 2: Installation als Progressive Web App (PWA) auf dem Home-Bildschirm (Android & iOS)
Wenn das Projekt über einen lokalen Webserver oder über **GitHub Pages** (siehe unten) geöffnet wird:
- **Android (Chrome)**: Tippe oben rechts auf das **Drei-Punkte-Menü (⋮)** → **„App installieren“** oder **„Zum Startbildschirm hinzufügen“**. SmartCart erscheint mit eigenem App-Icon im App-Drawer und läuft im Vollbildmodus ohne Adressleiste.
- **iOS / iPhone (Safari)**: Tippe unten auf das **Teilen-Symbol (Quadrat mit Pfeil nach oben)** → **„Zum Home-Bildschirm“**.

### Weg 3: Native Android-APK (via Capacitor / GitHub Actions)
Das Projekt ist vollständig für **Ionic Capacitor 6** (`com.smartcart.einkaufsliste`) inklusive der nativen Plugins **`@capacitor/share`** und **`@capacitor/filesystem`** (für direktes Datei-Teilen via WhatsApp/Mail/Messenger und Datei-Speichern unter Android) konfiguriert:
- **Automatisch über GitHub Actions**: Bei jedem Push auf GitHub baut die Workflow-Pipeline [`.github/workflows/android-and-web.yml`](file:///home/manus/.gemini/antigravity/scratch/smartcart-app/.github/workflows/android-and-web.yml) automatisch eine installierbare `SmartCart.apk`, die unter *Actions → Artifacts* sowie unter *GitHub Releases* heruntergeladen werden kann.
- **Lokal bauen** (mit installiertem Android Studio / Android SDK):
  ```bash
  npm install
  npm run build
  npx cap add android
  npx cap sync android
  cd android && ./gradlew assembleDebug
  ```

---

## 🚀 Schnellstart für Entwickler

### Voraussetzungen
- **Node.js** (ab Version 18+, keine externen Laufzeit-Abhängigkeiten für Core & Tests erforderlich!)

### Befehle

```bash
# 1. Alle Unit-Tests ausführen (Core-Engine 19 Suiten + Datei-Export/-Import 9 Suiten)
npm test
# oder einzeln:
node tests/engine.test.js
node tests/share.test.js

# 2. Eigenständige Single-File-Handy-App (dist/SmartCart_Handy_App.html) neu bauen & dist/ synchronisieren
npm run build
# bzw.: node scripts/bundle-standalone.js

# 3. Lokalen Entwicklungsserver starten (z. B. mit Python oder npx serve)
npx serve .
```

---

## 📂 Projektstruktur

```text
smartcart-app/
├── index.html                        # Haupt-Einstiegspunkt der Web-App / PWA (inkl. Tesseract.js v5 CDN)
├── manifest.json                     # Web App Manifest für Android/iOS Home-Screen Installation
├── sw.js                             # Service Worker für Offline-Caching der PWA (Cache v3)
├── capacitor.config.json             # Capacitor-Konfiguration für native Android/iOS Builds
├── package.json                      # NPM-Skripte und Metadaten (v1.1.1, inkl. @capacitor/share & @capacitor/filesystem)
├── .gitignore                        # Git-Ausschlussregeln
├── .github/
│   └── workflows/
│       └── android-and-web.yml       # CI/CD: Unit-Tests, HTML-Bundle & Android-APK Build
├── src/
│   ├── core/                         # Reine Geschäftslogik (Browser + Node.js kompatibel)
│   │   ├── models.js                 # Domänenmodelle, Spezifikationen, Normalisierung, Matching & Standard-Märkte
│   │   ├── optimizer.js              # Sortier- (inkl. Unbekannte am Anfang), Rückgängig-, Spät-Kauf- & Live-Lern-Engine
│   │   ├── ocr.js                    # Text-Parser, echte Tesseract.js-OCR, Bild-Preprocessing & Demo-Zettel
│   │   ├── storage.js                # Persistenz-Layer (LocalStorageRepository, Multi-Listen & Legacy-Migration)
│   │   └── share.js                  # Dateibasierter Export & Import (.smartcart.json) + BroadcastChannel SyncAdapter
│   └── ui/                           # Mobile Benutzeroberfläche
│       ├── app.js                    # UI-Controller, Spezifikations-Modals, Long-Press, DnD-Auto-Scroll & Datei-I/O
│       └── styles.css                # Mobiles Responsive-Design (Spezifikations-Badges, Long-Press & Drag-Ghost)
├── scripts/
│   └── bundle-standalone.js          # Packt HTML + CSS + Core + UI in eine einzige HTML-Datei
├── dist/
│   └── SmartCart_Handy_App.html      # Fertige 1-Datei-App zum direkten Senden ans Smartphone
├── tests/
│   ├── engine.test.js                # Unit-Tests für Core, Spezifikationen, Unbekannte Waren & Migration (19 Suiten)
│   └── share.test.js                 # Unit-Tests für dateibasierten Export, Share-API & Import-Validierung (9 Suiten)
└── docs/
    └── ARCHITEKTUR_UND_DOKUMENTATION.md # Vollständige Architektur- & Funktionsreferenz
```

---

## 📖 Weiterführende Dokumentation

Die vollständige technische Dokumentation mit Schichtenarchitektur, Mermaid-Diagrammen, detaillierten Algorithmus-Erklärungen sowie einer lückenlosen Referenz **aller Module und Funktionen** befindet sich in:
👉 **[`docs/ARCHITEKTUR_UND_DOKUMENTATION.md`](file:///home/manus/.gemini/antigravity/scratch/smartcart-app/docs/ARCHITEKTUR_UND_DOKUMENTATION.md)**
