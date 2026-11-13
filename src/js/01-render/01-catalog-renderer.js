// Фильтрация, сортировка, пагинация и каталог.

function optionsFor(config) {
  // В сборках Архонтов регион уже выбран; второй селектор избыточен.
  if (config.id === "stories" && state.subsection === "archon_quests") return [];
  if (config.filter === "region") return REGION_FILTERS;
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
      const selectedKinds = WEAPON_KIND_FILTERS
        .map(option => option.value)
        .filter(value => activeTypeSet.has(value));
      const rarity = `rarity:${String(item?.rarity || "").trim()}`;
      const weaponType = `weapon:${String(item?.weapon_type || item?.type || "").trim()}`;
      const kind = `kind:${String(item?.entry_kind || "weapon").trim()}`;
      const rarityOk = !selectedRarities.length || activeTypeSet.has(rarity);
      const weaponOk = !selectedWeaponTypes.length || activeTypeSet.has(weaponType);
      const kindOk = !selectedKinds.length || activeTypeSet.has(kind);
      return rarityOk && weaponOk && kindOk;
    }
    if (isCommonEnemyCatalog(config)) {
      return Array.from(itemCommonEnemyTypes(item)).some(type => activeTypeSet.has(type));
    }
    if (isCharacterStoriesCatalog(config)) {
      return storyCharacterMatchesTypeFilters(item, activeTypeSet);
    }
    if (config.id === "stories" && state.subsection === "world_quests") {
      if (!activeTypeSet.has("witch:any")) return true;
      return (item.quest_collections || []).some(value =>
        value === "witch_homework" || value === "witch_revelation");
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
  const filterState = catalogFilterState(config);
  const query = filterState.query.trim().toLocaleLowerCase("ru-RU");
  const activeTypeSet = typeFiltersForCurrentCatalog(config).length
    ? new Set(activeTypeFilters(config))
    : null;

  const rows = collectionForCatalog(config).filter(item => {
    if (config.id === "stories" && state.subsection === "archon_quests" && state.collection && archonCollectionFor(item) !== state.collection) return false;
    const queryOk = !query || searchableText(item).includes(query);
    const filterOk = itemMatchesFilter(item, config, filterState.filter, activeTypeSet);
    return queryOk && filterOk;
  });

  rows.sort((a, b) => {
    if (config.id === "stories" && state.subsection === "archon_quests" && state.collection) {
      return entrySortVersion(a) - entrySortVersion(b)
        || archonChapterOrder(a) - archonChapterOrder(b)
        || compareByTitle(a, b);
    }
    return compareByGameVersionDesc(a, b);
  });

  return rows;
}

function cssClassToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "none";
}

function catalogCardRarityClass(item) {
  const rarity = String(item?.rarity || "").trim();
  if (["5", "4", "3", "2", "1"].includes(rarity)) return `card-rarity-${rarity}`;
  return "card-neutral";
}

function catalogCardClasses(item, config) {
  return [
    "catalog-card",
    `catalog-card--${cssClassToken(config.id)}`,
    catalogCardRarityClass(item),
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
  const rarityClass = entryRarityBackgroundClass(item);
  const mediaClass = ["catalog-card-media", rarityClass].filter(Boolean).join(" ");
  const iconClass = [
    "catalog-card-img",
    isCharacterStoryEntry(item) ? "is-person" : "",
  ].filter(Boolean).join(" ");

  if (!icon) {
    return `<span class="${escapeHtml(mediaClass)}"><span class="catalog-card-placeholder" aria-hidden="true">⌁</span></span>`;
  }

  return `
    <span class="${escapeHtml(mediaClass)}">
      <img class="${escapeHtml(iconClass)}" src="${escapeHtml(versionedAssetPath(icon))}" alt="" loading="lazy" decoding="async" width="96" height="96">
    </span>
  `;
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

function renderCatalogCardMeta(item, config) {
  if (config.id === "stories" && item.story_group === "archon_quests") {
    const chapter = String(item.chapter_num?.ru || "").trim();
    const collection = archonCollectionDefinition(archonCollectionFor(item));
    const region = String(item.region || "").trim();
    const physicalRegion = region && collection?.title !== region
      ? `<span class="catalog-card-archon-region">Место действия: ${escapeHtml(region)}</span>` : "";
    return `<span class="catalog-card-chapter">${escapeHtml(chapter)}</span>${physicalRegion}`;
  }
  return (config.meta?.(item) || []).map(field => {
    if (!catalogCellHasContent(field.value)) return "";
    return `
      <span class="catalog-card-meta-item ${field.showLabel ? "has-label" : "is-value-only"} ${field.chips ? "has-chip-list" : ""}">
        ${field.showLabel ? `<span class="catalog-card-meta-label">${escapeHtml(field.label)}</span>` : ""}
        <span class="catalog-card-meta-value">${field.value}</span>
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

function recordCountText(value) {
  const count = Number(value) || 0;
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "записей"
    : last === 1 ? "запись" : last >= 2 && last <= 4 ? "записи" : "записей";
  return `${count} ${noun}`;
}

function groupEntryCount(config, groupKey) {
  return ARCHIVE_SUMMARY?.groups?.[config.id]?.[groupKey] ?? 0;
}

function renderGroupSelector(config) {
  activeDetail = null;
  const groups = config.groups || [];
  app.innerHTML = `
    <section class="page-card catalog-page${state.subsection ? " is-subsection" : ""}">
      <div class="group-grid">
        ${groups.map(([key, label, description]) => {
          const count = groupEntryCount(config, key);
          return `
            <button class="group-card" type="button" data-group="${escapeHtml(key)}">
              <span class="group-card-title">${escapeHtml(label)}</span>
              <span class="group-card-meta">${escapeHtml(description || "")}</span>
              <span class="tiny-pill">${recordCountText(count)}</span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderArchonCollections(config) {
  activeDetail = null;
  const all = config.data().filter(item => item.story_group === "archon_quests");
  const cards = ARCHON_COLLECTIONS.map(collection => {
    const entries = all.filter(item => archonCollectionFor(item) === collection.id);
    if (!entries.length) return "";
    const versions = entries.map(item => item.game_version).filter(Boolean);
    const range = [...new Set(versions)].sort((a, b) => gameVersionSortValue(a) - gameVersionSortValue(b));
    const versionLabel = range.length ? `Версии ${range[0]}${range.length > 1 ? `–${range[range.length - 1]}` : ""}` : "";
    const chapterNoun = entries.length % 10 === 1 && entries.length % 100 !== 11 ? "глава"
      : [2, 3, 4].includes(entries.length % 10) && ![12, 13, 14].includes(entries.length % 100) ? "главы" : "глав";
    return `
      <button class="archon-collection-card" type="button" data-archon-collection="${escapeHtml(collection.id)}">
        <span class="archon-collection-chapter">${escapeHtml(collection.chapter)}</span>
        <span class="archon-collection-title">${escapeHtml(collection.title)}</span>
        <span class="archon-collection-description">${escapeHtml(collection.description)}</span>
        <span class="archon-collection-footer"><span>${entries.length} ${chapterNoun}</span><span>${escapeHtml(versionLabel)}</span></span>
      </button>
    `;
  }).filter(Boolean).join("");

  app.innerHTML = `
    <section class="page-card archon-collections-page">
      <div class="archon-collections-intro">
        <button type="button" class="archon-collections-back" data-story-categories>← Все истории</button>
        <h1>Задания Архонтов</h1>
        <p>Главы собраны по разделам игрового журнала. История Близнецов вынесена отдельно. Промежуточные главы входят в соответствующие региональные сборки, сохраняя своё название и номер.</p>
      </div>
      <div class="archon-collections-grid">${cards}</div>
    </section>
  `;
}

function renderArchonCollectionHeader() {
  if (state.section !== "stories" || state.subsection !== "archon_quests" || !state.collection) return "";
  const album = archonCollectionDefinition(state.collection);
  if (!album) return "";
  return `
    <div class="archon-collection-head">
      <button class="archon-collections-back" type="button" data-group="archon_quests">← Все сборки</button>
      <span class="archon-collection-chapter">${escapeHtml(album.chapter)}</span>
      <h1>${escapeHtml(album.title)}</h1>
      <p>${escapeHtml(album.description)}</p>
    </div>`;
}

function catalogPageSize(config) {
  const value = Number(catalogFilterState(config)?.pageSize);
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
          <button type="button" aria-label="Предыдущая страница" data-catalog-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>‹</button>
          ${pages.map(page => page === "…"
            ? `<span class="pagination-gap">…</span>`
            : `<button type="button" data-catalog-page="${page}" class="${page === currentPage ? "active" : ""}" aria-current="${page === currentPage ? "page" : "false"}">${page}</button>`
          ).join("")}
          <button type="button" aria-label="Следующая страница" data-catalog-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>›</button>
        ` : ""}
      </div>
      <label class="pagination-size">
        <span>На странице</span>
        <select id="catalog-page-size" aria-label="Количество записей на странице">
          ${[10, 25, 50].map(size => `<option value="${size}" ${size === pageSize ? "selected" : ""}>${size}</option>`).join("")}
        </select>
      </label>
      <span class="pagination-count">${recordCountText(totalRows)}</span>
    </nav>
  `;
}

// Group only quests whose shared series is explicitly recorded in their source.
// No directories, extra route, or inferred grouping from prerequisite links.
function worldQuestSeriesKey(item) {
  if (item?.story_group !== "world_quests") return "";
  return String(item?.quest_series?.[0] || "").trim();
}

function worldQuestSeriesOrder(a, b) {
  const aLinks = Array.isArray(a.quest_chain) ? a.quest_chain : [];
  const bLinks = Array.isArray(b.quest_chain) ? b.quest_chain : [];
  const aOrder = aLinks.indexOf(a.id);
  const bOrder = aLinks.indexOf(b.id);
  if (aOrder >= 0 && bOrder >= 0) return aOrder - bOrder;
  const bOrderFromB = bLinks.indexOf(b.id);
  const aOrderFromB = bLinks.indexOf(a.id);
  if (aOrderFromB >= 0 && bOrderFromB >= 0) return aOrderFromB - bOrderFromB;
  return entrySortVersion(a) - entrySortVersion(b) || compareByTitle(a, b);
}

function worldCatalogUnits(rows, config) {
  if (config.id !== "stories" || state.subsection !== "world_quests") {
    return rows.map(item => ({ kind: "entry", item }));
  }
  const groups = new Map();
  for (const item of rows) {
    const key = worldQuestSeriesKey(item);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const consumed = new Set();
  return rows.flatMap(item => {
    if (consumed.has(item.id)) return [];
    const key = worldQuestSeriesKey(item);
    const siblings = groups.get(key);
    if (!key || !siblings || siblings.length < 2) return [{ kind: "entry", item }];
    siblings.forEach(sibling => consumed.add(sibling.id));
    const entries = [...siblings].sort(worldQuestSeriesOrder);
    return [{ kind: "series", key, title: entries[0].quest_series_ru || key, entries }];
  });
}

function renderWorldSeriesCard(unit) {
  const open = expandedWorldSeries.has(unit.key) ? " open" : "";
  const versions = [...new Set(unit.entries.map(item => item.game_version).filter(Boolean))]
    .sort((a, b) => gameVersionSortValue(a) - gameVersionSortValue(b));
  const range = versions.length === 1 ? `v${versions[0]}`
    : versions.length ? `v${versions[0]}–${versions[versions.length - 1]}` : "";
  return `<details class="quest-series-card" data-world-series="${escapeHtml(unit.key)}"${open}>
    <summary class="quest-series-summary">
      <span class="quest-series-symbol" aria-hidden="true">▸</span>
      <span class="quest-series-heading"><strong>${escapeHtml(unit.title)}</strong>
        <small>Серия заданий мира · ${unit.entries.length} частей</small></span>
      ${range ? `<span class="quest-series-version">${escapeHtml(range)}</span>` : ""}
    </summary>
    <div class="quest-series-members">
    ${unit.entries.map((item, index) => `<button type="button" class="quest-series-member" data-series-entry-id="${escapeHtml(item.id)}">
      <span class="quest-series-index">${index + 1}</span>
      <span class="quest-series-member-title">${escapeHtml(titleOf(item, "ru"))}
      ${item.chapter_num?.ru ? `<small>${escapeHtml(item.chapter_num.ru)}</small>` : ""}
      ${item.quest_subject_ru ? `<small>${item.quest_subject_ru === "Вступительное задание" ? "Этап" : item.quest_collections?.includes("witch_homework") ? "Испытуемый" : item.quest_collections?.includes("witch_revelation") ? "Адресат" : "Персонаж"}: ${escapeHtml(item.quest_subject_ru)}</small>` : ""}
      </span>
      <span class="quest-series-member-version">${item.game_version ? `v${escapeHtml(item.game_version)}` : ""}</span>
    </button>`).join("")}
    </div>
  </details>`;
}

function renderCatalogTable(config) {
  const allRows = filteredEntries(config);
  const filterState = catalogFilterState(config);
  const units = worldCatalogUnits(allRows, config);
  const pageSize = catalogPageSize(config);
  const totalPages = Math.max(1, Math.ceil(units.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(filterState.page) || 1), totalPages);
  filterState.page = currentPage;
  const pageUnits = units.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return `
    <div class="catalog-card-grid" id="catalog-table">
      ${pageUnits.map(unit => unit.kind === "series"
        ? renderWorldSeriesCard(unit)
        : renderCatalogCard(unit.item, config)).join("") || `<div class="empty"><div class="empty-card">${escapeHtml(config.empty)}</div></div>`}
    </div>
    ${renderPaginationControls(config, currentPage, totalPages, allRows.length)}
  `;
}

function hasActiveCatalogFilters(config = currentCatalogConfig()) {
  const filterState = catalogFilterState(config);
  return Boolean(
    filterState.filter !== "all" ||
    activeTypeFilters(config).length
  );
}

function catalogHasFilterControls(config = currentCatalogConfig()) {
  return Boolean(typeFiltersForCurrentCatalog(config).length);
}

function resetCatalogFilters(config = currentCatalogConfig()) {
  const filterState = catalogFilterState(config);
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
  return `<button class="filter-reset-button" id="reset-filters" type="button" title="Сбросить фильтры" aria-label="Сбросить фильтры"${disabled}><span class="filter-reset-icon" aria-hidden="true">&#128465;&#xfe0e;</span></button>`;
}

function renderCatalog(config) {
  activeDetail = null;
  const filterState = catalogFilterState(config);
  const options = optionsFor(config);
  const allowedFilters = new Set(["all", ...options.map(([value]) => value)]);
  if (!allowedFilters.has(filterState.filter)) {
    filterState.filter = "all";
  }
  const isArchonCollection = config.id === "stories" && state.subsection === "archon_quests" && Boolean(state.collection);
  app.innerHTML = `
    <section class="page-card catalog-page${state.subsection ? " is-subsection" : ""}${isArchonCollection ? " is-archon-collection" : ""}">
      ${renderArchonCollectionHeader()}
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
                    <div class="toolbar-filter-scroll reader-section-scroll" data-scroll-preserve="catalog-filters" tabindex="0" role="region" aria-label="Дополнительные фильтры">
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
