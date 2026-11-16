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
    dragState: {
      dragFromIndex: null,
      touchDragFromIndex: null,
      touchCurrentOverIndex: null
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
    const qtyInput = document.getElementById('add-item-qty');
    const name = nameInput ? nameInput.value.trim() : '';
    const quantity = qtyInput && qtyInput.value.trim() ? qtyInput.value.trim() : '1x';

    if (!name) return;

    const activeStore = getActiveSupermarket();
    const result = Core.addItemToList(state.shoppingList, activeStore, { name, quantity });
    state.shoppingList = result.list;

    if (nameInput) nameInput.value = '';
    if (qtyInput) qtyInput.value = '';

    saveAppState();
    renderApp();

    if (result.wasAddedLate) {
      const passedNames = (result.passedByItems || []).map((i) => i.name).join(', ');
      showToast(
        `⚡ „${result.addedItem.name}“ als nächste offene Ware einsortiert, da du an der Stelle im Markt (vor ${passedNames}) schon vorbei bist!`,
        'late'
      );
    } else {
      showToast(`✅ „${result.addedItem.name}“ in Laufreihenfolge (${activeStore.name}) einsortiert.`, 'success');
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
        `↩️ „${result.uncheckedItem.name}“ wieder an der optimierten Position für ${activeStore.name} eingereiht.`,
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

    const skippedNames = (checkResult.skippedItems || []).map((i) => i.name).join(', ');
    const storeName = checkResult.supermarket ? checkResult.supermarket.name : 'diesen Supermarkt';

    if (textEl) {
      textEl.textContent =
        checkResult.promptMessage ||
        `Reihenfolge im Supermarkt anpassen? Du hast „${checkResult.checkedItem.name}“ vor „${skippedNames}“ abgehakt. Soll die Konfiguration für ${storeName} automatisch angepasst werden?`;
    }

    if (detailsEl) {
      const firstSkipped = checkResult.skippedItems && checkResult.skippedItems[0]
        ? checkResult.skippedItems[0].name
        : skippedNames;
      detailsEl.innerHTML =
        `<strong>Geplante Anpassung in ${escapeHtml(storeName)}:</strong><br />` +
        `„${escapeHtml(checkResult.checkedItem.name)}“ wird in der Laufreihenfolge vor „${escapeHtml(firstSkipped)}“ verschoben.`;
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

    const firstSkipped = skippedItems && skippedItems[0] ? skippedItems[0].name : '';
    showToast(
      `🏪 ${updatedStore.name}-Konfiguration angepasst: „${checkedItem.name}“ liegt jetzt vor „${firstSkipped}“!`,
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
          const posIdx = Core.indexOfNormalized(activeStore.itemOrder, item.name);
          const posLabel = posIdx !== -1 ? `Station #${posIdx + 1}` : 'Freie Position';
          return `
            <li class="shopping-item checked" data-item-id="${escapeHtml(item.id)}" title="Antippen zum Rückgängig machen">
              <div class="item-checkbox" aria-label="Abgehakt">✓</div>
              <div class="item-content">
                <div class="item-top-line">
                  <span class="item-name">${escapeHtml(item.name)}</span>
                  <span class="item-qty-badge">${escapeHtml(item.quantity || '1x')}</span>
                </div>
                <div class="item-badges">
                  <span class="badge badge-undo-hint">↩️ Antippen für Rückgängig (${posLabel})</span>
                </div>
              </div>
              <button type="button" class="item-delete-btn" data-delete-id="${escapeHtml(item.id)}" title="Ware entfernen">✕</button>
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

      uncheckedListEl.innerHTML = uncheckedItems
        .map((item, idx) => {
          const isNext = idx === 0;
          const isLate = Boolean(item.addedLateOverride);
          const posIdx = Core.indexOfNormalized(activeStore.itemOrder, item.name);
          const classes = ['shopping-item'];
          if (isLate) {
            classes.push('late-override');
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

          if (posIdx !== -1) {
            badges.push(
              `<span class="badge badge-walk-index">🧭 ${escapeHtml(activeStore.name)} #${posIdx + 1} • ${escapeHtml(item.category || '')}</span>`
            );
          } else {
            badges.push(
              `<span class="badge badge-unknown-pos">🆕 Neue Ware (am Ende / lernfähig)</span>`
            );
          }

          return `
            <li class="${classes.join(' ')}" data-item-id="${escapeHtml(item.id)}">
              <div class="item-checkbox" aria-label="Abhaken"></div>
              <div class="item-content">
                <div class="item-top-line">
                  <span class="item-name">${escapeHtml(item.name)}</span>
                  <span class="item-qty-badge">${escapeHtml(item.quantity || '1x')}</span>
                </div>
                <div class="item-badges">
                  ${badges.join('')}
                </div>
              </div>
              <button type="button" class="item-delete-btn" data-delete-id="${escapeHtml(item.id)}" title="Ware entfernen">✕</button>
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
    const existingNorms = new Set(
      currentItems.map((i) => Core.normalizeItemName(i.name))
    );

    const suggestions = (activeStore.itemOrder || [])
      .filter((name) => !existingNorms.has(Core.normalizeItemName(name)))
      .slice(0, 10);

    container.innerHTML = suggestions
      .map(
        (name) =>
          `<button type="button" class="suggestion-chip" data-suggest-name="${escapeHtml(name)}">+ ${escapeHtml(name)}</button>`
      )
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
          const posIdx = Core.indexOfNormalized(activeStore.itemOrder, item.name);
          const posBadge =
            posIdx !== -1
              ? `${activeStore.name} #${posIdx + 1}`
              : 'Neu (am Ende)';
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
      const lateNames = result.lateItems.map((i) => i.name).join(', ');
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
      const itemsOptions = (configStore.itemOrder || []).map(
        (itemName, idx) =>
          `<option value="${escapeHtml(itemName)}">Pos. ${idx + 1}: ${escapeHtml(itemName)}</option>`
      );
      datalistEl.innerHTML = [
        `<option value="Ganz am Anfang (Position 1)">Position 1 – Direkt am Eingang</option>`,
        ...itemsOptions
      ].join('');
    }

    if (titleEl) titleEl.textContent = configStore.name;
    if (countEl) countEl.textContent = `${configStore.itemOrder.length} Stationen`;

    if (listEl) {
      listEl.innerHTML = (configStore.itemOrder || [])
        .map((itemName, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === configStore.itemOrder.length - 1;
          const dept = Core.guessItemCategory ? Core.guessItemCategory(itemName) : '';
          return `
            <li
              class="store-order-item"
              draggable="true"
              data-item-index="${idx}"
              data-item-name="${escapeHtml(itemName)}"
            >
              <span
                class="drag-handle"
                data-drag-handle="${idx}"
                title="Gedrückt halten &amp; ziehen zum Verschieben"
                aria-label="Ziehen zum Verschieben"
              >☰</span>
              <span class="store-order-num">${idx + 1}</span>
              <div class="store-order-name">
                <div>${escapeHtml(itemName)}</div>
                <div style="font-size: 11px; color: var(--text-muted); font-weight: 500;">${escapeHtml(dept)}</div>
              </div>
              <div class="store-order-actions">
                <button
                  type="button"
                  class="icon-btn move-after-btn"
                  data-move-after-idx="${idx}"
                  data-move-after-item="${escapeHtml(itemName)}"
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
                  data-remove-store-item="${escapeHtml(itemName)}"
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

    const movedName = store.itemOrder[fromIndex];
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
      `☰ „${movedName}“ auf Position ${toIndex + 1} in ${updatedStore.name} verschoben.`,
      'info'
    );
  }

  /**
   * Öffnet das Modal zum gezielten Verschieben einer Ware (`⇄` Button) hinter eine
   * frei wählbare vorige Ware oder ganz an den Anfang (Position 1).
   * @param {string} itemName - Name der zu verschiebenden Ware
   * @param {number} currentIndex - Aktuelle Position (0-basiert)
   */
  function openMoveStoreItemModal(itemName, currentIndex) {
    const store = getConfigSupermarket();
    if (!store) return;

    state.pendingMoveItem = { itemName, currentIndex };
    const modal = document.getElementById('move-store-item-modal');
    const titleEl = document.getElementById('move-item-modal-title');
    const subtitleEl = document.getElementById('move-item-modal-subtitle');
    const inputEl = document.getElementById('moveStoreItemPreviousInput');
    const pickerListEl = document.getElementById('move-item-picker-list');

    if (titleEl) {
      titleEl.textContent = `„${itemName}“ verschieben`;
    }
    if (subtitleEl) {
      subtitleEl.textContent = `Aktuell auf Position ${currentIndex + 1} in ${store.name}. Wähle die vorige Ware, hinter die „${itemName}“ platziert werden soll:`;
    }
    if (inputEl) {
      inputEl.value = '';
    }

    if (pickerListEl) {
      const itemNorm = Core.normalizeItemName(itemName);
      pickerListEl.innerHTML = (store.itemOrder || [])
        .map((otherName, idx) => {
          if (Core.normalizeItemName(otherName) === itemNorm) return '';
          return `<button type="button" class="move-picker-chip" data-pick-prev-item="${escapeHtml(
            otherName
          )}">#${idx + 1} ${escapeHtml(otherName)}</button>`;
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

    const movedLabel = res.movedItem || itemNameOrIndex;
    const posNum = typeof res.insertedAtIndex === 'number' ? res.insertedAtIndex + 1 : 1;

    if (prevParam === '__START__' || posNum === 1) {
      showToast(
        `⇄ „${movedLabel}“ wurde ganz an den Anfang (Position 1) von ${updatedStore.name} verschoben!`,
        'success'
      );
    } else if (res.foundPrevious) {
      showToast(
        `⇄ „${movedLabel}“ wurde direkt nach „${res.previousItem || rawTrimmed}“ (Pos. ${posNum}) verschoben!`,
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
   * Fügt eine neue bekannte Ware in die Laufreihenfolge (`itemOrder`) des gewählten Supermarkts
   * exakt hinter der in `#storeAddItemPreviousInput` angegebenen vorigen Ware (oder am Anfang/Ende) ein.
   * @param {Event} [event] - Submit-Event
   */
  function handleAddStoreKnownItem(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById('new-store-item-name');
    const prevInput = document.getElementById('storeAddItemPreviousInput');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return;

    const prevRaw = prevInput ? prevInput.value.trim() : '';
    const prevParam = isStartPositionKeyword(prevRaw) ? '__START__' : prevRaw;

    const store = getConfigSupermarket();
    let res;
    if (typeof Core.addSupermarketKnownItemAfter === 'function') {
      res = Core.addSupermarketKnownItemAfter(store, name, prevParam);
    } else {
      const insertIdx = prevParam === '__START__' ? 0 : -1;
      res = Core.addSupermarketKnownItem(store, name, insertIdx);
    }

    const updatedStore = res.supermarket || res;

    state.supermarkets = state.supermarkets.map((s) =>
      s.id === updatedStore.id ? updatedStore : s
    );

    if (state.shoppingList.supermarketId === updatedStore.id) {
      state.shoppingList = Core.changeListSupermarket(state.shoppingList, updatedStore);
    }

    if (nameInput) nameInput.value = '';
    if (prevInput) prevInput.value = '';

    saveAppState();
    renderApp();

    const posNum =
      typeof res.insertedAtIndex === 'number'
        ? res.insertedAtIndex + 1
        : updatedStore.itemOrder.length;

    if (prevParam === '__START__' || posNum === 1) {
      showToast(
        `🧭 „${name}“ wurde ganz am Anfang (Position 1) in ${updatedStore.name} eingefügt.`,
        'success'
      );
    } else if (res.foundPrevious) {
      showToast(
        `🧭 „${name}“ wurde direkt nach „${res.previousItem || prevRaw}“ (Pos. ${posNum}) eingefügt.`,
        'success'
      );
    } else {
      showToast(
        `🧭 „${name}“ wurde am Ende (Pos. ${posNum}) von ${updatedStore.name} eingefügt.`,
        'success'
      );
    }
  }

  /**
   * Entfernt eine Ware aus der Laufreihenfolge (`itemOrder`) des gewählten Supermarkts.
   * @param {string} itemName - Name der Ware
   */
  function handleRemoveStoreKnownItem(itemName) {
    const store = getConfigSupermarket();
    if (!store) return;
    const updatedStore = Core.removeSupermarketKnownItem(store, itemName);

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
   * TAB 4: Teilen, Export & Import Funktionen
   * ========================================================================== */

  /**
   * Teilt den aktuellen Einkaufszettel über `ShareService.exportShoppingList` und `ShareService.shareViaWebApi`.
   */
  async function handleShareShoppingList() {
    const activeStore = getActiveSupermarket();
    const exported = Core.exportShoppingList(state.shoppingList, activeStore);

    const textarea = document.getElementById('share-code-textarea');
    if (textarea) textarea.value = exported.shareText;

    const shareRes = await Core.shareViaWebApi({
      title: `SmartCart Einkaufszettel (${activeStore.name})`,
      text: exported.shareText
    });

    if (shareRes && shareRes.method === 'web-share' && shareRes.success) {
      showToast('📤 Einkaufszettel erfolgreich geteilt!', 'success');
    } else {
      await copyTextToClipboard(exported.shareText);
      showToast('📋 Einkaufszettel inkl. Share-Code in die Zwischenablage kopiert!', 'success');
    }
  }

  /**
   * Erzeugt einen kompakten Share-Code (`SC1:...`) über `ShareService.exportShoppingList`
   * und zeigt ihn im Textfeld an.
   */
  function handleExportShareCode() {
    const activeStore = getActiveSupermarket();
    const exported = Core.exportShoppingList(state.shoppingList, activeStore);

    const textarea = document.getElementById('share-code-textarea');
    if (textarea) textarea.value = exported.shareCode;
    showToast('📋 Share-Code (SC1:...) erzeugt! Du kannst ihn jetzt kopieren und versenden.', 'success');
  }

  /**
   * Importiert einen empfangenen Share-Code (`SC1:...`) oder ein JSON-Backup über `ShareService.decodeShareCode`.
   */
  function handleImportShareCode() {
    const textarea = document.getElementById('share-code-textarea');
    const raw = textarea ? textarea.value.trim() : '';
    if (!raw) {
      showToast('⚠️ Bitte zuerst einen Share-Code oder JSON in das Feld einfügen.', 'late');
      return;
    }

    const decoded = Core.decodeShareCode(raw);
    if (!decoded || !decoded.valid) {
      showToast(`❌ ${decoded && decoded.error ? decoded.error : 'Ungültiger Share-Code.'}`, 'late');
      return;
    }

    if (Array.isArray(decoded.supermarkets) && decoded.supermarkets.length > 0) {
      state.supermarkets = decoded.supermarkets;
    } else if (decoded.supermarket) {
      const incoming = decoded.supermarket;
      const exists = state.supermarkets.some((s) => s.id === incoming.id);
      state.supermarkets = exists
        ? state.supermarkets.map((s) => (s.id === incoming.id ? incoming : s))
        : [...state.supermarkets, incoming];
    }

    if (decoded.list) {
      const store =
        state.supermarkets.find((s) => s.id === decoded.list.supermarketId) ||
        state.supermarkets[0];
      state.shoppingList = Core.changeListSupermarket(decoded.list, store);
    } else if (Array.isArray(decoded.lists) && decoded.lists.length > 0) {
      const firstList = decoded.lists[0];
      const store =
        state.supermarkets.find((s) => s.id === firstList.supermarketId) ||
        state.supermarkets[0];
      state.shoppingList = Core.changeListSupermarket(firstList, store);
    }

    saveAppState();
    renderApp();
    switchTab('tab-list');
    showToast('✅ Einkaufsliste & Supermarkt-Konfiguration erfolgreich importiert!', 'success');
  }

  /**
   * Lädt ein vollständiges JSON-Backup aller Supermärkte und aller gespeicherten Einkaufslisten herunter.
   */
  function handleDownloadBackupJson() {
    const backup = Core.exportFullBackup({
      supermarkets: state.supermarkets,
      lists: state.shoppingLists && state.shoppingLists.length > 0 ? state.shoppingLists : [state.shoppingList]
    });
    const filename = `SmartCart_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    Core.downloadJsonFile(backup.json, filename);
    showToast('💾 Backup-Datei wurde heruntergeladen.', 'success');
  }

  /* ==========================================================================
   * Event-Listener (inkl. Touch/Mouse Drag & Drop) & Hilfsfunktionen
   * ========================================================================== */

  /**
   * Registriert HTML5-Drag-and-Drop- sowie Mobile-Touch-Drag-Event-Listener
   * auf der Supermarkt-Warenliste (`#store-order-list`).
   * @param {HTMLElement} listEl - Das `<ul id="store-order-list">`-Element
   */
  function bindStoreOrderDragAndDrop(listEl) {
    if (!listEl) return;

    const clearDragClasses = () => {
      listEl.querySelectorAll('.store-order-item').forEach((row) => {
        row.classList.remove('dragging', 'drag-over');
      });
    };

    // 1. HTML5 Mouse / Desktop Drag & Drop
    listEl.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.store-order-item[data-item-index]');
      if (!row) return;
      const idx = Number(row.getAttribute('data-item-index'));
      state.dragState.dragFromIndex = idx;
      row.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
      }
    });

    listEl.addEventListener('dragover', (e) => {
      if (state.dragState.dragFromIndex === null) return;
      e.preventDefault();
      const row = e.target.closest('.store-order-item[data-item-index]');
      listEl.querySelectorAll('.store-order-item.drag-over').forEach((el) => {
        if (el !== row) el.classList.remove('drag-over');
      });
      if (row) {
        row.classList.add('drag-over');
      }
    });

    listEl.addEventListener('drop', (e) => {
      if (state.dragState.dragFromIndex === null) return;
      e.preventDefault();
      const targetRow = e.target.closest('.store-order-item[data-item-index]');
      const fromIdx = state.dragState.dragFromIndex;
      state.dragState.dragFromIndex = null;
      clearDragClasses();
      if (!targetRow) return;
      const toIdx = Number(targetRow.getAttribute('data-item-index'));
      handleDragReorderStoreItem(fromIdx, toIdx);
    });

    listEl.addEventListener('dragend', () => {
      state.dragState.dragFromIndex = null;
      clearDragClasses();
    });

    // 2. Mobile Touch Drag & Drop über das ☰ Drag-Handle
    listEl.addEventListener(
      'touchstart',
      (e) => {
        const handle = e.target.closest('[data-drag-handle]');
        if (!handle) return;
        const row = handle.closest('.store-order-item[data-item-index]');
        if (!row) return;
        const idx = Number(row.getAttribute('data-item-index'));
        state.dragState.touchDragFromIndex = idx;
        state.dragState.touchCurrentOverIndex = idx;
        row.classList.add('dragging');
      },
      { passive: true }
    );

    listEl.addEventListener(
      'touchmove',
      (e) => {
        if (state.dragState.touchDragFromIndex === null) return;
        const touch = e.touches && e.touches[0];
        if (!touch) return;
        if (e.cancelable) e.preventDefault();

        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
        const overRow = targetEl && targetEl.closest
          ? targetEl.closest('.store-order-item[data-item-index]')
          : null;

        listEl.querySelectorAll('.store-order-item.drag-over').forEach((el) => {
          if (el !== overRow) el.classList.remove('drag-over');
        });

        if (overRow) {
          overRow.classList.add('drag-over');
          state.dragState.touchCurrentOverIndex = Number(
            overRow.getAttribute('data-item-index')
          );
        }
      },
      { passive: false }
    );

    listEl.addEventListener('touchend', () => {
      if (state.dragState.touchDragFromIndex === null) return;
      const fromIdx = state.dragState.touchDragFromIndex;
      const toIdx = state.dragState.touchCurrentOverIndex;
      state.dragState.touchDragFromIndex = null;
      state.dragState.touchCurrentOverIndex = null;
      clearDragClasses();
      if (typeof toIdx === 'number' && fromIdx !== toIdx) {
        handleDragReorderStoreItem(fromIdx, toIdx);
      }
    });
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
        const itemName = chip.getAttribute('data-suggest-name');
        const nameInput = document.getElementById('add-item-name');
        if (nameInput) {
          nameInput.value = itemName;
          handleAddItemSubmit();
        }
      });
    }

    // Checked & Unchecked Lists (Delegated click for toggle check & delete)
    const handleListClick = (e) => {
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

    addListener('checked-items-list', 'click', handleListClick);
    addListener('unchecked-items-list', 'click', handleListClick);

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

    // Supermarket Item Order List (⇄ Move Modal, ↑/↓ Arrows, ✕ Remove, Drag & Drop)
    const storeOrderList = document.getElementById('store-order-list');
    if (storeOrderList) {
      storeOrderList.addEventListener('click', (e) => {
        const moveAfterBtn = e.target.closest('[data-move-after-item]');
        if (moveAfterBtn) {
          const itemName = moveAfterBtn.getAttribute('data-move-after-item');
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
      handleMoveStoreItemAfter(state.pendingMoveItem.itemName, '__START__');
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
      handleMoveStoreItemAfter(state.pendingMoveItem.itemName, prevVal);
    });

    addListener('move-item-cancel-btn', 'click', closeMoveStoreItemModal);

    // Share & Backup Tab
    addListener('native-share-list-btn', 'click', handleShareShoppingList);
    addListener('native-share-store-btn', 'click', () => {
      handleExportShareCode();
      const textarea = document.getElementById('share-code-textarea');
      if (textarea && textarea.value) {
        copyTextToClipboard(textarea.value);
        showToast('🏪 Supermarkt-Konfiguration & Liste als Share-Code kopiert!', 'success');
      }
    });
    addListener('export-code-btn', 'click', handleExportShareCode);
    addListener('download-json-btn', 'click', handleDownloadBackupJson);
    addListener('copy-share-code-btn', 'click', async () => {
      const textarea = document.getElementById('share-code-textarea');
      if (textarea && textarea.value) {
        await copyTextToClipboard(textarea.value);
        showToast('📋 Code in die Zwischenablage kopiert!', 'success');
      }
    });
    addListener('import-share-code-btn', 'click', handleImportShareCode);
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
   * Kopiert einen Text in die Zwischenablage.
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    return false;
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
    openMoveStoreItemModal,
    closeMoveStoreItemModal,
    handleMoveStoreItemAfter,
    handleAddStoreKnownItem,
    handleRemoveStoreKnownItem,
    handleShareShoppingList,
    handleExportShareCode,
    handleImportShareCode,
    handleDownloadBackupJson,
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
