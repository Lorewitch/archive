// Конфигурация разделов, меню и метаданных каталога.

const SECTIONS = [
  {
    id: "books",
    icon: `${UI_ICON_BASE}/books.webp`,
    title: "Книги",
    data: () => BOOKS,
    filter: "region",
    filterLabel: "Все регионы",
    empty: "В этом разделе пока нет текстов.",
    meta: item => [
      { label: "Частей", value: escapeHtml(item.volume_count || item.volumes?.length || 1), showLabel: true },
      { value: renderBookTypeCell(item) },
    ]
  },
  {
    id: "artifacts",
    icon: `${UI_ICON_BASE}/artifacts.webp`,
    title: "Артефакты",
    data: () => ARTIFACTS,
    filter: "region",
    filterLabel: "Все регионы",
    empty: "Артефакты пока не добавлены.",
    meta: () => []
  },
  {
    id: "weapons",
    icon: `${UI_ICON_BASE}/weapons.webp`,
    title: "Оружие",
    data: () => WEAPONS,
    filter: "",
    filterLabel: "",
    empty: "Оружие пока не добавлено.",
    meta: item => [{ value: escapeHtml(labelFromOptions(item.weapon_type || item.type, WEAPON_TYPES) || item.weapon_type || item.type || "—") }]
  },
  {
    id: "items",
    icon: `${UI_ICON_BASE}/inventory.webp`,
    title: "Инвентарь",
    data: () => ITEMS,
    groups: ITEM_GROUPS,
    groupField: "item_group",
    defaultGroup: "teyvat_resources",
    filter: "region",
    filterLabel: "Все регионы",
    empty: "В этой категории пока нет предметов.",
    meta: item => state.subsection === "common_enemies"
      ? [{ value: renderDroppedByCell(item), chips: true }]
      : state.subsection === "development_materials" ? []
      : itemGroupUsesTypeFilters(state.subsection) ? [{ value: renderGenericItemTypeCell(item) }]
      : isEnemyDropGroup(state.subsection) ? [{ value: renderMaterialsCell(item), chips: true }] : []
  },
  {
    id: "bestiary",
    icon: `${UI_ICON_BASE}/enemy_bestiary_icon.webp`,
    title: "Бестиарий",
    data: () => ENEMIES,
    groups: BESTIARY_GROUPS,
    groupField: "enemy_group",
    defaultGroup: "hilichurls",
    filter: "region",
    filterLabel: "Все регионы",
    empty: "В этой части бестиария пока нет записей.",
    meta: item => [{ value: escapeHtml(labelFromOptions(item.enemy_group, BESTIARY_GROUPS) || item.enemy_group || "—") }]
  },
  {
    id: "stories",
    icon: `${UI_ICON_BASE}/quest_icon.webp`,
    title: "Истории",
    data: () => STORIES,
    groups: STORY_GROUPS,
    groupField: "story_group",
    defaultGroup: "world_quests",
    filter: "region",
    filterLabel: "Все регионы",
    empty: "В этой категории пока нет историй.",
    meta: item => state.subsection === "character_stories"
      ? [{ value: renderStoryElementCell(item), chips: true }]
      : [{ value: escapeHtml(item.display_category || storyGroupLabel(item.story_group || state.subsection)), chips: true }]
  }
];

const HOME_SECTION = {
  id: "home",
  icon: `${UI_ICON_BASE}/home.webp`,
  title: "Об Архиве",
};

const MENU_CHILDREN = {
  items: ITEM_GROUPS.map(([key, label]) => [key, label]),
  bestiary: BESTIARY_GROUPS.map(([key, label]) => [key, label]),
  stories: STORY_GROUPS.map(([key, label]) => [key, label])
};
