// Общие рендереры карточек, заголовков, иконок и материалов.

function materialSetTitle(item, lang = "ru") {
  const materials = Array.isArray(item?.materials) ? item.materials : [];
  const titles = materials
    .map(material => materialTitle(material, lang))
    .filter(Boolean);
  return titles.join(" · ");
}

function titleOf(item, lang = "ru") {
  const directTitle = item?.title?.[lang] || item?.title_ru || item?.title?.ru || item?.title?.en || item?.title?.zh || item?.name;
  if (directTitle) return directTitle;

  if ((item?.item_group === "common_enemies" || item?.entry_type === "material_set") && Array.isArray(item?.materials) && item.materials.length) {
    return materialSetTitle(item, lang) || "Без названия";
  }

  return "Без названия";
}

function langLabel(lang) {
  return ({ ru: "RU", en: "EN", zh: "中文" })[lang] || String(lang).toUpperCase();
}

function labelFromOptions(value, options) {
  return options.find(([key]) => key === value)?.[1] || "";
}

function normalizedGameVersion(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return "";

  const lower = text.toLowerCase();
  if (["unknown", "неизвестно", "none", "null", "-", "—"].includes(lower)) return "";

  const version = text.match(/\d+(?:\.\d+){0,2}/)?.[0] || "";
  return version || text;
}

function renderGameVersionBadge(item) {
  const version = normalizedGameVersion(item?.game_version || item?.release_version);
  if (!version) return "";
  return `<span class="game-version-badge" title="Версия игры ${escapeHtml(version)}" aria-label="Версия игры ${escapeHtml(version)}">v${escapeHtml(version)}</span>`;
}

function renderTextWithAttachedBadge(value, badge) {
  const rawText = String(value || "").trim();

  if (!badge) return escapeHtml(rawText);
  if (!rawText) return badge;
  const match = rawText.match(/^([\s\S]*?)(\S+)$/u);
  if (!match) {
    return `${escapeHtml(rawText)}${badge}`;
  }

  const prefix = match[1] || "";
  const lastWord = match[2] || rawText;

  return `${escapeHtml(prefix)}<span class="book-title-tail">${escapeHtml(lastWord)}${badge}</span>`;
}

function renderTitleWithGameVersion(item) {
  return renderTextWithAttachedBadge(titleOf(item, "ru"), renderGameVersionBadge(item));
}

function bookTypeValue(item) {
  return item?.subtype || item?.book_type || "book_series";
}

function renderBookTypeCell(item) {
  return `<span class="common-enemy-type-chip">${escapeHtml(labelFromOptions(bookTypeValue(item), BOOK_TYPE_FILTERS) || "Книжная серия")}</span>`;
}

function iconFor(item) {
  return item?.icon || item?.image || item?.icon_path || "";
}

function entryRarityBackgroundClass(item) {
  const rarity = String(item?.rarity || "").trim();
  return ["5", "4", "3", "2", "1"].includes(rarity)
    ? `rarity-bg-${rarity}`
    : "";
}

function isCharacterStoryEntry(item) {
  return item?.category === "stories" && (item?.story_group || state.subsection) === "character_stories";
}

function renderTitleCell(item) {
  const en = titleOf(item, "en");
  const zh = titleOf(item, "zh");
  const subtitles = [en, zh].filter(Boolean).join(" · ");
  const icon = iconFor(item);
  const iconClass = ["entry-icon", entryRarityBackgroundClass(item), isCharacterStoryEntry(item) ? "story-character-entry-icon" : ""].filter(Boolean).join(" ");
  const iconMarkup = icon
    ? `<img class="${escapeHtml(iconClass)}" src="${escapeHtml(versionedAssetPath(icon))}" alt="" loading="lazy" decoding="async" width="42" height="42">`
    : `<span class="entry-icon placeholder" aria-hidden="true">⌁</span>`;
  const materialsPreview = isEnemyDropEntry(item) ? `<div class="entry-material-preview">${renderMaterialsCell(item)}</div>` : "";
  return `
    <div class="entry-title-cell">
      ${iconMarkup}
      <div class="entry-title-text">
        <div class="book-title">${renderTitleWithGameVersion(item)}</div>
        <div class="book-subtitle">${escapeHtml(subtitles)}</div>
        ${materialsPreview}
      </div>
    </div>
  `;
}

function detailHeaderIconFor(item) {
  const directIcon = iconFor(item);
  if (directIcon) return directIcon;

  const materials = Array.isArray(item?.materials) ? item.materials : [];
  return materials.find(material => material?.icon)?.icon || "";
}
function detailTitleVariant(item, lang = "ru") {
  const direct = item?.title?.[lang] || item?.[`title_${lang}`];
  if (direct) return direct;

  if ((item?.item_group === "common_enemies" || item?.entry_type === "material_set") && Array.isArray(item?.materials) && item.materials.length) {
    return item.materials
      .map(material => material?.title?.[lang] || material?.[`title_${lang}`] || "")
      .filter(Boolean)
      .join(" · ");
  }

  return lang === "ru" ? titleOf(item, "ru") : "";
}


function renderReaderLangControl(extraClass = "", options = {}) {
  const label = options.showLabel === false ? "" : `<span class="toolbar-label">Язык</span>`;
  return `
    <div class="lang-control reader-lang-control ${escapeHtml(extraClass)}" aria-label="Язык текста">
      ${label}
      <div class="lang-switch">
        ${["ru", "en", "zh"].map(lang => `<button type="button" data-lang="${lang}" class="${state.lang === lang ? "active" : ""}">${langLabel(lang)}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderReaderCornerControls(...blocks) {
  const controls = blocks.filter(Boolean).join("");
  return `
    <div class="reader-corner-track reader-tabs-row">
      <div class="reader-corner-controls reader-section-scroll" data-scroll-preserve="reader-corner-controls" aria-label="Быстрые действия чтения">
        ${renderReaderLangControl("reader-corner-lang-control", { showLabel: false })}
        ${controls}
      </div>
      <div class="reader-section-scrollbar reader-corner-scrollbar" data-scrollbar-for="reader-corner-controls" aria-hidden="true">
        <span class="reader-section-scrollbar-thumb"></span>
      </div>
    </div>
  `;
}

function renderReaderTabBlock(label, buttonsMarkup, options = {}) {
  if (!buttonsMarkup) return "";
  const rowClass = ["parts-row", "reader-tabs-row", options.className || ""].filter(Boolean).join(" ");
  const labelMarkup = label ? `<span class="toolbar-label">${escapeHtml(label)}</span>` : "";
  const scrollKey = options.scrollKey || "reader-tabs";
  return `
    <div class="${escapeHtml(rowClass)}">
      ${labelMarkup}
      <div class="reader-tabs-track">
        <div class="volume-scroll reader-section-scroll" data-scroll-preserve="${escapeHtml(scrollKey)}">
          ${buttonsMarkup}
        </div>
        <div class="reader-section-scrollbar" data-scrollbar-for="${escapeHtml(scrollKey)}" aria-hidden="true">
          <span class="reader-section-scrollbar-thumb"></span>
        </div>
      </div>
    </div>
  `;
}

function renderReaderControls(...blocks) {
  const controls = blocks.filter(Boolean).join("");
  if (!controls) return "";
  return `
    <div class="reader-top-controls" aria-label="Управление чтением">
      ${controls}
    </div>
  `;
}

function renderReaderStickyHead(item, options = {}) {
  const showMain = options.showMain !== false;
  const icon = detailHeaderIconFor(item);
  const iconClass = [
    "reader-head-icon",
    options.iconClass || "",
    entryRarityBackgroundClass(item),
  ].filter(Boolean).join(" ");
  const iconMarkup = icon
    ? `<img class="${escapeHtml(iconClass)}" src="${escapeHtml(versionedAssetPath(icon))}" alt="" loading="lazy" decoding="async" width="108" height="108">`
    : `<span class="reader-head-icon reader-head-icon-placeholder" aria-hidden="true">⌁</span>`;
  const englishTitle = detailTitleVariant(item, "en");
  const chineseTitle = detailTitleVariant(item, "zh");
  const headClass = [
    "reader-sticky-head",
    options.className || "",
    showMain ? "" : "reader-sticky-head-compact",
  ].filter(Boolean).join(" ");

  return `
    <div class="${escapeHtml(headClass)}">
      <div class="reader-head-nav">
        <button class="back-link" id="${escapeHtml(options.backId || "back-section")}" type="button">${escapeHtml(options.backLabel || "← Назад")}</button>
        ${options.cornerControls || renderReaderCornerControls()}
      </div>
      ${showMain ? `
        <div class="reader-head-main">
          ${iconMarkup}
          <div class="reader-head-titles">
            <h1>${escapeHtml(titleOf(item, "ru"))}</h1>
            ${englishTitle ? `<div class="reader-title-alt">${escapeHtml(englishTitle)}</div>` : ""}
            ${chineseTitle ? `<div class="reader-title-alt reader-title-zh">${escapeHtml(chineseTitle)}</div>` : ""}
          </div>
        </div>
      ` : ""}
      ${options.controls || ""}
    </div>
  `;
}

function materialTitle(material, lang = "ru") {
  return material?.title?.[lang] || material?.title?.ru || material?.title?.en || material?.title?.zh || material?.name || material?.key || "Материал";
}

function inventoryTitleLines(entry, titleGetter, fallback = "Без названия") {
  const ru = titleGetter(entry, "ru");
  const en = titleGetter(entry, "en");
  const zh = titleGetter(entry, "zh");
  return {
    ru: ru || en || zh || fallback,
    en: en || "",
    zh: zh || "",
  };
}

function renderInventoryTitleBlock(entry, options = {}) {
  const titleGetter = options.titleGetter || ((value, lang) => titleOf(value, lang));
  const titles = inventoryTitleLines(entry, titleGetter, options.fallback || "Без названия");
  const subtitle = [titles.en, titles.zh].filter(Boolean).join(" · ");
  return `
    <div class="volume-title-main inventory-card-title-main">
      <h3>${escapeHtml(titles.ru)}</h3>
      ${subtitle ? `<div class="material-title-subtitle">${escapeHtml(subtitle)}</div>` : ""}
    </div>
  `;
}

function renderInventoryMaterialTitleBlock(material) {
  return renderInventoryTitleBlock(material, {
    titleGetter: (value, lang) => materialTitle(value, lang),
    fallback: "Материал",
  });
}

function renderInventoryIcon(entry, className, size) {
  return entry?.icon
    ? `<img class="${escapeHtml(className)}" src="${escapeHtml(versionedAssetPath(entry.icon))}" alt="" loading="lazy" decoding="async" width="${size}" height="${size}">`
    : "";
}

function renderCommonEnemyMaterialsCell(item) {
  const materials = Array.isArray(item?.materials) ? item.materials : [];
  if (!materials.length) return "—";
  return renderMaterialsCell(item);
}

function renderMaterialsCell(item) {
  const materials = Array.isArray(item?.materials) ? item.materials : [];
  if (!materials.length) return "—";
  const visible = materials.slice(0, 1);
  const rest = materials.length - visible.length;
  return `
    <div class="material-list${rest > 0 ? " has-more" : ""}">
      ${visible.map(material => {
        const icon = material.icon ? `<img src="${escapeHtml(versionedAssetPath(material.icon))}" alt="" loading="lazy" decoding="async" width="28" height="28">` : "";
        return `<span class="material-chip">${icon}<span>${renderTextWithAttachedBadge(materialTitle(material, "ru"), "")}</span></span>`;
      }).join("")}
      ${rest > 0 ? `<span class="tiny-pill catalog-more-pill">+${rest}</span>` : ""}
    </div>
  `;
}

function droppedByEnemies(item) {
  return Array.isArray(item?.dropped_by_enemies) ? item.dropped_by_enemies : [];
}

function renderDevelopmentMaterialTypeCell(item) {
  const label = developmentMaterialTypeTitle(item, "ru");
  return `<span class="common-enemy-type-chip">${escapeHtml(label)}</span>`;
}

function renderGenericItemTypeCell(item) {
  const label = itemGroupTypeTitle(item, "ru");
  return `<span class="common-enemy-type-chip">${escapeHtml(label)}</span>`;
}

function renderStoryElementPill(element) {
  const key = normalizeStoryElement(element);
  const icon = storyElementIcon(key);
  const label = storyElementTitle(key);
  const color = ELEMENT_LABELS[key]?.color || "";
  if (!icon) return `<span class="common-enemy-type-chip">${escapeHtml(label)}</span>`;
  const iconStyle = maskIconStyle(icon, color);
  return `
    <span class="element-pill" style="--filter-color: ${escapeHtml(color)}">
      <span class="element-icon" style="${escapeHtml(iconStyle)}" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderStoryElementCell(item) {
  const elements = storyElementValues(item);
  if (!elements.length) return "—";
  const className = ["story-element-list", elements.length > 3 ? "is-many" : ""].filter(Boolean).join(" ");
  return `<div class="${escapeHtml(className)}">${elements.map(renderStoryElementPill).join("")}</div>`;
}


function renderStoryRarityCell(item) {
  const rarity = String(item?.rarity || "").trim();
  const option = RARITY_FILTERS.find(entry => entry.value === `rarity:${rarity}`);
  if (!option) return rarity ? `${escapeHtml(rarity)}★` : "—";
  const iconStyle = maskIconStyle(option.icon, option.color);
  return `<span class="rarity-icon-pill" style="--filter-color: ${escapeHtml(option.color)}" title="${escapeHtml(option.label)}" aria-label="${escapeHtml(option.label)}"><span class="rarity-icon" style="${escapeHtml(iconStyle)}" aria-hidden="true"></span></span>`;
}

function renderCommonEnemyTypesCell(item) {
  const labels = itemCommonEnemyTypeLabels(item);
  if (!labels.length) return "—";

  return `
    <div class="common-enemy-type-list">
      ${labels.map(label => `<span class="common-enemy-type-chip">${escapeHtml(label)}</span>`).join("")}
    </div>
  `;
}

function renderDroppedByCell(item) {
  const enemies = droppedByEnemies(item);
  if (!enemies.length) {
    return Array.isArray(item?.materials) && item.materials.length ? renderMaterialsCell(item) : "—";
  }

  const visible = enemies.slice(0, 1);
  const rest = enemies.length - visible.length;

  return `
    <div class="dropped-by-catalog-list${rest > 0 ? " has-more" : ""}">
      ${visible.map(enemy => {
        const icon = enemy.icon ? `<img src="${escapeHtml(versionedAssetPath(enemy.icon))}" alt="" loading="lazy" decoding="async" width="22" height="22">` : "";
        return `<span class="dropped-by-catalog-chip">${icon}<span>${escapeHtml(titleOf(enemy, "ru"))}</span></span>`;
      }).join("")}
      ${rest > 0 ? `<span class="tiny-pill catalog-more-pill">+${rest}</span>` : ""}
    </div>
  `;
}

function renderLootChip(drop, currentItemId = "") {
  const icon = drop.icon ? `<img src="${escapeHtml(versionedAssetPath(drop.icon))}" alt="" loading="lazy" decoding="async" width="22" height="22">` : "";
  const currentClass = drop.id === currentItemId ? " current" : "";
  const title = titleOf(drop, state.lang);
  const label = `${icon}<span>${escapeHtml(title)}</span>`;
  if (!drop.id || drop.id === currentItemId) {
    return `<span class="enemy-loot-chip${currentClass}">${label}</span>`;
  }
  const group = drop.item_group || state.subsection || "common_enemies";
  return `<a class="enemy-loot-chip${currentClass}" href="${escapeHtml(routeHash("items", drop.id, group))}" aria-label="Открыть ${escapeHtml(title)}">${label}</a>`;
}

function renderEnemyDropDetail(enemy, currentItemId = "") {
  if (!enemy) {
    return `<div class="prose">Описание противника пока не найдено.</div>`;
  }

  const text = localizedEntryText(enemy) || "Описание противника будет добавлено позже.";
  const drops = Array.isArray(enemy.drops)
    ? enemy.drops.filter(drop => {
        if (!drop || drop.id === currentItemId) return false;
        const title = titleOf(drop, state.lang);
        return title && title !== "Без названия";
      })
    : [];
  const dropsBlock = drops.length ? `
    <div class="enemy-loot-list" aria-label="Также выпадает">
      ${drops.map(drop => renderLootChip(drop, currentItemId)).join("")}
    </div>
  ` : "";

  return `
    <div class="prose">${markdownToHtml(text)}</div>
    ${dropsBlock}
  `;
}

function renderEnemyNameBlock(enemy, className = "dropped-by-names") {
  return `
    <span class="${className}">
      <span class="dropped-by-name">${escapeHtml(titleOf(enemy, "ru"))}</span>
      <span class="dropped-by-meta">${escapeHtml(titleOf(enemy, "en"))}</span>
      <span class="dropped-by-zh">${escapeHtml(titleOf(enemy, "zh"))}</span>
    </span>
  `;
}

function droppedByGridClass(count) {
  if (count === 1) return "dropped-by-grid is-single";
  if (count === 2) return "dropped-by-grid is-pair";
  if (count === 3) return "dropped-by-grid is-trio";
  return "dropped-by-grid is-cascade";
}

function distributeDroppedByColumns(enemies, columnCount = 3) {
  const columns = Array.from({ length: Math.min(columnCount, enemies.length) }, () => []);
  enemies.forEach((enemy, index) => {
    columns[index % columns.length].push(enemy);
  });
  return columns;
}

function renderDroppedByCard(enemy, currentItemId = "") {
  const icon = enemy.icon
    ? `<img class="dropped-by-icon" src="${escapeHtml(versionedAssetPath(enemy.icon))}" alt="" loading="lazy" decoding="async" width="46" height="46">`
    : `<span class="dropped-by-icon entry-icon placeholder" aria-hidden="true">⌁</span>`;

  return `
    <article class="dropped-by-card">
      <div class="dropped-by-card-inner">
        <div class="dropped-by-header">
          ${icon}
          ${renderEnemyNameBlock(enemy)}
        </div>
        ${renderEnemyDropDetail(enemy, currentItemId)}
      </div>
    </article>
  `;
}

function renderDroppedByCards(enemies, currentItemId = "") {
  if (enemies.length <= 3) {
    return enemies.map(enemy => renderDroppedByCard(enemy, currentItemId)).join("");
  }

  return distributeDroppedByColumns(enemies)
    .map(column => `
      <div class="dropped-by-column">
        ${column.map(enemy => renderDroppedByCard(enemy, currentItemId)).join("")}
      </div>
    `)
    .join("");
}

function renderDroppedBySection(item) {
  const enemies = droppedByEnemies(item);
  if (!enemies.length) return "";

  return `
    <div class="dropped-by-section">
      <div class="dropped-by-title">Выпадает с</div>
      <div class="${droppedByGridClass(enemies.length)}">
        ${renderDroppedByCards(enemies, item?.id || "")}
      </div>
    </div>
  `;
}
