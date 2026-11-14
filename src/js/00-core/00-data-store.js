// Хранилище данных, кэш деталей и загрузка JSON.

let BOOKS = [];
let ARTIFACTS = [];
let WEAPONS = [];
let ITEMS = [];
let STORIES = [];
let ENEMIES = [];
const DETAILS = new Map();
const DETAIL_LOADS = new Map();
const DETAIL_CACHE_LIMIT = 24;
const CATALOG_CACHE = new Map();
const CATALOG_LOADS = new Map();
const SEARCH_TEXT_CACHE = new WeakMap();
const COMMON_ENEMY_TYPES_CACHE = new WeakMap();
const catalogScrollPositions = new Map();
let renderSequence = 0;
let renderedRouteKey = "";
let activeDetail = null;

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

function notifyLoadedData(url, savedCopy = false) {
  if (typeof CustomEvent !== "function" || !window.dispatchEvent) return;
  window.dispatchEvent(new CustomEvent("archive:data-loaded", { detail: { url, savedCopy } }));
  if (savedCopy) window.dispatchEvent(new CustomEvent("archive:saved-copy"));
}

async function fetchArchiveJson(path, optional = false) {
  const url = versionedDataPath(path);
  const response = await fetch(url);
  if (response.headers?.get("X-Archive-Offline-Miss") === "1") {
    throw new Error("Этот материал ещё не сохранён для чтения без сети. Открой его с интернетом, и он станет доступен в следующий раз.");
  }
  if (optional && response.status === 404) return [];
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
  const data = await response.json();
  notifyLoadedData(url, response.headers?.get("X-Archive-Saved-Copy") === "1");
  return data;
}

function fetchJson(path) {
  return fetchArchiveJson(path);
}

function fetchOptionalJson(path) {
  // Only an actual online 404 means an empty category; an offline miss is an error.
  return fetchArchiveJson(path, true);
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
  if (sectionId === "bestiary") ENEMIES = list.map(item => ({
    ...item,
    detail_path: item.detail_path || `data/enemies/${encodeURIComponent(item.id)}.json`
  }));
}

function catalogCacheKey(config, subsection = state.subsection) {
  return `${config.id}:${subsection || "all"}`;
}

function catalogIndexPath(config, subsection = state.subsection) {
  if (config.groups && subsection) {
    return `data/indexes/${encodeURIComponent(config.id)}/${encodeURIComponent(subsection)}.json`;
  }
  return config.id === "bestiary" ? "data/enemies_index.json" : `data/${config.id}_index.json`;
}

async function loadCatalogData(config, subsection = state.subsection) {
  const key = catalogCacheKey(config, subsection);
  let rows = CATALOG_CACHE.get(key);

  if (!rows) {
    let load = CATALOG_LOADS.get(key);
    if (!load) {
      load = fetchOptionalJson(catalogIndexPath(config, subsection))
        .then(data => {
          const list = normalizeList(data, config.id);
          CATALOG_CACHE.set(key, list);
          return list;
        })
        .finally(() => CATALOG_LOADS.delete(key));
      CATALOG_LOADS.set(key, load);
    }
    rows = await load;
  }

  // Только текущий маршрут может менять активную коллекцию.
  // Иначе отставший запрос прежней категории подменит данные после перехода.
  const activeSubsection = state.subsection;
  if (state.section === config.id && catalogCacheKey(config, activeSubsection) === key) {
    assignSectionData(config.id, rows);
  }
  return rows;
}

async function loadDetail(sectionId, id) {
  const cacheKey = `${sectionId}:${id}`;
  if (DETAILS.has(cacheKey)) {
    const detail = DETAILS.get(cacheKey);
    DETAILS.delete(cacheKey);
    DETAILS.set(cacheKey, detail);
    return detail;
  }
  if (!DETAIL_LOADS.has(cacheKey)) {
    const directory = sectionId === "bestiary" ? "enemies" : sectionId;
    const pending = fetchJson(sectionId === "stories"
      ? `data/readers/stories/${encodeURIComponent(id)}.json`
      : `data/${directory}/${encodeURIComponent(id)}.json`)
      .then(detail => {
        if (!detail?.id) throw new Error("Запись не найдена.");
        DETAILS.set(cacheKey, detail);
        if (DETAILS.size > DETAIL_CACHE_LIMIT) DETAILS.delete(DETAILS.keys().next().value);
        return detail;
      })
      .finally(() => DETAIL_LOADS.delete(cacheKey));
    DETAIL_LOADS.set(cacheKey, pending);
  }
  return DETAIL_LOADS.get(cacheKey);
}

function getBookById(id) {
  return loadDetail("books", id);
}

function getGenericDetail(sectionId, id) {
  return loadDetail(sectionId, id);
}

let ARCHIVE_SUMMARY = null;
let ARCHIVE_SUMMARY_LOAD = null;

async function loadArchiveSummary() {
  if (ARCHIVE_SUMMARY) return ARCHIVE_SUMMARY;
  if (!ARCHIVE_SUMMARY_LOAD) {
    ARCHIVE_SUMMARY_LOAD = fetchJson("data/archive_summary.json")
      .then(summary => { ARCHIVE_SUMMARY = summary; return summary; })
      .finally(() => { ARCHIVE_SUMMARY_LOAD = null; });
  }
  return ARCHIVE_SUMMARY_LOAD;
}

// Bodies are fetched only after opening a story and choosing its content/language.
const STORY_CHUNK_LOADS = new Map();

function storyReaderChunkPath(story, contentType = activeStoryContentType(story), lang = state.lang) {
  return story?.reader_chunks?.[contentType]?.[lang] || "";
}

function storyReaderChunkLoaded(story, contentType = activeStoryContentType(story), lang = state.lang) {
  if (!storyReaderChunkPath(story, contentType, lang)) return true;
  const parts = contentType === "replicas" ? story.replicas : story.parts;
  return Array.isArray(parts) && parts.every(part => Object.prototype.hasOwnProperty.call(part.text || {}, lang));
}


async function loadStoryReaderChunk(story, contentType = activeStoryContentType(story), lang = state.lang) {
  const path = storyReaderChunkPath(story, contentType, lang);
  if (!path || storyReaderChunkLoaded(story, contentType, lang)) return story;
  if (!STORY_CHUNK_LOADS.has(path)) {
    STORY_CHUNK_LOADS.set(path, fetchJson(path).finally(() => STORY_CHUNK_LOADS.delete(path)));
  }
  const payload = await STORY_CHUNK_LOADS.get(path);
  const parts = contentType === "replicas" ? story.replicas : story.parts;
  if (payload?.id !== story.id || payload.kind !== contentType || payload.language !== lang || !Array.isArray(payload.parts)
      || payload.parts.length !== parts.length) throw new Error("Не удалось загрузить текст выбранного раздела.");
  const texts = new Map(payload.parts.map(part => [Number(part.number), part.text]));
  if (parts.some(part => typeof texts.get(Number(part.number)) !== "string")) throw new Error("Неполный текст выбранного раздела.");
  for (const part of parts) {
    if (!part.text) part.text = {};
    part.text[lang] = texts.get(Number(part.number));
  }
  return story;
}
