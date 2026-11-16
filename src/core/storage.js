/**
 * SmartCart Core - LocalStorage Persistence Repository with Automatic Seeding
 * Works in Browser (window.localStorage) and Node.js (in-memory storage adapter).
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
    getDefaultSupermarkets,
    createSupermarket,
    createShoppingList,
    createItem
  } = models;

  const { sortShoppingList } = optimizer;

  const STORAGE_KEYS = {
    SUPERMARKETS: 'smartcart_supermarkets_v1',
    LISTS: 'smartcart_lists_v1',
    ACTIVE_LIST_ID: 'smartcart_active_list_id_v1',
    SETTINGS: 'smartcart_settings_v1'
  };

  /**
   * Creates an in-memory storage fallback for Node.js or private browsing modes
   * where `window.localStorage` is unavailable or restricted.
   */
  function createMemoryStorage() {
    const store = new Map();
    return {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      },
      clear() {
        store.clear();
      }
    };
  }

  /**
   * Resolves the best available storage backend.
   * @param {Object} [customStorage]
   * @returns {Object}
   */
  function resolveStorageBackend(customStorage) {
    if (customStorage && typeof customStorage.getItem === 'function') {
      return customStorage;
    }
    try {
      if (typeof root.localStorage !== 'undefined' && root.localStorage !== null) {
        const testKey = '__smartcart_test__';
        root.localStorage.setItem(testKey, '1');
        root.localStorage.removeItem(testKey);
        return root.localStorage;
      }
    } catch (_e) {
      // Fall through to memory storage
    }
    return createMemoryStorage();
  }

  /**
   * Creates a realistic initial shopping list ("Wocheneinkauf") seeded with typical items
   * (2 already checked off at the start of the store, and 6 open items in walking order).
   * @param {Object} [supermarket]
   * @returns {Object}
   */
  function createDefaultSeedShoppingList(supermarket) {
    const targetStore = supermarket || getDefaultSupermarkets()[0];
    const now = Date.now();

    const rawItems = [
      createItem({
        id: 'seed_item_1',
        name: 'Äpfel',
        quantity: '6 Stk.',
        checked: true,
        checkedAt: now - 180000,
        originalOrder: 0
      }),
      createItem({
        id: 'seed_item_2',
        name: 'Brötchen',
        quantity: '4 Stk.',
        checked: true,
        checkedAt: now - 120000,
        originalOrder: 1
      }),
      createItem({
        id: 'seed_item_3',
        name: 'Hackfleisch',
        quantity: '500g',
        checked: false,
        originalOrder: 2
      }),
      createItem({
        id: 'seed_item_4',
        name: 'Milch',
        quantity: '2x',
        checked: false,
        originalOrder: 3
      }),
      createItem({
        id: 'seed_item_5',
        name: 'Butter',
        quantity: '250g',
        checked: false,
        originalOrder: 4
      }),
      createItem({
        id: 'seed_item_6',
        name: 'Nudeln',
        quantity: '500g',
        checked: false,
        originalOrder: 5
      }),
      createItem({
        id: 'seed_item_7',
        name: 'Passierte Tomaten',
        quantity: '2 Dosen',
        checked: false,
        originalOrder: 6
      }),
      createItem({
        id: 'seed_item_8',
        name: 'Toilettenpapier',
        quantity: '1 Pck.',
        checked: false,
        originalOrder: 7
      })
    ];

    const { sortedItems } = sortShoppingList(rawItems, targetStore);

    return createShoppingList({
      id: 'default_list_wocheneinkauf',
      name: 'Wocheneinkauf',
      supermarketId: targetStore.id,
      liveOptimizationEnabled: true,
      items: sortedItems,
      updatedAt: now
    });
  }

  /**
   * Repository class for managing supermarkets, shopping lists, and active state in LocalStorage.
   */
  class LocalStorageRepository {
    /**
     * @param {Object} [storageBackend] - Optional custom storage (`getItem`, `setItem`, `removeItem`)
     */
    constructor(storageBackend) {
      this.storage = resolveStorageBackend(storageBackend);
    }

    _readJson(key, fallbackValue) {
      try {
        const raw = this.storage.getItem(key);
        if (!raw) return fallbackValue;
        return JSON.parse(raw);
      } catch (_err) {
        return fallbackValue;
      }
    }

    _writeJson(key, value) {
      try {
        this.storage.setItem(key, JSON.stringify(value));
        return true;
      } catch (_err) {
        return false;
      }
    }

    /**
     * Loads all supermarkets from storage, automatically seeding the 3 default German
     * supermarkets (`REWE`, `ALDI`, `LIDL`) if none exist yet.
     * @returns {Array<Object>}
     */
    loadSupermarkets() {
      const stored = this._readJson(STORAGE_KEYS.SUPERMARKETS, null);
      if (Array.isArray(stored) && stored.length > 0) {
        return stored.map((s) => createSupermarket(s));
      }
      const defaults = getDefaultSupermarkets();
      this.saveSupermarkets(defaults);
      return defaults;
    }

    /**
     * Saves the array of supermarkets to storage.
     * @param {Array<Object>} supermarkets
     * @returns {Array<Object>}
     */
    saveSupermarkets(supermarkets) {
      const normalized = (supermarkets || []).map((s) => createSupermarket(s));
      this._writeJson(STORAGE_KEYS.SUPERMARKETS, normalized);
      return normalized;
    }

    /**
     * Resets supermarkets back to the 3 factory default configurations (`REWE`, `ALDI`, `LIDL`).
     * @returns {Array<Object>}
     */
    resetDefaultSupermarkets() {
      const defaults = getDefaultSupermarkets();
      this.saveSupermarkets(defaults);
      return defaults;
    }

    /**
     * Finds a supermarket by ID (falls back to first available supermarket if not found).
     * @param {string} supermarketId
     * @returns {Object}
     */
    getSupermarketById(supermarketId) {
      const supermarkets = this.loadSupermarkets();
      return (
        supermarkets.find((s) => s.id === supermarketId) ||
        supermarkets[0] ||
        getDefaultSupermarkets()[0]
      );
    }

    /**
     * Inserts or updates a supermarket configuration in storage.
     * @param {Object} supermarket
     * @returns {Object} Saved supermarket
     */
    upsertSupermarket(supermarket) {
      const cleanStore = createSupermarket({
        ...supermarket,
        updatedAt: Date.now()
      });
      const supermarkets = this.loadSupermarkets();
      const idx = supermarkets.findIndex((s) => s.id === cleanStore.id);
      if (idx !== -1) {
        supermarkets[idx] = cleanStore;
      } else {
        supermarkets.push(cleanStore);
      }
      this.saveSupermarkets(supermarkets);
      return cleanStore;
    }

    /**
     * Deletes a supermarket by ID (ensuring at least 1 supermarket always remains).
     * @param {string} supermarketId
     * @returns {Array<Object>} Remaining supermarkets
     */
    deleteSupermarket(supermarketId) {
      const supermarkets = this.loadSupermarkets();
      if (supermarkets.length <= 1) {
        return supermarkets;
      }
      const filtered = supermarkets.filter((s) => s.id !== supermarketId);
      const result = filtered.length > 0 ? filtered : getDefaultSupermarkets();
      this.saveSupermarkets(result);
      return result;
    }

    /**
     * Loads all shopping lists from storage, seeding a default list if none exist.
     * @returns {Array<Object>}
     */
    loadShoppingLists() {
      const stored = this._readJson(STORAGE_KEYS.LISTS, null);
      if (Array.isArray(stored) && stored.length > 0) {
        return stored.map((list) => createShoppingList(list));
      }
      const stores = this.loadSupermarkets();
      const seedList = createDefaultSeedShoppingList(stores[0]);
      this.saveShoppingLists([seedList]);
      this.setActiveListId(seedList.id);
      return [seedList];
    }

    /**
     * Saves all shopping lists to storage.
     * @param {Array<Object>} lists
     * @returns {Array<Object>}
     */
    saveShoppingLists(lists) {
      const normalized = (lists || []).map((l) => createShoppingList(l));
      this._writeJson(STORAGE_KEYS.LISTS, normalized);
      return normalized;
    }

    /**
     * Gets the currently active shopping list ID.
     * @returns {string}
     */
    getActiveListId() {
      const raw = this.storage.getItem(STORAGE_KEYS.ACTIVE_LIST_ID);
      if (raw) return raw;
      const lists = this.loadShoppingLists();
      const firstId = lists[0].id;
      this.setActiveListId(firstId);
      return firstId;
    }

    /**
     * Sets the currently active shopping list ID.
     * @param {string} listId
     */
    setActiveListId(listId) {
      if (listId) {
        this.storage.setItem(STORAGE_KEYS.ACTIVE_LIST_ID, String(listId));
      }
    }

    /**
     * Returns the currently active shopping list object (sorted for its active supermarket).
     * @returns {Object}
     */
    getActiveList() {
      const lists = this.loadShoppingLists();
      const activeId = this.getActiveListId();
      const found = lists.find((l) => l.id === activeId) || lists[0];
      const store = this.getSupermarketById(found.supermarketId);
      const { sortedItems } = sortShoppingList(found, store);
      return {
        ...found,
        items: sortedItems
      };
    }

    /**
     * Inserts or updates a shopping list in storage.
     * @param {Object} list
     * @returns {Object}
     */
    upsertShoppingList(list) {
      const cleanList = createShoppingList({
        ...list,
        updatedAt: Date.now()
      });
      const lists = this.loadShoppingLists();
      const idx = lists.findIndex((l) => l.id === cleanList.id);
      if (idx !== -1) {
        lists[idx] = cleanList;
      } else {
        lists.push(cleanList);
      }
      this.saveShoppingLists(lists);
      return cleanList;
    }

    /**
     * Saves the active shopping list and sets it as the active list ID.
     * @param {Object} list
     * @returns {Object}
     */
    saveActiveList(list) {
      const saved = this.upsertShoppingList(list);
      this.setActiveListId(saved.id);
      return saved;
    }

    /**
     * Creates a new shopping list, persists it, and activates it.
     * @param {Object} params
     * @returns {Object}
     */
    createNewShoppingList(params = {}) {
      const stores = this.loadSupermarkets();
      const newList = createShoppingList({
        name: params.name || 'Neuer Einkaufszettel',
        supermarketId: params.supermarketId || stores[0].id,
        liveOptimizationEnabled:
          params.liveOptimizationEnabled === undefined ? true : Boolean(params.liveOptimizationEnabled),
        items: params.items || []
      });
      return this.saveActiveList(newList);
    }

    /**
     * Deletes a shopping list by ID (creates a fresh list if the last one was deleted).
     * @param {string} listId
     * @returns {Array<Object>}
     */
    deleteShoppingList(listId) {
      const lists = this.loadShoppingLists();
      const filtered = lists.filter((l) => l.id !== listId);
      if (filtered.length === 0) {
        const fresh = this.createNewShoppingList({ name: 'Mein Einkaufszettel' });
        return [fresh];
      }
      this.saveShoppingLists(filtered);
      if (this.getActiveListId() === listId) {
        this.setActiveListId(filtered[0].id);
      }
      return filtered;
    }

    /**
     * Loads the complete application state in one call.
     * @returns {{ supermarkets: Array, lists: Array, activeList: Object, activeSupermarket: Object }}
     */
    loadState() {
      const supermarkets = this.loadSupermarkets();
      const lists = this.loadShoppingLists();
      const activeList = this.getActiveList();
      const activeSupermarket =
        supermarkets.find((s) => s.id === activeList.supermarketId) || supermarkets[0];

      return {
        supermarkets,
        lists,
        activeList,
        activeSupermarket
      };
    }

    /**
     * Clears all SmartCart keys from storage.
     */
    clearAll() {
      Object.values(STORAGE_KEYS).forEach((key) => {
        this.storage.removeItem(key);
      });
    }
  }

  // Bind default static methods onto LocalStorageRepository so both
  // `new LocalStorageRepository()` and `LocalStorageRepository.loadSupermarkets()` work seamlessly.
  const defaultRepository = new LocalStorageRepository();
  [
    'loadSupermarkets',
    'saveSupermarkets',
    'resetDefaultSupermarkets',
    'getSupermarketById',
    'upsertSupermarket',
    'deleteSupermarket',
    'loadShoppingLists',
    'saveShoppingLists',
    'getActiveListId',
    'setActiveListId',
    'getActiveList',
    'upsertShoppingList',
    'saveActiveList',
    'createNewShoppingList',
    'deleteShoppingList',
    'loadState',
    'clearAll'
  ].forEach((methodName) => {
    LocalStorageRepository[methodName] = (...args) =>
      defaultRepository[methodName](...args);
  });

  const storageExports = {
    STORAGE_KEYS,
    createMemoryStorage,
    createDefaultSeedShoppingList,
    LocalStorageRepository,
    storageRepository: defaultRepository
  };

  Object.assign(SmartCartCore, storageExports);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = storageExports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
