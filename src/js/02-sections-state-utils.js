// Описание разделов, состояние страницы и базовые утилиты текста.

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
