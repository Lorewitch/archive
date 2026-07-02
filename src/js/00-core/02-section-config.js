// Конфигурация разделов, меню и колонок каталога.

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
  title: "О Библиотеке",
  description: "Архив игровых текстов без вики-разметки, числовых обозначений и лишних таблиц."
};

const MENU_CHILDREN = {
  items: ITEM_GROUPS.map(([key, label]) => [key, label]),
  stories: STORY_GROUPS.map(([key, label]) => [key, label])
};
