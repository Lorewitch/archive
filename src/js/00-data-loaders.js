// Состояние, версии ресурсов и загрузка JSON.

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
