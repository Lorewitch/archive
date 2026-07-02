let BOOKS = [];
let ARTIFACTS = [];
let WEAPONS = [];
let ITEMS = [];
let STORIES = [];
const DETAILS = new Map();
const LOADED_SECTIONS = new Set();
const SECTION_LOADS = new Map();
const SEARCH_TEXT_CACHE = new WeakMap();
const STORY_SEARCH_TEXTS = new Map();
let storySearchLoad = null;
const COMMON_ENEMY_TYPES_CACHE = new WeakMap();
const expandedEnemyDescriptionKeys = new Set();
const catalogScrollPositions = new Map();
let renderSequence = 0;
let renderedRouteKey = "";
let activeDetail = null;
let backgroundPrefetchStarted = false;
let lastPrefetchedEntryKey = "";
let menuScrollY = 0;

// Keep idle prefetch limited to small catalog indexes.
// Heavy sections stay lazy-loaded so the first visit does not quietly pull
// several megabytes of JSON after rendering the start page.
const BACKGROUND_PREFETCH_SECTIONS = new Set(["artifacts", "weapons"]);

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

function versionedAssetPath(path) {
  const value = String(path || "");
  if (!DATA_CACHE_VERSION || !value.startsWith("assets/")) return value;
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}v=${encodeURIComponent(DATA_CACHE_VERSION)}`;
}

function cssUrl(value) {
  return `url("${String(value || "").replace(/"/g, "%22")}")`;
}


function maskIconStyle(icon, color = "") {
  const parts = [];
  if (color) parts.push(`--filter-color: ${color}`);
  if (icon) {
    const url = cssUrl(versionedAssetPath(icon));
    parts.push(`-webkit-mask-image: ${url}`);
    parts.push(`mask-image: ${url}`);
    parts.push(`-webkit-mask-repeat: no-repeat`);
    parts.push(`mask-repeat: no-repeat`);
    parts.push(`-webkit-mask-position: center`);
    parts.push(`mask-position: center`);
    parts.push(`-webkit-mask-size: contain`);
    parts.push(`mask-size: contain`);
  }
  return parts.join("; ");
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

async function loadStorySearchIndex() {
  if (STORY_SEARCH_TEXTS.size) return STORY_SEARCH_TEXTS;
  if (storySearchLoad) return storySearchLoad;

  storySearchLoad = fetchOptionalJson("data/stories_search.json")
    .then(rows => {
      rows.forEach(row => {
        const id = String(row?.id || "").trim();
        if (!id) return;
        STORY_SEARCH_TEXTS.set(id, String(row.search_text || "").toLocaleLowerCase("ru-RU"));
      });
      return STORY_SEARCH_TEXTS;
    })
    .finally(() => { storySearchLoad = null; });

  return storySearchLoad;
}

function ensureStorySearchIndexForQuery(config, query) {
  if (config.id !== "stories" || !String(query || "").trim() || STORY_SEARCH_TEXTS.size || storySearchLoad) return;

  loadStorySearchIndex().then(() => {
    if (state.section === "stories" && currentFilterState().query.trim()) {
      updateCatalogTable(getSectionConfig("stories"));
    }
  }).catch(() => {});
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
  if (sectionId === "stories") STORIES = list;
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

const UI_ICON_BASE = "assets/icons/ui";

const ICON_COLORS = {
  pyro: "#f05a3f",
  hydro: "#48a7df",
  anemo: "#5ed0b7",
  electro: "#a675dc",
  dendro: "#74bf5d",
  cryo: "#83d6e8",
  geo: "#d2a23a",
  witchcraft: "#d690d6",
  lunar_reactions: "#72c7dc",
  star_blade: "#d7b35a",
  sword: "#34362d",
  claymore: "#34362d",
  bow: "#34362d",
  catalyst: "#34362d",
  polearm: "#34362d",
  rarity5: "#f0b45e",
  rarity4: "#b293e0",
  rarity3: "#9fd0ed",
  rarity2: "#9dcd75",
  rarity1: "#756f66",
};

const WEAPON_TYPE_FILTERS = [
  { value: "weapon:sword", label: "Одноручное", icon: `${UI_ICON_BASE}/sword.webp`, color: ICON_COLORS.sword, group: "weapon" },
  { value: "weapon:claymore", label: "Двуручное", icon: `${UI_ICON_BASE}/claymore.webp`, color: ICON_COLORS.claymore, group: "weapon" },
  { value: "weapon:bow", label: "Лук", icon: `${UI_ICON_BASE}/bow.webp`, color: ICON_COLORS.bow, group: "weapon" },
  { value: "weapon:catalyst", label: "Катализатор", icon: `${UI_ICON_BASE}/catalyst.webp`, color: ICON_COLORS.catalyst, group: "weapon" },
  { value: "weapon:polearm", label: "Древковое", icon: `${UI_ICON_BASE}/polearm.webp`, color: ICON_COLORS.polearm, group: "weapon" },
];

const RARITY_FILTERS = [
  { value: "rarity:5", label: "5★", icon: `${UI_ICON_BASE}/star.webp`, color: ICON_COLORS.rarity5, group: "rarity" },
  { value: "rarity:4", label: "4★", icon: `${UI_ICON_BASE}/star.webp`, color: ICON_COLORS.rarity4, group: "rarity" },
  { value: "rarity:3", label: "3★", icon: `${UI_ICON_BASE}/star.webp`, color: ICON_COLORS.rarity3, group: "rarity" },
  { value: "rarity:2", label: "2★", icon: `${UI_ICON_BASE}/star.webp`, color: ICON_COLORS.rarity2, group: "rarity" },
  { value: "rarity:1", label: "1★", icon: `${UI_ICON_BASE}/star.webp`, color: ICON_COLORS.rarity1, group: "rarity" },
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
  ["Иной мир", "Иной мир"],
];

const ITEM_GROUPS = [
  ["weekly_bosses", "Материалы с еженедельных боссов", "Редкие трофеи могущественных противников: следы тяжёлых битв, где механика встречается с лором."],
  ["world_bosses", "Материалы с мировых боссов", "Диковинные трофеи владык открытого мира: кристаллы, ядра и осколки сил для возвышения персонажей."],
  ["common_enemies", "Материалы с обычных противников", "Повседневная добыча с монстров и вражеских отрядов: маски, знаки, обломки и другие маленькие улики мира."],
  ["development_materials", "Материалы развития", "Книги талантов и материалы возвышения: тихие ступени роста, через которые персонажи становятся сильнее."],
  ["teyvat_resources", "Ресурсы Тейвата", "Руды, растения, диковины, ингредиенты и собираемые редкости: природные следы регионов, спрятанные в траве, камне и лунном свете."],
  ["serenitea_pot", "Чайник Безмятежности", "Древесина, чертежи, семена и прочие вещи для обустройства собственной тихой обители."],
  ["useful_items", "Полезные предметы", "Инструменты, гаджеты и особые вещицы: маленькие помощники путешествия, без которых дорога становится куда капризнее."],
  ["misc", "Прочее", "Редкие и странные находки без отдельной полки: всё, что не пожелало аккуратно вписаться в другие разделы."]
];

const STORY_GROUPS = [
  ["quest_stories", "Истории заданий", "Сюжетные записи и пересказы квестов: от главных арок до тихих историй мира."],
  ["character_stories", "Истории персонажей", "Личные истории, профили и тексты персонажей: маленькие ключи к их прошлому и мотивам."],
  ["world_stories", "Истории мира", "Мифы, хроники и разрозненные предания Тейвата, которые помогают собрать общую картину мира."]
];

const STORY_CHILD_GROUPS = {
  quest_stories: [
    ["archon_quests", "Задания Архонтов", "Главные сюжетные главы: путешествие, регионы, Архонты и большие повороты истории."],
    ["legend_quests", "Задания Легенд", "Истории персонажей в формате личных квестов: их выборы, связи и тихие раскрытия."],
    ["world_quests", "Задания мира", "Местные истории и побочные цепочки, где Тейват говорит через людей, руины и странные находки."]
  ]
};

const STORY_GROUP_PARENT = Object.fromEntries(
  Object.entries(STORY_CHILD_GROUPS).flatMap(([parent, children]) => children.map(([child]) => [child, parent]))
);

const STORY_GROUP_LABELS = Object.fromEntries(
  [...STORY_GROUPS, ...Object.values(STORY_CHILD_GROUPS).flat()].map(([key, label]) => [key, label])
);

const ELEMENT_FILTERS = [
  ["pyro", "Пиро", `${UI_ICON_BASE}/pyro.webp`, ICON_COLORS.pyro],
  ["hydro", "Гидро", `${UI_ICON_BASE}/hydro.webp`, ICON_COLORS.hydro],
  ["anemo", "Анемо", `${UI_ICON_BASE}/anemo.webp`, ICON_COLORS.anemo],
  ["electro", "Электро", `${UI_ICON_BASE}/electro.webp`, ICON_COLORS.electro],
  ["dendro", "Дендро", `${UI_ICON_BASE}/dendro.webp`, ICON_COLORS.dendro],
  ["cryo", "Крио", `${UI_ICON_BASE}/cryo.webp`, ICON_COLORS.cryo],
  ["geo", "Гео", `${UI_ICON_BASE}/geo.webp`, ICON_COLORS.geo],
  ["witchcraft", "Ведьмовство", `${UI_ICON_BASE}/witchcraft.webp`, ICON_COLORS.witchcraft],
  ["lunar_reactions", "Лунные реакции", `${UI_ICON_BASE}/lunar_reactions.webp`, ICON_COLORS.lunar_reactions],
  ["star_blade", "Звёздный клин", `${UI_ICON_BASE}/star_blade.webp`, ICON_COLORS.star_blade],
];
const ELEMENT_ORDER = ELEMENT_FILTERS.map(([value]) => value);
const ALL_ELEMENT_ALIASES = new Set([
  "all", "all_elements", "all_element", "traveler", "aether", "lumine",
  "все", "все_элементы", "все_элементы_путешественника", "путешественник"
]);

const STORY_CHARACTER_TYPE_FILTERS = [
  ...ELEMENT_FILTERS.map(([value, label, icon, color]) => ({ value: `element:${value}`, label, icon, color, group: "element" })),
  ...RARITY_FILTERS.filter(option => option.value === "rarity:5" || option.value === "rarity:4"),
];

const ELEMENT_LABELS = Object.fromEntries(ELEMENT_FILTERS.map(([value, label, icon, color]) => [value, { label, icon, color }]));
const ELEMENT_ALIASES = {
  pyro: "pyro", пиро: "pyro",
  hydro: "hydro", гидро: "hydro",
  anemo: "anemo", анемо: "anemo",
  electro: "electro", электро: "electro",
  dendro: "dendro", дендро: "dendro",
  cryo: "cryo", крио: "cryo",
  geo: "geo", гео: "geo",
  witchcraft: "witchcraft", ведьмовство: "witchcraft", магия: "witchcraft",
  lunar_reactions: "lunar_reactions", лунные: "lunar_reactions", лунные_реакции: "lunar_reactions",
  star_blade: "star_blade", звездный_клин: "star_blade", звёздный_клин: "star_blade",
};

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

function isCharacterStoriesCatalog(config = getSectionConfig()) {
  return config?.id === "stories" && state.subsection === "character_stories";
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
    ["craft", "Крафт"],
    ["ingredient", "Ингредиенты"],
  ],
  serenitea_pot: [
    ["wood", "Древесина"],
    ["blueprint", "Чертежи"],
    ["seed", "Семена"],
    ["misc", "Прочее"],
  ],
  useful_items: [
    ["tool", "Инструменты"],
    ["seelie", "Феи"],
    ["equipment", "Снаряжение"],
  ],
};

function typeFilterOptionValue(option) {
  return Array.isArray(option) ? option[0] : option.value;
}

function typeFilterOptionLabel(option) {
  return Array.isArray(option) ? option[1] : option.label;
}

function typeFilterOptionIcon(option) {
  return Array.isArray(option) ? option[2] : option.icon;
}

function typeFilterOptionGroup(option) {
  return Array.isArray(option) ? "" : option.group || "";
}

function typeFilterOptionColor(option) {
  return Array.isArray(option) ? option[3] || "" : option.color || "";
}

function migrateTypeFilterValue(value) {
  const raw = String(value || "").trim();
  if (["5", "4", "3", "2", "1"].includes(raw)) return `rarity:${raw}`;
  if (["sword", "claymore", "bow", "catalyst", "polearm"].includes(raw)) return `weapon:${raw}`;
  return raw;
}

const ITEM_GROUP_TYPE_KEYS = Object.fromEntries(
  Object.entries(ITEM_GROUP_TYPE_FILTERS).map(([group, options]) => [group, new Set(options.map(typeFilterOptionValue))])
);

const ITEM_GROUP_TYPE_LABELS = {
  teyvat_resources: {
    ore: { ru: "Руда", en: "Ore", zh: "矿石" },
    local_specialty: { ru: "Диковинка", en: "Local Specialty", zh: "区域特产" },
    plant: { ru: "Растение", en: "Plant", zh: "植物" },
    animal: { ru: "Животное", en: "Animal", zh: "动物" },
    craft: { ru: "Крафт", en: "Crafting", zh: "合成" },
    ingredient: { ru: "Ингредиент", en: "Ingredient", zh: "食材" },
  },
  serenitea_pot: {
    wood: { ru: "Древесина", en: "Wood", zh: "木材" },
    blueprint: { ru: "Чертёж", en: "Blueprint", zh: "图纸" },
    seed: { ru: "Семена", en: "Seed", zh: "种子" },
    misc: { ru: "Прочее", en: "Miscellaneous", zh: "其他" },
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

function normalizeStoryElement(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ELEMENT_ALIASES[key] || key;
}

function storyElementValues(item) {
  const fromArray = Array.isArray(item?.elements) ? item.elements : [];
  const result = [];

  for (const value of fromArray) {
    const normalized = normalizeStoryElement(value);
    if (ALL_ELEMENT_ALIASES.has(normalized)) return [...ELEMENT_ORDER];
    if (ELEMENT_LABELS[normalized] && !result.includes(normalized)) result.push(normalized);
  }

  if (result.length) return result;

  const raw = item?.element || item?.vision || "";
  const direct = normalizeStoryElement(raw);
  if (ALL_ELEMENT_ALIASES.has(direct)) return [...ELEMENT_ORDER];
  if (ELEMENT_LABELS[direct]) return [direct];

  return String(raw)
    .split(/[,;/|+]+/)
    .map(part => normalizeStoryElement(part))
    .filter((value, index, list) => ELEMENT_LABELS[value] && list.indexOf(value) === index);
}

function storyElementTitle(value) {
  const key = normalizeStoryElement(value);
  return ELEMENT_LABELS[key]?.label || String(value || "—");
}

function storyElementIcon(value) {
  const key = normalizeStoryElement(value);
  return ELEMENT_LABELS[key]?.icon || "";
}

function storyCharacterMatchesTypeFilters(item, activeTypeSet) {
  const selectedElements = ELEMENT_FILTERS
    .map(([value]) => value)
    .filter(value => activeTypeSet.has(`element:${value}`));
  const selectedRarities = ["5", "4"].filter(value => activeTypeSet.has(`rarity:${value}`));
  if (!selectedElements.length && !selectedRarities.length) return true;

  const itemElements = storyElementValues(item);
  const itemRarity = String(item?.rarity || "").trim();
  const elementOk = !selectedElements.length || itemElements.some(element => selectedElements.includes(element));
  const rarityOk = !selectedRarities.length || selectedRarities.includes(itemRarity);
  return elementOk && rarityOk;
}

function itemTypeFilterValue(item, config = getSectionConfig()) {
  const prepared = String(item?.filter_type || "").trim();
  if (prepared) return prepared;
  if (config.id === "books") return bookTypeValue(item);
  if (config.id === "weapons") return String(item?.rarity || "");
  if (item?.item_group === "development_materials") return normalizeDevelopmentMaterialType(item.material_type);
  return normalizeItemGroupType(item?.item_group || state.subsection, item?.item_type);
}

function typeFiltersForCurrentCatalog(config = getSectionConfig()) {
  if (config.id === "books") return BOOK_TYPE_FILTERS;
  if (config.id === "weapons") return [...WEAPON_TYPE_FILTERS, ...RARITY_FILTERS];
  if (isCommonEnemyCatalog(config)) return COMMON_ENEMY_TYPE_FILTERS;
  if (isDevelopmentMaterialsCatalog(config)) return DEVELOPMENT_MATERIAL_TYPE_FILTERS;
  if (isCharacterStoriesCatalog(config)) return STORY_CHARACTER_TYPE_FILTERS;
  if (config.id === "items") return ITEM_GROUP_TYPE_FILTERS[state.subsection] || [];
  return [];
}

function activeTypeFilters(config = getSectionConfig()) {
  const filterState = state.filters[config.id];
  const options = typeFiltersForCurrentCatalog(config);
  const allowedValues = options.map(typeFilterOptionValue);

  let saved = [];
  if (config.id === "items" || config.id === "stories") {
    saved = filterState.typeFiltersByGroup?.[state.subsection] || [];
  } else {
    saved = filterState.typeFilters || [];
  }

  if (!Array.isArray(saved)) return [];
  return saved.map(migrateTypeFilterValue).filter(value => allowedValues.includes(value));
}

function renderTypeFilterRow(options, activeTypes, settings = {}) {
  if (!options.length) return "";

  const scope = settings.scope || "all";
  return `
    <div class="type-filter-row" data-type-filter-scope="${escapeHtml(scope)}" aria-label="${escapeHtml(settings.label || "Дополнительный фильтр")}">
      ${settings.label ? `<span class="type-filter-row-label">${escapeHtml(settings.label)}</span>` : ""}
      ${options.map(option => {
        const value = typeFilterOptionValue(option);
        const label = typeFilterOptionLabel(option);
        const icon = typeFilterOptionIcon(option);
        const color = typeFilterOptionColor(option);
        const group = typeFilterOptionGroup(option);
        const parentStyle = color ? `--filter-color: ${escapeHtml(color)}` : "";
        const iconStyle = icon ? maskIconStyle(icon, color) : "";
        const activeClass = activeTypes.has(value) ? "is-active" : "";
        return `
        <label class="type-filter-chip ${icon ? "has-icon" : ""} ${group ? `type-filter-${escapeHtml(group)}` : ""} ${activeClass}" ${parentStyle ? `style="${parentStyle}"` : ""} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
          <input type="checkbox" value="${escapeHtml(value)}" data-type-filter-group="${escapeHtml(group || scope)}" ${activeTypes.has(value) ? "checked" : ""}>
          ${icon ? `<span class="type-filter-icon" style="${escapeHtml(iconStyle)}" aria-hidden="true"></span>` : ""}
          <span class="type-filter-label">${escapeHtml(label)}</span>
        </label>
      `;
      }).join("")}
    </div>
  `;
}

function renderTypeFilters(config) {
  const options = typeFiltersForCurrentCatalog(config);
  if (!options.length) return "";

  const activeTypes = new Set(activeTypeFilters(config));

  if (config.id === "weapons") {
    const weaponOptions = options.filter(option => typeFilterOptionGroup(option) === "weapon");
    const rarityOptions = options.filter(option => typeFilterOptionGroup(option) === "rarity");
    return renderTypeFilterRow([...rarityOptions, ...weaponOptions], activeTypes, { scope: "weapon-rarity", showToggle: false });
  }

  if (isCharacterStoriesCatalog(config)) {
    const elementOptions = options.filter(option => typeFilterOptionGroup(option) === "element");
    const rarityOptions = options.filter(option => typeFilterOptionGroup(option) === "rarity");
    return renderTypeFilterRow([...rarityOptions, ...elementOptions], activeTypes, { scope: "character-stories", showToggle: false });
  }

  return renderTypeFilterRow(options, activeTypes);
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

  const prepared = Array.isArray(item.enemy_type_keys) ? item.enemy_type_keys : [];
  const result = prepared.length
    ? new Set(prepared.map(normalizeCommonEnemyType).filter(Boolean))
    : new Set(droppedByEnemies(item).map(enemy => normalizeCommonEnemyType(enemy.enemy_group)).filter(Boolean));

  COMMON_ENEMY_TYPES_CACHE.set(item, result);
  return result;
}

function catalogFilterLabel(config) {
  if (config.id === "items" && state.subsection && (isCommonEnemyCatalog(config) || isDevelopmentMaterialsCatalog(config) || itemGroupUsesTypeFilters(state.subsection))) {
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
    icon: `${UI_ICON_BASE}/books.webp`,
    title: "Книги",
    description: "Книги, записки, письма и разрозненные тексты Тейвата: голоса прошлого, путевые заметки, легенды и мелкие бумажные следы большой истории.",
    data: () => BOOKS,
    filter: "region",
    filterLabel: "Все регионы",
    columns: ["Название", "Частей", "Тип", "Регион"],
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
    icon: `${UI_ICON_BASE}/artifacts.webp`,
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
    icon: `${UI_ICON_BASE}/weapons.webp`,
    title: "Оружие",
    description: "Оружие: клинки, луки, катализаторы и древковое оружие с историями владельцев, клятв, потерь и старых битв.",
    data: () => WEAPONS,
    filter: "",
    filterLabel: "",
    columns: ["Название", "Тип", "Редкость"],
    empty: "Оружие пока не добавлено.",
    row: item => [
      renderTitleCell(item),
      escapeHtml(labelFromOptions(item.weapon_type || item.type, WEAPON_TYPES) || item.weapon_type || item.type || "—"),
      renderStoryRarityCell(item),
    ]
  },
  {
    id: "items",
    icon: `${UI_ICON_BASE}/inventory.webp`,
    title: "Инвентарь",
    description: "Инвентарь Тейвата: трофеи, ресурсы, материалы, инструменты и другие маленькие ключи к устройству мира.",
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
  },
  {
    id: "stories",
    icon: `${UI_ICON_BASE}/stories.webp`,
    title: "Истории",
    description: "Сюжетные истории, личные главы персонажей и хроники мира: отдельная полка для больших повествований Тейвата.",
    data: () => STORIES,
    groups: STORY_GROUPS,
    childGroups: STORY_CHILD_GROUPS,
    groupParents: STORY_GROUP_PARENT,
    groupField: "story_group",
    defaultGroup: "world_stories",
    filter: "region",
    filterLabel: "Все регионы",
    columns: () => state.subsection === "character_stories"
      ? ["Название", "Элемент", "Редкость", "Регион"]
      : ["Название", "Категория", "Регион"],
    empty: "В этой категории пока нет историй.",
    row: item => state.subsection === "character_stories" ? [
      renderTitleCell(item),
      renderStoryElementCell(item),
      renderStoryRarityCell(item),
      escapeHtml(item.region || "—")
    ] : [
      renderTitleCell(item),
      escapeHtml(storyGroupLabel(item.story_group || state.subsection)),
      escapeHtml(item.region || "—")
    ]
  }
];


const HOME_SECTION = {
  id: "home",
  icon: `${UI_ICON_BASE}/home.webp`,
  title: "Главная",
  description: "Тихая полка для игровых текстов: книги, артефакты, оружие, материалы и истории Тейвата."
};

const MENU_CHILDREN = {
  items: ITEM_GROUPS.map(([key, label]) => [key, label]),
  stories: STORY_GROUPS.map(([key, label]) => [key, label])
};

const expandedMenuSections = new Set();

const state = {
  section: "home",
  subsection: null,
  entryId: null,
  lang: "ru",
  volume: 1,
  readAll: false,
  artifactPart: "flower",
  artifactReadAll: false,
  storyPart: 1,
  storyReadAll: false,
  storyContentType: "stories",
  filters: {
    books: { query: "", filter: "all", sort: "version", page: 1, pageSize: 10, typeFilters: [] },
    artifacts: { query: "", filter: "all", sort: "version", page: 1, pageSize: 10 },
    weapons: { query: "", filter: "all", sort: "version", page: 1, pageSize: 10, typeFilters: [] },
    items: {
      query: "",
      filter: "all",
      sort: "version",
      page: 1,
      pageSize: 10,
      typeFiltersByGroup: {
        common_enemies: [],
        development_materials: [],
        teyvat_resources: [],
        serenitea_pot: [],
        useful_items: []
      }
    },
    stories: {
      query: "",
      filter: "all",
      sort: "version",
      page: 1,
      pageSize: 10,
      typeFiltersByGroup: {
        character_stories: []
      }
    }
  }
};

const app = document.getElementById("app");
const nav = document.getElementById("nav");
const contentCard = document.querySelector(".content-card");
const contentScroll = document.getElementById("content-scroll");
const sidebarScroll = document.getElementById("sidebar-scroll");

function syncReaderModeClass() {
  contentCard?.classList.toggle("has-reader-page", Boolean(app?.querySelector(".reader-page")));
}

function primaryScrollY() {
  return contentScroll ? contentScroll.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);
}

function scrollPrimaryTo(y = 0, behavior = "auto") {
  if (contentScroll) {
    contentScroll.scrollTo({ top: Math.max(0, Number(y) || 0), behavior });
  } else {
    window.scrollTo({ top: Math.max(0, Number(y) || 0), behavior });
  }
}

function readerScrollbarMetrics(scroller, bar) {
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const barWidth = Math.max(0, bar.clientWidth);
  const thumbWidth = maxScroll > 0
    ? Math.max(28, Math.min(barWidth, Math.round((scroller.clientWidth / Math.max(1, scroller.scrollWidth)) * barWidth)))
    : barWidth;
  const maxThumbLeft = Math.max(0, barWidth - thumbWidth);
  return { maxScroll, barWidth, thumbWidth, maxThumbLeft };
}

function syncReaderSectionScrollbars() {
  app?.querySelectorAll(".reader-section-scrollbar").forEach(bar => {
    const row = bar.closest(".reader-tabs-row");
    const scroller = row?.querySelector(".reader-section-scroll");
    const thumb = bar.querySelector(".reader-section-scrollbar-thumb");
    if (!scroller || !thumb) return;

    const m = readerScrollbarMetrics(scroller, bar);
    const hasScroll = m.maxScroll > 1 && m.barWidth > 0;
    bar.classList.toggle("has-scroll", hasScroll);
    if (!hasScroll) {
      thumb.style.width = "0px";
      thumb.style.transform = "translateX(0px)";
      return;
    }

    const left = m.maxScroll > 0 ? (scroller.scrollLeft / m.maxScroll) * m.maxThumbLeft : 0;
    thumb.style.width = `${m.thumbWidth}px`;
    thumb.style.transform = `translateX(${Math.max(0, Math.min(m.maxThumbLeft, left))}px)`;
  });
}

function syncCustomScrollbarsSoon() {
  if (typeof window.__archiveSyncScrollbars === "function") {
    window.requestAnimationFrame(() => window.__archiveSyncScrollbars());
  } else {
    window.requestAnimationFrame(syncReaderSectionScrollbars);
  }
}
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

function markdownToHtml(value, options = {}) {
  const raw = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  const allowLists = options.allowLists === true;
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

    // Lists are opt-in because Russian book text often uses a leading dash
    // for dialogue. Without this guard, dialogue turns into bullet lists.
    // In prose mode we normalize any leading -, – or — into a readable em dash.
    const dialogueMatch = trimmed.match(/^[-–—]\s+(.+)$/);
    if (!allowLists && dialogueMatch) {
      flushList();
      flushQuote();
      paragraph.push(`— ${dialogueMatch[1]}`);
      continue;
    }

    const listMatch = allowLists ? trimmed.match(/^-\s+(.+)$/) : null;
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

const READER_SECTION_LABELS = {
  description: { ru: "Описание", en: "Description", zh: "描述" },
  history: { ru: "История", en: "Story", zh: "故事" }
};

function readerSectionLabel(key) {
  const labels = READER_SECTION_LABELS[key] || {};
  return labels[state.lang] || labels.ru || key;
}

function stripLeadingMarkdownHeading(value, fallbackTitle) {
  const raw = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return { title: fallbackTitle, body: "" };

  const headingMatch = raw.match(/^#{1,6}\s+(.+?)\s*$/m);
  if (!headingMatch || headingMatch.index !== 0) {
    return { title: fallbackTitle, body: raw };
  }

  const title = headingMatch[1]
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim() || fallbackTitle;

  return {
    title,
    body: raw.slice(headingMatch[0].length).trim()
  };
}

function renderReaderBlockHeading(title, className = "") {
  return `<div class="reader-block-heading ${escapeHtml(className)}">${escapeHtml(title)}</div>`;
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

function renderTextWithAttachedBadge(value, badge) {
  const rawText = String(value || "").trim();

  if (!badge) return escapeHtml(rawText);
  if (!rawText) return badge;

  // Keep the version badge attached to the last word of the visible title.
  // This prevents orphaned version badges in narrow catalog columns.
  const match = rawText.match(/^([\s\S]*?)(\S+)$/u);
  if (!match) {
    return `${escapeHtml(rawText)}${badge}`;
  }

  const prefix = match[1] || "";
  const lastWord = match[2] || rawText;

  return `${escapeHtml(prefix)}<span class="book-title-tail">${escapeHtml(lastWord)}${badge}</span>`;
}

function renderTitleWithGameVersion(item) {
  return renderTextWithAttachedBadge(titleOf(item, "ru"), renderGameVersionBadge(item));
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

function entryRarityBackgroundClass(item) {
  const rarity = String(item?.rarity || "").trim();
  return ["5", "4", "3", "2", "1"].includes(rarity)
    ? `rarity-bg-${rarity}`
    : "";
}

function isCharacterStoryEntry(item) {
  return item?.category === "stories" && (item?.story_group || state.subsection) === "character_stories";
}

function renderTitleCell(item) {
  const en = titleOf(item, "en");
  const zh = titleOf(item, "zh");
  const subtitles = [en, zh].filter(Boolean).join(" · ");
  const icon = iconFor(item);
  const iconClass = ["entry-icon", entryRarityBackgroundClass(item), isCharacterStoryEntry(item) ? "story-character-entry-icon" : ""].filter(Boolean).join(" ");
  const iconMarkup = icon
    ? `<img class="${escapeHtml(iconClass)}" src="${escapeHtml(versionedAssetPath(icon))}" alt="" loading="lazy" decoding="async" width="42" height="42">`
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

function renderDetailHero(item, options = {}) {
  const icon = iconFor(item);
  const iconClass = [
    "detail-title-icon",
    options.iconClass || "",
    entryRarityBackgroundClass(item),
  ].filter(Boolean).join(" ");
  const iconMarkup = icon
    ? `<img class="${escapeHtml(iconClass)}" src="${escapeHtml(versionedAssetPath(icon))}" alt="" loading="lazy" decoding="async" width="88" height="88">`
    : "";
  const subtitle = [titleOf(item, "en"), titleOf(item, "zh")].filter(Boolean).join(" · ");

  return `
    <div class="page-head detail-hero ${escapeHtml(options.className || "")}">
      ${iconMarkup}
      <div class="detail-hero-text">
        <h1>${escapeHtml(titleOf(item, "ru"))}</h1>
        <div class="subtitle">${escapeHtml(subtitle)}</div>
      </div>
    </div>
  `;
}

function detailHeaderIconFor(item) {
  const directIcon = iconFor(item);
  if (directIcon) return directIcon;

  const materials = Array.isArray(item?.materials) ? item.materials : [];
  return materials.find(material => material?.icon)?.icon || "";
}
function detailTitleVariant(item, lang = "ru") {
  const direct = item?.title?.[lang] || item?.[`title_${lang}`];
  if (direct) return direct;

  if ((item?.item_group === "common_enemies" || item?.entry_type === "material_set") && Array.isArray(item?.materials) && item.materials.length) {
    return item.materials
      .map(material => material?.title?.[lang] || material?.[`title_${lang}`] || "")
      .filter(Boolean)
      .join(" · ");
  }

  return lang === "ru" ? titleOf(item, "ru") : "";
}


function renderReaderLangControl(extraClass = "", options = {}) {
  const label = options.showLabel === false ? "" : `<span class="toolbar-label">Язык</span>`;
  return `
    <div class="lang-control reader-lang-control ${escapeHtml(extraClass)}" aria-label="Язык текста">
      ${label}
      <div class="lang-switch">
        ${["ru", "en", "zh"].map(lang => `<button type="button" data-lang="${lang}" class="${state.lang === lang ? "active" : ""}">${langLabel(lang)}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderReaderCornerControls(...blocks) {
  const controls = blocks.filter(Boolean).join("");
  return `
    <div class="reader-corner-controls" aria-label="Быстрые действия чтения">
      ${controls}
      ${renderReaderLangControl("reader-corner-lang-control", { showLabel: false })}
    </div>
  `;
}

function renderReaderTabBlock(label, buttonsMarkup, options = {}) {
  if (!buttonsMarkup) return "";
  const rowClass = ["parts-row", "reader-tabs-row", options.className || ""].filter(Boolean).join(" ");
  const labelMarkup = label ? `<span class="toolbar-label">${escapeHtml(label)}</span>` : "";
  const scrollKey = options.scrollKey || "reader-tabs";
  return `
    <div class="${escapeHtml(rowClass)}">
      ${labelMarkup}
      <div class="reader-tabs-track">
        <div class="volume-scroll reader-section-scroll" data-scroll-preserve="${escapeHtml(scrollKey)}">
          ${buttonsMarkup}
        </div>
        <div class="reader-section-scrollbar" data-scrollbar-for="${escapeHtml(scrollKey)}" aria-hidden="true">
          <span class="reader-section-scrollbar-thumb"></span>
        </div>
      </div>
    </div>
  `;
}

function renderReaderControls(...blocks) {
  const controls = blocks.filter(Boolean).join("");
  if (!controls) return "";
  return `
    <div class="reader-top-controls" aria-label="Управление чтением">
      ${controls}
    </div>
  `;
}

function renderReaderStickyHead(item, options = {}) {
  const showMain = options.showMain !== false;
  const icon = detailHeaderIconFor(item);
  const iconClass = [
    "reader-head-icon",
    options.iconClass || "",
    entryRarityBackgroundClass(item),
  ].filter(Boolean).join(" ");
  const iconMarkup = icon
    ? `<img class="${escapeHtml(iconClass)}" src="${escapeHtml(versionedAssetPath(icon))}" alt="" loading="lazy" decoding="async" width="108" height="108">`
    : `<span class="reader-head-icon reader-head-icon-placeholder" aria-hidden="true">⌁</span>`;
  const englishTitle = detailTitleVariant(item, "en");
  const chineseTitle = detailTitleVariant(item, "zh");
  const headClass = [
    "reader-sticky-head",
    options.className || "",
    showMain ? "" : "reader-sticky-head-compact",
  ].filter(Boolean).join(" ");

  return `
    <div class="${escapeHtml(headClass)}">
      <div class="reader-head-nav">
        <button class="back-link" id="${escapeHtml(options.backId || "back-section")}" type="button">${escapeHtml(options.backLabel || "← Назад")}</button>
        ${options.cornerControls || renderReaderCornerControls()}
      </div>
      ${showMain ? `
        <div class="reader-head-main">
          ${iconMarkup}
          <div class="reader-head-titles">
            <h1>${escapeHtml(titleOf(item, "ru"))}</h1>
            ${englishTitle ? `<div class="reader-title-alt">${escapeHtml(englishTitle)}</div>` : ""}
            ${chineseTitle ? `<div class="reader-title-alt reader-title-zh">${escapeHtml(chineseTitle)}</div>` : ""}
          </div>
        </div>
      ` : ""}
      ${options.controls || ""}
    </div>
  `;
}

function materialTitle(material, lang = "ru") {
  return material?.title?.[lang] || material?.title?.ru || material?.title?.en || material?.title?.zh || material?.name || material?.key || "Материал";
}

function inventoryTitleLines(entry, titleGetter, fallback = "Без названия") {
  const ru = titleGetter(entry, "ru");
  const en = titleGetter(entry, "en");
  const zh = titleGetter(entry, "zh");
  return {
    ru: ru || en || zh || fallback,
    en: en || "",
    zh: zh || "",
  };
}

function renderInventoryTitleBlock(entry, options = {}) {
  const titleGetter = options.titleGetter || ((value, lang) => titleOf(value, lang));
  const titles = inventoryTitleLines(entry, titleGetter, options.fallback || "Без названия");
  const subtitle = [titles.en, titles.zh].filter(Boolean).join(" · ");
  return `
    <div class="volume-title-main inventory-card-title-main">
      <h3>${escapeHtml(titles.ru)}</h3>
      ${subtitle ? `<div class="material-title-subtitle">${escapeHtml(subtitle)}</div>` : ""}
    </div>
  `;
}

function renderInventoryMaterialTitleBlock(material) {
  return renderInventoryTitleBlock(material, {
    titleGetter: (value, lang) => materialTitle(value, lang),
    fallback: "Материал",
  });
}

function renderInventoryIcon(entry, className, size) {
  return entry?.icon
    ? `<img class="${escapeHtml(className)}" src="${escapeHtml(versionedAssetPath(entry.icon))}" alt="" loading="lazy" decoding="async" width="${size}" height="${size}">`
    : "";
}

function renderCommonEnemyMaterialsCell(item) {
  const materials = Array.isArray(item?.materials) ? item.materials : [];
  if (!materials.length) return "—";
  return renderMaterialsCell(item);
}

function renderMaterialsCell(item) {
  const materials = Array.isArray(item?.materials) ? item.materials : [];
  if (!materials.length) return "—";
  const visible = materials.slice(0, 1);
  const rest = materials.length - visible.length;
  return `
    <div class="material-list${rest > 0 ? " has-more" : ""}">
      ${visible.map(material => {
        const icon = material.icon ? `<img src="${escapeHtml(versionedAssetPath(material.icon))}" alt="" loading="lazy" decoding="async" width="28" height="28">` : "";
        return `<span class="material-chip">${icon}<span>${renderTextWithAttachedBadge(materialTitle(material, "ru"), "")}</span></span>`;
      }).join("")}
      ${rest > 0 ? `<span class="tiny-pill catalog-more-pill">+${rest}</span>` : ""}
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

function renderStoryElementPill(element) {
  const key = normalizeStoryElement(element);
  const icon = storyElementIcon(key);
  const label = storyElementTitle(key);
  const color = ELEMENT_LABELS[key]?.color || "";
  if (!icon) return `<span class="common-enemy-type-chip">${escapeHtml(label)}</span>`;
  const iconStyle = maskIconStyle(icon, color);
  return `
    <span class="element-pill" style="--filter-color: ${escapeHtml(color)}">
      <span class="element-icon" style="${escapeHtml(iconStyle)}" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderStoryElementCell(item) {
  const elements = storyElementValues(item);
  if (!elements.length) return "—";
  const className = ["story-element-list", elements.length > 3 ? "is-many" : ""].filter(Boolean).join(" ");
  return `<div class="${escapeHtml(className)}">${elements.map(renderStoryElementPill).join("")}</div>`;
}


function renderStoryRarityCell(item) {
  const rarity = String(item?.rarity || "").trim();
  const option = RARITY_FILTERS.find(entry => entry.value === `rarity:${rarity}`);
  if (!option) return rarity ? `${escapeHtml(rarity)}★` : "—";
  const iconStyle = maskIconStyle(option.icon, option.color);
  return `<span class="rarity-icon-pill" style="--filter-color: ${escapeHtml(option.color)}" title="${escapeHtml(option.label)}" aria-label="${escapeHtml(option.label)}"><span class="rarity-icon" style="${escapeHtml(iconStyle)}" aria-hidden="true"></span></span>`;
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

  const visible = enemies.slice(0, 1);
  const rest = enemies.length - visible.length;

  return `
    <div class="dropped-by-catalog-list${rest > 0 ? " has-more" : ""}">
      ${visible.map(enemy => {
        const icon = enemy.icon ? `<img src="${escapeHtml(versionedAssetPath(enemy.icon))}" alt="" loading="lazy" decoding="async" width="22" height="22">` : "";
        return `<span class="dropped-by-catalog-chip">${icon}<span>${escapeHtml(titleOf(enemy, "ru"))}</span></span>`;
      }).join("")}
      ${rest > 0 ? `<span class="tiny-pill catalog-more-pill">+${rest}</span>` : ""}
    </div>
  `;
}

function renderLootChip(drop, currentItemId = "") {
  const icon = drop.icon ? `<img src="${escapeHtml(versionedAssetPath(drop.icon))}" alt="" loading="lazy" decoding="async" width="22" height="22">` : "";
  const currentClass = drop.id === currentItemId ? " current" : "";
  const title = titleOf(drop, state.lang);
  const label = `${icon}<span>${escapeHtml(title)}</span>`;
  if (!drop.id || drop.id === currentItemId) {
    return `<span class="enemy-loot-chip${currentClass}">${label}</span>`;
  }
  const group = drop.item_group || state.subsection || "common_enemies";
  return `<a class="enemy-loot-chip${currentClass}" href="${escapeHtml(routeHash("items", drop.id, group))}" aria-label="Открыть ${escapeHtml(title)}">${label}</a>`;
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

function droppedByGridClass(count) {
  if (count === 1) return "dropped-by-grid is-single";
  if (count === 2) return "dropped-by-grid is-pair";
  if (count === 3) return "dropped-by-grid is-trio";
  return "dropped-by-grid is-cascade";
}

function distributeDroppedByColumns(enemies, columnCount = 3) {
  const columns = Array.from({ length: Math.min(columnCount, enemies.length) }, () => []);
  enemies.forEach((enemy, index) => {
    columns[index % columns.length].push(enemy);
  });
  return columns;
}

function renderDroppedByCard(enemy, currentItemId = "") {
  const icon = enemy.icon
    ? `<img class="dropped-by-icon" src="${escapeHtml(versionedAssetPath(enemy.icon))}" alt="" loading="lazy" decoding="async" width="46" height="46">`
    : `<span class="dropped-by-icon entry-icon placeholder" aria-hidden="true">⌁</span>`;

  return `
    <article class="dropped-by-card">
      <div class="dropped-by-card-inner">
        <div class="dropped-by-header">
          ${icon}
          ${renderEnemyNameBlock(enemy)}
        </div>
        ${renderEnemyDropDetail(enemy, currentItemId)}
      </div>
    </article>
  `;
}

function renderDroppedByCards(enemies, currentItemId = "") {
  if (enemies.length <= 3) {
    return enemies.map(enemy => renderDroppedByCard(enemy, currentItemId)).join("");
  }

  return distributeDroppedByColumns(enemies)
    .map(column => `
      <div class="dropped-by-column">
        ${column.map(enemy => renderDroppedByCard(enemy, currentItemId)).join("")}
      </div>
    `)
    .join("");
}

function renderDroppedBySection(item) {
  const enemies = droppedByEnemies(item);
  if (!enemies.length) return "";

  return `
    <div class="dropped-by-section">
      <div class="dropped-by-title">Выпадает с</div>
      <div class="${droppedByGridClass(enemies.length)}">
        ${renderDroppedByCards(enemies, item?.id || "")}
      </div>
    </div>
  `;
}



function openMenu() {
  if (document.body.classList.contains("menu-open")) return;
  menuScrollY = primaryScrollY();
  document.documentElement.classList.add("menu-open");
  document.body.classList.add("menu-open");
  document.body.style.position = "fixed";
  document.body.style.top = `-${menuScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
}

function closeMenu() {
  if (!document.body.classList.contains("menu-open")) return;
  document.documentElement.classList.remove("menu-open");
  document.body.classList.remove("menu-open");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  document.body.style.overflow = "";
  scrollPrimaryTo(menuScrollY || 0);
}

function childGroupsFor(config, groupKey) {
  return config.childGroups?.[groupKey] || [];
}

function hasChildGroups(config, groupKey) {
  return childGroupsFor(config, groupKey).length > 0;
}

function parentGroupFor(config, groupKey) {
  return config.groupParents?.[groupKey] || "";
}

function groupsForSelector(config, parentKey = "") {
  return parentKey ? childGroupsFor(config, parentKey) : (config.groups || []);
}

function groupKeys(config) {
  return [
    ...(config.groups || []).map(([key]) => key),
    ...Object.values(config.childGroups || {}).flat().map(([key]) => key),
  ];
}

function isKnownGroup(config, value) {
  return Boolean(value && groupKeys(config).includes(value));
}

function groupValue(item, config) {
  const value = item?.[config.groupField] || item?.book_type || item?.subtype || item?.item_group || item?.story_group || item?.category_type || item?.type || config.defaultGroup;
  return value || config.defaultGroup;
}

function storyGroupLabel(key) {
  return STORY_GROUP_LABELS[key] || key || "—";
}

function groupLabel(config, key) {
  return (config.groups || []).find(([value]) => value === key)?.[1]
    || Object.values(config.childGroups || {}).flat().find(([value]) => value === key)?.[1]
    || key;
}

function catalogBackTarget(config, groupKey = state.subsection) {
  const parent = parentGroupFor(config, groupKey);
  return parent ? { section: config.id, subsection: parent } : { section: config.id, subsection: null };
}

function catalogBackLabel(config, groupKey = state.subsection) {
  void config;
  void groupKey;
  return "← Назад к спискам";
}

function routeHash(section, entryId = null, subsection = null) {
  if (entryId && subsection) return `#/${section}/${subsection}/${entryId}`;
  if (entryId) return `#/${section}/${entryId}`;
  if (subsection) return `#/${section}/${subsection}`;
  return `#/${section}`;
}

function setRoute(section, entryId = null, subsection = null) {
  const normalizedSection = section === "home" ? "home" : getSectionConfig(section).id;
  const nextHash = normalizedSection === "home" ? "#/home" : routeHash(normalizedSection, entryId, subsection);

  closeMenu();

  if (window.location.hash === nextHash) {
    render();
    return;
  }

  window.location.hash = nextHash;
}

function parseHash() {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const section = parts[0] || "home";
  state.subsection = null;
  state.entryId = null;

  if (section === "home") {
    state.section = "home";
    return;
  }

  const config = getSectionConfig(section);
  state.section = config.id;

  if (config.groups && isKnownGroup(config, parts[1])) {
    state.subsection = parts[1];
    state.entryId = parts[2] || null;
  } else {
    state.entryId = parts[1] || null;
  }
}

function currentRouteKey() {
  return [state.section || "home", state.subsection || "", state.entryId || ""].join("/");
}

function currentCatalogScrollKey() {
  return [state.section || "home", state.subsection || ""].join("/");
}

function isCatalogRoute() {
  return !state.entryId;
}

function resetHorizontalScroll() {
  const currentY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  if (!window.scrollX && !document.documentElement.scrollLeft && !document.body.scrollLeft) return;
  window.scrollTo(0, currentY);
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
}

function rememberCatalogScrollPosition() {
  if (!renderedRouteKey || !isCatalogRoute()) return;
  catalogScrollPositions.set(currentCatalogScrollKey(), {
    y: primaryScrollY(),
  });
}

function targetScrollPositionForRoute() {
  if (state.entryId) return { y: 0 };
  return catalogScrollPositions.get(currentCatalogScrollKey()) || { y: 0 };
}

function scheduleRouteScroll(routeChanged) {
  if (!routeChanged) return;
  const target = targetScrollPositionForRoute();
  requestAnimationFrame(() => {
    scrollPrimaryTo(target.y);
    window.scrollTo(0, target.y);
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
    updateToTopButton();
    syncCustomScrollbarsSoon();
  });
}

function markRouteRendered(routeKey, routeChanged) {
  renderedRouteKey = routeKey;
  syncReaderModeClass();
  scheduleRouteScroll(routeChanged);
}

function menuIcon(section) {
  const iconStyle = section.icon ? maskIconStyle(section.icon) : "";
  return `<span class="nav-icon" style="${escapeHtml(iconStyle)}" aria-hidden="true"></span>`;
}

function menuChildren(section) {
  return MENU_CHILDREN[section.id] || [];
}

function childActive(sectionId, key) {
  if (state.section !== sectionId) return false;
  if (sectionId === "items" || sectionId === "stories") {
    return state.subsection === key;
  }
  return false;
}

function renderNav() {
  const rows = [HOME_SECTION, ...SECTIONS].map(section => {
    const children = menuChildren(section);
    const hasChildren = children.length > 0;
    const isOpen = expandedMenuSections.has(section.id);
    const isActive = state.section === section.id;

    if (!hasChildren) {
      return `
        <div class="nav-section">
          <button class="nav-button ${isActive ? "is-active" : ""}" type="button" data-section="${escapeHtml(section.id)}">
            ${menuIcon(section)}
            <span class="nav-label">${escapeHtml(section.title)}</span>
            <span class="nav-meta"></span>
          </button>
        </div>
      `;
    }

    return `
      <div class="nav-section ${isOpen ? "is-open" : ""}">
        <button class="nav-button ${isActive ? "is-active" : ""}" type="button" data-menu-toggle="${escapeHtml(section.id)}" aria-expanded="${isOpen ? "true" : "false"}">
          ${menuIcon(section)}
          <span class="nav-label">${escapeHtml(section.title)}</span>
          <span class="nav-chevron">›</span>
        </button>
        <div class="nav-children">
          ${children.map(([key, label]) => `
            <button class="nav-child ${childActive(section.id, key) ? "is-active" : ""}" type="button" data-menu-action="child" data-menu-section="${escapeHtml(section.id)}" data-menu-key="${escapeHtml(key)}">
              ${escapeHtml(label)}
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  nav.innerHTML = rows;
  syncCustomScrollbarsSoon();
}


function collectionForCatalog(config) {
  let rows = config.data();
  if (config.groups && state.subsection) {
    rows = rows.filter(item => groupValue(item, config) === state.subsection);
  }
  return rows;
}

function optionsFor(config) {
  if (config.filter === "region") return REGION_FILTERS;
  if (config.fixedOptions) return config.fixedOptions;
  return [];
}

function itemMatchesFilter(item, config, selected, activeTypeSet = null) {
  let matchesMainFilter = true;

  if (selected !== "all") {
    if (config.filter === "region") {
      const regions = Array.isArray(item.filter_regions)
        ? item.filter_regions
        : String(item.region || "").split(",").map(region => region.trim()).filter(Boolean);
      matchesMainFilter = regions.includes(selected);
    } else {
      const value = item[config.filter] || item.type || item.item_type || item.weapon_type || item.category_type;
      matchesMainFilter = value === selected;
    }
  }

  if (!matchesMainFilter) return false;

  if (activeTypeSet) {
    if (!activeTypeSet.size) return true;

    if (config.id === "weapons") {
      const selectedRarities = ["5", "4", "3", "2", "1"].filter(value => activeTypeSet.has(`rarity:${value}`));
      const selectedWeaponTypes = WEAPON_TYPE_FILTERS
        .map(option => option.value)
        .filter(value => activeTypeSet.has(value));
      const rarity = `rarity:${String(item?.rarity || "").trim()}`;
      const weaponType = `weapon:${String(item?.weapon_type || item?.type || "").trim()}`;
      const rarityOk = !selectedRarities.length || activeTypeSet.has(rarity);
      const weaponOk = !selectedWeaponTypes.length || activeTypeSet.has(weaponType);
      return rarityOk && weaponOk;
    }
    if (isCommonEnemyCatalog(config)) {
      return Array.from(itemCommonEnemyTypes(item)).some(type => activeTypeSet.has(type));
    }
    if (isCharacterStoriesCatalog(config)) {
      return storyCharacterMatchesTypeFilters(item, activeTypeSet);
    }
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

function searchableTextForCatalog(item, config) {
  if (config.id === "stories" && STORY_SEARCH_TEXTS.has(item.id)) {
    return STORY_SEARCH_TEXTS.get(item.id) || searchableText(item);
  }
  return searchableText(item);
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

function entrySortVersion(item) {
  const prepared = Number(item?.sort_version);
  return Number.isFinite(prepared) ? prepared : gameVersionSortValue(item?.game_version);
}

function compareByGameVersionDesc(a, b) {
  const versionResult = entrySortVersion(b) - entrySortVersion(a);
  return versionResult || compareByTitle(a, b);
}

function filteredEntries(config) {
  const filterState = state.filters[config.id];
  const query = filterState.query.trim().toLocaleLowerCase("ru-RU");
  const activeTypeSet = typeFiltersForCurrentCatalog(config).length
    ? new Set(activeTypeFilters(config))
    : null;

  const rows = collectionForCatalog(config).filter(item => {
    const queryOk = !query || searchableTextForCatalog(item, config).includes(query);
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

function catalogLayoutClass(config) {
  if (config.id === "stories" && state.subsection === "character_stories") {
    return "cols-stories-character";
  }
  if (config.id === "items" && state.subsection === "common_enemies") {
    return "cols-items-common-enemy";
  }
  if (config.id === "items" && state.subsection === "development_materials") {
    return "cols-items-development";
  }
  if (config.id === "items" && itemGroupUsesTypeFilters(state.subsection)) {
    return "cols-items-typed";
  }
  if (config.id === "items" && isEnemyDropGroup(state.subsection)) {
    return "cols-items-enemy";
  }
  return `cols-${config.id}`;
}

function catalogRowClasses(config, modifiers = []) {
  return [
    "catalog-row",
    ...modifiers,
    catalogLayoutClass(config),
  ].filter(Boolean).join(" ");
}

function catalogRow(item, config) {
  return `
    <div class="${catalogRowClasses(config, ["item"])}" data-entry-id="${escapeHtml(item.id)}" data-section-id="${escapeHtml(config.id)}" tabindex="0" role="button" aria-label="Открыть ${escapeHtml(titleOf(item))}">
      ${config.row(item).map(cell => `<div>${cell}</div>`).join("")}
    </div>
  `;
}

function cssClassToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "none";
}

function catalogCardRarityClass(item, config) {
  const rarity = String(item?.rarity || "").trim();
  if (["5", "4", "3", "2", "1"].includes(rarity)) return `card-rarity-${rarity}`;
  return "card-neutral";
}

function catalogCardClasses(item, config) {
  return [
    "catalog-card",
    `catalog-card--${cssClassToken(config.id)}`,
    catalogCardRarityClass(item, config),
    isCharacterStoryEntry(item) ? "catalog-card--character-story" : "",
    isEnemyDropEntry(item) ? "catalog-card--enemy-drops" : "",
  ].filter(Boolean).join(" ");
}

function renderCatalogCardVersion(item) {
  const version = normalizedGameVersion(item?.game_version || item?.release_version);
  if (!version) return "";
  return `<span class="catalog-card-version" title="Версия игры ${escapeHtml(version)}" aria-label="Версия игры ${escapeHtml(version)}">v${escapeHtml(version)}</span>`;
}

function renderCatalogCardMedia(item) {
  const icon = iconFor(item);
  const iconClass = [
    "catalog-card-img",
    entryRarityBackgroundClass(item),
    isCharacterStoryEntry(item) ? "is-person" : "",
  ].filter(Boolean).join(" ");

  if (!icon) {
    return `<span class="catalog-card-media"><span class="catalog-card-placeholder" aria-hidden="true">⌁</span></span>`;
  }

  return `
    <span class="catalog-card-media">
      <img class="${escapeHtml(iconClass)}" src="${escapeHtml(versionedAssetPath(icon))}" alt="" loading="lazy" decoding="async" width="96" height="96">
    </span>
  `;
}

const CATALOG_CARD_FIELD_RULES = {
  default: {
    hidden: ["редкость", "регион", "тип противника", "тип материала"],
    labels: [],
    chipColumns: ["материалы", "выпадает с", "элемент", "категория"],
  },
  books: {
    hidden: ["регион"],
    labels: ["частей"],
    chipColumns: [],
  },
  artifacts: {
    hidden: ["регион", "частей"],
    labels: [],
  },
};

function catalogCardFieldRules(config) {
  const specific = CATALOG_CARD_FIELD_RULES[config?.id] || {};
  const base = CATALOG_CARD_FIELD_RULES.default;
  return {
    hidden: new Set([...(base.hidden || []), ...(specific.hidden || [])]),
    labels: new Set([...(base.labels || []), ...(specific.labels || [])]),
    chipColumns: new Set([...(base.chipColumns || []), ...(specific.chipColumns || [])]),
  };
}

function catalogCardFieldDefinition(column, config) {
  const normalized = normalizeCatalogCardMetaColumn(column);
  const rules = catalogCardFieldRules(config);
  return {
    key: normalized,
    hidden: rules.hidden.has(normalized) || (normalized === "частей" && config?.id !== "books"),
    keepLabel: rules.labels.has(normalized),
    chipLike: rules.chipColumns.has(normalized),
  };
}

function catalogCellHasContent(cell) {
  const html = String(cell || "").trim();
  if (!html) return false;
  const plain = html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;|&ndash;/g, "—")
    .trim();
  if (plain && plain !== "—") return true;
  return /<(img|span|div)[\s>]/i.test(html);
}

function normalizeCatalogCardMetaColumn(column) {
  return String(column || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function catalogCardMetaColumnIsHidden(column, config) {
  return catalogCardFieldDefinition(column, config).hidden;
}

function catalogCardMetaColumnKeepsLabel(column, config) {
  return catalogCardFieldDefinition(column, config).keepLabel;
}

function renderCatalogCardMeta(item, config) {
  const columns = typeof config.columns === "function" ? config.columns() : config.columns;
  const cells = config.row(item);

  return columns.slice(1).map((column, index) => {
    if (catalogCardMetaColumnIsHidden(column, config)) return "";
    const cell = cells[index + 1] || "";
    if (!catalogCellHasContent(cell)) return "";
    const keepLabel = catalogCardMetaColumnKeepsLabel(column, config);
    const field = catalogCardFieldDefinition(column, config);
    const chipListClass = field.chipLike || /class="(?:material-list|catalog-material-plain-list|dropped-by-catalog-list|common-enemy-type-list|story-element-list)"/.test(cell) ? "has-chip-list" : "";
    return `
      <span class="catalog-card-meta-item ${keepLabel ? "has-label" : "is-value-only"} ${chipListClass}">
        ${keepLabel ? `<span class="catalog-card-meta-label">${escapeHtml(column)}</span>` : ""}
        <span class="catalog-card-meta-value">${cell}</span>
      </span>
    `;
  }).filter(Boolean).join("");
}

function renderCatalogCard(item, config) {
  const subtitle = [titleOf(item, "en"), titleOf(item, "zh")].filter(Boolean).join(" · ");
  const meta = renderCatalogCardMeta(item, config);

  return `
    <div class="${escapeHtml(catalogCardClasses(item, config))}" data-entry-id="${escapeHtml(item.id)}" data-section-id="${escapeHtml(config.id)}" tabindex="0" role="button" aria-label="Открыть ${escapeHtml(titleOf(item))}">
      ${renderCatalogCardVersion(item)}
      <span class="catalog-card-rarity-line" aria-hidden="true"></span>
      <span class="catalog-card-open" aria-hidden="true">›</span>
      ${renderCatalogCardMedia(item)}
      <span class="catalog-card-body">
        <span class="catalog-card-title">${escapeHtml(titleOf(item, "ru"))}</span>
        ${subtitle ? `<span class="catalog-card-subtitle">${escapeHtml(subtitle)}</span>` : ""}
        ${meta ? `<span class="catalog-card-meta">${meta}</span>` : ""}
      </span>
    </div>
  `;
}

function groupEntryCount(config, groupKey) {
  const children = childGroupsFor(config, groupKey);
  if (children.length) {
    const childKeys = new Set(children.map(([key]) => key));
    return config.data().filter(item => childKeys.has(groupValue(item, config))).length;
  }
  return config.data().filter(item => groupValue(item, config) === groupKey).length;
}

function groupDescription(config, groupKey) {
  const group = (config.groups || []).find(([key]) => key === groupKey)
    || Object.values(config.childGroups || {}).flat().find(([key]) => key === groupKey);
  return group?.[2] || config.description || "";
}

function renderGroupSelector(config, parentKey = "") {
  activeDetail = null;
  const groups = groupsForSelector(config, parentKey);
  app.innerHTML = `
    <section class="page-card catalog-page${state.subsection ? " is-subsection" : ""}">
      <div class="group-grid">
        ${groups.map(([key, label, description]) => {
          const count = groupEntryCount(config, key);
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

function renderCatalogTable(config) {
  const allRows = filteredEntries(config);
  const filterState = state.filters[config.id];
  const pageSize = catalogPageSize(config);
  const totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(filterState.page) || 1), totalPages);
  filterState.page = currentPage;
  const rows = allRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return `
    <div class="catalog-card-grid ${escapeHtml(catalogLayoutClass(config))}" id="catalog-table">
      ${rows.map(item => renderCatalogCard(item, config)).join("") || `<div class="empty"><div class="empty-card">${escapeHtml(config.empty)}</div></div>`}
    </div>
    ${renderPaginationControls(config, currentPage, totalPages, allRows.length)}
  `;
}



function hasActiveCatalogFilters(config = currentCatalogConfig()) {
  const filterState = state.filters[config.id];
  return Boolean(
    filterState.filter !== "all" ||
    activeTypeFilters(config).length
  );
}

function catalogHasFilterControls(config = currentCatalogConfig()) {
  return Boolean(typeFiltersForCurrentCatalog(config).length);
}

function resetCatalogFilters(config = currentCatalogConfig()) {
  const filterState = state.filters[config.id];
  filterState.filter = "all";
  filterState.page = 1;
  if (config.id === "items" || config.id === "stories") {
    if (!filterState.typeFiltersByGroup) filterState.typeFiltersByGroup = {};
    filterState.typeFiltersByGroup[state.subsection] = [];
  } else {
    filterState.typeFilters = [];
  }
}

function renderCatalogFilterReset(config = currentCatalogConfig()) {
  if (!catalogHasFilterControls(config)) return "";
  const disabled = hasActiveCatalogFilters(config) ? "" : " disabled";
  return `<button class="filter-reset-button" id="reset-filters" type="button" title="Сбросить фильтры" aria-label="Сбросить фильтры"${disabled}><span aria-hidden="true">&#128465;</span></button>`;
}


function catalogDisplayTitle(config) {
  if (state.subsection) return groupLabel(config, state.subsection);
  return config?.title || "Каталог";
}

function renderCatalog(config) {
  activeDetail = null;
  const filterState = state.filters[config.id];
  ensureStorySearchIndexForQuery(config, filterState.query);
  const options = optionsFor(config);
  const allowedFilters = new Set(["all", ...options.map(([value]) => value)]);
  if (!allowedFilters.has(filterState.filter)) {
    filterState.filter = "all";
  }
  const subsectionTitle = state.subsection ? groupLabel(config, state.subsection) : "";
  const currentParentGroup = state.subsection ? parentGroupFor(config, state.subsection) : "";
  void subsectionTitle;
  void currentParentGroup;

  app.innerHTML = `
    <section class="page-card catalog-page${state.subsection ? " is-subsection" : ""}">
      <div class="catalog-sticky-head">
        <div class="toolbar">
          <div class="catalog-search-bar">
            <label class="search" aria-label="Поиск">
              <span class="search-symbol">⌕</span>
              <input id="catalog-search" type="text" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Начни вводить текст…" value="${escapeHtml(filterState.query)}">
              <button class="search-clear ${filterState.query ? "visible" : ""}" id="clear-search" type="button" aria-label="Очистить поиск">×</button>
            </label>
            ${options.length ? `
              <select class="select" id="catalog-filter" aria-label="Фильтр">
                <option value="all">${escapeHtml(catalogFilterLabel(config))}</option>
                ${options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${filterState.filter === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
              </select>
            ` : ""}
          </div>

          <div class="toolbar-filters">
            ${renderTypeFilters(config)}
            ${renderCatalogFilterReset(config)}
          </div>
        </div>
      </div>

      <div id="catalog-holder">${renderCatalogTable(config)}</div>
    </section>
  `;
}

function updateCatalogTable(config = getSectionConfig()) {
  const holder = document.getElementById("catalog-holder");
  if (!holder) return;
  holder.innerHTML = renderCatalogTable(config);
  requestAnimationFrame(() => { resetHorizontalScroll(); syncCustomScrollbarsSoon(); });
}

function toggleSort(config) {
  const filterState = state.filters[config.id];
  filterState.sort = filterState.sort === "asc" ? "desc" : "asc";
  filterState.page = 1;
  updateCatalogTable(config);
}

function renderBookDetail(book) {
  activeDetail = { type: "book", data: book };
  const volumes = Array.isArray(book.volumes) ? book.volumes : [];
  const isSingleVolumeBook = volumes.length <= 1;

  if (isSingleVolumeBook) {
    state.readAll = false;
    state.volume = volumes[0]?.number || 1;
  }

  const volumeButtons = isSingleVolumeBook
    ? ""
    : volumes.map(volume => `<button type="button" data-volume="${volume.number}" class="${!state.readAll && state.volume === volume.number ? "active" : ""}">${escapeHtml(volume.title?.[state.lang] || "Том " + volume.number)}</button>`).join("");
  const readAllButton = isSingleVolumeBook
    ? ""
    : `<button class="mode-button ${state.readAll ? "active" : ""}" id="toggle-read-all" type="button">${state.readAll ? "Читать по томам" : "Читать всё подряд"}</button>`;
  const cornerControls = renderReaderCornerControls(readAllButton);
  const controls = renderReaderControls(
    renderReaderTabBlock("", volumeButtons)
  );

  app.innerHTML = `
    <section class="page-card book-page reader-page">
      ${renderReaderStickyHead(book, {
        className: "book-detail-head",
        backId: "back-books",
        backLabel: "← Назад к спискам",
        cornerControls,
        controls,
      })}

      <div id="reader-text-area">${renderTextArea(book)}</div>

    </section>
  `;
}

function renderTextArea(book) {
  const volumes = state.readAll ? book.volumes : book.volumes.filter(volume => volume.number === state.volume);
  const generalNote = cleanPublicNote(book.notes?.general || "");
  const volumeNotes = book.notes?.byVolume || {};

  return volumes.map((volume, index) => {
    const volumeTitle = escapeHtml(volume.title?.[state.lang] || "Том " + volume.number);
    const volumeNote = cleanPublicNote(volumeNotes[volume.number] || "");
    const noteText = volumeNote || (index === 0 ? generalNote : "");
    const notesBlock = "";

    return `
      <article class="text-card" id="volume-${volume.number}">
        <div class="volume-title">
          <div class="volume-title-main"><h3>${volumeTitle}</h3></div>
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
  activeDetail = { type: "artifact", data: artifact };
  const parts = Array.isArray(artifact.parts) ? artifact.parts : [];
  if (!parts.length) {
    renderGenericDetail(artifact, getSectionConfig("artifacts"));
    return;
  }

  if (!parts.some(part => part.key === state.artifactPart)) {
    state.artifactPart = parts[0].key;
  }

  const isSinglePartArtifact = parts.length === 1;
  const partButtons = isSinglePartArtifact ? "" : parts.map(part => `<button type="button" data-artifact-part="${escapeHtml(part.key)}" class="${!state.artifactReadAll && state.artifactPart === part.key ? "active" : ""}">${escapeHtml(artifactPartTitle(part, state.lang))}</button>`).join("");
  const cornerControls = renderReaderCornerControls(
    isSinglePartArtifact ? "" : `<button class="mode-button ${state.artifactReadAll ? "active" : ""}" id="toggle-artifact-read-all" type="button">${state.artifactReadAll ? "Читать по частям" : "Читать весь сет"}</button>`
  );
  const controls = renderReaderControls(
    renderReaderTabBlock("", partButtons)
  );

  app.innerHTML = `
    <section class="page-card book-page reader-page artifact-page">
      ${renderReaderStickyHead(artifact, {
        className: "artifact-detail-head",
        backId: "back-artifacts",
        backLabel: "← Назад к спискам",
        cornerControls,
        controls,
      })}

      <div id="reader-text-area">${renderArtifactTextArea(artifact)}</div>
    </section>
  `;
}

function renderArtifactTextArea(artifact) {
  const parts = Array.isArray(artifact.parts) ? artifact.parts : [];
  const selectedParts = parts.length === 1 || state.artifactReadAll ? parts : parts.filter(part => part.key === state.artifactPart);
  const generalNote = cleanPublicNote(artifact.notes?.general || "");
  const partNotes = artifact.notes?.byPart || artifact.notes?.byVolume || {};

  return selectedParts.map((part, index) => {
    const partTitle = escapeHtml(artifactPartTitle(part, state.lang));
    const noteText = cleanPublicNote(partNotes[part.key] || "") || (index === 0 ? generalNote : "");
    const notesBlock = "";

    return `
      <article class="text-card artifact-text-card" id="artifact-part-${escapeHtml(part.key)}">
        <div class="volume-title">
          <div class="volume-title-main"><h3>${partTitle}</h3></div>
        </div>
        <div class="prose">${markdownToHtml(emphasizeArtifactLabels(part.text?.[state.lang] || "[нет текста]"))}</div>
        ${notesBlock}
      </article>
    `;
  }).join("");
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

function enemyDescriptionKey(item = activeDetail?.data, configId = activeDetail?.configId || state.section) {
  const id = item?.id || state.entryId || "";
  const group = item?.item_group || state.subsection || "";
  return id ? `${configId}:${group}:${id}` : "";
}

function rememberEnemyDescriptionState(panel, expanded) {
  const key = panel?.dataset?.descriptionKey || enemyDescriptionKey();
  if (!key) return;
  if (expanded) {
    expandedEnemyDescriptionKeys.add(key);
  } else {
    expandedEnemyDescriptionKeys.delete(key);
  }
}

function renderBossOverviewCard(item) {
  const text = localizedEntryText(item);
  if (!text && !item?.icon) return "";
  const icon = renderInventoryIcon(item, "inventory-card-icon boss-overview-icon", 112);

  return `
    <article class="text-card inventory-card boss-overview-card" data-description-key="${escapeHtml(enemyDescriptionKey(item, activeDetail?.configId || state.section))}">
      <div class="volume-title">
        ${renderInventoryTitleBlock(item)}
      </div>
      <div class="prose inventory-card-body">${icon}${markdownToHtml(text || "Описание босса будет добавлено позже.")}</div>
    </article>
  `;
}

function renderEnemyDropsDetail(item, config) {
  activeDetail = { type: "enemyDrops", data: item, configId: config.id };
  const materials = Array.isArray(item.materials) ? item.materials : [];
  if (!materials.length) {
    renderGenericDetail(item, config);
    return;
  }

  const commonEnemyLootPage = item.item_group === "common_enemies";
  const developmentMaterialPage = item.item_group === "development_materials";
  const bossLootPage = isEnemyDropGroup(item.item_group) && !commonEnemyLootPage;
  const bossDescriptionBlock = bossLootPage ? renderBossOverviewCard(item) : "";

  app.innerHTML = `
    <section class="page-card book-page reader-page${commonEnemyLootPage ? " common-enemy-loot-page" : ""}${developmentMaterialPage ? " development-material-page" : ""}${bossLootPage ? " boss-loot-page" : ""}">
      ${renderReaderStickyHead(item, {
        className: "items-detail-head",
        backId: "back-section",
        backLabel: catalogBackLabel(config, state.subsection),
        cornerControls: renderReaderCornerControls(),
        showMain: false,
      })}

      ${bossDescriptionBlock}

      <div id="reader-text-area">${renderEnemyMaterialsTextArea(item)}</div>

      ${item.item_group === "common_enemies" ? renderDroppedBySection(item) : ""}
    </section>
  `;
}

function renderEnemyMaterialsTextArea(item) {
  const materials = Array.isArray(item.materials) ? item.materials : [];

  return materials.map(material => {
    const text = localizedMaterialText(material) || "Описание материала будет добавлено позже.";
    const iconMarkup = material.icon ? `<img class="inventory-card-icon material-float-icon" src="${escapeHtml(versionedAssetPath(material.icon))}" alt="" loading="lazy" decoding="async" width="112" height="112">` : "";
    const notesBlock = "";

    return `
      <article class="text-card artifact-text-card inventory-card inventory-material-card" id="item-material-${escapeHtml(material.key)}">
        <div class="volume-title">
          ${renderInventoryMaterialTitleBlock(material)}
        </div>
        <div class="prose material-reader-body inventory-card-body">${iconMarkup}${markdownToHtml(text)}</div>
        ${notesBlock}
      </article>
    `;
  }).join("");
}

function storyParts(item) {
  if (Array.isArray(item?.parts) && item.parts.length) return item.parts;

  const text = localizedEntryText(item);
  if (!text) return [];
  return [{
    number: 1,
    title: { ru: "История", en: "Story", zh: "故事" },
    text: { [state.lang]: text, ru: item?.text?.ru || text, en: item?.text?.en || "", zh: item?.text?.zh || "" }
  }];
}

function localizedStoryField(value, lang = state.lang) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value?.[lang] || value?.ru || value?.en || value?.zh || value?.text || value?.title || "";
}

function storyReplicaSource(item) {
  return item?.replicas || item?.quotes || item?.voicelines || item?.voice_lines || item?.voiceLines || item?.lines || item?.speech || null;
}

function normalizeStoryReplicaPart(rawPart, index) {
  const titleSource = rawPart?.title ?? rawPart?.name ?? rawPart?.label ?? rawPart?.key;
  const textSource = rawPart?.text ?? rawPart?.content ?? rawPart?.description ?? rawPart?.line ?? rawPart?.value ?? rawPart;
  const defaultTitle = `Реплика ${index + 1}`;
  const textRu = localizedStoryField(textSource, "ru");
  const textEn = localizedStoryField(textSource, "en");
  const textZh = localizedStoryField(textSource, "zh");
  const hasText = [textRu, textEn, textZh].some(Boolean);
  if (!hasText) return null;

  return {
    number: index + 1,
    title: {
      ru: localizedStoryField(titleSource, "ru") || defaultTitle,
      en: localizedStoryField(titleSource, "en") || localizedStoryField(titleSource, "ru") || `Voice-Over ${index + 1}`,
      zh: localizedStoryField(titleSource, "zh") || localizedStoryField(titleSource, "ru") || defaultTitle,
    },
    text: {
      ru: textRu,
      en: textEn,
      zh: textZh,
    }
  };
}

function storyReplicaParts(item) {
  const source = storyReplicaSource(item);
  if (!source) return [];

  if (Array.isArray(source)) {
    return source.map(normalizeStoryReplicaPart).filter(Boolean);
  }

  if (typeof source !== "object") {
    const normalized = normalizeStoryReplicaPart(source, 0);
    return normalized ? [normalized] : [];
  }

  const nested = source.parts || source.items || source.lines || source.entries || source.list;
  if (Array.isArray(nested)) {
    return nested.map(normalizeStoryReplicaPart).filter(Boolean);
  }

  const textSource = source.text || source.content || source.description;
  if (textSource) {
    const normalized = normalizeStoryReplicaPart(source, 0);
    return normalized ? [normalized] : [];
  }

  return Object.entries(source)
    .map(([key, value], index) => normalizeStoryReplicaPart({ key, ...(typeof value === "object" && value ? value : { text: value }) }, index))
    .filter(Boolean);
}

function storyContentTypes(item) {
  const types = [{ key: "stories", label: { ru: "Истории", en: "Stories", zh: "故事" } }];
  const hasReplicas = storyReplicaParts(item).length > 0;
  if (hasReplicas || isCharacterStoryEntry(item)) {
    types.push({ key: "replicas", label: { ru: "Реплики", en: "Voice-Overs", zh: "语音" } });
  }
  return types;
}

function activeStoryContentType(item) {
  const available = storyContentTypes(item).map(type => type.key);
  if (available.includes(state.storyContentType)) return state.storyContentType;
  return "stories";
}

function storyContentParts(item, contentType = activeStoryContentType(item)) {
  return contentType === "replicas" ? storyReplicaParts(item) : storyParts(item);
}

function storyPartTitle(part, lang = state.lang) {
  return localizedStoryField(part?.title, lang) || `История ${part?.number || ""}`.trim();
}

function storyPartText(part, lang = state.lang) {
  return localizedStoryField(part?.text, lang) || "[нет текста]";
}

function normalizeActiveStoryPart(parts) {
  if (!parts.length) {
    state.storyPart = 1;
    state.storyReadAll = false;
    return;
  }
  if (!parts.some(part => Number(part.number) === Number(state.storyPart))) {
    state.storyPart = Number(parts[0].number) || 1;
  }
}

function renderStoryTextArea(story) {
  const contentType = activeStoryContentType(story);
  const parts = storyContentParts(story, contentType);
  normalizeActiveStoryPart(parts);

  if (!parts.length) {
    const emptyTitle = contentType === "replicas" ? "Реплики" : "Истории";
    const emptyText = contentType === "replicas"
      ? "Реплики для этого персонажа пока не добавлены."
      : "Истории для этой записи пока не добавлены.";

    return `
      <article class="text-card story-text-card story-empty-card">
        <div class="volume-title">
          <div class="volume-title-main"><h3>${emptyTitle}</h3></div>
        </div>
        <div class="prose"><p>${emptyText}</p></div>
      </article>
    `;
  }

  const visibleParts = state.storyReadAll ? parts : parts.filter(part => Number(part.number) === Number(state.storyPart));

  return visibleParts.map(part => {
    const notesBlock = "";

    return `
      <article class="text-card story-text-card" id="story-part-${escapeHtml(part.number)}">
        <div class="volume-title">
          <div class="volume-title-main"><h3>${escapeHtml(storyPartTitle(part))}</h3></div>
        </div>
        <div class="prose">${markdownToHtml(storyPartText(part))}</div>
        ${notesBlock}
      </article>
    `;
  }).join("");
}

function renderStoryDetail(story, config) {
  activeDetail = { type: "story", data: story, configId: config.id };
  if (!story) {
    renderError("История не найдена.");
    return;
  }

  const contentTypes = storyContentTypes(story);
  const contentType = activeStoryContentType(story);
  state.storyContentType = contentType;

  const parts = storyContentParts(story, contentType);
  normalizeActiveStoryPart(parts);
  const showPartToolbar = parts.length > 1;
  const partButtons = showPartToolbar ? parts.map(part => `<button type="button" data-story-part="${escapeHtml(part.number)}" class="${!state.storyReadAll && Number(state.storyPart) === Number(part.number) ? "active" : ""}">${escapeHtml(storyPartTitle(part))}</button>`).join("") : "";
  const contentTypeButtons = contentTypes.length > 1
    ? contentTypes.map(type => `<button class="reader-content-type-button ${contentType === type.key ? "active" : ""}" type="button" data-story-content="${escapeHtml(type.key)}">${escapeHtml(localizedStoryField(type.label))}</button>`).join("")
    : "";
  const readAllButton = `<button class="mode-button ${state.storyReadAll ? "active" : ""}" id="toggle-story-read-all" type="button">${state.storyReadAll ? (contentType === "replicas" ? "Читать по репликам" : "Читать по разделам") : (contentType === "replicas" ? "Читать все реплики" : "Читать всё подряд")}</button>`;
  const cornerControls = renderReaderCornerControls(contentTypeButtons, readAllButton);
  const controls = renderReaderControls(
    renderReaderTabBlock("", partButtons, { className: "story-inner-tabs-row", scrollKey: "story-inner-tabs" })
  );

  app.innerHTML = `
    <section class="page-card book-page reader-page story-page">
      ${renderReaderStickyHead(story, {
        className: "story-detail-head",
        iconClass: "story-detail-icon",
        backId: "back-section",
        backLabel: catalogBackLabel(config, state.subsection),
        cornerControls,
        controls,
      })}

      <div id="reader-text-area">${renderStoryTextArea(story)}</div>
    </section>
  `;
}

function renderGenericDetail(item, config) {
  activeDetail = { type: "generic", data: item, configId: config.id };
  if (!item) {
    renderError("Запись не найдена.");
    return;
  }

  const text = localizedEntryText(item) || "Текст этой записи будет добавлен позже.";
  const noteText = genericNotes(item);
  const notesBlock = "";
  const isWeapon = config.id === "weapons";
  const isSimpleItem = config.id === "items";
  const weaponTextParts = isWeapon ? splitWeaponDescriptionText(text) : { description: text, details: "" };
  const itemIconClass = ["inventory-card-icon", "item-description-float-icon", entryRarityBackgroundClass(item)].filter(Boolean).join(" ");
  const itemFloatIcon = isSimpleItem ? renderInventoryIcon(item, itemIconClass, 112) : "";
  const weaponDescriptionBlock = isWeapon && weaponTextParts.description ? `
      ${renderReaderBlockHeading(readerSectionLabel("description"), "reader-block-heading-accent")}
      <article class="weapon-description-panel ${config.id}-detail-card">
        <div class="prose">${markdownToHtml(weaponTextParts.description)}</div>
      </article>
  ` : "";
  const weaponHistoryParts = isWeapon ? stripLeadingMarkdownHeading(weaponTextParts.details, readerSectionLabel("history")) : { title: "", body: "" };
  const weaponHistoryBlock = isWeapon && weaponHistoryParts.body ? `
      ${renderReaderBlockHeading(weaponHistoryParts.title, "reader-block-heading-light")}
      <article class="text-card generic-text-card weapon-history-card ${config.id}-detail-card">
        <div class="prose weapon-detail-main-text">${markdownToHtml(weaponHistoryParts.body)}</div>
      </article>
  ` : "";
  const bodyBlock = isSimpleItem ? `
        <div class="prose item-description-prose inventory-card-body">${itemFloatIcon}${markdownToHtml(text)}</div>
  ` : `
        <div class="prose">${markdownToHtml(text)}</div>
  `;
  const droppedByBlock = config.id === "items" && item?.item_group === "common_enemies"
    ? renderDroppedBySection(item)
    : "";
  const detailMarkup = isWeapon ? `
      ${weaponDescriptionBlock || `${renderReaderBlockHeading(readerSectionLabel("description"), "reader-block-heading-accent")}<article class="weapon-description-panel ${config.id}-detail-card"><div class="prose">${markdownToHtml(text)}</div></article>`}
      ${weaponHistoryBlock}
      ${notesBlock}
  ` : `
      <article class="text-card generic-text-card ${config.id}-detail-card">
        <div class="volume-title generic-title">
          ${isSimpleItem ? renderInventoryTitleBlock(item) : `<div class="volume-title-main"><h3>Текст</h3></div>`}
        </div>
        ${bodyBlock}
        ${droppedByBlock}
        ${notesBlock}
      </article>
  `;

  app.innerHTML = `
    <section class="page-card book-page reader-page">
      ${renderReaderStickyHead(item, {
        className: `${escapeHtml(config.id)}-detail-head`,
        backId: "back-section",
        backLabel: catalogBackLabel(config, state.subsection),
        showMain: !isSimpleItem,
      })}
      ${detailMarkup}
    </section>
  `;
}

function preserveScrollRender(renderFn) {
  const y = primaryScrollY();
  const horizontalScrollPositions = new Map(
    Array.from(app.querySelectorAll("[data-scroll-preserve]")).map(element => [
      element.dataset.scrollPreserve || "reader-tabs",
      element.scrollLeft || 0,
    ])
  );

  renderFn();

  function restoreScrollPositions() {
    scrollPrimaryTo(y);
    app.querySelectorAll("[data-scroll-preserve]").forEach(element => {
      const key = element.dataset.scrollPreserve || "reader-tabs";
      if (horizontalScrollPositions.has(key)) {
        element.scrollLeft = horizontalScrollPositions.get(key) || 0;
      }
    });
    syncReaderSectionScrollbars();
  }

  restoreScrollPositions();
  requestAnimationFrame(() => {
    restoreScrollPositions();
    syncCustomScrollbarsSoon();
  });
}

function currentCatalogConfig() {
  return getSectionConfig();
}

function currentFilterState() {
  return state.filters[currentCatalogConfig().id];
}

const debouncedCatalogUpdate = debounce(() => updateCatalogTable(currentCatalogConfig()));

function renderActiveDetail() {
  if (!activeDetail) {
    render();
    return;
  }

  const config = getSectionConfig(activeDetail.configId || state.section);
  if (activeDetail.type === "book") renderBookDetail(activeDetail.data);
  if (activeDetail.type === "artifact") renderArtifactDetail(activeDetail.data);
  if (activeDetail.type === "enemyDrops") renderEnemyDropsDetail(activeDetail.data, config);
  if (activeDetail.type === "story") renderStoryDetail(activeDetail.data, config);
  if (activeDetail.type === "generic") renderGenericDetail(activeDetail.data, config);
}

function rerenderActiveDetailPreservingScroll() {
  preserveScrollRender(renderActiveDetail);
}

function handleNavClick(event) {
  const toggle = event.target.closest("[data-menu-toggle]");
  if (toggle) {
    const sectionId = toggle.dataset.menuToggle;
    if (expandedMenuSections.has(sectionId)) expandedMenuSections.delete(sectionId);
    else expandedMenuSections.add(sectionId);
    renderNav();
    return;
  }

  const child = event.target.closest("[data-menu-action='child']");
  if (child) {
    const sectionId = child.dataset.menuSection;
    const key = child.dataset.menuKey;


    if (sectionId === "items") {
      setRoute("items", null, key);
      return;
    }

    if (sectionId === "stories") {
      setRoute("stories", null, key);
      return;
    }
  }

  const button = event.target.closest("[data-section]");
  if (!button) return;
  setRoute(button.dataset.section);
}

function handleAppClick(event) {
  const enemyToggle = event.target.closest(".enemy-description-toggle");
  if (enemyToggle) {
    const panel = enemyToggle.closest(".enemy-description-panel");
    if (!panel) return;
    const isCollapsed = panel.classList.toggle("is-collapsed");
    rememberEnemyDescriptionState(panel, !isCollapsed);
    enemyToggle.setAttribute("aria-expanded", String(!isCollapsed));
    enemyToggle.textContent = isCollapsed ? "Показать полностью" : "Свернуть";
    return;
  }

  if (event.target.closest("#back-groups")) {
    const target = catalogBackTarget(currentCatalogConfig(), state.subsection);
    setRoute(target.section, null, target.subsection);
    return;
  }

  if (event.target.closest("#back-books")) {
    setRoute("books");
    return;
  }

  if (event.target.closest("#back-artifacts")) {
    setRoute("artifacts", null, state.subsection);
    return;
  }

  if (event.target.closest("#back-section")) {
    const config = activeDetail ? getSectionConfig(activeDetail.configId || state.section) : currentCatalogConfig();
    setRoute(config.id, null, state.subsection);
    return;
  }

  const groupCard = event.target.closest("[data-group]");
  if (groupCard) {
    setRoute(currentCatalogConfig().id, null, groupCard.dataset.group);
    return;
  }

  if (event.target.closest("#sort-title")) {
    toggleSort(currentCatalogConfig());
    return;
  }

  const pageButton = event.target.closest("[data-catalog-page]");
  if (pageButton) {
    const page = Number(pageButton.dataset.catalogPage);
    if (Number.isFinite(page)) {
      currentFilterState().page = page;
      updateCatalogTable(currentCatalogConfig());
    }
    return;
  }

  if (event.target.closest("#clear-search")) {
    const filterState = currentFilterState();
    const search = document.getElementById("catalog-search");
    const clearSearch = document.getElementById("clear-search");
    filterState.query = "";
    filterState.page = 1;
    if (search) {
      search.value = "";
      search.focus();
    }
    clearSearch?.classList.remove("visible");
    updateCatalogTable(currentCatalogConfig());
    return;
  }

  if (event.target.closest("#reset-filters")) {
    const config = currentCatalogConfig();
    resetCatalogFilters(config);
    renderCatalog(config);
    requestAnimationFrame(() => syncCustomScrollbarsSoon());
    return;
  }

  if (event.target.closest("#toggle-read-all") && activeDetail?.type === "book") {
    state.readAll = !state.readAll;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  if (event.target.closest("#toggle-artifact-read-all") && activeDetail?.type === "artifact") {
    state.artifactReadAll = !state.artifactReadAll;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  if (event.target.closest("#toggle-story-read-all") && activeDetail?.type === "story") {
    state.storyReadAll = !state.storyReadAll;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const storyContentButton = event.target.closest("[data-story-content]");
  if (storyContentButton && activeDetail?.type === "story") {
    state.storyContentType = storyContentButton.dataset.storyContent || "stories";
    state.storyPart = 1;
    state.storyReadAll = false;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const storyPartButton = event.target.closest("[data-story-part]");
  if (storyPartButton && activeDetail?.type === "story") {
    state.storyPart = Number(storyPartButton.dataset.storyPart) || 1;
    state.storyReadAll = false;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const volumeButton = event.target.closest("[data-volume]");
  if (volumeButton && activeDetail?.type === "book") {
    state.volume = Number(volumeButton.dataset.volume);
    state.readAll = false;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const artifactPartButton = event.target.closest("[data-artifact-part]");
  if (artifactPartButton && activeDetail?.type === "artifact") {
    state.artifactPart = artifactPartButton.dataset.artifactPart;
    state.artifactReadAll = false;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const langButton = event.target.closest("[data-lang]");
  if (langButton && activeDetail) {
    state.lang = langButton.dataset.lang;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const row = event.target.closest("[data-entry-id]");
  if (row && !event.target.closest("button, a, input, select, label")) {
    const sectionId = row.dataset.sectionId || currentCatalogConfig().id;
    setRoute(sectionId, row.dataset.entryId, state.subsection);
  }
}

function handleAppKeydown(event) {
  const row = event.target.closest("[data-entry-id]");
  if (!row || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  const sectionId = row.dataset.sectionId || currentCatalogConfig().id;
  setRoute(sectionId, row.dataset.entryId, state.subsection);
}


function syncCatalogResetButton(config = currentCatalogConfig()) {
  const resetButton = document.getElementById("reset-filters");
  if (resetButton) resetButton.disabled = !hasActiveCatalogFilters(config);
}

function handleAppInput(event) {
  if (!event.target.matches("#catalog-search")) return;
  const filterState = currentFilterState();
  filterState.query = event.target.value;
  filterState.page = 1;
  document.getElementById("clear-search")?.classList.toggle("visible", Boolean(filterState.query));
  ensureStorySearchIndexForQuery(currentCatalogConfig(), filterState.query);
  debouncedCatalogUpdate();
}

function handleAppChange(event) {
  const config = currentCatalogConfig();
  const filterState = state.filters[config.id];

  if (event.target.matches("#catalog-filter")) {
    filterState.filter = event.target.value;
    filterState.page = 1;
    syncCatalogResetButton(config);
    updateCatalogTable(config);
    return;
  }

  if (event.target.matches("#catalog-page-size")) {
    filterState.pageSize = Number(event.target.value) || DEFAULT_CATALOG_PAGE_SIZE;
    filterState.page = 1;
    updateCatalogTable(config);
    return;
  }

  if (event.target.matches(".type-filter-chip input")) {
    const options = typeFiltersForCurrentCatalog(config);
    const defaultValues = options.map(typeFilterOptionValue);
    event.target.closest(".type-filter-chip")?.classList.toggle("is-active", event.target.checked);

    const itemInputs = Array.from(app.querySelectorAll('.type-filter-chip input'));
    const checked = itemInputs
      .filter(input => input.checked)
      .map(input => input.value)
      .filter(value => defaultValues.includes(value));


    filterState.page = 1;
    if (config.id === "items" || config.id === "stories") {
      if (!filterState.typeFiltersByGroup) filterState.typeFiltersByGroup = {};
      filterState.typeFiltersByGroup[state.subsection] = checked;
    } else {
      filterState.typeFilters = checked;
    }
    syncCatalogResetButton(config);
    updateCatalogTable(config);
  }
}

function requestIdleTask(callback, timeout = 1600) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout });
  } else {
    window.setTimeout(callback, 180);
  }
}

function scheduleBackgroundSectionPrefetch() {
  if (backgroundPrefetchStarted) return;
  backgroundPrefetchStarted = true;

  requestIdleTask(() => {
    SECTIONS
      .map(section => section.id)
      .filter(sectionId => sectionId !== state.section && BACKGROUND_PREFETCH_SECTIONS.has(sectionId))
      .forEach((sectionId, index) => {
        window.setTimeout(() => loadSectionData(sectionId).catch(() => {}), index * 90);
      });
  });
}

function prefetchDetail(sectionId, entryId) {
  if (!entryId) return;
  const key = `${sectionId}:${entryId}`;
  if (key === lastPrefetchedEntryKey) return;
  lastPrefetchedEntryKey = key;

  const loader = sectionId === "books" ? getBookById(entryId) : getGenericDetail(sectionId, entryId);
  loader.catch(() => {});
}

function handleAppPrefetch(event) {
  const row = event.target.closest("[data-entry-id]");
  if (!row) return;
  prefetchDetail(row.dataset.sectionId || currentCatalogConfig().id, row.dataset.entryId);
}


function renderHome() {
  activeDetail = null;
  app.innerHTML = `
    <section class="page-card home-page">
      <div class="page-head">
        <h1>Главная</h1>
        <p class="lead">Библиотека Лороведьмы — публичная база игровых текстов Genshin Impact: книги, артефакты, оружие, предметы и истории в одной аккуратной полке.</p>
      </div>
      <div class="home-grid">
        ${SECTIONS.map(section => `
          <button class="home-tile" type="button" data-home-section="${escapeHtml(section.id)}">
            <span class="home-tile-title">${escapeHtml(section.title)}</span>
            <span class="home-tile-text">${escapeHtml(section.description)}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
  app.querySelectorAll("[data-home-section]").forEach(button => {
    button.addEventListener("click", () => setRoute(button.dataset.homeSection));
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
  rememberCatalogScrollPosition();
  const previousRouteKey = renderedRouteKey;
  parseHash();
  const routeKey = currentRouteKey();
  const routeChanged = routeKey !== previousRouteKey;
  renderNav();

  if (state.section === "home") {
    renderHome();
    markRouteRendered(routeKey, routeChanged);
    syncCustomScrollbarsSoon();
    return;
  }

  const config = getSectionConfig();

  if (!LOADED_SECTIONS.has(config.id)) {
    renderLoading(`Загружаю раздел «${config.title}»…`);
    try {
      await loadSectionData(config.id);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось загрузить данные раздела.");
      markRouteRendered(routeKey, routeChanged);
      return;
    }
    if (sequence !== renderSequence) return;
  }

  if (!state.entryId && config.groups && (!state.subsection || hasChildGroups(config, state.subsection))) {
    renderGroupSelector(config, state.subsection || "");
    markRouteRendered(routeKey, routeChanged);
    return;
  }

  if (state.section === "books" && state.entryId) {
    renderLoading("Открываю книгу…");
    try {
      const book = await getBookById(state.entryId);
      if (sequence !== renderSequence) return;
      if (!state.subsection) state.subsection = groupValue(book, config);
      renderBookDetail(book);
      markRouteRendered(routeKey, routeChanged);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось открыть книгу.");
      markRouteRendered(routeKey, routeChanged);
    }
    return;
  }

  if (state.section === "artifacts" && state.entryId) {
    renderLoading("Открываю сет артефактов…");
    try {
      const artifact = await getGenericDetail("artifacts", state.entryId);
      if (sequence !== renderSequence) return;
      renderArtifactDetail(artifact);
      markRouteRendered(routeKey, routeChanged);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось открыть сет артефактов.");
      markRouteRendered(routeKey, routeChanged);
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
      } else if (config.id === "stories") {
        renderStoryDetail(item, config);
      } else {
        renderGenericDetail(item, config);
      }
      markRouteRendered(routeKey, routeChanged);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось открыть запись.");
      markRouteRendered(routeKey, routeChanged);
    }
    return;
  }

  renderCatalog(config);
  markRouteRendered(routeKey, routeChanged);
}

async function init() {
  renderLoading();
  await render();
  scheduleBackgroundSectionPrefetch();
}

nav.addEventListener("click", handleNavClick);
app.addEventListener("click", handleAppClick);
app.addEventListener("keydown", handleAppKeydown);
app.addEventListener("input", handleAppInput);
app.addEventListener("change", handleAppChange);
app.addEventListener("mouseover", handleAppPrefetch);
app.addEventListener("focusin", handleAppPrefetch);
document.getElementById("open-menu")?.addEventListener("click", openMenu);
const drawerBackdrop = document.getElementById("drawer-backdrop");
drawerBackdrop?.addEventListener("click", closeMenu);
drawerBackdrop?.addEventListener("touchmove", event => event.preventDefault(), { passive: false });
window.addEventListener("hashchange", render);
window.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu();
});



function setupCustomScrollbar(scrollEl, railEl, thumbEl) {
  if (!scrollEl || !railEl || !thumbEl) return () => {};
  let dragging = false;
  let startY = 0;
  let startScroll = 0;

  function metrics() {
    const overflow = scrollEl.scrollHeight - scrollEl.clientHeight;
    const maxScroll = overflow > 18 ? overflow : 0;
    const railHeight = railEl.clientHeight;
    const thumbHeight = maxScroll > 0 ? Math.max(28, Math.floor((scrollEl.clientHeight / scrollEl.scrollHeight) * railHeight)) : 0;
    const maxThumbTop = Math.max(0, railHeight - thumbHeight);
    const thumbTop = maxScroll > 0 && maxThumbTop > 0 ? Math.round((scrollEl.scrollTop / maxScroll) * maxThumbTop) : 0;
    return { maxScroll, thumbHeight, maxThumbTop, thumbTop };
  }

  function update() {
    const m = metrics();
    const canScroll = m.maxScroll > 0 && m.maxThumbTop > 0;
    railEl.classList.toggle("has-scroll", canScroll);
    thumbEl.style.height = `${m.thumbHeight}px`;
    thumbEl.style.transform = `translateY(${m.thumbTop}px)`;
  }

  function scrollToPointer(clientY) {
    const rect = railEl.getBoundingClientRect();
    const m = metrics();
    if (!m.maxScroll || !m.maxThumbTop) return;
    const y = Math.min(Math.max(clientY - rect.top - m.thumbHeight / 2, 0), m.maxThumbTop);
    scrollEl.scrollTop = (y / m.maxThumbTop) * m.maxScroll;
  }

  scrollEl.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  railEl.addEventListener("wheel", event => {
    if (!metrics().maxScroll) return;
    event.preventDefault();
    scrollEl.scrollTop += event.deltaY;
  }, { passive: false });

  railEl.addEventListener("pointerdown", event => {
    if (!metrics().maxScroll) return;
    if (event.target !== thumbEl) scrollToPointer(event.clientY);
  });

  thumbEl.addEventListener("pointerdown", event => {
    const m = metrics();
    if (!m.maxScroll) return;
    dragging = true;
    startY = event.clientY;
    startScroll = scrollEl.scrollTop;
    thumbEl.classList.add("is-dragging");
    thumbEl.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  thumbEl.addEventListener("pointermove", event => {
    if (!dragging) return;
    const m = metrics();
    if (!m.maxScroll || !m.maxThumbTop) return;
    const delta = event.clientY - startY;
    scrollEl.scrollTop = startScroll + (delta / m.maxThumbTop) * m.maxScroll;
  });

  function stopDrag() {
    dragging = false;
    thumbEl.classList.remove("is-dragging");
  }

  thumbEl.addEventListener("pointerup", stopDrag);
  thumbEl.addEventListener("pointercancel", stopDrag);

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(update);
    observer.observe(scrollEl);
    observer.observe(railEl);
  }
  if ("MutationObserver" in window) {
    const observer = new MutationObserver(update);
    observer.observe(scrollEl, { childList: true, subtree: true, characterData: true });
  }
  update();
  return update;
}

const updateMenuRail = setupCustomScrollbar(sidebarScroll, document.getElementById("menu-rail"), document.getElementById("menu-thumb"));
const updateContentRail = setupCustomScrollbar(contentScroll, document.getElementById("content-rail"), document.getElementById("content-thumb"));
window.__archiveSyncScrollbars = function archiveSyncScrollbars() {
  updateMenuRail();
  updateContentRail();
  syncReaderSectionScrollbars();
  requestAnimationFrame(() => {
    updateMenuRail();
    updateContentRail();
    syncReaderSectionScrollbars();
  });
};

let readerSectionScrollbarDrag = null;

function scrollerForReaderSectionScrollbar(bar) {
  return bar?.closest(".reader-tabs-row")?.querySelector(".reader-section-scroll") || null;
}

app?.addEventListener("scroll", event => {
  if (event.target instanceof Element && event.target.classList.contains("reader-section-scroll")) {
    syncReaderSectionScrollbars();
  }
}, true);

app?.addEventListener("pointerdown", event => {
  const bar = event.target.closest?.(".reader-section-scrollbar");
  if (!bar) return;

  const scroller = scrollerForReaderSectionScrollbar(bar);
  if (!scroller) return;
  const m = readerScrollbarMetrics(scroller, bar);
  if (!m.maxScroll || !m.maxThumbLeft) return;

  const rect = bar.getBoundingClientRect();
  if (!event.target.closest?.(".reader-section-scrollbar-thumb")) {
    const targetLeft = Math.max(0, Math.min(m.maxThumbLeft, event.clientX - rect.left - (m.thumbWidth / 2)));
    scroller.scrollLeft = (targetLeft / m.maxThumbLeft) * m.maxScroll;
    syncReaderSectionScrollbars();
  }

  const thumb = bar.querySelector(".reader-section-scrollbar-thumb");
  readerSectionScrollbarDrag = {
    pointerId: event.pointerId,
    bar,
    scroller,
    startX: event.clientX,
    startScrollLeft: scroller.scrollLeft,
  };
  thumb?.classList.add("is-dragging");
  bar.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

app?.addEventListener("pointermove", event => {
  const drag = readerSectionScrollbarDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;

  const m = readerScrollbarMetrics(drag.scroller, drag.bar);
  if (!m.maxScroll || !m.maxThumbLeft) return;

  const delta = event.clientX - drag.startX;
  drag.scroller.scrollLeft = drag.startScrollLeft + (delta / m.maxThumbLeft) * m.maxScroll;
  syncReaderSectionScrollbars();
  event.preventDefault();
});

function stopReaderSectionScrollbarDrag(event) {
  const drag = readerSectionScrollbarDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.bar.querySelector(".reader-section-scrollbar-thumb")?.classList.remove("is-dragging");
  drag.bar.releasePointerCapture?.(event.pointerId);
  readerSectionScrollbarDrag = null;
}

app?.addEventListener("pointerup", stopReaderSectionScrollbarDrag);
app?.addEventListener("pointercancel", stopReaderSectionScrollbarDrag);

const toTopButton = document.getElementById("to-top-button");
let responsiveFitFrame = 0;
let viewportCleanupFrame = 0;
let viewportCleanupTimers = [];

function isTouchLikeViewport() {
  return Boolean(
    window.matchMedia?.("(hover: none) and (pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0 ||
    "ontouchstart" in window
  );
}

function updateMobileLandscapeClass() {
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0;
  const height = viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
  const isMobileLandscape = isTouchLikeViewport() && width > height && width <= 1180;
  document.documentElement.classList.toggle("is-mobile-landscape", isMobileLandscape);
}

function scheduleResponsiveFit() {
  if (responsiveFitFrame) return;
  responsiveFitFrame = window.requestAnimationFrame(() => {
    responsiveFitFrame = 0;
    syncReaderSectionScrollbars();
  });
}

function applyViewportCleanup() {
  viewportCleanupFrame = 0;
  updateMobileLandscapeClass();
  resetHorizontalScroll();
  scheduleResponsiveFit();
}

function scheduleViewportCleanup() {
  if (!viewportCleanupFrame) {
    viewportCleanupFrame = window.requestAnimationFrame(applyViewportCleanup);
  }
  for (const timer of viewportCleanupTimers) {
    window.clearTimeout(timer);
  }
  viewportCleanupTimers = [80, 240, 520].map(delay => window.setTimeout(() => {
    updateMobileLandscapeClass();
    resetHorizontalScroll();
    scheduleResponsiveFit();
  }, delay));
}

function updateToTopButton() {
  if (!toTopButton) return;
  toTopButton.classList.toggle("visible", primaryScrollY() > 520);
}

toTopButton?.addEventListener("click", () => {
  scrollPrimaryTo(0, "smooth");
});

contentScroll?.addEventListener("scroll", updateToTopButton, { passive: true });
window.addEventListener("scroll", updateToTopButton, { passive: true });
updateToTopButton();

updateMobileLandscapeClass();
init();

window.addEventListener("resize", scheduleViewportCleanup, { passive: true });
window.addEventListener("orientationchange", scheduleViewportCleanup, { passive: true });
window.visualViewport?.addEventListener("resize", scheduleViewportCleanup, { passive: true });
