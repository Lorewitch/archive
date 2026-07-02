// Состояние интерфейса и ссылки на основные DOM-узлы.

const expandedMenuSections = new Set();

const state = {
  section: "home",
  subsection: null,
  entryId: null,
  lang: "ru",
  volume: 1,
  readAll: false,
  artifactPart: "flower",
  artifactReadAll: false,
  storyPart: 1,
  storyReadAll: false,
  storyContentType: "stories",
  filters: {
    books: { query: "", filter: "all", sort: "version", page: 1, pageSize: 10, typeFilters: [] },
    artifacts: { query: "", filter: "all", sort: "version", page: 1, pageSize: 10 },
    weapons: { query: "", filter: "all", sort: "version", page: 1, pageSize: 10, typeFilters: [] },
    items: {
      query: "",
      filter: "all",
      sort: "version",
      page: 1,
      pageSize: 10,
      typeFiltersByGroup: {
        common_enemies: [],
        development_materials: [],
        teyvat_resources: [],
        serenitea_pot: [],
        useful_items: []
      }
    },
    stories: {
      query: "",
      filter: "all",
      sort: "version",
      page: 1,
      pageSize: 10,
      typeFiltersByGroup: {
        character_stories: []
      }
    }
  }
};

const app = document.getElementById("app");
const nav = document.getElementById("nav");
const contentCard = document.querySelector(".content-card");
const contentScroll = document.getElementById("content-scroll");
const sidebarScroll = document.getElementById("sidebar-scroll");

function syncReaderModeClass() {
  contentCard?.classList.toggle("has-reader-page", Boolean(app?.querySelector(".reader-page")));
}

function primaryScrollY() {
  return contentScroll ? contentScroll.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);
}

function scrollPrimaryTo(y = 0, behavior = "auto") {
  if (contentScroll) {
    contentScroll.scrollTo({ top: Math.max(0, Number(y) || 0), behavior });
  } else {
    window.scrollTo({ top: Math.max(0, Number(y) || 0), behavior });
  }
}

function readerScrollbarMetrics(scroller, bar) {
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const barWidth = Math.max(0, bar.clientWidth);
  const thumbWidth = maxScroll > 0
    ? Math.max(28, Math.min(barWidth, Math.round((scroller.clientWidth / Math.max(1, scroller.scrollWidth)) * barWidth)))
    : barWidth;
  const maxThumbLeft = Math.max(0, barWidth - thumbWidth);
  return { maxScroll, barWidth, thumbWidth, maxThumbLeft };
}

function syncReaderSectionScrollbars() {
  app?.querySelectorAll(".reader-section-scrollbar").forEach(bar => {
    const row = bar.closest(".reader-tabs-row");
    const scroller = row?.querySelector(".reader-section-scroll");
    const thumb = bar.querySelector(".reader-section-scrollbar-thumb");
    if (!scroller || !thumb) return;

    const m = readerScrollbarMetrics(scroller, bar);
    const hasScroll = m.maxScroll > 1 && m.barWidth > 0;
    bar.classList.toggle("has-scroll", hasScroll);
    if (!hasScroll) {
      thumb.style.width = "0px";
      thumb.style.transform = "translateX(0px)";
      return;
    }

    const left = m.maxScroll > 0 ? (scroller.scrollLeft / m.maxScroll) * m.maxThumbLeft : 0;
    thumb.style.width = `${m.thumbWidth}px`;
    thumb.style.transform = `translateX(${Math.max(0, Math.min(m.maxThumbLeft, left))}px)`;
  });
}

function syncCustomScrollbarsSoon() {
  if (typeof window.__archiveSyncScrollbars === "function") {
    window.requestAnimationFrame(() => window.__archiveSyncScrollbars());
  } else {
    window.requestAnimationFrame(syncReaderSectionScrollbars);
  }
}
