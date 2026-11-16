/**
 * SmartCart Core - ShareService (Export/Import via Share-Code, JSON, Web Share API) & SyncAdapter
 * Works in Browser (window.SmartCartCore) and Node.js (CommonJS).
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

  const { createShoppingList, createSupermarket } = models;
  const { sortShoppingList } = optimizer;

  const SHARE_PREFIX = 'SC1:';

  function encodeUtf8Base64(str) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'utf8').toString('base64');
    }
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(str)));
    }
    return '';
  }

  function decodeUtf8Base64(b64) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(b64, 'base64').toString('utf8');
    }
    if (typeof atob === 'function') {
      return decodeURIComponent(escape(atob(b64)));
    }
    return '';
  }

  /**
   * Formats a shopping list as a clean, human-readable German text message
   * suitable for WhatsApp, Telegram, SMS, or email.
   *
   * @param {Object} list
   * @param {Object} [supermarket]
   * @param {string} [shareCode]
   * @returns {string}
   */
  function formatListAsPlainText(list, supermarket, shareCode = '') {
    if (!list) return '';
    const storeName = supermarket ? `${supermarket.icon || '🛒'} ${supermarket.name}` : 'Supermarkt';
    const { checkedItems, uncheckedItems } = sortShoppingList(list, supermarket);

    const lines = [
      `🛒 *${list.name}* (${storeName})`,
      ''
    ];

    if (uncheckedItems.length > 0) {
      lines.push(`📋 *Noch einzukaufen (${uncheckedItems.length}):*`);
      uncheckedItems.forEach((item, idx) => {
        const prefix = idx === 0 ? '➡️ ' : '☐ ';
        const lateTag = item.addedLateOverride ? ' [Als Nächstes!]' : '';
        lines.push(`${prefix}${item.name} (${item.quantity || '1x'})${lateTag}`);
      });
      lines.push('');
    }

    if (checkedItems.length > 0) {
      lines.push(`✅ *Bereits abgehakt (${checkedItems.length}):*`);
      checkedItems.forEach((item) => {
        lines.push(`☑ ~${item.name}~ (${item.quantity || '1x'})`);
      });
      lines.push('');
    }

    if (shareCode) {
      lines.push('---');
      lines.push('📲 In SmartCart importieren (Share-Code):');
      lines.push(shareCode);
    }

    return lines.join('\n').trim();
  }

  /**
   * Encodes a SmartCart payload object into a compact `SC1:<base64>` share code.
   * @param {Object} payload
   * @returns {string}
   */
  function encodeShareCode(payload) {
    const json = JSON.stringify(payload);
    return `${SHARE_PREFIX}${encodeUtf8Base64(json)}`;
  }

  /**
   * Decodes a SmartCart share code (`SC1:...`), a text message containing an `SC1:...` code,
   * or a raw JSON string into validated domain models.
   *
   * @param {string} codeOrJson
   * @returns {{ valid: boolean, type?: string, list?: Object, supermarket?: Object, supermarkets?: Array, lists?: Array, error?: string }}
   */
  function decodeShareCode(codeOrJson) {
    if (!codeOrJson || typeof codeOrJson !== 'string') {
      return { valid: false, error: 'Kein gültiger Share-Code oder JSON-Text übergeben.' };
    }

    const trimmed = codeOrJson.trim();
    let jsonStr = trimmed;

    // Extract SC1:... token even if embedded inside a longer WhatsApp/Telegram message
    const scMatch = trimmed.match(/SC1:([A-Za-z0-9+/=_-]+)/);
    if (scMatch) {
      try {
        jsonStr = decodeUtf8Base64(scMatch[1]);
      } catch (_err) {
        return { valid: false, error: 'Der SC1-Share-Code konnte nicht dekodiert werden.' };
      }
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') {
        return { valid: false, error: 'Ungültiges Datenformat.' };
      }

      const type = parsed.type || (parsed.list ? 'shopping_list' : parsed.supermarket ? 'supermarket' : 'backup');
      const result = {
        valid: true,
        type,
        exportedAt: parsed.exportedAt || Date.now()
      };

      if (parsed.list) {
        result.list = createShoppingList(parsed.list);
      }
      if (parsed.supermarket) {
        result.supermarket = createSupermarket(parsed.supermarket);
      }
      if (Array.isArray(parsed.supermarkets)) {
        result.supermarkets = parsed.supermarkets.map((s) => createSupermarket(s));
      }
      if (Array.isArray(parsed.lists)) {
        result.lists = parsed.lists.map((l) => createShoppingList(l));
      }

      if (!result.list && !result.supermarket && !result.supermarkets && !result.lists) {
        return {
          valid: false,
          error: 'Keine Einkaufsliste oder Supermarkt-Konfiguration im Code gefunden.'
        };
      }

      return result;
    } catch (_err) {
      return {
        valid: false,
        error: 'Format nicht erkannt. Bitte gültigen SmartCart Share-Code (SC1:...) oder JSON einfügen.'
      };
    }
  }

  /**
   * Exports a shopping list (optionally bundled with its supermarket configuration)
   * into JSON, Share-Code, and formatted plain text.
   *
   * @param {Object} list
   * @param {Object} [supermarket]
   * @returns {{ payload: Object, json: string, shareCode: string, shareText: string }}
   */
  function exportShoppingList(list, supermarket = null) {
    const payload = {
      app: 'SmartCart',
      version: 1,
      type: 'shopping_list',
      exportedAt: Date.now(),
      list: createShoppingList(list),
      supermarket: supermarket ? createSupermarket(supermarket) : null
    };
    const json = JSON.stringify(payload, null, 2);
    const shareCode = encodeShareCode(payload);
    const shareText = formatListAsPlainText(list, supermarket, shareCode);

    return {
      payload,
      json,
      shareCode,
      shareText
    };
  }

  /**
   * Exports a single supermarket walking-order configuration.
   * @param {Object} supermarket
   * @returns {{ payload: Object, json: string, shareCode: string, shareText: string }}
   */
  function exportSupermarket(supermarket) {
    const cleanStore = createSupermarket(supermarket);
    const payload = {
      app: 'SmartCart',
      version: 1,
      type: 'supermarket',
      exportedAt: Date.now(),
      supermarket: cleanStore
    };
    const json = JSON.stringify(payload, null, 2);
    const shareCode = encodeShareCode(payload);
    const shareText = [
      `🏪 *SmartCart Supermarkt-Konfiguration: ${cleanStore.icon} ${cleanStore.name}*`,
      `Enthält ${cleanStore.itemOrder.length} Artikel in optimierter Laufreihenfolge.`,
      '',
      '📲 In SmartCart importieren (Share-Code):',
      shareCode
    ].join('\n');

    return {
      payload,
      json,
      shareCode,
      shareText
    };
  }

  /**
   * Exports a full backup of all supermarkets and shopping lists.
   * @param {{ supermarkets: Array, lists: Array }} state
   * @returns {{ payload: Object, json: string, shareCode: string }}
   */
  function exportFullBackup({ supermarkets = [], lists = [] } = {}) {
    const payload = {
      app: 'SmartCart',
      version: 1,
      type: 'backup',
      exportedAt: Date.now(),
      supermarkets: supermarkets.map((s) => createSupermarket(s)),
      lists: lists.map((l) => createShoppingList(l))
    };
    const json = JSON.stringify(payload, null, 2);
    const shareCode = encodeShareCode(payload);
    return {
      payload,
      json,
      shareCode
    };
  }

  /**
   * Shares content via the native mobile Web Share API (`navigator.share`) when available,
   * or copies to the clipboard as a fallback.
   *
   * @param {{ title?: string, text: string, url?: string }} options
   * @returns {Promise<{ method: string, success: boolean }>}
   */
  async function shareViaWebApi({ title = 'SmartCart Einkaufszettel', text = '', url } = {}) {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const shareData = { title, text };
        if (url) shareData.url = url;
        await navigator.share(shareData);
        return { method: 'web-share', success: true };
      } catch (err) {
        if (err && err.name === 'AbortError') {
          return { method: 'aborted', success: false };
        }
      }
    }

    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(text);
        return { method: 'clipboard', success: true };
      } catch (_err) {
        // Fall through
      }
    }

    return { method: 'manual', success: false };
  }

  /**
   * Triggers a JSON file download in the browser.
   * @param {Object|string} payloadOrJson
   * @param {string} [filename='smartcart-export.json']
   * @returns {boolean}
   */
  function downloadJsonFile(payloadOrJson, filename = 'smartcart-export.json') {
    if (typeof document === 'undefined' || typeof Blob === 'undefined') return false;
    try {
      const content =
        typeof payloadOrJson === 'string'
          ? payloadOrJson
          : JSON.stringify(payloadOrJson, null, 2);
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch (_err) {
      return false;
    }
  }

  /**
   * Architectural SyncAdapter for live multi-user collaboration.
   * Uses `BroadcastChannel` for instant cross-tab sync in the browser today
   * and exposes pluggable hooks (`setRemoteTransport`) for WebSocket / Supabase / Firebase CRDT sync.
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

    /**
     * Connects to the local BroadcastChannel and any configured remote transport.
     */
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

    /**
     * Disconnects active sync channels.
     */
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

    /**
     * Registers a listener for incoming remote updates.
     * @param {Function} callback - `(message) => void`
     * @returns {Function} Unsubscribe function
     */
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

    /**
     * Publishes a shopping list or supermarket update to connected peers.
     * @param {string} type - `'list_updated'` | `'supermarket_updated'`
     * @param {Object} data
     */
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
    SHARE_PREFIX,
    formatListAsPlainText,
    encodeShareCode,
    decodeShareCode,
    exportShoppingList,
    exportSupermarket,
    exportFullBackup,
    shareViaWebApi,
    downloadJsonFile
  };

  const shareExports = {
    ShareService,
    SyncAdapter,
    formatListAsPlainText,
    encodeShareCode,
    decodeShareCode,
    exportShoppingList,
    exportSupermarket,
    exportFullBackup,
    shareViaWebApi,
    downloadJsonFile
  };

  Object.assign(SmartCartCore, shareExports);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = shareExports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
