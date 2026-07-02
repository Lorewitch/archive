// Кастомные скроллбары, адаптивность и кнопка наверх.

function setupCustomScrollbar(scrollEl, railEl, thumbEl) {
  if (!scrollEl || !railEl || !thumbEl) return () => {};
  let dragging = false;
  let startY = 0;
  let startScroll = 0;

  function metrics() {
    const overflow = scrollEl.scrollHeight - scrollEl.clientHeight;
    const maxScroll = overflow > 18 ? overflow : 0;
    const railHeight = railEl.clientHeight;
    const thumbHeight = maxScroll > 0 ? Math.max(28, Math.floor((scrollEl.clientHeight / scrollEl.scrollHeight) * railHeight)) : 0;
    const maxThumbTop = Math.max(0, railHeight - thumbHeight);
    const thumbTop = maxScroll > 0 && maxThumbTop > 0 ? Math.round((scrollEl.scrollTop / maxScroll) * maxThumbTop) : 0;
    return { maxScroll, thumbHeight, maxThumbTop, thumbTop };
  }

  function update() {
    const m = metrics();
    const canScroll = m.maxScroll > 0 && m.maxThumbTop > 0;
    railEl.classList.toggle("has-scroll", canScroll);
    thumbEl.style.height = `${m.thumbHeight}px`;
    thumbEl.style.transform = `translateY(${m.thumbTop}px)`;
  }

  function scrollToPointer(clientY) {
    const rect = railEl.getBoundingClientRect();
    const m = metrics();
    if (!m.maxScroll || !m.maxThumbTop) return;
    const y = Math.min(Math.max(clientY - rect.top - m.thumbHeight / 2, 0), m.maxThumbTop);
    scrollEl.scrollTop = (y / m.maxThumbTop) * m.maxScroll;
  }

  scrollEl.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  railEl.addEventListener("wheel", event => {
    if (!metrics().maxScroll) return;
    event.preventDefault();
    scrollEl.scrollTop += event.deltaY;
  }, { passive: false });

  railEl.addEventListener("pointerdown", event => {
    if (!metrics().maxScroll) return;
    if (event.target !== thumbEl) scrollToPointer(event.clientY);
  });

  thumbEl.addEventListener("pointerdown", event => {
    const m = metrics();
    if (!m.maxScroll) return;
    dragging = true;
    startY = event.clientY;
    startScroll = scrollEl.scrollTop;
    thumbEl.classList.add("is-dragging");
    thumbEl.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  thumbEl.addEventListener("pointermove", event => {
    if (!dragging) return;
    const m = metrics();
    if (!m.maxScroll || !m.maxThumbTop) return;
    const delta = event.clientY - startY;
    scrollEl.scrollTop = startScroll + (delta / m.maxThumbTop) * m.maxScroll;
  });

  function stopDrag() {
    dragging = false;
    thumbEl.classList.remove("is-dragging");
  }

  thumbEl.addEventListener("pointerup", stopDrag);
  thumbEl.addEventListener("pointercancel", stopDrag);

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(update);
    observer.observe(scrollEl);
    observer.observe(railEl);
  }
  if ("MutationObserver" in window) {
    const observer = new MutationObserver(update);
    observer.observe(scrollEl, { childList: true, subtree: true, characterData: true });
  }
  update();
  return update;
}

const updateMenuRail = setupCustomScrollbar(sidebarScroll, document.getElementById("menu-rail"), document.getElementById("menu-thumb"));
const updateContentRail = setupCustomScrollbar(contentScroll, document.getElementById("content-rail"), document.getElementById("content-thumb"));
window.__archiveSyncScrollbars = function archiveSyncScrollbars() {
  updateMenuRail();
  updateContentRail();
  syncReaderSectionScrollbars();
  requestAnimationFrame(() => {
    updateMenuRail();
    updateContentRail();
    syncReaderSectionScrollbars();
  });
};

let readerSectionScrollbarDrag = null;

function scrollerForReaderSectionScrollbar(bar) {
  return bar?.closest(".reader-tabs-row")?.querySelector(".reader-section-scroll") || null;
}

app?.addEventListener("scroll", event => {
  if (event.target instanceof Element && event.target.classList.contains("reader-section-scroll")) {
    syncReaderSectionScrollbars();
  }
}, true);

app?.addEventListener("pointerdown", event => {
  const bar = event.target.closest?.(".reader-section-scrollbar");
  if (!bar) return;

  const scroller = scrollerForReaderSectionScrollbar(bar);
  if (!scroller) return;
  const m = readerScrollbarMetrics(scroller, bar);
  if (!m.maxScroll || !m.maxThumbLeft) return;

  const rect = bar.getBoundingClientRect();
  if (!event.target.closest?.(".reader-section-scrollbar-thumb")) {
    const targetLeft = Math.max(0, Math.min(m.maxThumbLeft, event.clientX - rect.left - (m.thumbWidth / 2)));
    scroller.scrollLeft = (targetLeft / m.maxThumbLeft) * m.maxScroll;
    syncReaderSectionScrollbars();
  }

  const thumb = bar.querySelector(".reader-section-scrollbar-thumb");
  readerSectionScrollbarDrag = {
    pointerId: event.pointerId,
    bar,
    scroller,
    startX: event.clientX,
    startScrollLeft: scroller.scrollLeft,
  };
  thumb?.classList.add("is-dragging");
  bar.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

app?.addEventListener("pointermove", event => {
  const drag = readerSectionScrollbarDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;

  const m = readerScrollbarMetrics(drag.scroller, drag.bar);
  if (!m.maxScroll || !m.maxThumbLeft) return;

  const delta = event.clientX - drag.startX;
  drag.scroller.scrollLeft = drag.startScrollLeft + (delta / m.maxThumbLeft) * m.maxScroll;
  syncReaderSectionScrollbars();
  event.preventDefault();
});

function stopReaderSectionScrollbarDrag(event) {
  const drag = readerSectionScrollbarDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.bar.querySelector(".reader-section-scrollbar-thumb")?.classList.remove("is-dragging");
  drag.bar.releasePointerCapture?.(event.pointerId);
  readerSectionScrollbarDrag = null;
}

app?.addEventListener("pointerup", stopReaderSectionScrollbarDrag);
app?.addEventListener("pointercancel", stopReaderSectionScrollbarDrag);

const toTopButton = document.getElementById("to-top-button");
let responsiveFitFrame = 0;
let viewportCleanupFrame = 0;
let viewportCleanupTimers = [];

function isTouchLikeViewport() {
  return Boolean(
    window.matchMedia?.("(hover: none) and (pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0 ||
    "ontouchstart" in window
  );
}

function updateMobileLandscapeClass() {
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0;
  const height = viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
  const isMobileLandscape = isTouchLikeViewport() && width > height && width <= 1180;
  document.documentElement.classList.toggle("is-mobile-landscape", isMobileLandscape);
}

function scheduleResponsiveFit() {
  if (responsiveFitFrame) return;
  responsiveFitFrame = window.requestAnimationFrame(() => {
    responsiveFitFrame = 0;
    syncReaderSectionScrollbars();
  });
}

function applyViewportCleanup() {
  viewportCleanupFrame = 0;
  updateMobileLandscapeClass();
  resetHorizontalScroll();
  scheduleResponsiveFit();
}

function scheduleViewportCleanup() {
  if (!viewportCleanupFrame) {
    viewportCleanupFrame = window.requestAnimationFrame(applyViewportCleanup);
  }
  for (const timer of viewportCleanupTimers) {
    window.clearTimeout(timer);
  }
  viewportCleanupTimers = [80, 240, 520].map(delay => window.setTimeout(() => {
    updateMobileLandscapeClass();
    resetHorizontalScroll();
    scheduleResponsiveFit();
  }, delay));
}

function updateToTopButton() {
  if (!toTopButton) return;
  toTopButton.classList.toggle("visible", primaryScrollY() > 520);
}

toTopButton?.addEventListener("click", () => {
  scrollPrimaryTo(0, "smooth");
});

contentScroll?.addEventListener("scroll", updateToTopButton, { passive: true });
window.addEventListener("scroll", updateToTopButton, { passive: true });
updateToTopButton();

updateMobileLandscapeClass();
init();

window.addEventListener("resize", scheduleViewportCleanup, { passive: true });
window.addEventListener("orientationchange", scheduleViewportCleanup, { passive: true });
window.visualViewport?.addEventListener("resize", scheduleViewportCleanup, { passive: true });
