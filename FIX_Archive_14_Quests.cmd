@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 goto :wrongfolder
if not exist "index.html" goto :wrongfolder
if not exist "tools\build_archive.py" goto :wrongfolder
if not exist "content\stories\quests\world_quests\" goto :wrongfolder
set "removed=0"
set "failed=0"
echo Удаление 14 ранее исключённых заданий мира.
echo Другие карточки, изображения и код не изменяются.
echo.
call :remove "content\stories\quests\world_quests\quest_wq_10156.md"
call :remove "content\stories\quests\world_quests\quest_wq_72238.md"
call :remove "content\stories\quests\world_quests\quest_wq_72240.md"
call :remove "content\stories\quests\world_quests\quest_wq_73071.md"
call :remove "content\stories\quests\world_quests\quest_wq_73077.md"
call :remove "content\stories\quests\world_quests\quest_wq_73098.md"
call :remove "content\stories\quests\world_quests\quest_wq_73229.md"
call :remove "content\stories\quests\world_quests\quest_wq_73319.md"
call :remove "content\stories\quests\world_quests\quest_wq_74012.md"
call :remove "content\stories\quests\world_quests\quest_wq_74014.md"
call :remove "content\stories\quests\world_quests\quest_wq_74054.md"
call :remove "content\stories\quests\world_quests\quest_wq_75064.md"
call :remove "content\stories\quests\world_quests\quest_wq_76087.md"
call :remove "content\stories\quests\world_quests\quest_wq_76660.md"
call :remove "data\stories\quest_wq_10156.json"
call :remove "data\stories\quest_wq_72238.json"
call :remove "data\stories\quest_wq_72240.json"
call :remove "data\stories\quest_wq_73071.json"
call :remove "data\stories\quest_wq_73077.json"
call :remove "data\stories\quest_wq_73098.json"
call :remove "data\stories\quest_wq_73229.json"
call :remove "data\stories\quest_wq_73319.json"
call :remove "data\stories\quest_wq_74012.json"
call :remove "data\stories\quest_wq_74014.json"
call :remove "data\stories\quest_wq_74054.json"
call :remove "data\stories\quest_wq_75064.json"
call :remove "data\stories\quest_wq_76087.json"
call :remove "data\stories\quest_wq_76660.json"
echo.
echo Удалено файлов: %removed%
if not "%failed%"=="0" goto :failed
echo Готово. Сохрани удаления в Git и отправь изменения в GitHub.
echo GitHub Actions заново соберёт каталоги.
echo Этот CMD-файл после запуска можно удалить.
popd
pause
exit /b 0
:remove
if not exist "%~1" exit /b 0
del /q "%~1"
if exist "%~1" (
  echo Не удалось удалить: %~1
  set /a failed+=1 >nul
) else (
  echo Удалено: %~1
  set /a removed+=1 >nul
)
exit /b 0
:wrongfolder
echo Помести этот файл в корень проекта archive, рядом с index.html, и запусти снова.
pause
exit /b 1
:failed
echo Не все файлы удалось удалить. Закрой приложения, использующие их, и запусти снова.
popd
pause
exit /b 1
