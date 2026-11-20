/**
 * SmartCart Mobile UI Controller (`src/ui/app.js`)
 *
 * Verbindet die Benutzeroberfläche (Android / iOS / Web PWA) mit den
 * Kernmodulen aus `window.SmartCartCore` (`models.js`, `optimizer.js`,
 * `ocr.js`, `storage.js`, `share.js`).
 */
(function (root) {
  'use strict';

  const Core = root.SmartCartCore || {};

  /**
   * Zentraler UI- und Anwendungszustand der SmartCart-App.
   */
  const state = {
    supermarkets: [],
    shoppingLists: [],
    shoppingList: null,
    configSelectedStoreId: 'rewe',
    pendingLiveOpt: null,
    pendingMoveItem: null,
    pendingListModalMode: null,
    pendingEditItemId: null,
    pendingEditStoreIndex: null,
    longPressState: {
      timerId: null,
      feedbackTimerId: null,
      activeRow: null,
      itemId: null,
      startX: 0,
      startY: 0,
      pointerId: null,
      triggered: false,
      triggeredPointerId: null,
      windowCleanupBound: false,
      suppressNextClickUntil: 0
    },
    dragState: {
      dragFromIndex: null,
      dragCurrentOverIndex: null,
      touchDragFromIndex: null,
      touchCurrentOverIndex: null,
      pointerClientX: 0,
      pointerClientY: 0,
      autoScrollRafId: null,
      autoScrollLastTime: 0,
      autoScrollSpeed: 0,
      ghostEl: null,
      ghostOffsetY: 0
    },
    parsedOcrItems: [],
    activeTab: 'tab-list',
    syncAdapter: null
  };

  /**
   * Gibt die aktive Repository-Instanz (`LocalStorageRepository` / `storageRepository`) zurück.
   * @returns {Object}
   */
  function getRepository() {
    return Core.storageRepository || Core.LocalStorageRepository || null;
  }

  /**
   * Formatiert eine Ware oder einen Supermarkt-Eintrag inkl. optionaler Spezifikation
   * als lesbaren Anzeigetext (`"Ware (Spezifikation)"` bzw. `"Ware"`).
   * @param {string|Object} itemOrEntry
   * @param {string} [spec]
   * @returns {string}
   */
  function formatDisplayName(itemOrEntry, spec) {
    if (typeof Core.formatItemDisplayName === 'function') {
      return Core.formatItemDisplayName(itemOrEntry, spec);
    }
    if (!itemOrEntry) return '';
    if (typeof itemOrEntry === 'object') {
      const n = String(itemOrEntry.name || '').trim();
      const s = String(itemOrEntry.specification || '').trim();
      return s ? `${n} (${s})` : n;
    }
    const n = String(itemOrEntry).trim();
    const s = spec ? String(spec).trim() : '';
    return s ? `${n} (${s})` : n;
  }

  /**
   * Normalisiert einen Supermarkt-Sortiereintrag (String oder `{ name, specification }`)
   * in ein kanonisches Objekt `{ name, specification }`.
   * @param {string|Object} entry
   * @returns {{ name: string, specification: string }}
   */
  function normalizeEntryObj(entry) {
    if (!entry) return { name: '', specification: '' };
    if (typeof entry === 'string') return { name: entry.trim(), specification: '' };
    return {
      name: String(entry.name || '').trim(),
      specification: String(entry.specification || '').trim()
    };
  }

  /**
   * Initialisiert die SmartCart-App beim Laden des Dokuments:
   * Lädt gespeicherte Supermärkte und alle gespeicherten Einkaufszettel aus dem Storage,
   * verbindet den Echtzeit-SyncAdapter (BroadcastChannel), registriert Event-Listener,
   * initialisiert den leeren OCR-Bereitschaftszustand und rendert die UI.
   */
  function initSmartCartApp() {
    loadInitialState();
    initRealtimeSync();
    bindEventListeners();
    renderApp();
    const ocrTextarea = document.getElementById('ocr-raw-textarea');
    renderOcrPreviewFromText(ocrTextarea ? ocrTextarea.value : '');
    registerServiceWorkerIfSupported();
  }

  /**
   * Verbindet den `SyncAdapter` für tab- und fensterübergreifende Echtzeit-Synchronisation.
   */
  function initRealtimeSync() {
    if (typeof Core.SyncAdapter === 'function') {
      state.syncAdapter = new Core.SyncAdapter();
      state.syncAdapter.connect();
      state.syncAdapter.onRemoteUpdate((msg) => {
        if (!msg || !msg.data) return;
        if (msg.type === 'state_updated') {
          if (Array.isArray(msg.data.supermarkets)) {
            state.supermarkets = msg.data.supermarkets;
          }
          if (Array.isArray(msg.data.shoppingLists)) {
            state.shoppingLists = msg.data.shoppingLists;
          }
          if (msg.data.shoppingList) {
            state.shoppingList = msg.data.shoppingList;
          }
          renderApp();
        }
      });
    }
  }

  /**
   * Lädt Supermärkte, gespeicherte Einkaufszettel und den aktiven Einkaufszettel
   * über `LocalStorageRepository` (mit automatischem Seeding beim ersten Start).
   */
  function loadInitialState() {
    const repo = getRepository();

    let loadedStores = null;
    let loadedLists = null;
    let loadedList = null;

    if (repo) {
      if (typeof repo.loadSupermarkets === 'function') {
        loadedStores = repo.loadSupermarkets();
      }
      if (typeof repo.loadShoppingLists === 'function') {
        loadedLists = repo.loadShoppingLists();
      }
      if (typeof repo.getActiveList === 'function') {
        loadedList = repo.getActiveList();
      }
    }

    if (!Array.isArray(loadedStores) || loadedStores.length === 0) {
      loadedStores =
        typeof Core.getDefaultSupermarkets === 'function'
          ? Core.getDefaultSupermarkets()
          : [];
    }

    state.supermarkets = loadedStores;

    if (!loadedList) {
      loadedList =
        Array.isArray(loadedLists) && loadedLists.length > 0
          ? loadedLists[0]
          : typeof Core.createDefaultSeedShoppingList === 'function'
          ? Core.createDefaultSeedShoppingList(state.supermarkets[0])
          : createInitialStarterList(state.supermarkets[0]);
    }

    const activeStore =
      state.supermarkets.find((s) => s.id === loadedList.supermarketId) ||
      state.supermarkets[0];
    if (activeStore && typeof Core.sortShoppingList === 'function') {
      const { sortedItems } = Core.sortShoppingList(loadedList, activeStore);
      loadedList = {
        ...loadedList,
        items: sortedItems
      };
    }

    state.shoppingList = loadedList;

    if (!Array.isArray(loadedLists) || loadedLists.length === 0) {
      loadedLists = [loadedList];
    } else {
      const existsIdx = loadedLists.findIndex((l) => l.id === loadedList.id);
      if (existsIdx !== -1) {
        loadedLists[existsIdx] = loadedList;
      } else {
        loadedLists.push(loadedList);
      }
    }

    state.shoppingLists = loadedLists;
    state.configSelectedStoreId =
      loadedList.supermarketId || (state.supermarkets[0] && state.supermarkets[0].id) || 'rewe';

    saveAppState();
  }

  /**
   * Erzeugt eine realistische Beispiel-Einkaufsliste, sortiert nach der Laufreihenfolge
   * des übergebenen Supermarkts.
   * @param {Object} supermarket - Aktiver Supermarkt
   * @returns {Object} Initialisierte Einkaufsliste
   */
  function createInitialStarterList(supermarket) {
    const storeId = supermarket ? supermarket.id : 'rewe';
    const starterItems = [
      { name: 'Bananen', quantity: '1 Bund' },
      { name: 'Tomaten', quantity: '500g' },
      { name: 'Brötchen', quantity: '6 Stk' },
      { name: 'Vollmilch', quantity: '2L' },
      { name: 'Butter', quantity: '250g' },
      { name: 'Eier', quantity: '10er' },
      { name: 'Spaghetti', quantity: '500g' },
      { name: 'Passierte Tomaten', quantity: '2 Dosen' },
      { name: 'Mineralwasser', quantity: '6x 1,5L' },
      { name: 'Tiefkühlpizza', quantity: '2x' }
    ];

    let list = Core.createShoppingList({
      id: state.shoppingList ? state.shoppingList.id : undefined,
      name: state.shoppingList && state.shoppingList.name ? state.shoppingList.name : 'Wocheneinkauf',
      supermarketId: storeId,
      liveOptimizationEnabled: true,
      items: []
    });

    if (typeof Core.addMultipleItemsToList === 'function') {
      const res = Core.addMultipleItemsToList(list, supermarket, starterItems);
      list = res.list;
    }

    return list;
  }

  /**
   * Gibt die aktuell für den Einkaufszettel ausgewählte Supermarkt-Konfiguration zurück.
   * @returns {Object} Supermarkt-Objekt
   */
  function getActiveSupermarket() {
    const targetId = state.shoppingList && state.shoppingList.supermarketId;
    return (
      state.supermarkets.find((s) => s.id === targetId) ||
      state.supermarkets[0] ||
      Core.createSupermarket({ id: 'rewe', name: 'REWE', itemOrder: [] })
    );
  }

  /**
   * Gibt den im Tab "Supermärkte" ausgewählten Supermarkt zur Bearbeitung zurück.
   * @returns {Object} Supermarkt-Objekt
   */
  function getConfigSupermarket() {
    return (
      state.supermarkets.find((s) => s.id === state.configSelectedStoreId) ||
      getActiveSupermarket()
    );
  }

  /**
   * Speichert alle Supermärkte, die Liste aller Einkaufszettel und den aktiven Einkaufszettel
   * dauerhaft im Browser (`LocalStorageRepository` & SyncAdapter).
   */
  function saveAppState() {
    const repo = getRepository();
    if (repo) {
      if (typeof repo.saveSupermarkets === 'function') {
        repo.saveSupermarkets(state.supermarkets);
      }
      if (state.shoppingList && typeof repo.saveActiveList === 'function') {
        state.shoppingList = repo.saveActiveList(state.shoppingList);
      }
      if (typeof repo.loadShoppingLists === 'function') {
        state.shoppingLists = repo.loadShoppingLists();
      }
    } else if (state.shoppingList) {
      const idx = state.shoppingLists.findIndex((l) => l.id === state.shoppingList.id);
      if (idx !== -1) {
        state.shoppingLists[idx] = state.shoppingList;
      } else {
        state.shoppingLists.push(state.shoppingList);
      }
    }

    if (state.syncAdapter && typeof state.syncAdapter.publishUpdate === 'function') {
      state.syncAdapter.publishUpdate('state_updated', {
        supermarkets: state.supermarkets,
        shoppingLists: state.shoppingLists,
        shoppingList: state.shoppingList
      });
    }
  }

  /**
   * Wechselt zwischen den 4 Haupt-Tabs der mobilen App.
   * @param {string} tabId - ID des Ziel-Tabs (`tab-list`, `tab-ocr`, `tab-stores`, `tab-share`)
   */
  function switchTab(tabId) {
    stopDragAutoScroll();
    cancelUnknownItemLongPress();
    state.activeTab = tabId;
    document.querySelectorAll('.tab-view').forEach((section) => {
      section.classList.toggle('active', section.id === tabId);
    });
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    if (tabId === 'tab-stores') {
      renderSupermarketConfigurator();
    } else if (tabId === 'tab-ocr') {
      const store = getActiveSupermarket();
      const targetSpan = document.getElementById('ocr-target-store-name');
      if (targetSpan && store) targetSpan.textContent = store.name;
    } else if (tabId === 'tab-share') {
      renderExportImportTabSummary();
    }
  }

  /* ==========================================================================
   * Einkaufszettel-Verwaltung (Speichern, Benennen, Wechseln, Neu, Löschen)
   * ========================================================================== */

  /**
   * Rendert die Einkaufszettel-Verwaltungsleiste (`#shoppingListSelect` & Anzahl-Badge)
   * oben im Haupt-Tab `tab-list`.
   */
  function renderShoppingListsBar() {
    const selectEl = document.getElementById('shoppingListSelect');
    const countBadge = document.getElementById('shopping-lists-count-badge');

    const lists = Array.isArray(state.shoppingLists) && state.shoppingLists.length > 0
      ? state.shoppingLists
      : state.shoppingList
      ? [state.shoppingList]
      : [];

    if (countBadge) {
      countBadge.textContent = `${lists.length} ${lists.length === 1 ? 'Zettel' : 'Zettel'}`;
    }

    if (selectEl) {
      const activeId = state.shoppingList && state.shoppingList.id;
      selectEl.innerHTML = lists
        .map((list) => {
          const items = Array.isArray(list.items) ? list.items : [];
          const checkedCount = items.filter((i) => i.checked).length;
          const openCount = items.length - checkedCount;
          const store = state.supermarkets.find((s) => s.id === list.supermarketId);
          const storeLabel = store ? ` • ${store.name}` : '';
          const isSelected = list.id === activeId;
          return `<option value="${escapeHtml(list.id)}" ${isSelected ? 'selected' : ''}>📋 ${escapeHtml(
            list.name || 'Einkaufszettel'
          )} (${openCount} offen / ${checkedCount} erledigt${escapeHtml(storeLabel)})</option>`;
        })
        .join('');
    }
  }

  /**
   * Wechselt den aktiven Einkaufszettel anhand der ausgewählten ID aus `#shoppingListSelect`.
   * @param {string} listId - ID des zu ladenden Einkaufszettels
   */
  function handleSwitchShoppingList(listId) {
    if (!listId) return;
    const repo = getRepository();
    let switched = null;

    if (repo && typeof repo.switchShoppingList === 'function') {
      switched = repo.switchShoppingList(listId);
      state.shoppingLists = repo.loadShoppingLists();
    } else {
      switched = state.shoppingLists.find((l) => l.id === listId) || state.shoppingList;
    }

    if (!switched) return;

    const store =
      state.supermarkets.find((s) => s.id === switched.supermarketId) ||
      state.supermarkets[0];
    if (store && typeof Core.sortShoppingList === 'function') {
      const { sortedItems } = Core.sortShoppingList(switched, store);
      switched = { ...switched, items: sortedItems };
    }

    state.shoppingList = switched;
    if (store) {
      state.configSelectedStoreId = store.id;
    }

    saveAppState();
    renderApp();
    showToast(`📋 Einkaufszettel „${switched.name}“ geladen!`, 'info');
  }

  /**
   * Öffnet das Modal zum Anlegen eines neuen Einkaufszettels (`mode = 'create'`)
   * oder zum Umbenennen des aktuellen Einkaufszettels (`mode = 'rename'`).
   * @param {'create'|'rename'} [mode='create']
   */
  function openShoppingListModal(mode = 'create') {
    state.pendingListModalMode = mode;
    const modal = document.getElementById('shopping-list-modal');
    const titleEl = document.getElementById('shopping-list-modal-title');
    const nameInput = document.getElementById('shopping-list-modal-name');
    const storeGroup = document.getElementById('shopping-list-modal-store-group');
    const storeSelect = document.getElementById('shopping-list-modal-store');
    const confirmBtn = document.getElementById('shopping-list-modal-confirm-btn');

    if (!modal || !nameInput) {
      if (mode === 'rename') {
        const currentName = (state.shoppingList && state.shoppingList.name) || 'Mein Einkaufszettel';
        const entered = typeof window !== 'undefined' && typeof window.prompt === 'function'
          ? window.prompt('Neuer Name für den Einkaufszettel:', currentName)
          : null;
        if (entered && entered.trim()) {
          handleRenameShoppingList(entered.trim());
        }
      } else {
        const entered = typeof window !== 'undefined' && typeof window.prompt === 'function'
          ? window.prompt('Name für den neuen Einkaufszettel:', 'Neuer Einkaufszettel')
          : 'Neuer Einkaufszettel';
        if (entered && entered.trim()) {
          handleCreateNewShoppingList(entered.trim(), getActiveSupermarket().id);
        }
      }
      return;
    }

    if (mode === 'rename') {
      if (titleEl) titleEl.textContent = 'Einkaufszettel umbenennen';
      nameInput.value = (state.shoppingList && state.shoppingList.name) || '';
      if (storeGroup) storeGroup.style.display = 'none';
      if (confirmBtn) confirmBtn.textContent = '✅ Namen speichern';
    } else {
      if (titleEl) titleEl.textContent = 'Neuen Einkaufszettel anlegen';
      nameInput.value = '';
      if (storeGroup) storeGroup.style.display = 'block';
      if (storeSelect) {
        const activeStore = getActiveSupermarket();
        storeSelect.innerHTML = state.supermarkets
          .map(
            (s) =>
              `<option value="${escapeHtml(s.id)}" ${
                s.id === activeStore.id ? 'selected' : ''
              }>${escapeHtml(s.icon || '🏪')} ${escapeHtml(s.name)}</option>`
          )
          .join('');
      }
      if (confirmBtn) confirmBtn.textContent = '✅ Einkaufszettel anlegen';
    }

    modal.classList.add('open');
    setTimeout(() => nameInput.focus(), 40);
  }

  /**
   * Schließt das Einkaufszettel-Modal (`#shopping-list-modal`).
   */
  function closeShoppingListModal() {
    state.pendingListModalMode = null;
    const modal = document.getElementById('shopping-list-modal');
    if (modal) modal.classList.remove('open');
  }

  /**
   * Verarbeitet das Absenden des Einkaufszettel-Modals (`+ Neu` oder `✎ Umbenennen`).
   * @param {Event} event - Submit-Event
   */
  function handleShoppingListModalSubmit(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById('shopping-list-modal-name');
    const storeSelect = document.getElementById('shopping-list-modal-store');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return;

    const mode = state.pendingListModalMode || 'create';
    closeShoppingListModal();

    if (mode === 'rename') {
      handleRenameShoppingList(name);
    } else {
      const storeId = storeSelect && storeSelect.value ? storeSelect.value : getActiveSupermarket().id;
      handleCreateNewShoppingList(name, storeId);
    }
  }

  /**
   * Legt einen neuen benannten Einkaufszettel an, speichert ihn in `state.shoppingLists`
   * und aktiviert ihn sofort.
   * @param {string|Event} [nameOrEvent] - Name des neuen Einkaufszettels oder Klick-Event
   * @param {string} [supermarketId] - Optionaler Ziel-Supermarkt
   */
  function handleCreateNewShoppingList(nameOrEvent, supermarketId) {
    if (!nameOrEvent || typeof nameOrEvent !== 'string') {
      openShoppingListModal('create');
      return;
    }

    const cleanName = nameOrEvent.trim() || 'Neuer Einkaufszettel';
    const targetStoreId = supermarketId || getActiveSupermarket().id;
    const repo = getRepository();

    let newList;
    if (repo && typeof repo.createNewShoppingList === 'function') {
      newList = repo.createNewShoppingList({
        name: cleanName,
        supermarketId: targetStoreId,
        liveOptimizationEnabled: true,
        items: []
      });
      state.shoppingLists = repo.loadShoppingLists();
    } else {
      newList = Core.createShoppingList({
        name: cleanName,
        supermarketId: targetStoreId,
        liveOptimizationEnabled: true,
        items: []
      });
      state.shoppingLists.push(newList);
    }

    state.shoppingList = newList;
    state.configSelectedStoreId = newList.supermarketId;
    saveAppState();
    renderApp();
    showToast(`📋 Neuer Einkaufszettel „${newList.name}“ angelegt und aktiviert!`, 'success');
  }

  /**
   * Benennt den aktuellen Einkaufszettel um und aktualisiert ihn im Storage.
   * @param {string|Event} [newNameOrEvent] - Neuer Name oder Klick-Event
   */
  function handleRenameShoppingList(newNameOrEvent) {
    if (!newNameOrEvent || typeof newNameOrEvent !== 'string') {
      openShoppingListModal('rename');
      return;
    }

    const cleanName = newNameOrEvent.trim();
    if (!cleanName || !state.shoppingList) return;

    const repo = getRepository();
    if (repo && typeof repo.renameShoppingList === 'function') {
      state.shoppingList = repo.renameShoppingList(state.shoppingList.id, cleanName);
      state.shoppingLists = repo.loadShoppingLists();
    } else {
      state.shoppingList = {
        ...state.shoppingList,
        name: cleanName,
        updatedAt: Date.now()
      };
    }

    saveAppState();
    renderApp();
    showToast(`✎ Einkaufszettel umbenannt in „${state.shoppingList.name}“!`, 'success');
  }

  /**
   * Speichert den aktuellen Einkaufszettel explizit unter seinem Namen in der
   * Einkaufszettel-Verwaltung und zeigt eine Bestätigungsmeldung an.
   */
  function handleSaveShoppingList() {
    if (!state.shoppingList) return;
    state.shoppingList = {
      ...state.shoppingList,
      updatedAt: Date.now()
    };
    saveAppState();
    renderApp();
    showToast(`💾 Einkaufszettel „${state.shoppingList.name}“ gespeichert`, 'success');
  }

  /**
   * Löscht den aktuell ausgewählten Einkaufszettel (mit Sicherheitsabfrage, falls Waren enthalten sind)
   * und wechselt automatisch zum nächsten gespeicherten Einkaufszettel.
   */
  function handleDeleteShoppingList() {
    if (!state.shoppingList) return;
    const currentList = state.shoppingList;
    const itemCount = (currentList.items && currentList.items.length) || 0;

    if (
      itemCount > 0 &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function'
    ) {
      const confirmed = window.confirm(
        `Möchtest du den Einkaufszettel „${currentList.name}“ (${itemCount} Waren) wirklich löschen?`
      );
      if (!confirmed) return;
    }

    const deletedName = currentList.name;
    const repo = getRepository();

    if (repo && typeof repo.deleteShoppingList === 'function') {
      state.shoppingLists = repo.deleteShoppingList(currentList.id);
      state.shoppingList = repo.getActiveList();
    } else {
      state.shoppingLists = state.shoppingLists.filter((l) => l.id !== currentList.id);
      if (state.shoppingLists.length === 0) {
        const fresh = Core.createShoppingList({
          name: 'Mein Einkaufszettel',
          supermarketId: getActiveSupermarket().id,
          liveOptimizationEnabled: true,
          items: []
        });
        state.shoppingLists = [fresh];
      }
      state.shoppingList = state.shoppingLists[0];
    }

    state.configSelectedStoreId = state.shoppingList.supermarketId;
    saveAppState();
    renderApp();
    showToast(`🗑️ Einkaufszettel „${deletedName}“ gelöscht.`, 'info');
  }

  /* ==========================================================================
   * TAB 1: Einkaufszettel & Live-Optimierung Funktionen
   * ========================================================================== */

  /**
   * Wechselt den aktiven Supermarkt für die Einkaufsliste und sortiert alle Waren
   * sofort automatisch entsprechend der Laufreihenfolge dieses Supermarkts um.
   * @param {string} supermarketId - ID des gewählten Supermarkts
   */
  function selectSupermarket(supermarketId) {
    const newStore = state.supermarkets.find((s) => s.id === supermarketId);
    if (!newStore) return;

    state.shoppingList = Core.changeListSupermarket(state.shoppingList, newStore);
    state.configSelectedStoreId = newStore.id;
    saveAppState();
    renderApp();
    showToast(
      `🏪 Supermarkt gewechselt zu ${newStore.name} – Reihenfolge automatisch angepasst!`,
      'success'
    );
  }

  /**
   * Schaltet die Funktion "Live-Optimierung" auf dem Einkaufszettel ein oder aus.
   * @param {boolean} enabled - Ob Live-Optimierung aktiv sein soll
   */
  function handleToggleLiveOptimization(enabled) {
    state.shoppingList = Core.setLiveOptimization(state.shoppingList, enabled);
    saveAppState();
    renderLiveOptimizationHeader();
    showToast(
      enabled
        ? '⚡ Live-Optimierung aktiviert: Abweichungen beim Abhaken werden erkannt.'
        : '⏸️ Live-Optimierung deaktiviert: Abhaken ohne Rückfrage.',
      'info'
    );
  }

  /**
   * Fügt eine neue Ware über das Eingabeformular (oder Schnellauswahl-Chip) zur Einkaufsliste hinzu.
   * Erkennt automatisch, ob der Nutzer die Position der Ware im Supermarkt bereits passiert hat
   * (`wasAddedLate === true`) und reiht sie in diesem Fall als unmittelbare nächste offene Ware ein!
   * @param {Event} [event] - Submit-Event des Formulars
   */
  function handleAddItemSubmit(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById('add-item-name');
    const specInput = document.getElementById('add-item-spec');
    const qtyInput = document.getElementById('add-item-qty');
    const name = nameInput ? nameInput.value.trim() : '';
    const specification = specInput ? specInput.value.trim() : '';
    const quantity = qtyInput && qtyInput.value.trim() ? qtyInput.value.trim() : '1x';

    if (!name) return;

    const activeStore = getActiveSupermarket();
    const result = Core.addItemToList(state.shoppingList, activeStore, {
      name,
      specification,
      quantity
    });
    state.shoppingList = result.list;

    if (nameInput) nameInput.value = '';
    if (specInput) specInput.value = '';
    if (qtyInput) qtyInput.value = '';

    saveAppState();
    renderApp();

    const addedLabel = formatDisplayName(result.addedItem);
    if (result.wasAddedLate) {
      const passedNames = (result.passedByItems || [])
        .map((i) => formatDisplayName(i))
        .join(', ');
      showToast(
        `⚡ „${addedLabel}“ als nächste offene Ware einsortiert, da du an der Stelle im Markt (vor ${passedNames}) schon vorbei bist!`,
        'late'
      );
    } else if (result.addedItem && result.addedItem.isUnknownInStore) {
      showToast(
        `🆕 „${addedLabel}“ am Anfang der Liste ergänzt (noch nicht in ${activeStore.name} – zum Hinzufügen lange gedrückt halten).`,
        'info'
      );
    } else {
      showToast(`✅ „${addedLabel}“ in Laufreihenfolge (${activeStore.name}) einsortiert.`, 'success');
    }
  }

  /**
   * Öffnet das Modal zum Bearbeiten einer Ware (Name, optionale Spezifikation, Menge)
   * auf dem aktuellen Einkaufszettel.
   * @param {string} itemId
   * @param {Event} [event]
   */
  function openEditItemModal(itemId, event) {
    if (event) event.stopPropagation();
    const items = (state.shoppingList && state.shoppingList.items) || [];
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    state.pendingEditItemId = itemId;
    const modal = document.getElementById('edit-item-modal');
    const nameInput = document.getElementById('edit-item-name');
    const specInput = document.getElementById('edit-item-spec');
    const qtyInput = document.getElementById('edit-item-qty');

    if (nameInput) nameInput.value = item.name || '';
    if (specInput) specInput.value = item.specification || '';
    if (qtyInput) qtyInput.value = item.quantity || '1x';

    if (modal) {
      modal.classList.add('open');
      if (nameInput) setTimeout(() => nameInput.focus(), 40);
    }
  }

  /**
   * Schließt das Ware-bearbeiten-Modal (`#edit-item-modal`).
   */
  function closeEditItemModal() {
    state.pendingEditItemId = null;
    const modal = document.getElementById('edit-item-modal');
    if (modal) modal.classList.remove('open');
  }

  /**
   * Speichert die geänderten Daten (Name, Spezifikation, Menge) einer Ware auf der Einkaufsliste.
   * @param {Event} [event]
   */
  function handleEditItemModalSubmit(event) {
    if (event) event.preventDefault();
    const itemId = state.pendingEditItemId;
    if (!itemId || !state.shoppingList) {
      closeEditItemModal();
      return;
    }

    const nameInput = document.getElementById('edit-item-name');
    const specInput = document.getElementById('edit-item-spec');
    const qtyInput = document.getElementById('edit-item-qty');
    const name = nameInput ? nameInput.value.trim() : '';
    const specification = specInput ? specInput.value.trim() : '';
    const quantity = qtyInput && qtyInput.value.trim() ? qtyInput.value.trim() : '1x';

    if (!name) return;

    const activeStore = getActiveSupermarket();
    if (typeof Core.updateItemInList === 'function') {
      state.shoppingList = Core.updateItemInList(state.shoppingList, activeStore, itemId, {
        name,
        specification,
        quantity
      });
    }

    closeEditItemModal();
    saveAppState();
    renderApp();
    showToast(`✎ „${formatDisplayName(name, specification)}“ aktualisiert.`, 'success');
  }

  /**
   * Fügt eine auf der Einkaufsliste noch unbekannte Ware (inkl. optionaler Spezifikation)
   * per langem Gedrückthalten dem aktuellen Supermarkt hinzu, sodass sie dort wie gewohnt
   * manuell einsortiert werden kann.
   * @param {string} itemId - ID der Einkaufslisten-Ware
   */
  function handleAddUnknownItemToSupermarket(itemId) {
    if (!itemId || !state.shoppingList) return;
    const items = state.shoppingList.items || [];
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const activeStore = getActiveSupermarket();
    if (!activeStore || typeof Core.addItemToSupermarket !== 'function') return;

    const res = Core.addItemToSupermarket(activeStore, targetItem, {
      list: state.shoppingList
    });

    if (!res || !res.supermarket) return;

    state.supermarkets = state.supermarkets.map((s) =>
      s.id === res.supermarket.id ? res.supermarket : s
    );
    if (res.list) {
      state.shoppingList = res.list;
    } else {
      state.shoppingList = Core.changeListSupermarket(state.shoppingList, res.supermarket);
    }

    saveAppState();
    renderApp();

    const displayLabel = formatDisplayName(res.entry || targetItem);
    if (res.added) {
      showToast(
        `🏪 „${displayLabel}“ zu ${res.supermarket.name} (Pos. ${res.index + 1}) hinzugefügt! Du kannst die Position unter „Supermärkte“ frei sortieren.`,
        'success'
      );
    } else if (res.alreadyExists) {
      showToast(
        `ℹ️ „${displayLabel}“ ist bereits in ${res.supermarket.name} (Pos. ${res.index + 1}) vorhanden.`,
        'info'
      );
    }
  }

  /**
   * Behandelt das Abhaken oder Rückgängig-Machen (Uncheck) einer Ware auf der Einkaufsliste.
   * @param {string} itemId - ID der angeklickten Ware
   */
  function handleItemToggleCheck(itemId) {
    const activeStore = getActiveSupermarket();
    const result = Core.toggleItemCheck(state.shoppingList, activeStore, itemId);
    state.shoppingList = result.list;
    saveAppState();
    renderApp();

    if (result.action === 'checked') {
      if (result.outOfOrderDetected) {
        openLiveOptimizationModal({
          supermarket: activeStore,
          checkedItem: result.checkedItem,
          skippedItems: result.skippedItems,
          promptMessage: result.promptMessage
        });
      }
    } else if (result.action === 'unchecked' && result.uncheckedItem) {
      showToast(
        `↩️ „${formatDisplayName(result.uncheckedItem)}“ wieder an der optimierten Position für ${activeStore.name} eingereiht.`,
        'info'
      );
    }
  }

  /**
   * Öffnet das Modal für die Live-Optimierung, wenn der Nutzer bei eingeschalteter
   * Live-Optimierung eine Ware außerhalb der geplanten Supermarkt-Reihenfolge abhakt.
   * @param {Object} checkResult - `{ supermarket, checkedItem, skippedItems, promptMessage }`
   */
  function openLiveOptimizationModal(checkResult) {
    state.pendingLiveOpt = checkResult;
    const modal = document.getElementById('live-opt-modal');
    const textEl = document.getElementById('live-opt-modal-text');
    const detailsEl = document.getElementById('live-opt-modal-details');

    const checkedLabel = formatDisplayName(checkResult.checkedItem);
    const skippedNames = (checkResult.skippedItems || [])
      .map((i) => formatDisplayName(i))
      .join(', ');
    const storeName = checkResult.supermarket ? checkResult.supermarket.name : 'diesen Supermarkt';

    if (textEl) {
      textEl.textContent =
        checkResult.promptMessage ||
        `Reihenfolge im Supermarkt anpassen? Du hast „${checkedLabel}“ vor „${skippedNames}“ abgehakt. Soll die Konfiguration für ${storeName} automatisch angepasst werden?`;
    }

    if (detailsEl) {
      const firstSkipped =
        checkResult.skippedItems && checkResult.skippedItems[0]
          ? formatDisplayName(checkResult.skippedItems[0])
          : skippedNames;
      detailsEl.innerHTML =
        `<strong>Geplante Anpassung in ${escapeHtml(storeName)}:</strong><br />` +
        `„${escapeHtml(checkedLabel)}“ wird in der Laufreihenfolge vor „${escapeHtml(firstSkipped)}“ verschoben.`;
    }

    if (modal) modal.classList.add('open');
  }

  /**
   * Bestätigt die Live-Optimierungs-Anpassung: Aktualisiert `supermarket.itemOrder`
   * über `SmartCartCore.applyLiveOptimizationUpdate`, sortiert die Einkaufsliste neu und speichert.
   */
  function confirmLiveOptimizationUpdate() {
    if (!state.pendingLiveOpt) {
      closeLiveOptimizationModal();
      return;
    }

    const { supermarket, checkedItem, skippedItems } = state.pendingLiveOpt;
    const updatedStore = Core.applyLiveOptimizationUpdate(
      supermarket,
      checkedItem,
      skippedItems
    );

    state.supermarkets = state.supermarkets.map((s) =>
      s.id === updatedStore.id ? updatedStore : s
    );

    const { sortedItems } = Core.sortShoppingList(state.shoppingList, updatedStore);
    state.shoppingList = {
      ...state.shoppingList,
      items: sortedItems,
      updatedAt: Date.now()
    };

    state.pendingLiveOpt = null;
    closeLiveOptimizationModal();
    saveAppState();
    renderApp();

    const firstSkipped =
      skippedItems && skippedItems[0] ? formatDisplayName(skippedItems[0]) : '';
    showToast(
      `🏪 ${updatedStore.name}-Konfiguration angepasst: „${formatDisplayName(checkedItem)}“ liegt jetzt vor „${firstSkipped}“!`,
      'success'
    );
  }

  /**
   * Schließt das Live-Optimierungs-Modal ohne Änderung der Supermarkt-Reihenfolge ("Nein, nur abhaken").
   */
  function closeLiveOptimizationModal() {
    state.pendingLiveOpt = null;
    const modal = document.getElementById('live-opt-modal');
    if (modal) modal.classList.remove('open');
  }

  /**
   * Entfernt eine einzelne Ware von der Einkaufsliste.
   * @param {string} itemId - ID der zu löschenden Ware
   * @param {Event} [event] - Klick-Event (verhindert Auslösen des Checkbox-Toggles)
   */
  function handleRemoveItem(itemId, event) {
    if (event) event.stopPropagation();
    const activeStore = getActiveSupermarket();
    state.shoppingList = Core.removeItemFromList(state.shoppingList, activeStore, itemId);
    saveAppState();
    renderApp();
  }

  /**
   * Entfernt alle bereits abgehakten Waren aus der oberen Erledigt-Sektion.
   */
  function handleClearCheckedItems() {
    const activeStore = getActiveSupermarket();
    state.shoppingList = Core.clearCheckedItems(state.shoppingList, activeStore);
    saveAppState();
    renderApp();
    showToast('🧹 Alle erledigten Waren wurden vom Einkaufszettel entfernt.', 'info');
  }

  /**
   * Lädt eine Beispiel-Einkaufsliste zum schnellen Ausprobieren aller Funktionen.
   */
  function seedDemoShoppingList() {
    const activeStore = getActiveSupermarket();
    state.shoppingList = createInitialStarterList(activeStore);
    saveAppState();
    renderApp();
    showToast(`🛒 Beispiel-Einkaufsliste für ${activeStore.name} geladen!`, 'success');
  }

  /**
   * Haupt-Render-Funktion: Aktualisiert Header, Supermarkt-Pills, Einkaufszettel-Leiste,
   * Live-Optimierungs-Status, Einkaufsliste (Erledigt oben + Offen unten) und Schnellauswahl-Chips.
   */
  function renderApp() {
    renderHeaderAndStorePills();
    renderShoppingListsBar();
    renderLiveOptimizationHeader();
    renderShoppingListView();
    renderQuickSuggestions();
    renderExportImportTabSummary();
    if (state.activeTab === 'tab-stores') {
      renderSupermarketConfigurator();
    }
  }

  /**
   * Rendert die Kopfzeile mit Fortschrittsanzeige und die Supermarkt-Auswahl-Pills.
   */
  function renderHeaderAndStorePills() {
    const activeStore = getActiveSupermarket();
    const subtitleEl = document.getElementById('header-store-subtitle');
    const progressEl = document.getElementById('header-progress-pill');
    const pillsBar = document.getElementById('store-selector-bar');

    const items = (state.shoppingList && state.shoppingList.items) || [];
    const checkedCount = items.filter((i) => i.checked).length;
    const listName = (state.shoppingList && state.shoppingList.name) || 'Einkaufszettel';

    if (subtitleEl && activeStore) {
      subtitleEl.textContent = `${listName} • ${activeStore.name} (${activeStore.itemOrder.length} Stationen)`;
    }
    if (progressEl) {
      progressEl.textContent = `${checkedCount} / ${items.length} erledigt`;
    }

    if (pillsBar) {
      pillsBar.innerHTML = state.supermarkets
        .map((store) => {
          const isActive = store.id === activeStore.id;
          return `
            <button
              type="button"
              class="store-pill ${isActive ? 'active' : ''}"
              data-store-id="${escapeHtml(store.id)}"
              role="tab"
              aria-selected="${isActive}"
            >
              <span>${escapeHtml(store.icon || '🏪')}</span>
              <span>${escapeHtml(store.name)}</span>
            </button>
          `;
        })
        .join('');
    }
  }

  /**
   * Aktualisiert die Anzeige des Live-Optimierungs-Schalters im Einkaufszettel-Header.
   */
  function renderLiveOptimizationHeader() {
    const enabled = Boolean(state.shoppingList && state.shoppingList.liveOptimizationEnabled);
    const card = document.getElementById('live-opt-card');
    const badge = document.getElementById('live-opt-badge');
    const toggle = document.getElementById('live-opt-toggle');
    const desc = document.getElementById('live-opt-desc');

    if (card) card.classList.toggle('off', !enabled);
    if (badge) {
      badge.textContent = enabled ? 'Ein' : 'Aus';
      badge.className = `status-badge ${enabled ? 'on' : 'off'}`;
    }
    if (toggle && toggle.checked !== enabled) {
      toggle.checked = enabled;
    }
    if (desc) {
      desc.textContent = enabled
        ? 'Aktiv: Fragt beim Abhaken außerhalb der Reihenfolge, ob die Supermarkt-Konfiguration angepasst werden soll.'
        : 'Ausgeschaltet: Waren werden beim Abhaken ohne Rückfrage zur Reihenfolge abgehakt.';
    }
  }

  /**
   * Rendert die zweigeteilte Einkaufslisten-Ansicht:
   * 1. Oben: `Bereits abgehakt (Erledigt)` (ausgegraut, durchgestrichen; Klick macht Abhaken rückgängig).
   * 2. Darunter: `Noch einzukaufen (Optimierte Reihenfolge)` in exakter Supermarkt-Laufreihenfolge.
   */
  function renderShoppingListView() {
    const activeStore = getActiveSupermarket();
    const { checkedItems, uncheckedItems } = Core.sortShoppingList(
      state.shoppingList,
      activeStore
    );

    const checkedSection = document.getElementById('checked-section');
    const checkedCountEl = document.getElementById('checked-count');
    const checkedListEl = document.getElementById('checked-items-list');

    const uncheckedCountEl = document.getElementById('unchecked-count');
    const uncheckedListEl = document.getElementById('unchecked-items-list');

    if (checkedCountEl) checkedCountEl.textContent = String(checkedItems.length);
    if (uncheckedCountEl) uncheckedCountEl.textContent = String(uncheckedItems.length);

    if (checkedSection) {
      checkedSection.style.display = checkedItems.length > 0 ? 'block' : 'none';
    }

    if (checkedListEl) {
      checkedListEl.innerHTML = checkedItems
        .map((item) => {
          const posIdx =
            typeof item.storePosition === 'number'
              ? item.storePosition
              : Core.indexOfNormalized(activeStore.itemOrder, item.name, item.specification);
          const isUnknown = posIdx === -1;
          const posLabel = !isUnknown ? `Station #${posIdx + 1}` : 'Noch nicht im Markt';
          const specBadge = item.specification
            ? `<span class="item-spec-badge">${escapeHtml(item.specification)}</span>`
            : '';
          const classes = ['shopping-item', 'checked'];
          if (isUnknown) classes.push('unknown-in-store');
          return `
            <li
              class="${classes.join(' ')}"
              data-item-id="${escapeHtml(item.id)}"
              ${isUnknown ? 'data-unknown-item="true"' : ''}
              title="${isUnknown ? 'Antippen zum Rückgängig machen • Gedrückt halten zum Hinzufügen zum Supermarkt' : 'Antippen zum Rückgängig machen'}"
            >
              <div class="item-checkbox" aria-label="Abgehakt">✓</div>
              <div class="item-content">
                <div class="item-top-line">
                  <span class="item-name">${escapeHtml(item.name)}</span>
                  ${specBadge}
                  <span class="item-qty-badge">${escapeHtml(item.quantity || '1x')}</span>
                </div>
                <div class="item-badges">
                  <span class="badge badge-undo-hint">↩️ Antippen für Rückgängig (${escapeHtml(posLabel)})</span>
                  ${isUnknown ? `<span class="badge badge-unknown-pos">🆕 Gedrückt halten → zu ${escapeHtml(activeStore.name)} hinzufügen</span>` : ''}
                </div>
              </div>
              <div class="item-actions">
                <button type="button" class="item-edit-btn" data-edit-item-id="${escapeHtml(item.id)}" title="Ware bearbeiten">✎</button>
                <button type="button" class="item-delete-btn" data-delete-id="${escapeHtml(item.id)}" title="Ware entfernen">✕</button>
              </div>
            </li>
          `;
        })
        .join('');
    }

    if (uncheckedListEl) {
      if (uncheckedItems.length === 0) {
        uncheckedListEl.innerHTML = `
          <li class="card empty-state">
            <div class="empty-state-icon">🎉</div>
            <div style="font-weight: 800; font-size: 15px; color: var(--text-main); margin-bottom: 4px;">
              Keine offenen Waren auf „${escapeHtml((state.shoppingList && state.shoppingList.name) || 'Einkaufszettel')}“!
            </div>
            <div style="font-size: 13px;">
              Füge oben neue Waren hinzu, fotografiere einen Einkaufszettel oder lade die Demo-Liste.
            </div>
          </li>
        `;
        return;
      }

      const firstKnownIdx = uncheckedItems.findIndex(
        (it) => !it.addedLateOverride && (typeof it.storePosition === 'number' ? it.storePosition !== -1 : Core.indexOfNormalized(activeStore.itemOrder, it.name, it.specification) !== -1)
      );

      uncheckedListEl.innerHTML = uncheckedItems
        .map((item, idx) => {
          const isLate = Boolean(item.addedLateOverride);
          const posIdx =
            typeof item.storePosition === 'number'
              ? item.storePosition
              : Core.indexOfNormalized(activeStore.itemOrder, item.name, item.specification);
          const isUnknown = posIdx === -1;
          const isNext = !isLate && !isUnknown && idx === firstKnownIdx;

          const classes = ['shopping-item'];
          if (isLate) {
            classes.push('late-override');
          } else if (isUnknown) {
            classes.push('unknown-in-store');
          } else if (isNext) {
            classes.push('next-in-aisle');
          }

          const badges = [];
          if (isLate) {
            badges.push(
              `<span class="badge badge-late">⚡ Nachträglich hinzugefügt • Als Nächstes (Station schon passiert)</span>`
            );
          } else if (isNext) {
            badges.push(`<span class="badge badge-next">👉 Nächste Ware im Gang</span>`);
          }

          if (!isUnknown) {
            const matchHint =
              item.storeMatchType === 'fallback-generic' ? ' (Warengruppe)' : '';
            const catSuffix = item.category ? ` • ${escapeHtml(item.category)}` : '';
            badges.push(
              `<span class="badge badge-walk-index">🧭 ${escapeHtml(activeStore.name)} #${posIdx + 1}${matchHint}${catSuffix}</span>`
            );
          } else {
            badges.push(
              `<span class="badge badge-unknown-pos">🆕 Noch nicht in ${escapeHtml(activeStore.name)} • Gedrückt halten zum Hinzufügen</span>`
            );
          }

          const specBadge = item.specification
            ? `<span class="item-spec-badge">${escapeHtml(item.specification)}</span>`
            : '';

          return `
            <li
              class="${classes.join(' ')}"
              data-item-id="${escapeHtml(item.id)}"
              ${isUnknown ? 'data-unknown-item="true"' : ''}
              ${isUnknown ? `title="Lange gedrückt halten, um diese Ware zu ${escapeHtml(activeStore.name)} hinzuzufügen"` : ''}
            >
              <div class="item-checkbox" aria-label="Abhaken"></div>
              <div class="item-content">
                <div class="item-top-line">
                  <span class="item-name">${escapeHtml(item.name)}</span>
                  ${specBadge}
                  <span class="item-qty-badge">${escapeHtml(item.quantity || '1x')}</span>
                </div>
                <div class="item-badges">
                  ${badges.join('')}
                </div>
              </div>
              <div class="item-actions">
                <button type="button" class="item-edit-btn" data-edit-item-id="${escapeHtml(item.id)}" title="Ware bearbeiten">✎</button>
                <button type="button" class="item-delete-btn" data-delete-id="${escapeHtml(item.id)}" title="Ware entfernen">✕</button>
              </div>
            </li>
          `;
        })
        .join('');
    }
  }

  /**
   * Rendert Schnellauswahl-Chips unter dem Eingabefeld für typische Waren des aktiven Supermarkts,
   * die sich aktuell noch nicht auf der Einkaufsliste befinden.
   */
  function renderQuickSuggestions() {
    const container = document.getElementById('quick-suggestions');
    if (!container) return;

    const activeStore = getActiveSupermarket();
    const currentItems = (state.shoppingList && state.shoppingList.items) || [];
    const existingKeys = new Set(
      currentItems.map((i) =>
        typeof Core.getStoreEntryKey === 'function'
          ? Core.getStoreEntryKey(i)
          : `${Core.normalizeItemName(i.name)}::${String(i.specification || '').trim().toLowerCase()}`
      )
    );

    const suggestions = (activeStore.itemOrder || [])
      .map((raw) => normalizeEntryObj(raw))
      .filter((entry) => {
        if (!entry.name) return false;
        const key =
          typeof Core.getStoreEntryKey === 'function'
            ? Core.getStoreEntryKey(entry)
            : `${Core.normalizeItemName(entry.name)}::${entry.specification.toLowerCase()}`;
        return !existingKeys.has(key);
      })
      .slice(0, 10);

    container.innerHTML = suggestions
      .map((entry) => {
        const label = formatDisplayName(entry);
        return `<button type="button" class="suggestion-chip" data-suggest-name="${escapeHtml(entry.name)}" data-suggest-spec="${escapeHtml(entry.specification)}">+ ${escapeHtml(label)}</button>`;
      })
      .join('');
  }

  /* ==========================================================================
   * TAB 2: Foto-Scanner / Echte Tesseract.js OCR Funktionen
   * ========================================================================== */

  /**
   * Verarbeitet ein vom Nutzer aufgenommenes oder ausgewähltes Einkaufszettel-Foto
   * über `SmartCartCore.recognizeImageShoppingList` mit echter Tesseract.js-Texterkennung
   * und automatischer Bild-Vorverarbeitung (Kontrast-/Graustufen-Optimierung).
   * Befüllt niemals Fake-Demo-Waren für echte Nutzerfotos!
   * @param {Event} event - Change-Event des Datei-Inputs
   */
  async function handleOcrFileUpload(event) {
    const file = event.target && event.target.files && event.target.files[0];
    if (!file) return;

    const statusBox = document.getElementById('ocr-status-box');
    const previewImg = document.getElementById('ocr-preview-image');
    const textarea = document.getElementById('ocr-raw-textarea');

    if (textarea) {
      textarea.value = '';
    }
    renderOcrPreviewFromText('');

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.textContent = '⏳ Bild wird für Texterkennung optimiert…';
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (previewImg) {
        previewImg.src = dataUrl;
        previewImg.style.display = 'block';
      }

      if (typeof Core.recognizeImageShoppingList === 'function') {
        const ocrResult = await Core.recognizeImageShoppingList(dataUrl, (progressInfo) => {
          if (statusBox && progressInfo && progressInfo.status) {
            const pct = typeof progressInfo.progress === 'number'
              ? ` (${Math.round(progressInfo.progress * 100)}%)`
              : '';
            statusBox.textContent = `🔍 ${progressInfo.status}${pct}`;
          }
        });

        if (!ocrResult || ocrResult.source === 'ocr-error' || !ocrResult.text || !ocrResult.text.trim()) {
          if (textarea) textarea.value = '';
          renderOcrPreviewFromText('');
          const errMsg =
            (ocrResult && ocrResult.error) ||
            'Auf dem Foto konnte kein lesbarer Text erkannt werden. Bitte achte auf gute Beleuchtung oder tippe die Waren unten ein.';
          if (statusBox) {
            statusBox.textContent = `⚠️ ${errMsg}`;
          }
          showToast(`⚠️ ${errMsg}`, 'late');
          return;
        }

        const rawText = ocrResult.text.trim();
        if (textarea) {
          textarea.value = rawText;
        }
        renderOcrPreviewFromText(rawText);

        const detectedCount = (ocrResult.items || state.parsedOcrItems || []).length;
        const confText =
          typeof ocrResult.confidence === 'number' && ocrResult.confidence > 0
            ? `, ${Math.round(ocrResult.confidence)}% Erkennungssicherheit`
            : '';
        if (statusBox) {
          statusBox.textContent = `✅ Foto per Tesseract OCR erkannt (${detectedCount} Waren gefunden${confText}). Du kannst die Liste unten prüfen oder anpassen.`;
        }
        showToast(`📷 ${detectedCount} Waren auf dem Foto erkannt!`, 'success');
      }
    } catch (err) {
      if (textarea) textarea.value = '';
      renderOcrPreviewFromText('');
      if (statusBox) {
        statusBox.textContent = `⚠️ Fehler bei der Bilderkennung: ${err.message}. Du kannst die Waren unten manuell eingeben.`;
      }
    }
  }

  /**
   * Erzeugt eines der 3 integrierten Demo-Einkaufszettel-Fotos auf einem HTML5-Canvas
   * (`SmartCartCore.generateSamplePhotoDataUrl`) und führt die Demo-OCR-Erkennung aus.
   * @param {string} presetName - Name des Demo-Zettels (`wochenende`, `fruehstueck`, `italienisch`)
   */
  async function handleLoadDemoPhoto(presetName) {
    const cleanPreset = presetName || 'wochenende';
    const statusBox = document.getElementById('ocr-status-box');
    const previewImg = document.getElementById('ocr-preview-image');
    const textarea = document.getElementById('ocr-raw-textarea');

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.textContent = '📸 Demo-Einkaufszettel wird erzeugt und gescannt…';
    }

    let sampleDataUrl = null;
    let sampleText = '';

    if (typeof Core.generateSamplePhotoDataUrl === 'function') {
      const generated = Core.generateSamplePhotoDataUrl(cleanPreset);
      if (typeof generated === 'string') {
        sampleDataUrl = generated;
      } else if (generated && typeof generated === 'object') {
        sampleDataUrl = generated.dataUrl || null;
        sampleText = generated.rawText || generated.text || '';
      }
    }

    if (previewImg && sampleDataUrl) {
      previewImg.src = sampleDataUrl;
      previewImg.style.display = 'block';
    }

    if (typeof Core.recognizeImageShoppingList === 'function') {
      const res = await Core.recognizeImageShoppingList(
        sampleDataUrl || cleanPreset,
        (progressInfo) => {
          if (statusBox && progressInfo && progressInfo.status) {
            statusBox.textContent = `🔍 ${progressInfo.status}`;
          }
        }
      );
      if (res && (res.rawText || res.text)) {
        sampleText = res.rawText || res.text;
      }
    }

    if (textarea) {
      textarea.value = sampleText;
    }
    renderOcrPreviewFromText(sampleText);

    if (statusBox) {
      statusBox.textContent = `✅ Demo-Einkaufszettel „${cleanPreset}“ erkannt (${state.parsedOcrItems.length} Waren)!`;
    }
  }

  /**
   * Parst den mehrzeiligen Einkaufszettel-Text über `SmartCartCore.parseShoppingText`
   * und zeigt eine strukturierte Vorschau inkl. erkannter Supermarkt-Station an.
   * @param {string} rawText - Mehrzeiliger Rohtext aus OCR oder Textfeld
   */
  function renderOcrPreviewFromText(rawText) {
    const countEl = document.getElementById('ocr-detected-count');
    const listEl = document.getElementById('ocr-parsed-list');
    const activeStore = getActiveSupermarket();

    const parsed =
      typeof Core.parseShoppingText === 'function'
        ? Core.parseShoppingText(rawText || '')
        : [];

    state.parsedOcrItems = parsed;

    if (countEl) {
      countEl.textContent = `${parsed.length} Waren`;
    }

    if (listEl) {
      if (parsed.length === 0) {
        listEl.innerHTML = `
          <li style="font-size: 12.5px; color: var(--text-muted); text-align: center; padding: 10px;">
            Noch kein Foto gescannt. Öffne oben die Kamera / Foto-Auswahl oder teste einen der 3 Demo-Zettel!
          </li>
        `;
        return;
      }

      listEl.innerHTML = parsed
        .map((item) => {
          const posIdx = Core.indexOfNormalized(
            activeStore.itemOrder,
            item.name,
            item.specification || ''
          );
          const posBadge =
            posIdx !== -1
              ? `${activeStore.name} #${posIdx + 1}`
              : 'Neu (am Anfang)';
          return `
            <li class="ocr-parsed-item">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <span class="item-qty-badge" style="margin-left: 6px;">${escapeHtml(item.quantity || '1x')}</span>
              </div>
              <span class="badge badge-walk-index">${escapeHtml(posBadge)}</span>
            </li>
          `;
        })
        .join('');
    }
  }

  /**
   * Übernimmt alle im OCR-Tab erkannten Waren in den aktiven Einkaufszettel,
   * sortiert sie automatisch für den gewählten Supermarkt und wechselt zur Einkaufsliste.
   */
  function handleImportOcrItems() {
    const textarea = document.getElementById('ocr-raw-textarea');
    if (textarea) {
      renderOcrPreviewFromText(textarea.value);
    }

    if (!state.parsedOcrItems || state.parsedOcrItems.length === 0) {
      showToast('⚠️ Bitte zuerst ein Foto scannen oder Waren in das Textfeld eingeben.', 'late');
      return;
    }

    const activeStore = getActiveSupermarket();
    const result = Core.addMultipleItemsToList(
      state.shoppingList,
      activeStore,
      state.parsedOcrItems
    );

    state.shoppingList = result.list;
    saveAppState();
    renderApp();
    switchTab('tab-list');

    if (result.lateItems && result.lateItems.length > 0) {
      const lateNames = result.lateItems.map((i) => formatDisplayName(i)).join(', ');
      showToast(
        `📷 ${result.addedItems.length} Waren übernommen! (${lateNames} direkt als Nächstes eingereiht, da Position bereits passiert)`,
        'late'
      );
    } else {
      showToast(
        `📷 ${result.addedItems.length} Waren vom Foto übernommen und für ${activeStore.name} sortiert!`,
        'success'
      );
    }
  }

  /* ==========================================================================
   * TAB 3: Supermarkt-Konfigurator (Sortierung wählen, Vorige Ware, Drag & Drop, ⇄)
   * ========================================================================== */

  /**
   * Rendert den Supermarkt-Konfigurator (`#tab-stores`) inkl.:
   * - Auswahl-Dropdown des zu bearbeitenden Supermarkts (`#config-store-select`)
   * - Vorlagen-Dropdown beim Anlegen eines neuen Supermarkts (`#newStoreTemplateSelect`)
   * - Autocomplete-Datalist aller Waren im Markt (`#storeExistingItemsDatalist`)
   * - Sortierbare Warenliste (`#store-order-list`) mit Drag-Handle `☰`, `⇄` Verschieben-Modal und `↑`/`↓`
   */
  function renderSupermarketConfigurator() {
    const selectEl = document.getElementById('config-store-select');
    const templateSelectEl = document.getElementById('newStoreTemplateSelect');
    const datalistEl = document.getElementById('storeExistingItemsDatalist');
    const titleEl = document.getElementById('config-store-title');
    const countEl = document.getElementById('config-store-count');
    const listEl = document.getElementById('store-order-list');

    const configStore = getConfigSupermarket();
    if (!configStore) return;

    if (selectEl) {
      selectEl.innerHTML = state.supermarkets
        .map(
          (s) =>
            `<option value="${escapeHtml(s.id)}" ${
              s.id === configStore.id ? 'selected' : ''
            }>${escapeHtml(s.icon || '🏪')} ${escapeHtml(s.name)} (${s.itemOrder.length} Waren)</option>`
        )
        .join('');
    }

    if (templateSelectEl) {
      const prevTemplateVal = templateSelectEl.value || 'default';
      const optionsHtml = [
        `<option value="default">Standard (Standard-Sortierung)</option>`,
        ...state.supermarkets.map(
          (s) =>
            `<option value="${escapeHtml(s.id)}" ${
              s.id === prevTemplateVal ? 'selected' : ''
            }>Supermarkt: ${escapeHtml(s.icon || '🏪')} ${escapeHtml(s.name)} (${s.itemOrder.length} Waren)</option>`
        )
      ];
      templateSelectEl.innerHTML = optionsHtml.join('');
    }

    if (datalistEl) {
      const itemsOptions = (configStore.itemOrder || []).map((rawEntry, idx) => {
        const entry = normalizeEntryObj(rawEntry);
        const label = formatDisplayName(entry);
        return `<option value="${escapeHtml(label)}">Pos. ${idx + 1}: ${escapeHtml(label)}</option>`;
      });
      datalistEl.innerHTML = [
        `<option value="Ganz am Anfang (Position 1)">Position 1 – Direkt am Eingang</option>`,
        ...itemsOptions
      ].join('');
    }

    if (titleEl) titleEl.textContent = configStore.name;
    if (countEl) countEl.textContent = `${configStore.itemOrder.length} Stationen`;

    if (listEl) {
      listEl.innerHTML = (configStore.itemOrder || [])
        .map((rawEntry, idx) => {
          const entry = normalizeEntryObj(rawEntry);
          const displayLabel = formatDisplayName(entry);
          const isFirst = idx === 0;
          const isLast = idx === configStore.itemOrder.length - 1;
          const dept = Core.guessItemCategory ? Core.guessItemCategory(entry) : '';
          const specBadge = entry.specification
            ? `<span class="store-spec-badge">${escapeHtml(entry.specification)}</span>`
            : '';
          return `
            <li
              class="store-order-item"
              draggable="true"
              data-item-index="${idx}"
              data-item-name="${escapeHtml(entry.name)}"
              data-item-spec="${escapeHtml(entry.specification)}"
            >
              <span
                class="drag-handle"
                data-drag-handle="${idx}"
                title="Gedrückt halten &amp; ziehen zum Verschieben"
                aria-label="Ziehen zum Verschieben"
              >☰</span>
              <span class="store-order-num">${idx + 1}</span>
              <div class="store-order-name">
                <div>${escapeHtml(entry.name)}${specBadge}</div>
                <div style="font-size: 11px; color: var(--text-muted); font-weight: 500;">${escapeHtml(dept)}</div>
              </div>
              <div class="store-order-actions">
                <button
                  type="button"
                  class="icon-btn"
                  data-edit-store-idx="${idx}"
                  title="Ware &amp; Spezifikation bearbeiten"
                >✎</button>
                <button
                  type="button"
                  class="icon-btn move-after-btn"
                  data-move-after-idx="${idx}"
                  data-move-after-item="${escapeHtml(displayLabel)}"
                  title="Gezielt hinter eine bestimmte Ware (oder an Position 1) verschieben"
                >⇄</button>
                <button
                  type="button"
                  class="icon-btn"
                  data-move-idx="${idx}"
                  data-move-dir="up"
                  ${isFirst ? 'disabled' : ''}
                  title="Eine Position nach oben (Richtung Eingang)"
                >↑</button>
                <button
                  type="button"
                  class="icon-btn"
                  data-move-idx="${idx}"
                  data-move-dir="down"
                  ${isLast ? 'disabled' : ''}
                  title="Eine Position nach unten (Richtung Kasse)"
                >↓</button>
                <button
                  type="button"
                  class="icon-btn"
                  data-remove-store-idx="${idx}"
                  title="Aus Supermarkt-Reihenfolge entfernen"
                  style="color: var(--danger);"
                >✕</button>
              </div>
            </li>
          `;
        })
        .join('');
    }
  }

  /**
   * Legt einen neuen benutzerdefinierten Supermarkt an und übernimmt dabei die im
   * Dropdown `#newStoreTemplateSelect` gewählte Sortierung (`Standard` oder ein bestehender Supermarkt).
   * @param {Event} event - Submit-Event
   */
  function handleCreateSupermarket(event) {
    if (event) event.preventDefault();
    const input = document.getElementById('new-store-name');
    const templateSelect = document.getElementById('newStoreTemplateSelect');
    const name = input ? input.value.trim() : '';
    if (!name) return;

    const sourceSupermarketId = templateSelect ? templateSelect.value : 'default';
    const sourceStore =
      sourceSupermarketId !== 'default'
        ? state.supermarkets.find((s) => s.id === sourceSupermarketId)
        : null;

    let newStore;
    if (typeof Core.createSupermarketWithSorting === 'function') {
      newStore = Core.createSupermarketWithSorting({
        name,
        icon: '🟢',
        color: '#059669',
        sourceSupermarketId,
        supermarkets: state.supermarkets
      });
    } else {
      const defaultOrder =
        typeof Core.getDefaultItemOrder === 'function'
          ? Core.getDefaultItemOrder()
          : state.supermarkets[0]
          ? [...state.supermarkets[0].itemOrder]
          : [];
      newStore = Core.createSupermarket({
        name,
        icon: '🟢',
        color: '#059669',
        itemOrder: sourceStore ? [...sourceStore.itemOrder] : defaultOrder
      });
    }

    state.supermarkets.push(newStore);
    state.configSelectedStoreId = newStore.id;
    state.shoppingList = Core.changeListSupermarket(state.shoppingList, newStore);

    if (input) input.value = '';
    saveAppState();
    renderApp();

    const sourceLabel = sourceStore ? sourceStore.name : 'Standard-Sortierung';
    showToast(
      `🏪 Supermarkt „${newStore.name}“ angelegt (Sortierung übernommen von: ${sourceLabel})!`,
      'success'
    );
  }

  /**
   * Benennt den aktuell im Konfigurator ausgewählten Supermarkt um.
   */
  function handleRenameSupermarket() {
    const store = getConfigSupermarket();
    if (!store) return;
    const newName = window.prompt('Neuer Name für den Supermarkt:', store.name);
    if (!newName || !newName.trim()) return;

    store.name = newName.trim();
    store.updatedAt = Date.now();
    saveAppState();
    renderApp();
    showToast(`✏️ Supermarkt umbenannt in „${store.name}“.`, 'info');
  }

  /**
   * Löscht den im Konfigurator ausgewählten Supermarkt (sofern mehr als ein Markt existiert).
   */
  function handleDeleteSupermarket() {
    if (state.supermarkets.length <= 1) {
      showToast('⚠️ Mindestens ein Supermarkt muss erhalten bleiben.', 'late');
      return;
    }
    const store = getConfigSupermarket();
    if (!store) return;

    state.supermarkets = state.supermarkets.filter((s) => s.id !== store.id);
    const fallback = state.supermarkets[0];
    state.configSelectedStoreId = fallback.id;

    if (state.shoppingList.supermarketId === store.id) {
      state.shoppingList = Core.changeListSupermarket(state.shoppingList, fallback);
    }

    saveAppState();
    renderApp();
    showToast(`🗑️ Supermarkt „${store.name}“ gelöscht.`, 'info');
  }

  /**
   * Hilfsfunktion: Prüft, ob eine Eingabe für die vorige Ware "Ganz am Anfang (Position 1)" bedeutet.
   * @param {string} rawValue
   * @returns {boolean}
   */
  function isStartPositionKeyword(rawValue) {
    if (!rawValue) return false;
    const norm = String(rawValue).trim().toLowerCase();
    return (
      norm === '__start__' ||
      norm === 'anfang' ||
      norm === 'ganz am anfang' ||
      norm === 'ganz am anfang (position 1)' ||
      norm === 'ganz an den anfang' ||
      norm === 'position 1' ||
      norm === 'pos. 1' ||
      norm === 'pos 1' ||
      norm === '1' ||
      norm === 'eingang'
    );
  }

  /**
   * Verschiebt eine Ware innerhalb der Laufreihenfolge (`itemOrder`) eines Supermarkts
   * um eine Position nach oben (Richtung Eingang) oder unten (Richtung Kasse).
   * @param {number} index - Aktueller Index der Ware
   * @param {'up'|'down'} direction - Verschieberichtung
   */
  function handleMoveStoreItem(index, direction) {
    const store = getConfigSupermarket();
    if (!store) return;
    const toIndex = direction === 'up' ? index - 1 : index + 1;
    const updatedStore = Core.reorderSupermarketItem(store, index, toIndex);

    state.supermarkets = state.supermarkets.map((s) =>
      s.id === updatedStore.id ? updatedStore : s
    );

    if (state.shoppingList.supermarketId === updatedStore.id) {
      state.shoppingList = Core.changeListSupermarket(state.shoppingList, updatedStore);
    }

    saveAppState();
    renderApp();
  }

  /**
   * Verschiebt eine Ware im Supermarkt per Drag & Drop (Maus oder Touch) von `fromIndex` auf `toIndex`.
   * @param {number} fromIndex - Ursprünglicher Index
   * @param {number} toIndex - Ziel-Index
   */
  function handleDragReorderStoreItem(fromIndex, toIndex) {
    const store = getConfigSupermarket();
    if (!store) return;
    if (
      typeof fromIndex !== 'number' ||
      typeof toIndex !== 'number' ||
      isNaN(fromIndex) ||
      isNaN(toIndex) ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= store.itemOrder.length ||
      toIndex >= store.itemOrder.length
    ) {
      return;
    }

    const movedLabel = formatDisplayName(store.itemOrder[fromIndex]);
    const updatedStore = Core.reorderSupermarketItem(store, fromIndex, toIndex);

    state.supermarkets = state.supermarkets.map((s) =>
      s.id === updatedStore.id ? updatedStore : s
    );

    if (state.shoppingList.supermarketId === updatedStore.id) {
      state.shoppingList = Core.changeListSupermarket(state.shoppingList, updatedStore);
    }

    saveAppState();
    renderApp();
    showToast(
      `☰ „${movedLabel}“ auf Position ${toIndex + 1} in ${updatedStore.name} verschoben.`,
      'info'
    );
  }

  /**
   * Öffnet das Modal zum Bearbeiten einer Ware (Name & optionale Spezifikation)
   * in der Laufreihenfolge des aktuellen Konfigurator-Supermarkts.
   * @param {number} entryIndex - Index des Eintrags in `itemOrder`
   */
  function openEditStoreItemModal(entryIndex) {
    const store = getConfigSupermarket();
    if (!store || !Array.isArray(store.itemOrder)) return;
    if (typeof entryIndex !== 'number' || entryIndex < 0 || entryIndex >= store.itemOrder.length) {
      return;
    }

    const entry = normalizeEntryObj(store.itemOrder[entryIndex]);
    state.pendingEditStoreIndex = entryIndex;

    const modal = document.getElementById('edit-store-item-modal');
    const nameInput = document.getElementById('edit-store-item-name');
    const specInput = document.getElementById('edit-store-item-spec');

    if (nameInput) nameInput.value = entry.name;
    if (specInput) specInput.value = entry.specification;

    if (modal) {
      modal.classList.add('open');
      if (nameInput) setTimeout(() => nameInput.focus(), 40);
    }
  }

  /**
   * Schließt das Supermarkt-Eintrag-bearbeiten-Modal (`#edit-store-item-modal`).
   */
  function closeEditStoreItemModal() {
    state.pendingEditStoreIndex = null;
    const modal = document.getElementById('edit-store-item-modal');
    if (modal) modal.classList.remove('open');
  }

  /**
   * Speichert Änderungen an einem Eintrag (Name & optionale Spezifikation) in der
   * Supermarkt-Laufreihenfolge.
   * @param {Event} [event]
   */
  function handleEditStoreItemModalSubmit(event) {
    if (event) event.preventDefault();
    const idx = state.pendingEditStoreIndex;
    const store = getConfigSupermarket();
    if (!store || typeof idx !== 'number' || idx < 0 || idx >= store.itemOrder.length) {
      closeEditStoreItemModal();
      return;
    }

    const nameInput = document.getElementById('edit-store-item-name');
    const specInput = document.getElementById('edit-store-item-spec');
    const name = nameInput ? nameInput.value.trim() : '';
    const specification = specInput ? specInput.value.trim() : '';
    if (!name) return;

    if (typeof Core.updateSupermarketKnownItem === 'function') {
      const updatedStore = Core.updateSupermarketKnownItem(store, idx, {
        name,
        specification
      });
      state.supermarkets = state.supermarkets.map((s) =>
        s.id === updatedStore.id ? updatedStore : s
      );
      if (state.shoppingList.supermarketId === updatedStore.id) {
        state.shoppingList = Core.changeListSupermarket(state.shoppingList, updatedStore);
      }
    }

    closeEditStoreItemModal();
    saveAppState();
    renderApp();
    showToast(
      `✎ „${formatDisplayName(name, specification)}“ in ${store.name} aktualisiert.`,
      'success'
    );
  }

  /**
   * Öffnet das Modal zum gezielten Verschieben einer Ware (`⇄` Button) hinter eine
   * frei wählbare vorige Ware oder ganz an den Anfang (Position 1).
   * @param {string} itemName - Anzeigename der zu verschiebenden Ware
   * @param {number} currentIndex - Aktuelle Position (0-basiert)
   */
  function openMoveStoreItemModal(itemName, currentIndex) {
    const store = getConfigSupermarket();
    if (!store) return;

    const currentEntry =
      typeof currentIndex === 'number' &&
      currentIndex >= 0 &&
      currentIndex < (store.itemOrder || []).length
        ? store.itemOrder[currentIndex]
        : itemName;
    const displayLabel = formatDisplayName(currentEntry);

    state.pendingMoveItem = { itemName: displayLabel, currentIndex };
    const modal = document.getElementById('move-store-item-modal');
    const titleEl = document.getElementById('move-item-modal-title');
    const subtitleEl = document.getElementById('move-item-modal-subtitle');
    const inputEl = document.getElementById('moveStoreItemPreviousInput');
    const pickerListEl = document.getElementById('move-item-picker-list');

    if (titleEl) {
      titleEl.textContent = `„${displayLabel}“ verschieben`;
    }
    if (subtitleEl) {
      subtitleEl.textContent = `Aktuell auf Position ${currentIndex + 1} in ${store.name}. Wähle die vorige Ware, hinter die „${displayLabel}“ platziert werden soll:`;
    }
    if (inputEl) {
      inputEl.value = '';
    }

    if (pickerListEl) {
      pickerListEl.innerHTML = (store.itemOrder || [])
        .map((otherEntry, idx) => {
          if (idx === currentIndex) return '';
          const otherLabel = formatDisplayName(otherEntry);
          return `<button type="button" class="move-picker-chip" data-pick-prev-item="${escapeHtml(
            otherLabel
          )}">#${idx + 1} ${escapeHtml(otherLabel)}</button>`;
        })
        .join('');
    }

    if (modal) {
      modal.classList.add('open');
      if (inputEl) setTimeout(() => inputEl.focus(), 40);
    }
  }

  /**
   * Schließt das Modal zum gezielten Verschieben einer Ware (`#move-store-item-modal`).
   */
  function closeMoveStoreItemModal() {
    state.pendingMoveItem = null;
    const modal = document.getElementById('move-store-item-modal');
    if (modal) modal.classList.remove('open');
  }

  /**
   * Verschiebt eine bestehende Ware im Supermarkt gezielt hinter `previousItemRaw`
   * (oder an Position 1 bei `'__START__'` / `'Anfang'`) über `SmartCartCore.moveSupermarketItemAfter`.
   * @param {string|number} itemNameOrIndex - Zu verschiebende Ware oder deren Index
   * @param {string} previousItemRaw - Name der vorigen Ware oder `'__START__'`
   */
  function handleMoveStoreItemAfter(itemNameOrIndex, previousItemRaw) {
    const store = getConfigSupermarket();
    if (!store) return;

    const rawTrimmed = previousItemRaw ? String(previousItemRaw).trim() : '';
    const prevParam = isStartPositionKeyword(rawTrimmed) ? '__START__' : rawTrimmed;

    if (typeof Core.moveSupermarketItemAfter !== 'function') return;
    const res = Core.moveSupermarketItemAfter(store, itemNameOrIndex, prevParam);
    const updatedStore = res.supermarket || res;

    state.supermarkets = state.supermarkets.map((s) =>
      s.id === updatedStore.id ? updatedStore : s
    );

    if (state.shoppingList.supermarketId === updatedStore.id) {
      state.shoppingList = Core.changeListSupermarket(state.shoppingList, updatedStore);
    }

    closeMoveStoreItemModal();
    saveAppState();
    renderApp();

    const movedLabel = formatDisplayName(res.movedItem || itemNameOrIndex);
    const prevLabel =
      res.previousItem && res.previousItem !== '__START__'
        ? formatDisplayName(res.previousItem)
        : rawTrimmed;
    const posNum = typeof res.insertedAtIndex === 'number' ? res.insertedAtIndex + 1 : 1;

    if (prevParam === '__START__' || posNum === 1) {
      showToast(
        `⇄ „${movedLabel}“ wurde ganz an den Anfang (Position 1) von ${updatedStore.name} verschoben!`,
        'success'
      );
    } else if (res.foundPrevious) {
      showToast(
        `⇄ „${movedLabel}“ wurde direkt nach „${prevLabel}“ (Pos. ${posNum}) verschoben!`,
        'success'
      );
    } else {
      showToast(
        `⇄ „${movedLabel}“ wurde ans Ende (Pos. ${posNum}) von ${updatedStore.name} verschoben!`,
        'info'
      );
    }
  }

  /**
   * Fügt eine neue bekannte Ware (mit optionaler Spezifikation) in die Laufreihenfolge
   * (`itemOrder`) des gewählten Supermarkts exakt hinter der in `#storeAddItemPreviousInput`
   * angegebenen vorigen Ware (oder am Anfang/Ende) ein.
   * @param {Event} [event] - Submit-Event
   */
  function handleAddStoreKnownItem(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById('new-store-item-name');
    const specInput = document.getElementById('new-store-item-spec');
    const prevInput = document.getElementById('storeAddItemPreviousInput');
    const name = nameInput ? nameInput.value.trim() : '';
    const specification = specInput ? specInput.value.trim() : '';
    if (!name) return;

    const prevRaw = prevInput ? prevInput.value.trim() : '';
    const prevParam = isStartPositionKeyword(prevRaw) ? '__START__' : prevRaw;

    const store = getConfigSupermarket();
    const entryInput = { name, specification };
    let res;
    if (typeof Core.addSupermarketKnownItemAfter === 'function') {
      res = Core.addSupermarketKnownItemAfter(store, entryInput, prevParam);
    } else {
      const insertIdx = prevParam === '__START__' ? 0 : -1;
      res = Core.addSupermarketKnownItem(store, entryInput, insertIdx);
    }

    const updatedStore = res.supermarket || res;

    state.supermarkets = state.supermarkets.map((s) =>
      s.id === updatedStore.id ? updatedStore : s
    );

    if (state.shoppingList.supermarketId === updatedStore.id) {
      state.shoppingList = Core.changeListSupermarket(state.shoppingList, updatedStore);
    }

    if (nameInput) nameInput.value = '';
    if (specInput) specInput.value = '';
    if (prevInput) prevInput.value = '';

    saveAppState();
    renderApp();

    const displayLabel = formatDisplayName(name, specification);
    const prevLabel =
      res.previousItem && res.previousItem !== '__START__'
        ? formatDisplayName(res.previousItem)
        : prevRaw;
    const posNum =
      typeof res.insertedAtIndex === 'number'
        ? res.insertedAtIndex + 1
        : updatedStore.itemOrder.length;

    if (prevParam === '__START__' || posNum === 1) {
      showToast(
        `🧭 „${displayLabel}“ wurde ganz am Anfang (Position 1) in ${updatedStore.name} eingefügt.`,
        'success'
      );
    } else if (res.foundPrevious) {
      showToast(
        `🧭 „${displayLabel}“ wurde direkt nach „${prevLabel}“ (Pos. ${posNum}) eingefügt.`,
        'success'
      );
    } else {
      showToast(
        `🧭 „${displayLabel}“ wurde am Ende (Pos. ${posNum}) von ${updatedStore.name} eingefügt.`,
        'success'
      );
    }
  }

  /**
   * Entfernt eine Ware (per Index oder Name/Objekt) aus der Laufreihenfolge (`itemOrder`) des gewählten Supermarkts.
   * @param {number|string|Object} itemOrIndex - Index oder Eintrag der Ware
   */
  function handleRemoveStoreKnownItem(itemOrIndex) {
    const store = getConfigSupermarket();
    if (!store) return;
    const updatedStore = Core.removeSupermarketKnownItem(store, itemOrIndex);

    state.supermarkets = state.supermarkets.map((s) =>
      s.id === updatedStore.id ? updatedStore : s
    );

    if (state.shoppingList.supermarketId === updatedStore.id) {
      state.shoppingList = Core.changeListSupermarket(state.shoppingList, updatedStore);
    }

    saveAppState();
    renderApp();
  }

  /* ==========================================================================
   * TAB 4: Dateibasierter Export & Import von Einkaufslisten
   * ========================================================================== */

  /**
   * Aktualisiert die Zusammenfassung der aktuell aktiven Einkaufsliste im Tab "Export / Import".
   */
  function renderExportImportTabSummary() {
    const summaryEl = document.getElementById('export-current-list-summary');
    if (!summaryEl || !state.shoppingList) return;
    const activeStore = getActiveSupermarket();
    const items = Array.isArray(state.shoppingList.items) ? state.shoppingList.items : [];
    const openCount = items.filter((i) => !i.checked).length;
    const checkedCount = items.length - openCount;
    const listName = state.shoppingList.name || 'Einkaufszettel';
    summaryEl.innerHTML =
      `Aktive Liste: <strong>${escapeHtml(listName)}</strong> ` +
      `(${items.length} ${items.length === 1 ? 'Ware' : 'Waren'}: ${openCount} offen, ${checkedCount} erledigt • ${escapeHtml(activeStore ? activeStore.name : '')})`;
  }

  /**
   * Speichert den aktuellen Einkaufszettel als `.smartcart.json`-Datei auf dem Gerät.
   */
  async function handleSaveShoppingListFile() {
    if (!state.shoppingList || typeof Core.saveShoppingListFile !== 'function') return;
    const activeStore = getActiveSupermarket();
    const res = await Core.saveShoppingListFile(state.shoppingList, activeStore);

    if (res && res.success) {
      showToast(`💾 Einkaufsliste als „${res.filename}“ gespeichert.`, 'success');
    } else {
      showToast(
        `⚠️ ${(res && res.error) || 'Einkaufsliste konnte nicht als Datei gespeichert werden.'}`,
        'late'
      );
    }
  }

  /**
   * Teilt den aktuellen Einkaufszettel als `.smartcart.json`-Datei über das OS-Share-Sheet
   * (z. B. WhatsApp, Mail, Messenger). Falls direktes Datei-Teilen aktuell nicht verfügbar ist,
   * wird die Datei automatisch gespeichert, damit sie manuell versendet werden kann.
   */
  async function handleShareShoppingListFile() {
    if (!state.shoppingList || typeof Core.shareShoppingListFile !== 'function') return;
    const activeStore = getActiveSupermarket();
    const res = await Core.shareShoppingListFile(state.shoppingList, activeStore, {
      fallbackToSave: true
    });

    if (!res) return;
    if (res.aborted) {
      return;
    }

    if (res.success && (res.method === 'web-share-file' || res.method === 'capacitor-share')) {
      showToast(`📤 Datei „${res.filename}“ erfolgreich geteilt!`, 'success');
    } else if (res.fallbackSaved) {
      showToast(
        `💾 Direktes Datei-Teilen ist hier aktuell nicht verfügbar – „${res.filename}“ wurde stattdessen gespeichert und kann per WhatsApp/Mail versendet werden.`,
        'info'
      );
    } else {
      showToast(
        `⚠️ ${(res && res.error) || 'Einkaufslisten-Datei konnte nicht geteilt werden.'}`,
        'late'
      );
    }
  }

  /**
   * Importiert eine ausgewählte SmartCart-Einkaufslisten-Datei (`.smartcart.json` / `.json`)
   * über `<input type="file">`, wendet den gewählten Import-Modus (`new`, `merge`, `replace`) an
   * und macht die Liste sofort auf diesem Gerät nutzbar.
   * @param {Event} event - Change-Event des Datei-Inputs
   */
  async function handleImportShoppingListFile(event) {
    const input = event && event.target ? event.target : null;
    const file = input && input.files && input.files[0];
    if (!file) return;

    const statusBox = document.getElementById('import-file-status');
    const modeSelect = document.getElementById('import-list-mode');
    const mode = modeSelect && modeSelect.value ? modeSelect.value : 'new';

    const setImportStatus = (text, variant) => {
      if (!statusBox) return;
      statusBox.style.display = 'block';
      statusBox.className = `import-status-box${variant ? ` ${variant}` : ''}`;
      statusBox.textContent = text;
    };

    try {
      if (typeof Core.readShoppingListFile !== 'function' || typeof Core.applyImportedShoppingList !== 'function') {
        setImportStatus('⚠️ Import-Modul ist nicht verfügbar.', 'error');
        return;
      }

      const parsed = await Core.readShoppingListFile(file);
      if (!parsed || !parsed.valid || !parsed.list) {
        const errMsg =
          (parsed && parsed.error) ||
          'Die ausgewählte Datei konnte nicht als SmartCart-Einkaufsliste gelesen werden.';
        setImportStatus(`❌ ${errMsg}`, 'error');
        showToast(`❌ ${errMsg}`, 'late');
        return;
      }

      const activeStore = getActiveSupermarket();
      const applied = Core.applyImportedShoppingList(parsed.list, {
        mode,
        targetList: state.shoppingList,
        existingLists: state.shoppingLists,
        supermarkets: state.supermarkets,
        supermarketMeta: parsed.supermarketMeta,
        fallbackSupermarketId: activeStore ? activeStore.id : undefined
      });

      if (!applied || !applied.list) {
        setImportStatus('❌ Importierte Einkaufsliste konnte nicht übernommen werden.', 'error');
        showToast('❌ Importierte Einkaufsliste konnte nicht übernommen werden.', 'late');
        return;
      }

      const repo = getRepository();
      if (mode === 'new') {
        state.shoppingList = applied.list;
        state.shoppingLists = [...state.shoppingLists, applied.list];
        if (repo && typeof repo.saveShoppingLists === 'function') {
          repo.saveShoppingLists(state.shoppingLists);
        }
      } else {
        state.shoppingList = applied.list;
        const idx = state.shoppingLists.findIndex((l) => l.id === applied.list.id);
        if (idx !== -1) {
          state.shoppingLists[idx] = applied.list;
        } else {
          state.shoppingLists.push(applied.list);
        }
      }

      if (applied.supermarket && applied.supermarket.id) {
        state.configSelectedStoreId = applied.supermarket.id;
      }

      saveAppState();
      renderApp();
      switchTab('tab-list');

      const storeLabel = applied.supermarket ? applied.supermarket.name : activeStore.name;
      let successMsg;
      if (mode === 'merge') {
        const skipInfo =
          applied.skippedCount > 0 ? ` (${applied.skippedCount} bereits vorhanden)` : '';
        successMsg = `📥 ${applied.addedCount} Waren in „${applied.list.name}“ zusammengeführt${skipInfo} und für ${storeLabel} sortiert!`;
      } else if (mode === 'replace') {
        successMsg = `📥 „${applied.list.name}“ mit ${applied.addedCount} importierten Waren ersetzt (${storeLabel})!`;
      } else {
        successMsg = `📥 Einkaufszettel „${applied.list.name}“ (${applied.addedCount} Waren) importiert und für ${storeLabel} sortiert!`;
      }

      setImportStatus(`✅ ${successMsg}`, 'success');
      showToast(successMsg, 'success');
    } catch (err) {
      const errMsg = (err && err.message) || 'Unbekannter Fehler beim Datei-Import.';
      setImportStatus(`❌ ${errMsg}`, 'error');
      showToast(`❌ ${errMsg}`, 'late');
    } finally {
      if (input) input.value = '';
    }
  }

  /* ==========================================================================
   * Event-Listener (inkl. Touch/Mouse Drag & Drop) & Hilfsfunktionen
   * ========================================================================== */

  /**
   * Stoppt eine laufende Auto-Scroll-Animation (`requestAnimationFrame`) beim Drag & Drop
   * und entfernt ein ggf. vorhandenes schwebendes Drag-Vorschau-Element.
   */
  function stopDragAutoScroll() {
    if (state.dragState.autoScrollRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(state.dragState.autoScrollRafId);
    }
    state.dragState.autoScrollRafId = null;
    state.dragState.autoScrollLastTime = 0;
    state.dragState.autoScrollSpeed = 0;
    state.dragState.dragFromIndex = null;
    state.dragState.dragCurrentOverIndex = null;
    state.dragState.touchDragFromIndex = null;
    state.dragState.touchCurrentOverIndex = null;
    if (state.dragState.ghostEl && state.dragState.ghostEl.parentNode) {
      state.dragState.ghostEl.parentNode.removeChild(state.dragState.ghostEl);
    }
    state.dragState.ghostEl = null;
    if (typeof document !== 'undefined') {
      if (document.body) {
        document.body.classList.remove('is-dragging-store-order');
      }
      const listEl = document.getElementById('store-order-list');
      if (listEl) {
        listEl.querySelectorAll('.store-order-item').forEach((row) => {
          row.classList.remove('dragging', 'drag-over');
        });
      }
    }
  }

  /**
   * Ermittelt den tatsächlichen Scroll-Container für ein Element (entweder ein
   * scrollbares Eltern-Element mit `overflow-y: auto|scroll` oder `window`).
   * @param {HTMLElement} element
   * @returns {HTMLElement|Window}
   */
  function getDragScrollContainer(element) {
    let el = element ? element.parentElement : null;
    while (el && el !== document.body && el !== document.documentElement) {
      const style = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(el) : null;
      const overflowY = style ? style.overflowY : '';
      if (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 1
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return window;
  }

  /**
   * Berechnet die sichtbaren oberen/unteren Grenzen sowie die Randzone (`edgeZone`)
   * für das automatische Scrollen beim Ziehen (unter Berücksichtigung des Sticky-Headers
   * und der fixierten unteren Navigationsleiste).
   * @param {HTMLElement|Window} scrollContainer
   * @returns {{ topEdge: number, bottomEdge: number, edgeZone: number }}
   */
  function getVisibleDragBounds(scrollContainer) {
    const viewportH =
      (typeof window !== 'undefined' && window.innerHeight) ||
      (document.documentElement && document.documentElement.clientHeight) ||
      600;
    let topEdge = 0;
    let bottomEdge = viewportH;

    const appHeader = document.querySelector('.app-header');
    if (appHeader && typeof appHeader.getBoundingClientRect === 'function') {
      const rect = appHeader.getBoundingClientRect();
      if (rect.height > 0 && rect.bottom > 0 && rect.top <= 2) {
        topEdge = Math.max(topEdge, rect.bottom);
      }
    }

    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav && typeof bottomNav.getBoundingClientRect === 'function') {
      const rect = bottomNav.getBoundingClientRect();
      if (rect.height > 0 && rect.top < viewportH) {
        bottomEdge = Math.min(bottomEdge, rect.top);
      }
    }

    if (scrollContainer && scrollContainer !== window && typeof scrollContainer.getBoundingClientRect === 'function') {
      const rect = scrollContainer.getBoundingClientRect();
      topEdge = Math.max(topEdge, rect.top);
      bottomEdge = Math.min(bottomEdge, rect.bottom);
    }

    if (bottomEdge - topEdge < 90) {
      topEdge = 0;
      bottomEdge = viewportH;
    }

    const visibleHeight = Math.max(1, bottomEdge - topEdge);
    const edgeZone = Math.max(56, Math.min(96, Math.round(visibleHeight * 0.22)));
    return { topEdge, bottomEdge, edgeZone };
  }

  /**
   * Berechnet die Scroll-Geschwindigkeit (Pixel pro 16,67ms Frame) in Abhängigkeit von der
   * Nähe zur oberen oder unteren Randzone. Gibt `0` zurück, wenn der Zeiger außerhalb der Randzonen ist.
   * @param {number} clientY
   * @param {{ topEdge: number, bottomEdge: number, edgeZone: number }} bounds
   * @returns {number}
   */
  function computeDragAutoScrollSpeed(clientY, bounds) {
    const { topEdge, bottomEdge, edgeZone } = bounds;
    const MIN_SPEED = 4.5;
    const MAX_SPEED = 18;

    if (clientY < topEdge + edgeZone) {
      const ratio = Math.min(1, Math.max(0, (topEdge + edgeZone - clientY) / edgeZone));
      return -(MIN_SPEED + (MAX_SPEED - MIN_SPEED) * ratio);
    }
    if (clientY > bottomEdge - edgeZone) {
      const ratio = Math.min(1, Math.max(0, (clientY - (bottomEdge - edgeZone)) / edgeZone));
      return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * ratio;
    }
    return 0;
  }

  /**
   * Registriert HTML5-Drag-and-Drop- sowie Mobile-Touch-Drag-Event-Listener
   * inkl. flüssigem Rand-Auto-Scroll (`requestAnimationFrame`) auf der Supermarkt-Warenliste (`#store-order-list`).
   * @param {HTMLElement} listEl - Das `<ul id="store-order-list">`-Element
   */
  function bindStoreOrderDragAndDrop(listEl) {
    if (!listEl) return;

    const clearDragClasses = () => {
      listEl.querySelectorAll('.store-order-item').forEach((row) => {
        row.classList.remove('dragging', 'drag-over');
      });
    };

    const cleanupAllDragState = () => {
      stopDragAutoScroll();
      state.dragState.dragFromIndex = null;
      state.dragState.dragCurrentOverIndex = null;
      state.dragState.touchDragFromIndex = null;
      state.dragState.touchCurrentOverIndex = null;
      clearDragClasses();
    };

    const createDragGhost = (row, clientY) => {
      if (state.dragState.ghostEl && state.dragState.ghostEl.parentNode) {
        state.dragState.ghostEl.parentNode.removeChild(state.dragState.ghostEl);
      }
      const rect = row.getBoundingClientRect();
      const ghost = row.cloneNode(true);
      ghost.removeAttribute('draggable');
      ghost.classList.remove('dragging', 'drag-over');
      ghost.classList.add('drag-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.left = `${rect.left}px`;
      ghost.style.width = `${rect.width}px`;
      const offsetY = Math.max(0, Math.min(rect.height, clientY - rect.top));
      state.dragState.ghostOffsetY = offsetY;
      ghost.style.top = `${rect.top}px`;
      document.body.appendChild(ghost);
      state.dragState.ghostEl = ghost;
    };

    const positionDragGhost = (clientY) => {
      const ghost = state.dragState.ghostEl;
      if (!ghost) return;
      const viewportH =
        (typeof window !== 'undefined' && window.innerHeight) ||
        (document.documentElement && document.documentElement.clientHeight) ||
        600;
      const ghostH = ghost.offsetHeight || 52;
      const desiredTop = clientY - state.dragState.ghostOffsetY;
      const clampedTop = Math.max(4, Math.min(viewportH - ghostH - 4, desiredTop));
      ghost.style.top = `${clampedTop}px`;
    };

    const updateDropTargetAtPoint = (clientX, clientY, mode) => {
      const rows = Array.from(listEl.querySelectorAll('.store-order-item[data-item-index]'));
      if (rows.length === 0) return;

      const scrollContainer = getDragScrollContainer(listEl);
      const { topEdge, bottomEdge } = getVisibleDragBounds(scrollContainer);
      const listRect = listEl.getBoundingClientRect();

      const sampleX =
        listRect.width > 16
          ? Math.max(listRect.left + 8, Math.min(listRect.right - 8, clientX))
          : clientX;
      const sampleY = Math.max(topEdge + 4, Math.min(bottomEdge - 4, clientY));

      let overRow = null;
      if (typeof document.elementFromPoint === 'function') {
        const hitEl = document.elementFromPoint(sampleX, sampleY);
        if (hitEl && typeof hitEl.closest === 'function') {
          const candidate = hitEl.closest('.store-order-item[data-item-index]');
          if (candidate && listEl.contains(candidate)) {
            overRow = candidate;
          }
        }
      }

      if (!overRow) {
        const firstRect = rows[0].getBoundingClientRect();
        const lastRect = rows[rows.length - 1].getBoundingClientRect();
        if (sampleY <= firstRect.top) {
          overRow = rows[0];
        } else if (sampleY >= lastRect.bottom) {
          overRow = rows[rows.length - 1];
        } else {
          let bestRow = null;
          let bestDist = Infinity;
          for (const row of rows) {
            const rect = row.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            const dist = Math.abs(sampleY - mid);
            if (dist < bestDist) {
              bestDist = dist;
              bestRow = row;
            }
          }
          overRow = bestRow;
        }
      }

      listEl.querySelectorAll('.store-order-item.drag-over').forEach((el) => {
        if (el !== overRow) el.classList.remove('drag-over');
      });

      if (overRow) {
        overRow.classList.add('drag-over');
        const idx = Number(overRow.getAttribute('data-item-index'));
        if (!isNaN(idx)) {
          if (mode === 'touch') {
            state.dragState.touchCurrentOverIndex = idx;
          } else {
            state.dragState.dragCurrentOverIndex = idx;
          }
        }
      }
    };

    const scrollContainerBy = (container, deltaY) => {
      if (!deltaY) return false;
      if (container === window) {
        const scrollingEl = document.scrollingElement || document.documentElement;
        const before =
          typeof window.scrollY === 'number'
            ? window.scrollY
            : scrollingEl
            ? scrollingEl.scrollTop
            : 0;
        if (typeof window.scrollBy === 'function') {
          window.scrollBy(0, deltaY);
        } else if (scrollingEl) {
          scrollingEl.scrollTop = before + deltaY;
        }
        const after =
          typeof window.scrollY === 'number'
            ? window.scrollY
            : scrollingEl
            ? scrollingEl.scrollTop
            : 0;
        return after !== before;
      }
      const before = container.scrollTop;
      container.scrollTop = before + deltaY;
      return container.scrollTop !== before;
    };

    const stopAutoScrollLoopOnly = () => {
      if (state.dragState.autoScrollRafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(state.dragState.autoScrollRafId);
      }
      state.dragState.autoScrollRafId = null;
      state.dragState.autoScrollLastTime = 0;
      state.dragState.autoScrollSpeed = 0;
    };

    const updateAutoScrollForPointer = (clientX, clientY, mode) => {
      state.dragState.pointerClientX = clientX;
      state.dragState.pointerClientY = clientY;

      const container = getDragScrollContainer(listEl);
      const bounds = getVisibleDragBounds(container);
      const speed = computeDragAutoScrollSpeed(clientY, bounds);
      state.dragState.autoScrollSpeed = speed;

      if (speed === 0) {
        stopAutoScrollLoopOnly();
        return;
      }

      if (state.dragState.autoScrollRafId === null && typeof requestAnimationFrame === 'function') {
        state.dragState.autoScrollLastTime =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();

        const tick = (now) => {
          const isTouchDragging = state.dragState.touchDragFromIndex !== null;
          const isMouseDragging = state.dragState.dragFromIndex !== null;
          if ((!isTouchDragging && !isMouseDragging) || state.dragState.autoScrollSpeed === 0) {
            stopAutoScrollLoopOnly();
            return;
          }

          const currentTime =
            typeof now === 'number'
              ? now
              : typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : Date.now();
          const dt = Math.min(48, Math.max(4, currentTime - state.dragState.autoScrollLastTime));
          state.dragState.autoScrollLastTime = currentTime;

          const activeContainer = getDragScrollContainer(listEl);
          const activeBounds = getVisibleDragBounds(activeContainer);
          const currentSpeed = computeDragAutoScrollSpeed(
            state.dragState.pointerClientY,
            activeBounds
          );
          state.dragState.autoScrollSpeed = currentSpeed;

          if (currentSpeed === 0) {
            stopAutoScrollLoopOnly();
            return;
          }

          const deltaY = currentSpeed * (dt / 16.67);
          const scrolled = scrollContainerBy(activeContainer, deltaY);

          if (isTouchDragging) {
            positionDragGhost(state.dragState.pointerClientY);
          }

          if (scrolled) {
            updateDropTargetAtPoint(
              state.dragState.pointerClientX,
              state.dragState.pointerClientY,
              isTouchDragging ? 'touch' : 'mouse'
            );
          }

          state.dragState.autoScrollRafId = requestAnimationFrame(tick);
        };

        state.dragState.autoScrollRafId = requestAnimationFrame(tick);
      }
    };

    // 1. HTML5 Mouse / Desktop Drag & Drop
    listEl.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.store-order-item[data-item-index]');
      if (!row) return;
      const idx = Number(row.getAttribute('data-item-index'));
      state.dragState.dragFromIndex = idx;
      state.dragState.dragCurrentOverIndex = idx;
      row.classList.add('dragging');
      if (document.body) document.body.classList.add('is-dragging-store-order');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
      }
    });

    listEl.addEventListener('dragover', (e) => {
      if (state.dragState.dragFromIndex === null) return;
      e.preventDefault();
      updateDropTargetAtPoint(e.clientX, e.clientY, 'mouse');
      updateAutoScrollForPointer(e.clientX, e.clientY, 'mouse');
    });

    document.addEventListener('dragover', (e) => {
      if (state.dragState.dragFromIndex === null) return;
      if (listEl.contains(e.target)) return;
      e.preventDefault();
      updateDropTargetAtPoint(e.clientX, e.clientY, 'mouse');
      updateAutoScrollForPointer(e.clientX, e.clientY, 'mouse');
    });

    listEl.addEventListener('drop', (e) => {
      if (state.dragState.dragFromIndex === null) return;
      e.preventDefault();
      const targetRow = e.target.closest('.store-order-item[data-item-index]');
      const fromIdx = state.dragState.dragFromIndex;
      const fallbackToIdx = state.dragState.dragCurrentOverIndex;
      cleanupAllDragState();
      const toIdx = targetRow ? Number(targetRow.getAttribute('data-item-index')) : fallbackToIdx;
      if (typeof toIdx === 'number' && !isNaN(toIdx) && fromIdx !== toIdx) {
        handleDragReorderStoreItem(fromIdx, toIdx);
      }
    });

    document.addEventListener('drop', (e) => {
      if (state.dragState.dragFromIndex === null) return;
      if (listEl.contains(e.target)) return;
      e.preventDefault();
      const fromIdx = state.dragState.dragFromIndex;
      const toIdx = state.dragState.dragCurrentOverIndex;
      cleanupAllDragState();
      if (typeof toIdx === 'number' && !isNaN(toIdx) && fromIdx !== toIdx) {
        handleDragReorderStoreItem(fromIdx, toIdx);
      }
    });

    listEl.addEventListener('dragend', () => {
      cleanupAllDragState();
    });

    // 2. Mobile Touch Drag & Drop über das ☰ Drag-Handle
    listEl.addEventListener(
      'touchstart',
      (e) => {
        const handle = e.target.closest('[data-drag-handle]');
        if (!handle) return;
        const row = handle.closest('.store-order-item[data-item-index]');
        if (!row) return;
        const touch = e.touches && e.touches[0];
        if (!touch) return;
        if (e.cancelable) e.preventDefault();

        const idx = Number(row.getAttribute('data-item-index'));
        state.dragState.touchDragFromIndex = idx;
        state.dragState.touchCurrentOverIndex = idx;
        state.dragState.pointerClientX = touch.clientX;
        state.dragState.pointerClientY = touch.clientY;
        row.classList.add('dragging');
        if (document.body) document.body.classList.add('is-dragging-store-order');
        createDragGhost(row, touch.clientY);
      },
      { passive: false }
    );

    listEl.addEventListener(
      'touchmove',
      (e) => {
        if (state.dragState.touchDragFromIndex === null) return;
        const touch = e.touches && e.touches[0];
        if (!touch) return;
        if (e.cancelable) e.preventDefault();

        positionDragGhost(touch.clientY);
        updateDropTargetAtPoint(touch.clientX, touch.clientY, 'touch');
        updateAutoScrollForPointer(touch.clientX, touch.clientY, 'touch');
      },
      { passive: false }
    );

    const finishTouchDrag = (commitReorder) => {
      if (state.dragState.touchDragFromIndex === null) return;
      const fromIdx = state.dragState.touchDragFromIndex;
      const toIdx = state.dragState.touchCurrentOverIndex;
      cleanupAllDragState();
      if (commitReorder && typeof toIdx === 'number' && !isNaN(toIdx) && fromIdx !== toIdx) {
        handleDragReorderStoreItem(fromIdx, toIdx);
      }
    };

    listEl.addEventListener('touchend', () => finishTouchDrag(true));
    listEl.addEventListener('touchcancel', () => finishTouchDrag(false));

    if (typeof window !== 'undefined') {
      window.addEventListener('blur', () => {
        if (
          state.dragState.touchDragFromIndex !== null ||
          state.dragState.dragFromIndex !== null
        ) {
          cleanupAllDragState();
        }
      });
    }
  }

  /**
   * Bricht einen aktiven Long-Press-Timer auf einer unbekannten Einkaufslisten-Ware ab
   * und entfernt visuelles Hold-Feedback.
   */
  function cancelUnknownItemLongPress() {
    if (state.longPressState.timerId !== null) {
      clearTimeout(state.longPressState.timerId);
      state.longPressState.timerId = null;
    }
    if (state.longPressState.feedbackTimerId !== null) {
      clearTimeout(state.longPressState.feedbackTimerId);
      state.longPressState.feedbackTimerId = null;
    }
    if (state.longPressState.activeRow) {
      state.longPressState.activeRow.classList.remove('long-pressing');
      state.longPressState.activeRow = null;
    }
    state.longPressState.itemId = null;
    state.longPressState.pointerId = null;
    state.longPressState.triggered = false;
    state.longPressState.triggeredPointerId = null;
  }

  /**
   * Registriert zuverlässige Long-Press-Erkennung ("langes Gedrückthalten") auf unbekannten
   * Einkaufslisten-Waren (`[data-unknown-item="true"]`) für Touch UND Maus/Pointer:
   * - Löst nach 550ms gedrückt halten aus und fügt die Ware dem aktuellen Supermarkt hinzu.
   * - Bricht sofort ab bei Bewegung > 10px oder Scrollen (kein versehentliches Auslösen beim Scrollen).
   * - Unterdrückt das folgende `click`-Event nach erfolgreichem Long-Press (kein Konflikt mit Abhaken).
   * - Verhindert unerwünschte Textauswahl und Browser-Kontextmenüs während des Gedrückthaltens.
   * @param {HTMLElement} listEl
   */
  function bindUnknownItemLongPress(listEl) {
    if (!listEl) return;

    const LONG_PRESS_DURATION_MS = 550;
    const FEEDBACK_DELAY_MS = 110;
    const MOVE_CANCEL_PX = 10;

    const clearStaleTriggeredState = () => {
      state.longPressState.triggered = false;
      state.longPressState.triggeredPointerId = null;
    };

    const startPress = (row, clientX, clientY, pointerId) => {
      cancelUnknownItemLongPress();
      const itemId = row.getAttribute('data-item-id');
      if (!itemId) return;

      state.longPressState.activeRow = row;
      state.longPressState.itemId = itemId;
      state.longPressState.startX = clientX;
      state.longPressState.startY = clientY;
      state.longPressState.pointerId = pointerId;
      state.longPressState.triggered = false;
      state.longPressState.triggeredPointerId = null;

      state.longPressState.feedbackTimerId = setTimeout(() => {
        if (state.longPressState.activeRow === row) {
          row.classList.add('long-pressing');
        }
      }, FEEDBACK_DELAY_MS);

      state.longPressState.timerId = setTimeout(() => {
        const triggeredItemId = state.longPressState.itemId;
        const activePointerId = state.longPressState.pointerId;
        cancelUnknownItemLongPress();
        state.longPressState.triggered = true;
        state.longPressState.triggeredPointerId = activePointerId;
        state.longPressState.suppressNextClickUntil = Date.now() + 700;
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate(25);
          } catch (_) {}
        }
        if (triggeredItemId) {
          handleAddUnknownItemToSupermarket(triggeredItemId);
        }
      }, LONG_PRESS_DURATION_MS);
    };

    const finishPressRelease = () => {
      if (state.longPressState.triggered) {
        state.longPressState.suppressNextClickUntil = Date.now() + 450;
      }
      cancelUnknownItemLongPress();
    };

    const checkMoveCancel = (clientX, clientY) => {
      if (state.longPressState.timerId === null) return;
      const dx = clientX - state.longPressState.startX;
      const dy = clientY - state.longPressState.startY;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
        cancelUnknownItemLongPress();
      }
    };

    listEl.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.shopping-item[data-unknown-item="true"]')) {
        e.preventDefault();
      }
    });

    if (typeof window !== 'undefined' && 'PointerEvent' in window) {
      listEl.addEventListener('pointerdown', (e) => {
        clearStaleTriggeredState();
        if (e.isPrimary === false) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('button')) return;
        const row = e.target.closest('.shopping-item[data-unknown-item="true"][data-item-id]');
        if (!row) return;
        startPress(row, e.clientX, e.clientY, e.pointerId);
      });

      listEl.addEventListener('pointermove', (e) => {
        if (state.longPressState.pointerId !== e.pointerId) return;
        checkMoveCancel(e.clientX, e.clientY);
      });

      const endPointer = (e) => {
        const matchesActive = state.longPressState.pointerId === e.pointerId;
        const matchesTriggered =
          state.longPressState.triggered &&
          state.longPressState.triggeredPointerId === e.pointerId;
        if (matchesActive || matchesTriggered) {
          finishPressRelease();
        }
      };
      listEl.addEventListener('pointerup', endPointer);
      listEl.addEventListener('pointercancel', endPointer);
      listEl.addEventListener('pointerleave', endPointer);

      if (!state.longPressState.windowCleanupBound) {
        state.longPressState.windowCleanupBound = true;
        window.addEventListener('pointerup', endPointer);
        window.addEventListener('pointercancel', endPointer);
      }
    } else {
      // Fallback für ältere Umgebungen ohne PointerEvent
      const endFallback = (kind) => {
        const matchesActive = state.longPressState.pointerId === kind;
        const matchesTriggered =
          state.longPressState.triggered &&
          state.longPressState.triggeredPointerId === kind;
        if (matchesActive || matchesTriggered) {
          finishPressRelease();
        }
      };

      listEl.addEventListener(
        'touchstart',
        (e) => {
          clearStaleTriggeredState();
          if (e.target.closest('button')) return;
          const row = e.target.closest('.shopping-item[data-unknown-item="true"][data-item-id]');
          const touch = e.touches && e.touches[0];
          if (!row || !touch) return;
          startPress(row, touch.clientX, touch.clientY, 'touch');
        },
        { passive: true }
      );
      listEl.addEventListener(
        'touchmove',
        (e) => {
          const touch = e.touches && e.touches[0];
          if (touch) checkMoveCancel(touch.clientX, touch.clientY);
        },
        { passive: true }
      );
      listEl.addEventListener('touchend', () => endFallback('touch'));
      listEl.addEventListener('touchcancel', () => endFallback('touch'));

      listEl.addEventListener('mousedown', (e) => {
        clearStaleTriggeredState();
        if (e.button !== 0 || e.target.closest('button')) return;
        const row = e.target.closest('.shopping-item[data-unknown-item="true"][data-item-id]');
        if (!row) return;
        startPress(row, e.clientX, e.clientY, 'mouse');
      });
      listEl.addEventListener('mousemove', (e) => {
        if (state.longPressState.pointerId === 'mouse') {
          checkMoveCancel(e.clientX, e.clientY);
        }
      });
      listEl.addEventListener('mouseup', () => endFallback('mouse'));
      listEl.addEventListener('mouseleave', () => endFallback('mouse'));

      if (typeof window !== 'undefined' && !state.longPressState.windowCleanupBound) {
        state.longPressState.windowCleanupBound = true;
        window.addEventListener('touchend', () => endFallback('touch'));
        window.addEventListener('touchcancel', () => endFallback('touch'));
        window.addEventListener('mouseup', () => endFallback('mouse'));
      }
    }
  }

  /**
   * Registriert alle DOM-Event-Listener für Navigation, Einkaufszettel-Verwaltung,
   * Formulare, Listen-Interaktionen, Drag & Drop und Modals.
   */
  function bindEventListeners() {
    const addListener = (id, eventName, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(eventName, handler);
    };

    // Bottom Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        if (target) switchTab(target);
      });
    });

    // Supermarket Selector Pills at Top
    const storeSelectorBar = document.getElementById('store-selector-bar');
    if (storeSelectorBar) {
      storeSelectorBar.addEventListener('click', (e) => {
        const pill = e.target.closest('[data-store-id]');
        if (pill) {
          selectSupermarket(pill.getAttribute('data-store-id'));
        }
      });
    }

    // Einkaufszettel-Verwaltung (Listen-Leiste)
    addListener('shoppingListSelect', 'change', (e) => {
      handleSwitchShoppingList(e.target.value);
    });
    addListener('btnNewShoppingList', 'click', () => openShoppingListModal('create'));
    addListener('btnRenameShoppingList', 'click', () => openShoppingListModal('rename'));
    addListener('btnSaveShoppingList', 'click', handleSaveShoppingList);
    addListener('btnDeleteShoppingList', 'click', handleDeleteShoppingList);
    addListener('shopping-list-modal-form', 'submit', handleShoppingListModalSubmit);
    addListener('shopping-list-modal-cancel-btn', 'click', closeShoppingListModal);

    // Live-Optimierung Toggle
    const liveOptToggle = document.getElementById('live-opt-toggle');
    if (liveOptToggle) {
      liveOptToggle.addEventListener('change', (e) => {
        handleToggleLiveOptimization(Boolean(e.target.checked));
      });
    }

    // Add Item Form
    addListener('add-item-form', 'submit', handleAddItemSubmit);

    // Quick Suggestions Chips
    const quickSuggestions = document.getElementById('quick-suggestions');
    if (quickSuggestions) {
      quickSuggestions.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-suggest-name]');
        if (!chip) return;
        const itemName = chip.getAttribute('data-suggest-name') || '';
        const itemSpec = chip.getAttribute('data-suggest-spec') || '';
        const nameInput = document.getElementById('add-item-name');
        const specInput = document.getElementById('add-item-spec');
        if (nameInput) {
          nameInput.value = itemName;
          if (specInput) specInput.value = itemSpec;
          handleAddItemSubmit();
        }
      });
    }

    // Checked & Unchecked Lists (Delegated click for toggle check, edit & delete + Long-Press for unknown items)
    const handleListClick = (e) => {
      if (Date.now() < state.longPressState.suppressNextClickUntil) {
        state.longPressState.suppressNextClickUntil = 0;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const editBtn = e.target.closest('[data-edit-item-id]');
      if (editBtn) {
        openEditItemModal(editBtn.getAttribute('data-edit-item-id'), e);
        return;
      }
      const deleteBtn = e.target.closest('[data-delete-id]');
      if (deleteBtn) {
        handleRemoveItem(deleteBtn.getAttribute('data-delete-id'), e);
        return;
      }
      const itemRow = e.target.closest('[data-item-id]');
      if (itemRow) {
        handleItemToggleCheck(itemRow.getAttribute('data-item-id'));
      }
    };

    const checkedListEl = document.getElementById('checked-items-list');
    const uncheckedListEl = document.getElementById('unchecked-items-list');
    if (checkedListEl) {
      checkedListEl.addEventListener('click', handleListClick);
      bindUnknownItemLongPress(checkedListEl);
    }
    if (uncheckedListEl) {
      uncheckedListEl.addEventListener('click', handleListClick);
      bindUnknownItemLongPress(uncheckedListEl);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener(
        'scroll',
        () => {
          if (state.longPressState.timerId !== null) {
            cancelUnknownItemLongPress();
          }
        },
        { passive: true, capture: true }
      );
    }

    // Edit Shopping List Item Modal
    addListener('edit-item-modal-form', 'submit', handleEditItemModalSubmit);
    addListener('edit-item-modal-cancel-btn', 'click', closeEditItemModal);

    // Edit Supermarket Item Modal
    addListener('edit-store-item-modal-form', 'submit', handleEditStoreItemModalSubmit);
    addListener('edit-store-item-modal-cancel-btn', 'click', closeEditStoreItemModal);

    addListener('clear-checked-btn', 'click', handleClearCheckedItems);
    addListener('seed-demo-list-btn', 'click', seedDemoShoppingList);

    // Live-Optimierung Modal Buttons
    addListener('live-opt-confirm-btn', 'click', confirmLiveOptimizationUpdate);
    addListener('live-opt-cancel-btn', 'click', closeLiveOptimizationModal);

    // OCR / Photo Scanner Tab
    addListener('ocr-file-input', 'change', handleOcrFileUpload);
    document.querySelectorAll('.demo-photo-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleLoadDemoPhoto(btn.getAttribute('data-preset'));
      });
    });
    addListener('ocr-raw-textarea', 'input', (e) => {
      renderOcrPreviewFromText(e.target.value);
    });
    addListener('ocr-import-btn', 'click', handleImportOcrItems);

    // Supermarket Configurator Tab
    addListener('config-store-select', 'change', (e) => {
      state.configSelectedStoreId = e.target.value;
      renderSupermarketConfigurator();
    });
    addListener('create-store-form', 'submit', handleCreateSupermarket);
    addListener('rename-store-btn', 'click', handleRenameSupermarket);
    addListener('delete-store-btn', 'click', handleDeleteSupermarket);
    addListener('add-store-item-form', 'submit', handleAddStoreKnownItem);

    // Quick button "⬆️ Pos. 1" when adding a new known item to supermarket
    addListener('btnInsertAtStoreStart', 'click', () => {
      const prevInput = document.getElementById('storeAddItemPreviousInput');
      const nameInput = document.getElementById('new-store-item-name');
      if (prevInput) {
        prevInput.value = 'Ganz am Anfang (Position 1)';
      }
      if (nameInput && nameInput.value.trim()) {
        handleAddStoreKnownItem();
      } else if (nameInput) {
        nameInput.focus();
      }
    });

    // Supermarket Item Order List (✎ Edit, ⇄ Move Modal, ↑/↓ Arrows, ✕ Remove, Drag & Drop)
    const storeOrderList = document.getElementById('store-order-list');
    if (storeOrderList) {
      storeOrderList.addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-edit-store-idx]');
        if (editBtn) {
          const idx = Number(editBtn.getAttribute('data-edit-store-idx'));
          openEditStoreItemModal(idx);
          return;
        }
        const moveAfterBtn = e.target.closest('[data-move-after-idx]');
        if (moveAfterBtn) {
          const itemName = moveAfterBtn.getAttribute('data-move-after-item') || '';
          const idx = Number(moveAfterBtn.getAttribute('data-move-after-idx'));
          openMoveStoreItemModal(itemName, idx);
          return;
        }
        const moveBtn = e.target.closest('[data-move-idx]');
        if (moveBtn) {
          const idx = Number(moveBtn.getAttribute('data-move-idx'));
          const dir = moveBtn.getAttribute('data-move-dir');
          handleMoveStoreItem(idx, dir);
          return;
        }
        const removeIdxBtn = e.target.closest('[data-remove-store-idx]');
        if (removeIdxBtn) {
          const idx = Number(removeIdxBtn.getAttribute('data-remove-store-idx'));
          handleRemoveStoreKnownItem(idx);
          return;
        }
        const removeBtn = e.target.closest('[data-remove-store-item]');
        if (removeBtn) {
          handleRemoveStoreKnownItem(removeBtn.getAttribute('data-remove-store-item'));
        }
      });

      bindStoreOrderDragAndDrop(storeOrderList);
    }

    // Direct Move (⇄) Modal Listeners
    addListener('move-item-to-start-btn', 'click', () => {
      if (!state.pendingMoveItem) return;
      const target =
        typeof state.pendingMoveItem.currentIndex === 'number'
          ? state.pendingMoveItem.currentIndex
          : state.pendingMoveItem.itemName;
      handleMoveStoreItemAfter(target, '__START__');
    });

    addListener('move-item-picker-list', 'click', (e) => {
      const chip = e.target.closest('[data-pick-prev-item]');
      if (!chip) return;
      const chosenPrev = chip.getAttribute('data-pick-prev-item');
      const inputEl = document.getElementById('moveStoreItemPreviousInput');
      if (inputEl) inputEl.value = chosenPrev;
      document.querySelectorAll('#move-item-picker-list .move-picker-chip').forEach((el) => {
        el.classList.toggle('selected', el === chip);
      });
    });

    addListener('move-item-confirm-btn', 'click', () => {
      if (!state.pendingMoveItem) {
        closeMoveStoreItemModal();
        return;
      }
      const inputEl = document.getElementById('moveStoreItemPreviousInput');
      const prevVal = inputEl ? inputEl.value.trim() : '';
      if (!prevVal) {
        showToast('⚠️ Bitte wähle eine vorige Ware aus oder klicke auf „Ganz an den Anfang“.', 'late');
        return;
      }
      const target =
        typeof state.pendingMoveItem.currentIndex === 'number'
          ? state.pendingMoveItem.currentIndex
          : state.pendingMoveItem.itemName;
      handleMoveStoreItemAfter(target, prevVal);
    });

    addListener('move-item-cancel-btn', 'click', closeMoveStoreItemModal);

    // File-based Export & Import Tab
    addListener('share-list-file-btn', 'click', handleShareShoppingListFile);
    addListener('save-list-file-btn', 'click', handleSaveShoppingListFile);
    addListener('import-list-file-input', 'change', handleImportShoppingListFile);
  }

  /**
   * Zeigt eine temporäre Toast-Benachrichtigung am unteren Bildschirmrand an.
   * @param {string} message - Anzuzeigender Text
   * @param {'info'|'success'|'late'} [type='info'] - Visueller Typ des Toasts
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 4200);
  }

  /**
   * Liest ein `File`-Objekt als Base64-Data-URL ein.
   * @param {File} file
   * @returns {Promise<string>}
   */
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Maskiert HTML-Sonderzeichen zur sicheren Darstellung im DOM.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Registriert den PWA-Service-Worker (`sw.js`), sofern die App über HTTP(S) ausgeliefert wird.
   */
  function registerServiceWorkerIfSupported() {
    if (
      typeof window !== 'undefined' &&
      !window.__SMARTCART_STANDALONE__ &&
      'serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  const uiExports = {
    state,
    initSmartCartApp,
    loadInitialState,
    createInitialStarterList,
    getActiveSupermarket,
    getConfigSupermarket,
    saveAppState,
    switchTab,
    renderShoppingListsBar,
    handleSwitchShoppingList,
    openShoppingListModal,
    closeShoppingListModal,
    handleShoppingListModalSubmit,
    handleCreateNewShoppingList,
    handleRenameShoppingList,
    handleSaveShoppingList,
    handleDeleteShoppingList,
    selectSupermarket,
    handleToggleLiveOptimization,
    handleAddItemSubmit,
    openEditItemModal,
    closeEditItemModal,
    handleEditItemModalSubmit,
    handleAddUnknownItemToSupermarket,
    handleItemToggleCheck,
    openLiveOptimizationModal,
    confirmLiveOptimizationUpdate,
    closeLiveOptimizationModal,
    handleRemoveItem,
    handleClearCheckedItems,
    seedDemoShoppingList,
    renderApp,
    renderHeaderAndStorePills,
    renderLiveOptimizationHeader,
    renderShoppingListView,
    renderQuickSuggestions,
    renderExportImportTabSummary,
    handleOcrFileUpload,
    handleLoadDemoPhoto,
    renderOcrPreviewFromText,
    handleImportOcrItems,
    renderSupermarketConfigurator,
    handleCreateSupermarket,
    handleRenameSupermarket,
    handleDeleteSupermarket,
    handleMoveStoreItem,
    handleDragReorderStoreItem,
    openEditStoreItemModal,
    closeEditStoreItemModal,
    handleEditStoreItemModalSubmit,
    openMoveStoreItemModal,
    closeMoveStoreItemModal,
    handleMoveStoreItemAfter,
    handleAddStoreKnownItem,
    handleRemoveStoreKnownItem,
    handleSaveShoppingListFile,
    handleShareShoppingListFile,
    handleImportShoppingListFile,
    stopDragAutoScroll,
    cancelUnknownItemLongPress,
    showToast
  };

  root.SmartCartUI = uiExports;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSmartCartApp);
    } else {
      initSmartCartApp();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
