// Основной контроллер рендера, ленивые загрузки и запуск приложения.

function renderHome() {
  activeDetail = null;
  app.innerHTML = `
    <section class="page-card home-page">
      <article class="home-intro" aria-label="Об Архиве">
        <p>Архив Лороведьмы — это тихое собрание игровых текстов. Не википедия, не справочник с числовыми обозначениями и не таблица характеристик, а место, где можно спокойно читать книги, записки, описания предметов, оружия и артефактов.</p>
        <p>Здесь собраны тексты Тейвата в удобной форме: без лишнего шума, без пересказов и без попытки заменить сам источник. Только строки, которые уже есть в игре, аккуратно разложенные по полкам.</p>
        <p>Этот архив создан Лороведьмой для лороведов — для тех, кто любит возвращаться к деталям, сверять формулировки, искать связи и просто читать мир внимательнее.</p>
      </article>
      <section class="pwa-controls" aria-labelledby="pwa-about-title">
        <h2 id="pwa-about-title">Архив как приложение</h2>
        <p>Добавь Архив на компьютер или телефон, чтобы открывать его по собственной иконке. Нужные материалы можно читать без интернета — сначала открой их с подключением к сети.</p>
        <div class="pwa-actions">
          <button class="pwa-button" id="pwa-install" type="button" hidden>Как установить Архив</button>
          <button class="pwa-button" id="pwa-update" type="button" hidden>Обновить Архив</button>
        </div>
        <p class="pwa-hint" id="pwa-offline-hint" hidden></p>
        <p class="pwa-network-status" id="pwa-network-status" role="status" aria-live="polite" hidden></p>
      </section>
    </section>
  `;
  connectPwaControls();
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
      <div class="empty"><div class="empty-card archive-load-error"><p>${escapeHtml(message)}</p><button class="error-retry" type="button" data-retry-load>Повторить загрузку</button></div></div>
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

  if (!state.entryId && config.groups && !state.subsection) {
    try {
      await loadArchiveSummary();
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось загрузить категории.");
      markRouteRendered(routeKey, routeChanged);
      return;
    }
    if (sequence !== renderSequence) return;
    renderGroupSelector(config);
    markRouteRendered(routeKey, routeChanged);
    return;
  }

  if (!state.entryId) {
    renderLoading(`Загружаю раздел «${config.title}»…`);
    try {
      await loadCatalogData(config, state.subsection);
    } catch (error) {
      if (sequence !== renderSequence) return;
      renderError(error.message || "Не удалось загрузить данные раздела.");
      markRouteRendered(routeKey, routeChanged);
      return;
    }
    if (sequence !== renderSequence) return;
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
      if (config.id === "stories") {
        await loadStoryReaderChunk(item);
        if (sequence !== renderSequence) return;
      }
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

  if (config.id === "stories" && state.subsection === "archon_quests" && !state.collection) {
    renderArchonCollections(config);
  } else {
    renderCatalog(config);
  }
  markRouteRendered(routeKey, routeChanged);
}

async function init() {
  renderLoading();
  await render();
}

nav.addEventListener("click", handleNavClick);
app.addEventListener("click", handleAppClick);
app.addEventListener("toggle", event => {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !details.dataset.worldSeries) return;
  if (details.open) expandedWorldSeries.add(details.dataset.worldSeries);
  else expandedWorldSeries.delete(details.dataset.worldSeries);
}, true);
app.addEventListener("keydown", handleAppKeydown);
app.addEventListener("input", handleAppInput);
app.addEventListener("change", handleAppChange);
document.getElementById("open-menu")?.addEventListener("click", toggleMenu);
window.addEventListener("hashchange", render);
window.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu();
  if (event.key !== "Tab" || !document.body.classList.contains("menu-open")) return;
  const buttons = [document.getElementById("open-menu"), ...sidebar.querySelectorAll("button")]
    .filter(button => button.getClientRects().length && !button.disabled);
  const first = buttons[0], last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first?.focus();
  }
});
