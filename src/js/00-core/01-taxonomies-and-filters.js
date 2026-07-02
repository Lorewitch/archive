// Справочники, группы, фильтры и нормализация типов.

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
  rarity5: "#ffc15a",
  rarity4: "#c08cff",
  rarity3: "#73d1ff",
  rarity2: "#a9e56d",
  rarity1: "#c5bbae",
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
  ["weekly_bosses", "Еженедельные боссы", "Редкие трофеи могущественных противников: следы тяжёлых битв, где механика встречается с лором."],
  ["world_bosses", "Мировые боссы", "Диковинные трофеи владык открытого мира: кристаллы, ядра и осколки сил для возвышения персонажей."],
  ["common_enemies", "Обычные противники", "Повседневная добыча с монстров и вражеских отрядов: маски, знаки, обломки и другие маленькие улики мира."],
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
