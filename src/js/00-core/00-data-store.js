// Хранилище данных, кэш деталей и загрузка JSON.

let BOOKS = [];
let ARTIFACTS = [];
let WEAPONS = [];
let ITEMS = [];
let STORIES = [];
let ENEMIES = [];
const DETAILS = new Map();
const CATALOG_CACHE = new Map();
const CATALOG_LOADS = new Map();
const SEARCH_TEXT_CACHE = new WeakMap();
const COMMON_ENEMY_TYPES_CACHE = new WeakMap();
const expandedEnemyDescriptionKeys = new Set();
const catalogScrollPositions = new Map();
let renderSequence = 0;
let renderedRouteKey = "";
let activeDetail = null;
let lastPrefetchedEntryKey = "";
let menuScrollY = 0;

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
  if (CATALOG_CACHE.has(key)) {
    assignSectionData(config.id, CATALOG_CACHE.get(key));
    return;
  }
  if (CATALOG_LOADS.has(key)) return CATALOG_LOADS.get(key);

  const promise = fetchOptionalJson(catalogIndexPath(config, subsection))
    .then(data => {
      const list = normalizeList(data, config.id);
      CATALOG_CACHE.set(key, list);
      assignSectionData(config.id, list);
    })
    .finally(() => CATALOG_LOADS.delete(key));

  CATALOG_LOADS.set(key, promise);
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
  const detailDirectory = sectionId === "bestiary" ? "enemies" : sectionId;
  const detailPath = fromIndex?.detail_path || `data/${detailDirectory}/${encodeURIComponent(id)}.json`;
  const detail = await fetchOptionalJson(detailPath);
  const result = detail?.id ? detail : fromIndex;
  DETAILS.set(cacheKey, result);
  return result;
}
