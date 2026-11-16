#!/usr/bin/env node
/**
 * SmartCart Standalone Bundler (`scripts/bundle-standalone.js`)
 *
 * Bündelt die gesamte SmartCart-App (HTML, CSS, Core-Logik-Module und Mobile-UI)
 * in eine einzige, 100% eigenständige und offline-fähige HTML-Datei:
 * `dist/SmartCart_Handy_App.html`
 *
 * Diese Einzeldatei kann direkt per WhatsApp, Telegram, AirDrop oder E-Mail
 * ans Smartphone gesendet und dort ohne Webserver im Browser geöffnet werden.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OUTPUT_FILE = path.join(DIST_DIR, 'SmartCart_Handy_App.html');

const CORE_SCRIPTS = [
  'src/core/models.js',
  'src/core/optimizer.js',
  'src/core/ocr.js',
  'src/core/storage.js',
  'src/core/share.js',
  'src/ui/app.js'
];

/**
 * Liest eine Projektdatei als UTF-8-String relativ zum Projekt-Wurzelverzeichnis.
 * @param {string} relativePath - Relativer Pfad zur Datei (z. B. 'src/ui/styles.css')
 * @returns {string} Dateiinhalt als UTF-8 Text
 */
function readAssetFile(relativePath) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Benötigte Datei für das Standalone-Bundle fehlt: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

/**
 * Ersetzt externe CSS- und JS-Referenzen in der `index.html` durch eingebettete
 * `<style>`- und `<script>`-Blöcke und entfernt die externe `manifest.json`-Verknüpfung
 * zugunsten einer eingebetteten Data-URI, damit die Datei komplett offline und lokal (`file://`) läuft.
 *
 * @param {string} htmlTemplate - Inhalt von `index.html`
 * @param {string} cssContent - Inhalt von `src/ui/styles.css`
 * @param {Array<{path: string, code: string}>} scriptBundles - Geordnete Liste der JS-Module
 * @returns {string} Vollständig eingebettetes Standalone-HTML-Dokument
 */
function inlineStylesAndScripts(htmlTemplate, cssContent, scriptBundles) {
  let outputHtml = htmlTemplate;

  // 1. Manifest als Data-URI einbetten, falls manifest.json existiert
  try {
    const manifestRaw = readAssetFile('manifest.json');
    const manifestBase64 = Buffer.from(manifestRaw, 'utf8').toString('base64');
    outputHtml = outputHtml.replace(
      /<link\s+rel="manifest"\s+href="\.\/manifest\.json"\s*\/?>/i,
      `<link rel="manifest" href="data:application/manifest+json;base64,${manifestBase64}" />`
    );
  } catch (_) {
    // Ignorieren, falls kein Manifest vorhanden
  }

  // 2. Stylesheet inline einbetten
  const styleBlock = `<style>\n/* === SmartCart Inlined Styles (src/ui/styles.css) === */\n${cssContent}\n</style>`;
  outputHtml = outputHtml.replace(
    /<link\s+rel="stylesheet"\s+href="\.\/src\/ui\/styles\.css"\s*\/?>/i,
    () => styleBlock
  );

  // 3. Einzelne Script-Tags entfernen und durch den kombinierten Inline-Script-Block ersetzen
  outputHtml = outputHtml.replace(
    /\s*<script\s+src="\.\/src\/(?:core|ui)\/[^"]+\.js"><\/script>/gi,
    ''
  );

  const combinedJs = scriptBundles
    .map(
      (bundle) =>
        `/* ==========================================================================\n` +
        ` * Modul: ${bundle.path}\n` +
        ` * ========================================================================== */\n` +
        bundle.code
    )
    .join('\n\n');

  const safeInlineScript = `<script>\nwindow.__SMARTCART_STANDALONE__ = true;\n${combinedJs.replace(
    /<\/script>/gi,
    '<\\/script>'
  )}\n</script>`;

  outputHtml = outputHtml.replace(/<\/body>/i, () => `${safeInlineScript}\n</body>`);
  return outputHtml;
}

/**
 * Erzeugt die fertige Einzeldatei `dist/SmartCart_Handy_App.html` und gibt Metadaten zurück.
 * @returns {{ outputPath: string, sizeBytes: number, moduleCount: number }}
 */
function buildStandaloneApp() {
  const htmlTemplate = readAssetFile('index.html');
  const cssContent = readAssetFile('src/ui/styles.css');

  const scriptBundles = CORE_SCRIPTS.map((relPath) => ({
    path: relPath,
    code: readAssetFile(relPath)
  }));

  const finalHtml = inlineStylesAndScripts(htmlTemplate, cssContent, scriptBundles);

  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, finalHtml, 'utf8');
  const stats = fs.statSync(OUTPUT_FILE);

  return {
    outputPath: OUTPUT_FILE,
    sizeBytes: stats.size,
    moduleCount: scriptBundles.length
  };
}

if (require.main === module) {
  try {
    const result = buildStandaloneApp();
    const kb = (result.sizeBytes / 1024).toFixed(1);
    console.log(
      `[SmartCart Bundler] Erfolgreich erstellt: ${result.outputPath} (${kb} KB, ${result.moduleCount} Module eingebettet)`
    );
  } catch (err) {
    console.error('[SmartCart Bundler] Fehler:', err.message);
    process.exit(1);
  }
}

module.exports = {
  readAssetFile,
  inlineStylesAndScripts,
  buildStandaloneApp
};
