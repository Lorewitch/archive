/* Source for sw.js. Run tools/build_pwa.py after changing public files. */
"use strict";

const BUILD_ID = "__ARCHIVE_PWA_BUILD__";
const APP_SHELL = __ARCHIVE_PWA_SHELL__;
const EMPTY_CATALOGS = new Set(__ARCHIVE_PWA_EMPTY_CATALOGS__);
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

function contentVersion(input) {
  const url = new URL(typeof input === "string" ? input : input.url, BASE_URL);
  const version = url.searchParams.get("v");
  return version ? `${BUILD_ID}:${version}` : "";
}

function releaseResponse(response, version) {
  if (!version) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Archive-Content-Version", version);
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

function isCurrentContent(response, request) {
  const version = contentVersion(request);
  return Boolean(version && response?.headers.get("X-Archive-Content-Version") === version);
}

async function saveJsonResponse(key, response, version = "") {
  try {
    const value = await response.clone().json();
    if (!value || typeof value !== "object") return;
  } catch (_) {
    return; // Keep the previous valid copy if a server returned malformed JSON.
  }
  return saveResponse(DATA_CACHE, key, releaseResponse(response, version), DATA_LIMIT);
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
  // A validated response from this exact application release needs no round trip.
  const current = await cachedResponse(key);
  if (isCurrentContent(current, request)) return current;
  try {
    const response = await fetchFresh(request);
    if (response.ok) {
      event.waitUntil(saveJsonResponse(key, response.clone(), contentVersion(request)));
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
  if (isCurrentContent(saved, request)) return saved;
  const fresh = fetchFresh(request).then(response => {
    if (response.ok) return saveResponse(IMAGE_CACHE, key, releaseResponse(response.clone(), contentVersion(request)), IMAGE_LIMIT).then(() => response);
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
    if (isArchiveData(path)) await saveJsonResponse(key, response, contentVersion(input));
    else await saveResponse(IMAGE_CACHE, key, releaseResponse(response, contentVersion(input)), IMAGE_LIMIT);
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
    // Catalogs are fetched on demand. Drop outdated catalog metadata on release change;
    // retain saved texts for offline fallback until each one is visited online.
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
