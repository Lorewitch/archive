let BOOKS = [];
let ARTIFACTS = [];
let WEAPONS = [];
let ITEMS = [];
let ENEMIES = [];
const DETAILS = new Map();
const LOADED_SECTIONS = new Set();
const SECTION_LOADS = new Map();
const SEARCH_TEXT_CACHE = new WeakMap();
const COMMON_ENEMY_TYPES_CACHE = new WeakMap();
let renderSequence = 0;

function currentAssetVersion() {
  const script = document.currentScript || document.querySelector('script[src*="archive.js"]');
  if (!script?.src) return "";
  return new URL(script.src, window.location.href).searchParams.get("v") || "";
}

const DATA_CACHE_VERSION = currentAssetVersion();

function versionedDataPath(path) {
  if (!DATA_CACHE_VERSION || !String(path).startsWith("data/")) return path;
  const separator = String(path).includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(DATA_CACHE_VERSION)}`;
}

async function fetchJson(path) {
  const url = versionedDataPath(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
  return response.json();
}

async function fetchOptionalJson(path) {
  try {
    return await fetchJson(path);
  } catch (_) {
    return [];
  }
}

function normalizeList(data, fallbackKey) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[fallbackKey])) return data[fallbackKey];
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function assignSectionData(sectionId, data) {
  const list = normalizeList(data, sectionId);
  if (sectionId === "books") BOOKS = list;
  if (sectionId === "artifacts") ARTIFACTS = list;
  if (sectionId === "weapons") WEAPONS = list;
  if (sectionId === "items") ITEMS = list;
  if (sectionId === "enemies") ENEMIES = list;
}

async function loadSectionData(sectionId) {
  if (LOADED_SECTIONS.has(sectionId)) return;
  if (SECTION_LOADS.has(sectionId)) return SECTION_LOADS.get(sectionId);

  const path = `data/${sectionId}_index.json`;
  const loader = sectionId === "books" ? fetchJson : fetchOptionalJson;
  const promise = loader(path)
    .then(data => {
      assignSectionData(sectionId, data);
      LOADED_SECTIONS.add(sectionId);
    })
    .catch(error => {
      if (sectionId === "books") throw error;
      assignSectionData(sectionId, []);
      LOADED_SECTIONS.add(sectionId);
    })
    .finally(() => SECTION_LOADS.delete(sectionId));

  SECTION_LOADS.set(sectionId, promise);
  return promise;
}

async function getBookById(id) {
  const cacheKey = `books:${id}`;
  if (DETAILS.has(cacheKey)) return DETAILS.get(cacheKey);
  const book = await fetchJson(`data/books/${encodeURIComponent(id)}.json`);
  DETAILS.set(cacheKey, book);
  return book;
}

async function getGenericDetail(sectionId, id) {
  const cacheKey = `${sectionId}:${id}`;
  if (DETAILS.has(cacheKey)) return DETAILS.get(cacheKey);
  const collection = getSectionConfig(sectionId).data();
  const fromIndex = collection.find(item => item.id === id) || null;
  const detail = await fetchOptionalJson(`data/${sectionId}/${encodeURIComponent(id)}.json`);
  const result = detail?.id ? detail : fromIndex;
  DETAILS.set(cacheKey, result);
  return result;
}


const WEAPON_TYPES = [
  ["sword", "Одноручное"],
  ["claymore", "Двуручное"],
  ["bow", "Лук"],
  ["catalyst", "Катализатор"],
  ["polearm", "Древковое"]
];

const RARITY_FILTERS = [
  ["5", "5★"],
  ["4", "4★"],
  ["3", "3★"],
  ["2", "2★"],
  ["1", "1★"],
];


const BOOK_TYPE_FILTERS = [
  ["book_series", "Книжные серии"],
  ["notes", "Записки"],
];

const REGION_FILTERS = [
  ["Мондштадт", "Мондштадт"],
  ["Ли Юэ", "Ли Юэ"],
  ["Инадзума", "Инадзума"],
  ["Сумеру", "Сумеру"],
  ["Фонтейн", "Фонтейн"],
  ["Натлан", "Натлан"],
  ["Нод-Край", "Нод-Край"],
  ["Снежная", "Снежная"],
];

const ITEM_GROUPS = [
  ["weekly_bosses", "Материалы с еженедельных боссов", "Редкие трофеи могущественных противников: следы тяжёлых битв, где механика встречается с лором."],
  ["world_bosses", "Материалы с мировых боссов", "Диковинные трофеи владык открытого мира: кристаллы, ядра и осколки сил для возвышения персонажей."],
  ["common_enemies", "Материалы с обычных противников", "Повседневная добыча с монстров и вражеских отрядов: маски, знаки, обломки и другие маленькие улики мира."],
  ["development_materials", "Материалы развития", "Книги талантов и материалы возвышения: тихие ступени роста, через которые персонажи становятся сильнее."],
  ["teyvat_resources", "Ресурсы Тейвата", "Руды, растения, диковины и собираемые редкости: природные следы регионов, спрятанные в траве, камне и лунном свете."],
  ["food_potions", "Еда и зелья", "Блюда, ингредиенты и алхимические зелья: всё, что лечит, усиливает, согревает и иногда подозрительно вкусно пахнет."],
  ["useful_items", "Полезные предметы", "Инструменты, гаджеты и особые вещицы: маленькие помощники путешествия, без которых дорога становится куда капризнее."],
  ["misc", "Прочее", "Редкие и странные находки без отдельной полки: всё, что не пожелало аккуратно вписаться в другие разделы."]
];

const ENEMY_DROP_GROUPS = ["weekly_bosses", "world_bosses", "common_enemies"];

function isEnemyDropGroup(group) {
  return ENEMY_DROP_GROUPS.includes(group);
}

function isEnemyDropEntry(item) {
  return item?.entry_type === "enemy_drops"
    || item?.entry_type === "material_set"
    || (isEnemyDropGroup(item?.item_group) && Array.isArray(item?.materials) && item.materials.length > 0);
}

function isCommonEnemyCatalog(config = getSectionConfig()) {
  return config?.id === "items" && state.subsection === "common_enemies";
}

function isDevelopmentMaterialsCatalog(config = getSectionConfig()) {
  return config?.id === "items" && state.subsection === "development_materials";
}


const DEVELOPMENT_MATERIAL_TYPE_FILTERS = [
  ["talents", "Таланты"],
  ["character_ascension", "Возвышение персонажа"],
  ["weapon_ascension", "Возвышение оружия"],
];

const DEVELOPMENT_MATERIAL_TYPE_LABELS = {
  talents: { ru: "Таланты", en: "Talents", zh: "天赋" },
  character_ascension: { ru: "Возвышение персонажа", en: "Character Ascension", zh: "角色突破" },
  weapon_ascension: { ru: "Возвышение оружия", en: "Weapon Ascension", zh: "武器突破" },
};


const ITEM_GROUP_TYPE_FILTERS = {
  teyvat_resources: [
    ["ore", "Руда"],
    ["local_specialty", "Диковинки"],
    ["plant", "Растения"],
    ["animal", "Животные"],
  ],
  food_potions: [
    ["food", "Еда"],
    ["potion", "Зелья"],
  ],
  useful_items: [
    ["tool", "Инструменты"],
    ["seelie", "Феи"],
    ["equipment", "Снаряжение"],
  ],
};

const ITEM_GROUP_TYPE_KEYS = Object.fromEntries(
  Object.entries(ITEM_GROUP_TYPE_FILTERS).map(([group, options]) => [group, new Set(options.map(([value]) => value))])
);

const ITEM_GROUP_TYPE_LABELS = {
  teyvat_resources: {
    ore: { ru: "Руда", en: "Ore", zh: "矿石" },
    local_specialty: { ru: "Диковинка", en: "Local Specialty", zh: "区域特产" },
    plant: { ru: "Растение", en: "Plant", zh: "植物" },
    animal: { ru: "Животное", en: "Animal", zh: "动物" },
  },
  food_potions: {
    food: { ru: "Еда", en: "Food", zh: "食物" },
    potion: { ru: "Зелье", en: "Potion", zh: "药剂" },
  },
  useful_items: {
    tool: { ru: "Инструмент", en: "Tool", zh: "道具" },
    seelie: { ru: "Фея", en: "Seelie", zh: "仙灵" },
    equipment: { ru: "Снаряжение", en: "Equipment", zh: "装备" },
  },
};

function normalizeDevelopmentMaterialType(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return DEVELOPMENT_MATERIAL_TYPE_LABELS[key] ? key : "talents";
}

function developmentMaterialTypeTitle(item, lang = "ru") {
  const key = normalizeDevelopmentMaterialType(item?.material_type);
  const labels = DEVELOPMENT_MATERIAL_TYPE_LABELS[key] || DEVELOPMENT_MATERIAL_TYPE_LABELS.talents;
  return item?.material_type_title?.[lang] || labels[lang] || labels.ru;
}

function itemGroupUsesTypeFilters(group = state.subsection) {
  return Boolean(ITEM_GROUP_TYPE_FILTERS[group]?.length);
}

function normalizeItemGroupType(itemGroup, value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ITEM_GROUP_TYPE_KEYS[itemGroup]?.has(key) ? key : "";
}

function itemGroupTypeTitle(item, lang = "ru") {
  const group = item?.item_group || state.subsection;
  const key = normalizeItemGroupType(group, item?.item_type);
  const labels = ITEM_GROUP_TYPE_LABELS[group]?.[key];
  return item?.item_type_title?.[lang] || labels?.[lang] || labels?.ru || item?.item_type || "—";
}

function itemTypeFilterValue(item, config = getSectionConfig()) {
  if (config.id === "books") return bookTypeValue(item);
  if (config.id === "weapons") return String(item?.rarity || "");
  if (item?.item_group === "development_materials") return normalizeDevelopmentMaterialType(item.material_type);
  return normalizeItemGroupType(item?.item_group || state.subsection, item?.item_type);
}

function typeFiltersForCurrentCatalog(config = getSectionConfig()) {
  if (config.id === "books") return BOOK_TYPE_FILTERS;
  if (config.id === "weapons") return RARITY_FILTERS;
  if (isDevelopmentMaterialsCatalog(config)) return DEVELOPMENT_MATERIAL_TYPE_FILTERS;
  if (config.id === "items") return ITEM_GROUP_TYPE_FILTERS[state.subsection] || [];
  return [];
}

function activeTypeFilters(config = getSectionConfig()) {
  const filterState = state.filters[config.id];
  const options = typeFiltersForCurrentCatalog(config);
  const defaults = options.map(([value]) => value);

  let saved = [];
  if (config.id === "items") {
    saved = filterState.typeFiltersByGroup?.[state.subsection] || [];
  } else {
    saved = filterState.typeFilters || [];
  }

  if (!Array.isArray(saved) || !saved.length) return defaults;
  return saved.filter(value => defaults.includes(value));
}

function renderTypeFilters(config) {
  const options = typeFiltersForCurrentCatalog(config);
  if (!options.length) return "";

  const activeTypes = new Set(activeTypeFilters(config));
  return `
    <div class="type-filter-row" aria-label="Дополнительный фильтр">
      ${options.map(([value, label]) => `
        <label class="type-filter-chip">
          <input type="checkbox" value="${escapeHtml(value)}" ${activeTypes.has(value) ? "checked" : ""}>
          <span>${escapeHtml(label)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

const COMMON_ENEMY_TYPE_FILTERS = [
  ["hilichurls", "Хиличурлы"],
  ["elementals", "Элементали"],
  ["fatui", "Фатуи"],
  ["automatons", "Автоматоны"],
  ["human_factions", "Другие человеческие фракции"],
  ["abyss", "Бездна"],
  ["mystical_beasts", "Мистические звери"],
];

const COMMON_ENEMY_TYPE_ALIASES = {
  hilichurl: "hilichurls",
  hilichurls: "hilichurls",
  hiliсhurls: "hilichurls",

  elemental: "elementals",
  elementals: "elementals",
  slime: "elementals",
  slimes: "elementals",

  fatui: "fatui",

  automaton: "automatons",
  automatons: "automatons",
  ruin_machine: "automatons",
  ruin_machines: "automatons",
  ruin_guard: "automatons",
  ruin_guards: "automatons",

  human: "human_factions",
  humans: "human_factions",
  human_faction: "human_factions",
  human_factions: "human_factions",
  other_human_factions: "human_factions",

  abyss: "abyss",
  abyss_order: "abyss",

  beast: "mystical_beasts",
  beasts: "mystical_beasts",
  mystic_beasts: "mystical_beasts",
  mystical_beast: "mystical_beasts",
  mystical_beasts: "mystical_beasts",
};

function normalizeCommonEnemyType(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return COMMON_ENEMY_TYPE_ALIASES[key] || key;
}

function itemCommonEnemyTypes(item) {
  if (!item || typeof item !== "object") return new Set();
  if (COMMON_ENEMY_TYPES_CACHE.has(item)) return COMMON_ENEMY_TYPES_CACHE.get(item);

  const enemies = droppedByEnemies(item);
  const result = new Set(enemies
    .map(enemy => normalizeCommonEnemyType(enemy.enemy_group))
    .filter(Boolean));

  COMMON_ENEMY_TYPES_CACHE.set(item, result);
  return result;
}

function catalogFilterLabel(config) {
  if (isCommonEnemyCatalog(config)) return "Все типы противников";
  if (config.id === "items" && state.subsection && (isDevelopmentMaterialsCatalog(config) || itemGroupUsesTypeFilters(state.subsection))) {
    return "Все регионы";
  }
  return config.filterLabel;
}

function commonEnemyTypeLabel(value) {
  const normalized = normalizeCommonEnemyType(value);
  const known = COMMON_ENEMY_TYPE_FILTERS.find(([key]) => key === normalized);
  return known?.[1] || String(value || "").trim() || "Другие";
}

function itemCommonEnemyTypeLabels(item) {
  return Array.from(itemCommonEnemyTypes(item))
    .map(type => commonEnemyTypeLabel(type))
    .filter(Boolean);
}

const ARTIFACT_PART_LABELS = {
  flower: { ru: "Цветок жизни", en: "Flower of Life", zh: "生之花" },
  plume: { ru: "Перо смерти", en: "Plume of Death", zh: "死之羽" },
  sands: { ru: "Пески времени", en: "Sands of Eon", zh: "时之沙" },
  goblet: { ru: "Кубок пространства", en: "Goblet of Eonothem", zh: "空之杯" },
  circlet: { ru: "Корона разума", en: "Circlet of Logos", zh: "理之冠" }
};

const SECTIONS = [
  {
    id: "books",
    icon: "assets/icons/03_book_icon.webp",
    title: "Книги",
    description: "Книги, записки, письма и разрозненные тексты Тейвата: голоса прошлого, путевые заметки, легенды и мелкие бумажные следы большой истории.",
    data: () => BOOKS,
    filter: "region",
    filterLabel: "Все регионы",
    columns: ["Название", "Томов", "Тип", "Регион"],
    empty: "В этом разделе пока нет текстов.",
    row: item => [
      renderTitleCell(item),
      escapeHtml(item.volume_count || item.volumes?.length || 1),
      renderBookTypeCell(item),
      escapeHtml(item.region || "—")
    ]
  },
  {
    id: "artifacts",
    icon: "assets/icons/04_cup_icon.webp",
    title: "Артефакты",
    description: "Сеты артефактов: пять частей одного предания, где описание вещи часто звучит как обломок древней хроники.",
    data: () => ARTIFACTS,
    filter: "region",
    filterLabel: "Все регионы",
    columns: ["Название", "Регион", "Частей"],
    empty: "Артефакты пока не добавлены.",
    row: item => [
      renderTitleCell(item),
      escapeHtml(item.region || "—"),
      escapeHtml(item.piece_count || item.parts_count || item.count || "—"),
    ]
  },
  {
    id: "weapons",
    icon: "assets/icons/01_weapon_icon.webp",
    title: "Оружие",
    description: "Оружие: клинки, луки, катализаторы и древковое оружие с историями владельцев, клятв, потерь и старых битв.",
    data: () => WEAPONS,
    filter: "weapon_type",
    filterLabel: "Все типы",
    fixedOptions: WEAPON_TYPES,
    columns: ["Название", "Тип", "Редкость"],
    empty: "Оружие пока не добавлено.",
    row: item => [
      renderTitleCell(item),
      escapeHtml(labelFromOptions(item.weapon_type || item.type, WEAPON_TYPES) || item.weapon_type || item.type || "—"),
      escapeHtml(item.rarity ? `${item.rarity}★` : "—"),
    ]
  },
  {
    id: "items",
    icon: "assets/icons/02_inventory_icon.webp",
    title: "Предметы",
    description: "Предметы и материалы: трофеи, ресурсы, еда, инструменты и другие маленькие ключи к устройству мира.",
    data: () => ITEMS,
    groups: ITEM_GROUPS,
    groupField: "item_group",
    defaultGroup: "misc",
    filter: "region",
    filterLabel: "Все регионы",
    columns: () => state.subsection === "common_enemies"
      ? ["Материалы", "Тип противника", "Выпадает с"]
      : state.subsection === "development_materials" ? ["Материалы", "Тип материала", "Регион"]
      : itemGroupUsesTypeFilters(state.subsection) ? ["Название", "Тип", "Регион"]
      : isEnemyDropGroup(state.subsection) ? ["Название", "Материалы", "Регион"] : ["Название", "Регион"],
    empty: "В этой категории пока нет предметов.",
    row: item => state.subsection === "common_enemies" ? [
      renderCommonEnemyMaterialsCell(item),
      renderCommonEnemyTypesCell(item),
      renderDroppedByCell(item),
    ] : state.subsection === "development_materials" ? [
      renderCommonEnemyMaterialsCell(item),
      renderDevelopmentMaterialTypeCell(item),
      escapeHtml(item.region || "—"),
    ] : itemGroupUsesTypeFilters(state.subsection) ? [
      renderTitleCell(item),
      renderGenericItemTypeCell(item),
      escapeHtml(item.region || "—"),
    ] : isEnemyDropGroup(state.subsection) ? [
      renderTitleCell(item),
      renderMaterialsCell(item),
      escapeHtml(item.region || "—"),
    ] : [
      renderTitleCell(item),
      escapeHtml(item.region || "—"),
    ]
  }
];

const state = {
  section: "books",
  subsection: null,
  entryId: null,
  lang: "ru",
  volume: 1,
  readAll: false,
  artifactPart: "flower",
  artifactReadAll: false,
  itemMaterial: "",
  itemReadAll: false,
  filters: {
    books: { query: "", filter: "all", sort: "version", page: 1, pageSize: 10, typeFilters: ["book_series", "notes"] },
    artifacts: { query: "", filter: "all", sort: "version", page: 1, pageSize: 10 },
    weapons: { query: "", filter: "all", sort: "version", page: 1, pageSize: 10, typeFilters: ["5", "4", "3", "2", "1"] },
    items: {
      query: "",
      filter: "all",
      sort: "version",
      page: 1,
      pageSize: 10,
      typeFiltersByGroup: {
        development_materials: ["talents", "character_ascension", "weapon_ascension"],
        teyvat_resources: ["ore", "local_specialty", "plant", "animal"],
        food_potions: ["food", "potion"],
        useful_items: ["tool", "seelie", "equipment"]
      }
    }
  }
};

const app = document.getElementById("app");
const nav = document.getElementById("nav");
const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });
const DEFAULT_CATALOG_PAGE_SIZE = 10;

function debounce(fn, delay = 160) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    "\"": "&quot;"
  }[char]));
}


function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*\*([^*]+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
}

function markdownToHtml(value) {
  const raw = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  const lines = raw.split("\n");
  const blocks = [];
  let paragraph = [];
  let list = [];
  let quote = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push(`<p>${inlineMarkdown(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!list.length) return;
    blocks.push(`<ul>${list.map(item => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  }

  function flushQuote() {
    if (!quote.length) return;
    blocks.push(`<blockquote>${inlineMarkdown(quote.join("\n")).replace(/\n/g, "<br>")}</blockquote>`);
    quote = [];
  }

  function flushAll() {
    flushParagraph();
    flushList();
    flushQuote();
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }

    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = Math.min(4, heading[1].length);
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quote.push(quoteMatch[1]);
      continue;
    }

    const listMatch = trimmed.match(/^[-–—]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      flushQuote();
      list.push(listMatch[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(trimmed);
  }

  flushAll();
  return blocks.join("\n");
}


function splitWeaponDescriptionText(value) {
  const raw = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return { description: "", details: "" };

  const headingMatch = raw.match(/^#{2,4}\s+.+$/m);
  if (!headingMatch || headingMatch.index === undefined) {
    return { description: raw, details: "" };
  }

  return {
    description: raw.slice(0, headingMatch.index).trim(),
    details: raw.slice(headingMatch.index).trim()
  };
}


function isTemplatePublicNote(value) {
  const text = String(value ?? "")
    .toLowerCase()
    .replace(/[#*`>\-–—•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return true;

  const markers = [
    "заметки пока не заполнены",
    "сюда можно писать",
    "общий комментарий по всей",
    "общий комментарий по сету",
    "связи с персонажами",
    "связи с регионом",
    "связи с регионом персонажами событиями",
    "подозрительные формулировки",
    "заметка к первому тому",
    "заметка ко второму тому",
    "заметка к третьему тому",
    "заметка к цветку",
    "заметка к перу",
    "заметка к часам",
    "заметка к кубку",
    "заметка к короне",
    "здесь можно написать общий комментарий",
    "здесь можно написать заметки",
    "здесь можно написать заметки по группе материалов",
    "здесь можно оставить внутренние заметки",
    "внутренние заметки по серии материалов",
    "здесь можно оставить внутренние заметки по предмету",
    "здесь можно написать заметки по предмету",
    "заметка к первому материалу",
    "заметка ко второму материалу",
    "заметка к третьему материалу"
  ];

  return markers.some(marker => text.includes(marker));
}

function cleanPublicNote(value) {
  const text = String(value ?? "").trim();
  return isTemplatePublicNote(text) ? "" : text;
}

function emphasizeArtifactLabels(value) {
  return String(value ?? "")
    .replace(/(^|\n)(?!\*\*)(Название|Описание|Name|Description)\s*:\s*/g, "$1**$2:** ")
    .replace(/(^|\n)(?!\*\*)(名称|描述)\s*[：:]\s*/g, "$1**$2：** ");
}

function getSectionConfig(id = state.section) {
  return SECTIONS.find(section => section.id === id) || SECTIONS[0];
}

function materialSetTitle(item, lang = "ru") {
  const materials = Array.isArray(item?.materials) ? item.materials : [];
  const titles = materials
    .map(material => materialTitle(material, lang))
    .filter(Boolean);
  return titles.join(" · ");
}

function titleOf(item, lang = "ru") {
  const directTitle = item?.title?.[lang] || item?.title_ru || item?.title?.ru || item?.title?.en || item?.title?.zh || item?.name;
  if (directTitle) return directTitle;

  if ((item?.item_group === "common_enemies" || item?.entry_type === "material_set") && Array.isArray(item?.materials) && item.materials.length) {
    return materialSetTitle(item, lang) || "Без названия";
  }

  return "Без названия";
}

function langLabel(lang) {
  return ({ ru: "RU", en: "EN", zh: "中文" })[lang] || String(lang).toUpperCase();
}

function labelFromOptions(value, options) {
  return options.find(([key]) => key === value)?.[1] || "";
}

function normalizedGameVersion(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return "";

  const lower = text.toLowerCase();
  if (["unknown", "неизвестно", "none", "null", "-", "—"].includes(lower)) return "";

  const version = text.match(/\d+(?:\.\d+){0,2}/)?.[0] || "";
  return version || text;
}

function renderGameVersionBadge(item) {
  const version = normalizedGameVersion(item?.game_version || item?.release_version);
  if (!version) return "";
  return `<span class="game-version-badge" title="Версия игры ${escapeHtml(version)}" aria-label="Версия игры ${escapeHtml(version)}">v${escapeHtml(version)}</span>`;
}

function renderTitleWithGameVersion(item) {
  const rawTitle = String(titleOf(item, "ru") || "").trim();
  const badge = renderGameVersionBadge(item);

  if (!badge) return escapeHtml(rawTitle);
  if (!rawTitle) return badge;

  // Keep the version badge attached to the last word of the Russian title.
  // This lets the browser wrap the whole "last word + badge" group together
  // instead of leaving the badge alone on the next line.
  const match = rawTitle.match(/^([\s\S]*?)(\S+)$/u);
  if (!match) {
    return `${escapeHtml(rawTitle)}${badge}`;
  }

  const prefix = match[1] || "";
  const lastWord = match[2] || rawTitle;

  return `${escapeHtml(prefix)}<span class="book-title-tail">${escapeHtml(lastWord)}${badge}</span>`;
}

function bookTypeValue(item) {
  return item?.subtype || item?.book_type || "book_series";
}

function renderBookTypeCell(item) {
  return `<span class="common-enemy-type-chip">${escapeHtml(labelFromOptions(bookTypeValue(item), BOOK_TYPE_FILTERS) || "Книжная серия")}</span>`;
}

function iconFor(item) {
  return item?.icon || item?.image || item?.icon_path || "";
}

function renderTitleCell(item) {
  const en = titleOf(item, "en");
  const zh = titleOf(item, "zh");
  const subtitles = [en, zh].filter(Boolean).join(" · ");
  const icon = iconFor(item);
  const iconMarkup = icon
    ? `<img class="entry-icon" src="${escapeHtml(icon)}" alt="" loading="lazy" decoding="async" width="42" height="42">`
    : `<span class="entry-icon placeholder" aria-hidden="true">⌁</span>`;
  const materialsPreview = isEnemyDropEntry(item) ? `<div class="entry-material-preview">${renderMaterialsCell(item)}</div>` : "";
  return `
    <div class="entry-title-cell">
      ${iconMarkup}
      <div class="entry-title-text">
        <div class="book-title">${renderTitleWithGameVersion(item)}</div>
        <div class="book-subtitle">${escapeHtml(subtitles)}</div>
        ${materialsPreview}
      </div>
    </div>
  `;
}

function materialTitle(material, lang = "ru") {
  return material?.title?.[lang] || material?.title?.ru || material?.title?.en || material?.title?.zh || material?.name || material?.key || "Материал";
}

function renderCommonEnemyMaterialsCell(item) {
  const materials = Array.isArray(item?.materials) ? item.materials : [];
  if (!materials.length) return "—";

  const versionBadge = renderGameVersionBadge(item);

  return `
    <div class="catalog-material-plain-list">
      ${materials.map((material, index) => {
        const icon = material.icon ? `<img src="${escapeHtml(material.icon)}" alt="" loading="lazy" decoding="async" width="38" height="38">` : "";
        return `
          <div class="catalog-material-plain-item">
            ${icon}
            <span class="catalog-material-plain-text">
              <span class="catalog-material-plain-ru"><span class="catalog-material-title-label">${escapeHtml(materialTitle(material, "ru"))}</span>${index === 0 ? versionBadge : ""}</span>
              <span class="catalog-material-plain-sub">${escapeHtml([materialTitle(material, "en"), materialTitle(material, "zh")].filter(Boolean).join(" · "))}</span>
            </span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderMaterialsCell(item) {
  const materials = Array.isArray(item?.materials) ? item.materials : [];
  if (!materials.length) return "—";
  return `
    <div class="material-list">
      ${materials.map(material => {
        const icon = material.icon ? `<img src="${escapeHtml(material.icon)}" alt="" loading="lazy" decoding="async" width="28" height="28">` : "";
        return `<span class="material-chip">${icon}<span>${escapeHtml(materialTitle(material, "ru"))}</span></span>`;
      }).join("")}
    </div>
  `;
}

function droppedByEnemies(item) {
  return Array.isArray(item?.dropped_by_enemies) ? item.dropped_by_enemies : [];
}

function renderDevelopmentMaterialTypeCell(item) {
  const label = developmentMaterialTypeTitle(item, "ru");
  return `<span class="common-enemy-type-chip">${escapeHtml(label)}</span>`;
}

function renderGenericItemTypeCell(item) {
  const label = itemGroupTypeTitle(item, "ru");
  return `<span class="common-enemy-type-chip">${escapeHtml(label)}</span>`;
}

function renderCommonEnemyTypesCell(item) {
  const labels = itemCommonEnemyTypeLabels(item);
  if (!labels.length) return "—";

  return `
    <div class="common-enemy-type-list">
      ${labels.map(label => `<span class="common-enemy-type-chip">${escapeHtml(label)}</span>`).join("")}
    </div>
  `;
}

function renderDroppedByCell(item) {
  const enemies = droppedByEnemies(item);
  if (!enemies.length) {
    return Array.isArray(item?.materials) && item.materials.length ? renderMaterialsCell(item) : "—";
  }

  const visible = enemies.slice(0, 4);
  const rest = enemies.length - visible.length;

  return `
    <div class="dropped-by-catalog-list">
      ${visible.map(enemy => {
        const icon = enemy.icon ? `<img src="${escapeHtml(enemy.icon)}" alt="" loading="lazy" decoding="async" width="22" height="22">` : "";
        return `<span class="dropped-by-catalog-chip">${icon}<span>${escapeHtml(titleOf(enemy, "ru"))}</span></span>`;
      }).join("")}
      ${rest > 0 ? `<span class="tiny-pill">+${rest}</span>` : ""}
    </div>
  `;
}

function renderLootChip(drop, currentItemId = "") {
  const icon = drop.icon ? `<img src="${escapeHtml(drop.icon)}" alt="" loading="lazy" decoding="async" width="22" height="22">` : "";
  const currentClass = drop.id === currentItemId ? " current" : "";
  const title = titleOf(drop, state.lang);
  return `<span class="enemy-loot-chip${currentClass}">${icon}<span>${escapeHtml(title)}</span></span>`;
}

function renderEnemyDropDetail(enemy, currentItemId = "") {
  if (!enemy) {
    return `<div class="prose">Описание противника пока не найдено.</div>`;
  }

  const text = localizedEntryText(enemy) || "Описание противника будет добавлено позже.";
  const drops = Array.isArray(enemy.drops)
    ? enemy.drops.filter(drop => {
        if (!drop || drop.id === currentItemId) return false;
        const title = titleOf(drop, state.lang);
        return title && title !== "Без названия";
      })
    : [];
  const dropsBlock = drops.length ? `
    <div class="enemy-loot-list" aria-label="Также выпадает">
      ${drops.map(drop => renderLootChip(drop, currentItemId)).join("")}
    </div>
  ` : "";

  return `
    <div class="prose">${markdownToHtml(text)}</div>
    ${dropsBlock}
  `;
}

function renderEnemyNameBlock(enemy, className = "dropped-by-names") {
  return `
    <span class="${className}">
      <span class="dropped-by-name">${escapeHtml(titleOf(enemy, "ru"))}</span>
      <span class="dropped-by-meta">${escapeHtml(titleOf(enemy, "en"))}</span>
      <span class="dropped-by-zh">${escapeHtml(titleOf(enemy, "zh"))}</span>
    </span>
  `;
}

function renderDroppedBySection(item) {
  const enemies = droppedByEnemies(item);
  if (!enemies.length) return "";

  return `
    <div class="dropped-by-section">
      <div class="dropped-by-title">Выпадает с</div>
      <div class="dropped-by-grid">
        ${enemies.map(enemy => {
          const icon = enemy.icon
            ? `<img class="dropped-by-icon" src="${escapeHtml(enemy.icon)}" alt="" loading="lazy" decoding="async" width="46" height="46">`
            : `<span class="dropped-by-icon entry-icon placeholder" aria-hidden="true">⌁</span>`;
          return `
            <article class="dropped-by-card">
              <div class="dropped-by-card-inner">
                <div class="dropped-by-header">
                  ${icon}
                  ${renderEnemyNameBlock(enemy)}
                </div>
                ${renderEnemyDropDetail(enemy, item?.id || "")}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </div>
  `;
}


function bindDroppedByEnemies(item) {
  // Common enemy cards are rendered expanded by default.
}



function closeMenu() {
  document.body.classList.remove("menu-open");
}

function groupKeys(config) {
  return (config.groups || []).map(([key]) => key);
}

function isKnownGroup(config, value) {
  return Boolean(value && groupKeys(config).includes(value));
}

function groupValue(item, config) {
  const value = item?.[config.groupField] || item?.book_type || item?.subtype || item?.item_group || item?.category_type || item?.type || config.defaultGroup;
  return value || config.defaultGroup;
}

function groupLabel(config, key) {
  return (config.groups || []).find(([value]) => value === key)?.[1] || key;
}

function catalogBackLabel(config, groupKey = state.subsection) {
  if (config.id === "books") return "← Назад к списку книг";
  if (config.id === "artifacts") return "← Назад к списку артефактов";
  if (config.id === "weapons") return "← Назад к списку оружия";

  if (config.id === "items") {
    const labels = {
      weekly_bosses: "еженедельных боссов",
      world_bosses: "мировых боссов",
      common_enemies: "обычных противников",
      development_materials: "материалов развития",
      teyvat_resources: "ресурсов Тейвата",
      food_potions: "еды и зелий",
      useful_items: "полезных предметов",
      misc: "прочего",
    };
    return `← Назад к списку ${labels[groupKey] || "предметов"}`;
  }

  return `← Назад к списку ${String(config.title || "каталога").toLocaleLowerCase("ru-RU")}`;
}

function routeHash(section, entryId = null, subsection = null) {
  if (entryId && subsection) return `#/${section}/${subsection}/${entryId}`;
  if (entryId) return `#/${section}/${entryId}`;
  if (subsection) return `#/${section}/${subsection}`;
  return `#/${section}`;
}

function setRoute(section, entryId = null, subsection = null) {
  const config = getSectionConfig(section);
  const normalizedSection = config.id;
  const nextHash = routeHash(normalizedSection, entryId, subsection);

  state.section = normalizedSection;
  state.subsection = subsection;
  state.entryId = entryId;
  closeMenu();

  if (window.location.hash === nextHash) {
    render();
    return;
  }

  window.location.hash = nextHash;
}

function parseHash() {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const section = parts[0] || "books";
  const config = getSectionConfig(section);
  state.section = config.id;
  state.subsection = null;
  state.entryId = null;

  if (config.groups && isKnownGroup(config, parts[1])) {
    state.subsection = parts[1];
    state.entryId = parts[2] || null;
  } else {
    state.entryId = parts[1] || null;
  }
}

function renderNav() {
  nav.innerHTML = SECTIONS.map(section => `
    <button class="nav-item ${state.section === section.id ? "active" : ""}" type="button" data-section="${section.id}">
      <span class="nav-left"><img class="nav-icon" src="${section.icon}" alt="" loading="lazy" decoding="async" width="26" height="26">${section.title}</span>
      <span>›</span>
    </button>
  `).join("");

  nav.querySelectorAll("[data-section]").forEach(button => {
    button.addEventListener("click", () => setRoute(button.dataset.section));
  });
}

function collectionForCatalog(config) {
  let rows = config.data();
  if (config.groups && state.subsection) {
    rows = rows.filter(item => groupValue(item, config) === state.subsection);
  }
  return rows;
}

function optionsFor(config) {
  if (isCommonEnemyCatalog(config)) return COMMON_ENEMY_TYPE_FILTERS;
  if (config.filter === "region") return REGION_FILTERS;
  if (config.fixedOptions) return config.fixedOptions;
  return [];
}

function itemMatchesFilter(item, config, selected, activeTypeSet = null) {
  let matchesMainFilter = true;

  if (selected !== "all") {
    if (isCommonEnemyCatalog(config)) {
      matchesMainFilter = itemCommonEnemyTypes(item).has(normalizeCommonEnemyType(selected));
    } else if (config.filter === "region") {
      matchesMainFilter = String(item.region || "")
        .split(",")
        .map(region => region.trim())
        .includes(selected);
    } else {
      const value = item[config.filter] || item.type || item.item_type || item.weapon_type || item.category_type;
      matchesMainFilter = value === selected;
    }
  }

  if (!matchesMainFilter) return false;

  if (activeTypeSet) {
    return activeTypeSet.has(itemTypeFilterValue(item, config));
  }

  return true;
}

function fallbackSearchableText(item) {
  return [
    titleOf(item, "ru"),
    titleOf(item, "en"),
    titleOf(item, "zh"),
    item.region,
    item.game_version,
    item.release_version,
    item.type,
    item.subtype,
    item.book_type,
    item.item_group,
    item.item_type,
    item.item_type_title?.ru,
    item.item_type_title?.en,
    item.item_type_title?.zh,
    item.material_type,
    item.material_type_title?.ru,
    item.material_type_title?.en,
    item.material_type_title?.zh,
    item.weapon_type,
    item.category_type,
    item.rarity,
    item.source,
    item.related,
    ...(item.tags || []),
    ...(Array.isArray(item.materials) ? item.materials.flatMap(material => [
      material.key,
      materialTitle(material, "ru"),
      materialTitle(material, "en"),
      materialTitle(material, "zh")
    ]) : [])
  ].join(" ").toLocaleLowerCase("ru-RU");
}

function searchableText(item) {
  if (!item || typeof item !== "object") return "";
  if (SEARCH_TEXT_CACHE.has(item)) return SEARCH_TEXT_CACHE.get(item);

  const prepared = String(item.search_text || "").trim();
  const text = prepared ? prepared.toLocaleLowerCase("ru-RU") : fallbackSearchableText(item);
  SEARCH_TEXT_CACHE.set(item, text);
  return text;
}

function gameVersionSortValue(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return -1;

  const parts = text.match(/\d+/g);
  if (!parts?.length) return -1;

  const major = Number(parts[0] || 0);
  const minor = Number(parts[1] || 0);
  const patch = Number(parts[2] || 0);

  return major * 1000000 + minor * 1000 + patch;
}

function compareByTitle(a, b) {
  return collator.compare(titleOf(a, "ru"), titleOf(b, "ru"));
}

function compareByGameVersionDesc(a, b) {
  const versionResult = gameVersionSortValue(b.game_version) - gameVersionSortValue(a.game_version);
  return versionResult || compareByTitle(a, b);
}

function filteredEntries(config) {
  const filterState = state.filters[config.id];
  const query = filterState.query.trim().toLocaleLowerCase("ru-RU");
  const activeTypeSet = typeFiltersForCurrentCatalog(config).length
    ? new Set(activeTypeFilters(config))
    : null;

  const rows = collectionForCatalog(config).filter(item => {
    const queryOk = !query || searchableText(item).includes(query);
    const filterOk = itemMatchesFilter(item, config, filterState.filter, activeTypeSet);
    return queryOk && filterOk;
  });

  rows.sort((a, b) => {
    if (filterState.sort === "asc" || filterState.sort === "desc") {
      const result = compareByTitle(a, b);
      return filterState.sort === "asc" ? result : -result;
    }
    return compareByGameVersionDesc(a, b);
  });

  return rows;
}

function catalogRow(item, config) {
  const rowClass = config.id === "items" && state.subsection === "common_enemies"
    ? "cols-items-common-enemy"
    : config.id === "items" && state.subsection === "development_materials" ? "cols-items-development"
    : config.id === "items" && itemGroupUsesTypeFilters(state.subsection) ? "cols-items-typed"
    : config.id === "items" && isEnemyDropGroup(state.subsection) ? "cols-items-enemy" : `cols-${config.id}`;
  return `
    <div class="catalog-row item ${rowClass}" data-entry-id="${escapeHtml(item.id)}" tabindex="0" role="button" aria-label="Открыть ${escapeHtml(titleOf(item))}">
      ${config.row(item).map(cell => `<div>${cell}</div>`).join("")}
    </div>
  `;
}

function renderGroupSelector(config) {
  const groups = config.groups || [];
  app.innerHTML = `
    <section class="page-card catalog-page">
      <div class="page-head">
        <h1>${escapeHtml(config.title)}</h1>
        <p class="lead">${escapeHtml(config.description)}</p>
      </div>
      <div class="group-grid">
        ${groups.map(([key, label, description]) => {
          const count = config.data().filter(item => groupValue(item, config) === key).length;
          return `
            <button class="group-card" type="button" data-group="${escapeHtml(key)}">
              <span class="group-card-title">${escapeHtml(label)}</span>
              <span class="group-card-meta">${escapeHtml(description || "")}</span>
              <span class="tiny-pill">${count} записей</span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;

  document.querySelectorAll("[data-group]").forEach(button => {
    button.addEventListener("click", () => setRoute(config.id, null, button.dataset.group));
  });
}

function catalogPageSize(config) {
  const value = Number(state.filters[config.id]?.pageSize);
  return [10, 25, 50].includes(value) ? value : DEFAULT_CATALOG_PAGE_SIZE;
}

function renderPaginationControls(config, currentPage, totalPages, totalRows) {
  const pageSize = catalogPageSize(config);
  const pages = [];

  if (totalPages > 1) {
    for (let page = 1; page <= totalPages; page += 1) {
      if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1) {
        pages.push(page);
      } else if (pages[pages.length - 1] !== "…") {
        pages.push("…");
      }
    }
  }

  return `
    <nav class="pagination" aria-label="Страницы каталога">
      <div class="pagination-pages">
        ${totalPages > 1 ? `
          <button type="button" data-catalog-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>‹</button>
          ${pages.map(page => page === "…"
            ? `<span class="pagination-gap">…</span>`
            : `<button type="button" data-catalog-page="${page}" class="${page === currentPage ? "active" : ""}" aria-current="${page === currentPage ? "page" : "false"}">${page}</button>`
          ).join("")}
          <button type="button" data-catalog-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>›</button>
        ` : ""}
      </div>
      <label class="pagination-size">
        <span>На странице</span>
        <select id="catalog-page-size" aria-label="Количество записей на странице">
          ${[10, 25, 50].map(size => `<option value="${size}" ${size === pageSize ? "selected" : ""}>${size}</option>`).join("")}
        </select>
      </label>
      <span class="pagination-count">${totalRows} записей</span>
    </nav>
  `;
}

function bindPagination(config) {
  document.querySelectorAll("[data-catalog-page]").forEach(button => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.catalogPage);
      if (!Number.isFinite(page)) return;
      state.filters[config.id].page = page;
      updateCatalogTable(config);
    });
  });

  document.getElementById("catalog-page-size")?.addEventListener("change", event => {
    state.filters[config.id].pageSize = Number(event.target.value) || DEFAULT_CATALOG_PAGE_SIZE;
    state.filters[config.id].page = 1;
    updateCatalogTable(config);
  });
}

function renderCatalogTable(config) {
  const allRows = filteredEntries(config);
  const filterState = state.filters[config.id];
  const pageSize = catalogPageSize(config);
  const totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(filterState.page) || 1), totalPages);
  filterState.page = currentPage;
  const rows = allRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const sortUp = filterState.sort === "asc" ? "active" : "";
  const sortDown = filterState.sort === "desc" ? "active" : "";
  const columns = typeof config.columns === "function" ? config.columns() : config.columns;
  const rowClass = config.id === "items" && state.subsection === "common_enemies"
    ? "cols-items-common-enemy"
    : config.id === "items" && state.subsection === "development_materials" ? "cols-items-development"
    : config.id === "items" && itemGroupUsesTypeFilters(state.subsection) ? "cols-items-typed"
    : config.id === "items" && isEnemyDropGroup(state.subsection) ? "cols-items-enemy" : `cols-${config.id}`;
  const sortableFirstColumn = !isCommonEnemyCatalog(config) && !isDevelopmentMaterialsCatalog(config);

  return `
    <div class="catalog-table" id="catalog-table">
      <div class="catalog-row head ${rowClass}">
        ${columns.map((column, index) => index === 0 && sortableFirstColumn ? `
          <div>
            <button class="sortable-head" id="sort-title" type="button" aria-label="Сортировать по названию">
              <span>${escapeHtml(column)}</span>
              <span class="sort-arrows" aria-hidden="true"><span class="${sortUp}">▲</span><span class="${sortDown}">▼</span></span>
            </button>
          </div>
        ` : `<div>${escapeHtml(column)}</div>`).join("")}
      </div>
      ${rows.map(item => catalogRow(item, config)).join("") || `<div class="empty"><div class="empty-card">${escapeHtml(config.empty)}</div></div>`}
    </div>
    ${renderPaginationControls(config, currentPage, totalPages, allRows.length)}
  `;
}

function renderCatalog(config) {
  const filterState = state.filters[config.id];
  const options = optionsFor(config);
  const allowedFilters = new Set(["all", ...options.map(([value]) => value)]);
  if (!allowedFilters.has(filterState.filter)) {
    filterState.filter = "all";
  }
  const subsectionTitle = state.subsection ? groupLabel(config, state.subsection) : "";

  app.innerHTML = `
    <section class="page-card catalog-page">
      <div class="page-head">
        <h1>${escapeHtml(subsectionTitle || config.title)}</h1>
        <p class="lead">${escapeHtml(subsectionTitle ? config.description : config.description)}</p>
      </div>

      ${config.groups && state.subsection ? `
        <div class="catalog-subhead">
          <button class="back-link" id="back-groups" type="button">← Назад к разделам</button>
          <div class="catalog-subtitle">${escapeHtml(config.title)} / ${escapeHtml(subsectionTitle)}</div>
        </div>
      ` : ""}

      <div class="toolbar">
        <label class="search" aria-label="Поиск">
          <span class="search-symbol">⌕</span>
          <input id="catalog-search" type="text" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Начни вводить текст…" value="${escapeHtml(filterState.query)}">
          <button class="search-clear ${filterState.query ? "visible" : ""}" id="clear-search" type="button" aria-label="Очистить поиск">×</button>
        </label>

        <select class="select" id="catalog-filter" aria-label="Фильтр">
          <option value="all">${escapeHtml(catalogFilterLabel(config))}</option>
          ${options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${filterState.filter === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
        </select>
        ${renderTypeFilters(config)}
      </div>

      <div id="catalog-holder">${renderCatalogTable(config)}</div>
    </section>
  `;

  document.getElementById("back-groups")?.addEventListener("click", () => setRoute(config.id));
  bindCatalog(config);
}

function updateCatalogTable(config) {
  document.getElementById("catalog-holder").innerHTML = renderCatalogTable(config);
  bindCatalogRows(config);
  bindPagination(config);
  document.getElementById("sort-title")?.addEventListener("click", () => toggleSort(config));
}

function toggleSort(config) {
  const filterState = state.filters[config.id];
  filterState.sort = filterState.sort === "asc" ? "desc" : "asc";
  filterState.page = 1;
  updateCatalogTable(config);
}

function bindCatalogRows(config) {
  document.querySelectorAll("[data-entry-id]").forEach(row => {
    row.addEventListener("click", event => {
      if (event.target.closest("button")) return;
      setRoute(config.id, row.dataset.entryId, state.subsection);
    });
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setRoute(config.id, row.dataset.entryId, state.subsection);
      }
    });
  });
}

function bindCatalog(config) {
  const filterState = state.filters[config.id];
  const search = document.getElementById("catalog-search");
  const filter = document.getElementById("catalog-filter");
  const clearSearch = document.getElementById("clear-search");

  const debouncedUpdateCatalog = debounce(() => updateCatalogTable(config));

  search?.addEventListener("input", event => {
    filterState.query = event.target.value;
    filterState.page = 1;
    clearSearch?.classList.toggle("visible", Boolean(filterState.query));
    debouncedUpdateCatalog();
  });

  clearSearch?.addEventListener("click", () => {
    filterState.query = "";
    filterState.page = 1;
    if (search) {
      search.value = "";
      search.focus();
    }
    clearSearch.classList.remove("visible");
    updateCatalogTable(config);
  });

  filter?.addEventListener("change", event => {
    filterState.filter = event.target.value;
    filterState.page = 1;
    updateCatalogTable(config);
  });

  document.querySelectorAll(".type-filter-chip input").forEach(input => {
    input.addEventListener("change", () => {
      const checked = Array.from(document.querySelectorAll(".type-filter-chip input:checked")).map(item => item.value);
      filterState.page = 1;
      if (config.id === "items") {
        if (!filterState.typeFiltersByGroup) filterState.typeFiltersByGroup = {};
        filterState.typeFiltersByGroup[state.subsection] = checked.length ? checked : [];
      } else {
        filterState.typeFilters = checked.length ? checked : [];
      }
      updateCatalogTable(config);
    });
  });

  document.getElementById("sort-title")?.addEventListener("click", () => toggleSort(config));
  bindCatalogRows(config);
  bindPagination(config);
}

function renderBookDetail(book) {
  app.innerHTML = `
    <section class="page-card book-page">
      <button class="back-link" id="back-books" type="button">← Назад к списку книг</button>

      <div class="page-head">
        <h1>${escapeHtml(titleOf(book, "ru"))}</h1>
        <div class="subtitle">${escapeHtml(titleOf(book, "en"))} · ${escapeHtml(titleOf(book, "zh"))}</div>
      </div>

      <div class="reader-toolbar book-toolbar" aria-label="Управление чтением">
        <div class="volume-strip" aria-label="Оглавление томов">
          <button class="mode-button ${state.readAll ? "active" : ""}" id="toggle-read-all" type="button">${state.readAll ? "Читать по томам" : "Читать всё подряд"}</button>
          <div class="parts-row">
            <span class="toolbar-label">Тома</span>
            <div class="volume-scroll">
              ${book.volumes.map(volume => `<button type="button" data-volume="${volume.number}" class="${!state.readAll && state.volume === volume.number ? "active" : ""}">${escapeHtml(volume.title?.[state.lang] || "Том " + volume.number)}</button>`).join("")}
            </div>
          </div>
        </div>
      </div>

      <div id="reader-text-area">${renderTextArea(book)}</div>

      <details class="catalog-meta">
        <summary>Сведения для каталога и фильтров</summary>
        <div class="catalog-meta-body">
          <div><strong>Регион:</strong> ${escapeHtml(book.region || "—")}</div>
          <div><strong>Томов:</strong> ${escapeHtml(book.volume_count || book.volumes.length)}</div>
          <div><strong>Языки:</strong> ${(book.languages || []).map(langLabel).join(" · ")}</div>
          <div class="tag-list">${(book.tags || []).map(tag => `<span class="tiny-pill">#${escapeHtml(tag)}</span>`).join("")}</div>
        </div>
      </details>

    </section>
  `;

  bindBookDetail(book);
}

function renderTextArea(book) {
  const volumes = state.readAll ? book.volumes : book.volumes.filter(volume => volume.number === state.volume);
  const generalNote = cleanPublicNote(book.notes?.general || "");
  const volumeNotes = book.notes?.byVolume || {};

  return volumes.map((volume, index) => {
    const volumeTitle = escapeHtml(volume.title?.[state.lang] || "Том " + volume.number);
    const languageControl = index === 0 ? `
      <div class="lang-control" aria-label="Язык текста">
        <span class="toolbar-label">Язык</span>
        <div class="lang-switch">
          ${["ru", "en", "zh"].map(lang => `<button type="button" data-lang="${lang}" class="${state.lang === lang ? "active" : ""}">${langLabel(lang)}</button>`).join("")}
        </div>
      </div>
    ` : "";

    const volumeNote = cleanPublicNote(volumeNotes[volume.number] || "");
    const noteText = volumeNote || (index === 0 ? generalNote : "");
    const notesBlock = noteText ? `
        <div class="notes">
          <div class="notes-title">Заметки Лороведьмы</div>
          <div class="notes-body">${markdownToHtml(noteText)}</div>
        </div>
    ` : "";

    return `
      <article class="text-card" id="volume-${volume.number}">
        <div class="volume-title">
          <div class="volume-title-main"><h3>${volumeTitle}</h3></div>
          ${languageControl}
        </div>
        <div class="prose">${markdownToHtml(volume.text?.[state.lang] || "[нет текста]")}</div>
        ${notesBlock}
      </article>
    `;
  }).join("");
}

function artifactPartTitle(part, lang = state.lang) {
  return part?.title?.[lang] || ARTIFACT_PART_LABELS[part?.key]?.[lang] || part?.title?.ru || part?.key || "Часть сета";
}

function renderArtifactDetail(artifact) {
  const parts = Array.isArray(artifact.parts) ? artifact.parts : [];
  if (!parts.length) {
    renderGenericDetail(artifact, getSectionConfig("artifacts"));
    return;
  }

  if (!parts.some(part => part.key === state.artifactPart)) {
    state.artifactPart = parts[0].key;
  }

  app.innerHTML = `
    <section class="page-card book-page">
      <button class="back-link" id="back-artifacts" type="button">← Назад к списку артефактов</button>

      <div class="page-head">
        <h1>${escapeHtml(titleOf(artifact, "ru"))}</h1>
        <div class="subtitle">${escapeHtml([titleOf(artifact, "en"), titleOf(artifact, "zh")].filter(Boolean).join(" · "))}</div>
      </div>

      <div class="reader-toolbar artifact-toolbar" aria-label="Управление чтением сета артефактов">
        <div class="volume-strip" aria-label="Части сета">
          <button class="mode-button ${state.artifactReadAll ? "active" : ""}" id="toggle-artifact-read-all" type="button">${state.artifactReadAll ? "Читать по частям" : "Читать весь сет"}</button>
          <div class="parts-row">
            <span class="toolbar-label">Части</span>
            <div class="volume-scroll">
              ${parts.map(part => `<button type="button" data-artifact-part="${escapeHtml(part.key)}" class="${!state.artifactReadAll && state.artifactPart === part.key ? "active" : ""}">${escapeHtml(artifactPartTitle(part, state.lang))}</button>`).join("")}
            </div>
          </div>
        </div>
      </div>

      <div id="reader-text-area">${renderArtifactTextArea(artifact)}</div>

      <details class="catalog-meta">
        <summary>Сведения для каталога и фильтров</summary>
        <div class="catalog-meta-body">
          <div><strong>Регион:</strong> ${escapeHtml(artifact.region || "—")}</div>
          <div><strong>Частей:</strong> ${escapeHtml(artifact.piece_count || parts.length)}</div>
          <div><strong>Языки:</strong> ${(artifact.languages || []).map(langLabel).join(" · ")}</div>
          <div class="tag-list">${(artifact.tags || []).map(tag => `<span class="tiny-pill">#${escapeHtml(tag)}</span>`).join("")}</div>
        </div>
      </details>
    </section>
  `;

  bindArtifactDetail(artifact);
}

function renderArtifactTextArea(artifact) {
  const parts = Array.isArray(artifact.parts) ? artifact.parts : [];
  const selectedParts = state.artifactReadAll ? parts : parts.filter(part => part.key === state.artifactPart);
  const generalNote = cleanPublicNote(artifact.notes?.general || "");
  const partNotes = artifact.notes?.byPart || artifact.notes?.byVolume || {};

  return selectedParts.map((part, index) => {
    const partTitle = escapeHtml(artifactPartTitle(part, state.lang));
    const languageControl = index === 0 ? `
      <div class="lang-control" aria-label="Язык текста">
        <span class="toolbar-label">Язык</span>
        <div class="lang-switch">
          ${["ru", "en", "zh"].map(lang => `<button type="button" data-lang="${lang}" class="${state.lang === lang ? "active" : ""}">${langLabel(lang)}</button>`).join("")}
        </div>
      </div>
    ` : "";

    const noteText = cleanPublicNote(partNotes[part.key] || "") || (index === 0 ? generalNote : "");
    const notesBlock = noteText ? `
        <div class="notes">
          <div class="notes-title">Заметки Лороведьмы</div>
          <div class="notes-body">${markdownToHtml(noteText)}</div>
        </div>
    ` : "";

    return `
      <article class="text-card artifact-text-card" id="artifact-part-${escapeHtml(part.key)}">
        <div class="volume-title">
          <div class="volume-title-main"><h3>${partTitle}</h3></div>
          ${languageControl}
        </div>
        <div class="prose">${markdownToHtml(emphasizeArtifactLabels(part.text?.[state.lang] || "[нет текста]"))}</div>
        ${notesBlock}
      </article>
    `;
  }).join("");
}

function bindArtifactDetail(artifact) {
  document.getElementById("back-artifacts")?.addEventListener("click", () => setRoute("artifacts", null, state.subsection));

  document.getElementById("toggle-artifact-read-all")?.addEventListener("click", () => {
    state.artifactReadAll = !state.artifactReadAll;
    preserveScrollRender(() => renderArtifactDetail(artifact));
  });

  document.querySelectorAll("[data-artifact-part]").forEach(button => {
    button.addEventListener("click", () => {
      state.artifactPart = button.dataset.artifactPart;
      state.artifactReadAll = false;
      preserveScrollRender(() => renderArtifactDetail(artifact));
    });
  });

  document.querySelectorAll("[data-lang]").forEach(button => {
    button.addEventListener("click", () => {
      state.lang = button.dataset.lang;
      preserveScrollRender(() => renderArtifactDetail(artifact));
    });
  });
}

function localizedEntryText(item) {
  const text = item?.text;
  const description = item?.description;

  if (text && typeof text === "object") {
    return text[state.lang] || text.ru || text.en || text.zh || "";
  }
  if (description && typeof description === "object") {
    return description[state.lang] || description.ru || description.en || description.zh || "";
  }
  return text || description || "";
}

function genericNotes(item) {
  const notes = item?.notes;
  if (!notes) return "";
  if (typeof notes === "string") return cleanPublicNote(notes);
  return cleanPublicNote(notes.general || "");
}


function localizedMaterialText(material) {
  const text = material?.text;
  if (text && typeof text === "object") return text[state.lang] || text.ru || text.en || text.zh || "";
  return text || "";
}


function fitEnemyDescriptionPanel() {
  document.querySelectorAll(".enemy-description-panel").forEach(panel => {
    const textNode = panel.querySelector(".enemy-description-text");
    const button = panel.querySelector(".enemy-description-toggle");
    if (!textNode || !button) return;

    const wasExpanded = panel.classList.contains("is-collapsible") && !panel.classList.contains("is-collapsed");

    panel.classList.remove("is-collapsible", "is-collapsed");
    button.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.textContent = "Показать полностью";

    const styles = getComputedStyle(textNode);
    const lineHeight = parseFloat(styles.lineHeight) || 28;
    const maxVisibleHeight = lineHeight * 3.15;
    const isTooTall = textNode.scrollHeight > maxVisibleHeight + 6;

    if (!isTooTall) return;

    panel.classList.add("is-collapsible");
    button.hidden = false;

    if (wasExpanded) {
      button.setAttribute("aria-expanded", "true");
      button.textContent = "Свернуть";
    } else {
      panel.classList.add("is-collapsed");
    }
  });
}

function renderEnemyDropsDetail(item, config) {
  const materials = Array.isArray(item.materials) ? item.materials : [];
  if (!materials.length) {
    renderGenericDetail(item, config);
    return;
  }

  if (!materials.some(material => material.key === state.itemMaterial)) {
    state.itemMaterial = materials[0].key;
  }

  const enemyDescription = localizedEntryText(item);
  const enemyIcon = item.icon
    ? `<img class="enemy-description-icon" src="${escapeHtml(item.icon)}" alt="" loading="lazy" decoding="async" width="88" height="88">`
    : "";
  const enemyDescriptionBlock = enemyDescription ? `
      <div class="enemy-overview-card enemy-description-panel${enemyIcon ? "" : " no-icon"}">
        ${enemyIcon}
        <div class="enemy-description-content">
          <div class="prose enemy-description-text">${markdownToHtml(enemyDescription)}</div>
          <button class="enemy-description-toggle" type="button" aria-expanded="false" hidden>Показать полностью</button>
        </div>
      </div>
  ` : "";
  const commonEnemyLootPage = item.item_group === "common_enemies";
  const developmentMaterialPage = item.item_group === "development_materials";
  const simpleMaterialSetPage = commonEnemyLootPage || developmentMaterialPage;
  const bossLootPage = isEnemyDropGroup(item.item_group) && !commonEnemyLootPage;
  const pageHeadBlock = simpleMaterialSetPage ? "" : `
      <div class="page-head">
        <h1>${escapeHtml(titleOf(item, "ru"))}</h1>
        <div class="subtitle">${escapeHtml([titleOf(item, "en"), titleOf(item, "zh")].filter(Boolean).join(" · "))}</div>
      </div>
  `;

  app.innerHTML = `
    <section class="page-card book-page${commonEnemyLootPage ? " common-enemy-loot-page" : ""}${developmentMaterialPage ? " development-material-page" : ""}${bossLootPage ? " boss-loot-page" : ""}">
      <button class="back-link" id="back-section" type="button">${escapeHtml(catalogBackLabel(config, state.subsection))}</button>
      ${pageHeadBlock}

      ${enemyDescriptionBlock}

      <div class="reader-toolbar artifact-toolbar" aria-label="Материалы">
        <div class="volume-strip" aria-label="Материалы">
          <button class="mode-button ${state.itemReadAll ? "active" : ""}" id="toggle-item-read-all" type="button">${state.itemReadAll ? "Читать по материалам" : "Читать все материалы"}</button>
          <div class="parts-row">
            <span class="toolbar-label">Материалы</span>
            <div class="volume-scroll item-material-tabs">
              ${materials.map(material => `<button type="button" data-item-material="${escapeHtml(material.key)}" class="${!state.itemReadAll && state.itemMaterial === material.key ? "active" : ""}">${escapeHtml(materialTitle(material, state.lang))}</button>`).join("")}
            </div>
          </div>
        </div>
      </div>

      <div id="reader-text-area">${renderEnemyMaterialsTextArea(item)}</div>

      ${item.item_group === "common_enemies" ? renderDroppedBySection(item) : ""}

      <details class="catalog-meta">
        <summary>Сведения для каталога и фильтров</summary>
        <div class="catalog-meta-body">
          <div><strong>Категория:</strong> ${escapeHtml(groupLabel(config, item.item_group) || "—")}</div>
          <div><strong>Регион:</strong> ${escapeHtml(item.region || "—")}</div>
          <div><strong>Материалов:</strong> ${escapeHtml(item.material_count || materials.length)}</div>
          <div><strong>Языки:</strong> ${(item.languages || []).map(langLabel).join(" · ")}</div>
          <div class="tag-list">${(item.tags || []).map(tag => `<span class="tiny-pill">#${escapeHtml(tag)}</span>`).join("")}</div>
        </div>
      </details>
    </section>
  `;

  bindEnemyDropsDetail(item, config);
}


function renderEnemyMaterialsTextArea(item) {
  const materials = Array.isArray(item.materials) ? item.materials : [];
  const selectedMaterials = state.itemReadAll ? materials : materials.filter(material => material.key === state.itemMaterial);
  const generalNote = cleanPublicNote(item.notes?.general || "");

  return selectedMaterials.map((material, index) => {
    const isCommonEnemyMaterial = item?.item_group === "common_enemies";
    const isDevelopmentMaterial = item?.item_group === "development_materials";
    const isCompactMaterialSet = isCommonEnemyMaterial || isDevelopmentMaterial;
    const title = escapeHtml(materialTitle(material, isCompactMaterialSet ? "ru" : state.lang));
    const text = localizedMaterialText(material) || "Описание материала будет добавлено позже.";
    const titleSubtitle = isCompactMaterialSet ? `
      <div class="material-title-subtitle">
        ${escapeHtml([materialTitle(material, "en"), materialTitle(material, "zh")].filter(Boolean).join(" · "))}
      </div>
    ` : "";
    const languageControl = index === 0 ? `
      <div class="lang-control" aria-label="Язык текста">
        <span class="toolbar-label">Язык</span>
        <div class="lang-switch">
          ${["ru", "en", "zh"].map(lang => `<button type="button" data-lang="${lang}" class="${state.lang === lang ? "active" : ""}">${langLabel(lang)}</button>`).join("")}
        </div>
      </div>
    ` : "";
    const iconSize = isCompactMaterialSet ? 104 : 128;
    const iconMarkup = material.icon ? `<img class="material-float-icon" src="${escapeHtml(material.icon)}" alt="" loading="lazy" decoding="async" width="${iconSize}" height="${iconSize}">` : "";
    const notesBlock = index === 0 && generalNote ? `
      <div class="notes">
        <div class="notes-title">Заметки Лороведьмы</div>
        <div class="notes-body">${markdownToHtml(generalNote)}</div>
      </div>
    ` : "";

    return `
      <article class="text-card artifact-text-card${isCompactMaterialSet ? " common-enemy-material-card" : ""}" id="item-material-${escapeHtml(material.key)}">
        <div class="volume-title">
          <div class="volume-title-main"><h3>${title}</h3>${titleSubtitle}</div>
          ${languageControl}
        </div>
        <div class="prose material-reader-body">${iconMarkup}${markdownToHtml(text)}</div>
        ${notesBlock}
      </article>
    `;
  }).join("");
}


function fitItemMaterialTabs() {
  document.querySelectorAll(".item-material-tabs").forEach(tabs => {
    const buttons = Array.from(tabs.querySelectorAll("[data-item-material]"));
    if (!buttons.length) return;

    buttons.forEach(button => {
      button.classList.remove("item-material-wide");
      button.style.removeProperty("--item-material-label-width");
    });

    const available = tabs.clientWidth;
    if (!available) return;

    buttons.forEach(button => {
      const measuredWidth = button.scrollWidth;
      if (measuredWidth > available * 0.62) {
        button.classList.add("item-material-wide");
      }
    });
  });
}

function bindEnemyDropsDetail(item, config) {
  fitItemMaterialTabs();
  bindDroppedByEnemies(item);
  requestAnimationFrame(fitEnemyDescriptionPanel);

  document.querySelectorAll(".enemy-description-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const panel = button.closest(".enemy-description-panel");
      if (!panel) return;

      const isCollapsed = panel.classList.toggle("is-collapsed");
      button.setAttribute("aria-expanded", String(!isCollapsed));
      button.textContent = isCollapsed ? "Показать полностью" : "Свернуть";
    });
  });

  document.getElementById("back-section")?.addEventListener("click", () => setRoute(config.id, null, state.subsection));

  document.getElementById("toggle-item-read-all")?.addEventListener("click", () => {
    state.itemReadAll = !state.itemReadAll;
    preserveScrollRender(() => renderEnemyDropsDetail(item, config));
  });

  document.querySelectorAll("[data-item-material]").forEach(button => {
    button.addEventListener("click", () => {
      state.itemMaterial = button.dataset.itemMaterial;
      state.itemReadAll = false;
      preserveScrollRender(() => renderEnemyDropsDetail(item, config));
    });
  });

  document.querySelectorAll("[data-lang]").forEach(button => {
    button.addEventListener("click", () => {
      state.lang = button.dataset.lang;
      preserveScrollRender(() => renderEnemyDropsDetail(item, config));
    });
  });
}

function renderGenericDetail(item, config) {
  if (!item) {
    renderError("Запись не найдена.");
    return;
  }

  const text = localizedEntryText(item) || "Текст этой записи будет добавлен позже.";
  const noteText = genericNotes(item);
  const notesBlock = noteText ? `
    <div class="notes">
      <div class="notes-title">Заметки Лороведьмы</div>
      <div class="notes-body">${markdownToHtml(noteText)}</div>
    </div>
  ` : "";
  const isWeapon = config.id === "weapons";
  const isSimpleItem = config.id === "items";
  const weaponTextParts = isWeapon ? splitWeaponDescriptionText(text) : { description: text, details: "" };
  const weaponIcon = isWeapon && item.icon
    ? `<img class="weapon-description-icon" src="${escapeHtml(item.icon)}" alt="" loading="lazy" decoding="async" width="88" height="88">`
    : "";
  const itemFloatIcon = isSimpleItem && item.icon
    ? `<img class="item-description-float-icon" src="${escapeHtml(item.icon)}" alt="" loading="lazy" decoding="async" width="104" height="104">`
    : "";
  const weaponDescriptionBlock = isWeapon && weaponTextParts.description ? `
        <div class="weapon-description-panel${weaponIcon ? "" : " no-icon"}">
          ${weaponIcon}
          <div class="prose">${markdownToHtml(weaponTextParts.description)}</div>
        </div>
  ` : "";
  const weaponDetailsBlock = isWeapon && weaponTextParts.details ? `
        <div class="prose weapon-detail-main-text">${markdownToHtml(weaponTextParts.details)}</div>
  ` : "";
  const bodyBlock = isWeapon ? `
        ${weaponDescriptionBlock || weaponDetailsBlock || `<div class="prose">${markdownToHtml(text)}</div>`}
        ${weaponDescriptionBlock ? weaponDetailsBlock : ""}
  ` : isSimpleItem ? `
        <div class="prose item-description-prose">${itemFloatIcon}${markdownToHtml(text)}</div>
  ` : `
        <div class="prose">${markdownToHtml(text)}</div>
  `;
  const droppedByBlock = config.id === "items" && item?.item_group === "common_enemies"
    ? renderDroppedBySection(item)
    : "";

  app.innerHTML = `
    <section class="page-card book-page">
      <button class="back-link" id="back-section" type="button">${escapeHtml(catalogBackLabel(config, state.subsection))}</button>
      <div class="page-head">
        <h1>${escapeHtml(titleOf(item, "ru"))}</h1>
        <div class="subtitle">${escapeHtml([titleOf(item, "en"), titleOf(item, "zh")].filter(Boolean).join(" · "))}</div>
      </div>
      <article class="text-card generic-text-card ${config.id}-detail-card">
        <div class="volume-title generic-title">
          <div class="volume-title-main"><h3>${(config.id === "weapons" || config.id === "items") ? "Описание" : "Текст"}</h3></div>
          <div class="lang-control" aria-label="Язык текста">
            <span class="toolbar-label">Язык</span>
            <div class="lang-switch">
              ${["ru", "en", "zh"].map(lang => `<button type="button" data-lang="${lang}" class="${state.lang === lang ? "active" : ""}">${langLabel(lang)}</button>`).join("")}
            </div>
          </div>
        </div>
        ${bodyBlock}
        ${droppedByBlock}
        ${notesBlock}
      </article>
    </section>
  `;

  document.getElementById("back-section")?.addEventListener("click", () => setRoute(config.id, null, state.subsection));
  bindDroppedByEnemies(item);
  document.querySelectorAll("[data-lang]").forEach(button => {
    button.addEventListener("click", () => {
      state.lang = button.dataset.lang;
      preserveScrollRender(() => renderGenericDetail(item, config));
    });
  });
}

function preserveScrollRender(renderFn) {
  const x = window.scrollX;
  const y = window.scrollY;
  renderFn();
  requestAnimationFrame(() => window.scrollTo(x, y));
}

function bindBookDetail(book) {
  document.getElementById("back-books")?.addEventListener("click", () => setRoute("books"));

  document.getElementById("toggle-read-all")?.addEventListener("click", () => {
    state.readAll = !state.readAll;
    preserveScrollRender(() => renderBookDetail(book));
  });

  document.querySelectorAll("[data-volume]").forEach(button => {
    button.addEventListener("click", () => {
      state.volume = Number(button.dataset.volume);
      state.readAll = false;
      preserveScrollRender(() => renderBookDetail(book));
    });
  });

  document.querySelectorAll("[data-lang]").forEach(button => {
    button.addEventListener("click", () => {
      state.lang = button.dataset.lang;
      preserveScrollRender(() => renderBookDetail(book));
    });
  });
}

function renderLoading(message = "Загружаю архив…") {
  app.innerHTML = `
    <section class="page-card">
      <div class="empty"><div class="empty-card">${escapeHtml(message)}</div></div>
    </section>
  `;
}

function renderError(message) {
  app.innerHTML = `
    <section class="page-card">
      <div class="page-head"><h1>Ошибка загрузки</h1></div>
      <div class="empty"><div class="empty-card">${escapeHtml(message)}</div></div>
    </section>
  `;
}

async function render() {
  const sequence = ++renderSequence;
  parseHash();
  renderNav();
  const config = getSectionConfig();

  if (!LOADED_SECTIONS.has(config.id)) {
    renderLoading(`Загружаю раздел «${config.title}»…`);
    try {
      await loadSectionData(config.id);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось загрузить данные раздела.");
      return;
    }
    if (sequence !== renderSequence) return;
  }

  if (!state.entryId && config.groups && !state.subsection) {
    renderGroupSelector(config);
    return;
  }

  if (state.section === "books" && state.entryId) {
    renderLoading("Открываю книгу…");
    try {
      const book = await getBookById(state.entryId);
      if (sequence !== renderSequence) return;
      if (!state.subsection) state.subsection = groupValue(book, config);
      renderBookDetail(book);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось открыть книгу.");
    }
    return;
  }

  if (state.section === "artifacts" && state.entryId) {
    renderLoading("Открываю сет артефактов…");
    try {
      const artifact = await getGenericDetail("artifacts", state.entryId);
      if (sequence !== renderSequence) return;
      renderArtifactDetail(artifact);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось открыть сет артефактов.");
    }
    return;
  }

  if (state.entryId) {
    renderLoading("Открываю запись…");
    try {
      const item = await getGenericDetail(config.id, state.entryId);
      if (sequence !== renderSequence) return;
      if (config.id === "items" && isEnemyDropEntry(item)) {
        renderEnemyDropsDetail(item, config);
      } else {
        renderGenericDetail(item, config);
      }
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось открыть запись.");
    }
    return;
  }

  renderCatalog(config);
}

async function init() {
  renderLoading();
  await render();
}

document.getElementById("open-menu")?.addEventListener("click", () => document.body.classList.add("menu-open"));
document.getElementById("drawer-backdrop")?.addEventListener("click", closeMenu);
window.addEventListener("hashchange", render);
window.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu();
});


const toTopButton = document.getElementById("to-top-button");
let responsiveFitFrame = 0;

function scheduleResponsiveFit() {
  if (responsiveFitFrame) return;
  responsiveFitFrame = window.requestAnimationFrame(() => {
    responsiveFitFrame = 0;
    fitItemMaterialTabs();
    fitEnemyDescriptionPanel();
  });
}

function updateToTopButton() {
  if (!toTopButton) return;
  toTopButton.classList.toggle("visible", window.scrollY > 520);
}

toTopButton?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("scroll", updateToTopButton, { passive: true });
updateToTopButton();

init();

window.addEventListener("resize", scheduleResponsiveFit);
