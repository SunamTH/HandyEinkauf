# 🛒 SmartCart – Intelligente Einkaufslisten-App mit Supermarkt-Laufweg-Optimierung

**SmartCart** ist eine moderne, vollständig offline-fähige Mobile-App (Android, iOS & Web/PWA) zur Erstellung, Verwaltung und intelligenten Sortierung von Einkaufszetteln. Sie lernt die exakte Laufreihenfolge deiner Supermärkte (z. B. REWE, ALDI, LIDL), sortiert deine Einkaufslisten automatisch entsprechend deines Weges durch die Gänge und passt sich durch **Live-Optimierung** dynamisch an, wenn Waren im Markt umgeräumt wurden.

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
2. **Manuelle & echte Foto-basierte Einkaufslisten-Erstellung (Tesseract.js OCR + Bild-Vorverarbeitung)**
   - Schnelles Hinzufügen von Artikeln inklusive Mengenangaben (z. B. `2x Vollmilch`, `500g Mehl`).
   - **Echter Kamera- & Foto-Scanner mit Tesseract.js**: Fotografiere handgeschriebene oder gedruckte Einkaufszettel direkt mit dem Smartphone (`capture="environment"`). Vor der Texterkennung optimiert eine HTML5-Canvas-Vorverarbeitung (`preprocessImageForOcr`) automatisch Auflösung, Graustufen-Kontrast (Auto-Levels) und Hintergrund-Aufhellung. Anschließend liest **Tesseract.js v5 (`deu`)** den echten Text auf dem Foto aus (ohne jemals falsche Demo-Daten für echte Fotos einzufügen). Zusätzlich stehen **3 integrierte Demo-Einkaufszettel** zum sofortigen Testen bereit.
3. **Individuelle Supermarkt-Konfigurationen (Sortier-Vorlage wählen, Vorige Ware & Drag-and-Drop)**
   - Vorgefertigte deutsche Standard-Märkte (**REWE**, **ALDI**, **LIDL**) mit realistischer Abteilungs- und Warenreihenfolge (Obst & Gemüse → Backwaren → Kühlregal → Fleisch/Wurst → Trockensortiment → Getränke → Tiefkühl → Haushalt/Drogerie).
   - **Sortierung beim Anlegen wählen**: Beim Erstellen eines neuen Supermarkts kannst du auswählen, ob die **Standard-Sortierung** oder die komplette **Sortierung eines bestehenden Supermarkts** übernommen werden soll (`createSupermarketWithSorting`).
   - **Neues Produkt exakt über die vorige Ware einfügen**: Neue Waren lassen sich im Supermarkt-Konfigurator über ein Autocomplete-Suchfeld direkt hinter einer bestehenden *vorigen Ware* (oder per Schnellbutton auf Position 1 am Eingang) einfügen (`addSupermarketKnownItemAfter`).
   - **Komfortables Verschieben per Drag & Drop (`☰`), Direkt-Verschieben (`⇄`) & Pfeiltasten (`↑`/`↓`)**: Verschiebe Waren im Supermarkt per Finger/Maus am Zieh-Griff (`☰`), über den Dialog **„Gezielt verschieben (`⇄`)“** direkt hinter eine beliebige andere Ware (`moveSupermarketItemAfter`) oder schrittweise per Pfeilbuttons (`↑`/`↓`).
4. **Automatische Reihenfolge-Anpassung bei Marktwechsel**
   - Ein Tipp auf einen anderen Supermarkt sortiert den gesamten Einkaufszettel sofort in Echtzeit nach der Laufreihenfolge des gewählten Marktes um.
5. **Übersichtliches Abhaken & Rückgängig-Funktion (Uncheck)**
   - **Erledigte Waren oben ausgegraut**: Abgehakte Artikel wandern nach oben in den ausgegrauten Bereich *„Bereits abgehakt (Erledigt)“*.
   - **Offene Waren direkt darunter in Laufreihenfolge**: Alle noch zu kaufenden Artikel stehen kompakt und übersichtlich direkt darunter – mit Hervorhebung der nächsten Ware im Gang.
   - **1-Tap Rückgängig**: Ein versehentlich abgehakter Artikel wird durch Antippen wieder aktiviert und **exakt an seiner ursprünglichen, supermarkt-optimierten Position** unter den offenen Waren einsortiert.
6. **Intelligentes nachträgliches Hinzufügen („Bereits vorbeigelaufen“-Erkennung)**
   - Fügst du während des Einkaufs eine Ware hinzu, an deren Abteilung du im Supermarkt bereits vorbeigelaufen bist (weil du schon Waren abgehakt hast, die im Markt *hinter* dieser neuen Ware liegen), erkennt SmartCart dies automatisch.
   - Die neue Ware wird mit dem Hinweis *„Nachträglich hinzugefügt • Als Nächstes“* **ganz oben als nächste offene Ware** eingereiht, damit du sie nicht vergisst und sofort umkehren bzw. sie als Nächstes greifen kannst.
7. **Selbstlernende Live-Optimierung (Ein-/Ausschaltbar)**
   - Direkt auf dem Einkaufszettel lässt sich der Schalter **„Live-Optimierung“** aktivieren oder deaktivieren.
   - **Wenn aktiviert (EIN)**: Hakst du eine Ware ab, obwohl laut Supermarkt-Konfiguration noch andere offene Waren *vor* ihr auf dem Weg gelegen hätten, fragt die App nach:
     > *„Reihenfolge im Supermarkt anpassen? Du hast ‚[Ware]‘ vor ‚[Übersprungene Waren]‘ abgehakt. Soll die Konfiguration für [Supermarkt] automatisch angepasst werden?“*
   - Bei Bestätigung wird die Supermarkt-Konfiguration dauerhaft aktualisiert.
   - **Wenn deaktiviert (AUS)**: Du kannst Waren in beliebiger Reihenfolge ohne Rückfrage abhaken.
8. **Teilen & Zukunftssichere Sync-Architektur**
   - Export und Import von Einkaufslisten und Supermarkt-Konfigurationen per **Web Share API** (WhatsApp, Telegram, Signal, E-Mail), **Base64-Share-Code** oder JSON-Datei.
   - Vorbereiteter `SyncAdapter`-Layer für zukünftige Echtzeit-Synchronisation (Multi-User-Haushaltslisten).

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
Das Projekt ist vollständig für **Ionic Capacitor** (`com.smartcart.einkaufsliste`) konfiguriert:
- **Automatisch über GitHub Actions**: Bei jedem Push auf GitHub baut die Workflow-Pipeline [`.github/workflows/android-and-web.yml`](file:///home/manus/.gemini/antigravity/scratch/smartcart-app/.github/workflows/android-and-web.yml) automatisch eine installierbare `SmartCart.apk`, die unter *Actions → Artifacts* sowie unter *GitHub Releases* heruntergeladen werden kann.
- **Lokal bauen** (mit installiertem Android Studio / Android SDK):
  ```bash
  npm install
  npm run build:standalone
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
# 1. Unit-Tests der Core-Engine ausführen (100% Zero-Dependency Node Test Runner, 14 Test-Suiten)
node tests/engine.test.js

# 2. Eigenständige Single-File-Handy-App (dist/SmartCart_Handy_App.html) neu bauen
node scripts/bundle-standalone.js

# 3. Lokalen Entwicklungsserver starten (z. B. mit Python oder npx serve)
npx serve .
```

---

## 📂 Projektstruktur

```text
smartcart-app/
├── index.html                        # Haupt-Einstiegspunkt der Web-App / PWA (inkl. Tesseract.js v5 CDN)
├── manifest.json                     # Web App Manifest für Android/iOS Home-Screen Installation
├── sw.js                             # Service Worker für Offline-Caching der PWA
├── capacitor.config.json             # Capacitor-Konfiguration für native Android/iOS Builds
├── package.json                      # NPM-Skripte und Metadaten
├── .gitignore                        # Git-Ausschlussregeln
├── .github/
│   └── workflows/
│       └── android-and-web.yml       # CI/CD: Unit-Tests, HTML-Bundle & Android-APK Build
├── src/
│   ├── core/                         # Reine Geschäftslogik (Browser + Node.js kompatibel)
│   │   ├── models.js                 # Datenmodelle, Normalisierung, Sortier-Vorlagen & Standard-Supermärkte
│   │   ├── optimizer.js              # Sortier-, Rückgängig-, Spät-Kauf-, Vorige-Ware- & Live-Lern-Algorithmen
│   │   ├── ocr.js                    # Text-Parser, echte Tesseract.js-OCR, Bild-Preprocessing & Demo-Zettel
│   │   ├── storage.js                # Persistenz-Layer (LocalStorageRepository mit Multi-Listen-Verwaltung)
│   │   └── share.js                  # Export/Import, Share-Codes, Web Share & SyncAdapter
│   └── ui/                           # Mobile Benutzeroberfläche
│       ├── app.js                    # UI-Controller, Multi-Listen-Bar, Drag & Drop, OCR & Modals
│       └── styles.css                # Mobiles Responsive-Design (Android Material / iOS Look)
├── scripts/
│   └── bundle-standalone.js          # Packt HTML + CSS + Core + UI in eine einzige HTML-Datei
├── dist/
│   └── SmartCart_Handy_App.html      # Fertige 1-Datei-App zum direkten Senden ans Smartphone
├── tests/
│   └── engine.test.js                # Umfassende Unit-Tests aller Kernanforderungen (14 Suiten)
└── docs/
    └── ARCHITEKTUR_UND_DOKUMENTATION.md # Vollständige Architektur- & Funktionsreferenz
```

---

## 📖 Weiterführende Dokumentation

Die vollständige technische Dokumentation mit Schichtenarchitektur, Mermaid-Diagrammen, detaillierten Algorithmus-Erklärungen sowie einer lückenlosen Referenz **aller Module und Funktionen** befindet sich in:
👉 **[`docs/ARCHITEKTUR_UND_DOKUMENTATION.md`](file:///home/manus/.gemini/antigravity/scratch/smartcart-app/docs/ARCHITEKTUR_UND_DOKUMENTATION.md)**
