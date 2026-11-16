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

  // 8. Supermarket Creation with Sorting Template (getDefaultItemOrder & createSupermarketWithSorting)
  await runTest('11. getDefaultItemOrder & createSupermarketWithSorting adopt either default sorting or an existing store sorting', () => {
    const stores = Core.getDefaultSupermarkets();
    const rewe = stores.find((s) => s.id === 'rewe');
    const aldi = stores.find((s) => s.id === 'aldi');

    const defaultOrder = Core.getDefaultItemOrder();
    assert.deepStrictEqual(defaultOrder, rewe.itemOrder);
    // Ensure it returns a fresh copy
    defaultOrder.push('Test-Mutation');
    assert.notStrictEqual(defaultOrder.length, rewe.itemOrder.length);

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
    assert.strictEqual(HoferAldi.itemOrder[0], 'Brötchen'); // ALDI starts with Brötchen
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
    assert.deepStrictEqual(res1.itemOrder, [
      'Äpfel',
      'Bananen',
      'Mango',
      'Brötchen',
      'Milch',
      'Nudeln'
    ]);
    assert.strictEqual(res1.supermarket, res1);
    store = res1;

    // 2) Insert 'Blumenstrauß' at the very beginning ('__START__')
    const res2 = Core.addSupermarketKnownItemAfter(store, 'Blumenstrauß', '__START__');
    assert.strictEqual(res2.foundPrevious, true);
    assert.strictEqual(res2.insertedAtIndex, 0);
    assert.strictEqual(res2.itemOrder[0], 'Blumenstrauß');
    store = res2;

    // 3) Append 'Kaugummi' at the end when previousItemName is empty
    const res3 = Core.addSupermarketKnownItemAfter(store, 'Kaugummi', '');
    assert.strictEqual(res3.foundPrevious, false);
    assert.strictEqual(res3.insertedAtIndex, store.itemOrder.length);
    assert.strictEqual(res3.itemOrder[res3.itemOrder.length - 1], 'Kaugummi');
    store = res3;

    // 4) Move existing item 'Nudeln' so it stands immediately after 'Brötchen'
    const res4 = Core.moveSupermarketItemAfter(store, 'Nudeln', 'Brötchen');
    assert.strictEqual(res4.foundPrevious, true);
    const broetchenIdx = Core.indexOfNormalized(res4.itemOrder, 'Brötchen');
    assert.strictEqual(res4.insertedAtIndex, broetchenIdx + 1);
    assert.strictEqual(res4.itemOrder[broetchenIdx + 1], 'Nudeln');
    store = res4;

    // 5) Move item by index to '__START__'
    const milchIdx = Core.indexOfNormalized(store.itemOrder, 'Milch');
    const res5 = Core.moveSupermarketItemAfter(store, milchIdx, '__START__');
    assert.strictEqual(res5.foundPrevious, true);
    assert.strictEqual(res5.insertedAtIndex, 0);
    assert.strictEqual(res5.itemOrder[0], 'Milch');
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

  console.log('\n====================================================');
  console.log(`Result: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main();
