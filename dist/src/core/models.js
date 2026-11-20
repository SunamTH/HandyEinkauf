/**
 * SmartCart Core - Domain Models & Default German Supermarket Configurations
 * Works in Browser (window.SmartCartCore) and Node.js (CommonJS).
 */
(function (root) {
  'use strict';

  const SmartCartCore = root.SmartCartCore || (root.SmartCartCore = {});

  /**
   * Generates a unique ID with a given prefix.
   * @param {string} [prefix='id']
   * @returns {string}
   */
  function generateId(prefix = 'id') {
    const rand = Math.random().toString(36).substring(2, 8);
    const time = Date.now().toString(36);
    return `${prefix}_${time}_${rand}`;
  }

  /**
   * Normalizes an item name for case-insensitive, umlaut-tolerant matching
   * against supermarket walking order configurations.
   * @param {string} name
   * @returns {string}
   */
  function normalizeItemName(name) {
    if (name === null || name === undefined) return '';
    return String(name)
      .trim()
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Cleans an optional specification/brand string for storage & display
   * (trimmed string, empty string `''` when omitted/null/undefined).
   * @param {string|null|undefined} specification
   * @returns {string}
   */
  function cleanSpecification(specification) {
    if (specification === null || specification === undefined) return '';
    return String(specification).trim();
  }

  /**
   * Normalizes an optional specification/brand string for exact matching and deduplication:
   * - Unicode NFC normalization
   * - Trimmed leading/trailing whitespace
   * - Lowercased (case-insensitive)
   * - Internal whitespace collapsed to a single space
   * Note: No synonym or fuzzy expansion is performed on specifications.
   * @param {string|null|undefined} specification
   * @returns {string}
   */
  function normalizeSpecification(specification) {
    if (specification === null || specification === undefined) return '';
    return String(specification)
      .normalize('NFC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /**
   * Normalizes a supermarket sort entry (either a legacy string or `{ name, specification }` object)
   * into the canonical `{ name: string, specification: string }` shape.
   * Returns `null` if the entry has no valid product name.
   * @param {string|Object} entryOrName
   * @param {string} [specification]
   * @returns {{ name: string, specification: string } | null}
   */
  function createStoreEntry(entryOrName, specification = undefined) {
    if (entryOrName === null || entryOrName === undefined) return null;

    let rawName = '';
    let rawSpec = '';

    if (typeof entryOrName === 'object') {
      rawName = entryOrName.name !== undefined && entryOrName.name !== null ? String(entryOrName.name) : '';
      rawSpec =
        specification !== undefined
          ? cleanSpecification(specification)
          : cleanSpecification(entryOrName.specification);
    } else {
      rawName = String(entryOrName);
      rawSpec = specification !== undefined ? cleanSpecification(specification) : '';
    }

    const trimmedName = rawName.trim();
    if (!trimmedName || !normalizeItemName(trimmedName)) return null;

    return {
      name: trimmedName,
      specification: rawSpec
    };
  }

  /**
   * Computes a collision-free uniqueness key for a supermarket sort entry
   * combining BOTH normalized product name AND normalized specification:
   * `"<normalizedName>::<normalizedSpecification>"`.
   * @param {string|Object} entryOrName
   * @param {string} [specification]
   * @returns {string}
   */
  function getStoreEntryKey(entryOrName, specification = undefined) {
    const entry = createStoreEntry(entryOrName, specification);
    if (!entry) return '';
    const normName = normalizeItemName(entry.name);
    if (!normName) return '';
    const normSpec = normalizeSpecification(entry.specification);
    return `${normName}::${normSpec}`;
  }

  /**
   * Formats an item or supermarket entry for human-readable display,
   * appending `(<specification>)` when a specification is present.
   * @param {string|Object} itemOrName
   * @param {string} [specification]
   * @returns {string}
   */
  function formatItemDisplayName(itemOrName, specification = undefined) {
    if (itemOrName === null || itemOrName === undefined) return '';
    const rawName =
      typeof itemOrName === 'object'
        ? String(itemOrName.name || '').trim()
        : String(itemOrName).trim();
    const rawSpec =
      specification !== undefined
        ? cleanSpecification(specification)
        : typeof itemOrName === 'object'
        ? cleanSpecification(itemOrName.specification)
        : '';
    return rawSpec ? `${rawName} (${rawSpec})` : rawName;
  }

  /**
   * Common German singular/plural & synonym equivalence groups (normalized).
   */
  const EQUIVALENCE_GROUPS = [
    ['apfel', 'aepfel'],
    ['banane', 'bananen'],
    ['tomate', 'tomaten', 'rispentomaten'],
    ['gurke', 'gurken', 'salatgurke'],
    ['paprika', 'paprikas'],
    ['kartoffel', 'kartoffeln'],
    ['zwiebel', 'zwiebeln'],
    ['karotte', 'karotten', 'moehre', 'moehren'],
    ['salat', 'kopfsalat', 'eisbergsalat'],
    ['broetchen', 'semmel', 'semmeln', 'schrippen'],
    ['brot', 'vollkornbrot', 'bauernbrot'],
    ['toast', 'toastbrot'],
    ['croissant', 'croissants'],
    ['milch', 'vollmilch', 'frischmilch', 'h-milch', 'hmilch'],
    ['butter', 'markenbutter', 'suessrahmbutter'],
    ['joghurt', 'naturjoghurt', 'fruchtjoghurt'],
    ['kaese', 'gouda', 'schnittkaese', 'reibekaese'],
    ['quark', 'magerquark', 'speisequark'],
    ['sahne', 'schlagsahne'],
    ['ei', 'eier', 'freilandeier', 'bio eier'],
    ['haehnchenbrust', 'haehnchen', 'haehnchenfilet', 'putenbrust'],
    ['hackfleisch', 'rinderhack', 'gemischtes hackfleisch'],
    ['salami', 'feinschmeckersalami'],
    ['schinken', 'kochschinken', 'roher schinken'],
    ['nudel', 'nudeln', 'pasta', 'spaghetti', 'penne'],
    ['reis', 'basmatireis', 'jasminreis'],
    ['passierte tomaten', 'tomaten passiert', 'dosentomaten'],
    ['olivenoel', 'speiseoel', 'rapsoel'],
    ['mehl', 'weizenmehl', 'dinkelmehl'],
    ['zucker', 'feinzucker'],
    ['haferflocken', 'zarte haferflocken', 'kernige haferflocken'],
    ['kaffee', 'filterkaffee', 'kaffeebohnen', 'espresso'],
    ['tee', 'kraeutertee', 'fruechtetee', 'schwarzer tee'],
    ['schokolade', 'vollmilchschokolade', 'tafelschokolade'],
    ['mineralwasser', 'wasser', 'sprudelwasser', 'stilles wasser'],
    ['apfelsaft', 'apfelschorle'],
    ['orangensaft', 'o-saft', 'osaft'],
    ['cola', 'coca cola', 'cola zero'],
    ['bier', 'pils', 'weizenbier'],
    ['tiefkuehlpizza', 'tk pizza', 'pizza', 'tk-pizza'],
    ['tiefkuehlgemuese', 'tk gemuese', 'tk-gemuese'],
    ['eiscreme', 'eis', 'speiseeis'],
    ['toilettenpapier', 'klopapier', 'wc papier', 'wc-papier'],
    ['kuechenrolle', 'kuechentuecher', 'haushaltsrolle'],
    ['spuelmittel', 'handspuelmittel', 'spueli'],
    ['zahnpasta', 'zahncreme'],
    ['duschgel', 'duschbad', 'seife']
  ];

  const SYNONYM_LOOKUP = new Map();
  EQUIVALENCE_GROUPS.forEach((group) => {
    const canonical = group[0];
    group.forEach((term) => {
      SYNONYM_LOOKUP.set(normalizeItemName(term), canonical);
    });
  });

  /**
   * Returns the canonical normalized key for an item name (handling German singular/plural/synonyms).
   * @param {string} name
   * @returns {string}
   */
  function getCanonicalItemKey(name) {
    const norm = normalizeItemName(name);
    if (!norm) return '';
    return SYNONYM_LOOKUP.get(norm) || norm;
  }

  /**
   * Finds the matching entry in a supermarket's `itemOrder` for a shopping list item
   * `(itemName, specification)` following SmartCart's exact specification matching rule:
   *
   * 1. If the shopping item has a non-empty specification (`normalizeSpecification(spec) !== ''`):
   *    - First searches for an entry with exact normalized name AND exact normalized specification.
   *    - Next searches for a canonical synonym/plural name AND exact normalized specification.
   *    - If found, returns `{ index, matchType: 'exact-spec', entry }`.
   *    - Otherwise falls back to Step 2 (corresponding product WITHOUT specification).
   * 2. Unspecified / fallback matching:
   *    - Searches for an entry with exact normalized name AND empty specification (`''`).
   *    - Next searches for a canonical synonym/plural name AND empty specification (`''`).
   *    - If found, returns `{ index, matchType: hasSpec ? 'fallback-generic' : 'exact-generic', entry }`.
   * 3. If neither matches, returns `{ index: -1, matchType: 'none', entry: null }` (item is unknown in store).
   *    Note: An unspecified shopping item NEVER matches a specified-only store entry, and a specified
   *    shopping item NEVER matches a store entry with a different specification.
   *
   * @param {Array<string|Object>} itemOrder
   * @param {string|Object} itemNameOrEntry
   * @param {string} [specification]
   * @returns {{ index: number, matchType: 'exact-spec'|'exact-generic'|'fallback-generic'|'none', entry: { name: string, specification: string } | null }}
   */
  function findStoreEntryMatch(itemOrder, itemNameOrEntry, specification = undefined) {
    if (!Array.isArray(itemOrder) || !itemNameOrEntry) {
      return { index: -1, matchType: 'none', entry: null };
    }

    const target = createStoreEntry(itemNameOrEntry, specification);
    if (!target) {
      return { index: -1, matchType: 'none', entry: null };
    }

    const targetNormName = normalizeItemName(target.name);
    const targetCanonical = getCanonicalItemKey(target.name);
    const targetNormSpec = normalizeSpecification(target.specification);

    const normalizedEntries = itemOrder.map((raw) => {
      const entry = createStoreEntry(raw);
      if (!entry) return null;
      return {
        entry,
        normName: normalizeItemName(entry.name),
        canonical: getCanonicalItemKey(entry.name),
        normSpec: normalizeSpecification(entry.specification)
      };
    });

    // Step 1: When shopping item has a specification, require exact normalized specification match first
    if (targetNormSpec !== '') {
      for (let i = 0; i < normalizedEntries.length; i++) {
        const cur = normalizedEntries[i];
        if (cur && cur.normName === targetNormName && cur.normSpec === targetNormSpec) {
          return { index: i, matchType: 'exact-spec', entry: cur.entry };
        }
      }
      for (let i = 0; i < normalizedEntries.length; i++) {
        const cur = normalizedEntries[i];
        if (cur && cur.canonical === targetCanonical && cur.normSpec === targetNormSpec) {
          return { index: i, matchType: 'exact-spec', entry: cur.entry };
        }
      }
    }

    // Step 2: Match unspecified supermarket entry (primary for unspecified items, fallback for specified items)
    const genericMatchType = targetNormSpec !== '' ? 'fallback-generic' : 'exact-generic';
    for (let i = 0; i < normalizedEntries.length; i++) {
      const cur = normalizedEntries[i];
      if (cur && cur.normName === targetNormName && cur.normSpec === '') {
        return { index: i, matchType: genericMatchType, entry: cur.entry };
      }
    }
    for (let i = 0; i < normalizedEntries.length; i++) {
      const cur = normalizedEntries[i];
      if (cur && cur.canonical === targetCanonical && cur.normSpec === '') {
        return { index: i, matchType: genericMatchType, entry: cur.entry };
      }
    }

    return { index: -1, matchType: 'none', entry: null };
  }

  /**
   * Finds the index of an item (with optional specification) in a supermarket's `itemOrder`
   * using SmartCart's specification matching + fallback-to-unspecified rule.
   * @param {Array<string|Object>} itemOrder
   * @param {string|Object} itemNameOrEntry
   * @param {string} [specification]
   * @returns {number} Index in itemOrder, or -1 if not found
   */
  function indexOfNormalized(itemOrder, itemNameOrEntry, specification = undefined) {
    return findStoreEntryMatch(itemOrder, itemNameOrEntry, specification).index;
  }

  /**
   * Finds the exact index of a supermarket sort entry matching BOTH normalized name
   * AND normalized specification (NO fallback to unspecified entries).
   * Used for deduplication, adding, moving, and removing entries in `supermarket.itemOrder`.
   * @param {Array<string|Object>} itemOrder
   * @param {string|Object} itemNameOrEntry
   * @param {string} [specification]
   * @returns {number} Index in itemOrder, or -1 if not found
   */
  function findExactStoreEntryIndex(itemOrder, itemNameOrEntry, specification = undefined) {
    if (!Array.isArray(itemOrder) || !itemNameOrEntry) return -1;
    const targetKey = getStoreEntryKey(itemNameOrEntry, specification);
    if (!targetKey) return -1;

    for (let i = 0; i < itemOrder.length; i++) {
      if (getStoreEntryKey(itemOrder[i]) === targetKey) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Guesses a German store department/category for UI badges based on item name.
   * @param {string|Object} nameOrEntry
   * @returns {string}
   */
  function guessItemCategory(nameOrEntry) {
    const rawName =
      typeof nameOrEntry === 'object' && nameOrEntry !== null ? nameOrEntry.name : nameOrEntry;
    const key = getCanonicalItemKey(rawName);
    const categories = [
      {
        label: 'Obst & Gemüse',
        items: ['apfel', 'banane', 'tomate', 'gurke', 'paprika', 'salat', 'kartoffel', 'zwiebel', 'karotte', 'zitrone', 'avocado', 'beeren', 'pilze', 'knoblauch', 'ingwer', 'brokkoli', 'zucchini']
      },
      {
        label: 'Backwaren',
        items: ['broetchen', 'brot', 'toast', 'croissant', 'baguette', 'brezel', 'kuchen']
      },
      {
        label: 'Kühlregal & Milch',
        items: ['milch', 'butter', 'joghurt', 'kaese', 'quark', 'sahne', 'ei', 'frischkaese', 'mozzarella', 'schmand']
      },
      {
        label: 'Fleisch & Wurst',
        items: ['haehnchenbrust', 'hackfleisch', 'salami', 'schinken', 'wurst', 'rindfleisch', 'bratwurst', 'lachs']
      },
      {
        label: 'Trockensortiment',
        items: ['nudel', 'reis', 'passierte tomaten', 'olivenoel', 'mehl', 'zucker', 'haferflocken', 'kaffee', 'tee', 'schokolade', 'muesli', 'salz', 'pfeffer', 'ketchup', 'senf', 'kekse', 'chips']
      },
      {
        label: 'Getränke',
        items: ['mineralwasser', 'apfelsaft', 'orangensaft', 'cola', 'bier', 'wein', 'limonade', 'saft']
      },
      {
        label: 'Tiefkühl',
        items: ['tiefkuehlpizza', 'tiefkuehlgemuese', 'eiscreme', 'pommes', 'fischstaebchen']
      },
      {
        label: 'Haushalt & Drogerie',
        items: ['toilettenpapier', 'kuechenrolle', 'spuelmittel', 'zahnpasta', 'duschgel', 'waschmittel', 'muellbeutel', 'shampoo', 'alufolie', 'backpapier']
      }
    ];

    for (const cat of categories) {
      if (cat.items.some((term) => key === term || key.includes(term))) {
        return cat.label;
      }
    }
    return 'Sonstiges';
  }

  /**
   * Creates a normalized Shopping List Item object.
   * @param {Object} params
   * @param {string} [params.id]
   * @param {string} params.name
   * @param {string} [params.specification='']
   * @param {string|number} [params.quantity='1x']
   * @param {string} [params.category]
   * @param {boolean} [params.checked=false]
   * @param {number|null} [params.checkedAt=null]
   * @param {boolean} [params.addedLateOverride=false]
   * @param {number} [params.originalOrder=0]
   * @returns {Object}
   */
  function createItem({
    id,
    name,
    specification = '',
    quantity = '1x',
    category = null,
    checked = false,
    checkedAt = null,
    addedLateOverride = false,
    originalOrder = 0
  } = {}) {
    const cleanName = String(name || '').trim();
    const cleanSpec = cleanSpecification(specification);
    const isChecked = Boolean(checked);
    const cleanQty =
      quantity !== undefined && quantity !== null && String(quantity).trim() !== ''
        ? String(quantity).trim()
        : '1x';

    return {
      id: id || generateId('item'),
      name: cleanName,
      normalizedName: normalizeItemName(cleanName),
      specification: cleanSpec,
      normalizedSpecification: normalizeSpecification(cleanSpec),
      quantity: cleanQty,
      category: category || guessItemCategory(cleanName),
      checked: isChecked,
      checkedAt: isChecked ? (checkedAt || Date.now()) : null,
      addedLateOverride: isChecked ? false : Boolean(addedLateOverride),
      originalOrder: typeof originalOrder === 'number' ? originalOrder : 0
    };
  }

  /**
   * Creates a Supermarket configuration with an ordered array of sort entries
   * `{ name: string, specification: string }` representing the walking path through the store.
   * Accepts both legacy `string[]` and `{ name, specification }[]` entries, normalizing all
   * entries to `{ name, specification }` and deduplicating by `(normalizedName, normalizedSpecification)`
   * so the same product can coexist with multiple different specifications and/or without specification.
   *
   * @param {Object} params
   * @param {string} [params.id]
   * @param {string} params.name
   * @param {string} [params.icon='🛒']
   * @param {string} [params.color='#2563eb']
   * @param {Array<string|{name: string, specification?: string}>} [params.itemOrder=[]]
   * @param {number} [params.updatedAt]
   * @returns {Object}
   */
  function createSupermarket({
    id,
    name,
    icon = '🛒',
    color = '#2563eb',
    itemOrder = [],
    sourceSupermarketId = undefined,
    supermarkets = undefined,
    updatedAt = null
  } = {}) {
    if (
      (!Array.isArray(itemOrder) || itemOrder.length === 0) &&
      sourceSupermarketId !== undefined
    ) {
      return createSupermarketWithSorting({
        id,
        name,
        icon,
        color,
        sourceSupermarketId,
        supermarkets: supermarkets || [],
        updatedAt
      });
    }
    const cleanName = String(name || 'Supermarkt').trim();
    const seen = new Set();
    const deduplicatedOrder = [];

    if (Array.isArray(itemOrder)) {
      for (const rawItem of itemOrder) {
        const entry = createStoreEntry(rawItem);
        if (!entry) continue;
        const key = getStoreEntryKey(entry);
        if (key && !seen.has(key)) {
          seen.add(key);
          deduplicatedOrder.push(entry);
        }
      }
    }

    return {
      id: id || generateId('store'),
      name: cleanName,
      icon: icon || '🛒',
      color: color || '#2563eb',
      itemOrder: deduplicatedOrder,
      updatedAt: updatedAt || Date.now()
    };
  }

  /**
   * Returns the 3 rich default German supermarkets (REWE, ALDI, LIDL)
   * with realistic store walking order across all departments.
   * Notice subtle layout differences between stores (e.g. ALDI starts with Backwaren & Trockensortiment before Kühlregal,
   * while REWE goes Obst & Gemüse -> Backwaren -> Fleisch/Wurst -> Kühlregal -> Trockensortiment -> Getränke -> Tiefkühl -> Haushalt).
   * @returns {Object[]}
   */
  function getDefaultSupermarkets() {
    return [
      createSupermarket({
        id: 'rewe',
        name: 'REWE',
        icon: '🔴',
        color: '#cc071e',
        itemOrder: [
          // 1. Obst & Gemüse (Eingangsbereich)
          'Äpfel',
          'Bananen',
          'Tomaten',
          'Gurken',
          'Paprika',
          'Salat',
          'Kartoffeln',
          'Zwiebeln',
          'Karotten',
          // 2. Backwaren
          'Brötchen',
          'Brot',
          'Toastbrot',
          'Croissants',
          // 3. Fleisch & Wurst (Bedientheke / SB-Kühlung)
          'Hähnchenbrust',
          'Hackfleisch',
          'Salami',
          'Schinken',
          // 4. Kühlregal & Milchprodukte
          'Milch',
          'Butter',
          'Joghurt',
          'Käse',
          'Quark',
          'Sahne',
          'Eier',
          // 5. Trockensortiment / Nudeln / Konserven
          'Nudeln',
          'Reis',
          'Passierte Tomaten',
          'Olivenöl',
          'Mehl',
          'Zucker',
          'Haferflocken',
          'Kaffee',
          'Tee',
          'Schokolade',
          // 6. Getränke
          'Mineralwasser',
          'Apfelsaft',
          'Orangensaft',
          'Cola',
          'Bier',
          // 7. Tiefkühl
          'Tiefkühlpizza',
          'Tiefkühlgemüse',
          'Eiscreme',
          // 8. Haushalt & Drogerie (vor den Kassen)
          'Toilettenpapier',
          'Küchenrolle',
          'Spülmittel',
          'Zahnpasta',
          'Duschgel'
        ]
      }),
      createSupermarket({
        id: 'aldi',
        name: 'ALDI',
        icon: '🔵',
        color: '#00509b',
        itemOrder: [
          // 1. Backwaren & Brotregal am Eingang
          'Brötchen',
          'Brot',
          'Toastbrot',
          'Croissants',
          // 2. Obst & Gemüse
          'Bananen',
          'Äpfel',
          'Tomaten',
          'Gurken',
          'Paprika',
          'Salat',
          'Kartoffeln',
          'Zwiebeln',
          'Karotten',
          // 3. Trockensortiment (Mittelgänge 1-2)
          'Kaffee',
          'Tee',
          'Haferflocken',
          'Mehl',
          'Zucker',
          'Nudeln',
          'Reis',
          'Passierte Tomaten',
          'Olivenöl',
          'Schokolade',
          // 4. Kühlwand & Fleisch/Wurst
          'Hähnchenbrust',
          'Hackfleisch',
          'Salami',
          'Schinken',
          'Milch',
          'Butter',
          'Joghurt',
          'Käse',
          'Quark',
          'Sahne',
          'Eier',
          // 5. Haushalt & Drogerie
          'Toilettenpapier',
          'Küchenrolle',
          'Spülmittel',
          'Zahnpasta',
          'Duschgel',
          // 6. Getränke & Tiefkühltruhen (letzter Gang vor der Kasse)
          'Mineralwasser',
          'Apfelsaft',
          'Orangensaft',
          'Cola',
          'Bier',
          'Tiefkühlpizza',
          'Tiefkühlgemüse',
          'Eiscreme'
        ]
      }),
      createSupermarket({
        id: 'lidl',
        name: 'LIDL',
        icon: '🟡',
        color: '#0050aa',
        itemOrder: [
          // 1. Obst & Gemüse direkt am Eingang
          'Äpfel',
          'Bananen',
          'Tomaten',
          'Gurken',
          'Paprika',
          'Salat',
          'Kartoffeln',
          'Zwiebeln',
          'Karotten',
          // 2. Lidl-Backstation
          'Brötchen',
          'Croissants',
          'Brot',
          'Toastbrot',
          // 3. Kühlregal & Milchprodukte + Eier
          'Milch',
          'Butter',
          'Joghurt',
          'Quark',
          'Sahne',
          'Käse',
          'Eier',
          // 4. Fleisch & Wurst
          'Hähnchenbrust',
          'Hackfleisch',
          'Schinken',
          'Salami',
          // 5. Trockensortiment
          'Nudeln',
          'Passierte Tomaten',
          'Reis',
          'Olivenöl',
          'Mehl',
          'Zucker',
          'Haferflocken',
          'Kaffee',
          'Tee',
          'Schokolade',
          // 6. Tiefkühltruhen
          'Tiefkühlpizza',
          'Tiefkühlgemüse',
          'Eiscreme',
          // 7. Getränke
          'Mineralwasser',
          'Apfelsaft',
          'Orangensaft',
          'Cola',
          'Bier',
          // 8. Haushalt & Drogerie (Kassenzone)
          'Toilettenpapier',
          'Küchenrolle',
          'Spülmittel',
          'Zahnpasta',
          'Duschgel'
        ]
      })
    ];
  }

  /**
   * Creates a Shopping List object.
   * @param {Object} params
   * @param {string} [params.id]
   * @param {string} [params.name='Mein Einkaufszettel']
   * @param {string} [params.supermarketId='rewe']
   * @param {boolean} [params.liveOptimizationEnabled=true]
   * @param {Array} [params.items=[]]
   * @param {number} [params.updatedAt]
   * @returns {Object}
   */
  function createShoppingList({
    id,
    name = 'Mein Einkaufszettel',
    supermarketId = 'rewe',
    liveOptimizationEnabled = true,
    items = [],
    updatedAt = null
  } = {}) {
    const normalizedItems = Array.isArray(items)
      ? items.map((item, idx) =>
          createItem({
            ...item,
            originalOrder: typeof item.originalOrder === 'number' ? item.originalOrder : idx
          })
        )
      : [];

    return {
      id: id || generateId('list'),
      name: String(name || 'Mein Einkaufszettel').trim(),
      supermarketId: supermarketId || 'rewe',
      liveOptimizationEnabled:
        liveOptimizationEnabled === undefined ? true : Boolean(liveOptimizationEnabled),
      items: normalizedItems,
      updatedAt: updatedAt || Date.now()
    };
  }

  const DEFAULT_SUPERMARKETS = getDefaultSupermarkets();

  /**
   * Returns a fresh deep copy of the standard German supermarket walking order
   * (from the default REWE configuration) as `{ name, specification }[]`.
   * @returns {Array<{ name: string, specification: string }>}
   */
  function getDefaultItemOrder() {
    const baseStore =
      Array.isArray(DEFAULT_SUPERMARKETS) && DEFAULT_SUPERMARKETS.length > 0
        ? DEFAULT_SUPERMARKETS[0]
        : getDefaultSupermarkets()[0];
    return Array.isArray(baseStore && baseStore.itemOrder)
      ? baseStore.itemOrder.map((entry) => createStoreEntry(entry)).filter(Boolean)
      : [];
  }

  /**
   * Creates a new Supermarket configuration and adopts its initial item sorting
   * either from the default walking order (`sourceSupermarketId === 'default'`)
   * or from an existing supermarket in `supermarkets`.
   *
   * @param {Object} params
   * @param {string} [params.id]
   * @param {string} params.name
   * @param {string} [params.icon='🛒']
   * @param {string} [params.color='#2563eb']
   * @param {string} [params.sourceSupermarketId='default']
   * @param {Array<Object>} [params.supermarkets=[]]
   * @param {Array<string|{name: string, specification?: string}>} [params.itemOrder]
   * @param {number} [params.updatedAt]
   * @returns {Object}
   */
  function createSupermarketWithSorting({
    id,
    name,
    icon = '🛒',
    color = '#2563eb',
    sourceSupermarketId = 'default',
    supermarkets = [],
    itemOrder = null,
    updatedAt = null
  } = {}) {
    let resolvedItemOrder = [];

    if (Array.isArray(itemOrder) && itemOrder.length > 0) {
      resolvedItemOrder = itemOrder.map((entry) => createStoreEntry(entry)).filter(Boolean);
    } else if (
      sourceSupermarketId &&
      String(sourceSupermarketId).trim() !== '' &&
      String(sourceSupermarketId).trim().toLowerCase() !== 'default'
    ) {
      const targetId = String(sourceSupermarketId).trim();
      const pool =
        Array.isArray(supermarkets) && supermarkets.length > 0
          ? supermarkets
          : DEFAULT_SUPERMARKETS;
      const sourceStore =
        pool.find((s) => s && s.id === targetId) ||
        pool.find(
          (s) => s && normalizeItemName(s.name) === normalizeItemName(targetId)
        ) ||
        DEFAULT_SUPERMARKETS.find((s) => s && s.id === targetId);

      if (sourceStore && Array.isArray(sourceStore.itemOrder)) {
        resolvedItemOrder = sourceStore.itemOrder
          .map((entry) => createStoreEntry(entry))
          .filter(Boolean);
      } else {
        resolvedItemOrder = getDefaultItemOrder();
      }
    } else {
      resolvedItemOrder = getDefaultItemOrder();
    }

    return createSupermarket({
      id,
      name,
      icon,
      color,
      itemOrder: resolvedItemOrder,
      updatedAt
    });
  }

  const modelsExports = {
    generateId,
    normalizeItemName,
    cleanSpecification,
    normalizeSpecification,
    createStoreEntry,
    normalizeStoreEntry: createStoreEntry,
    getStoreEntryKey,
    formatItemDisplayName,
    getCanonicalItemKey,
    findStoreEntryMatch,
    indexOfNormalized,
    findExactStoreEntryIndex,
    guessItemCategory,
    createItem,
    createSupermarket,
    createSupermarketWithSorting,
    getDefaultItemOrder,
    getDefaultSupermarkets,
    DEFAULT_SUPERMARKETS,
    createShoppingList
  };

  Object.assign(SmartCartCore, modelsExports);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = modelsExports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
