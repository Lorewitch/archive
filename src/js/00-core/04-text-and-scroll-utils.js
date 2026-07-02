// Общие утилиты текста, Markdown и служебного скролла.

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
