# archive

Интерактивный архив книг и предметов Библиотеки Лороведьмы.

## Сборка интерфейса

CSS и JS собираются из исходных модулей:

```bash
python tools/build_css.py
python tools/build_js.py
python tools/check_archive.py
```

Править напрямую `assets/css/archive.css` и `assets/js/archive.js` не нужно: это собранные файлы для GitHub Pages. Исходники лежат в `src/css/` и `src/js/`.
