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
    indexOfNormalized,
    createItem,
    createSupermarket,
    createShoppingList
  } = models;

  /**
   * Sorts a shopping list according to the active supermarket's walking path and SmartCart rules:
   * - Rule A (Checked items at top): All checked items (`item.checked === true`) are placed at the VERY TOP
   *   of the list (grayed out in UI), so that all remaining unchecked items appear cleanly in their
   *   optimized walking order right below them.
   * - Rule B (Supermarket order for unchecked items): Unchecked items are ordered according to their
   *   index in `supermarket.itemOrder` (matched via `indexOfNormalized`). Items not yet in
   *   `supermarket.itemOrder` appear at the end of unchecked items in their `originalOrder`.
   * - Rule C (Late-added item override): If an unchecked item has `item.addedLateOverride === true`,
   *   it MUST be placed at the very top of the unchecked items (i.e. right after the checked items,
   *   as the immediate next item to buy!).
   *
   * @param {Object|Array} listOrItems - Shopping list object or items array
   * @param {Object} supermarket - Supermarket configuration with `itemOrder`
   * @returns {{ sortedItems: Array, checkedItems: Array, uncheckedItems: Array }}
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
      const storePosition = indexOfNormalized(itemOrder, item.name);
      return {
        ...item,
        originalOrder: typeof item.originalOrder === 'number' ? item.originalOrder : idx,
        storePosition
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
        // Rule C: Late-added item override comes FIRST among unchecked items
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

        // Rule B: Supermarket walking order for normal unchecked items
        const posA = a.storePosition;
        const posB = b.storePosition;
        const knownA = posA !== -1;
        const knownB = posB !== -1;

        if (knownA && knownB) {
          if (posA !== posB) return posA - posB;
          return a.originalOrder - b.originalOrder;
        }
        if (knownA && !knownB) return -1;
        if (!knownA && knownB) return 1;

        // Both unknown in supermarket configuration -> preserve originalOrder
        return a.originalOrder - b.originalOrder;
      });

    const sortedItems = [...checkedItems, ...uncheckedItems];

    return {
      sortedItems,
      checkedItems,
      uncheckedItems
    };
  }

  /**
   * Adds a new item to the shopping list, automatically detecting if the user has already
   * walked past this item's normal section in the supermarket.
   *
   * Specifically:
   * - Finds `pos = indexOfNormalized(supermarket.itemOrder, name)`.
   * - If `pos !== -1`, checks if there is ANY currently checked item on `list.items` whose
   *   position in `supermarket.itemOrder` is strictly greater than `pos` (`checkedPos > pos`).
   * - If YES, sets `addedLateOverride: true` on the new item so it becomes the immediate next
   *   unchecked item on the shopping list!
   *
   * @param {Object} list - Current shopping list
   * @param {Object} supermarket - Active supermarket configuration
   * @param {Object} itemInput - `{ name, quantity, category }`
   * @returns {{ list: Object, addedItem: Object, wasAddedLate: boolean, passedByItems: Array }}
   */
  function addItemToList(list, supermarket, { name, quantity = '1x', category = null } = {}) {
    const currentItems = Array.isArray(list && list.items) ? list.items : [];
    const itemOrder =
      supermarket && Array.isArray(supermarket.itemOrder) ? supermarket.itemOrder : [];

    const pos = indexOfNormalized(itemOrder, name);
    const passedByItems = [];

    if (pos !== -1) {
      for (const existing of currentItems) {
        if (existing.checked) {
          const checkedPos = indexOfNormalized(itemOrder, existing.name);
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
      const wasLateOverride = Boolean(target.addedLateOverride);

      let skippedItems = [];
      if (!wasLateOverride && targetUncheckedIdx > 0) {
        skippedItems = uncheckedItems
          .slice(0, targetUncheckedIdx)
          .filter((item) => !item.addedLateOverride);
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
      const skippedNamesText = skippedItems.map((i) => i.name).join(', ');
      const promptMessage = outOfOrderDetected
        ? `Reihenfolge im Supermarkt anpassen? Du hast „${checkedItem.name}“ vor „${skippedNamesText}“ abgehakt. Soll die Konfiguration für ${storeName} automatisch angepasst werden?`
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
   * Updates `supermarket.itemOrder` so that `checkedItemName` is placed right BEFORE
   * the first item of `skippedItemNames` in `supermarket.itemOrder`.
   * If `checkedItemName` was not in `supermarket.itemOrder` yet, it is inserted right before
   * the first skipped item.
   *
   * @param {Object} supermarket - Supermarket configuration to update
   * @param {string|Object} checkedItemName - Checked item name or item object
   * @param {Array<string|Object>|string} skippedItemNames - Array of skipped item names or objects
   * @returns {Object} Updated supermarket configuration
   */
  function applyLiveOptimizationUpdate(supermarket, checkedItemName, skippedItemNames) {
    if (!supermarket) return supermarket;

    const rawCheckedName =
      typeof checkedItemName === 'object' && checkedItemName !== null
        ? checkedItemName.name
        : String(checkedItemName || '');
    const cleanCheckedName = rawCheckedName.trim();
    if (!cleanCheckedName) return supermarket;

    const skippedArray = Array.isArray(skippedItemNames)
      ? skippedItemNames
      : skippedItemNames
      ? [skippedItemNames]
      : [];

    const cleanSkippedNames = skippedArray
      .map((s) => (typeof s === 'object' && s !== null ? s.name : String(s || '')))
      .map((s) => s.trim())
      .filter(Boolean);

    if (cleanSkippedNames.length === 0) return supermarket;

    const order = Array.isArray(supermarket.itemOrder) ? [...supermarket.itemOrder] : [];

    // Check if checkedItemName already exists in order
    const existingCheckedIdx = indexOfNormalized(order, cleanCheckedName);
    const canonicalCheckedName =
      existingCheckedIdx !== -1 ? order[existingCheckedIdx] : cleanCheckedName;

    if (existingCheckedIdx !== -1) {
      order.splice(existingCheckedIdx, 1);
    }

    // Find the position of the first skipped item in order
    let targetInsertIdx = -1;
    for (const skippedName of cleanSkippedNames) {
      const idx = indexOfNormalized(order, skippedName);
      if (idx !== -1) {
        if (targetInsertIdx === -1 || idx < targetInsertIdx) {
          targetInsertIdx = idx;
        }
      }
    }

    if (targetInsertIdx !== -1) {
      order.splice(targetInsertIdx, 0, canonicalCheckedName);
    } else {
      // None of the skipped items were in supermarket.itemOrder yet:
      // Add checkedItem followed by the first skipped item so the order is learned
      order.push(canonicalCheckedName);
      for (const skippedName of cleanSkippedNames) {
        if (indexOfNormalized(order, skippedName) === -1) {
          order.push(skippedName);
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
   * Updates an item's name or quantity and re-sorts the list.
   * @param {Object} list
   * @param {Object} supermarket
   * @param {string} itemId
   * @param {Object} updates - `{ name, quantity }`
   * @returns {Object}
   */
  function updateItemInList(list, supermarket, itemId, updates = {}) {
    const updatedRaw = (list.items || []).map((item) => {
      if (item.id !== itemId) return item;
      const newName = updates.name !== undefined ? String(updates.name).trim() : item.name;
      const newQty = updates.quantity !== undefined ? String(updates.quantity).trim() : item.quantity;
      return createItem({
        ...item,
        name: newName || item.name,
        quantity: newQty || '1x'
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
   * Adds a new item to a supermarket's walking order at a specific position (or at the end).
   * @param {Object} supermarket
   * @param {string} itemName
   * @param {number} [insertIndex=-1]
   * @returns {Object} Updated supermarket
   */
  function addSupermarketKnownItem(supermarket, itemName, insertIndex = -1) {
    if (!supermarket || !String(itemName || '').trim()) return supermarket;
    const clean = String(itemName).trim();
    const order = [...(supermarket.itemOrder || [])];
    const existingIdx = indexOfNormalized(order, clean);
    if (existingIdx !== -1) {
      order.splice(existingIdx, 1);
    }
    if (insertIndex >= 0 && insertIndex <= order.length) {
      order.splice(insertIndex, 0, clean);
    } else {
      order.push(clean);
    }
    return createSupermarket({
      ...supermarket,
      itemOrder: order,
      updatedAt: Date.now()
    });
  }

  /**
   * Removes an item from a supermarket's walking order.
   * @param {Object} supermarket
   * @param {string} itemName
   * @returns {Object} Updated supermarket
   */
  function removeSupermarketKnownItem(supermarket, itemName) {
    if (!supermarket || !Array.isArray(supermarket.itemOrder)) return supermarket;
    const normTarget = normalizeItemName(itemName);
    const order = supermarket.itemOrder.filter(
      (entry) => normalizeItemName(entry) !== normTarget
    );
    return createSupermarket({
      ...supermarket,
      itemOrder: order,
      updatedAt: Date.now()
    });
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
    removeSupermarketKnownItem
  };

  Object.assign(SmartCartCore, optimizerExports);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = optimizerExports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
