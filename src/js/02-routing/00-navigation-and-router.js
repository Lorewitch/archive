// Мобильное меню, маршруты и навигация.

function updateMobileMenuButton() {
  const button = document.getElementById("open-menu");
  if (!button) return;
  const isOpen = document.body.classList.contains("menu-open");
  button.setAttribute("aria-expanded", String(isOpen));
  button.setAttribute("aria-label", isOpen ? "Закрыть разделы" : "Открыть разделы");
  button.textContent = isOpen ? "×" : "☰";
}

function openMenu() {
  if (document.body.classList.contains("menu-open")) return;
  menuScrollY = primaryScrollY();
  document.documentElement.classList.add("menu-open");
  document.body.classList.add("menu-open");
  document.body.style.position = "fixed";
  document.body.style.top = `-${menuScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
  updateMobileMenuButton();
  syncCustomScrollbarsSoon();
}

function closeMenu() {
  if (!document.body.classList.contains("menu-open")) return;
  document.documentElement.classList.remove("menu-open");
  document.body.classList.remove("menu-open");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  document.body.style.overflow = "";
  updateMobileMenuButton();
  scrollPrimaryTo(menuScrollY || 0);
}

function toggleMenu() {
  if (document.body.classList.contains("menu-open")) closeMenu();
  else openMenu();
}

function isKnownGroup(config, value) {
  return Boolean(value && (config.groups || []).some(([key]) => key === value));
}

function groupValue(item, config) {
  const value = item?.[config.groupField] || item?.book_type || item?.subtype || item?.item_group || item?.story_group || item?.category_type || item?.type || config.defaultGroup;
  return value || config.defaultGroup;
}

function storyGroupLabel(key) {
  return STORY_GROUP_LABELS[key] || key || "—";
}

function catalogBackTarget(config, groupKey = state.subsection) {
  if (config.id === "stories" && groupKey === "archon_quests" && state.collection) {
    return { section: "stories", subsection: "archon_quests" };
  }
  return { section: config.id, subsection: null };
}

function catalogBackLabel(config, groupKey = state.subsection) {
  void config;
  void groupKey;
  return "← Назад к спискам";
}

function routeHash(section, entryId = null, subsection = null, collection = null) {
  if (collection && subsection === "archon_quests" && !entryId) {
    return `#/${section}/archon_quests/collections/${encodeURIComponent(collection)}`;
  }
  if (entryId && subsection) return `#/${section}/${subsection}/${entryId}`;
  if (entryId) return `#/${section}/${entryId}`;
  if (subsection) return `#/${section}/${subsection}`;
  return `#/${section}`;
}

function setRoute(section, entryId = null, subsection = null, collection = null) {
  const normalizedSection = section === "home" ? "home" : getSectionConfig(section).id;
  const nextHash = normalizedSection === "home" ? "#/home" : routeHash(normalizedSection, entryId, subsection, collection);
  if (!entryId && state.storyReturnRoute && normalizedSection !== "stories") {
    state.storyReturnRoute = null;
  }

  closeMenu();

  if (window.location.hash === nextHash) {
    render();
    return;
  }

  window.location.hash = nextHash;
}

function parseHash() {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const section = parts[0] || "home";
  state.subsection = null;
  state.collection = null;
  state.entryId = null;

  if (section === "home") {
    state.section = "home";
    return;
  }

  const config = getSectionConfig(section);
  state.section = config.id;

  // Старые ссылки на упразднённую страницу «Квесты и задания» не ломаем.
  if (config.id === "stories" && parts[1] === "quest_stories") {
    state.entryId = parts[2] || null;
    return;
  }

  if (config.groups && isKnownGroup(config, parts[1])) {
    state.subsection = parts[1];
    if (config.id === "stories" && parts[1] === "archon_quests" && parts[2] === "collections") {
      const collectionId = parts[3] || "";
      state.collection = archonCollectionDefinition(collectionId) ? collectionId : null;
    } else {
      state.entryId = parts[2] || null;
    }
  } else {
    state.entryId = parts[1] || null;
  }
}

function currentRouteKey() {
  return [state.section || "home", state.subsection || "", state.collection || "", state.entryId || ""].join("/");
}

function currentCatalogScrollKey() {
  return [state.section || "home", state.subsection || "", state.collection || ""].join("/");
}

function isCatalogRoute() {
  return !state.entryId;
}

function resetHorizontalScroll() {
  const currentY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  if (!window.scrollX && !document.documentElement.scrollLeft && !document.body.scrollLeft) return;
  window.scrollTo(0, currentY);
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
}

function rememberCatalogScrollPosition() {
  if (!renderedRouteKey || !isCatalogRoute()) return;
  catalogScrollPositions.set(currentCatalogScrollKey(), {
    y: primaryScrollY(),
  });
}

function targetScrollPositionForRoute() {
  if (state.entryId) return { y: 0 };
  return catalogScrollPositions.get(currentCatalogScrollKey()) || { y: 0 };
}

function scheduleRouteScroll(routeChanged) {
  if (!routeChanged) return;
  const target = targetScrollPositionForRoute();
  requestAnimationFrame(() => {
    scrollPrimaryTo(target.y);
    window.scrollTo(0, target.y);
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
    updateToTopButton();
    syncCustomScrollbarsSoon();
  });
}

function markRouteRendered(routeKey, routeChanged) {
  renderedRouteKey = routeKey;
  syncReaderModeClass();
  scheduleRouteScroll(routeChanged);
}

function menuIcon(section) {
  const iconStyle = section.icon ? maskIconStyle(section.icon) : "";
  return `<span class="nav-icon" style="${escapeHtml(iconStyle)}" aria-hidden="true"></span>`;
}

function menuChildren(section) {
  return MENU_CHILDREN[section.id] || [];
}

function childActive(sectionId, key) {
  if (state.section !== sectionId) return false;
  if (state.subsection === key) return true;
  const section = getSectionConfig(sectionId);
  return false;
}

// При входе в раздел раскрываем его меню один раз; ручное сворачивание уважаем.
let lastNavSection = null;
function renderNav() {
  if (state.section !== lastNavSection) {
    if (MENU_CHILDREN[state.section]?.length) expandedMenuSections.add(state.section);
    lastNavSection = state.section;
  }
  const rows = [HOME_SECTION, ...SECTIONS].map(section => {
    const children = menuChildren(section);
    const hasChildren = children.length > 0;
    const isOpen = expandedMenuSections.has(section.id);
    const isActive = state.section === section.id;

    if (!hasChildren) {
      return `
        <div class="nav-section">
          <button class="nav-button ${isActive ? "is-active" : ""}" type="button" data-section="${escapeHtml(section.id)}">
            ${menuIcon(section)}
            <span class="nav-label">${escapeHtml(section.title)}</span>
            <span class="nav-meta"></span>
          </button>
        </div>
      `;
    }

    return `
      <div class="nav-section ${isOpen ? "is-open" : ""}">
        <button class="nav-button ${isActive ? "is-active" : ""}" type="button" data-menu-toggle="${escapeHtml(section.id)}" aria-expanded="${isOpen ? "true" : "false"}">
          ${menuIcon(section)}
          <span class="nav-label">${escapeHtml(section.title)}</span>
          <span class="nav-chevron">›</span>
        </button>
        <div class="nav-children">
          ${children.map(([key, label]) => `
            <button class="nav-child ${childActive(section.id, key) ? "is-active" : ""}" type="button" data-menu-action="child" data-menu-section="${escapeHtml(section.id)}" data-menu-key="${escapeHtml(key)}">
              ${escapeHtml(label)}
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  nav.innerHTML = rows;
  syncCustomScrollbarsSoon();
}


function collectionForCatalog(config) {
  const rows = config.data();
  if (config.groups && state.subsection) {
    return rows.filter(item => groupValue(item, config) === state.subsection);
  }
  return rows;
}
