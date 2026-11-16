/**
 * SmartCart Core Engine - Comprehensive Unit & Integration Test Suite
 * Run via: `node tests/engine.test.js`
 */
'use strict';

const assert = require('assert');

// Load all core modules (attaches to globalThis.SmartCartCore and exports via CommonJS)
require('../src/core/models.js');
require('../src/core/optimizer.js');
require('../src/core/ocr.js');
require('../src/core/storage.js');
require('../src/core/share.js');

const Core = globalThis.SmartCartCore;

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err && err.stack ? err.stack : err}`);
  }
}

async function main() {
  console.log('====================================================');
  console.log('🛒 SmartCart Core Engine Test Suite');
  console.log('====================================================\n');

  // 1. Models & Normalization
  await runTest('1. normalizeItemName & indexOfNormalized handle German umlauts, case & plurals', () => {
    assert.strictEqual(Core.normalizeItemName('  Äpfel  '), 'aepfel');
    assert.strictEqual(Core.normalizeItemName('Brötchen'), 'broetchen');
    assert.strictEqual(Core.normalizeItemName('üßÖÄ'), 'uessoeae');

    const order = ['Äpfel', 'Brötchen', 'Milch', 'Toilettenpapier'];
    assert.strictEqual(Core.indexOfNormalized(order, 'äpfel'), 0);
    assert.strictEqual(Core.indexOfNormalized(order, 'Aepfel'), 0);
    assert.strictEqual(Core.indexOfNormalized(order, 'Apfel'), 0); // singular synonym
    assert.strictEqual(Core.indexOfNormalized(order, 'Klopapier'), 3); // synonym
    assert.strictEqual(Core.indexOfNormalized(order, 'Unbekannter Artikel'), -1);
  });

  await runTest('2. Default German Supermarkets (REWE, ALDI, LIDL) have >=25 items in walking order', () => {
    const stores = Core.getDefaultSupermarkets();
    assert.strictEqual(stores.length, 3);
    const ids = stores.map((s) => s.id);
    assert.deepStrictEqual(ids, ['rewe', 'aldi', 'lidl']);
    for (const store of stores) {
      assert.ok(
        store.itemOrder.length >= 25,
        `Expected ${store.name} to have >= 25 items, got ${store.itemOrder.length}`
      );
    }
  });

  // 2. Sorting & Supermarket Switching
  await runTest('3. sortShoppingList places checked items at the TOP and unchecked items below in supermarket walking order', () => {
    const rewe = Core.getDefaultSupermarkets().find((s) => s.id === 'rewe');
    // REWE order: Äpfel (0) -> Brötchen (9) -> Milch (17) -> Nudeln (24) -> Toilettenpapier (42)
    const list = Core.createShoppingList({
      supermarketId: 'rewe',
      items: [
        { id: '1', name: 'Toilettenpapier', checked: false },
        { id: '2', name: 'Milch', checked: true },
        { id: '3', name: 'Nudeln', checked: false },
        { id: '4', name: 'Äpfel', checked: true },
        { id: '5', name: 'Brötchen', checked: false }
      ]
    });

    const { sortedItems, checkedItems, uncheckedItems } = Core.sortShoppingList(list, rewe);

    // Checked items MUST be at the very top of sortedItems
    assert.strictEqual(checkedItems.length, 2);
    assert.strictEqual(uncheckedItems.length, 3);
    assert.strictEqual(sortedItems[0].checked, true);
    assert.strictEqual(sortedItems[1].checked, true);
    assert.deepStrictEqual(
      checkedItems.map((i) => i.name),
      ['Äpfel', 'Milch']
    );

    // Unchecked items MUST follow in exact REWE store order: Brötchen -> Nudeln -> Toilettenpapier
    assert.deepStrictEqual(
      uncheckedItems.map((i) => i.name),
      ['Brötchen', 'Nudeln', 'Toilettenpapier']
    );
    assert.deepStrictEqual(
      sortedItems.map((i) => i.name),
      ['Äpfel', 'Milch', 'Brötchen', 'Nudeln', 'Toilettenpapier']
    );
  });

  await runTest('4. Switching supermarket automatically adapts the item order of the shopping list', () => {
    const stores = Core.getDefaultSupermarkets();
    const rewe = stores.find((s) => s.id === 'rewe');
    const aldi = stores.find((s) => s.id === 'aldi');

    // In REWE: Äpfel (Obst) comes before Brötchen (Backwaren), and Milch (Kühlregal) comes before Kaffee (Trockensortiment).
    // In ALDI: Brötchen (Backwaren) comes before Äpfel (Obst), and Kaffee (Trockensortiment) comes before Milch (Kühlregal).
    let list = Core.createShoppingList({
      supermarketId: 'rewe',
      items: [
        { id: '1', name: 'Kaffee', checked: false },
        { id: '2', name: 'Milch', checked: false },
        { id: '3', name: 'Brötchen', checked: false },
        { id: '4', name: 'Äpfel', checked: false }
      ]
    });

    const sortedRewe = Core.sortShoppingList(list, rewe);
    assert.deepStrictEqual(
      sortedRewe.uncheckedItems.map((i) => i.name),
      ['Äpfel', 'Brötchen', 'Milch', 'Kaffee']
    );

    // Switch to ALDI
    list = Core.changeListSupermarket(list, aldi);
    assert.strictEqual(list.supermarketId, 'aldi');
    const sortedAldi = Core.sortShoppingList(list, aldi);
    assert.deepStrictEqual(
      sortedAldi.uncheckedItems.map((i) => i.name),
      ['Brötchen', 'Äpfel', 'Kaffee', 'Milch']
    );
  });

  // 3. Unchecking an item restores its exact supermarket position
  await runTest('5. Unchecking a checked item (Rückgängig machen) restores it to its exact optimized position among unchecked items', () => {
    const rewe = Core.getDefaultSupermarkets().find((s) => s.id === 'rewe');
    let list = Core.createShoppingList({
      supermarketId: 'rewe',
      items: [
        { id: 'i_aepfel', name: 'Äpfel', checked: false },
        { id: 'i_milch', name: 'Milch', checked: true }, // currently checked at top
        { id: 'i_nudeln', name: 'Nudeln', checked: false }
      ]
    });

    // Before unchecking: Milch is at top (index 0), followed by Äpfel, Nudeln
    const before = Core.sortShoppingList(list, rewe);
    assert.deepStrictEqual(
      before.sortedItems.map((i) => i.name),
      ['Milch', 'Äpfel', 'Nudeln']
    );

    // Uncheck Milch
    const res = Core.toggleItemCheck(list, rewe, 'i_milch');
    assert.strictEqual(res.action, 'unchecked');
    assert.strictEqual(res.outOfOrderDetected, false);

    // Now Milch must be placed back between Äpfel and Nudeln!
    const after = Core.sortShoppingList(res.list, rewe);
    assert.strictEqual(after.checkedItems.length, 0);
    assert.deepStrictEqual(
      after.uncheckedItems.map((i) => i.name),
      ['Äpfel', 'Milch', 'Nudeln']
    );
  });

  // 4. Live Optimization ON vs OFF & Supermarket Order Adaptation
  await runTest('6. Live Optimization ON: checking an item out of order detects skipped items and updates supermarket configuration on confirmation', () => {
    let rewe = Core.getDefaultSupermarkets().find((s) => s.id === 'rewe');
    let list = Core.createShoppingList({
      supermarketId: 'rewe',
      liveOptimizationEnabled: true,
      items: [
        { id: '1', name: 'Äpfel', checked: false },
        { id: '2', name: 'Brötchen', checked: false },
        { id: '3', name: 'Milch', checked: false }
      ]
    });

    // Check 'Milch' while 'Äpfel' and 'Brötchen' are still unchecked before it
    const toggleRes = Core.toggleItemCheck(list, rewe, '3');
    assert.strictEqual(toggleRes.action, 'checked');
    assert.strictEqual(toggleRes.outOfOrderDetected, true);
    assert.strictEqual(toggleRes.checkedItem.name, 'Milch');
    assert.deepStrictEqual(
      toggleRes.skippedItems.map((i) => i.name),
      ['Äpfel', 'Brötchen']
    );
    assert.ok(toggleRes.promptMessage.includes('Milch'));
    assert.ok(toggleRes.promptMessage.includes('Äpfel'));

    // User confirms: applyLiveOptimizationUpdate moves 'Milch' before 'Äpfel' in REWE
    rewe = Core.applyLiveOptimizationUpdate(
      rewe,
      toggleRes.checkedItem,
      toggleRes.skippedItems
    );

    const newMilchIdx = Core.indexOfNormalized(rewe.itemOrder, 'Milch');
    const newAepfelIdx = Core.indexOfNormalized(rewe.itemOrder, 'Äpfel');
    assert.ok(
      newMilchIdx < newAepfelIdx,
      `Expected Milch (${newMilchIdx}) to now come before Äpfel (${newAepfelIdx})`
    );
  });

  await runTest('7. Live Optimization OFF: checking an item out of order does NOT trigger outOfOrderDetected prompt', () => {
    const rewe = Core.getDefaultSupermarkets().find((s) => s.id === 'rewe');
    const list = Core.createShoppingList({
      supermarketId: 'rewe',
      liveOptimizationEnabled: false,
      items: [
        { id: '1', name: 'Äpfel', checked: false },
        { id: '2', name: 'Brötchen', checked: false },
        { id: '3', name: 'Milch', checked: false }
      ]
    });

    const toggleRes = Core.toggleItemCheck(list, rewe, '3');
    assert.strictEqual(toggleRes.action, 'checked');
    assert.strictEqual(toggleRes.outOfOrderDetected, false);
    assert.strictEqual(toggleRes.promptMessage, null);
  });

  // 5. Smart Late Addition ("Already Passed Store Section")
  await runTest('8. Adding an item whose store position was ALREADY passed places it as the very first unchecked item (addedLateOverride: true)', () => {
    const rewe = Core.getDefaultSupermarkets().find((s) => s.id === 'rewe');
    // Suppose user already checked 'Brötchen' (Backwaren, pos 9) and still has 'Milch' (pos 17) & 'Nudeln' (pos 24) open
    let list = Core.createShoppingList({
      supermarketId: 'rewe',
      items: [
        { id: '1', name: 'Brötchen', checked: true },
        { id: '2', name: 'Milch', checked: false },
        { id: '3', name: 'Nudeln', checked: false }
      ]
    });

    // Now user adds 'Tomaten' (Obst & Gemüse, pos 2 in REWE -> before Brötchen pos 9!)
    const addLateRes = Core.addItemToList(list, rewe, {
      name: 'Tomaten',
      quantity: '500g'
    });

    assert.strictEqual(addLateRes.wasAddedLate, true);
    assert.strictEqual(addLateRes.addedItem.addedLateOverride, true);
    assert.strictEqual(addLateRes.passedByItems.length, 1);
    assert.strictEqual(addLateRes.passedByItems[0].name, 'Brötchen');

    const sortedAfterLate = Core.sortShoppingList(addLateRes.list, rewe);
    // Checked items at top: ['Brötchen']
    // Unchecked items right below: 'Tomaten' MUST be #1 (index 0 of uncheckedItems), before 'Milch' and 'Nudeln'!
    assert.deepStrictEqual(
      sortedAfterLate.checkedItems.map((i) => i.name),
      ['Brötchen']
    );
    assert.deepStrictEqual(
      sortedAfterLate.uncheckedItems.map((i) => i.name),
      ['Tomaten', 'Milch', 'Nudeln']
    );
    assert.deepStrictEqual(
      sortedAfterLate.sortedItems.map((i) => i.name),
      ['Brötchen', 'Tomaten', 'Milch', 'Nudeln']
    );

    // Now user adds 'Toilettenpapier' (Haushalt, pos 42 in REWE -> AFTER Brötchen pos 9, so NOT passed yet!)
    const addNormalRes = Core.addItemToList(addLateRes.list, rewe, {
      name: 'Toilettenpapier',
      quantity: '1 Pck.'
    });

    assert.strictEqual(addNormalRes.wasAddedLate, false);
    assert.strictEqual(addNormalRes.addedItem.addedLateOverride, false);

    const sortedAfterNormal = Core.sortShoppingList(addNormalRes.list, rewe);
    assert.deepStrictEqual(
      sortedAfterNormal.uncheckedItems.map((i) => i.name),
      ['Tomaten', 'Milch', 'Nudeln', 'Toilettenpapier']
    );
  });

  // 6. OCR & Photo Recognition
  await runTest('9. parseShoppingText & recognizeImageShoppingList extract quantities and item names accurately', async () => {
    const raw = `
      Einkaufszettel Samstag
      - 2x Milch
      * 500g Hackfleisch
      • 6 Brötchen
      [ ] Tomaten 500g
      1,5L Orangensaft
      Äpfel (4 Stück)
    `;
    const parsed = Core.parseShoppingText(raw);
    assert.strictEqual(parsed.length, 6);
    assert.deepStrictEqual(
      parsed.map((p) => ({ name: p.name, quantity: p.quantity })),
      [
        { name: 'Milch', quantity: '2x' },
        { name: 'Hackfleisch', quantity: '500g' },
        { name: 'Brötchen', quantity: '6x' },
        { name: 'Tomaten', quantity: '500g' },
        { name: 'Orangensaft', quantity: '1,5L' },
        { name: 'Äpfel', quantity: '4 Stück' }
      ]
    );

    // Test sample photo generation & recognition
    const dataUrl = Core.generateSamplePhotoDataUrl('wochenende');
    assert.ok(dataUrl.startsWith('data:image/'));

    const progressSteps = [];
    const ocrResult = await Core.recognizeImageShoppingList(dataUrl, (p) =>
      progressSteps.push(p)
    );
    assert.ok(progressSteps.length >= 2);
    assert.strictEqual(ocrResult.presetId, 'wochenende');
    assert.strictEqual(ocrResult.items.length, 8);
    assert.strictEqual(ocrResult.items[0].name, 'Milch');
    assert.strictEqual(ocrResult.items[0].quantity, '2x');
  });

  // 7. Storage & Share Service
  await runTest('10. LocalStorageRepository & ShareService persist and encode/decode SC1 share codes losslessly', () => {
    const mem = Core.createMemoryStorage();
    const repo = new Core.LocalStorageRepository(mem);

    const state = repo.loadState();
    assert.strictEqual(state.supermarkets.length, 3);
    assert.ok(state.activeList.items.length >= 6);

    const exported = Core.ShareService.exportShoppingList(
      state.activeList,
      state.activeSupermarket
    );
    assert.ok(exported.shareCode.startsWith('SC1:'));
    assert.ok(exported.shareText.includes('Wocheneinkauf'));

    const decoded = Core.ShareService.decodeShareCode(exported.shareText);
    assert.strictEqual(decoded.valid, true);
    assert.strictEqual(decoded.list.name, 'Wocheneinkauf');
    assert.strictEqual(decoded.list.items.length, state.activeList.items.length);
    assert.strictEqual(decoded.supermarket.id, 'rewe');
  });

  console.log('\n====================================================');
  console.log(`Result: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main();
