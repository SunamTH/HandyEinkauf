/**
 * SmartCart Core - File-Only ShareService (Export & Import via .smartcart.json files) & SyncAdapter
 *
 * Shopping lists are exported and imported exclusively via files:
 *  - Save file to device (Capacitor Filesystem when available, otherwise browser Blob download)
 *  - Share file via OS share sheet (Capacitor Share+Filesystem or Web Share API Level 2 with `files`)
 *  - Import shopping list from a `.smartcart.json` / `.json` file with strict validation & merge/replace/new modes
 *
 * Works in Browser (`window.SmartCartCore`) and Node.js (CommonJS).
 */
(function (root) {
  'use strict';

  const SmartCartCore = root.SmartCartCore || (root.SmartCartCore = {});

  const models =
    typeof module !== 'undefined' && module.exports && !SmartCartCore.normalizeItemName
      ? require('./models.js')
      : SmartCartCore;

  const optimizer =
    typeof module !== 'undefined' && module.exports && !SmartCartCore.sortShoppingList
      ? require('./optimizer.js')
      : SmartCartCore;

  const {
    generateId,
    normalizeItemName,
    cleanSpecification,
    getStoreEntryKey,
    createItem,
    createShoppingList,
    createSupermarket
  } = models;

  const { sortShoppingList } = optimizer;

  const FILE_FORMAT_ID = 'smartcart-shopping-list';
  const FILE_FORMAT_VERSION = 2;
  const FILE_EXTENSION = '.smartcart.json';
  const FILE_MIME_TYPE = 'application/json';
  const ACCEPTED_FILE_TYPES = '.smartcart.json,.json,application/json';
  const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

  /**
   * Checks whether a value is a plain non-null, non-array object.
   * @param {*} value
   * @returns {boolean}
   */
  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Sanitizes a list name for safe cross-platform filenames (Android, iOS, Windows, macOS, Linux).
   * @param {string} name
   * @returns {string}
   */
  function sanitizeFilenameSegment(name) {
    const raw = String(name || '').trim();
    if (!raw) return 'Einkaufsliste';
    const ascii = raw
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_-]+|[_-]+$/g, '')
      .slice(0, 40);
    return ascii || 'Einkaufsliste';
  }

  /**
   * Formats a date into `YYYY-MM-DD` for export filenames.
   * @param {Date|number|string} [date]
   * @returns {string}
   */
  function formatIsoDate(date) {
    const d = date instanceof Date ? date : date !== undefined && date !== null ? new Date(date) : new Date();
    const safeDate = Number.isNaN(d.getTime()) ? new Date() : d;
    return safeDate.toISOString().slice(0, 10);
  }

  /**
   * Builds a clean, descriptive `.smartcart.json` filename for a shopping list export.
   * @param {Object} list
   * @param {Date|number|string} [date]
   * @returns {string}
   */
  function buildShoppingListFilename(list, date) {
    const slug = sanitizeFilenameSegment(list && list.name);
    const dateStr = formatIsoDate(date);
    return `SmartCart_${slug}_${dateStr}${FILE_EXTENSION}`;
  }

  /**
   * Returns Capacitor runtime & plugins when running inside a native Capacitor app.
   * @returns {{ isNative: boolean, Filesystem: Object|null, Share: Object|null }}
   */
  function getCapacitorPlugins() {
    const cap = root && root.Capacitor;
    const isNative = Boolean(
      cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()
    );
    const plugins = (cap && cap.Plugins) || {};
    return {
      isNative,
      Filesystem: plugins.Filesystem && typeof plugins.Filesystem.writeFile === 'function' ? plugins.Filesystem : null,
      Share: plugins.Share && typeof plugins.Share.share === 'function' ? plugins.Share : null
    };
  }

  /**
   * Checks whether an error represents user cancellation of an OS share dialog.
   * @param {*} err
   * @returns {boolean}
   */
  function isAbortError(err) {
    if (!err) return false;
    if (err.name === 'AbortError') return true;
    const msg = String(err.message || '');
    return /abort|cancel/i.test(msg);
  }

  /**
   * Serializes a shopping list into the canonical SmartCart file payload & JSON string.
   * Preserves list metadata and every item's name, quantity, optional specification,
   * category, checked state, checkedAt timestamp, addedLateOverride, and originalOrder.
   *
   * @param {Object} list
   * @param {Object|null} [supermarket=null] - Optional supermarket metadata for cross-device store matching
   * @param {Object} [options={}]
   * @param {Date|number|string} [options.date] - Optional date override for filename/exportedAt
   * @returns {{ payload: Object, json: string, filename: string, mimeType: string }}
   */
  function serializeShoppingList(list, supermarket = null, options = {}) {
    if (!isPlainObject(list)) {
      throw new TypeError('Ungültige Einkaufsliste für den Export.');
    }

    const cleanList = createShoppingList(list);
    const exportedAt =
      typeof options.exportedAt === 'number' && !Number.isNaN(options.exportedAt)
        ? options.exportedAt
        : Date.now();

    const portableItems = cleanList.items.map((item, idx) => ({
      id: item.id,
      name: item.name,
      specification: cleanSpecification(item.specification),
      quantity: item.quantity,
      category: item.category,
      checked: Boolean(item.checked),
      checkedAt: item.checked ? item.checkedAt : null,
      addedLateOverride: item.checked ? false : Boolean(item.addedLateOverride),
      originalOrder: typeof item.originalOrder === 'number' ? item.originalOrder : idx
    }));

    const supermarketMeta = isPlainObject(supermarket)
      ? {
          id: String(supermarket.id || cleanList.supermarketId || '').trim(),
          name: String(supermarket.name || '').trim(),
          icon: supermarket.icon || '🛒',
          color: supermarket.color || '#2563eb'
        }
      : null;

    const payload = {
      app: 'SmartCart',
      format: FILE_FORMAT_ID,
      version: FILE_FORMAT_VERSION,
      type: 'shopping_list',
      exportedAt,
      list: {
        id: cleanList.id,
        name: cleanList.name,
        supermarketId: cleanList.supermarketId,
        liveOptimizationEnabled: cleanList.liveOptimizationEnabled,
        updatedAt: cleanList.updatedAt,
        items: portableItems
      },
      supermarket: supermarketMeta
    };

    const json = JSON.stringify(payload, null, 2);
    const filename =
      options && typeof options.filename === 'string' && options.filename.trim()
        ? options.filename.trim()
        : buildShoppingListFilename(cleanList, options.date);

    return {
      payload,
      json,
      filename,
      mimeType: FILE_MIME_TYPE
    };
  }

  /**
   * Builds a `File` (when supported by the environment) and `Blob` for exporting a shopping list.
   *
   * @param {Object} list
   * @param {Object|null} [supermarket=null]
   * @param {Object} [options={}]
   * @param {string} [options.filename]
   * @param {string} [options.mimeType]
   * @returns {{ payload: Object, json: string, filename: string, mimeType: string, file: File|null, blob: Blob|null }}
   */
  function createShoppingListFile(list, supermarket = null, options = {}) {
    const serialized = serializeShoppingList(list, supermarket, options);
    const mimeType =
      options && typeof options.mimeType === 'string' && options.mimeType.trim()
        ? options.mimeType.trim()
        : serialized.mimeType;

    let blob = null;
    if (typeof Blob === 'function') {
      blob = new Blob([serialized.json], { type: `${mimeType};charset=utf-8` });
    }

    let file = null;
    if (typeof File === 'function') {
      try {
        file = new File([serialized.json], serialized.filename, { type: mimeType });
      } catch (_err) {
        file = null;
      }
    }

    return {
      payload: serialized.payload,
      json: serialized.json,
      filename: serialized.filename,
      mimeType,
      file,
      blob
    };
  }

  /**
   * Checks synchronously whether the current platform/browser supports sharing a shopping list file
   * via Capacitor Share+Filesystem or the Web Share API Level 2 (`navigator.canShare({ files })`).
   *
   * @param {string} [sampleFilename='SmartCart_Einkaufsliste.smartcart.json']
   * @returns {{ supported: boolean, method: 'capacitor-share'|'web-share-file'|'none', mimeType: string|null }}
   */
  function canShareShoppingListFiles(sampleFilename = `SmartCart_Einkaufsliste${FILE_EXTENSION}`) {
    const cap = getCapacitorPlugins();
    if (cap.isNative && cap.Filesystem && cap.Share) {
      return {
        supported: true,
        method: 'capacitor-share',
        mimeType: FILE_MIME_TYPE
      };
    }

    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      typeof File === 'function'
    ) {
      const candidateMimes = [FILE_MIME_TYPE, 'text/plain'];
      for (const mime of candidateMimes) {
        try {
          const probeFile = new File(['{}'], sampleFilename, { type: mime });
          if (navigator.canShare({ files: [probeFile] })) {
            return {
              supported: true,
              method: 'web-share-file',
              mimeType: mime
            };
          }
        } catch (_err) {
          // Try next MIME type
        }
      }
    }

    return {
      supported: false,
      method: 'none',
      mimeType: null
    };
  }

  /**
   * Triggers a browser Blob download for a serialized JSON string.
   * @param {string} content
   * @param {string} filename
   * @param {string} [mimeType='application/json']
   * @returns {boolean}
   */
  function triggerBrowserDownload(content, filename, mimeType = FILE_MIME_TYPE) {
    if (
      typeof document === 'undefined' ||
      typeof Blob === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return false;
    }

    try {
      const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      if (typeof URL.revokeObjectURL === 'function') {
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch (_e) {
            // ignore
          }
        }, 1500);
      }
      return true;
    } catch (_err) {
      return false;
    }
  }

  /**
   * Saves a shopping list as a `.smartcart.json` file to the user's device.
   * Uses Capacitor Filesystem when running natively with the plugin installed
   * (`DOCUMENTS` with optional permission request, falling back cleanly to `DATA` or browser download),
   * otherwise triggers a mobile- and desktop-friendly browser file download.
   *
   * @param {Object} list
   * @param {Object|null} [supermarket=null]
   * @param {Object} [options={}]
   * @returns {Promise<{ success: boolean, method: string, filename: string|null, directory?: string|null, uri?: string|null, error?: string }>}
   */
  async function saveShoppingListFile(list, supermarket = null, options = {}) {
    let fileBundle;
    try {
      fileBundle = createShoppingListFile(list, supermarket, options);
    } catch (err) {
      return {
        success: false,
        method: 'invalid',
        filename: null,
        error: err && err.message ? err.message : 'Einkaufsliste konnte nicht exportiert werden.'
      };
    }

    const { json, filename, mimeType } = fileBundle;

    // 1. Native Capacitor Filesystem (if installed)
    const cap = getCapacitorPlugins();
    let nativeSaveError = null;
    if (cap.isNative && cap.Filesystem) {
      const writeToDirectory = async (directory) => {
        const writeRes = await cap.Filesystem.writeFile({
          path: filename,
          data: json,
          directory,
          encoding: 'utf8',
          recursive: true
        });
        let uri = writeRes && writeRes.uri ? writeRes.uri : null;
        if (!uri && typeof cap.Filesystem.getUri === 'function') {
          try {
            const uriRes = await cap.Filesystem.getUri({ path: filename, directory });
            uri = uriRes && uriRes.uri ? uriRes.uri : null;
          } catch (_uriErr) {
            uri = null;
          }
        }
        return {
          success: true,
          method: 'capacitor-filesystem',
          filename,
          directory,
          uri
        };
      };

      try {
        return await writeToDirectory('DOCUMENTS');
      } catch (docErr) {
        nativeSaveError = docErr;
        // On older Android API levels, DOCUMENTS may require runtime storage permission
        if (typeof cap.Filesystem.requestPermissions === 'function') {
          try {
            const perm = await cap.Filesystem.requestPermissions();
            if (!perm || perm.publicStorage !== 'denied') {
              return await writeToDirectory('DOCUMENTS');
            }
          } catch (permErr) {
            nativeSaveError = permErr;
          }
        }

        // Clean fallback to app-private DATA directory (no external storage permission needed)
        try {
          return await writeToDirectory('DATA');
        } catch (dataErr) {
          nativeSaveError = dataErr;
        }
      }
    }

    // 2. Standard browser / PWA / WebView file download
    const downloaded = triggerBrowserDownload(json, filename, mimeType);
    if (downloaded) {
      return {
        success: true,
        method: 'browser-download',
        filename
      };
    }

    if (cap.isNative) {
      return {
        success: false,
        method: nativeSaveError ? 'error' : 'unsupported',
        filename,
        directory: null,
        uri: null,
        error:
          nativeSaveError && nativeSaveError.message
            ? `Datei konnte auf diesem Gerät nicht gespeichert werden: ${nativeSaveError.message}`
            : 'Datei konnte auf diesem Gerät nicht gespeichert werden.'
      };
    }

    return {
      success: false,
      method: 'unsupported',
      filename,
      error: 'Dateispeicherung wird in dieser Umgebung nicht unterstützt.'
    };
  }

  /**
   * Shares a shopping list strictly as a file via WhatsApp, Mail, or other messenger apps
   * using Capacitor Share+Filesystem (when installed natively) or Web Share API Level 2
   * (`navigator.share({ files: [file], title })` guarded by `navigator.canShare({ files: [file] })`).
   *
   * Never shares plain text, URLs, or copies to the clipboard.
   * When file sharing is unsupported on the current browser/device, optionally falls back to
   * saving the file to the device when `options.fallbackToSave === true`.
   *
   * @param {Object} list
   * @param {Object|null} [supermarket=null]
   * @param {Object} [options={}]
   * @param {string} [options.title]
   * @param {string} [options.dialogTitle]
   * @param {boolean} [options.fallbackToSave=false]
   * @returns {Promise<{ success: boolean, supported: boolean, method: string, filename: string|null, aborted?: boolean, fallbackSaved?: boolean, directory?: string|null, uri?: string|null, error?: string }>}
   */
  async function shareShoppingListFile(list, supermarket = null, options = {}) {
    let serialized;
    try {
      serialized = serializeShoppingList(list, supermarket, options);
    } catch (err) {
      return {
        success: false,
        supported: false,
        method: 'invalid',
        filename: null,
        error: err && err.message ? err.message : 'Einkaufsliste konnte nicht exportiert werden.'
      };
    }

    const { payload, json, filename } = serialized;
    const shareTitle =
      options && typeof options.title === 'string' && options.title.trim()
        ? options.title.trim()
        : `SmartCart Einkaufsliste: ${payload.list.name}`;
    const dialogTitle =
      options && typeof options.dialogTitle === 'string' && options.dialogTitle.trim()
        ? options.dialogTitle.trim()
        : 'Einkaufsliste als Datei teilen';

    // 1. Native Capacitor Share + Filesystem (if installed)
    const cap = getCapacitorPlugins();
    if (cap.isNative && cap.Filesystem && cap.Share) {
      try {
        const writeRes = await cap.Filesystem.writeFile({
          path: filename,
          data: json,
          directory: 'CACHE',
          encoding: 'utf8'
        });
        let fileUri = writeRes && writeRes.uri ? writeRes.uri : null;
        if (!fileUri && typeof cap.Filesystem.getUri === 'function') {
          const uriRes = await cap.Filesystem.getUri({
            path: filename,
            directory: 'CACHE'
          });
          fileUri = uriRes && uriRes.uri ? uriRes.uri : null;
        }

        if (!fileUri) {
          throw new Error('Temporäre Datei-URI konnte nicht ermittelt werden.');
        }

        await cap.Share.share({
          title: shareTitle,
          files: [fileUri],
          dialogTitle
        });
        return {
          success: true,
          supported: true,
          method: 'capacitor-share',
          filename
        };
      } catch (err) {
        if (isAbortError(err)) {
          return {
            success: false,
            supported: true,
            aborted: true,
            method: 'aborted',
            filename
          };
        }

        const nativeErrMsg =
          err && err.message
            ? `Datei konnte auf diesem Gerät nicht geteilt werden: ${err.message}`
            : 'Datei konnte auf diesem Gerät nicht geteilt werden.';

        if (options && options.fallbackToSave) {
          const saveRes = await saveShoppingListFile(list, supermarket, options);
          return {
            success: saveRes.success,
            supported: true,
            fallbackSaved: saveRes.success,
            method: saveRes.success ? 'save-fallback' : 'error',
            filename,
            directory: saveRes.directory || null,
            uri: saveRes.uri || null,
            error: saveRes.success ? undefined : nativeErrMsg
          };
        }

        return {
          success: false,
          supported: true,
          fallbackSaved: false,
          method: 'error',
          filename,
          error: nativeErrMsg
        };
      }
    }

    // 2. Web Share API Level 2 (File sharing ONLY)
    const webShareCap = canShareShoppingListFiles(filename);
    if (webShareCap.supported && webShareCap.method === 'web-share-file') {
      try {
        const shareFile = new File([json], filename, {
          type: webShareCap.mimeType || FILE_MIME_TYPE
        });
        await navigator.share({
          files: [shareFile],
          title: shareTitle
        });
        return {
          success: true,
          supported: true,
          method: 'web-share-file',
          filename
        };
      } catch (err) {
        if (isAbortError(err)) {
          return {
            success: false,
            supported: true,
            aborted: true,
            method: 'aborted',
            filename
          };
        }
        if (options && options.fallbackToSave) {
          const saveRes = await saveShoppingListFile(list, supermarket, options);
          return {
            success: saveRes.success,
            supported: true,
            fallbackSaved: saveRes.success,
            method: saveRes.success ? 'save-fallback' : 'error',
            filename,
            error: saveRes.success
              ? undefined
              : err && err.message
              ? err.message
              : 'Datei konnte nicht geteilt werden.'
          };
        }
        return {
          success: false,
          supported: true,
          method: 'error',
          filename,
          error: err && err.message ? err.message : 'Datei konnte nicht geteilt werden.'
        };
      }
    }

    // 3. Unsupported on this platform/browser -> optional file download fallback (never text/clipboard)
    const unsupportedMsg = cap.isNative
      ? 'Direktes Teilen von Dateien ist auf diesem Gerät derzeit nicht verfügbar. Bitte speichere die Datei und versende sie manuell.'
      : 'Direktes Teilen von Dateien wird von diesem Browser/Gerät nicht unterstützt. Bitte speichere die Datei und versende sie manuell.';

    if (options && options.fallbackToSave) {
      const saveRes = await saveShoppingListFile(list, supermarket, options);
      return {
        success: saveRes.success,
        supported: false,
        fallbackSaved: saveRes.success,
        method: saveRes.success ? 'save-fallback' : 'unsupported',
        filename,
        directory: saveRes.directory || null,
        uri: saveRes.uri || null,
        error: saveRes.success ? undefined : saveRes.error || unsupportedMsg
      };
    }

    return {
      success: false,
      supported: false,
      fallbackSaved: false,
      method: 'unsupported',
      filename,
      error: unsupportedMsg
    };
  }

  /**
   * Validates and parses the UTF-8 JSON content of a `.smartcart.json` / `.json` shopping list file.
   * Rejects malformed JSON, non-SmartCart files, legacy `SC1:` share codes, and corrupt item entries.
   * Preserves item name, quantity, optional specification (defaults to `''` for older files),
   * category, checked status, checkedAt, addedLateOverride, and originalOrder.
   *
   * @param {string} rawContent
   * @returns {{ valid: boolean, version?: number, exportedAt?: number, list?: Object, supermarketMeta?: Object|null, supermarket?: Object|null, error?: string }}
   */
  function parseShoppingListFileContent(rawContent) {
    if (typeof rawContent !== 'string') {
      return {
        valid: false,
        error: 'Ungültiger Dateiinhalt. Bitte wähle eine SmartCart-Einkaufslisten-Datei (.smartcart.json / .json).'
      };
    }

    // Strip optional UTF-8 BOM
    const trimmed = rawContent.replace(/^\uFEFF/, '').trim();
    if (!trimmed) {
      return {
        valid: false,
        error: 'Die ausgewählte Datei ist leer.'
      };
    }

    if (trimmed.startsWith('SC1:')) {
      return {
        valid: false,
        error: 'Veraltetes Share-Code-Format wird nicht mehr unterstützt. Bitte importiere eine SmartCart-Datei (.smartcart.json / .json).'
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (_err) {
      return {
        valid: false,
        error: 'Die ausgewählte Datei enthält kein gültiges JSON-Format oder ist beschädigt.'
      };
    }

    if (!isPlainObject(parsed)) {
      return {
        valid: false,
        error: 'Ungültige Dateistruktur: Erwartet wird ein SmartCart-JSON-Objekt.'
      };
    }

    if (parsed.app !== undefined && String(parsed.app).trim().toLowerCase() !== 'smartcart') {
      return {
        valid: false,
        error: 'Die Datei stammt nicht von SmartCart und kann nicht importiert werden.'
      };
    }

    if (parsed.type !== undefined && parsed.type !== 'shopping_list') {
      return {
        valid: false,
        error: 'Diese Datei enthält keine Einkaufsliste (ungültiger Dateityp).'
      };
    }

    if (!isPlainObject(parsed.list)) {
      return {
        valid: false,
        error: 'Keine gültige Einkaufsliste in der Datei gefunden.'
      };
    }

    const rawList = parsed.list;
    if (!Array.isArray(rawList.items)) {
      return {
        valid: false,
        error: 'Die Einkaufsliste in der Datei enthält keine gültige Artikelliste.'
      };
    }

    if (rawList.name !== undefined && rawList.name !== null && typeof rawList.name !== 'string') {
      return {
        valid: false,
        error: 'Der Name der Einkaufsliste in der Datei ist ungültig.'
      };
    }

    // Validate every item strictly so corrupt JSON payloads are cleanly rejected
    const validatedItems = [];
    for (let i = 0; i < rawList.items.length; i++) {
      const rawItem = rawList.items[i];
      if (!isPlainObject(rawItem)) {
        return {
          valid: false,
          error: `Beschädigter Eintrag an Position ${i + 1} in der Datei.`
        };
      }
      if (typeof rawItem.name !== 'string' || rawItem.name.trim() === '') {
        return {
          valid: false,
          error: `Artikel an Position ${i + 1} hat keinen gültigen Namen.`
        };
      }
      if (
        rawItem.specification !== undefined &&
        rawItem.specification !== null &&
        typeof rawItem.specification !== 'string'
      ) {
        return {
          valid: false,
          error: `Artikel „${rawItem.name.trim()}“ hat eine ungültige Spezifikation.`
        };
      }
      if (
        rawItem.quantity !== undefined &&
        rawItem.quantity !== null &&
        typeof rawItem.quantity !== 'string' &&
        typeof rawItem.quantity !== 'number'
      ) {
        return {
          valid: false,
          error: `Artikel „${rawItem.name.trim()}“ hat eine ungültige Menge.`
        };
      }
      if (rawItem.checked !== undefined && typeof rawItem.checked !== 'boolean') {
        return {
          valid: false,
          error: `Artikel „${rawItem.name.trim()}“ hat einen ungültigen Abhak-Status.`
        };
      }

      validatedItems.push(
        createItem({
          id: typeof rawItem.id === 'string' && rawItem.id.trim() ? rawItem.id.trim() : undefined,
          name: rawItem.name,
          specification: rawItem.specification !== undefined && rawItem.specification !== null ? rawItem.specification : '',
          quantity: rawItem.quantity,
          category: typeof rawItem.category === 'string' && rawItem.category.trim() ? rawItem.category.trim() : null,
          checked: Boolean(rawItem.checked),
          checkedAt:
            rawItem.checked && typeof rawItem.checkedAt === 'number' && !Number.isNaN(rawItem.checkedAt)
              ? rawItem.checkedAt
              : null,
          addedLateOverride: Boolean(rawItem.addedLateOverride),
          originalOrder:
            typeof rawItem.originalOrder === 'number' && !Number.isNaN(rawItem.originalOrder)
              ? rawItem.originalOrder
              : i
        })
      );
    }

    const listName =
      typeof rawList.name === 'string' && rawList.name.trim()
        ? rawList.name.trim()
        : 'Importierte Einkaufsliste';

    const normalizedList = createShoppingList({
      id: typeof rawList.id === 'string' && rawList.id.trim() ? rawList.id.trim() : undefined,
      name: listName,
      supermarketId:
        typeof rawList.supermarketId === 'string' && rawList.supermarketId.trim()
          ? rawList.supermarketId.trim()
          : 'rewe',
      liveOptimizationEnabled:
        rawList.liveOptimizationEnabled === undefined ? true : Boolean(rawList.liveOptimizationEnabled),
      items: validatedItems,
      updatedAt:
        typeof rawList.updatedAt === 'number' && !Number.isNaN(rawList.updatedAt)
          ? rawList.updatedAt
          : Date.now()
    });

    let supermarketMeta = null;
    let supermarket = null;
    if (isPlainObject(parsed.supermarket)) {
      supermarketMeta = {
        id: String(parsed.supermarket.id || normalizedList.supermarketId || '').trim(),
        name: String(parsed.supermarket.name || '').trim(),
        icon: parsed.supermarket.icon || '🛒',
        color: parsed.supermarket.color || '#2563eb'
      };
      if (Array.isArray(parsed.supermarket.itemOrder)) {
        supermarket = createSupermarket(parsed.supermarket);
      }
    }

    return {
      valid: true,
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      exportedAt:
        typeof parsed.exportedAt === 'number' && !Number.isNaN(parsed.exportedAt)
          ? parsed.exportedAt
          : Date.now(),
      list: normalizedList,
      supermarketMeta,
      supermarket
    };
  }

  /**
   * Reads a browser `File` / `Blob` as UTF-8 text using `file.text()` or `FileReader`.
   * @param {File|Blob} file
   * @returns {Promise<string>}
   */
  function readFileAsUtf8Text(file) {
    if (file && typeof file.text === 'function') {
      return file.text();
    }
    if (typeof FileReader === 'function') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
        reader.readAsText(file, 'utf-8');
      });
    }
    return Promise.reject(new Error('Datei-Lese-API ist in dieser Umgebung nicht verfügbar.'));
  }

  /**
   * Reads and validates a selected shopping list file (`File` / `Blob`) for immediate import.
   *
   * @param {File|Blob} file
   * @returns {Promise<{ valid: boolean, filename?: string, version?: number, exportedAt?: number, list?: Object, supermarketMeta?: Object|null, supermarket?: Object|null, error?: string }>}
   */
  async function readShoppingListFile(file) {
    if (!file || typeof file !== 'object') {
      return {
        valid: false,
        error: 'Keine Datei zum Importieren ausgewählt.'
      };
    }

    const filename = typeof file.name === 'string' ? file.name : '';

    if (typeof file.size === 'number') {
      if (file.size === 0) {
        return {
          valid: false,
          filename,
          error: 'Die ausgewählte Datei ist leer.'
        };
      }
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        return {
          valid: false,
          filename,
          error: 'Die ausgewählte Datei ist zu groß (maximal 5 MB).'
        };
      }
    }

    try {
      const rawText = await readFileAsUtf8Text(file);
      const parsed = parseShoppingListFileContent(rawText);
      return {
        ...parsed,
        filename
      };
    } catch (err) {
      return {
        valid: false,
        filename,
        error: err && err.message ? err.message : 'Die Datei konnte nicht gelesen werden.'
      };
    }
  }

  /**
   * Resolves the best matching local supermarket on the importing device so the imported
   * shopping list can be sorted and used immediately.
   *
   * @param {Object} importedList
   * @param {Array<Object>} supermarkets
   * @param {Object|null} [supermarketMeta]
   * @param {string|null} [fallbackSupermarketId]
   * @returns {Object|null}
   */
  function resolveTargetSupermarket(importedList, supermarkets, supermarketMeta, fallbackSupermarketId) {
    if (!Array.isArray(supermarkets) || supermarkets.length === 0) {
      return null;
    }

    if (importedList && importedList.supermarketId) {
      const byId = supermarkets.find((s) => s && s.id === importedList.supermarketId);
      if (byId) return byId;
    }

    if (supermarketMeta && supermarketMeta.name) {
      const targetNorm = normalizeItemName(supermarketMeta.name);
      if (targetNorm) {
        const byName = supermarkets.find((s) => s && normalizeItemName(s.name) === targetNorm);
        if (byName) return byName;
      }
    }

    if (fallbackSupermarketId) {
      const byFallback = supermarkets.find((s) => s && s.id === fallbackSupermarketId);
      if (byFallback) return byFallback;
    }

    return supermarkets[0];
  }

  /**
   * Applies a validated imported shopping list into the app's shopping list state.
   * Supports three clean import modes:
   *  - `'new'` (default): Creates a new saved shopping list with fresh IDs ready for immediate use.
   *  - `'merge'`: Merges imported items into `targetList`, deduplicating by exact `(normalizedName, normalizedSpecification)`.
   *  - `'replace'`: Replaces the items of `targetList` with the imported list's items.
   *
   * Always sorts the resulting list for the resolved supermarket so it is immediately usable.
   *
   * @param {Object} importedList
   * @param {Object} [options={}]
   * @param {'new'|'merge'|'replace'} [options.mode='new']
   * @param {Object|null} [options.targetList=null]
   * @param {Array<Object>} [options.existingLists=[]]
   * @param {Array<Object>} [options.supermarkets=[]]
   * @param {Object|null} [options.supermarketMeta=null]
   * @param {string|null} [options.fallbackSupermarketId=null]
   * @param {boolean} [options.disambiguateName=true]
   * @param {boolean} [options.keepTargetName=false]
   * @returns {{ list: Object, supermarket: Object|null, mode: 'new'|'merge'|'replace', addedCount: number, skippedCount: number }}
   */
  function applyImportedShoppingList(importedList, options = {}) {
    if (!isPlainObject(importedList)) {
      throw new TypeError('Ungültige importierte Einkaufsliste.');
    }

    const mode = options.mode === 'merge' || options.mode === 'replace' ? options.mode : 'new';
    const targetList = isPlainObject(options.targetList) ? options.targetList : null;
    const existingLists = Array.isArray(options.existingLists) ? options.existingLists : [];
    const supermarkets = Array.isArray(options.supermarkets) ? options.supermarkets : [];
    const supermarketMeta = isPlainObject(options.supermarketMeta) ? options.supermarketMeta : null;
    const fallbackSupermarketId =
      options.fallbackSupermarketId || (targetList && targetList.supermarketId) || null;
    const disambiguateName = options.disambiguateName !== false;
    const keepTargetName = Boolean(options.keepTargetName);

    const cleanImported = createShoppingList(importedList);

    if (mode === 'merge' && targetList) {
      const cleanTarget = createShoppingList(targetList);
      const targetStore =
        supermarkets.find((s) => s && s.id === cleanTarget.supermarketId) ||
        resolveTargetSupermarket(cleanImported, supermarkets, supermarketMeta, fallbackSupermarketId);

      const existingKeys = new Set(
        cleanTarget.items.map((item) => getStoreEntryKey(item.name, item.specification))
      );

      let nextOrder = cleanTarget.items.reduce(
        (max, item) => (typeof item.originalOrder === 'number' && item.originalOrder > max ? item.originalOrder : max),
        -1
      ) + 1;

      const mergedItems = [...cleanTarget.items];
      let addedCount = 0;
      let skippedCount = 0;

      for (const incomingItem of cleanImported.items) {
        const key = getStoreEntryKey(incomingItem.name, incomingItem.specification);
        if (key && existingKeys.has(key)) {
          skippedCount++;
          continue;
        }
        if (key) existingKeys.add(key);
        mergedItems.push(
          createItem({
            ...incomingItem,
            id: generateId('item'),
            originalOrder: nextOrder++
          })
        );
        addedCount++;
      }

      const mergedList = createShoppingList({
        ...cleanTarget,
        supermarketId: targetStore ? targetStore.id : cleanTarget.supermarketId,
        items: mergedItems,
        updatedAt: Date.now()
      });

      const finalItems = targetStore ? sortShoppingList(mergedList, targetStore).sortedItems : mergedList.items;

      return {
        list: {
          ...mergedList,
          items: finalItems
        },
        supermarket: targetStore,
        mode: 'merge',
        addedCount,
        skippedCount
      };
    }

    const resolvedStore = resolveTargetSupermarket(
      cleanImported,
      supermarkets,
      supermarketMeta,
      fallbackSupermarketId
    );

    const freshItems = cleanImported.items.map((item, idx) =>
      createItem({
        ...item,
        id: generateId('item'),
        originalOrder: typeof item.originalOrder === 'number' ? item.originalOrder : idx
      })
    );

    if (mode === 'replace' && targetList) {
      const cleanTarget = createShoppingList(targetList);
      const replacedList = createShoppingList({
        id: cleanTarget.id,
        name: keepTargetName ? cleanTarget.name : cleanImported.name,
        supermarketId: resolvedStore ? resolvedStore.id : cleanTarget.supermarketId,
        liveOptimizationEnabled: cleanImported.liveOptimizationEnabled,
        items: freshItems,
        updatedAt: Date.now()
      });
      const finalItems = resolvedStore
        ? sortShoppingList(replacedList, resolvedStore).sortedItems
        : replacedList.items;

      return {
        list: {
          ...replacedList,
          items: finalItems
        },
        supermarket: resolvedStore,
        mode: 'replace',
        addedCount: finalItems.length,
        skippedCount: 0
      };
    }

    // Default mode: 'new'
    let resolvedName = cleanImported.name;
    if (disambiguateName && existingLists.length > 0) {
      const lowerNames = new Set(
        existingLists
          .filter((l) => l && typeof l.name === 'string')
          .map((l) => l.name.trim().toLowerCase())
      );
      if (lowerNames.has(resolvedName.toLowerCase())) {
        let candidate = `${resolvedName} (Import)`;
        let suffix = 2;
        while (lowerNames.has(candidate.toLowerCase())) {
          candidate = `${resolvedName} (Import ${suffix++})`;
        }
        resolvedName = candidate;
      }
    }

    const newList = createShoppingList({
      id: generateId('list'),
      name: resolvedName,
      supermarketId: resolvedStore ? resolvedStore.id : cleanImported.supermarketId,
      liveOptimizationEnabled: cleanImported.liveOptimizationEnabled,
      items: freshItems,
      updatedAt: Date.now()
    });

    const finalItems = resolvedStore
      ? sortShoppingList(newList, resolvedStore).sortedItems
      : newList.items;

    return {
      list: {
        ...newList,
        items: finalItems
      },
      supermarket: resolvedStore,
      mode: 'new',
      addedCount: finalItems.length,
      skippedCount: 0
    };
  }

  /**
   * Architectural SyncAdapter for local same-browser cross-tab state synchronization
   * via `BroadcastChannel`.
   */
  class SyncAdapter {
    constructor(channelName = 'smartcart_live_sync_v1') {
      this.channelName = channelName;
      this.listeners = new Set();
      this.channel = null;
      this.remoteTransport = null;
      this.connected = false;
      this.clientId = `client_${Math.random().toString(36).slice(2, 9)}`;
    }

    connect() {
      if (this.connected) return true;
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.channel = new BroadcastChannel(this.channelName);
          this.channel.onmessage = (event) => {
            if (event && event.data && event.data.senderId !== this.clientId) {
              this._notifyListeners(event.data);
            }
          };
        } catch (_err) {
          this.channel = null;
        }
      }
      this.connected = true;
      return true;
    }

    disconnect() {
      if (this.channel) {
        try {
          this.channel.close();
        } catch (_e) {
          // ignore
        }
        this.channel = null;
      }
      this.connected = false;
    }

    onRemoteUpdate(callback) {
      if (typeof callback === 'function') {
        this.listeners.add(callback);
      }
      return () => this.listeners.delete(callback);
    }

    _notifyListeners(message) {
      this.listeners.forEach((cb) => {
        try {
          cb(message);
        } catch (_e) {
          // ignore listener errors
        }
      });
    }

    publishUpdate(type, data) {
      const envelope = {
        senderId: this.clientId,
        type,
        data,
        timestamp: Date.now()
      };
      if (this.channel) {
        try {
          this.channel.postMessage(envelope);
        } catch (_e) {
          // ignore
        }
      }
      if (this.remoteTransport && typeof this.remoteTransport.send === 'function') {
        this.remoteTransport.send(envelope);
      }
      return envelope;
    }

    getStatus() {
      return {
        connected: this.connected,
        clientId: this.clientId,
        transport: this.remoteTransport
          ? 'remote-websocket'
          : this.channel
          ? 'broadcast-channel'
          : 'local-only'
      };
    }
  }

  const ShareService = {
    FILE_FORMAT_ID,
    FILE_FORMAT_VERSION,
    FILE_EXTENSION,
    FILE_MIME_TYPE,
    ACCEPTED_FILE_TYPES,
    MAX_IMPORT_FILE_BYTES,
    buildShoppingListFilename,
    serializeShoppingList,
    createShoppingListFile,
    canShareShoppingListFiles,
    saveShoppingListFile,
    shareShoppingListFile,
    parseShoppingListFileContent,
    readShoppingListFile,
    applyImportedShoppingList
  };

  const shareExports = {
    ShareService,
    SyncAdapter,
    FILE_FORMAT_ID,
    FILE_FORMAT_VERSION,
    FILE_EXTENSION,
    FILE_MIME_TYPE,
    ACCEPTED_FILE_TYPES,
    MAX_IMPORT_FILE_BYTES,
    buildShoppingListFilename,
    serializeShoppingList,
    createShoppingListFile,
    canShareShoppingListFiles,
    saveShoppingListFile,
    shareShoppingListFile,
    parseShoppingListFileContent,
    readShoppingListFile,
    applyImportedShoppingList
  };

  Object.assign(SmartCartCore, shareExports);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = shareExports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
