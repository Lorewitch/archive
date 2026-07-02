// Основной контроллер рендера, ленивые загрузки и запуск приложения.

function requestIdleTask(callback, timeout = 1600) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout });
  } else {
    window.setTimeout(callback, 180);
  }
}

function scheduleBackgroundSectionPrefetch() {
  if (backgroundPrefetchStarted) return;
  backgroundPrefetchStarted = true;

  requestIdleTask(() => {
    SECTIONS
      .map(section => section.id)
      .filter(sectionId => sectionId !== state.section && BACKGROUND_PREFETCH_SECTIONS.has(sectionId))
      .forEach((sectionId, index) => {
        window.setTimeout(() => loadSectionData(sectionId).catch(() => {}), index * 90);
      });
  });
}

function prefetchDetail(sectionId, entryId) {
  if (!entryId) return;
  const key = `${sectionId}:${entryId}`;
  if (key === lastPrefetchedEntryKey) return;
  lastPrefetchedEntryKey = key;

  const loader = sectionId === "books" ? getBookById(entryId) : getGenericDetail(sectionId, entryId);
  loader.catch(() => {});
}

function handleAppPrefetch(event) {
  const row = event.target.closest("[data-entry-id]");
  if (!row) return;
  prefetchDetail(row.dataset.sectionId || currentCatalogConfig().id, row.dataset.entryId);
}


function renderHome() {
  activeDetail = null;
  app.innerHTML = `
    <section class="page-card home-page">
      <article class="home-intro" aria-label="О Библиотеке">
        <p>Библиотека Лороведьмы — это тихий архив игровых текстов. Не википедия, не справочник с числовыми обозначениями и не таблица характеристик, а место, где можно спокойно читать книги, записки, описания предметов, оружия и артефактов.</p>
        <p>Здесь собраны тексты Тейвата в удобной форме: без лишнего шума, без пересказов и без попытки заменить сам источник. Только строки, которые уже есть в игре, аккуратно разложенные по полкам.</p>
        <p>Эта библиотека создана Лороведьмой для лороведов — для тех, кто любит возвращаться к деталям, сверять формулировки, искать связи и просто читать мир внимательнее.</p>
      </article>
    </section>
  `;
}

function renderLoading(message = "Загружаю архив…") {
  app.innerHTML = `
    <section class="page-card">
      <div class="empty"><div class="empty-card">${escapeHtml(message)}</div></div>
    </section>
  `;
}

function renderError(message) {
  app.innerHTML = `
    <section class="page-card">
      <div class="page-head"><h1>Ошибка загрузки</h1></div>
      <div class="empty"><div class="empty-card">${escapeHtml(message)}</div></div>
    </section>
  `;
}

async function render() {
  const sequence = ++renderSequence;
  rememberCatalogScrollPosition();
  const previousRouteKey = renderedRouteKey;
  parseHash();
  const routeKey = currentRouteKey();
  const routeChanged = routeKey !== previousRouteKey;
  renderNav();

  if (state.section === "home") {
    renderHome();
    markRouteRendered(routeKey, routeChanged);
    syncCustomScrollbarsSoon();
    return;
  }

  const config = getSectionConfig();

  if (!LOADED_SECTIONS.has(config.id)) {
    renderLoading(`Загружаю раздел «${config.title}»…`);
    try {
      await loadSectionData(config.id);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось загрузить данные раздела.");
      markRouteRendered(routeKey, routeChanged);
      return;
    }
    if (sequence !== renderSequence) return;
  }

  if (!state.entryId && config.groups && (!state.subsection || hasChildGroups(config, state.subsection))) {
    renderGroupSelector(config, state.subsection || "");
    markRouteRendered(routeKey, routeChanged);
    return;
  }

  if (state.section === "books" && state.entryId) {
    renderLoading("Открываю книгу…");
    try {
      const book = await getBookById(state.entryId);
      if (sequence !== renderSequence) return;
      if (!state.subsection) state.subsection = groupValue(book, config);
      renderBookDetail(book);
      markRouteRendered(routeKey, routeChanged);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось открыть книгу.");
      markRouteRendered(routeKey, routeChanged);
    }
    return;
  }

  if (state.section === "artifacts" && state.entryId) {
    renderLoading("Открываю сет артефактов…");
    try {
      const artifact = await getGenericDetail("artifacts", state.entryId);
      if (sequence !== renderSequence) return;
      renderArtifactDetail(artifact);
      markRouteRendered(routeKey, routeChanged);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось открыть сет артефактов.");
      markRouteRendered(routeKey, routeChanged);
    }
    return;
  }

  if (state.entryId) {
    renderLoading("Открываю запись…");
    try {
      const item = await getGenericDetail(config.id, state.entryId);
      if (sequence !== renderSequence) return;
      if (config.id === "items" && isEnemyDropEntry(item)) {
        renderEnemyDropsDetail(item, config);
      } else if (config.id === "stories") {
        renderStoryDetail(item, config);
      } else {
        renderGenericDetail(item, config);
      }
      markRouteRendered(routeKey, routeChanged);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось открыть запись.");
      markRouteRendered(routeKey, routeChanged);
    }
    return;
  }

  renderCatalog(config);
  markRouteRendered(routeKey, routeChanged);
}

async function init() {
  renderLoading();
  await render();
  scheduleBackgroundSectionPrefetch();
}

nav.addEventListener("click", handleNavClick);
app.addEventListener("click", handleAppClick);
app.addEventListener("keydown", handleAppKeydown);
app.addEventListener("input", handleAppInput);
app.addEventListener("change", handleAppChange);
app.addEventListener("mouseover", handleAppPrefetch);
app.addEventListener("focusin", handleAppPrefetch);
document.getElementById("open-menu")?.addEventListener("click", toggleMenu);
const drawerBackdrop = document.getElementById("drawer-backdrop");
drawerBackdrop?.addEventListener("click", closeMenu);
drawerBackdrop?.addEventListener("touchmove", event => event.preventDefault(), { passive: false });
window.addEventListener("hashchange", render);
window.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu();
});
