# 🛒 SmartCart – Intelligente Einkaufslisten-App mit Supermarkt-Laufweg-Optimierung

**SmartCart** ist eine moderne, vollständig offline-fähige Mobile-App (Android, iOS & Web/PWA) zur Erstellung und intelligenten Sortierung von Einkaufszetteln. Sie lernt die exakte Laufreihenfolge deiner Supermärkte (z. B. REWE, ALDI, LIDL), sortiert deine Einkaufsliste automatisch entsprechend deines Weges durch die Gänge und passt sich durch **Live-Optimierung** dynamisch an, wenn Waren im Markt umgeräumt wurden.

---

## ✨ Hauptfunktionen

1. **Manuelle & Foto-basierte Einkaufslisten-Erstellung (OCR)**
   - Schnelles Hinzufügen von Artikeln inklusive Mengenangaben (z. B. `2x Vollmilch`, `500g Mehl`).
   - **Kamera- & Foto-Scanner**: Fotografiere handgeschriebene oder gedruckte Einkaufszettel direkt mit dem Smartphone (`capture="environment"`). Inklusive lokaler OCR-Pipeline (Tesseract.js-Anbindung + Offline-Canvas-Heuristik) und **3 integrierten Demo-Einkaufszetteln** zum sofortigen Ausprobieren.
2. **Individuelle Supermarkt-Konfigurationen**
   - Vorgefertigte deutsche Standard-Märkte (**REWE**, **ALDI**, **LIDL**) mit realistischer Abteilungs- und Warenreihenfolge (Obst & Gemüse → Backwaren → Kühlregal → Fleisch/Wurst → Trockensortiment → Getränke → Tiefkühl → Haushalt/Drogerie).
   - Beliebig viele eigene Märkte anlegen, umbenennen, Farben/Icons vergeben und die Warenreihenfolge (`itemOrder`) per Drag/Buttons individuell anpassen.
3. **Automatische Reihenfolge-Anpassung bei Marktwechsel**
   - Ein Tipp auf einen anderen Supermarkt sortiert den gesamten Einkaufszettel sofort in Echtzeit nach der Laufreihenfolge des gewählten Marktes um.
4. **Übersichtliches Abhaken & Rückgängig-Funktion (Uncheck)**
   - **Erledigte Waren oben ausgegraut**: Abgehakte Artikel wandern nach oben in den ausgegrauten Bereich *„Bereits abgehakt (Erledigt)“*.
   - **Offene Waren direkt darunter in Laufreihenfolge**: Alle noch zu kaufenden Artikel stehen kompakt und übersichtlich direkt darunter – mit Hervorhebung der nächsten Ware im Gang.
   - **1-Tap Rückgängig**: Ein versehentlich abgehakter Artikel wird durch Antippen wieder aktiviert und **exakt an seiner ursprünglichen, supermarkt-optimierten Position** unter den offenen Waren einsortiert.
5. **Intelligentes nachträgliches Hinzufügen („Bereits vorbeigelaufen“-Erkennung)**
   - Fügst du während des Einkaufs eine Ware hinzu, an deren Abteilung du im Supermarkt bereits vorbeigelaufen bist (weil du schon Waren abgehakt hast, die im Markt *hinter* dieser neuen Ware liegen), erkennt SmartCart dies automatisch.
   - Die neue Ware wird mit dem Hinweis *„Nachträglich hinzugefügt • Als Nächstes“* **ganz oben als nächste offene Ware** eingereiht, damit du sie nicht vergisst und sofort umkehren bzw. sie als Nächstes greifen kannst.
6. **Selbstlernende Live-Optimierung (Ein-/Ausschaltbar)**
   - Direkt auf dem Einkaufszettel lässt sich der Schalter **„Live-Optimierung“** aktivieren oder deaktivieren.
   - **Wenn aktiviert (EIN)**: Hakst du eine Ware ab, obwohl laut Supermarkt-Konfiguration noch andere offene Waren *vor* ihr auf dem Weg gelegen hätten, fragt die App nach:
     > *„Reihenfolge im Supermarkt anpassen? Du hast ‚[Ware]‘ vor ‚[Übersprungene Waren]‘ abgehakt. Soll die Konfiguration für [Supermarkt] automatisch angepasst werden?“*
   - Bei Bestätigung wird die Supermarkt-Konfiguration dauerhaft aktualisiert.
   - **Wenn deaktiviert (AUS)**: Du kannst Waren in beliebiger Reihenfolge ohne Rückfrage abhaken.
7. **Teilen & Zukunftssichere Sync-Architektur**
   - Export und Import von Einkaufslisten und Supermarkt-Konfigurationen per **Web Share API** (WhatsApp, Telegram, Signal, E-Mail), **Base64-Share-Code** oder JSON-Datei.
   - Vorbereiteter `SyncAdapter`-Layer für zukünftige Echtzeit-Synchronisation (Multi-User-Haushaltslisten).

---

## 📱 Installation auf dem Smartphone (3 Wege)

### Weg 1: Sofort-Start als Einzeldatei (Ohne Installation / Offline per WhatsApp, Telegram, AirDrop)
Im Ordner [`dist/SmartCart_Handy_App.html`](file:///home/manus/.gemini/antigravity/scratch/smartcart-app/dist/SmartCart_Handy_App.html) befindet sich eine **100 % eigenständige Single-File-HTML-App**, in der sämtliche Stylesheets, die komplette Core-Engine und das UI eingebettet sind.
1. Sende die Datei `dist/SmartCart_Handy_App.html` per WhatsApp, Telegram, E-Mail, USB-Kabel oder Google Drive an dein Android-Smartphone (oder iPhone).
2. Öffne die Datei im mobilen Browser (Chrome, Firefox, Samsung Internet, Safari).
3. Die App läuft sofort komplett offline inklusive lokalem Speicher (`localStorage`).

### Weg 2: Installation als Progressive Web App (PWA) auf dem Home-Bildschirm (Android & iOS)
Wenn das Projekt über einen lokalen Webserver oder über **GitHub Pages** (siehe unten) geöffnet wird:
- **Android (Chrome)**: Tippe oben rechts auf das **Drei-Punkte-Menü (⋮)** → **„App installieren“** oder **„Zum Startbildschirm hinzufügen“**. SmartCart erscheint mit eigenem App-Icon im App-Drawer und läuft im Vollbildmodus ohne Adressleiste.
- **iOS / iPhone (Safari)**: Tippe unten auf das **Teilen-Symbol (Quadrat mit Pfeil nach oben)** → **„Zum Home-Bildschirm“**.

### Weg 3: Native Android-APK (via Capacitor / GitHub Actions)
Das Projekt ist vollständig für **Ionic Capacitor** (`com.smartcart.einkaufsliste`) konfiguriert:
- **Automatisch über GitHub Actions**: Bei jedem Push auf GitHub baut die Workflow-Pipeline [`.github/workflows/android-and-web.yml`](file:///home/manus/.gemini/antigravity/scratch/smartcart-app/.github/workflows/android-and-web.yml) automatisch eine installierbare `app-debug.apk`, die unter *Actions → Artifacts* heruntergeladen werden kann.
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
# 1. Unit-Tests der Core-Engine ausführen (100% Zero-Dependency Node Test Runner)
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
├── index.html                        # Haupt-Einstiegspunkt der Web-App / PWA
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
│   │   ├── models.js                 # Datenmodelle, Normalisierung & Standard-Supermärkte
│   │   ├── optimizer.js              # Sortier-, Rückgängig-, Spät-Kauf- & Live-Lern-Algorithmen
│   │   ├── ocr.js                    # Text-Parser, Foto-OCR-Pipeline & Canvas-Demo-Zettel
│   │   ├── storage.js                # Persistenz-Layer (LocalStorageRepository)
│   │   └── share.js                  # Export/Import, Share-Codes, Web Share & SyncAdapter
│   └── ui/                           # Mobile Benutzeroberfläche
│       ├── app.js                    # UI-Controller, State-Management, Event-Handler & Modals
│       └── styles.css                # Mobiles Responsive-Design (Android Material / iOS Look)
├── scripts/
│   └── bundle-standalone.js          # Packt HTML + CSS + Core + UI in eine einzige HTML-Datei
├── dist/
│   └── SmartCart_Handy_App.html      # Fertige 1-Datei-App zum direkten Senden ans Smartphone
├── tests/
│   └── engine.test.js                # Umfassende Unit-Tests aller Kernanforderungen
└── docs/
    └── ARCHITEKTUR_UND_DOKUMENTATION.md # Vollständige Architektur- & Funktionsreferenz
```

---

## 📖 Weiterführende Dokumentation

Die vollständige technische Dokumentation mit Schichtenarchitektur, Mermaid-Diagrammen, detaillierten Algorithmus-Erklärungen sowie einer lückenlosen Referenz **aller Module und Funktionen** befindet sich in:
👉 **[`docs/ARCHITEKTUR_UND_DOKUMENTATION.md`](file:///home/manus/.gemini/antigravity/scratch/smartcart-app/docs/ARCHITEKTUR_UND_DOKUMENTATION.md)**
