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

  // 7. Storage Persistence
  await runTest('10. LocalStorageRepository seeds and persists supermarkets and shopping lists losslessly', () => {
    const mem = Core.createMemoryStorage();
    const repo = new Core.LocalStorageRepository(mem);

    const state = repo.loadState();
    assert.strictEqual(state.supermarkets.length, 3);
    assert.ok(state.activeList.items.length >= 6);
    assert.strictEqual(state.activeList.name, 'Wocheneinkauf');
    assert.strictEqual(state.activeSupermarket.id, 'rewe');

    // Reload via a second repository instance backed by the same storage
    const repo2 = new Core.LocalStorageRepository(mem);
    const reloaded = repo2.loadState();
    assert.strictEqual(reloaded.supermarkets.length, 3);
    assert.strictEqual(reloaded.activeList.name, 'Wocheneinkauf');
    assert.strictEqual(reloaded.activeList.items.length, state.activeList.items.length);
  });

  // 8. Supermarket Creation with Sorting Template (getDefaultItemOrder & createSupermarketWithSorting)
  await runTest('11. getDefaultItemOrder & createSupermarketWithSorting adopt either default sorting or an existing store sorting', () => {
    const stores = Core.getDefaultSupermarkets();
    const rewe = stores.find((s) => s.id === 'rewe');
    const aldi = stores.find((s) => s.id === 'aldi');

    const defaultOrder = Core.getDefaultItemOrder();
    assert.deepStrictEqual(defaultOrder, rewe.itemOrder);
    // Ensure it returns a fresh deep copy
    defaultOrder.push({ name: 'Test-Mutation', specification: '' });
    defaultOrder[0].specification = 'Mutated';
    assert.notStrictEqual(defaultOrder.length, rewe.itemOrder.length);
    assert.strictEqual(rewe.itemOrder[0].specification, '');

    // Create with 'default' sorting
    const edekaDefault = Core.createSupermarketWithSorting({
      name: 'EDEKA Center',
      icon: '🟡',
      color: '#f59e0b',
      sourceSupermarketId: 'default',
      supermarkets: stores
    });
    assert.strictEqual(edekaDefault.name, 'EDEKA Center');
    assert.deepStrictEqual(edekaDefault.itemOrder, rewe.itemOrder);

    // Create by adopting ALDI's sorting
    const HoferAldi = Core.createSupermarketWithSorting({
      name: 'HOFER',
      icon: '🔵',
      color: '#2563eb',
      sourceSupermarketId: 'aldi',
      supermarkets: stores
    });
    assert.deepStrictEqual(HoferAldi.itemOrder, aldi.itemOrder);
    assert.strictEqual(HoferAldi.itemOrder[0].name, 'Brötchen'); // ALDI starts with Brötchen
  });

  // 9. Exact Item Insertion & Moving by Preceding Item (addSupermarketKnownItemAfter & moveSupermarketItemAfter)
  await runTest('12. addSupermarketKnownItemAfter & moveSupermarketItemAfter position items accurately after a preceding item or at start', () => {
    let store = Core.createSupermarket({
      id: 'custom_store',
      name: 'Mein Markt',
      itemOrder: ['Äpfel', 'Bananen', 'Brötchen', 'Milch', 'Nudeln']
    });

    // 1) Insert 'Mango' right after 'Bananen'
    const res1 = Core.addSupermarketKnownItemAfter(store, 'Mango', 'Bananen');
    assert.strictEqual(res1.foundPrevious, true);
    assert.strictEqual(res1.insertedAtIndex, 2);
    assert.deepStrictEqual(
      res1.itemOrder.map((e) => e.name),
      ['Äpfel', 'Bananen', 'Mango', 'Brötchen', 'Milch', 'Nudeln']
    );
    assert.strictEqual(res1.supermarket, res1);
    store = res1;

    // 2) Insert 'Blumenstrauß' at the very beginning ('__START__')
    const res2 = Core.addSupermarketKnownItemAfter(store, 'Blumenstrauß', '__START__');
    assert.strictEqual(res2.foundPrevious, true);
    assert.strictEqual(res2.insertedAtIndex, 0);
    assert.strictEqual(res2.itemOrder[0].name, 'Blumenstrauß');
    store = res2;

    // 3) Append 'Kaugummi' at the end when previousItemName is empty
    const res3 = Core.addSupermarketKnownItemAfter(store, 'Kaugummi', '');
    assert.strictEqual(res3.foundPrevious, false);
    assert.strictEqual(res3.insertedAtIndex, store.itemOrder.length);
    assert.strictEqual(res3.itemOrder[res3.itemOrder.length - 1].name, 'Kaugummi');
    store = res3;

    // 4) Move existing item 'Nudeln' so it stands immediately after 'Brötchen'
    const res4 = Core.moveSupermarketItemAfter(store, 'Nudeln', 'Brötchen');
    assert.strictEqual(res4.foundPrevious, true);
    const broetchenIdx = Core.indexOfNormalized(res4.itemOrder, 'Brötchen');
    assert.strictEqual(res4.insertedAtIndex, broetchenIdx + 1);
    assert.strictEqual(res4.itemOrder[broetchenIdx + 1].name, 'Nudeln');
    store = res4;

    // 5) Move item by index to '__START__'
    const milchIdx = Core.indexOfNormalized(store.itemOrder, 'Milch');
    const res5 = Core.moveSupermarketItemAfter(store, milchIdx, '__START__');
    assert.strictEqual(res5.foundPrevious, true);
    assert.strictEqual(res5.insertedAtIndex, 0);
    assert.strictEqual(res5.itemOrder[0].name, 'Milch');
  });

  // 10. Real Photo OCR with Tesseract.js vs Non-Preset Safety
  await runTest('13. recognizeImageShoppingList never returns fake preset items for real user photos and integrates with Tesseract.js', async () => {
    // a) Non-preset user photo when Tesseract is not loaded must NOT return fake wochenende preset items
    const originalTesseract = globalThis.Tesseract;
    try {
      delete globalThis.Tesseract;
      const fakeUserPhotoDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const errRes = await Core.recognizeImageShoppingList(fakeUserPhotoDataUrl);
      assert.strictEqual(errRes.source, 'ocr-error');
      assert.strictEqual(errRes.items.length, 0);
      assert.strictEqual(errRes.presetId, null);
      assert.ok(errRes.error && errRes.error.length > 0);

      // Even a File-like object named "fruehstueck.jpg" must NOT return fake preset items without OCR
      const fileObjRes = await Core.recognizeImageShoppingList({ name: 'fruehstueck.jpg' });
      assert.strictEqual(fileObjRes.source, 'ocr-error');
      assert.strictEqual(fileObjRes.items.length, 0);

      // b) When Tesseract is loaded, recognizeImageShoppingList runs Tesseract.recognize('deu') and parses real OCR text
      let capturedLang = null;
      globalThis.Tesseract = {
        recognize: async (_img, lang, options) => {
          capturedLang = lang;
          if (options && typeof options.logger === 'function') {
            options.logger({ status: 'recognizing text', progress: 0.5 });
            options.logger({ status: 'recognizing text', progress: 1.0 });
          }
          return {
            data: {
              text: '3x Haferflocken\n500g Quark\n2 Flaschen Mineralwasser',
              confidence: 91
            }
          };
        }
      };

      const realOcrRes = await Core.recognizeImageShoppingList(fakeUserPhotoDataUrl);
      assert.strictEqual(capturedLang, 'deu');
      assert.strictEqual(realOcrRes.source, 'tesseract-ocr');
      assert.strictEqual(realOcrRes.items.length, 3);
      assert.deepStrictEqual(
        realOcrRes.items.map((i) => ({ name: i.name, quantity: i.quantity })),
        [
          { name: 'Haferflocken', quantity: '3x' },
          { name: 'Quark', quantity: '500g' },
          { name: 'Mineralwasser', quantity: '2 Flaschen' }
        ]
      );
    } finally {
      if (originalTesseract !== undefined) {
        globalThis.Tesseract = originalTesseract;
      } else {
        delete globalThis.Tesseract;
      }
    }
  });

  // 11. Multi-List Management (create, rename, duplicate, switch, save, delete)
  await runTest('14. LocalStorageRepository manages multiple named shopping lists (create, rename, switch, duplicate, delete)', () => {
    const mem = Core.createMemoryStorage();
    const repo = new Core.LocalStorageRepository(mem);

    // Initial seed list ("Wocheneinkauf")
    const initialLists = repo.loadShoppingLists();
    assert.strictEqual(initialLists.length, 1);
    assert.strictEqual(initialLists[0].name, 'Wocheneinkauf');

    // Create a second named list ("Grillparty Samstag") for ALDI
    const partyList = repo.createNewShoppingList({
      name: 'Grillparty Samstag',
      supermarketId: 'aldi',
      items: [
        { name: 'Bier', quantity: '1 Kasten' },
        { name: 'Brötchen', quantity: '10 Stk.' }
      ]
    });
    assert.strictEqual(partyList.name, 'Grillparty Samstag');
    assert.strictEqual(partyList.supermarketId, 'aldi');
    assert.strictEqual(repo.getActiveListId(), partyList.id);
    assert.strictEqual(repo.loadShoppingLists().length, 2);

    // Rename "Grillparty Samstag" -> "Geburtstags-Grillen"
    const renamed = repo.renameShoppingList(partyList.id, 'Geburtstags-Grillen');
    assert.strictEqual(renamed.name, 'Geburtstags-Grillen');
    assert.strictEqual(repo.getActiveList().name, 'Geburtstags-Grillen');

    // Duplicate list
    const duplicated = repo.duplicateShoppingList(partyList.id, 'Grillen Backup');
    assert.strictEqual(duplicated.name, 'Grillen Backup');
    assert.notStrictEqual(duplicated.id, partyList.id);
    assert.strictEqual(duplicated.items.length, 2);
    assert.strictEqual(repo.loadShoppingLists().length, 3);

    // Switch back to initial list ("Wocheneinkauf")
    const switched = repo.switchShoppingList(initialLists[0].id);
    assert.strictEqual(switched.id, initialLists[0].id);
    assert.strictEqual(repo.getActiveList().name, 'Wocheneinkauf');

    // Delete active list ("Wocheneinkauf") -> switches automatically to remaining list
    const remainingAfterDelete = repo.deleteShoppingList(initialLists[0].id);
    assert.strictEqual(remainingAfterDelete.length, 2);
    assert.strictEqual(repo.getActiveListId(), remainingAfterDelete[0].id);

    // Delete all remaining lists -> automatically creates a fresh empty default list
    repo.deleteShoppingList(remainingAfterDelete[0].id);
    const finalLists = repo.deleteShoppingList(remainingAfterDelete[1].id);
    assert.strictEqual(finalLists.length, 1);
    assert.strictEqual(finalLists[0].name, 'Mein Einkaufszettel');
    assert.strictEqual(finalLists[0].items.length, 0);
  });

  // 12. Requirement 1: Specification exact matching, fallback to unspecified & non-matching edge cases
  await runTest('15. Specification matching: exact match, fallback to unspecified, and unspecified never matches specified-only entry', () => {
    // Store A has: generic Milch (idx 1), Milch (Oatly) (idx 3), Milch (Weihenstephan) (idx 5)
    const storeA = Core.createSupermarket({
      id: 'spec_store_a',
      name: 'Spec Markt A',
      itemOrder: [
        'Äpfel',
        { name: 'Milch', specification: '' },
        'Brot',
        { name: 'Milch', specification: 'Oatly' },
        'Nudeln',
        { name: 'Milch', specification: 'Weihenstephan' },
        { name: 'Butter', specification: 'Bärenmarke' }
      ]
    });

    // Exact spec match (case-insensitive, trimmed, collapsed whitespace)
    const m1 = Core.findStoreEntryMatch(storeA.itemOrder, 'Milch', '  WEIHENSTEPHAN ');
    assert.strictEqual(m1.index, 5);
    assert.strictEqual(m1.matchType, 'exact-spec');

    const m2 = Core.findStoreEntryMatch(storeA.itemOrder, 'Milch', 'oatly');
    assert.strictEqual(m2.index, 3);
    assert.strictEqual(m2.matchType, 'exact-spec');

    // Synonym product name + exact spec still matches specified entry
    const mSynonymSpec = Core.findStoreEntryMatch(storeA.itemOrder, 'Vollmilch', 'Oatly');
    assert.strictEqual(mSynonymSpec.index, 3);
    assert.strictEqual(mSynonymSpec.matchType, 'exact-spec');

    // Case-insensitive umlauts in specification
    const mUmlaut = Core.findStoreEntryMatch(storeA.itemOrder, 'Butter', 'bärenmarke');
    assert.strictEqual(mUmlaut.index, 6);
    assert.strictEqual(mUmlaut.matchType, 'exact-spec');

    // Non-matching specification falls back to unspecified product entry
    const mFallback = Core.findStoreEntryMatch(storeA.itemOrder, 'Milch', 'Alpro');
    assert.strictEqual(mFallback.index, 1);
    assert.strictEqual(mFallback.matchType, 'fallback-generic');

    // Partial/extended spec does NOT match 'Oatly' -> falls back to unspecified Milch
    const mPartial = Core.findStoreEntryMatch(storeA.itemOrder, 'Milch', 'Oatly Barista');
    assert.strictEqual(mPartial.index, 1);
    assert.strictEqual(mPartial.matchType, 'fallback-generic');

    // Unspecified shopping item matches ONLY the unspecified entry
    const mGeneric = Core.findStoreEntryMatch(storeA.itemOrder, 'Milch', '');
    assert.strictEqual(mGeneric.index, 1);
    assert.strictEqual(mGeneric.matchType, 'exact-generic');

    // Store has ONLY specified Butter ('Bärenmarke') and NO generic Butter:
    // 1) Unspecified Butter MUST NOT match specified-only Butter -> unknown (-1)
    const mButterGeneric = Core.findStoreEntryMatch(storeA.itemOrder, 'Butter', '');
    assert.strictEqual(mButterGeneric.index, -1);
    assert.strictEqual(mButterGeneric.matchType, 'none');

    // 2) Different spec Butter ('Kerrygold') MUST NOT match 'Bärenmarke' -> unknown (-1)
    const mButterOther = Core.findStoreEntryMatch(storeA.itemOrder, 'Butter', 'Kerrygold');
    assert.strictEqual(mButterOther.index, -1);
    assert.strictEqual(mButterOther.matchType, 'none');

    // Sort shopping list with mixed specs against storeA
    const list = Core.createShoppingList({
      supermarketId: 'spec_store_a',
      items: [
        { id: 'a', name: 'Milch', specification: 'Weihenstephan' }, // pos 5
        { id: 'b', name: 'Milch', specification: 'Alpro' },         // fallback pos 1
        { id: 'c', name: 'Milch', specification: 'Oatly' },         // pos 3
        { id: 'd', name: 'Milch', specification: '' },              // pos 1
        { id: 'e', name: 'Butter', specification: '' },             // unknown (-1) -> beginning!
        { id: 'f', name: 'Brot', specification: '' }                // pos 2
      ]
    });

    const sorted = Core.sortShoppingList(list, storeA);
    assert.deepStrictEqual(
      sorted.uncheckedItems.map((i) => `${i.name}:${i.specification}`),
      [
        'Butter:',               // unknown at beginning
        'Milch:Alpro',           // fallback pos 1 (originalOrder 1)
        'Milch:',                // generic pos 1 (originalOrder 3)
        'Brot:',                 // pos 2
        'Milch:Oatly',           // pos 3
        'Milch:Weihenstephan'    // pos 5
      ]
    );
  });

  // 13. Requirement 1: Coexistence of multiple specs + unspecified in supermarket & deduplication
  await runTest('16. Supermarket itemOrder allows same product with multiple specs and without spec, deduplicates on (name, spec)', () => {
    let store = Core.createSupermarket({
      id: 'multi_spec_store',
      name: 'Multi Spec Markt',
      itemOrder: [
        { name: 'Milch', specification: '' },
        { name: 'Milch', specification: 'Oatly' },
        { name: 'milch', specification: '  oatly  ' }, // duplicate of Milch + Oatly -> deduplicated
        { name: 'Milch', specification: 'Weihenstephan' },
        { name: 'MILCH', specification: '' },          // duplicate of unspecified Milch -> deduplicated
        'Brot'
      ]
    });

    assert.strictEqual(store.itemOrder.length, 4);
    assert.deepStrictEqual(store.itemOrder, [
      { name: 'Milch', specification: '' },
      { name: 'Milch', specification: 'Oatly' },
      { name: 'Milch', specification: 'Weihenstephan' },
      { name: 'Brot', specification: '' }
    ]);

    // Adding another specification via addSupermarketKnownItem preserves existing specs & generic
    store = Core.addSupermarketKnownItem(store, { name: 'Milch', specification: 'Alpro' });
    assert.strictEqual(store.itemOrder.length, 5);
    assert.deepStrictEqual(store.itemOrder[4], { name: 'Milch', specification: 'Alpro' });

    // Moving Milch (Alpro) right after Milch (generic) works (not treated as self-move!)
    const moved = Core.moveSupermarketItemAfter(
      store,
      { name: 'Milch', specification: 'Alpro' },
      { name: 'Milch', specification: '' }
    );
    assert.strictEqual(moved.foundPrevious, true);
    assert.strictEqual(moved.insertedAtIndex, 1);
    assert.deepStrictEqual(moved.itemOrder[0], { name: 'Milch', specification: '' });
    assert.deepStrictEqual(moved.itemOrder[1], { name: 'Milch', specification: 'Alpro' });
    store = moved;

    // Removing Milch (Oatly) leaves generic Milch, Alpro, and Weihenstephan intact
    store = Core.removeSupermarketKnownItem(store, 'Milch', 'Oatly');
    assert.strictEqual(store.itemOrder.length, 4);
    assert.strictEqual(Core.findExactStoreEntryIndex(store.itemOrder, 'Milch', 'Oatly'), -1);
    assert.notStrictEqual(Core.findExactStoreEntryIndex(store.itemOrder, 'Milch', ''), -1);
    assert.notStrictEqual(Core.findExactStoreEntryIndex(store.itemOrder, 'Milch', 'Alpro'), -1);
    assert.notStrictEqual(Core.findExactStoreEntryIndex(store.itemOrder, 'Milch', 'Weihenstephan'), -1);

    // Updating a store entry's specification via updateSupermarketKnownItem
    const alproIdx = Core.findExactStoreEntryIndex(store.itemOrder, 'Milch', 'Alpro');
    store = Core.updateSupermarketKnownItem(store, alproIdx, { specification: 'Alpro Barista' });
    assert.deepStrictEqual(store.itemOrder[alproIdx], {
      name: 'Milch',
      specification: 'Alpro Barista'
    });

    // Updating a shopping list item's specification via updateItemInList immediately re-sorts
    let list = Core.createShoppingList({
      supermarketId: store.id,
      items: [
        { id: 'item_b', name: 'Brot' },
        { id: 'item_m', name: 'Milch', specification: 'Weihenstephan' }
      ]
    });
    // Initially Milch (Weihenstephan) is at index 2, Brot is at index 3
    assert.deepStrictEqual(
      Core.sortShoppingList(list, store).uncheckedItems.map((i) => i.id),
      ['item_m', 'item_b']
    );
    // Change Milch spec to Alpro Barista (index 1) -> stays before Brot, matched as exact-spec at pos 1
    list = Core.updateItemInList(list, store, 'item_m', { specification: 'Alpro Barista' });
    const updatedItem = list.items.find((i) => i.id === 'item_m');
    assert.strictEqual(updatedItem.specification, 'Alpro Barista');
    assert.strictEqual(updatedItem.storePosition, 1);
    assert.strictEqual(updatedItem.storeMatchType, 'exact-spec');
  });

  // 14. Requirement 2: Unknown items placed at beginning of shopping list & sorted properly after checking off
  await runTest('17. Unknown items appear at BEGINNING of unchecked list, sort properly when checked off, and do not falsely trigger live optimization', () => {
    const rewe = Core.getDefaultSupermarkets().find((s) => s.id === 'rewe');
    let list = Core.createShoppingList({
      supermarketId: 'rewe',
      liveOptimizationEnabled: true,
      items: [
        { id: 'k2', name: 'Toilettenpapier', checked: false }, // known, late in REWE
        { id: 'u1', name: 'Trüffelöl', checked: false },        // unknown
        { id: 'k1', name: 'Äpfel', checked: false },            // known, pos 0 in REWE
        { id: 'u2', name: 'Matcha-Pulver', specification: 'Bio', checked: false } // unknown
      ]
    });

    // Unchecked unknown items MUST be at the very beginning before known items (preserving originalOrder)
    const initial = Core.sortShoppingList(list, rewe);
    assert.deepStrictEqual(
      initial.uncheckedItems.map((i) => i.name),
      ['Trüffelöl', 'Matcha-Pulver', 'Äpfel', 'Toilettenpapier']
    );
    assert.strictEqual(initial.unknownItems.length, 2);
    assert.strictEqual(initial.uncheckedItems[0].isUnknownInStore, true);
    assert.strictEqual(initial.uncheckedItems[2].isUnknownInStore, false);

    // Checking off the first KNOWN item ('Äpfel') while unknown items sit at the top must NOT falsely trigger live optimization
    const checkKnownFirst = Core.toggleItemCheck(list, rewe, 'k1');
    assert.strictEqual(checkKnownFirst.action, 'checked');
    assert.strictEqual(checkKnownFirst.outOfOrderDetected, false);
    list = checkKnownFirst.list;

    // Now check off unknown item 'Trüffelöl' -> moves into checkedItems section (not stuck in uncheckedItems)
    const checkUnknown = Core.toggleItemCheck(list, rewe, 'u1');
    assert.strictEqual(checkUnknown.action, 'checked');
    assert.strictEqual(checkUnknown.outOfOrderDetected, false);
    list = checkUnknown.list;

    const afterCheck = Core.sortShoppingList(list, rewe);
    assert.deepStrictEqual(
      afterCheck.checkedItems.map((i) => i.name),
      ['Äpfel', 'Trüffelöl']
    );
    assert.deepStrictEqual(
      afterCheck.uncheckedItems.map((i) => i.name),
      ['Matcha-Pulver', 'Toilettenpapier']
    );
    assert.deepStrictEqual(
      afterCheck.sortedItems.map((i) => i.name),
      ['Äpfel', 'Trüffelöl', 'Matcha-Pulver', 'Toilettenpapier']
    );

    // Uncheck 'Trüffelöl' -> returns to the BEGINNING of uncheckedItems
    const uncheckUnknown = Core.toggleItemCheck(list, rewe, 'u1');
    assert.strictEqual(uncheckUnknown.action, 'unchecked');
    const afterUncheck = Core.sortShoppingList(uncheckUnknown.list, rewe);
    assert.deepStrictEqual(
      afterUncheck.uncheckedItems.map((i) => i.name),
      ['Trüffelöl', 'Matcha-Pulver', 'Toilettenpapier']
    );

    // Checking a known item OUT OF ORDER while an unknown item is present only reports skipped KNOWN items
    const listOutOfOrder = Core.createShoppingList({
      supermarketId: 'rewe',
      liveOptimizationEnabled: true,
      items: [
        { id: 'u_x', name: 'Spezialgewürz', checked: false },
        { id: 'k_a', name: 'Äpfel', checked: false },
        { id: 'k_m', name: 'Milch', checked: false }
      ]
    });
    const oooRes = Core.toggleItemCheck(listOutOfOrder, rewe, 'k_m');
    assert.strictEqual(oooRes.outOfOrderDetected, true);
    assert.deepStrictEqual(
      oooRes.skippedItems.map((i) => i.name),
      ['Äpfel']
    );
  });

  // 15. Requirement 2: Adding an unknown shopping list item (with optional specification) to a supermarket
  await runTest('18. addItemToSupermarket adds unknown item (including specification) to supermarket and re-sorts list', () => {
    let store = Core.createSupermarket({
      id: 'longpress_store',
      name: 'Testmarkt',
      itemOrder: ['Äpfel', 'Brot', 'Nudeln']
    });

    let list = Core.createShoppingList({
      supermarketId: store.id,
      items: [
        { id: 'i1', name: 'Äpfel' },
        { id: 'i2', name: 'Haferdrink', specification: 'Oatly Barista' },
        { id: 'i3', name: 'Nudeln' }
      ]
    });

    // Initially Haferdrink (Oatly Barista) is unknown -> placed at beginning of unchecked list
    const before = Core.sortShoppingList(list, store);
    assert.deepStrictEqual(
      before.uncheckedItems.map((i) => i.name),
      ['Haferdrink', 'Äpfel', 'Nudeln']
    );
    assert.strictEqual(before.uncheckedItems[0].isUnknownInStore, true);

    // Long-press action: add unknown item (with specification) to supermarket
    const targetItem = before.uncheckedItems[0];
    const addRes = Core.addItemToSupermarket(store, targetItem, { list });
    assert.strictEqual(addRes.added, true);
    assert.strictEqual(addRes.alreadyExists, false);
    assert.deepStrictEqual(addRes.entry, { name: 'Haferdrink', specification: 'Oatly Barista' });
    assert.strictEqual(addRes.index, 3);
    store = addRes.supermarket;
    list = addRes.list;

    // Now Haferdrink (Oatly Barista) is known at pos 3 (after Nudeln pos 2)
    const afterAdd = Core.sortShoppingList(list, store);
    assert.strictEqual(afterAdd.unknownItems.length, 0);
    assert.deepStrictEqual(
      afterAdd.uncheckedItems.map((i) => i.name),
      ['Äpfel', 'Nudeln', 'Haferdrink']
    );

    // Calling addItemToSupermarket again for the exact same (name, spec) is idempotent
    const dupRes = Core.addItemToSupermarket(store, targetItem, { list });
    assert.strictEqual(dupRes.added, false);
    assert.strictEqual(dupRes.alreadyExists, true);
    assert.strictEqual(dupRes.supermarket.itemOrder.length, 4);

    // User can manually sort the newly added item right after 'Äpfel' as usual
    store = Core.moveSupermarketItemAfter(store, addRes.index, 'Äpfel');
    const afterManualSort = Core.sortShoppingList(list, store);
    assert.deepStrictEqual(
      afterManualSort.uncheckedItems.map((i) => i.name),
      ['Äpfel', 'Haferdrink', 'Nudeln']
    );

    // Adding a second specification of Haferdrink coexists without replacing 'Oatly Barista'
    const secondSpecRes = Core.addItemToSupermarket(store, {
      name: 'Haferdrink',
      specification: 'Alpro'
    });
    assert.strictEqual(secondSpecRes.added, true);
    assert.strictEqual(secondSpecRes.supermarket.itemOrder.length, 5);
  });

  // 16. Requirement 1: Storage backward compatibility & migration for legacy data without specifications
  await runTest('19. LocalStorageRepository migrates legacy stored data lacking specification and persists specifications losslessly', () => {
    const mem = Core.createMemoryStorage();

    // Seed legacy v1 data without any `specification` fields (plain string[] itemOrder & legacy items)
    mem.setItem(
      Core.STORAGE_KEYS.SUPERMARKETS,
      JSON.stringify([
        {
          id: 'legacy_rewe',
          name: 'Legacy REWE',
          icon: '🔴',
          color: '#cc071e',
          itemOrder: ['Äpfel', 'Milch', 'Brot']
        }
      ])
    );
    mem.setItem(
      Core.STORAGE_KEYS.LISTS,
      JSON.stringify([
        {
          id: 'legacy_list_1',
          name: 'Alter Zettel',
          supermarketId: 'legacy_rewe',
          liveOptimizationEnabled: true,
          items: [
            { id: 'old_1', name: 'Brot', quantity: '1x', checked: false },
            { id: 'old_2', name: 'Äpfel', quantity: '4 Stk.', checked: false }
          ]
        }
      ])
    );
    mem.setItem(Core.STORAGE_KEYS.ACTIVE_LIST_ID, 'legacy_list_1');

    const repo = new Core.LocalStorageRepository(mem);
    const stores = repo.loadSupermarkets();
    assert.strictEqual(stores.length, 1);
    assert.deepStrictEqual(stores[0].itemOrder, [
      { name: 'Äpfel', specification: '' },
      { name: 'Milch', specification: '' },
      { name: 'Brot', specification: '' }
    ]);

    const activeList = repo.getActiveList();
    assert.strictEqual(activeList.name, 'Alter Zettel');
    assert.deepStrictEqual(
      activeList.items.map((i) => ({ name: i.name, specification: i.specification })),
      [
        { name: 'Äpfel', specification: '' },
        { name: 'Brot', specification: '' }
      ]
    );

    // Now persist multi-spec store entries & specified shopping list items and reload in a fresh repo
    let updatedStore = Core.addSupermarketKnownItem(stores[0], {
      name: 'Milch',
      specification: 'Weihenstephan'
    });
    repo.upsertSupermarket(updatedStore);

    const added = Core.addItemToList(activeList, updatedStore, {
      name: 'Milch',
      specification: 'Weihenstephan',
      quantity: '2L'
    });
    repo.saveActiveList(added.list);

    // Duplicate list should preserve specifications too
    const dupList = repo.duplicateShoppingList(added.list.id, 'Kopie mit Marke');
    const dupMilch = dupList.items.find((i) => i.name === 'Milch');
    assert.strictEqual(dupMilch.specification, 'Weihenstephan');

    // Fresh repository instance reads everything back cleanly
    const repoFresh = new Core.LocalStorageRepository(mem);
    const reloadedStore = repoFresh.getSupermarketById('legacy_rewe');
    assert.deepStrictEqual(reloadedStore.itemOrder, [
      { name: 'Äpfel', specification: '' },
      { name: 'Milch', specification: '' },
      { name: 'Brot', specification: '' },
      { name: 'Milch', specification: 'Weihenstephan' }
    ]);
    const reloadedList = repoFresh.getActiveList();
    const reloadedMilch = reloadedList.items.find((i) => i.name === 'Milch');
    assert.strictEqual(reloadedMilch.specification, 'Weihenstephan');
    assert.strictEqual(reloadedMilch.normalizedSpecification, 'weihenstephan');
    assert.strictEqual(reloadedMilch.storePosition, 3);
  });

  console.log('\n====================================================');
  console.log(`Result: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main();
