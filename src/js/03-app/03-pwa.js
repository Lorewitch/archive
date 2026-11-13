// Установка приложения, подсказки и сохранение первого посещения для чтения без сети.

const pwaDialog = document.getElementById("pwa-install-dialog");
const pwaStandalone = window.matchMedia("(display-mode: standalone)");
const firstVisitUrls = new Set();
let pwaRegistration = null;
let pwaPrompt = null;
let pwaInstalledThisSession = false;
let pwaReloadRequested = false;
let pwaLastUpdateCheck = 0;
let pwaOfflineMessage = "";
let pwaNetworkMessage = navigator.onLine === false ? "Без сети · доступны сохранённые материалы" : "";
let pwaPromptPending = false;

function connectPwaControls() {
  // About-page controls are recreated on navigation; application state survives.
  document.getElementById("pwa-install")?.addEventListener("click", installArchivePwa);
  document.getElementById("pwa-update")?.addEventListener("click", updateArchivePwa);
  syncPwaControls();
}

function syncPwaControls() {
  syncPwaInstallButton();
  showPwaUpdate();
  const hint = document.getElementById("pwa-offline-hint");
  if (hint) {
    hint.hidden = !pwaOfflineMessage;
    hint.textContent = pwaOfflineMessage;
  }
  const status = document.getElementById("pwa-network-status");
  if (status) {
    status.hidden = !pwaNetworkMessage;
    status.textContent = pwaNetworkMessage;
  }
}

function isInstalledArchive() {
  return pwaStandalone.matches || navigator.standalone === true;
}

function syncPwaInstallButton() {
  const pwaInstall = document.getElementById("pwa-install");
  if (!pwaInstall) return;
  pwaInstall.hidden = pwaInstalledThisSession || isInstalledArchive() || !window.isSecureContext;
  pwaInstall.disabled = pwaPromptPending;
  pwaInstall.textContent = pwaPrompt ? "Установить Архив" : "Как установить Архив";
}

function syncPwaNetworkStatus() {
  pwaNetworkMessage = navigator.onLine === false ? "Без сети · доступны сохранённые материалы" : "";
  syncPwaControls();
}

function sendFirstVisitUrls() {
  const worker = pwaRegistration?.active;
  if (!worker || !firstVisitUrls.size) return;
  worker.postMessage({ type: "ARCHIVE_CACHE_VISITED", urls: [...firstVisitUrls] });
  firstVisitUrls.clear();
}

function rememberFirstVisitUrl(url) {
  if (typeof url !== "string" || firstVisitUrls.size >= 120) return;
  firstVisitUrls.add(new URL(url, window.location.href).href);
  sendFirstVisitUrls();
}

function warmFirstVisit() {
  const base = new URL("./", window.location.href);
  for (const entry of performance.getEntriesByType("resource")) {
    const url = new URL(entry.name);
    if (url.origin === base.origin && url.pathname.startsWith(base.pathname) && firstVisitUrls.size < 120) firstVisitUrls.add(url.href);
  }
  sendFirstVisitUrls();
}

function showPwaUpdate() {
  const pwaUpdate = document.getElementById("pwa-update");
  if (!pwaUpdate) return;
  pwaUpdate.hidden = !pwaRegistration?.waiting;
  pwaUpdate.disabled = pwaReloadRequested;
  pwaUpdate.textContent = pwaReloadRequested ? "Обновляю…" : "Обновить Архив";
}

function showPwaInstallHelp() {
  closeMenu();
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  document.getElementById("pwa-install-help").textContent = appleMobile
    ? "Открой меню «Поделиться» в браузере и выбери «На экран Домой». Подтверди добавление Архива."
    : "Открой меню браузера и найди установку приложения или добавление сайта на главный экран. В Chrome и Edge значок установки также может появиться рядом с адресом сайта.";
  if (typeof pwaDialog.showModal === "function") pwaDialog.showModal();
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  pwaPrompt = event;
  syncPwaInstallButton();
});

window.addEventListener("appinstalled", () => {
  pwaInstalledThisSession = true;
  pwaPrompt = null;
  syncPwaInstallButton();
});

pwaStandalone.addEventListener("change", syncPwaInstallButton);
async function installArchivePwa() {
  if (pwaPromptPending) return;
  if (!pwaPrompt) return showPwaInstallHelp();
  const prompt = pwaPrompt;
  pwaPrompt = null;
  pwaPromptPending = true;
  syncPwaInstallButton();
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } catch (_) {
    showPwaInstallHelp();
  } finally {
    pwaPromptPending = false;
    syncPwaInstallButton();
  }
}

pwaDialog.addEventListener("click", event => {
  if (event.target !== pwaDialog) return;
  const rect = pwaDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) pwaDialog.close();
});
pwaDialog.addEventListener("close", () => {
  (document.getElementById("pwa-install") || document.getElementById("open-menu"))?.focus();
});

function updateArchivePwa() {
  if (!pwaRegistration?.waiting) return;
  pwaReloadRequested = true;
  showPwaUpdate();
  pwaRegistration.waiting.postMessage({ type: "ARCHIVE_SKIP_WAITING" });
}

window.addEventListener("archive:data-loaded", event => {
  if (!navigator.serviceWorker?.controller) rememberFirstVisitUrl(event.detail?.url);
  if (!event.detail?.savedCopy) syncPwaNetworkStatus();
});

window.addEventListener("archive:saved-copy", () => {
  pwaNetworkMessage = "Чтение сохранённой копии";
  syncPwaControls();
});
window.addEventListener("offline", syncPwaNetworkStatus);
window.addEventListener("online", () => {
  syncPwaNetworkStatus();
  pwaRegistration?.update().catch(() => {});
  if (app.querySelector(".archive-load-error")) render();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || Date.now() - pwaLastUpdateCheck < 30 * 60 * 1000) return;
  pwaLastUpdateCheck = Date.now();
  pwaRegistration?.update().catch(() => {});
});

async function initArchivePwa() {
  syncPwaInstallButton();
  syncPwaNetworkStatus();
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (pwaReloadRequested) window.location.reload();
    else warmFirstVisit();
  });
  navigator.serviceWorker.addEventListener("message", event => {
    if (event.data?.type === "ARCHIVE_STORAGE_UNAVAILABLE") {
      pwaOfflineMessage = "Браузеру не удалось сохранить часть материалов для чтения без сети.";
      syncPwaControls();
    }
  });
  pwaRegistration = await navigator.serviceWorker.register(new URL("sw.js", new URL("./", window.location.href)), {
    scope: "./", updateViaCache: "none",
  });
  showPwaUpdate();
  pwaRegistration.addEventListener("updatefound", () => {
    const worker = pwaRegistration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed") window.setTimeout(showPwaUpdate, 0);
    });
  });
  await navigator.serviceWorker.ready;
  pwaOfflineMessage = "Каталог доступен без сети. Открытые материалы сохраняются для чтения.";
  syncPwaControls();
  warmFirstVisit();
  // Include resources that were already loading while the first worker installed.
  window.addEventListener("load", warmFirstVisit, { once: true });
}

init();
initArchivePwa().catch(error => {
  console.warn("Архив: офлайн-режим пока недоступен", error);
});
