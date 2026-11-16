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

  // Registry mapping generated sample data URLs to preset IDs & Set of generated sample DataURLs
  const GENERATED_DATAURL_REGISTRY = new Map();
  const GENERATED_SAMPLE_DATA_URLS = new Set();

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
          GENERATED_SAMPLE_DATA_URLS.add(dataUrl);
          GENERATED_DATAURL_REGISTRY.set(dataUrl, preset.id);
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
    GENERATED_SAMPLE_DATA_URLS.add(svgDataUrl);
    GENERATED_DATAURL_REGISTRY.set(svgDataUrl, preset.id);
    return svgDataUrl;
  }

  /**
   * Detects if an `imageSource` explicitly corresponds to one of the sample presets
   * (either a preset key `'wochenende'`, `'fruehstueck'`, `'italienisch'` or a Data URL
   * generated by `generateSamplePhotoDataUrl`). Never matches arbitrary user photos!
   *
   * @param {*} imageSource
   * @returns {Object|null} Matching preset object or null
   */
  function detectPresetFromSource(imageSource) {
    if (!imageSource) return null;

    if (typeof imageSource === 'string') {
      if (Object.prototype.hasOwnProperty.call(SAMPLE_PHOTO_PRESETS, imageSource)) {
        return SAMPLE_PHOTO_PRESETS[imageSource];
      }
      if (GENERATED_SAMPLE_DATA_URLS.has(imageSource) || GENERATED_DATAURL_REGISTRY.has(imageSource)) {
        const presetId = GENERATED_DATAURL_REGISTRY.get(imageSource);
        return (presetId && SAMPLE_PHOTO_PRESETS[presetId]) || null;
      }
      // Check base64 SVG content if explicitly tagged with data-smartcart-preset
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
      return null;
    }

    if (typeof imageSource === 'object') {
      if (
        imageSource.preset &&
        Object.prototype.hasOwnProperty.call(SAMPLE_PHOTO_PRESETS, imageSource.preset)
      ) {
        return SAMPLE_PHOTO_PRESETS[imageSource.preset];
      }
      if (
        imageSource.presetId &&
        Object.prototype.hasOwnProperty.call(SAMPLE_PHOTO_PRESETS, imageSource.presetId)
      ) {
        return SAMPLE_PHOTO_PRESETS[imageSource.presetId];
      }
      if (typeof imageSource.dataUrl === 'string') {
        return detectPresetFromSource(imageSource.dataUrl);
      }
    }

    return null;
  }

  const TESSERACT_CDN_URLS = [
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js'
  ];

  let tesseractLoadPromise = null;

  /**
   * Ensures `window.Tesseract` is loaded in the browser. If not yet loaded, dynamically
   * injects the Tesseract.js v5 script from jsDelivr (with fallback to unpkg).
   *
   * @param {Function} [onProgress]
   * @returns {Promise<Object|null>} Resolves with the `Tesseract` object or `null` if unavailable
   */
  async function ensureTesseractLoaded(onProgress) {
    if (root.Tesseract && typeof root.Tesseract.recognize === 'function') {
      return root.Tesseract;
    }
    if (
      typeof window !== 'undefined' &&
      window.Tesseract &&
      typeof window.Tesseract.recognize === 'function'
    ) {
      return window.Tesseract;
    }

    // In Node.js or non-DOM environments without a mocked global Tesseract, do not attempt DOM script injection
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof document.createElement !== 'function'
    ) {
      return null;
    }

    if (typeof onProgress === 'function') {
      try {
        onProgress({
          status: 'Tesseract OCR-Engine wird geladen…',
          progress: 0.1
        });
      } catch (_e) {
        // ignore
      }
    }

    // If an existing script tag for tesseract is already present and loading, wait briefly for it
    const existingScript =
      typeof document.querySelector === 'function'
        ? document.querySelector('script[src*="tesseract"]')
        : null;
    if (existingScript && !window.Tesseract) {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 150));
        if (window.Tesseract && typeof window.Tesseract.recognize === 'function') {
          return window.Tesseract;
        }
      }
    }

    if (tesseractLoadPromise) {
      return tesseractLoadPromise;
    }

    const injectScript = (url, timeoutMs = 12000) =>
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;

        const timer = setTimeout(() => {
          reject(new Error(`Timeout beim Laden von ${url}`));
        }, timeoutMs);

        script.onload = () => {
          clearTimeout(timer);
          if (window.Tesseract && typeof window.Tesseract.recognize === 'function') {
            resolve(window.Tesseract);
          } else {
            reject(new Error('Tesseract-Objekt nach Script-Load nicht gefunden'));
          }
        };

        script.onerror = () => {
          clearTimeout(timer);
          reject(new Error(`Netzwerkfehler beim Laden von ${url}`));
        };

        (document.head || document.body || document.documentElement).appendChild(script);
      });

    tesseractLoadPromise = (async () => {
      for (const url of TESSERACT_CDN_URLS) {
        try {
          const loaded = await injectScript(url);
          if (loaded) return loaded;
        } catch (_err) {
          // Try next CDN URL
        }
      }
      tesseractLoadPromise = null;
      return window.Tesseract && typeof window.Tesseract.recognize === 'function'
        ? window.Tesseract
        : null;
    })();

    return tesseractLoadPromise;
  }

  /**
   * Preprocesses an image in the browser using an HTML5 Canvas to drastically improve
   * Tesseract.js OCR accuracy on camera photos of handwritten or printed shopping lists:
   * - Scales down oversized photos (max dimension 1800px) while preserving aspect ratio
   * - Upscales small images (< 600px) so character glyphs have sufficient pixel resolution
   * - Applies auto-levels contrast stretching (5th to 95th percentile luminance) and
   *   high-contrast grayscale conversion so dark ink stands out crisply against white paper.
   *
   * @param {*} imageSource - DataURL, File, Blob, HTMLImageElement, HTMLCanvasElement, or wrapper object
   * @returns {Promise<string|*>} Processed PNG DataURL (or original `imageSource` in Node/fallback)
   */
  async function preprocessImageForOcr(imageSource) {
    if (!imageSource) return imageSource;

    const rawSource =
      typeof imageSource === 'object' && imageSource !== null && imageSource.dataUrl
        ? imageSource.dataUrl
        : typeof imageSource === 'object' && imageSource !== null && imageSource.file
        ? imageSource.file
        : imageSource;

    // In Node or environments without HTML5 Canvas + Image, return rawSource directly
    if (
      typeof document === 'undefined' ||
      typeof document.createElement !== 'function' ||
      typeof Image === 'undefined'
    ) {
      return rawSource;
    }

    try {
      let objectUrlToRevoke = null;
      let imgSrc = null;

      if (typeof rawSource === 'string') {
        imgSrc = rawSource;
      } else if (
        typeof Blob !== 'undefined' &&
        rawSource instanceof Blob &&
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
      ) {
        objectUrlToRevoke = URL.createObjectURL(rawSource);
        imgSrc = objectUrlToRevoke;
      } else if (
        typeof HTMLCanvasElement !== 'undefined' &&
        rawSource instanceof HTMLCanvasElement
      ) {
        return rawSource.toDataURL('image/png');
      } else {
        return rawSource;
      }

      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        const timeout = setTimeout(() => reject(new Error('Image load timeout')), 6000);
        image.onload = () => {
          clearTimeout(timeout);
          resolve(image);
        };
        image.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };
        image.src = imgSrc;
      });

      if (objectUrlToRevoke && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(objectUrlToRevoke);
      }

      const naturalW = img.naturalWidth || img.width || 0;
      const naturalH = img.naturalHeight || img.height || 0;
      if (!naturalW || !naturalH) {
        return rawSource;
      }

      const MAX_DIMENSION = 1800;
      const MIN_DIMENSION = 700;
      let scale = 1;
      const maxSide = Math.max(naturalW, naturalH);
      if (maxSide > MAX_DIMENSION) {
        scale = MAX_DIMENSION / maxSide;
      } else if (maxSide < MIN_DIMENSION) {
        scale = Math.min(2.0, MIN_DIMENSION / maxSide);
      }

      const targetW = Math.max(1, Math.round(naturalW * scale));
      const targetH = Math.max(1, Math.round(naturalH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return rawSource;

      // White base fill in case of transparent PNG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const imageData = ctx.getImageData(0, 0, targetW, targetH);
      const data = imageData.data;
      const totalPixels = targetW * targetH;
      const histogram = new Uint32Array(256);

      // First pass: convert to grayscale luminance and build histogram
      for (let i = 0; i < data.length; i += 4) {
        const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        data[i] = lum;
        histogram[lum]++;
      }

      // Compute 5th and 92nd percentile luminance for robust auto-levels contrast stretch
      const lowTarget = Math.floor(totalPixels * 0.03);
      const highTarget = Math.floor(totalPixels * 0.90);
      let cumulative = 0;
      let minLum = 0;
      let maxLum = 255;

      for (let v = 0; v < 256; v++) {
        cumulative += histogram[v];
        if (cumulative <= lowTarget) {
          minLum = v;
        }
        if (cumulative <= highTarget) {
          maxLum = v;
        }
      }

      const range = Math.max(25, maxLum - minLum);

      // Second pass: contrast stretch + background whitening for crisp OCR glyphs
      for (let i = 0; i < data.length; i += 4) {
        const rawLum = data[i];
        let norm = ((rawLum - minLum) / range) * 255;
        if (norm < 0) norm = 0;
        if (norm > 255) norm = 255;

        // Push paper background (> 185) toward clean white and darken ink (< 145)
        let enhanced;
        if (norm > 190) {
          enhanced = 255;
        } else if (norm < 90) {
          enhanced = Math.round(norm * 0.45);
        } else {
          enhanced = Math.round(((norm - 90) / 100) * 220 + 35);
        }

        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
        data[i + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);
      return canvas.toDataURL('image/png');
    } catch (_err) {
      return rawSource;
    }
  }

  /**
   * Recognizes shopping list items from a photo, canvas, data URL, or preset.
   *
   * Strategy:
   * 1. ONLY if `imageSource` is explicitly a sample photo preset key (`'wochenende'`, `'fruehstueck'`, `'italienisch'`)
   *    or a Data URL generated by `generateSamplePhotoDataUrl` (tracked in `GENERATED_SAMPLE_DATA_URLS`),
   *    extracts the sample preset lines and parses them into structured items.
   * 2. If `imageSource` has raw text attached (`imageSource.text`), parses it directly.
   * 3. For all real photos/files/data URLs: preprocesses the image via `preprocessImageForOcr`,
   *    ensures Tesseract.js is loaded via `ensureTesseractLoaded`, runs `Tesseract.recognize(processedImage, 'deu')`,
   *    and parses the recognized text with `parseShoppingText`.
   * 4. If OCR fails or recognizes no text, returns `{ text: '', items: [], source: 'ocr-error', confidence: 0, error: '...' }` —
   *    NEVER returns fake preset items for a real user photo!
   *
   * @param {string|Object|File|Blob} imageSource
   * @param {Function} [onProgress] - Callback `({ status: string, progress: number }) => void`
   * @returns {Promise<{ text: string, items: Array, source: string, confidence: number, presetId: string|null, error?: string|null }>}
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

    if (!imageSource) {
      return {
        text: '',
        items: [],
        source: 'ocr-error',
        confidence: 0,
        presetId: null,
        error: 'Kein Bild zum Scannen ausgewählt.'
      };
    }

    report('Bild wird vorbereitet…', 0.1);

    // 1. Check if imageSource is explicitly a sample photo preset or a DataURL generated by generateSamplePhotoDataUrl
    const matchedPreset = detectPresetFromSource(imageSource);
    if (matchedPreset) {
      report('Demo-Notizzettel & Zeilen werden analysiert…', 0.55);
      await new Promise((resolve) => setTimeout(resolve, 100));
      report('Mengen und Artikelnamen werden extrahiert…', 0.85);
      await new Promise((resolve) => setTimeout(resolve, 60));

      const rawText = [matchedPreset.headerText, ...matchedPreset.lines].join('\n');
      const items = parseShoppingText(rawText);
      report('Demo-Erkennung abgeschlossen!', 1.0);

      return {
        text: matchedPreset.lines.join('\n'),
        items,
        source: 'sample-preset-ocr',
        confidence: 0.98,
        presetId: matchedPreset.id,
        error: null
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
        presetId: null,
        error: null
      };
    }

    // 3. Real photo OCR via Tesseract.js (with image preprocessing)
    try {
      report('Bild wird für Texterkennung optimiert…', 0.18);
      const processedImage = await preprocessImageForOcr(imageSource);

      const tesseract = await ensureTesseractLoaded(onProgress);
      if (!tesseract || typeof tesseract.recognize !== 'function') {
        report('OCR-Engine nicht verfügbar', 1.0);
        return {
          text: '',
          items: [],
          source: 'ocr-error',
          confidence: 0,
          presetId: null,
          error:
            'Tesseract.js OCR-Engine ist offline nicht geladen. Bitte Internetverbindung für den Foto-Scan aktivieren oder den Einkaufszettel-Text unten manuell eintippen.'
        };
      }

      report('Tesseract OCR startet deutsche Texterkennung…', 0.25);

      const logger = (m) => {
        if (!m) return;
        const rawProgress = typeof m.progress === 'number' ? m.progress : 0;
        const pct = Math.round(rawProgress * 100);
        if (m.status === 'recognizing text') {
          report(`Tesseract OCR liest Text (${pct}%)…`, 0.3 + rawProgress * 0.65);
        } else if (m.status && m.status.includes('loading')) {
          report(`OCR Sprachpaket (Deutsch) wird geladen (${pct}%)…`, 0.2 + rawProgress * 0.1);
        }
      };

      let result;
      try {
        result = await tesseract.recognize(processedImage, 'deu', { logger });
      } catch (_firstErr) {
        // Fallback if Tesseract v2/v4 or worker creation format differs
        if (typeof tesseract.createWorker === 'function') {
          const worker = await tesseract.createWorker('deu');
          result = await worker.recognize(processedImage);
          if (typeof worker.terminate === 'function') {
            await worker.terminate();
          }
        } else {
          throw _firstErr;
        }
      }

      const rawText =
        result && result.data && typeof result.data.text === 'string'
          ? result.data.text.trim()
          : result && typeof result.text === 'string'
          ? result.text.trim()
          : '';

      const confidence =
        result && result.data && typeof result.data.confidence === 'number'
          ? result.data.confidence / 100
          : 0.85;

      const items = parseShoppingText(rawText);

      if (!rawText || items.length === 0) {
        report('Keine Einkaufsartikel im Foto erkannt', 1.0);
        return {
          text: rawText,
          items: [],
          source: 'ocr-error',
          confidence: 0,
          presetId: null,
          error: rawText
            ? 'Text wurde gelesen, enthielt aber keine erkennbaren Einkaufsartikel. Du kannst den Text im Feld unten anpassen.'
            : 'Auf dem Foto konnte kein lesbarer Text erkannt werden. Bitte auf gute Beleuchtung und scharfe Schrift achten.'
        };
      }

      report(`Texterkennung abgeschlossen (${items.length} Waren erkannt)!`, 1.0);
      return {
        text: rawText,
        items,
        source: 'tesseract-ocr',
        confidence,
        presetId: null,
        error: null
      };
    } catch (ocrErr) {
      report('Fehler bei der Foto-Texterkennung', 1.0);
      return {
        text: '',
        items: [],
        source: 'ocr-error',
        confidence: 0,
        presetId: null,
        error:
          ocrErr && ocrErr.message
            ? `Foto-Texterkennung fehlgeschlagen: ${ocrErr.message}`
            : 'Foto-Texterkennung fehlgeschlagen. Bitte Text manuell eingeben.'
      };
    }
  }

  const ocrExports = {
    SAMPLE_PHOTO_PRESETS,
    GENERATED_SAMPLE_DATA_URLS,
    getSamplePhotoPresets,
    detectPresetFromSource,
    parseShoppingLine,
    parseShoppingText,
    generateSamplePhotoDataUrl,
    ensureTesseractLoaded,
    preprocessImageForOcr,
    recognizeImageShoppingList
  };

  Object.assign(SmartCartCore, ocrExports);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ocrExports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
