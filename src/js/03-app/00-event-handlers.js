// Обработчики событий интерфейса.

function preserveScrollRender(renderFn) {
  const y = primaryScrollY();
  const horizontalScrollPositions = new Map(
    Array.from(app.querySelectorAll("[data-scroll-preserve]")).map(element => [
      element.dataset.scrollPreserve || "reader-tabs",
      element.scrollLeft || 0,
    ])
  );

  renderFn();

  function restoreScrollPositions() {
    scrollPrimaryTo(y);
    app.querySelectorAll("[data-scroll-preserve]").forEach(element => {
      const key = element.dataset.scrollPreserve || "reader-tabs";
      if (horizontalScrollPositions.has(key)) {
        element.scrollLeft = horizontalScrollPositions.get(key) || 0;
      }
    });
    syncReaderSectionScrollbars();
  }

  restoreScrollPositions();
  requestAnimationFrame(() => {
    restoreScrollPositions();
    syncCustomScrollbarsSoon();
  });
}

function currentCatalogConfig() {
  return getSectionConfig();
}

function currentFilterState() {
  return state.filters[currentCatalogConfig().id];
}

const debouncedCatalogUpdate = debounce(() => updateCatalogTable(currentCatalogConfig()));

function renderActiveDetail() {
  if (!activeDetail) {
    render();
    return;
  }

  const config = getSectionConfig(activeDetail.configId || state.section);
  if (activeDetail.type === "book") renderBookDetail(activeDetail.data);
  if (activeDetail.type === "artifact") renderArtifactDetail(activeDetail.data);
  if (activeDetail.type === "enemyDrops") renderEnemyDropsDetail(activeDetail.data, config);
  if (activeDetail.type === "story") renderStoryDetail(activeDetail.data, config);
  if (activeDetail.type === "generic") renderGenericDetail(activeDetail.data, config);
}

function rerenderActiveDetailPreservingScroll() {
  preserveScrollRender(renderActiveDetail);
}

function handleNavClick(event) {
  const toggle = event.target.closest("[data-menu-toggle]");
  if (toggle) {
    const sectionId = toggle.dataset.menuToggle;
    if (expandedMenuSections.has(sectionId)) expandedMenuSections.delete(sectionId);
    else expandedMenuSections.add(sectionId);
    renderNav();
    return;
  }

  const child = event.target.closest("[data-menu-action='child']");
  if (child) {
    const sectionId = child.dataset.menuSection;
    const key = child.dataset.menuKey;


    if (sectionId === "items") {
      setRoute("items", null, key);
      return;
    }

    if (sectionId === "stories") {
      setRoute("stories", null, key);
      return;
    }
  }

  const button = event.target.closest("[data-section]");
  if (!button) return;
  setRoute(button.dataset.section);
}

function handleAppClick(event) {
  const enemyToggle = event.target.closest(".enemy-description-toggle");
  if (enemyToggle) {
    const panel = enemyToggle.closest(".enemy-description-panel");
    if (!panel) return;
    const isCollapsed = panel.classList.toggle("is-collapsed");
    rememberEnemyDescriptionState(panel, !isCollapsed);
    enemyToggle.setAttribute("aria-expanded", String(!isCollapsed));
    enemyToggle.textContent = isCollapsed ? "Показать полностью" : "Свернуть";
    return;
  }

  if (event.target.closest("#back-groups")) {
    const target = catalogBackTarget(currentCatalogConfig(), state.subsection);
    setRoute(target.section, null, target.subsection);
    return;
  }

  if (event.target.closest("#back-books")) {
    setRoute("books");
    return;
  }

  if (event.target.closest("#back-artifacts")) {
    setRoute("artifacts", null, state.subsection);
    return;
  }

  if (event.target.closest("#back-section")) {
    const config = activeDetail ? getSectionConfig(activeDetail.configId || state.section) : currentCatalogConfig();
    setRoute(config.id, null, state.subsection);
    return;
  }

  const groupCard = event.target.closest("[data-group]");
  if (groupCard) {
    setRoute(currentCatalogConfig().id, null, groupCard.dataset.group);
    return;
  }


  const pageButton = event.target.closest("[data-catalog-page]");
  if (pageButton) {
    const page = Number(pageButton.dataset.catalogPage);
    if (Number.isFinite(page)) {
      currentFilterState().page = page;
      updateCatalogTable(currentCatalogConfig());
    }
    return;
  }

  if (event.target.closest("#clear-search")) {
    const filterState = currentFilterState();
    const search = document.getElementById("catalog-search");
    const clearSearch = document.getElementById("clear-search");
    filterState.query = "";
    filterState.page = 1;
    if (search) {
      search.value = "";
      search.focus();
    }
    clearSearch?.classList.remove("visible");
    updateCatalogTable(currentCatalogConfig());
    return;
  }

  if (event.target.closest("#reset-filters")) {
    const config = currentCatalogConfig();
    resetCatalogFilters(config);
    renderCatalog(config);
    requestAnimationFrame(() => syncCustomScrollbarsSoon());
    return;
  }

  if (event.target.closest("#toggle-read-all") && activeDetail?.type === "book") {
    state.readAll = !state.readAll;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  if (event.target.closest("#toggle-artifact-read-all") && activeDetail?.type === "artifact") {
    state.artifactReadAll = !state.artifactReadAll;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  if (event.target.closest("#toggle-story-read-all") && activeDetail?.type === "story") {
    state.storyReadAll = !state.storyReadAll;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const storyContentButton = event.target.closest("[data-story-content]");
  if (storyContentButton && activeDetail?.type === "story") {
    state.storyContentType = storyContentButton.dataset.storyContent || "stories";
    state.storyPart = 1;
    state.storyReadAll = false;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const storyPartButton = event.target.closest("[data-story-part]");
  if (storyPartButton && activeDetail?.type === "story") {
    state.storyPart = Number(storyPartButton.dataset.storyPart) || 1;
    state.storyReadAll = false;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const volumeButton = event.target.closest("[data-volume]");
  if (volumeButton && activeDetail?.type === "book") {
    state.volume = Number(volumeButton.dataset.volume);
    state.readAll = false;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const artifactPartButton = event.target.closest("[data-artifact-part]");
  if (artifactPartButton && activeDetail?.type === "artifact") {
    state.artifactPart = artifactPartButton.dataset.artifactPart;
    state.artifactReadAll = false;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const langButton = event.target.closest("[data-lang]");
  if (langButton && activeDetail) {
    state.lang = langButton.dataset.lang;
    rerenderActiveDetailPreservingScroll();
    return;
  }

  const row = event.target.closest("[data-entry-id]");
  if (row && !event.target.closest("button, a, input, select, label")) {
    const sectionId = row.dataset.sectionId || currentCatalogConfig().id;
    setRoute(sectionId, row.dataset.entryId, state.subsection);
  }
}

function handleAppKeydown(event) {
  const row = event.target.closest("[data-entry-id]");
  if (!row || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  const sectionId = row.dataset.sectionId || currentCatalogConfig().id;
  setRoute(sectionId, row.dataset.entryId, state.subsection);
}


function syncCatalogResetButton(config = currentCatalogConfig()) {
  const resetButton = document.getElementById("reset-filters");
  if (resetButton) resetButton.disabled = !hasActiveCatalogFilters(config);
}

function handleAppInput(event) {
  if (!event.target.matches("#catalog-search")) return;
  const filterState = currentFilterState();
  filterState.query = event.target.value;
  filterState.page = 1;
  document.getElementById("clear-search")?.classList.toggle("visible", Boolean(filterState.query));
  ensureStorySearchIndexForQuery(currentCatalogConfig(), filterState.query);
  debouncedCatalogUpdate();
}

function handleAppChange(event) {
  const config = currentCatalogConfig();
  const filterState = state.filters[config.id];

  if (event.target.matches("#catalog-filter")) {
    filterState.filter = event.target.value;
    filterState.page = 1;
    syncCatalogResetButton(config);
    updateCatalogTable(config);
    return;
  }

  if (event.target.matches("#catalog-page-size")) {
    filterState.pageSize = Number(event.target.value) || DEFAULT_CATALOG_PAGE_SIZE;
    filterState.page = 1;
    updateCatalogTable(config);
    return;
  }

  if (event.target.matches(".type-filter-chip input")) {
    const options = typeFiltersForCurrentCatalog(config);
    const defaultValues = options.map(typeFilterOptionValue);
    event.target.closest(".type-filter-chip")?.classList.toggle("is-active", event.target.checked);

    const itemInputs = Array.from(app.querySelectorAll('.type-filter-chip input'));
    const checked = itemInputs
      .filter(input => input.checked)
      .map(input => input.value)
      .filter(value => defaultValues.includes(value));


    filterState.page = 1;
    if (config.id === "items" || config.id === "stories") {
      if (!filterState.typeFiltersByGroup) filterState.typeFiltersByGroup = {};
      filterState.typeFiltersByGroup[state.subsection] = checked;
    } else {
      filterState.typeFilters = checked;
    }
    syncCatalogResetButton(config);
    updateCatalogTable(config);
  }
}
