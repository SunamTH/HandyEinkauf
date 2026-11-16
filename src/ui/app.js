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
    shoppingList: null,
    configSelectedStoreId: 'rewe',
    pendingLiveOpt: null,
    parsedOcrItems: [],
    activeTab: 'tab-list',
    syncAdapter: null
  };

  /**
   * Initialisiert die SmartCart-App beim Laden des Dokuments:
   * Lädt gespeicherte Supermärkte und die aktive Einkaufsliste aus dem Storage,
   * verbindet den Echtzeit-SyncAdapter (BroadcastChannel), registriert Event-Listener,
   * initialisiert die OCR-Vorschau und rendert die UI.
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
          if (msg.data.shoppingList) {
            state.shoppingList = msg.data.shoppingList;
          }
          renderApp();
        }
      });
    }
  }

  /**
   * Lädt Supermärkte und Einkaufsliste über `LocalStorageRepository` (mit automatischem Seeding),
   * oder legt beim ersten Start eine anschauliche Beispiel-Einkaufsliste an.
   */
  function loadInitialState() {
    const repo = Core.LocalStorageRepository || Core.storageRepository;

    let loadedStores = null;
    let loadedList = null;

    if (repo) {
      if (typeof repo.loadSupermarkets === 'function') {
        loadedStores = repo.loadSupermarkets();
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

    if (!loadedList || !Array.isArray(loadedList.items) || loadedList.items.length === 0) {
      loadedList =
        typeof Core.createDefaultSeedShoppingList === 'function'
          ? Core.createDefaultSeedShoppingList(state.supermarkets[0])
          : createInitialStarterList(state.supermarkets[0]);
    } else {
      const activeStore =
        state.supermarkets.find((s) => s.id === loadedList.supermarketId) ||
        state.supermarkets[0];
      if (activeStore && typeof Core.sortShoppingList === 'function') {
        const { sortedItems } = Core.sortShoppingList(loadedList, activeStore);
        loadedList.items = sortedItems;
      }
    }

    state.shoppingList = loadedList;
    state.configSelectedStoreId =
      loadedList.supermarketId || (state.supermarkets[0] && state.supermarkets[0].id) || 'rewe';

    saveAppState();
  }

  /**
   * Erzeugt eine realistische erste Einkaufsliste für den ersten App-Start,
   * sortiert nach der Laufreihenfolge des übergebenen Supermarkts.
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
      name: 'Mein Einkaufszettel',
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
   * Speichert alle Supermärkte und die aktive Einkaufsliste dauerhaft im Browser (`LocalStorageRepository` & SyncAdapter).
   */
  function saveAppState() {
    const repo = Core.LocalStorageRepository || Core.storageRepository;
    if (repo) {
      if (typeof repo.saveSupermarkets === 'function') {
        repo.saveSupermarkets(state.supermarkets);
      }
      if (typeof repo.saveActiveList === 'function') {
        repo.saveActiveList(state.shoppingList);
      }
    }

    if (state.syncAdapter && typeof state.syncAdapter.publishUpdate === 'function') {
      state.syncAdapter.publishUpdate('state_updated', {
        supermarkets: state.supermarkets,
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
   * - Beim Abhaken: Verschiebt die Ware ausgegraut in den oberen Bereich ("Bereits abgehakt").
   *   Falls `liveOptimizationEnabled` aktiv ist und eine Abweichung von der Reihenfolge erkannt wurde,
   *   wird der Dialog zur Anpassung der Supermarkt-Reihenfolge geöffnet.
   * - Beim Uncheck (Rückgängig machen): Sortiert die Ware wieder exakt an ihrer richtigen
   *   Supermarkt-Position unter den offenen Waren ein.
   *
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
   * Haupt-Render-Funktion: Aktualisiert Header, Supermarkt-Pills, Live-Optimierungs-Status,
   * Einkaufsliste (Erledigt oben + Offen unten) und Schnellauswahl-Chips.
   */
  function renderApp() {
    renderHeaderAndStorePills();
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

    if (subtitleEl && activeStore) {
      subtitleEl.textContent = `Aktiv: ${activeStore.name} (${activeStore.itemOrder.length} Markt-Stationen)`;
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
   * 2. Darunter: `Noch einzukaufen (Optimierte Reihenfolge)` in exakter Supermarkt-Laufreihenfolge,
   *    inkl. Hervorhebung der nächsten Ware im Gang und Badge für nachträglich hinzugefügte Waren,
   *    deren Supermarkt-Position bereits passiert wurde (`addedLateOverride`).
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
              Alle offenen Waren erledigt!
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
   * TAB 2: Foto-Scanner / OCR Funktionen
   * ========================================================================== */

  /**
   * Verarbeitet ein vom Nutzer aufgenommenes oder ausgewähltes Einkaufszettel-Foto
   * über `SmartCartCore.recognizeImageShoppingList`.
   * @param {Event} event - Change-Event des Datei-Inputs
   */
  async function handleOcrFileUpload(event) {
    const file = event.target && event.target.files && event.target.files[0];
    if (!file) return;

    const statusBox = document.getElementById('ocr-status-box');
    const previewImg = document.getElementById('ocr-preview-image');
    const textarea = document.getElementById('ocr-raw-textarea');

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.textContent = '⏳ Foto wird geladen und Text wird erkannt…';
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (previewImg) {
        previewImg.src = dataUrl;
        previewImg.style.display = 'block';
      }

      if (typeof Core.recognizeImageShoppingList === 'function') {
        const ocrResult = await Core.recognizeImageShoppingList(file, (progressInfo) => {
          if (statusBox && progressInfo && progressInfo.status) {
            const pct = typeof progressInfo.progress === 'number'
              ? ` (${Math.round(progressInfo.progress * 100)}%)`
              : '';
            statusBox.textContent = `🔍 OCR: ${progressInfo.status}${pct}`;
          }
        });

        const rawText =
          (ocrResult && (ocrResult.rawText || ocrResult.text)) || '';
        if (textarea && rawText) {
          textarea.value = rawText;
        }
        renderOcrPreviewFromText(textarea ? textarea.value : rawText);

        if (statusBox) {
          statusBox.textContent = `✅ Foto analysiert (${(ocrResult.items || state.parsedOcrItems).length} Waren erkannt). Du kannst die Liste unten prüfen oder anpassen.`;
        }
      }
    } catch (err) {
      if (statusBox) {
        statusBox.textContent = `⚠️ Hinweis bei der Bilderkennung: ${err.message}. Du kannst die Waren unten direkt bearbeiten.`;
      }
    }
  }

  /**
   * Erzeugt eines der 3 integrierten Demo-Einkaufszettel-Fotos auf einem HTML5-Canvas
   * (`SmartCartCore.generateSamplePhotoDataUrl`) und führt anschließend die OCR-Erkennung aus.
   * @param {string} presetName - Name des Demo-Zettels (`wochenende`, `fruehstueck`, `party`)
   */
  async function handleLoadDemoPhoto(presetName) {
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
      const generated = Core.generateSamplePhotoDataUrl(presetName);
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
        sampleDataUrl || presetName
      );
      if (res && (res.rawText || res.text)) {
        sampleText = res.rawText || res.text;
      }
    }

    if (!sampleText) {
      const presets = {
        wochenende: '2x Äpfel\nBananen\n1L Vollmilch\nButter\n500g Hackfleisch\nSpaghetti\nPassierte Tomaten\nToilettenpapier',
        fruehstueck: '6 Brötchen\n4 Croissants\nButter\nKäse\n10 Eier\nOrangensaft\nKaffee',
        party: '3x Tiefkühlpizza\nPaprika\nSalat\nCola\n6x Bier\nEiscreme\nSchokolade'
      };
      sampleText = presets[presetName] || presets.wochenende;
    }

    if (textarea) {
      textarea.value = sampleText;
    }
    renderOcrPreviewFromText(sampleText);

    if (statusBox) {
      statusBox.textContent = `✅ Demo-Einkaufszettel „${presetName}“ erfolgreich erkannt (${state.parsedOcrItems.length} Waren)!`;
    }
  }

  /**
   * Parst den mehrzeiligen Einkaufszettel-Text über `SmartCartCore.parseShoppingText`
   * und zeigt eine strukturierte Vorschau inkl. erkannter Supermarkt-Abteilung an.
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
            Noch keine Waren im Textfeld. Fotografiere einen Zettel oder wähle oben ein Demo-Foto!
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
   * sortiert sie automatisch für den gewählten Supermarkt (unter Beachtung der
   * "Bereits vorbeigelaufen"-Regel) und wechselt zurück zur Einkaufsliste.
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
   * TAB 3: Supermarkt-Konfigurator Funktionen
   * ========================================================================== */

  /**
   * Rendert den Supermarkt-Konfigurator (`#tab-stores`) mit Auswahl-Dropdown
   * und der bearbeitbaren Waren-Laufreihenfolge (`itemOrder`).
   */
  function renderSupermarketConfigurator() {
    const selectEl = document.getElementById('config-store-select');
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

    if (titleEl) titleEl.textContent = configStore.name;
    if (countEl) countEl.textContent = `${configStore.itemOrder.length} Stationen`;

    if (listEl) {
      listEl.innerHTML = (configStore.itemOrder || [])
        .map((itemName, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === configStore.itemOrder.length - 1;
          const dept = Core.guessItemCategory ? Core.guessItemCategory(itemName) : '';
          return `
            <li class="store-order-item">
              <span class="store-order-num">${idx + 1}</span>
              <div class="store-order-name">
                <div>${escapeHtml(itemName)}</div>
                <div style="font-size: 11px; color: var(--text-muted); font-weight: 500;">${escapeHtml(dept)}</div>
              </div>
              <div class="store-order-actions">
                <button
                  type="button"
                  class="icon-btn"
                  data-move-idx="${idx}"
                  data-move-dir="up"
                  ${isFirst ? 'disabled' : ''}
                  title="Weiter Richtung Eingang (nach oben)"
                >↑</button>
                <button
                  type="button"
                  class="icon-btn"
                  data-move-idx="${idx}"
                  data-move-dir="down"
                  ${isLast ? 'disabled' : ''}
                  title="Weiter Richtung Kasse (nach unten)"
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
   * Legt einen neuen benutzerdefinierten Supermarkt an (übernimmt als Basis die Reihenfolge
   * des aktuell im Konfigurator ausgewählten Supermarkts, damit man sofort starten kann).
   * @param {Event} event - Submit-Event
   */
  function handleCreateSupermarket(event) {
    if (event) event.preventDefault();
    const input = document.getElementById('new-store-name');
    const name = input ? input.value.trim() : '';
    if (!name) return;

    const templateStore = getConfigSupermarket();
    const newStore = Core.createSupermarket({
      name,
      icon: '🟢',
      color: '#059669',
      itemOrder: templateStore ? [...templateStore.itemOrder] : []
    });

    state.supermarkets.push(newStore);
    state.configSelectedStoreId = newStore.id;
    state.shoppingList = Core.changeListSupermarket(state.shoppingList, newStore);

    if (input) input.value = '';
    saveAppState();
    renderApp();
    showToast(`🏪 Supermarkt „${newStore.name}“ wurde angelegt und aktiviert!`, 'success');
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
   * Setzt die Supermärkte auf die Standard-Konfigurationen (REWE, ALDI, LIDL) zurück.
   */
  function handleResetDefaultSupermarkets() {
    state.supermarkets = Core.getDefaultSupermarkets();
    const active =
      state.supermarkets.find((s) => s.id === state.shoppingList.supermarketId) ||
      state.supermarkets[0];
    state.configSelectedStoreId = active.id;
    state.shoppingList = Core.changeListSupermarket(state.shoppingList, active);
    saveAppState();
    renderApp();
    showToast('🔄 Standard-Supermärkte (REWE, ALDI, LIDL) wurden wiederhergestellt.', 'success');
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
   * Fügt eine neue bekannte Ware in die Laufreihenfolge (`itemOrder`) des gewählten Supermarkts ein.
   * @param {Event} event - Submit-Event
   */
  function handleAddStoreKnownItem(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById('new-store-item-name');
    const posSelect = document.getElementById('new-store-item-pos');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return;

    const store = getConfigSupermarket();
    const insertIdx = posSelect && posSelect.value === 'start' ? 0 : -1;
    const updatedStore = Core.addSupermarketKnownItem(store, name, insertIdx);

    state.supermarkets = state.supermarkets.map((s) =>
      s.id === updatedStore.id ? updatedStore : s
    );

    if (state.shoppingList.supermarketId === updatedStore.id) {
      state.shoppingList = Core.changeListSupermarket(state.shoppingList, updatedStore);
    }

    if (nameInput) nameInput.value = '';
    saveAppState();
    renderApp();
    showToast(`🧭 „${name}“ zur Laufreihenfolge von ${updatedStore.name} hinzugefügt.`, 'success');
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
   * Lädt ein vollständiges JSON-Backup aller Supermärkte und der Einkaufsliste über `ShareService.exportFullBackup` herunter.
   */
  function handleDownloadBackupJson() {
    const backup = Core.exportFullBackup({
      supermarkets: state.supermarkets,
      lists: [state.shoppingList]
    });
    const filename = `SmartCart_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    Core.downloadJsonFile(backup.json, filename);
    showToast('💾 Backup-Datei wurde heruntergeladen.', 'success');
  }

  /* ==========================================================================
   * Event-Listener & Hilfsfunktionen
   * ========================================================================== */

  /**
   * Registriert alle DOM-Event-Listener für Navigation, Formulare, Listen-Interaktionen und Modals.
   */
  function bindEventListeners() {
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

    // Live-Optimierung Toggle
    const liveOptToggle = document.getElementById('live-opt-toggle');
    if (liveOptToggle) {
      liveOptToggle.addEventListener('change', (e) => {
        handleToggleLiveOptimization(Boolean(e.target.checked));
      });
    }

    // Add Item Form
    const addItemForm = document.getElementById('add-item-form');
    if (addItemForm) {
      addItemForm.addEventListener('submit', handleAddItemSubmit);
    }

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

    const addListener = (id, eventName, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(eventName, handler);
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
    addListener('reset-stores-btn', 'click', handleResetDefaultSupermarkets);
    addListener('add-store-item-form', 'submit', handleAddStoreKnownItem);

    addListener('store-order-list', 'click', (e) => {
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
    handleResetDefaultSupermarkets,
    handleMoveStoreItem,
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
