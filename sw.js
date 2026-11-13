/* Source for sw.js. Run tools/build_pwa.py after changing public files. */
"use strict";

const BUILD_ID = "1fa350387c0009cb";
const APP_SHELL = [
  "assets/css/archive.css?v=783",
  "assets/icons/apple-touch-icon.png?v=783",
  "assets/icons/favicon.ico?v=783",
  "assets/icons/favicon.svg?v=783",
  "assets/icons/logo_menu_symbol.webp?v=783",
  "assets/icons/pwa-192.png",
  "assets/icons/pwa-512.png",
  "assets/icons/pwa-maskable-512.png",
  "assets/icons/ui/anemo.webp",
  "assets/icons/ui/artifacts.webp",
  "assets/icons/ui/books.webp",
  "assets/icons/ui/bow.webp",
  "assets/icons/ui/catalyst.webp",
  "assets/icons/ui/claymore.webp",
  "assets/icons/ui/cryo.webp",
  "assets/icons/ui/dendro.webp",
  "assets/icons/ui/electro.webp",
  "assets/icons/ui/enemy_bestiary_icon.webp",
  "assets/icons/ui/geo.webp",
  "assets/icons/ui/home.webp",
  "assets/icons/ui/hydro.webp",
  "assets/icons/ui/inventory.webp",
  "assets/icons/ui/lunar_reactions.webp",
  "assets/icons/ui/polearm.webp",
  "assets/icons/ui/pyro.webp",
  "assets/icons/ui/quest_icon.webp",
  "assets/icons/ui/star.webp",
  "assets/icons/ui/star_blade.webp",
  "assets/icons/ui/sword.webp",
  "assets/icons/ui/weapons.webp",
  "assets/icons/ui/witchcraft.webp",
  "assets/js/archive.js?v=783",
  "data/archive_summary.json",
  "data/artifacts_index.json",
  "data/books_index.json",
  "data/enemies_index.json",
  "data/indexes/bestiary/abyss.json",
  "data/indexes/bestiary/automatons.json",
  "data/indexes/bestiary/elementals.json",
  "data/indexes/bestiary/fatui.json",
  "data/indexes/bestiary/hilichurls.json",
  "data/indexes/bestiary/human_factions.json",
  "data/indexes/bestiary/mystical_beasts.json",
  "data/indexes/items/common_enemies.json",
  "data/indexes/items/development_materials.json",
  "data/indexes/items/teyvat_resources.json",
  "data/indexes/items/weekly_bosses.json",
  "data/indexes/items/world_bosses.json",
  "data/indexes/stories/archon_quests.json",
  "data/indexes/stories/character_stories.json",
  "data/indexes/stories/legend_quests.json",
  "data/indexes/stories/world_quests.json",
  "data/items_index.json",
  "data/stories_index.json",
  "data/weapons_index.json",
  "index.html",
  "manifest.webmanifest?v=783"
];
const EMPTY_CATALOGS = new Set(["data/indexes/items/serenitea_pot.json", "data/indexes/items/useful_items.json", "data/indexes/items/misc.json"]);
const BASE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `lorewitch-archive:${BASE_URL.pathname}:`;
const SHELL_CACHE = `${CACHE_PREFIX}shell:${BUILD_ID}`;
const DATA_CACHE = `${CACHE_PREFIX}texts`;
const IMAGE_CACHE = `${CACHE_PREFIX}images`;
const DATA_LIMIT = 240;
const IMAGE_LIMIT = 300;
const NETWORK_TIMEOUT = 6000;
const SHELL_KEYS = new Set(APP_SHELL.map(path => cacheKey(path)));
const pendingCopies = new Map();
let storageWarningSent = false;
let cacheWriteQueue = Promise.resolve();

function localPath(input) {
  const url = new URL(input, BASE_URL);
  if (url.origin !== BASE_URL.origin || !url.pathname.startsWith(BASE_URL.pathname)) return null;
  return url.pathname.slice(BASE_URL.pathname.length);
}

function cacheKey(input) {
  const url = new URL(input, BASE_URL);
  url.searchParams.delete("v");
  url.hash = "";
  return url.href;
}

function isArchiveData(path) {
  return path?.startsWith("data/") && path.endsWith(".json") && !/^data\/bot_/.test(path);
}

function isArchiveImage(path) {
  return path?.startsWith("assets/icons/") && /\.(webp|png|svg|ico)$/i.test(path);
}

async function cachedResponse(key, includeShell = true) {
  try {
    for (const name of [DATA_CACHE, IMAGE_CACHE, ...(includeShell ? [SHELL_CACHE] : [])]) {
      const response = await (await caches.open(name)).match(key);
      if (response) return response;
    }
  } catch (_) {
    // A storage restriction must not prevent ordinary online reading.
  }
  return null;
}

async function reportStorageWarning() {
  if (storageWarningSent) return;
  storageWarningSent = true;
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) client.postMessage({ type: "ARCHIVE_STORAGE_UNAVAILABLE" });
}

function saveResponse(name, key, response, limit) {
  // Serialize insertion and eviction so simultaneous image loads keep the limit.
  const task = cacheWriteQueue.then(async () => {
    const cache = await caches.open(name);
    await cache.delete(key);
    await cache.put(key, response);
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(old);
  }).catch(() => reportStorageWarning().catch(() => {}));
  cacheWriteQueue = task;
  return task;
}

async function fetchFresh(input) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT);
  try {
    return await fetch(input, { cache: "no-cache", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function saveJsonResponse(key, response) {
  try {
    const value = await response.clone().json();
    if (!value || typeof value !== "object") return;
  } catch (_) {
    return; // Keep the previous valid copy if a server returned malformed JSON.
  }
  return saveResponse(DATA_CACHE, key, response, DATA_LIMIT);
}

function offlineCopy(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Archive-Saved-Copy", "1");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function offlineMiss() {
  return new Response(JSON.stringify({ error: "offline-not-saved" }), {
    status: 503,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Archive-Offline-Miss": "1" },
  });
}

async function networkFirstData(request, event) {
  const key = cacheKey(request.url);
  try {
    const response = await fetchFresh(request);
    if (response.ok) {
      event.waitUntil(saveJsonResponse(key, response.clone()));
      return response;
    }
    // An online deletion is authoritative; never resurrect it from the cache.
    if (response.status === 404 || response.status === 410) {
      event.waitUntil((async () => {
        await cacheWriteQueue;
        await (await caches.open(DATA_CACHE)).delete(key);
        await (await caches.open(SHELL_CACHE)).delete(key);
      })().catch(() => {}));
      return response;
    }
    if (response.status < 500) return response;
    const saved = await cachedResponse(key);
    if (saved) return offlineCopy(saved);
    if (EMPTY_CATALOGS.has(localPath(request.url))) {
      return new Response("[]", { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    return offlineMiss();
  } catch (_) {
    const saved = await cachedResponse(key);
    if (saved) return offlineCopy(saved);
    if (EMPTY_CATALOGS.has(localPath(request.url))) {
      return new Response("[]", { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    return offlineMiss();
  }
}

async function navigationResponse(request) {
  // Keep HTML and its JS/CSS in one release until the reader accepts an update.
  const saved = await cachedResponse(new URL("index.html", BASE_URL).href);
  if (saved) return saved;
  try {
    const response = await fetchFresh(request);
    if (response.ok || response.status < 500) return response;
  } catch (_) {}
  return new Response("Архив пока не сохранён для чтения без сети. Открой его с интернетом.", {
    status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function imageResponse(request, event) {
  const key = cacheKey(request.url);
  if (SHELL_KEYS.has(key)) return shellResponse(request);
  const saved = await cachedResponse(key);
  const fresh = fetchFresh(request).then(response => {
    if (response.ok) return saveResponse(IMAGE_CACHE, key, response.clone(), IMAGE_LIMIT).then(() => response);
    return response;
  });
  if (saved) {
    event.waitUntil(fresh.catch(() => {}));
    return saved;
  }
  try { return await fresh; } catch (_) { return new Response(null, { status: 503 }); }
}

async function shellResponse(request) {
  const key = cacheKey(request.url);
  try {
    const saved = await (await caches.open(SHELL_CACHE)).match(key);
    if (saved) return saved;
  } catch (_) {}
  return fetch(request);
}

async function cacheVisitedUrl(input) {
  const path = localPath(input);
  if (!isArchiveData(path) && !isArchiveImage(path)) return;
  const key = cacheKey(input);
  if (pendingCopies.has(key)) return pendingCopies.get(key);
  const task = (async () => {
    if (await cachedResponse(key)) return;
    const response = await fetchFresh(new URL(input, BASE_URL).href);
    if (!response.ok) return;
    if (isArchiveData(path)) await saveJsonResponse(key, response);
    else await saveResponse(IMAGE_CACHE, key, response, IMAGE_LIMIT);
  })().catch(() => {}).finally(() => pendingCopies.delete(key));
  pendingCopies.set(key, task);
  return task;
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      const results = await Promise.allSettled(APP_SHELL.map(async path => {
        const url = new URL(path, BASE_URL).href;
        const response = await fetchFresh(url);
        if (!response.ok) throw new Error(`Cannot save ${path}: ${response.status}`);
        if (localPath(url) === "index.html" && /^(?:<{7} |={7}\s*$|>{7} )/m.test(await response.clone().text())) {
          throw new Error("Cannot save index.html: unresolved Git conflict");
        }
        await cache.put(cacheKey(url), response);
      }));
      const failure = results.find(result => result.status === "rejected");
      if (failure) throw failure.reason;
    } catch (error) {
      await caches.delete(SHELL_CACHE);
      throw error;
    }
    // A new version waits until the reader chooses to update or closes old tabs.
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(`${CACHE_PREFIX}shell:`) && name !== SHELL_CACHE) await caches.delete(name);
    }
    // Current catalogs were fetched atomically with this release's shell.
    // Retain saved texts while dropping older catalog copies that could mask them.
    const data = await caches.open(DATA_CACHE);
    for (const key of await data.keys()) {
      const path = localPath(key.url);
      if (path?.startsWith("data/indexes/") || /^data\/(?:archive_summary|\w+_index)\.json$/.test(path || "")) {
        await data.delete(key);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const path = localPath(request.url);
  if (request.method !== "GET" || path === null || request.headers.has("range")) return;
  if (request.mode === "navigate") {
    if (path === "" || path === "index.html") event.respondWith(navigationResponse(request));
    return;
  }
  if (isArchiveData(path)) return event.respondWith(networkFirstData(request, event));
  if (isArchiveImage(path)) return event.respondWith(imageResponse(request, event));
  if (/^assets\/(css|js)\//.test(path) || path === "manifest.webmanifest") {
    event.respondWith(shellResponse(request));
  }
});

self.addEventListener("message", event => {
  const source = event.source;
  if (!source?.url || localPath(source.url) === null) return;
  if (event.data?.type === "ARCHIVE_SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  } else if (event.data?.type === "ARCHIVE_CACHE_VISITED" && Array.isArray(event.data.urls)) {
    event.waitUntil(Promise.all(event.data.urls.slice(0, 120).filter(url => typeof url === "string").map(cacheVisitedUrl)));
  }
});
