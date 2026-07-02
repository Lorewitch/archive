// Страницы чтения и детальные карточки записей.

function renderBookDetail(book) {
  activeDetail = { type: "book", data: book };
  const volumes = Array.isArray(book.volumes) ? book.volumes : [];
  const isSingleVolumeBook = volumes.length <= 1;

  if (isSingleVolumeBook) {
    state.readAll = false;
    state.volume = volumes[0]?.number || 1;
  }

  const volumeButtons = isSingleVolumeBook
    ? ""
    : volumes.map(volume => `<button type="button" data-volume="${volume.number}" class="${!state.readAll && state.volume === volume.number ? "active" : ""}">${escapeHtml(volume.title?.[state.lang] || "Том " + volume.number)}</button>`).join("");
  const readAllButton = isSingleVolumeBook
    ? ""
    : `<button class="mode-button ${state.readAll ? "active" : ""}" id="toggle-read-all" type="button">${state.readAll ? "Читать по томам" : "Читать всё подряд"}</button>`;
  const cornerControls = renderReaderCornerControls(readAllButton);
  const controls = renderReaderControls(
    renderReaderTabBlock("", volumeButtons)
  );

  app.innerHTML = `
    <section class="page-card book-page reader-page">
      ${renderReaderStickyHead(book, {
        className: "book-detail-head",
        backId: "back-books",
        backLabel: "← Назад к спискам",
        cornerControls,
        controls,
      })}

      <div id="reader-text-area">${renderTextArea(book)}</div>

    </section>
  `;
}

function renderTextArea(book) {
  const volumes = state.readAll ? book.volumes : book.volumes.filter(volume => volume.number === state.volume);
  const generalNote = cleanPublicNote(book.notes?.general || "");
  const volumeNotes = book.notes?.byVolume || {};

  return volumes.map((volume, index) => {
    const volumeTitle = escapeHtml(volume.title?.[state.lang] || "Том " + volume.number);
    const volumeNote = cleanPublicNote(volumeNotes[volume.number] || "");
    const noteText = volumeNote || (index === 0 ? generalNote : "");
    const notesBlock = "";

    return `
      <article class="text-card" id="volume-${volume.number}">
        <div class="volume-title">
          <div class="volume-title-main"><h3>${volumeTitle}</h3></div>
        </div>
        <div class="prose">${markdownToHtml(volume.text?.[state.lang] || "[нет текста]")}</div>
        ${notesBlock}
      </article>
    `;
  }).join("");
}

function artifactPartTitle(part, lang = state.lang) {
  return part?.title?.[lang] || ARTIFACT_PART_LABELS[part?.key]?.[lang] || part?.title?.ru || part?.key || "Часть сета";
}

function renderArtifactDetail(artifact) {
  activeDetail = { type: "artifact", data: artifact };
  const parts = Array.isArray(artifact.parts) ? artifact.parts : [];
  if (!parts.length) {
    renderGenericDetail(artifact, getSectionConfig("artifacts"));
    return;
  }

  if (!parts.some(part => part.key === state.artifactPart)) {
    state.artifactPart = parts[0].key;
  }

  const isSinglePartArtifact = parts.length === 1;
  const partButtons = isSinglePartArtifact ? "" : parts.map(part => `<button type="button" data-artifact-part="${escapeHtml(part.key)}" class="${!state.artifactReadAll && state.artifactPart === part.key ? "active" : ""}">${escapeHtml(artifactPartTitle(part, state.lang))}</button>`).join("");
  const cornerControls = renderReaderCornerControls(
    isSinglePartArtifact ? "" : `<button class="mode-button ${state.artifactReadAll ? "active" : ""}" id="toggle-artifact-read-all" type="button">${state.artifactReadAll ? "Читать по частям" : "Читать весь сет"}</button>`
  );
  const controls = renderReaderControls(
    renderReaderTabBlock("", partButtons)
  );

  app.innerHTML = `
    <section class="page-card book-page reader-page artifact-page">
      ${renderReaderStickyHead(artifact, {
        className: "artifact-detail-head",
        backId: "back-artifacts",
        backLabel: "← Назад к спискам",
        cornerControls,
        controls,
      })}

      <div id="reader-text-area">${renderArtifactTextArea(artifact)}</div>
    </section>
  `;
}

function renderArtifactTextArea(artifact) {
  const parts = Array.isArray(artifact.parts) ? artifact.parts : [];
  const selectedParts = parts.length === 1 || state.artifactReadAll ? parts : parts.filter(part => part.key === state.artifactPart);
  const generalNote = cleanPublicNote(artifact.notes?.general || "");
  const partNotes = artifact.notes?.byPart || artifact.notes?.byVolume || {};

  return selectedParts.map((part, index) => {
    const partTitle = escapeHtml(artifactPartTitle(part, state.lang));
    const noteText = cleanPublicNote(partNotes[part.key] || "") || (index === 0 ? generalNote : "");
    const notesBlock = "";

    return `
      <article class="text-card artifact-text-card" id="artifact-part-${escapeHtml(part.key)}">
        <div class="volume-title">
          <div class="volume-title-main"><h3>${partTitle}</h3></div>
        </div>
        <div class="prose">${markdownToHtml(emphasizeArtifactLabels(part.text?.[state.lang] || "[нет текста]"))}</div>
        ${notesBlock}
      </article>
    `;
  }).join("");
}

function localizedEntryText(item) {
  const text = item?.text;
  const description = item?.description;

  if (text && typeof text === "object") {
    return text[state.lang] || text.ru || text.en || text.zh || "";
  }
  if (description && typeof description === "object") {
    return description[state.lang] || description.ru || description.en || description.zh || "";
  }
  return text || description || "";
}

function genericNotes(item) {
  const notes = item?.notes;
  if (!notes) return "";
  if (typeof notes === "string") return cleanPublicNote(notes);
  return cleanPublicNote(notes.general || "");
}


function localizedMaterialText(material) {
  const text = material?.text;
  if (text && typeof text === "object") return text[state.lang] || text.ru || text.en || text.zh || "";
  return text || "";
}

function enemyDescriptionKey(item = activeDetail?.data, configId = activeDetail?.configId || state.section) {
  const id = item?.id || state.entryId || "";
  const group = item?.item_group || state.subsection || "";
  return id ? `${configId}:${group}:${id}` : "";
}

function rememberEnemyDescriptionState(panel, expanded) {
  const key = panel?.dataset?.descriptionKey || enemyDescriptionKey();
  if (!key) return;
  if (expanded) {
    expandedEnemyDescriptionKeys.add(key);
  } else {
    expandedEnemyDescriptionKeys.delete(key);
  }
}

function renderBossOverviewCard(item) {
  const text = localizedEntryText(item);
  if (!text && !item?.icon) return "";
  const icon = renderInventoryIcon(item, "inventory-card-icon boss-overview-icon", 112);

  return `
    <article class="text-card inventory-card boss-overview-card" data-description-key="${escapeHtml(enemyDescriptionKey(item, activeDetail?.configId || state.section))}">
      <div class="volume-title">
        ${renderInventoryTitleBlock(item)}
      </div>
      <div class="prose inventory-card-body">${icon}${markdownToHtml(text || "Описание босса будет добавлено позже.")}</div>
    </article>
  `;
}

function renderEnemyDropsDetail(item, config) {
  activeDetail = { type: "enemyDrops", data: item, configId: config.id };
  const materials = Array.isArray(item.materials) ? item.materials : [];
  if (!materials.length) {
    renderGenericDetail(item, config);
    return;
  }

  const commonEnemyLootPage = item.item_group === "common_enemies";
  const developmentMaterialPage = item.item_group === "development_materials";
  const bossLootPage = isEnemyDropGroup(item.item_group) && !commonEnemyLootPage;
  const bossDescriptionBlock = bossLootPage ? renderBossOverviewCard(item) : "";

  app.innerHTML = `
    <section class="page-card book-page reader-page${commonEnemyLootPage ? " common-enemy-loot-page" : ""}${developmentMaterialPage ? " development-material-page" : ""}${bossLootPage ? " boss-loot-page" : ""}">
      ${renderReaderStickyHead(item, {
        className: "items-detail-head",
        backId: "back-section",
        backLabel: catalogBackLabel(config, state.subsection),
        cornerControls: renderReaderCornerControls(),
        showMain: false,
      })}

      ${bossDescriptionBlock}

      <div id="reader-text-area">${renderEnemyMaterialsTextArea(item)}</div>

      ${item.item_group === "common_enemies" ? renderDroppedBySection(item) : ""}
    </section>
  `;
}

function renderEnemyMaterialsTextArea(item) {
  const materials = Array.isArray(item.materials) ? item.materials : [];

  return materials.map(material => {
    const text = localizedMaterialText(material) || "Описание материала будет добавлено позже.";
    const iconMarkup = material.icon ? `<img class="inventory-card-icon material-float-icon" src="${escapeHtml(versionedAssetPath(material.icon))}" alt="" loading="lazy" decoding="async" width="112" height="112">` : "";
    const notesBlock = "";

    return `
      <article class="text-card artifact-text-card inventory-card inventory-material-card" id="item-material-${escapeHtml(material.key)}">
        <div class="volume-title">
          ${renderInventoryMaterialTitleBlock(material)}
        </div>
        <div class="prose material-reader-body inventory-card-body">${iconMarkup}${markdownToHtml(text)}</div>
        ${notesBlock}
      </article>
    `;
  }).join("");
}

function storyParts(item) {
  if (Array.isArray(item?.parts) && item.parts.length) return item.parts;

  const text = localizedEntryText(item);
  if (!text) return [];
  return [{
    number: 1,
    title: { ru: "История", en: "Story", zh: "故事" },
    text: { [state.lang]: text, ru: item?.text?.ru || text, en: item?.text?.en || "", zh: item?.text?.zh || "" }
  }];
}

function localizedStoryField(value, lang = state.lang) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value?.[lang] || value?.ru || value?.en || value?.zh || value?.text || value?.title || "";
}

function storyReplicaSource(item) {
  return item?.replicas || item?.quotes || item?.voicelines || item?.voice_lines || item?.voiceLines || item?.lines || item?.speech || null;
}

function normalizeStoryReplicaPart(rawPart, index) {
  const titleSource = rawPart?.title ?? rawPart?.name ?? rawPart?.label ?? rawPart?.key;
  const textSource = rawPart?.text ?? rawPart?.content ?? rawPart?.description ?? rawPart?.line ?? rawPart?.value ?? rawPart;
  const defaultTitle = `Реплика ${index + 1}`;
  const textRu = localizedStoryField(textSource, "ru");
  const textEn = localizedStoryField(textSource, "en");
  const textZh = localizedStoryField(textSource, "zh");
  const hasText = [textRu, textEn, textZh].some(Boolean);
  if (!hasText) return null;

  return {
    number: index + 1,
    title: {
      ru: localizedStoryField(titleSource, "ru") || defaultTitle,
      en: localizedStoryField(titleSource, "en") || localizedStoryField(titleSource, "ru") || `Voice-Over ${index + 1}`,
      zh: localizedStoryField(titleSource, "zh") || localizedStoryField(titleSource, "ru") || defaultTitle,
    },
    text: {
      ru: textRu,
      en: textEn,
      zh: textZh,
    }
  };
}

function storyReplicaParts(item) {
  const source = storyReplicaSource(item);
  if (!source) return [];

  if (Array.isArray(source)) {
    return source.map(normalizeStoryReplicaPart).filter(Boolean);
  }

  if (typeof source !== "object") {
    const normalized = normalizeStoryReplicaPart(source, 0);
    return normalized ? [normalized] : [];
  }

  const nested = source.parts || source.items || source.lines || source.entries || source.list;
  if (Array.isArray(nested)) {
    return nested.map(normalizeStoryReplicaPart).filter(Boolean);
  }

  const textSource = source.text || source.content || source.description;
  if (textSource) {
    const normalized = normalizeStoryReplicaPart(source, 0);
    return normalized ? [normalized] : [];
  }

  return Object.entries(source)
    .map(([key, value], index) => normalizeStoryReplicaPart({ key, ...(typeof value === "object" && value ? value : { text: value }) }, index))
    .filter(Boolean);
}

function storyContentTypes(item) {
  const types = [{ key: "stories", label: { ru: "Истории", en: "Stories", zh: "故事" } }];
  const hasReplicas = storyReplicaParts(item).length > 0;
  if (hasReplicas || isCharacterStoryEntry(item)) {
    types.push({ key: "replicas", label: { ru: "Реплики", en: "Voice-Overs", zh: "语音" } });
  }
  return types;
}

function activeStoryContentType(item) {
  const available = storyContentTypes(item).map(type => type.key);
  if (available.includes(state.storyContentType)) return state.storyContentType;
  return "stories";
}

function storyContentParts(item, contentType = activeStoryContentType(item)) {
  return contentType === "replicas" ? storyReplicaParts(item) : storyParts(item);
}

function storyPartTitle(part, lang = state.lang) {
  return localizedStoryField(part?.title, lang) || `История ${part?.number || ""}`.trim();
}

function storyPartText(part, lang = state.lang) {
  return localizedStoryField(part?.text, lang) || "[нет текста]";
}

function normalizeActiveStoryPart(parts) {
  if (!parts.length) {
    state.storyPart = 1;
    state.storyReadAll = false;
    return;
  }
  if (!parts.some(part => Number(part.number) === Number(state.storyPart))) {
    state.storyPart = Number(parts[0].number) || 1;
  }
}

function renderStoryTextArea(story) {
  const contentType = activeStoryContentType(story);
  const parts = storyContentParts(story, contentType);
  normalizeActiveStoryPart(parts);

  if (!parts.length) {
    const emptyTitle = contentType === "replicas" ? "Реплики" : "Истории";
    const emptyText = contentType === "replicas"
      ? "Реплики для этого персонажа пока не добавлены."
      : "Истории для этой записи пока не добавлены.";

    return `
      <article class="text-card story-text-card story-empty-card">
        <div class="volume-title">
          <div class="volume-title-main"><h3>${emptyTitle}</h3></div>
        </div>
        <div class="prose"><p>${emptyText}</p></div>
      </article>
    `;
  }

  const visibleParts = state.storyReadAll ? parts : parts.filter(part => Number(part.number) === Number(state.storyPart));

  return visibleParts.map(part => {
    const notesBlock = "";

    return `
      <article class="text-card story-text-card" id="story-part-${escapeHtml(part.number)}">
        <div class="volume-title">
          <div class="volume-title-main"><h3>${escapeHtml(storyPartTitle(part))}</h3></div>
        </div>
        <div class="prose">${markdownToHtml(storyPartText(part))}</div>
        ${notesBlock}
      </article>
    `;
  }).join("");
}

function renderStoryDetail(story, config) {
  activeDetail = { type: "story", data: story, configId: config.id };
  if (!story) {
    renderError("История не найдена.");
    return;
  }

  const contentTypes = storyContentTypes(story);
  const contentType = activeStoryContentType(story);
  state.storyContentType = contentType;

  const parts = storyContentParts(story, contentType);
  normalizeActiveStoryPart(parts);
  const showPartToolbar = parts.length > 1;
  const partButtons = showPartToolbar ? parts.map(part => `<button type="button" data-story-part="${escapeHtml(part.number)}" class="${!state.storyReadAll && Number(state.storyPart) === Number(part.number) ? "active" : ""}">${escapeHtml(storyPartTitle(part))}</button>`).join("") : "";
  const contentTypeButtons = contentTypes.length > 1
    ? contentTypes.map(type => `<button class="reader-content-type-button ${contentType === type.key ? "active" : ""}" type="button" data-story-content="${escapeHtml(type.key)}">${escapeHtml(localizedStoryField(type.label))}</button>`).join("")
    : "";
  const readAllButton = `<button class="mode-button ${state.storyReadAll ? "active" : ""}" id="toggle-story-read-all" type="button">${state.storyReadAll ? (contentType === "replicas" ? "Читать по репликам" : "Читать по разделам") : (contentType === "replicas" ? "Читать все реплики" : "Читать всё подряд")}</button>`;
  const cornerControls = renderReaderCornerControls(contentTypeButtons, readAllButton);
  const controls = renderReaderControls(
    renderReaderTabBlock("", partButtons, { className: "story-inner-tabs-row", scrollKey: "story-inner-tabs" })
  );

  app.innerHTML = `
    <section class="page-card book-page reader-page story-page">
      ${renderReaderStickyHead(story, {
        className: "story-detail-head",
        iconClass: "story-detail-icon",
        backId: "back-section",
        backLabel: catalogBackLabel(config, state.subsection),
        cornerControls,
        controls,
      })}

      <div id="reader-text-area">${renderStoryTextArea(story)}</div>
    </section>
  `;
}

function renderGenericDetail(item, config) {
  activeDetail = { type: "generic", data: item, configId: config.id };
  if (!item) {
    renderError("Запись не найдена.");
    return;
  }

  const text = localizedEntryText(item) || "Текст этой записи будет добавлен позже.";
  const noteText = genericNotes(item);
  const notesBlock = "";
  const isWeapon = config.id === "weapons";
  const isSimpleItem = config.id === "items";
  const weaponTextParts = isWeapon ? splitWeaponDescriptionText(text) : { description: text, details: "" };
  const itemIconClass = ["inventory-card-icon", "item-description-float-icon", entryRarityBackgroundClass(item)].filter(Boolean).join(" ");
  const itemFloatIcon = isSimpleItem ? renderInventoryIcon(item, itemIconClass, 112) : "";
  const weaponDescriptionBlock = isWeapon && weaponTextParts.description ? `
      ${renderReaderBlockHeading(readerSectionLabel("description"), "reader-block-heading-accent")}
      <article class="weapon-description-panel ${config.id}-detail-card">
        <div class="prose">${markdownToHtml(weaponTextParts.description)}</div>
      </article>
  ` : "";
  const weaponHistoryParts = isWeapon ? stripLeadingMarkdownHeading(weaponTextParts.details, readerSectionLabel("history")) : { title: "", body: "" };
  const weaponHistoryBlock = isWeapon && weaponHistoryParts.body ? `
      ${renderReaderBlockHeading(weaponHistoryParts.title, "reader-block-heading-light")}
      <article class="text-card generic-text-card weapon-history-card ${config.id}-detail-card">
        <div class="prose weapon-detail-main-text">${markdownToHtml(weaponHistoryParts.body)}</div>
      </article>
  ` : "";
  const bodyBlock = isSimpleItem ? `
        <div class="prose item-description-prose inventory-card-body">${itemFloatIcon}${markdownToHtml(text)}</div>
  ` : `
        <div class="prose">${markdownToHtml(text)}</div>
  `;
  const droppedByBlock = config.id === "items" && item?.item_group === "common_enemies"
    ? renderDroppedBySection(item)
    : "";
  const detailMarkup = isWeapon ? `
      ${weaponDescriptionBlock || `${renderReaderBlockHeading(readerSectionLabel("description"), "reader-block-heading-accent")}<article class="weapon-description-panel ${config.id}-detail-card"><div class="prose">${markdownToHtml(text)}</div></article>`}
      ${weaponHistoryBlock}
      ${notesBlock}
  ` : `
      <article class="text-card generic-text-card ${config.id}-detail-card">
        <div class="volume-title generic-title">
          ${isSimpleItem ? renderInventoryTitleBlock(item) : `<div class="volume-title-main"><h3>Текст</h3></div>`}
        </div>
        ${bodyBlock}
        ${droppedByBlock}
        ${notesBlock}
      </article>
  `;

  app.innerHTML = `
    <section class="page-card book-page reader-page">
      ${renderReaderStickyHead(item, {
        className: `${escapeHtml(config.id)}-detail-head`,
        backId: "back-section",
        backLabel: catalogBackLabel(config, state.subsection),
        showMain: !isSimpleItem,
      })}
      ${detailMarkup}
    </section>
  `;
}
