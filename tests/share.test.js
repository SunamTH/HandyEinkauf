/**
 * SmartCart Core - File-Only ShareService Unit Tests
 * Run via: `node tests/share.test.js`
 */
'use strict';

const assert = require('assert');

require('../src/core/models.js');
require('../src/core/optimizer.js');
require('../src/core/share.js');

const Core = globalThis.SmartCartCore;
const Share = Core.ShareService;

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
  console.log('📁 SmartCart File-Only ShareService Test Suite');
  console.log('====================================================\n');

  await runTest('1. All legacy non-file sharing APIs are completely removed', () => {
    const removedApis = [
      'SHARE_PREFIX',
      'formatListAsPlainText',
      'encodeShareCode',
      'decodeShareCode',
      'shareViaWebApi',
      'exportShoppingList',
      'exportSupermarket',
      'exportFullBackup',
      'downloadJsonFile'
    ];
    for (const api of removedApis) {
      assert.strictEqual(Share[api], undefined, `ShareService.${api} must be removed`);
      assert.strictEqual(Core[api], undefined, `SmartCartCore.${api} must be removed`);
    }

    assert.strictEqual(Share.FILE_EXTENSION, '.smartcart.json');
    assert.strictEqual(Share.FILE_MIME_TYPE, 'application/json');
    assert.ok(Share.ACCEPTED_FILE_TYPES.includes('.smartcart.json'));
    assert.ok(Share.ACCEPTED_FILE_TYPES.includes('.json'));
  });

  await runTest('2. buildShoppingListFilename sanitizes German umlauts & special chars', () => {
    const fixedDate = new Date('2026-11-20T12:00:00Z');
    assert.strictEqual(
      Share.buildShoppingListFilename({ name: 'Bäcker & Käse (Süß)' }, fixedDate),
      'SmartCart_Baecker_Kaese_Suess_2026-11-20.smartcart.json'
    );
    assert.strictEqual(
      Share.buildShoppingListFilename({ name: '   ' }, fixedDate),
      'SmartCart_Einkaufsliste_2026-11-20.smartcart.json'
    );
    assert.strictEqual(
      Share.buildShoppingListFilename({ name: 'Wocheneinkauf / REWE!' }, fixedDate),
      'SmartCart_Wocheneinkauf_REWE_2026-11-20.smartcart.json'
    );
  });

  await runTest('3. serializeShoppingList & parseShoppingListFileContent preserve all fields including specifications & checked states', () => {
    const rewe = Core.getDefaultSupermarkets().find((s) => s.id === 'rewe');
    const checkedTs = 1732100000000;
    const list = Core.createShoppingList({
      id: 'list_roundtrip',
      name: 'Wocheneinkauf Müller',
      supermarketId: 'rewe',
      liveOptimizationEnabled: false,
      items: [
        {
          id: 'i1',
          name: 'Milch',
          specification: 'Weihenstephan 3,5%',
          quantity: '2L',
          checked: false,
          originalOrder: 0
        },
        {
          id: 'i2',
          name: 'Milch',
          specification: 'Alpro Hafer Barista',
          quantity: '1L',
          checked: true,
          checkedAt: checkedTs,
          originalOrder: 1
        },
        {
          id: 'i3',
          name: 'Milch',
          specification: '',
          quantity: '1x',
          checked: false,
          addedLateOverride: true,
          originalOrder: 2
        },
        {
          id: 'i4',
          name: 'Drachenfrucht',
          specification: 'Bio Fairtrade',
          quantity: '3 Stk.',
          checked: false,
          originalOrder: 3
        }
      ]
    });

    const exported = Share.serializeShoppingList(list, rewe, {
      date: new Date('2026-11-20T00:00:00Z'),
      exportedAt: 1732134000000
    });

    assert.strictEqual(exported.payload.app, 'SmartCart');
    assert.strictEqual(exported.payload.format, 'smartcart-shopping-list');
    assert.strictEqual(exported.payload.version, 2);
    assert.strictEqual(exported.payload.type, 'shopping_list');
    assert.strictEqual(exported.filename, 'SmartCart_Wocheneinkauf_Mueller_2026-11-20.smartcart.json');
    assert.strictEqual(exported.payload.supermarket.name, 'REWE');

    // Parse back with leading UTF-8 BOM
    const parsed = Share.parseShoppingListFileContent(`\uFEFF${exported.json}`);
    assert.strictEqual(parsed.valid, true);
    assert.strictEqual(parsed.version, 2);
    assert.strictEqual(parsed.exportedAt, 1732134000000);
    assert.strictEqual(parsed.list.name, 'Wocheneinkauf Müller');
    assert.strictEqual(parsed.list.supermarketId, 'rewe');
    assert.strictEqual(parsed.list.liveOptimizationEnabled, false);
    assert.strictEqual(parsed.list.items.length, 4);

    assert.strictEqual(parsed.list.items[0].name, 'Milch');
    assert.strictEqual(parsed.list.items[0].specification, 'Weihenstephan 3,5%');
    assert.strictEqual(parsed.list.items[0].normalizedSpecification, 'weihenstephan 3,5%');
    assert.strictEqual(parsed.list.items[0].quantity, '2L');
    assert.strictEqual(parsed.list.items[0].checked, false);

    assert.strictEqual(parsed.list.items[1].specification, 'Alpro Hafer Barista');
    assert.strictEqual(parsed.list.items[1].checked, true);
    assert.strictEqual(parsed.list.items[1].checkedAt, checkedTs);

    assert.strictEqual(parsed.list.items[2].specification, '');
    assert.strictEqual(parsed.list.items[2].addedLateOverride, true);

    assert.strictEqual(parsed.list.items[3].name, 'Drachenfrucht');
    assert.strictEqual(parsed.list.items[3].specification, 'Bio Fairtrade');
    assert.strictEqual(parsed.list.items[3].quantity, '3 Stk.');
  });

  await runTest('4. parseShoppingListFileContent handles empty lists and v1 files without specification field', () => {
    const emptyRes = Share.parseShoppingListFileContent(
      JSON.stringify({
        app: 'SmartCart',
        version: 2,
        type: 'shopping_list',
        list: { name: 'Leere Liste', supermarketId: 'aldi', items: [] }
      })
    );
    assert.strictEqual(emptyRes.valid, true);
    assert.strictEqual(emptyRes.list.name, 'Leere Liste');
    assert.strictEqual(emptyRes.list.items.length, 0);

    // v1 export lacking specification on items and string[] on supermarket.itemOrder
    const v1Json = JSON.stringify({
      app: 'SmartCart',
      version: 1,
      type: 'shopping_list',
      list: {
        name: 'Alte Liste',
        supermarketId: 'lidl',
        items: [
          { id: 'old_1', name: 'Äpfel', quantity: '4 Stk.', checked: false },
          { id: 'old_2', name: 'Butter', quantity: '250g', checked: true }
        ]
      },
      supermarket: {
        id: 'lidl',
        name: 'LIDL',
        itemOrder: ['Äpfel', 'Butter']
      }
    });

    const v1Res = Share.parseShoppingListFileContent(v1Json);
    assert.strictEqual(v1Res.valid, true);
    assert.strictEqual(v1Res.version, 1);
    assert.strictEqual(v1Res.list.items.length, 2);
    assert.strictEqual(v1Res.list.items[0].specification, '');
    assert.strictEqual(v1Res.list.items[1].checked, true);
    assert.strictEqual(v1Res.supermarketMeta.name, 'LIDL');
    assert.ok(v1Res.supermarket);
    assert.deepStrictEqual(v1Res.supermarket.itemOrder[0], { name: 'Äpfel', specification: '' });
  });

  await runTest('5. parseShoppingListFileContent rejects legacy SC1 codes, malformed JSON, wrong app/type & corrupt items', () => {
    // Legacy SC1 share code MUST be rejected
    const sc1Res = Share.parseShoppingListFileContent('SC1:eyJhcHAiOiJTbWFydENhcnQifQ==');
    assert.strictEqual(sc1Res.valid, false);
    assert.ok(sc1Res.error && sc1Res.error.length > 0);

    const badInputs = [
      null,
      undefined,
      123,
      '',
      '   ',
      '{not valid json',
      '[]',
      '"hello"',
      'null',
      JSON.stringify({ app: 'OtherApp', type: 'shopping_list', list: { items: [] } }),
      JSON.stringify({ app: 'SmartCart', type: 'backup', lists: [] }),
      JSON.stringify({ app: 'SmartCart', type: 'supermarket', supermarket: { name: 'REWE' } }),
      JSON.stringify({ app: 'SmartCart', type: 'shopping_list' }),
      JSON.stringify({ app: 'SmartCart', type: 'shopping_list', list: { items: 'not-array' } }),
      JSON.stringify({ app: 'SmartCart', type: 'shopping_list', list: { name: 42, items: [] } }),
      JSON.stringify({ app: 'SmartCart', type: 'shopping_list', list: { items: [null] } }),
      JSON.stringify({ app: 'SmartCart', type: 'shopping_list', list: { items: [{ name: '' }] } }),
      JSON.stringify({ app: 'SmartCart', type: 'shopping_list', list: { items: [{ name: 'Milch', specification: 999 }] } }),
      JSON.stringify({ app: 'SmartCart', type: 'shopping_list', list: { items: [{ name: 'Milch', checked: 'yes' }] } }),
      JSON.stringify({ app: 'SmartCart', type: 'shopping_list', list: { items: [{ name: 'Milch', quantity: { bad: true } }] } })
    ];

    for (const input of badInputs) {
      const res = Share.parseShoppingListFileContent(input);
      assert.strictEqual(res.valid, false, `Expected invalid for input: ${String(input)}`);
      assert.ok(typeof res.error === 'string' && res.error.length > 0);
    }
  });

  await runTest('6. readShoppingListFile validates File objects (valid, empty, oversized, corrupt, missing)', async () => {
    const missing = await Share.readShoppingListFile(null);
    assert.strictEqual(missing.valid, false);

    const empty = await Share.readShoppingListFile({ name: 'empty.json', size: 0, text: async () => '' });
    assert.strictEqual(empty.valid, false);
    assert.ok(empty.error.includes('leer'));

    const tooBig = await Share.readShoppingListFile({
      name: 'huge.json',
      size: Share.MAX_IMPORT_FILE_BYTES + 1,
      text: async () => '{}'
    });
    assert.strictEqual(tooBig.valid, false);
    assert.ok(tooBig.error.includes('groß'));

    const sampleList = Core.createShoppingList({
      name: 'Picknick',
      items: [{ name: 'Käse', specification: 'Bergkäse', quantity: '200g' }]
    });
    const { json, filename } = Share.serializeShoppingList(sampleList);
    const mockFile = {
      name: filename,
      size: Buffer.byteLength(json, 'utf8'),
      text: async () => json
    };

    const readRes = await Share.readShoppingListFile(mockFile);
    assert.strictEqual(readRes.valid, true);
    assert.strictEqual(readRes.filename, filename);
    assert.strictEqual(readRes.list.name, 'Picknick');
    assert.strictEqual(readRes.list.items[0].specification, 'Bergkäse');

    // Also test FileReader fallback when file.text() is unavailable
    const origFileReader = globalThis.FileReader;
    try {
      globalThis.FileReader = class MockFileReader {
        readAsText(f) {
          this.result = f._raw;
          if (this.onload) this.onload();
        }
      };
      const legacyFile = {
        name: filename,
        size: Buffer.byteLength(json, 'utf8'),
        _raw: json
      };
      const legacyRes = await Share.readShoppingListFile(legacyFile);
      assert.strictEqual(legacyRes.valid, true);
      assert.strictEqual(legacyRes.list.items[0].specification, 'Bergkäse');
    } finally {
      if (origFileReader !== undefined) {
        globalThis.FileReader = origFileReader;
      } else {
        delete globalThis.FileReader;
      }
    }
  });

  await runTest('7. applyImportedShoppingList supports new, merge (spec-aware dedup), and replace modes cleanly', () => {
    const stores = Core.getDefaultSupermarkets();
    const rewe = stores.find((s) => s.id === 'rewe');
    const aldi = stores.find((s) => s.id === 'aldi');

    const existingList = Core.createShoppingList({
      id: 'list_local',
      name: 'Wocheneinkauf',
      supermarketId: 'rewe',
      items: [
        { id: 'loc_1', name: 'Milch', specification: 'Weihenstephan', quantity: '1L', checked: false },
        { id: 'loc_2', name: 'Äpfel', specification: '', quantity: '4 Stk.', checked: false }
      ]
    });

    const importedList = Core.createShoppingList({
      id: 'list_remote',
      name: 'Wocheneinkauf',
      supermarketId: 'unknown_store_id',
      items: [
        { id: 'rem_1', name: 'Milch', specification: 'Weihenstephan', quantity: '2L', checked: false }, // duplicate of loc_1
        { id: 'rem_2', name: 'Milch', specification: 'Alpro', quantity: '1L', checked: false }, // DIFFERENT spec -> must be added!
        { id: 'rem_3', name: 'Milch', specification: '', quantity: '1L', checked: false }, // NO spec -> must be added!
        { id: 'rem_4', name: 'Trüffelöl', specification: 'Alba', quantity: '1 Fl.', checked: false } // unknown item -> placed at top!
      ]
    });

    // Mode 1: 'new' -> matches ALDI by supermarketMeta.name, disambiguates duplicate list name, fresh IDs, sorts unknown at top
    const newRes = Share.applyImportedShoppingList(importedList, {
      mode: 'new',
      existingLists: [existingList],
      supermarkets: stores,
      supermarketMeta: { id: 'unknown_store_id', name: 'ALDI' }
    });
    assert.strictEqual(newRes.mode, 'new');
    assert.strictEqual(newRes.supermarket.id, aldi.id);
    assert.strictEqual(newRes.list.supermarketId, 'aldi');
    assert.strictEqual(newRes.list.name, 'Wocheneinkauf (Import)');
    assert.notStrictEqual(newRes.list.id, importedList.id);
    assert.strictEqual(newRes.addedCount, 4);
    // Unknown item 'Trüffelöl' must be sorted at the beginning of unchecked items
    assert.strictEqual(newRes.list.items[0].name, 'Trüffelöl');
    assert.strictEqual(newRes.list.items[0].specification, 'Alba');

    // Mode 2: 'merge' -> deduplicates by (name, specification), keeping different specs separate!
    const mergeRes = Share.applyImportedShoppingList(importedList, {
      mode: 'merge',
      targetList: existingList,
      supermarkets: stores
    });
    assert.strictEqual(mergeRes.mode, 'merge');
    assert.strictEqual(mergeRes.list.id, existingList.id);
    assert.strictEqual(mergeRes.supermarket.id, rewe.id);
    assert.strictEqual(mergeRes.skippedCount, 1); // Milch (Weihenstephan) skipped
    assert.strictEqual(mergeRes.addedCount, 3); // Milch (Alpro), Milch (''), Trüffelöl (Alba) added
    assert.strictEqual(mergeRes.list.items.length, 5);
    assert.strictEqual(mergeRes.list.items[0].name, 'Trüffelöl'); // unknown at top

    // Mode 3: 'replace' -> replaces target list's items while keeping target ID
    const replaceRes = Share.applyImportedShoppingList(importedList, {
      mode: 'replace',
      targetList: existingList,
      supermarkets: stores,
      fallbackSupermarketId: 'rewe',
      keepTargetName: true
    });
    assert.strictEqual(replaceRes.mode, 'replace');
    assert.strictEqual(replaceRes.list.id, existingList.id);
    assert.strictEqual(replaceRes.list.name, 'Wocheneinkauf');
    assert.strictEqual(replaceRes.list.supermarketId, 'rewe');
    assert.strictEqual(replaceRes.list.items.length, 4);
    assert.strictEqual(replaceRes.addedCount, 4);
  });

  await runTest('8. saveShoppingListFile works via browser download and Capacitor Filesystem', async () => {
    const list = Core.createShoppingList({
      name: 'Samstagseinkauf',
      items: [{ name: 'Brot', specification: 'Roggen', quantity: '1x' }]
    });

    // Invalid input
    const badRes = await Share.saveShoppingListFile(null);
    assert.strictEqual(badRes.success, false);
    assert.strictEqual(badRes.method, 'invalid');

    // Mock browser DOM download (including Blob/URL for Node 12)
    const origDocument = globalThis.document;
    const origBlob = globalThis.Blob;
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    let clickedAnchor = null;
    let capturedBlobContent = null;
    try {
      globalThis.Blob = class MockBlob {
        constructor(parts, opts) {
          this.parts = parts;
          this.type = (opts && opts.type) || '';
          capturedBlobContent = parts.join('');
        }
      };
      URL.createObjectURL = () => 'blob:mock-smartcart-url';
      URL.revokeObjectURL = () => {};
      globalThis.document = {
        createElement: (tag) => {
          assert.strictEqual(tag, 'a');
          return {
            href: '',
            download: '',
            style: {},
            click() {
              clickedAnchor = this;
            }
          };
        },
        body: {
          appendChild() {},
          removeChild() {}
        }
      };

      const dlRes = await Share.saveShoppingListFile(list);
      assert.strictEqual(dlRes.success, true);
      assert.strictEqual(dlRes.method, 'browser-download');
      assert.ok(dlRes.filename.endsWith('.smartcart.json'));
      assert.ok(clickedAnchor);
      assert.strictEqual(clickedAnchor.download, dlRes.filename);
      assert.strictEqual(clickedAnchor.href, 'blob:mock-smartcart-url');
      assert.strictEqual(Share.parseShoppingListFileContent(capturedBlobContent).list.items[0].specification, 'Roggen');
    } finally {
      globalThis.document = origDocument;
      if (origBlob !== undefined) {
        globalThis.Blob = origBlob;
      } else {
        delete globalThis.Blob;
      }
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }

    // Mock Capacitor native Filesystem
    const origCap = globalThis.Capacitor;
    let writtenArgs = null;
    try {
      globalThis.Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          Filesystem: {
            writeFile: async (args) => {
              writtenArgs = args;
              return { uri: `file:///documents/${args.path}` };
            }
          }
        }
      };

      const capRes = await Share.saveShoppingListFile(list);
      assert.strictEqual(capRes.success, true);
      assert.strictEqual(capRes.method, 'capacitor-filesystem');
      assert.strictEqual(writtenArgs.directory, 'DOCUMENTS');
      assert.strictEqual(writtenArgs.encoding, 'utf8');
      assert.ok(capRes.uri.endsWith('.smartcart.json'));
      const parsedBack = Share.parseShoppingListFileContent(writtenArgs.data);
      assert.strictEqual(parsedBack.valid, true);
      assert.strictEqual(parsedBack.list.items[0].specification, 'Roggen');
    } finally {
      globalThis.Capacitor = origCap;
    }
  });

  await runTest('9. shareShoppingListFile uses Web Share API files, Capacitor Share, handles abort & graceful fallback (never clipboard/text)', async () => {
    const list = Core.createShoppingList({
      name: 'Grillparty',
      items: [{ name: 'Würstchen', specification: 'Nürnberger', quantity: '2 Pck.' }]
    });

    const origNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const origCap = globalThis.Capacitor;
    const origDocument = globalThis.document;
    const origBlob = globalThis.Blob;
    const origFile = globalThis.File;
    const origCreateObjectURL = URL.createObjectURL;

    const setNavigator = (val) => {
      Object.defineProperty(globalThis, 'navigator', {
        value: val,
        configurable: true,
        writable: true
      });
    };

    try {
      delete globalThis.Capacitor;

      globalThis.Blob = class MockBlob {
        constructor(parts, opts) {
          this._text = parts.join('');
          this.type = (opts && opts.type) || '';
          this.size = Buffer.byteLength(this._text, 'utf8');
        }
        async text() {
          return this._text;
        }
      };
      globalThis.File = class MockFile extends globalThis.Blob {
        constructor(parts, name, opts) {
          super(parts, opts);
          this.name = name;
        }
      };

      // Case A: Web Share API Level 2 supports application/json File sharing
      let sharedPayload = null;
      let clipboardTouched = false;
      setNavigator({
        canShare: ({ files }) => Array.isArray(files) && files.length === 1 && files[0].type === 'application/json',
        share: async (data) => {
          sharedPayload = data;
        },
        clipboard: {
          writeText: async () => {
            clipboardTouched = true;
          }
        }
      });

      const capInfo = Share.canShareShoppingListFiles();
      assert.strictEqual(capInfo.supported, true);
      assert.strictEqual(capInfo.method, 'web-share-file');
      assert.strictEqual(capInfo.mimeType, 'application/json');

      const webRes = await Share.shareShoppingListFile(list);
      assert.strictEqual(webRes.success, true);
      assert.strictEqual(webRes.method, 'web-share-file');
      assert.strictEqual(clipboardTouched, false);
      assert.ok(Array.isArray(sharedPayload.files) && sharedPayload.files.length === 1);
      assert.strictEqual(sharedPayload.text, undefined, 'Must NOT share plain text payload');
      assert.ok(sharedPayload.files[0].name.endsWith('.smartcart.json'));
      const sharedText = await sharedPayload.files[0].text();
      assert.strictEqual(Share.parseShoppingListFileContent(sharedText).list.items[0].specification, 'Nürnberger');

      // Case A2: Browser Web Share accepts text/plain MIME for .smartcart.json file
      let plainSharedPayload = null;
      setNavigator({
        canShare: ({ files }) => Array.isArray(files) && files.length === 1 && files[0].type === 'text/plain',
        share: async (data) => {
          plainSharedPayload = data;
        }
      });
      const plainCap = Share.canShareShoppingListFiles();
      assert.strictEqual(plainCap.supported, true);
      assert.strictEqual(plainCap.mimeType, 'text/plain');
      const plainShareRes = await Share.shareShoppingListFile(list);
      assert.strictEqual(plainShareRes.success, true);
      assert.strictEqual(plainShareRes.method, 'web-share-file');
      assert.strictEqual(plainSharedPayload.files[0].type, 'text/plain');
      assert.ok(plainSharedPayload.files[0].name.endsWith('.smartcart.json'));

      // Case B: User cancels Web Share dialog -> aborted (no fallback download)
      setNavigator({
        canShare: ({ files }) => Array.isArray(files) && files.length === 1,
        share: async () => {
          const err = new Error('Share canceled');
          err.name = 'AbortError';
          throw err;
        }
      });
      const abortRes = await Share.shareShoppingListFile(list, null, { fallbackToSave: true });
      assert.strictEqual(abortRes.success, false);
      assert.strictEqual(abortRes.aborted, true);
      assert.strictEqual(abortRes.method, 'aborted');

      // Case C: Browser does NOT support file sharing (`canShare` returns false)
      setNavigator({
        canShare: () => false,
        share: async () => {
          throw new Error('Should not be called when canShare returns false!');
        },
        clipboard: {
          writeText: async () => {
            clipboardTouched = true;
          }
        }
      });
      assert.strictEqual(Share.canShareShoppingListFiles().supported, false);

      const unsupRes = await Share.shareShoppingListFile(list);
      assert.strictEqual(unsupRes.success, false);
      assert.strictEqual(unsupRes.supported, false);
      assert.strictEqual(unsupRes.method, 'unsupported');
      assert.strictEqual(clipboardTouched, false);

      // Case D: Unsupported browser with fallbackToSave: true triggers file download
      URL.createObjectURL = () => 'blob:fallback-url';
      let fallbackClicked = false;
      globalThis.document = {
        createElement: () => ({
          href: '',
          download: '',
          style: {},
          click() {
            fallbackClicked = true;
          }
        }),
        body: { appendChild() {}, removeChild() {} }
      };
      const fbRes = await Share.shareShoppingListFile(list, null, { fallbackToSave: true });
      assert.strictEqual(fbRes.success, true);
      assert.strictEqual(fbRes.supported, false);
      assert.strictEqual(fbRes.fallbackSaved, true);
      assert.strictEqual(fbRes.method, 'save-fallback');
      assert.strictEqual(fallbackClicked, true);
      assert.strictEqual(clipboardTouched, false);

      // Case E: Capacitor Native Share + Filesystem
      let capShareCall = null;
      globalThis.Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          Filesystem: {
            writeFile: async (args) => ({ uri: `file:///cache/${args.path}` })
          },
          Share: {
            share: async (args) => {
              capShareCall = args;
            }
          }
        }
      };
      assert.strictEqual(Share.canShareShoppingListFiles().method, 'capacitor-share');
      const capShareRes = await Share.shareShoppingListFile(list);
      assert.strictEqual(capShareRes.success, true);
      assert.strictEqual(capShareRes.method, 'capacitor-share');
      assert.ok(Array.isArray(capShareCall.files) && capShareCall.files[0].startsWith('file:///cache/'));
    } finally {
      if (origNavDescriptor) {
        Object.defineProperty(globalThis, 'navigator', origNavDescriptor);
      } else {
        delete globalThis.navigator;
      }
      globalThis.Capacitor = origCap;
      globalThis.document = origDocument;
      if (origBlob !== undefined) {
        globalThis.Blob = origBlob;
      } else {
        delete globalThis.Blob;
      }
      if (origFile !== undefined) {
        globalThis.File = origFile;
      } else {
        delete globalThis.File;
      }
      URL.createObjectURL = origCreateObjectURL;
    }
  });

  console.log('\n====================================================');
  console.log(`Result: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main();
