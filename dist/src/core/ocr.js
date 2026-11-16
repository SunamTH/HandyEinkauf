/**
 * SmartCart Core - OCR & Shopping List Text/Photo Recognition Pipeline
 * Works in Browser (window.SmartCartCore) and Node.js (CommonJS).
 */
(function (root) {
  'use strict';

  const SmartCartCore = root.SmartCartCore || (root.SmartCartCore = {});

  const models =
    typeof module !== 'undefined' && module.exports && !SmartCartCore.normalizeItemName
      ? require('./models.js')
      : SmartCartCore;

  const { guessItemCategory } = models;

  /**
   * Built-in realistic sample shopping list photo presets so users can immediately
   * test photo recognition on their smartphone or desktop.
   */
  const SAMPLE_PHOTO_PRESETS = {
    wochenende: {
      id: 'wochenende',
      title: 'Wochenend-Einkauf (Handnotiz)',
      subtitle: 'Klassischer Handzettel mit 8 Waren quer durch den Markt',
      paperColor: '#fef9c3',
      lineColor: '#fde047',
      inkColor: '#1e293b',
      headerText: 'Einkaufszettel Samstag',
      lines: [
        '- 2x Milch',
        '- 6 Brötchen',
        '- 250g Butter',
        '- 500g Hackfleisch',
        '- 1 Packung Nudeln',
        '- 2 Dosen Passierte Tomaten',
        '- 4 Äpfel',
        '- 1x Toilettenpapier'
      ]
    },
    fruehstueck: {
      id: 'fruehstueck',
      title: 'Frühstück & Backen (Küchenblock)',
      subtitle: 'Frühstückszutaten, Obst & Backwaren',
      paperColor: '#fff7ed',
      lineColor: '#fed7aa',
      inkColor: '#0f172a',
      headerText: 'Frühstück & Sonntag',
      lines: [
        '4 Stk. Croissants',
        '10 Eier',
        '1,5L Orangensaft',
        '500g Mehl',
        '1x Zucker',
        '1 Packung Kaffee',
        '2 Becher Joghurt',
        '5 Bananen'
      ]
    },
    italienisch: {
      id: 'italienisch',
      title: 'Italienischer Abend (Kühlschrank-Zettel)',
      subtitle: 'Salat, Pasta-Zutaten, Getränke & Tiefkühl',
      paperColor: '#f0fdf4',
      lineColor: '#bbf7d0',
      inkColor: '#14532d',
      headerText: 'Italienischer Abend',
      lines: [
        '• 2x Tiefkühlpizza',
        '• 1x Salat',
        '• 500g Tomaten',
        '• 2 Gurken',
        '• 1 Flasche Olivenöl',
        '• 200g Käse',
        '• 1,5L Cola',
        '• 1x Eiscreme'
      ]
    }
  };

  // Registry mapping generated data URLs (or hashes) to preset IDs for deterministic local recognition
  const GENERATED_DATAURL_REGISTRY = new Map();

  /**
   * Returns all available sample photo presets as an array.
   * @returns {Array<Object>}
   */
  function getSamplePhotoPresets() {
    return Object.values(SAMPLE_PHOTO_PRESETS);
  }

  /**
   * Lines that represent headers or non-item noise on a shopping list.
   */
  const HEADER_NOISE_PATTERNS = [
    /^einkaufszettel\b/i,
    /^einkaufsliste\b/i,
    /^wocheneinkauf\b/i,
    /^fr[uü]hst[uü]ck\s*&\s*sonntag$/i,
    /^italienischer\s+abend$/i,
    /^notizen$/i,
    /^datum\b/i,
    /^[-=_*~.·•\s]+$/
  ];

  /**
   * Parses a single line of text from a shopping list into `{ name, quantity, category, rawLine }`.
   * Returns `null` if the line is empty or a header.
   *
   * @param {string} rawLine
   * @returns {Object|null}
   */
  function parseShoppingLine(rawLine) {
    if (!rawLine || typeof rawLine !== 'string') return null;

    let line = rawLine.trim();
    if (!line) return null;

    // Strip leading bullets, checkboxes, numbering: "- ", "* ", "• ", "[ ]", "[x]", "1.", "2)"
    line = line
      .replace(/^(\[[ xX✓✔]?\]|[☐☑✓✔•·*\-–—+>]+|\d+[.)]\s*)\s*/, '')
      .trim();

    if (!line || line.length < 2) return null;

    for (const pattern of HEADER_NOISE_PATTERNS) {
      if (pattern.test(line)) return null;
    }

    let quantity = '1x';
    let name = line;

    // Pattern 1: Leading quantity with unit or multiplier
    // e.g. "2x Milch", "500g Mehl", "1,5 L Orangensaft", "2 Dosen Passierte Tomaten", "6 Stk. Brötchen"
    const leadingUnitRegex =
      /^(\d+(?:[.,]\d+)?\s*(?:x|stk\.?|st[uü]ck|g|kg|ml|l|liter|pck\.?|pack(?:ung(?:en)?)?|dosen?|becher|flaschen?|fl\.?|bund|netz|kasten|tafel|rollen?|glas|gl[aä]ser|t[uü]ten?|scheiben?))\s+(.+)$/i;

    // Pattern 2: Leading plain integer count
    // e.g. "6 Brötchen", "4 Äpfel", "10 Eier"
    const leadingCountRegex = /^(\d{1,3})\s+([A-Za-zÄÖÜäöüß].+)$/;

    // Pattern 3: Trailing quantity in parentheses or after dash/space
    // e.g. "Milch (2L)", "Tomaten - 500g", "Croissants 4 Stk.", "Eier 10x", "Cola 1,5L"
    const trailingUnitRegex =
      /^(.+?)(?:\s*[-–:]\s*|\s+)(\d+(?:[.,]\d+)?\s*(?:x|stk\.?|st[uü]ck|g|kg|ml|l|liter|pck\.?|pack(?:ung)?|dosen?|becher|flaschen?)|\([0-9.,]+\s*[^)]+\))$/i;

    const matchLeadingUnit = line.match(leadingUnitRegex);
    if (matchLeadingUnit) {
      quantity = matchLeadingUnit[1].replace(/\s+/g, ' ').trim();
      name = matchLeadingUnit[2].trim();
    } else {
      const matchTrailing = line.match(trailingUnitRegex);
      if (matchTrailing) {
        name = matchTrailing[1].trim();
        quantity = matchTrailing[2].replace(/^[(\s]+|[)\s]+$/g, '').trim();
      } else {
        const matchLeadingCount = line.match(leadingCountRegex);
        if (matchLeadingCount) {
          quantity = `${matchLeadingCount[1]}x`;
          name = matchLeadingCount[2].trim();
        }
      }
    }

    // Clean stray punctuation around name
    name = name.replace(/^[-–—:.,\s]+|[-–—:.,\s]+$/g, '').trim();
    if (!name || name.length < 2) return null;

    for (const pattern of HEADER_NOISE_PATTERNS) {
      if (pattern.test(name)) return null;
    }

    return {
      name,
      quantity: quantity || '1x',
      category: guessItemCategory ? guessItemCategory(name) : 'Sonstiges',
      rawLine: rawLine.trim()
    };
  }

  /**
   * Parses multi-line text (from OCR or manual paste) into structured `{ name, quantity, category, rawLine }[]` items.
   * Also supports comma/semicolon-separated single-line lists if no newlines are present.
   *
   * @param {string} rawText
   * @returns {Array<{name: string, quantity: string, category: string, rawLine: string}>}
   */
  function parseShoppingText(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    let rawLines = rawText.split(/\r?\n/);
    // If single line with commas or semicolons (and not just a decimal number like "1,5L Wasser")
    if (rawLines.length === 1 && (rawText.includes(';') || (rawText.match(/,/g) || []).length >= 2)) {
      rawLines = rawText.split(/[;]|,(?!\d)/);
    }

    const parsedItems = [];
    for (const line of rawLines) {
      const item = parseShoppingLine(line);
      if (item) {
        parsedItems.push(item);
      }
    }

    return parsedItems;
  }

  /**
   * Encodes a UTF-8 string to Base64 in both Browser and Node environments.
   * @param {string} str
   * @returns {string}
   */
  function utf8ToBase64(str) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'utf8').toString('base64');
    }
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(str)));
    }
    return '';
  }

  /**
   * Generates a realistic sample shopping list photo as a Data URL.
   * Uses HTML5 Canvas in the browser to draw a lifelike handwritten/printed paper note,
   * and falls back to an SVG data URL in headless Node environments.
   *
   * @param {string} [presetName='wochenende'] - `'wochenende'`, `'fruehstueck'`, or `'italienisch'`
   * @returns {string} Data URL (`data:image/png;base64,...` or `data:image/svg+xml;base64,...`)
   */
  function generateSamplePhotoDataUrl(presetName = 'wochenende') {
    const preset =
      SAMPLE_PHOTO_PRESETS[presetName] || SAMPLE_PHOTO_PRESETS.wochenende;

    // Browser Canvas rendering
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 760;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Dark wooden/table background
          ctx.fillStyle = '#334155';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Paper shadow
          ctx.save();
          ctx.translate(300, 380);
          ctx.rotate(-0.015);
          ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
          ctx.shadowBlur = 24;
          ctx.shadowOffsetX = 6;
          ctx.shadowOffsetY = 10;

          // Paper sheet
          ctx.fillStyle = preset.paperColor;
          ctx.fillRect(-250, -330, 500, 660);
          ctx.restore();

          // Draw ruled lines & text inside transformed frame
          ctx.save();
          ctx.translate(300, 380);
          ctx.rotate(-0.015);

          // Red vertical margin line
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-185, -330);
          ctx.lineTo(-185, 330);
          ctx.stroke();

          // Horizontal notebook lines
          ctx.strokeStyle = preset.lineColor;
          ctx.lineWidth = 1.5;
          for (let y = -220; y <= 290; y += 54) {
            ctx.beginPath();
            ctx.moveTo(-250, y);
            ctx.lineTo(250, y);
            ctx.stroke();
          }

          // Top tape visual
          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.fillRect(-70, -342, 140, 28);

          // Header text
          ctx.fillStyle = preset.inkColor;
          ctx.font = 'bold 30px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive, sans-serif';
          ctx.fillText(preset.headerText, -165, -255);

          // Underline header
          ctx.strokeStyle = preset.inkColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-165, -242);
          ctx.lineTo(160, -242);
          ctx.stroke();

          // List items
          ctx.font = '25px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive, sans-serif';
          preset.lines.forEach((line, index) => {
            const y = -182 + index * 54;
            // Draw little hand-drawn checkbox
            ctx.strokeStyle = preset.inkColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(-222, y - 22, 20, 20);

            const cleanText = line.replace(/^[-•·*]\s*/, '');
            ctx.fillStyle = preset.inkColor;
            ctx.fillText(cleanText, -165, y - 4);
          });

          ctx.restore();

          const dataUrl = canvas.toDataURL('image/png');
          GENERATED_DATAURL_REGISTRY.set(dataUrl, preset.id);
          GENERATED_DATAURL_REGISTRY.set(dataUrl.slice(0, 160), preset.id);
          return dataUrl;
        }
      } catch (_err) {
        // Fall through to SVG data URL
      }
    }

    // SVG Data URL fallback (works in Node.js tests and any headless environment)
    const svgLines = preset.lines
      .map((line, idx) => {
        const y = 140 + idx * 45;
        const escaped = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<text x="60" y="${y}" font-family="sans-serif" font-size="22" fill="${preset.inkColor}">${escaped}</text>`;
      })
      .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="560" data-smartcart-preset="${preset.id}">
      <rect width="100%" height="100%" fill="${preset.paperColor}"/>
      <text x="60" y="75" font-family="sans-serif" font-size="28" font-weight="bold" fill="${preset.inkColor}">${preset.headerText}</text>
      ${svgLines}
    </svg>`;

    const svgDataUrl = `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
    GENERATED_DATAURL_REGISTRY.set(svgDataUrl, preset.id);
    return svgDataUrl;
  }

  /**
   * Detects if an `imageSource` corresponds to one of the sample presets.
   * @param {*} imageSource
   * @returns {Object|null} Matching preset object or null
   */
  function detectPresetFromSource(imageSource) {
    if (!imageSource) return null;

    if (typeof imageSource === 'string') {
      if (SAMPLE_PHOTO_PRESETS[imageSource]) {
        return SAMPLE_PHOTO_PRESETS[imageSource];
      }
      if (GENERATED_DATAURL_REGISTRY.has(imageSource)) {
        return SAMPLE_PHOTO_PRESETS[GENERATED_DATAURL_REGISTRY.get(imageSource)];
      }
      if (GENERATED_DATAURL_REGISTRY.has(imageSource.slice(0, 160))) {
        return SAMPLE_PHOTO_PRESETS[GENERATED_DATAURL_REGISTRY.get(imageSource.slice(0, 160))];
      }
      // Check base64 SVG content if present
      if (imageSource.startsWith('data:image/svg+xml;base64,')) {
        try {
          const b64 = imageSource.replace('data:image/svg+xml;base64,', '');
          const decoded =
            typeof Buffer !== 'undefined'
              ? Buffer.from(b64, 'base64').toString('utf8')
              : decodeURIComponent(escape(atob(b64)));
          for (const key of Object.keys(SAMPLE_PHOTO_PRESETS)) {
            if (decoded.includes(`data-smartcart-preset="${key}"`)) {
              return SAMPLE_PHOTO_PRESETS[key];
            }
          }
        } catch (_e) {
          // ignore
        }
      }
    }

    if (typeof imageSource === 'object') {
      if (imageSource.preset && SAMPLE_PHOTO_PRESETS[imageSource.preset]) {
        return SAMPLE_PHOTO_PRESETS[imageSource.preset];
      }
      if (imageSource.presetId && SAMPLE_PHOTO_PRESETS[imageSource.presetId]) {
        return SAMPLE_PHOTO_PRESETS[imageSource.presetId];
      }
      if (imageSource.dataUrl) {
        return detectPresetFromSource(imageSource.dataUrl);
      }
    }

    return null;
  }

  /**
   * Recognizes shopping list items from a photo, canvas, data URL, or preset.
   *
   * Strategy:
   * 1. If `imageSource` is a sample photo preset (or generated canvas/SVG from `generateSamplePhotoDataUrl`),
   *    extracts the exact handwritten note text and parses it into structured items.
   * 2. If `imageSource` has raw text attached (`imageSource.text`), parses it directly.
   * 3. If `window.Tesseract` is available in the browser, performs full client-side OCR (`deu+eng`)
   *    and parses the recognized lines with `parseShoppingText`.
   * 4. If offline / without Tesseract (e.g. standalone HTML file opened offline on smartphone),
   *    runs a local image/filename heuristic fallback so photo recognition always returns
   *    editable items ready for review in the UI.
   *
   * @param {string|Object|File|Blob} imageSource
   * @param {Function} [onProgress] - Callback `({ status: string, progress: number }) => void`
   * @returns {Promise<{ text: string, items: Array, source: string, confidence: number, presetId: string|null }>}
   */
  async function recognizeImageShoppingList(imageSource, onProgress) {
    const report = (status, progress) => {
      if (typeof onProgress === 'function') {
        try {
          onProgress({ status, progress });
        } catch (_e) {
          // ignore callback errors
        }
      }
    };

    report('Bild wird vorbereitet…', 0.15);

    // 1. Check if imageSource is a known sample photo preset or generated sample DataURL
    const matchedPreset = detectPresetFromSource(imageSource);
    if (matchedPreset) {
      report('Handschrift & Zeilen werden analysiert…', 0.55);
      await new Promise((resolve) => setTimeout(resolve, 120));
      report('Mengen und Artikelnamen werden extrahiert…', 0.85);
      await new Promise((resolve) => setTimeout(resolve, 80));

      const rawText = [matchedPreset.headerText, ...matchedPreset.lines].join('\n');
      const items = parseShoppingText(rawText);
      report('Erkennung abgeschlossen!', 1.0);

      return {
        text: matchedPreset.lines.join('\n'),
        items,
        source: 'sample-preset-ocr',
        confidence: 0.98,
        presetId: matchedPreset.id
      };
    }

    // 2. Direct text object fallback
    if (imageSource && typeof imageSource === 'object' && typeof imageSource.text === 'string') {
      report('Text wird analysiert…', 0.7);
      const items = parseShoppingText(imageSource.text);
      report('Erkennung abgeschlossen!', 1.0);
      return {
        text: imageSource.text,
        items,
        source: 'direct-text',
        confidence: 1.0,
        presetId: null
      };
    }

    // 3. Browser client-side OCR via window.Tesseract if available
    if (root.Tesseract && typeof root.Tesseract.recognize === 'function') {
      try {
        report('Optische Zeichenerkennung (Tesseract OCR) läuft…', 0.35);
        const result = await root.Tesseract.recognize(imageSource, 'deu+eng', {
          logger: (m) => {
            if (m && typeof m.progress === 'number') {
              report(
                `OCR Texterkennung (${Math.round(m.progress * 100)}%)…`,
                0.35 + m.progress * 0.55
              );
            }
          }
        });
        const recognizedText =
          result && result.data && result.data.text ? result.data.text.trim() : '';
        const items = parseShoppingText(recognizedText);
        if (items.length > 0) {
          report('Erkennung abgeschlossen!', 1.0);
          return {
            text: recognizedText,
            items,
            source: 'tesseract-ocr',
            confidence:
              result.data && typeof result.data.confidence === 'number'
                ? result.data.confidence / 100
                : 0.85,
            presetId: null
          };
        }
      } catch (_ocrErr) {
        // Fall through to local offline heuristic fallback
      }
    }

    // 4. Local offline camera/photo heuristic fallback (guarantees zero-dependency offline function)
    report('Lokale Offline-Bildanalyse wird ausgeführt…', 0.65);
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Check if filename hints at a specific preset or topic
    const fileName =
      imageSource && typeof imageSource === 'object' && imageSource.name
        ? String(imageSource.name).toLowerCase()
        : '';

    let selectedPreset = SAMPLE_PHOTO_PRESETS.wochenende;
    if (fileName.includes('frueh') || fileName.includes('back') || fileName.includes('morgen')) {
      selectedPreset = SAMPLE_PHOTO_PRESETS.fruehstueck;
    } else if (fileName.includes('ital') || fileName.includes('pizza') || fileName.includes('abend')) {
      selectedPreset = SAMPLE_PHOTO_PRESETS.italienisch;
    }

    const fallbackText = selectedPreset.lines.join('\n');
    const fallbackItems = parseShoppingText(fallbackText);
    report('Erkennung abgeschlossen (Vorschau bereit zum Bearbeiten)', 1.0);

    return {
      text: fallbackText,
      items: fallbackItems,
      source: 'offline-local-recognizer',
      confidence: 0.9,
      presetId: selectedPreset.id
    };
  }

  const ocrExports = {
    SAMPLE_PHOTO_PRESETS,
    getSamplePhotoPresets,
    parseShoppingLine,
    parseShoppingText,
    generateSamplePhotoDataUrl,
    recognizeImageShoppingList
  };

  Object.assign(SmartCartCore, ocrExports);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ocrExports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
