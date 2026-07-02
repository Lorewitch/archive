// Фильтрация, сортировка, пагинация и каталог.

function optionsFor(config) {
  if (config.filter === "region") return REGION_FILTERS;
  if (config.fixedOptions) return config.fixedOptions;
  return [];
}

function itemMatchesFilter(item, config, selected, activeTypeSet = null) {
  let matchesMainFilter = true;

  if (selected !== "all") {
    if (config.filter === "region") {
      const regions = Array.isArray(item.filter_regions)
        ? item.filter_regions
        : String(item.region || "").split(",").map(region => region.trim()).filter(Boolean);
      matchesMainFilter = regions.includes(selected);
    } else {
      const value = item[config.filter] || item.type || item.item_type || item.weapon_type || item.category_type;
      matchesMainFilter = value === selected;
    }
  }

  if (!matchesMainFilter) return false;

  if (activeTypeSet) {
    if (!activeTypeSet.size) return true;

    if (config.id === "weapons") {
      const selectedRarities = ["5", "4", "3", "2", "1"].filter(value => activeTypeSet.has(`rarity:${value}`));
      const selectedWeaponTypes = WEAPON_TYPE_FILTERS
        .map(option => option.value)
        .filter(value => activeTypeSet.has(value));
      const rarity = `rarity:${String(item?.rarity || "").trim()}`;
      const weaponType = `weapon:${String(item?.weapon_type || item?.type || "").trim()}`;
      const rarityOk = !selectedRarities.length || activeTypeSet.has(rarity);
      const weaponOk = !selectedWeaponTypes.length || activeTypeSet.has(weaponType);
      return rarityOk && weaponOk;
    }
    if (isCommonEnemyCatalog(config)) {
      return Array.from(itemCommonEnemyTypes(item)).some(type => activeTypeSet.has(type));
    }
    if (isCharacterStoriesCatalog(config)) {
      return storyCharacterMatchesTypeFilters(item, activeTypeSet);
    }
    return activeTypeSet.has(itemTypeFilterValue(item, config));
  }

  return true;
}

function fallbackSearchableText(item) {
  return [
    titleOf(item, "ru"),
    titleOf(item, "en"),
    titleOf(item, "zh"),
    item.region,
    item.game_version,
    item.release_version,
    item.type,
    item.subtype,
    item.book_type,
    item.item_group,
    item.item_type,
    item.item_type_title?.ru,
    item.item_type_title?.en,
    item.item_type_title?.zh,
    item.material_type,
    item.material_type_title?.ru,
    item.material_type_title?.en,
    item.material_type_title?.zh,
    item.weapon_type,
    item.category_type,
    item.rarity,
    item.source,
    item.related,
    ...(item.tags || []),
    ...(Array.isArray(item.materials) ? item.materials.flatMap(material => [
      material.key,
      materialTitle(material, "ru"),
      materialTitle(material, "en"),
      materialTitle(material, "zh")
    ]) : [])
  ].join(" ").toLocaleLowerCase("ru-RU");
}

function searchableText(item) {
  if (!item || typeof item !== "object") return "";
  if (SEARCH_TEXT_CACHE.has(item)) return SEARCH_TEXT_CACHE.get(item);

  const prepared = String(item.search_text || "").trim();
  const text = prepared ? prepared.toLocaleLowerCase("ru-RU") : fallbackSearchableText(item);
  SEARCH_TEXT_CACHE.set(item, text);
  return text;
}

function searchableTextForCatalog(item, config) {
  if (config.id === "stories" && STORY_SEARCH_TEXTS.has(item.id)) {
    return STORY_SEARCH_TEXTS.get(item.id) || searchableText(item);
  }
  return searchableText(item);
}

function gameVersionSortValue(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return -1;

  const parts = text.match(/\d+/g);
  if (!parts?.length) return -1;

  const major = Number(parts[0] || 0);
  const minor = Number(parts[1] || 0);
  const patch = Number(parts[2] || 0);

  return major * 1000000 + minor * 1000 + patch;
}

function compareByTitle(a, b) {
  return collator.compare(titleOf(a, "ru"), titleOf(b, "ru"));
}

function entrySortVersion(item) {
  const prepared = Number(item?.sort_version);
  return Number.isFinite(prepared) ? prepared : gameVersionSortValue(item?.game_version);
}

function compareByGameVersionDesc(a, b) {
  const versionResult = entrySortVersion(b) - entrySortVersion(a);
  return versionResult || compareByTitle(a, b);
}

function filteredEntries(config) {
  const filterState = state.filters[config.id];
  const query = filterState.query.trim().toLocaleLowerCase("ru-RU");
  const activeTypeSet = typeFiltersForCurrentCatalog(config).length
    ? new Set(activeTypeFilters(config))
    : null;

  const rows = collectionForCatalog(config).filter(item => {
    const queryOk = !query || searchableTextForCatalog(item, config).includes(query);
    const filterOk = itemMatchesFilter(item, config, filterState.filter, activeTypeSet);
    return queryOk && filterOk;
  });

  rows.sort((a, b) => {
    if (filterState.sort === "asc" || filterState.sort === "desc") {
      const result = compareByTitle(a, b);
      return filterState.sort === "asc" ? result : -result;
    }
    return compareByGameVersionDesc(a, b);
  });

  return rows;
}

function catalogLayoutClass(config) {
  if (config.id === "stories" && state.subsection === "character_stories") {
    return "cols-stories-character";
  }
  if (config.id === "items" && state.subsection === "common_enemies") {
    return "cols-items-common-enemy";
  }
  if (config.id === "items" && state.subsection === "development_materials") {
    return "cols-items-development";
  }
  if (config.id === "items" && itemGroupUsesTypeFilters(state.subsection)) {
    return "cols-items-typed";
  }
  if (config.id === "items" && isEnemyDropGroup(state.subsection)) {
    return "cols-items-enemy";
  }
  return `cols-${config.id}`;
}

function catalogRowClasses(config, modifiers = []) {
  return [
    "catalog-row",
    ...modifiers,
    catalogLayoutClass(config),
  ].filter(Boolean).join(" ");
}

function cssClassToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "none";
}

function catalogCardRarityClass(item, config) {
  const rarity = String(item?.rarity || "").trim();
  if (["5", "4", "3", "2", "1"].includes(rarity)) return `card-rarity-${rarity}`;
  return "card-neutral";
}

function catalogCardClasses(item, config) {
  return [
    "catalog-card",
    `catalog-card--${cssClassToken(config.id)}`,
    catalogCardRarityClass(item, config),
    isCharacterStoryEntry(item) ? "catalog-card--character-story" : "",
    isEnemyDropEntry(item) ? "catalog-card--enemy-drops" : "",
  ].filter(Boolean).join(" ");
}

function renderCatalogCardVersion(item) {
  const version = normalizedGameVersion(item?.game_version || item?.release_version);
  if (!version) return "";
  return `<span class="catalog-card-version" title="Версия игры ${escapeHtml(version)}" aria-label="Версия игры ${escapeHtml(version)}">v${escapeHtml(version)}</span>`;
}

function renderCatalogCardMedia(item) {
  const icon = iconFor(item);
  const iconClass = [
    "catalog-card-img",
    entryRarityBackgroundClass(item),
    isCharacterStoryEntry(item) ? "is-person" : "",
  ].filter(Boolean).join(" ");

  if (!icon) {
    return `<span class="catalog-card-media"><span class="catalog-card-placeholder" aria-hidden="true">⌁</span></span>`;
  }

  return `
    <span class="catalog-card-media">
      <img class="${escapeHtml(iconClass)}" src="${escapeHtml(versionedAssetPath(icon))}" alt="" loading="lazy" decoding="async" width="96" height="96">
    </span>
  `;
}

const CATALOG_CARD_FIELD_RULES = {
  default: {
    hidden: ["редкость", "регион", "тип противника", "тип материала"],
    labels: [],
    chipColumns: ["материалы", "выпадает с", "элемент", "категория"],
  },
  books: {
    hidden: ["регион"],
    labels: ["частей"],
    chipColumns: [],
  },
  artifacts: {
    hidden: ["регион", "частей"],
    labels: [],
  },
};

function catalogCardFieldRules(config) {
  const specific = CATALOG_CARD_FIELD_RULES[config?.id] || {};
  const base = CATALOG_CARD_FIELD_RULES.default;
  return {
    hidden: new Set([...(base.hidden || []), ...(specific.hidden || [])]),
    labels: new Set([...(base.labels || []), ...(specific.labels || [])]),
    chipColumns: new Set([...(base.chipColumns || []), ...(specific.chipColumns || [])]),
  };
}

function catalogCardFieldDefinition(column, config) {
  const normalized = normalizeCatalogCardMetaColumn(column);
  const rules = catalogCardFieldRules(config);
  return {
    key: normalized,
    hidden: rules.hidden.has(normalized) || (normalized === "частей" && config?.id !== "books"),
    keepLabel: rules.labels.has(normalized),
    chipLike: rules.chipColumns.has(normalized),
  };
}

function catalogCellHasContent(cell) {
  const html = String(cell || "").trim();
  if (!html) return false;
  const plain = html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;|&ndash;/g, "—")
    .trim();
  if (plain && plain !== "—") return true;
  return /<(img|span|div)[\s>]/i.test(html);
}

function normalizeCatalogCardMetaColumn(column) {
  return String(column || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function catalogCardMetaColumnIsHidden(column, config) {
  return catalogCardFieldDefinition(column, config).hidden;
}

function catalogCardMetaColumnKeepsLabel(column, config) {
  return catalogCardFieldDefinition(column, config).keepLabel;
}

function renderCatalogCardMeta(item, config) {
  const columns = typeof config.columns === "function" ? config.columns() : config.columns;
  const cells = config.row(item);

  return columns.slice(1).map((column, index) => {
    if (catalogCardMetaColumnIsHidden(column, config)) return "";
    const cell = cells[index + 1] || "";
    if (!catalogCellHasContent(cell)) return "";
    const keepLabel = catalogCardMetaColumnKeepsLabel(column, config);
    const field = catalogCardFieldDefinition(column, config);
    const chipListClass = field.chipLike || /class="(?:material-list|catalog-material-plain-list|dropped-by-catalog-list|common-enemy-type-list|story-element-list)"/.test(cell) ? "has-chip-list" : "";
    return `
      <span class="catalog-card-meta-item ${keepLabel ? "has-label" : "is-value-only"} ${chipListClass}">
        ${keepLabel ? `<span class="catalog-card-meta-label">${escapeHtml(column)}</span>` : ""}
        <span class="catalog-card-meta-value">${cell}</span>
      </span>
    `;
  }).filter(Boolean).join("");
}

function renderCatalogCard(item, config) {
  const subtitle = [titleOf(item, "en"), titleOf(item, "zh")].filter(Boolean).join(" · ");
  const meta = renderCatalogCardMeta(item, config);

  return `
    <div class="${escapeHtml(catalogCardClasses(item, config))}" data-entry-id="${escapeHtml(item.id)}" data-section-id="${escapeHtml(config.id)}" tabindex="0" role="button" aria-label="Открыть ${escapeHtml(titleOf(item))}">
      ${renderCatalogCardVersion(item)}
      <span class="catalog-card-rarity-line" aria-hidden="true"></span>
      <span class="catalog-card-open" aria-hidden="true">›</span>
      ${renderCatalogCardMedia(item)}
      <span class="catalog-card-body">
        <span class="catalog-card-title-block">
          <span class="catalog-card-title">${escapeHtml(titleOf(item, "ru"))}</span>
          ${subtitle ? `<span class="catalog-card-subtitle">${escapeHtml(subtitle)}</span>` : ""}
        </span>
        ${meta ? `<span class="catalog-card-meta">${meta}</span>` : ""}
      </span>
    </div>
  `;
}

function groupEntryCount(config, groupKey) {
  const children = childGroupsFor(config, groupKey);
  if (children.length) {
    const childKeys = new Set(children.map(([key]) => key));
    return config.data().filter(item => childKeys.has(groupValue(item, config))).length;
  }
  return config.data().filter(item => groupValue(item, config) === groupKey).length;
}

function renderGroupSelector(config, parentKey = "") {
  activeDetail = null;
  const groups = groupsForSelector(config, parentKey);
  app.innerHTML = `
    <section class="page-card catalog-page${state.subsection ? " is-subsection" : ""}">
      <div class="group-grid">
        ${groups.map(([key, label, description]) => {
          const count = groupEntryCount(config, key);
          return `
            <button class="group-card" type="button" data-group="${escapeHtml(key)}">
              <span class="group-card-title">${escapeHtml(label)}</span>
              <span class="group-card-meta">${escapeHtml(description || "")}</span>
              <span class="tiny-pill">${count} записей</span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function catalogPageSize(config) {
  const value = Number(state.filters[config.id]?.pageSize);
  return [10, 25, 50].includes(value) ? value : DEFAULT_CATALOG_PAGE_SIZE;
}

function renderPaginationControls(config, currentPage, totalPages, totalRows) {
  const pageSize = catalogPageSize(config);
  const pages = [];

  if (totalPages > 1) {
    for (let page = 1; page <= totalPages; page += 1) {
      if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1) {
        pages.push(page);
      } else if (pages[pages.length - 1] !== "…") {
        pages.push("…");
      }
    }
  }

  return `
    <nav class="pagination" aria-label="Страницы каталога">
      <div class="pagination-pages">
        ${totalPages > 1 ? `
          <button type="button" data-catalog-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>‹</button>
          ${pages.map(page => page === "…"
            ? `<span class="pagination-gap">…</span>`
            : `<button type="button" data-catalog-page="${page}" class="${page === currentPage ? "active" : ""}" aria-current="${page === currentPage ? "page" : "false"}">${page}</button>`
          ).join("")}
          <button type="button" data-catalog-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>›</button>
        ` : ""}
      </div>
      <label class="pagination-size">
        <span>На странице</span>
        <select id="catalog-page-size" aria-label="Количество записей на странице">
          ${[10, 25, 50].map(size => `<option value="${size}" ${size === pageSize ? "selected" : ""}>${size}</option>`).join("")}
        </select>
      </label>
      <span class="pagination-count">${totalRows} записей</span>
    </nav>
  `;
}

function renderCatalogTable(config) {
  const allRows = filteredEntries(config);
  const filterState = state.filters[config.id];
  const pageSize = catalogPageSize(config);
  const totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(filterState.page) || 1), totalPages);
  filterState.page = currentPage;
  const rows = allRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return `
    <div class="catalog-card-grid ${escapeHtml(catalogLayoutClass(config))}" id="catalog-table">
      ${rows.map(item => renderCatalogCard(item, config)).join("") || `<div class="empty"><div class="empty-card">${escapeHtml(config.empty)}</div></div>`}
    </div>
    ${renderPaginationControls(config, currentPage, totalPages, allRows.length)}
  `;
}



function hasActiveCatalogFilters(config = currentCatalogConfig()) {
  const filterState = state.filters[config.id];
  return Boolean(
    filterState.filter !== "all" ||
    activeTypeFilters(config).length
  );
}

function catalogHasFilterControls(config = currentCatalogConfig()) {
  return Boolean(typeFiltersForCurrentCatalog(config).length);
}

function resetCatalogFilters(config = currentCatalogConfig()) {
  const filterState = state.filters[config.id];
  filterState.filter = "all";
  filterState.page = 1;
  if (config.id === "items" || config.id === "stories") {
    if (!filterState.typeFiltersByGroup) filterState.typeFiltersByGroup = {};
    filterState.typeFiltersByGroup[state.subsection] = [];
  } else {
    filterState.typeFilters = [];
  }
}

function renderCatalogFilterReset(config = currentCatalogConfig()) {
  if (!catalogHasFilterControls(config)) return "";
  const disabled = hasActiveCatalogFilters(config) ? "" : " disabled";
  return `<button class="filter-reset-button" id="reset-filters" type="button" title="Сбросить фильтры" aria-label="Сбросить фильтры"${disabled}><span aria-hidden="true">&#128465;</span></button>`;
}



function renderCatalog(config) {
  activeDetail = null;
  const filterState = state.filters[config.id];
  ensureStorySearchIndexForQuery(config, filterState.query);
  const options = optionsFor(config);
  const allowedFilters = new Set(["all", ...options.map(([value]) => value)]);
  if (!allowedFilters.has(filterState.filter)) {
    filterState.filter = "all";
  }
  const isNestedStoryGroup = config.id === "stories" && Boolean(parentGroupFor(config, state.subsection));
  app.innerHTML = `
    <section class="page-card catalog-page${state.subsection ? " is-subsection" : ""}${isNestedStoryGroup ? " has-parent-group" : ""}">
      <div class="catalog-sticky-head">
        <div class="toolbar">
          <div class="catalog-search-bar">
            <label class="search" aria-label="Поиск">
              <span class="search-symbol">⌕</span>
              <input id="catalog-search" type="text" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Начни вводить текст…" value="${escapeHtml(filterState.query)}">
              <button class="search-clear ${filterState.query ? "visible" : ""}" id="clear-search" type="button" aria-label="Очистить поиск">×</button>
            </label>
            ${options.length ? `
              <select class="select" id="catalog-filter" aria-label="Фильтр">
                <option value="all">${escapeHtml(catalogFilterLabel(config))}</option>
                ${options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${filterState.filter === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
              </select>
            ` : ""}
          </div>

          ${(() => {
            const typeFilters = renderTypeFilters(config);
            const resetFilter = renderCatalogFilterReset(config);
            if (!typeFilters && !resetFilter) return "";
            return `
              <div class="toolbar-filters">
                ${resetFilter}
                ${typeFilters ? `
                  <div class="toolbar-filter-track reader-tabs-row">
                    <div class="toolbar-filter-scroll reader-section-scroll" data-scroll-preserve="catalog-filters">
                      ${typeFilters}
                    </div>
                    <div class="reader-section-scrollbar toolbar-filter-scrollbar" data-scrollbar-for="catalog-filters" aria-hidden="true">
                      <span class="reader-section-scrollbar-thumb"></span>
                    </div>
                  </div>
                ` : ""}
              </div>
            `;
          })()}
        </div>
      </div>

      <div id="catalog-holder">${renderCatalogTable(config)}</div>
    </section>
  `;
}

function updateCatalogTable(config = getSectionConfig()) {
  const holder = document.getElementById("catalog-holder");
  if (!holder) return;
  holder.innerHTML = renderCatalogTable(config);
  requestAnimationFrame(() => { resetHorizontalScroll(); syncCustomScrollbarsSoon(); });
}
