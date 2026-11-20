/**
 * SmartCart Core - Supermarket Walking Order Optimizer, Live Learning & Late-Add Engine
 * Works in Browser (window.SmartCartCore) and Node.js (CommonJS).
 */
(function (root) {
  'use strict';

  const SmartCartCore = root.SmartCartCore || (root.SmartCartCore = {});

  const models =
    typeof module !== 'undefined' && module.exports && !SmartCartCore.normalizeItemName
      ? require('./models.js')
      : SmartCartCore;

  const {
    normalizeItemName,
    cleanSpecification,
    normalizeSpecification,
    createStoreEntry,
    getStoreEntryKey,
    formatItemDisplayName,
    findStoreEntryMatch,
    indexOfNormalized,
    findExactStoreEntryIndex,
    createItem,
    createSupermarket
  } = models;

  /**
   * Sorts a shopping list according to the active supermarket's walking path and SmartCart rules:
   * - Rule A (Checked items section at top): All checked items (`item.checked === true`) are placed
   *   in `checkedItems` (at the top of `sortedItems`, grayed out in UI). Known checked items are
   *   sorted by supermarket walking position (`storePosition`), followed by checked unknown items
   *   in `originalOrder`.
   * - Rule B (Late-added item override): If an unchecked item has `item.addedLateOverride === true`
   *   (a known store item whose section was already passed during shopping), it is placed first
   *   among unchecked items as the immediate next item to buy.
   * - Rule C (Unknown items at beginning): Unchecked items that are NOT yet present in the selected
   *   supermarket (`storePosition === -1`, matched via `findStoreEntryMatch` with exact specification
   *   or fallback to unspecified) are placed at the BEGINNING of the unchecked shopping list,
   *   BEFORE all known/sorted items (preserving `originalOrder`).
   * - Rule D (Known supermarket order): Unchecked known items follow in ascending `storePosition`
   *   order (tie-broken by `originalOrder`).
   *
   * @param {Object|Array} listOrItems - Shopping list object or items array
   * @param {Object} supermarket - Supermarket configuration with `itemOrder`
   * @returns {{ sortedItems: Array, checkedItems: Array, uncheckedItems: Array, unknownItems: Array }}
   */
  function sortShoppingList(listOrItems, supermarket) {
    const rawItems = Array.isArray(listOrItems)
      ? listOrItems
      : listOrItems && Array.isArray(listOrItems.items)
      ? listOrItems.items
      : [];

    const itemOrder =
      supermarket && Array.isArray(supermarket.itemOrder) ? supermarket.itemOrder : [];

    const clonedItems = rawItems.map((item, idx) => {
      const cleanSpec = cleanSpecification(item.specification);
      const match = findStoreEntryMatch(itemOrder, item.name, cleanSpec);
      const storePosition = match.index;
      return {
        ...item,
        specification: cleanSpec,
        normalizedSpecification: normalizeSpecification(cleanSpec),
        originalOrder: typeof item.originalOrder === 'number' ? item.originalOrder : idx,
        storePosition,
        storeMatchType: match.matchType,
        matchedStoreEntry: match.entry,
        isUnknownInStore: storePosition === -1
      };
    });

    const checkedItems = clonedItems
      .filter((item) => Boolean(item.checked))
      .sort((a, b) => {
        const posA = a.storePosition !== -1 ? a.storePosition : Number.MAX_SAFE_INTEGER;
        const posB = b.storePosition !== -1 ? b.storePosition : Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
        return a.originalOrder - b.originalOrder;
      });

    const uncheckedItems = clonedItems
      .filter((item) => !item.checked)
      .sort((a, b) => {
        // Rule B: Late-added item override comes FIRST among unchecked items
        const lateA = Boolean(a.addedLateOverride);
        const lateB = Boolean(b.addedLateOverride);
        if (lateA && !lateB) return -1;
        if (!lateA && lateB) return 1;
        if (lateA && lateB) {
          // Most recently added late item first, fallback to store position
          if (b.originalOrder !== a.originalOrder) {
            return b.originalOrder - a.originalOrder;
          }
        }

        // Rule C: Unknown items (not yet in supermarket) come at the BEGINNING,
        // BEFORE all known/sorted supermarket items
        const posA = a.storePosition;
        const posB = b.storePosition;
        const unknownA = posA === -1;
        const unknownB = posB === -1;

        if (unknownA && !unknownB) return -1;
        if (!unknownA && unknownB) return 1;
        if (unknownA && unknownB) {
          return a.originalOrder - b.originalOrder;
        }

        // Rule D: Known items follow in supermarket walking order
        if (posA !== posB) return posA - posB;
        return a.originalOrder - b.originalOrder;
      });

    const unknownItems = uncheckedItems.filter((item) => item.isUnknownInStore);
    const sortedItems = [...checkedItems, ...uncheckedItems];

    return {
      sortedItems,
      checkedItems,
      uncheckedItems,
      unknownItems
    };
  }

  /**
   * Adds a new item to the shopping list, automatically detecting if the user has already
   * walked past this item's normal section in the supermarket.
   *
   * Specifically:
   * - Finds `pos = indexOfNormalized(supermarket.itemOrder, name, specification)`.
   * - If `pos !== -1`, checks if there is ANY currently checked item on `list.items` whose
   *   position in `supermarket.itemOrder` is strictly greater than `pos` (`checkedPos > pos`).
   * - If YES, sets `addedLateOverride: true` on the new item so it becomes the immediate next
   *   unchecked item on the shopping list!
   *
   * @param {Object} list - Current shopping list
   * @param {Object} supermarket - Active supermarket configuration
   * @param {Object} itemInput - `{ name, specification, quantity, category }`
   * @returns {{ list: Object, addedItem: Object, wasAddedLate: boolean, passedByItems: Array }}
   */
  function addItemToList(
    list,
    supermarket,
    { name, specification = '', quantity = '1x', category = null } = {}
  ) {
    const currentItems = Array.isArray(list && list.items) ? list.items : [];
    const itemOrder =
      supermarket && Array.isArray(supermarket.itemOrder) ? supermarket.itemOrder : [];

    const cleanSpec = cleanSpecification(specification);
    const pos = indexOfNormalized(itemOrder, name, cleanSpec);
    const passedByItems = [];

    if (pos !== -1) {
      for (const existing of currentItems) {
        if (existing.checked) {
          const checkedPos = indexOfNormalized(
            itemOrder,
            existing.name,
            existing.specification
          );
          if (checkedPos !== -1 && checkedPos > pos) {
            passedByItems.push(existing);
          }
        }
      }
    }

    const wasAddedLate = passedByItems.length > 0;
    const maxOrder = currentItems.reduce(
      (max, it) => (typeof it.originalOrder === 'number' && it.originalOrder > max ? it.originalOrder : max),
      -1
    );

    const addedItem = createItem({
      name,
      specification: cleanSpec,
      quantity,
      category,
      checked: false,
      checkedAt: null,
      addedLateOverride: wasAddedLate,
      originalOrder: maxOrder + 1
    });

    const rawUpdatedItems = [...currentItems, addedItem];
    const { sortedItems } = sortShoppingList(rawUpdatedItems, supermarket);
    const syncedAddedItem = sortedItems.find((i) => i.id === addedItem.id) || addedItem;

    const updatedList = {
      ...list,
      items: sortedItems,
      updatedAt: Date.now()
    };

    return {
      list: updatedList,
      addedItem: syncedAddedItem,
      wasAddedLate,
      passedByItems
    };
  }

  /**
   * Adds multiple items (e.g. from OCR / Photo scan) to the shopping list,
   * applying the smart late-addition detection to each item.
   *
   * @param {Object} list
   * @param {Object} supermarket
   * @param {Array<{name: string, quantity?: string}>} itemInputs
   * @returns {{ list: Object, addedItems: Array, lateItems: Array }}
   */
  function addMultipleItemsToList(list, supermarket, itemInputs = []) {
    let workingList = { ...list, items: [...(list.items || [])] };
    const addedItems = [];
    const lateItems = [];

    for (const input of itemInputs) {
      if (!input || !String(input.name || '').trim()) continue;
      const res = addItemToList(workingList, supermarket, input);
      workingList = res.list;
      addedItems.push(res.addedItem);
      if (res.wasAddedLate) {
        lateItems.push(res.addedItem);
      }
    }

    return {
      list: workingList,
      addedItems,
      lateItems
    };
  }

  /**
   * Toggles the `checked` state of an item on the shopping list.
   *
   * - When checking an UNCHECKED item:
   *   - Checks if `list.liveOptimizationEnabled` is true and whether checking this item is out of
   *     the displayed unchecked order (i.e. at least one other unchecked item without `addedLateOverride`
   *     appears before this item in the current supermarket-optimized unchecked order).
   *   - Marks the item `checked: true`, `checkedAt: Date.now()`, and clears `addedLateOverride: false`.
   *   - If `liveOptimizationEnabled` is true and out-of-order was detected, returns
   *     `outOfOrderDetected: true`, `checkedItem`, `skippedItems`, and a German `promptMessage`.
   *
   * - When unchecking a CHECKED item (Rückgängig machen):
   *   - Sets `checked: false`, `checkedAt: null`, `addedLateOverride: false`.
   *   - Re-sorts via `sortShoppingList`, automatically restoring the item to its proper
   *     supermarket-optimized position among the unchecked items.
   *
   * @param {Object} list - Current shopping list
   * @param {Object} supermarket - Active supermarket configuration
   * @param {string} itemId - ID of the item to toggle
   * @returns {Object}
   */
  function toggleItemCheck(list, supermarket, itemId) {
    const currentItems = Array.isArray(list && list.items) ? list.items : [];
    const target = currentItems.find((item) => item.id === itemId);

    if (!target) {
      return {
        list,
        action: 'noop',
        outOfOrderDetected: false,
        skippedItems: [],
        promptMessage: null
      };
    }

    // Before toggling, inspect the current optimized unchecked order
    const { uncheckedItems } = sortShoppingList(list, supermarket);

    if (!target.checked) {
      // Unchecked -> Checked
      const targetUncheckedIdx = uncheckedItems.findIndex((item) => item.id === itemId);
      const targetUncheckedItem =
        targetUncheckedIdx !== -1 ? uncheckedItems[targetUncheckedIdx] : null;
      const wasLateOverride = Boolean(target.addedLateOverride);
      const targetIsKnown = Boolean(targetUncheckedItem && targetUncheckedItem.storePosition !== -1);

      let skippedItems = [];
      if (!wasLateOverride && targetIsKnown && targetUncheckedIdx > 0) {
        skippedItems = uncheckedItems
          .slice(0, targetUncheckedIdx)
          .filter((item) => !item.addedLateOverride && item.storePosition !== -1);
      }

      const now = Date.now();
      const updatedRawItems = currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              checked: true,
              checkedAt: now,
              addedLateOverride: false
            }
          : item
      );

      const { sortedItems } = sortShoppingList(updatedRawItems, supermarket);
      const checkedItem = sortedItems.find((item) => item.id === itemId);

      const updatedList = {
        ...list,
        items: sortedItems,
        updatedAt: now
      };

      const outOfOrderDetected =
        Boolean(list.liveOptimizationEnabled) && skippedItems.length > 0;

      const storeName = supermarket && supermarket.name ? supermarket.name : 'diesen Supermarkt';
      const checkedLabel = formatItemDisplayName(checkedItem);
      const skippedNamesText = skippedItems.map((i) => formatItemDisplayName(i)).join(', ');
      const promptMessage = outOfOrderDetected
        ? `Reihenfolge im Supermarkt anpassen? Du hast „${checkedLabel}“ vor „${skippedNamesText}“ abgehakt. Soll die Konfiguration für ${storeName} automatisch angepasst werden?`
        : null;

      return {
        list: updatedList,
        action: 'checked',
        outOfOrderDetected,
        checkedItem,
        skippedItems,
        promptMessage
      };
    } else {
      // Checked -> Unchecked (Rückgängig machen)
      const now = Date.now();
      const updatedRawItems = currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              checked: false,
              checkedAt: null,
              addedLateOverride: false
            }
          : item
      );

      const { sortedItems } = sortShoppingList(updatedRawItems, supermarket);
      const uncheckedItem = sortedItems.find((item) => item.id === itemId);

      const updatedList = {
        ...list,
        items: sortedItems,
        updatedAt: now
      };

      return {
        list: updatedList,
        action: 'unchecked',
        outOfOrderDetected: false,
        uncheckedItem,
        skippedItems: [],
        promptMessage: null
      };
    }
  }

  /**
   * Updates `supermarket.itemOrder` so that `checkedItemOrName` is placed right BEFORE
   * the first item of `skippedItemsOrNames` in `supermarket.itemOrder`.
   * Preserves specifications: if the checked item carries a specification not yet present
   * as an explicit entry in `supermarket.itemOrder`, inserts it as a dedicated specified entry
   * without overwriting the generic (unspecified) product entry.
   *
   * @param {Object} supermarket - Supermarket configuration to update
   * @param {string|Object} checkedItemOrName - Checked item name or `{ name, specification }` object
   * @param {Array<string|Object>|string|Object} skippedItemsOrNames - Array of skipped item names or objects
   * @returns {Object} Updated supermarket configuration
   */
  function applyLiveOptimizationUpdate(supermarket, checkedItemOrName, skippedItemsOrNames) {
    if (!supermarket) return supermarket;

    const checkedEntry = createStoreEntry(checkedItemOrName);
    if (!checkedEntry) return supermarket;

    const skippedArray = Array.isArray(skippedItemsOrNames)
      ? skippedItemsOrNames
      : skippedItemsOrNames
      ? [skippedItemsOrNames]
      : [];

    const skippedEntries = skippedArray
      .map((s) => createStoreEntry(s))
      .filter(Boolean);

    if (skippedEntries.length === 0) return supermarket;

    const order = Array.isArray(supermarket.itemOrder)
      ? supermarket.itemOrder.map((e) => createStoreEntry(e)).filter(Boolean)
      : [];

    // Locate the exact matching entry in order (avoid moving a generic entry when a specific brand was checked)
    let existingCheckedIdx = findExactStoreEntryIndex(order, checkedEntry);
    if (existingCheckedIdx === -1) {
      const match = findStoreEntryMatch(order, checkedEntry);
      if (checkedEntry.specification) {
        // Only reuse existing entry if it was an exact-spec (synonym) match
        if (match.matchType === 'exact-spec') {
          existingCheckedIdx = match.index;
        }
      } else if (match.matchType === 'exact-generic') {
        existingCheckedIdx = match.index;
      }
    }

    const entryToPlace =
      existingCheckedIdx !== -1 ? order[existingCheckedIdx] : checkedEntry;

    if (existingCheckedIdx !== -1) {
      order.splice(existingCheckedIdx, 1);
    }

    // Find the position of the first skipped item in order
    let targetInsertIdx = -1;
    for (const skippedEntry of skippedEntries) {
      const idx = indexOfNormalized(order, skippedEntry);
      if (idx !== -1) {
        if (targetInsertIdx === -1 || idx < targetInsertIdx) {
          targetInsertIdx = idx;
        }
      }
    }

    if (targetInsertIdx !== -1) {
      order.splice(targetInsertIdx, 0, entryToPlace);
    } else {
      // None of the skipped items were in supermarket.itemOrder yet:
      // Add checkedItem followed by the skipped items so the order is learned
      order.push(entryToPlace);
      for (const skippedEntry of skippedEntries) {
        if (findExactStoreEntryIndex(order, skippedEntry) === -1) {
          order.push(skippedEntry);
        }
      }
    }

    return createSupermarket({
      ...supermarket,
      itemOrder: order,
      updatedAt: Date.now()
    });
  }

  /**
   * Switches a shopping list to a new supermarket and immediately re-sorts all items
   * according to the new supermarket's walking order.
   *
   * @param {Object} list
   * @param {Object} newSupermarket
   * @returns {Object} Updated shopping list
   */
  function changeListSupermarket(list, newSupermarket) {
    if (!list || !newSupermarket) return list;
    const { sortedItems } = sortShoppingList(list.items || [], newSupermarket);
    return {
      ...list,
      supermarketId: newSupermarket.id,
      items: sortedItems,
      updatedAt: Date.now()
    };
  }

  /**
   * Enables or disables Live Optimization on a shopping list.
   * @param {Object} list
   * @param {boolean} enabled
   * @returns {Object}
   */
  function setLiveOptimization(list, enabled) {
    return {
      ...list,
      liveOptimizationEnabled: Boolean(enabled),
      updatedAt: Date.now()
    };
  }

  /**
   * Removes an item by ID from the shopping list and returns the updated sorted list.
   * @param {Object} list
   * @param {Object} supermarket
   * @param {string} itemId
   * @returns {Object}
   */
  function removeItemFromList(list, supermarket, itemId) {
    const filtered = (list.items || []).filter((item) => item.id !== itemId);
    const { sortedItems } = sortShoppingList(filtered, supermarket);
    return {
      ...list,
      items: sortedItems,
      updatedAt: Date.now()
    };
  }

  /**
   * Updates an item's name, specification, or quantity and re-sorts the list.
   * @param {Object} list
   * @param {Object} supermarket
   * @param {string} itemId
   * @param {Object} updates - `{ name, specification, quantity, category }`
   * @returns {Object}
   */
  function updateItemInList(list, supermarket, itemId, updates = {}) {
    const updatedRaw = (list.items || []).map((item) => {
      if (item.id !== itemId) return item;
      const newName = updates.name !== undefined ? String(updates.name).trim() : item.name;
      const newSpec =
        updates.specification !== undefined
          ? cleanSpecification(updates.specification)
          : cleanSpecification(item.specification);
      const newQty = updates.quantity !== undefined ? String(updates.quantity).trim() : item.quantity;
      const newCategory = updates.category !== undefined ? updates.category : item.category;
      return createItem({
        ...item,
        name: newName || item.name,
        specification: newSpec,
        quantity: newQty || '1x',
        category: newCategory
      });
    });
    const { sortedItems } = sortShoppingList(updatedRaw, supermarket);
    return {
      ...list,
      items: sortedItems,
      updatedAt: Date.now()
    };
  }

  /**
   * Removes all checked items from the shopping list.
   * @param {Object} list
   * @param {Object} supermarket
   * @returns {Object}
   */
  function clearCheckedItems(list, supermarket) {
    const remaining = (list.items || []).filter((item) => !item.checked);
    const { sortedItems } = sortShoppingList(remaining, supermarket);
    return {
      ...list,
      items: sortedItems,
      updatedAt: Date.now()
    };
  }

  /**
   * Unchecks all items on the shopping list and clears any late overrides,
   * restoring the full list in clean supermarket walking order.
   * @param {Object} list
   * @param {Object} supermarket
   * @returns {Object}
   */
  function uncheckAllItems(list, supermarket) {
    const resetItems = (list.items || []).map((item) => ({
      ...item,
      checked: false,
      checkedAt: null,
      addedLateOverride: false
    }));
    const { sortedItems } = sortShoppingList(resetItems, supermarket);
    return {
      ...list,
      items: sortedItems,
      updatedAt: Date.now()
    };
  }

  /**
   * Moves an item within `supermarket.itemOrder` from `fromIndex` to `toIndex`.
   * @param {Object} supermarket
   * @param {number} fromIndex
   * @param {number} toIndex
   * @returns {Object} Updated supermarket
   */
  function reorderSupermarketItem(supermarket, fromIndex, toIndex) {
    if (!supermarket || !Array.isArray(supermarket.itemOrder)) return supermarket;
    const order = [...supermarket.itemOrder];
    if (
      fromIndex < 0 ||
      fromIndex >= order.length ||
      toIndex < 0 ||
      toIndex >= order.length ||
      fromIndex === toIndex
    ) {
      return supermarket;
    }
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    return createSupermarket({
      ...supermarket,
      itemOrder: order,
      updatedAt: Date.now()
    });
  }

  /**
   * Attaches non-enumerable positioning metadata (`supermarket`, `insertedAtIndex`, `newIndex`,
   * `foundPrevious`, `previousItem`, `movedItem`) to a returned supermarket object so callers can
   * either use the return value directly as a Supermarket object OR destructure `{ supermarket, insertedAtIndex, foundPrevious }`.
   *
   * @param {Object} updatedStore
   * @param {Object} meta
   * @returns {Object}
   */
  function attachStorePositionMetadata(updatedStore, meta = {}) {
    if (!updatedStore || typeof updatedStore !== 'object') return updatedStore;
    const idx = typeof meta.insertedAtIndex === 'number' ? meta.insertedAtIndex : -1;
    Object.defineProperties(updatedStore, {
      supermarket: {
        value: updatedStore,
        enumerable: false,
        configurable: true
      },
      insertedAtIndex: {
        value: idx,
        enumerable: false,
        configurable: true
      },
      newIndex: {
        value: idx,
        enumerable: false,
        configurable: true
      },
      foundPrevious: {
        value: Boolean(meta.foundPrevious),
        enumerable: false,
        configurable: true
      },
      previousItem: {
        value: meta.previousItem || null,
        enumerable: false,
        configurable: true
      },
      movedItem: {
        value: meta.movedItem || null,
        enumerable: false,
        configurable: true
      }
    });
    return updatedStore;
  }

  /**
   * Checks whether a `previousItemName` value denotes inserting/moving to the very beginning (index 0).
   * @param {*} prev
   * @returns {boolean}
   */
  function isStartMarker(prev) {
    if (prev === '__START__' || prev === 0) return true;
    if (typeof prev !== 'string') return false;
    const norm = prev.trim().toLowerCase();
    return (
      norm === '__start__' ||
      norm === 'anfang' ||
      norm === 'ganz am anfang' ||
      norm === 'ganz an den anfang' ||
      norm === 'start' ||
      norm === 'position 1' ||
      norm === 'pos 1'
    );
  }

  /**
   * Resolves a `previousItem` selector (either a `{ name, specification }` entry object,
   * a plain item name string, or a formatted `"Name (Specification)"` string) to its index
   * in `order`.
   * @param {Array<{name: string, specification: string}>} order
   * @param {string|Object} previousItem
   * @returns {number}
   */
  function resolvePreviousItemIndex(order, previousItem) {
    if (!Array.isArray(order) || !previousItem) return -1;
    if (typeof previousItem === 'object') {
      const exact = findExactStoreEntryIndex(order, previousItem);
      if (exact !== -1) return exact;
      return indexOfNormalized(order, previousItem);
    }
    const cleanPrev = String(previousItem).trim();
    if (!cleanPrev) return -1;

    // 1. Exact generic match (empty specification)
    const exactGeneric = findExactStoreEntryIndex(order, cleanPrev, '');
    if (exactGeneric !== -1) return exactGeneric;

    // 2. Exact formatted display name match (e.g. "Milch (Oatly)" from UI datalist)
    const cleanPrevLower = cleanPrev.toLowerCase();
    for (let i = 0; i < order.length; i++) {
      if (formatItemDisplayName(order[i]).toLowerCase() === cleanPrevLower) {
        return i;
      }
    }

    // 3. Synonym/normalized match
    return indexOfNormalized(order, cleanPrev);
  }

  /**
   * Adds a known item (with optional specification) to a supermarket's walking order
   * immediately AFTER `previousItemName`.
   * - Uses exact `(normalizedName, normalizedSpecification)` identity so the same product
   *   can coexist with multiple different specifications and/or without specification.
   * - If `previousItemName` is `'__START__'` (or `'Anfang'`), inserts at index `0`.
   * - If `previousItemName` matches an existing entry in `supermarket.itemOrder`, inserts right after it (`prevIdx + 1`).
   *   If the exact `(name, specification)` entry already existed in `itemOrder`, it is moved right after `previousItemName`.
   * - If `previousItemName` is null/empty or not found, appends at the end of `itemOrder`.
   *
   * @param {Object} supermarket
   * @param {string|{name: string, specification?: string}} itemOrName
   * @param {string|Object|null} [previousItemName=null]
   * @param {string} [specification] - Optional specification when `itemOrName` is passed as a string
   * @returns {Object} Updated supermarket (with `.supermarket`, `.insertedAtIndex`, `.foundPrevious`, `.previousItem`, `.movedItem` metadata)
   */
  function addSupermarketKnownItemAfter(
    supermarket,
    itemOrName,
    previousItemName = null,
    specification = undefined
  ) {
    const targetEntry = createStoreEntry(itemOrName, specification);
    if (!supermarket || !targetEntry) {
      return attachStorePositionMetadata(supermarket, {
        insertedAtIndex: -1,
        foundPrevious: false
      });
    }

    const order = Array.isArray(supermarket.itemOrder)
      ? supermarket.itemOrder.map((e) => createStoreEntry(e)).filter(Boolean)
      : [];
    const existingIdx = findExactStoreEntryIndex(order, targetEntry);

    // If user specified the exact same entry (same name AND same specification) as previousItemName and it already exists, keep it in place
    if (existingIdx !== -1 && previousItemName && !isStartMarker(previousItemName)) {
      const prevIdxBeforeSplice = resolvePreviousItemIndex(order, previousItemName);
      if (
        prevIdxBeforeSplice !== -1 &&
        getStoreEntryKey(order[prevIdxBeforeSplice]) === getStoreEntryKey(targetEntry)
      ) {
        const unchanged = createSupermarket({
          ...supermarket,
          itemOrder: order,
          updatedAt: Date.now()
        });
        return attachStorePositionMetadata(unchanged, {
          insertedAtIndex: existingIdx,
          foundPrevious: true,
          previousItem: order[existingIdx],
          movedItem: targetEntry
        });
      }
    }

    if (existingIdx !== -1) {
      order.splice(existingIdx, 1);
    }

    let foundPrevious = false;
    let matchedPrevious = null;

    if (isStartMarker(previousItemName)) {
      order.unshift(targetEntry);
      foundPrevious = true;
      matchedPrevious = '__START__';
    } else if (
      (typeof previousItemName === 'object' && previousItemName !== null) ||
      (typeof previousItemName === 'string' &&
        previousItemName.trim() !== '' &&
        previousItemName.trim() !== '__END__')
    ) {
      const prevIdx = resolvePreviousItemIndex(order, previousItemName);
      if (prevIdx !== -1) {
        matchedPrevious = order[prevIdx];
        order.splice(prevIdx + 1, 0, targetEntry);
        foundPrevious = true;
      } else {
        order.push(targetEntry);
        foundPrevious = false;
      }
    } else {
      order.push(targetEntry);
      foundPrevious = false;
    }

    const updatedStore = createSupermarket({
      ...supermarket,
      itemOrder: order,
      updatedAt: Date.now()
    });
    const finalIdx = findExactStoreEntryIndex(updatedStore.itemOrder, targetEntry);

    return attachStorePositionMetadata(updatedStore, {
      insertedAtIndex: finalIdx,
      foundPrevious,
      previousItem: matchedPrevious,
      movedItem: targetEntry
    });
  }

  /**
   * Moves an existing entry in `supermarket.itemOrder` (identified by current index,
   * `{ name, specification }` object, or item name string) so that it stands immediately
   * AFTER `previousItemName` (or at index `0` if `previousItemName === '__START__'`).
   *
   * @param {Object} supermarket
   * @param {string|number|{name: string, specification?: string}} itemOrIndex
   * @param {string|Object|null} previousItemName
   * @returns {Object} Updated supermarket (with `.supermarket`, `.insertedAtIndex`, `.newIndex`, `.foundPrevious`, `.previousItem`, `.movedItem` metadata)
   */
  function moveSupermarketItemAfter(supermarket, itemOrIndex, previousItemName) {
    if (!supermarket || !Array.isArray(supermarket.itemOrder)) {
      return attachStorePositionMetadata(supermarket, {
        insertedAtIndex: -1,
        foundPrevious: false
      });
    }

    const order = supermarket.itemOrder.map((e) => createStoreEntry(e)).filter(Boolean);
    let currentIdx = -1;
    let targetEntry = null;

    if (typeof itemOrIndex === 'number') {
      if (itemOrIndex < 0 || itemOrIndex >= order.length) {
        return attachStorePositionMetadata(supermarket, {
          insertedAtIndex: -1,
          foundPrevious: false
        });
      }
      currentIdx = itemOrIndex;
      targetEntry = order[currentIdx];
    } else if (typeof itemOrIndex === 'object' && itemOrIndex !== null) {
      currentIdx = findExactStoreEntryIndex(order, itemOrIndex);
      if (currentIdx === -1) {
        return addSupermarketKnownItemAfter(supermarket, itemOrIndex, previousItemName);
      }
      targetEntry = order[currentIdx];
    } else if (typeof itemOrIndex === 'string' && itemOrIndex.trim() !== '') {
      currentIdx = resolvePreviousItemIndex(order, itemOrIndex.trim());
      if (currentIdx === -1) {
        return addSupermarketKnownItemAfter(supermarket, itemOrIndex.trim(), previousItemName);
      }
      targetEntry = order[currentIdx];
    } else {
      return attachStorePositionMetadata(supermarket, {
        insertedAtIndex: -1,
        foundPrevious: false
      });
    }

    if (isStartMarker(previousItemName)) {
      order.splice(currentIdx, 1);
      order.unshift(targetEntry);
      const updatedStore = createSupermarket({
        ...supermarket,
        itemOrder: order,
        updatedAt: Date.now()
      });
      return attachStorePositionMetadata(updatedStore, {
        insertedAtIndex: 0,
        foundPrevious: true,
        previousItem: '__START__',
        movedItem: targetEntry
      });
    }

    if (
      previousItemName === null ||
      previousItemName === undefined ||
      (typeof previousItemName === 'string' &&
        (previousItemName.trim() === '' ||
          previousItemName.trim() === '__END__' ||
          previousItemName.trim().toLowerCase() === 'ende' ||
          previousItemName.trim().toLowerCase() === 'am ende'))
    ) {
      order.splice(currentIdx, 1);
      order.push(targetEntry);
      const updatedStore = createSupermarket({
        ...supermarket,
        itemOrder: order,
        updatedAt: Date.now()
      });
      return attachStorePositionMetadata(updatedStore, {
        insertedAtIndex: updatedStore.itemOrder.length - 1,
        foundPrevious: false,
        previousItem: null,
        movedItem: targetEntry
      });
    }

    const checkPrevIdx = resolvePreviousItemIndex(order, previousItemName);
    if (checkPrevIdx === -1) {
      return attachStorePositionMetadata(supermarket, {
        insertedAtIndex: currentIdx,
        foundPrevious: false,
        previousItem: null,
        movedItem: targetEntry
      });
    }

    if (getStoreEntryKey(order[checkPrevIdx]) === getStoreEntryKey(targetEntry)) {
      return attachStorePositionMetadata(supermarket, {
        insertedAtIndex: currentIdx,
        foundPrevious: true,
        previousItem: targetEntry,
        movedItem: targetEntry
      });
    }

    order.splice(currentIdx, 1);
    const prevIdx = resolvePreviousItemIndex(order, previousItemName);
    const matchedPrevious = order[prevIdx];
    order.splice(prevIdx + 1, 0, targetEntry);

    const updatedStore = createSupermarket({
      ...supermarket,
      itemOrder: order,
      updatedAt: Date.now()
    });
    const finalIdx = findExactStoreEntryIndex(updatedStore.itemOrder, targetEntry);

    return attachStorePositionMetadata(updatedStore, {
      insertedAtIndex: finalIdx,
      foundPrevious: true,
      previousItem: matchedPrevious,
      movedItem: targetEntry
    });
  }

  /**
   * Adds a new item (with optional specification) to a supermarket's walking order
   * at a specific position (or after a named item, or at the end).
   * Deduplicates by `(normalizedName, normalizedSpecification)` so the same product
   * can coexist with different specifications and/or without specification.
   *
   * @param {Object} supermarket
   * @param {string|{name: string, specification?: string}} itemOrName
   * @param {number|string|Object} [insertIndex=-1]
   * @param {string} [specification] - Optional specification when `itemOrName` is a string
   * @returns {Object} Updated supermarket
   */
  function addSupermarketKnownItem(
    supermarket,
    itemOrName,
    insertIndex = -1,
    specification = undefined
  ) {
    if (typeof insertIndex === 'string' || (typeof insertIndex === 'object' && insertIndex !== null)) {
      return addSupermarketKnownItemAfter(supermarket, itemOrName, insertIndex, specification);
    }
    const entry = createStoreEntry(itemOrName, specification);
    if (!supermarket || !entry) return supermarket;

    const order = (supermarket.itemOrder || []).map((e) => createStoreEntry(e)).filter(Boolean);
    const existingIdx = findExactStoreEntryIndex(order, entry);
    if (existingIdx !== -1) {
      order.splice(existingIdx, 1);
    }
    if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= order.length) {
      order.splice(insertIndex, 0, entry);
    } else {
      order.push(entry);
    }
    return createSupermarket({
      ...supermarket,
      itemOrder: order,
      updatedAt: Date.now()
    });
  }

  /**
   * Updates an existing entry's name and/or specification in `supermarket.itemOrder`
   * (identified by index or `{ name, specification }` / name).
   *
   * @param {Object} supermarket
   * @param {number|string|{name: string, specification?: string}} indexOrEntry
   * @param {{ name?: string, specification?: string }} [updates={}]
   * @returns {Object} Updated supermarket
   */
  function updateSupermarketKnownItem(supermarket, indexOrEntry, updates = {}) {
    if (!supermarket || !Array.isArray(supermarket.itemOrder)) return supermarket;
    const order = supermarket.itemOrder.map((e) => createStoreEntry(e)).filter(Boolean);

    let targetIdx = -1;
    if (typeof indexOrEntry === 'number') {
      if (indexOrEntry >= 0 && indexOrEntry < order.length) {
        targetIdx = indexOrEntry;
      }
    } else {
      targetIdx = findExactStoreEntryIndex(order, indexOrEntry);
    }

    if (targetIdx === -1) return supermarket;

    const existing = order[targetIdx];
    const nextEntry = createStoreEntry({
      name: updates.name !== undefined ? updates.name : existing.name,
      specification:
        updates.specification !== undefined ? updates.specification : existing.specification
    });
    if (!nextEntry) return supermarket;

    order[targetIdx] = nextEntry;
    return createSupermarket({
      ...supermarket,
      itemOrder: order,
      updatedAt: Date.now()
    });
  }

  /**
   * Removes an entry from a supermarket's walking order.
   * Accepts an index (`number`), a `{ name, specification }` entry object,
   * or `(itemName, specification)`. Only removes the exact `(normalizedName, normalizedSpecification)`
   * entry, preserving other specifications of the same product!
   *
   * @param {Object} supermarket
   * @param {number|string|{name: string, specification?: string}} itemOrIndex
   * @param {string} [specification]
   * @returns {Object} Updated supermarket
   */
  function removeSupermarketKnownItem(supermarket, itemOrIndex, specification = undefined) {
    if (!supermarket || !Array.isArray(supermarket.itemOrder)) return supermarket;
    const order = supermarket.itemOrder.map((e) => createStoreEntry(e)).filter(Boolean);

    if (typeof itemOrIndex === 'number') {
      if (itemOrIndex < 0 || itemOrIndex >= order.length) return supermarket;
      order.splice(itemOrIndex, 1);
      return createSupermarket({
        ...supermarket,
        itemOrder: order,
        updatedAt: Date.now()
      });
    }

    const targetKey = getStoreEntryKey(itemOrIndex, specification);
    if (!targetKey) return supermarket;

    const filtered = order.filter((entry) => getStoreEntryKey(entry) !== targetKey);
    return createSupermarket({
      ...supermarket,
      itemOrder: filtered,
      updatedAt: Date.now()
    });
  }

  /**
   * Adds an unknown shopping list item (including its optional specification) to a
   * supermarket's sort list so the user can add it via long-press and then sort it manually as usual.
   * Does not duplicate or move an entry if the exact `(normalizedName, normalizedSpecification)`
   * already exists in the supermarket.
   *
   * @param {Object} supermarket - Active supermarket configuration
   * @param {string|{name: string, specification?: string}} itemOrName - Shopping list item object or name
   * @param {Object} [options={}]
   * @param {string} [options.specification] - Optional specification override when passing a string name
   * @param {number} [options.insertIndex=-1] - Target index in `itemOrder` (`-1` appends at the end)
   * @param {string|Object|null} [options.previousItem=null] - Optional preceding entry or `'__START__'`
   * @param {Object|null} [options.list=null] - Optional shopping list to re-sort immediately against the updated store
   * @returns {{ supermarket: Object, list: Object|null, added: boolean, alreadyExists: boolean, entry: {name: string, specification: string}|null, index: number }}
   */
  function addItemToSupermarket(supermarket, itemOrName, options = {}) {
    const {
      specification = undefined,
      insertIndex = -1,
      previousItem = null,
      list = null
    } = options || {};

    const entry = createStoreEntry(itemOrName, specification);
    if (!supermarket || !entry) {
      return {
        supermarket,
        list: list || null,
        added: false,
        alreadyExists: false,
        entry: null,
        index: -1
      };
    }

    const existingIdx = findExactStoreEntryIndex(supermarket.itemOrder, entry);
    if (existingIdx !== -1) {
      const normalizedStore = createSupermarket(supermarket);
      const syncedList = list
        ? {
            ...list,
            items: sortShoppingList(list.items || [], normalizedStore).sortedItems,
            updatedAt: Date.now()
          }
        : null;
      return {
        supermarket: normalizedStore,
        list: syncedList,
        added: false,
        alreadyExists: true,
        entry: normalizedStore.itemOrder[existingIdx],
        index: existingIdx
      };
    }

    const updatedStore =
      previousItem !== null && previousItem !== undefined
        ? addSupermarketKnownItemAfter(supermarket, entry, previousItem)
        : addSupermarketKnownItem(supermarket, entry, insertIndex);

    const newIdx = findExactStoreEntryIndex(updatedStore.itemOrder, entry);
    const savedEntry = newIdx !== -1 ? updatedStore.itemOrder[newIdx] : entry;
    const updatedList = list
      ? {
          ...list,
          items: sortShoppingList(list.items || [], updatedStore).sortedItems,
          updatedAt: Date.now()
        }
      : null;

    return {
      supermarket: updatedStore,
      list: updatedList,
      added: true,
      alreadyExists: false,
      entry: savedEntry,
      index: newIdx
    };
  }

  const optimizerExports = {
    sortShoppingList,
    addItemToList,
    addMultipleItemsToList,
    toggleItemCheck,
    applyLiveOptimizationUpdate,
    changeListSupermarket,
    setLiveOptimization,
    removeItemFromList,
    updateItemInList,
    clearCheckedItems,
    uncheckAllItems,
    reorderSupermarketItem,
    addSupermarketKnownItem,
    addSupermarketKnownItemAfter,
    moveSupermarketItemAfter,
    updateSupermarketKnownItem,
    removeSupermarketKnownItem,
    addItemToSupermarket
  };

  Object.assign(SmartCartCore, optimizerExports);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = optimizerExports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
