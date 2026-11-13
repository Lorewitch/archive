# Архив Лороведьмы

Публичная база игровых текстов Тейвата на русском, английском и китайском языках.
Сайт рассчитан на существующий GitHub Pages: `https://lorewitch.github.io/archive/`.

## Установка этой версии

1. Распакуй ZIP и перенеси содержимое папки `archive` в корень существующего репозитория `archive`.
2. Папку `assets` замени целиком: при простом объединении папок старые неиспользуемые изображения останутся на диске. Остальные файлы перенеси с заменой.
3. Сохрани служебную папку `.git` своего рабочего репозитория. В ZIP история Git не включена.
4. Загрузи изменения в существующий репозиторий и дождись завершения его сборки и публикации GitHub Pages.

Для Альтер дополнительных изменений не требуется: адрес сайта, маршруты записей и оба индекса бота сохранены. Название репозитория и `ARCHIVE_BASE_URL` менять не нужно.

## Исходники и сборка

CSS и JS собираются из `src/css/` и `src/js/`:

```bash
python tools/build_css.py
python tools/build_js.py
python tools/check_archive.py
node --check assets/js/archive.js
node --test tools/test_client.cjs
```

Не редактируй `assets/css/archive.css` и `assets/js/archive.js` напрямую: это готовые файлы для сайта.

После изменения игровых материалов в `content/` выполни полную сборку:

```bash
python tools/build_archive.py
python tools/build_bot_mentions_index.py
python tools/build_bot_runtime_index.py
python tools/build_css.py
python tools/build_js.py
python tools/bump_cache_version.py
python tools/check_archive.py
node --test tools/test_client.cjs
```

Те же действия автоматически выполняются в GitHub Actions. Для локальных проверок нужны Python 3.11+ и Node.js 20+; у сайта нет серверных зависимостей.

`data/bot_runtime_index.json` — основной компактный индекс Альтер, `data/bot_mentions_index.json` — совместимый полный индекс. Оба нужны. `tools/check_bot_index.py` отдельно проверяет состав записей, адреса, поисковые связи и актуальность компактного индекса. Основной валидатор также запускает эту проверку.

Вспомогательные инструменты: `check_update_package.py` проверяет отдельно подготовленные пакеты обновлений; `prune_bot_index.py` пригоден для удаления карточек без пересборки поисковых правил. После него также нужно пересобрать компактный индекс и запустить проверку.

Подробности изменений и границы проверки — в `AUDIT.md`.
