@echo off
setlocal
title Publicar GeoCanarias
cd /d "%~dp0"

echo.
echo  =============================================
echo    GeoCanarias - Publicar en GitHub y Render
echo  =============================================
echo.
echo  La primera vez prepara todo para jugar online.
echo  Las siguientes veces sube tus cambios y Render actualiza el juego solo.
echo.

rem ---------------------------------------------------------------- 1. Git
where git >nul 2>nul
if errorlevel 1 goto sin_git

rem ---------------------------------------------------------------- 2. GitHub CLI
where gh >nul 2>nul
if not errorlevel 1 goto gh_ok
if exist "%ProgramFiles%\GitHub CLI\gh.exe" goto gh_ruta
echo [1/5] Instalando GitHub CLI, solo la primera vez...
winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements
:gh_ruta
set "PATH=%PATH%;%ProgramFiles%\GitHub CLI"
where gh >nul 2>nul
if errorlevel 1 goto sin_gh
:gh_ok

rem ---------------------------------------------------------------- 3. Sesion en GitHub
gh auth status >nul 2>nul
if not errorlevel 1 goto sesion_ok
echo [2/5] Hay que iniciar sesion en GitHub.
echo       Se abrira el navegador: copia el codigo que salga aqui y pegalo en la web.
echo       Si no tienes cuenta, puedes crearla gratis en esa misma pagina.
echo.
gh auth login --web --git-protocol https --hostname github.com
gh auth status >nul 2>nul
if errorlevel 1 goto sin_sesion
:sesion_ok
gh auth setup-git >nul 2>nul
set "USUARIO="
for /f "delims=" %%u in ('gh api user --jq .login') do set "USUARIO=%%u"
if not defined USUARIO goto sin_sesion
echo [2/5] Conectado a GitHub como %USUARIO%

rem ---------------------------------------------------------------- 4. Guardar cambios
git config user.name >nul 2>nul
if errorlevel 1 git config --global user.name "%USUARIO%"
git config user.email >nul 2>nul
if errorlevel 1 git config --global user.email "%USUARIO%@users.noreply.github.com"

if not exist ".git" git init -q
git branch -M main >nul 2>nul
git add -A
git diff --cached --quiet
if not errorlevel 1 goto sin_cambios
git commit -q -m "Actualizacion del %date% a las %time:~0,5%"
if errorlevel 1 goto error_commit
echo [3/5] Cambios guardados.
goto remoto
:sin_cambios
echo [3/5] No hay cambios nuevos que guardar.

rem ---------------------------------------------------------------- 5. Repositorio en GitHub
:remoto
set "PRIMERA_VEZ="
git remote get-url origin >nul 2>nul
if not errorlevel 1 goto subir

set "NOMBRE=geocanarias"
echo.
set /p "NOMBRE=Nombre del repositorio en GitHub [pulsa Enter para geocanarias]: "
echo.
echo Un repositorio publico permite publicar en Render con un solo clic.
echo Solo se ve el codigo del juego, nada de tu ordenador.
set "PUBLICO=S"
set /p "PUBLICO=Hacerlo publico? [S/n]: "
set "VISIBILIDAD=--public"
if /i "%PUBLICO%"=="n" set "VISIBILIDAD=--private"

gh repo view "%USUARIO%/%NOMBRE%" >nul 2>nul
if not errorlevel 1 goto repo_existe
gh repo create "%NOMBRE%" %VISIBILIDAD% --source=. --remote=origin --description "GeoGuessr de las Islas Canarias"
if errorlevel 1 goto error_repo
echo [4/5] Repositorio %USUARIO%/%NOMBRE% creado.
set "PRIMERA_VEZ=1"
goto subir

:repo_existe
echo [4/5] El repositorio %USUARIO%/%NOMBRE% ya existia: se usara ese.
git remote add origin "https://github.com/%USUARIO%/%NOMBRE%.git"
set "PRIMERA_VEZ=1"

rem ---------------------------------------------------------------- 6. Subir
:subir
echo [5/5] Subiendo a GitHub...
git push -u origin main
if errorlevel 1 goto error_push
set "URL="
for /f "delims=" %%r in ('gh repo view --json url --jq .url') do set "URL=%%r"

echo.
echo  =============================================
echo    Listo: %URL%
echo  =============================================
echo.
if defined PRIMERA_VEZ goto render
echo  Render actualizara el juego solo en unos minutos.
echo  Si todavia no lo habias publicado en Render, entra en:
echo  https://render.com/deploy?repo=%URL%
goto fin

:render
echo  Ahora se abre Render. Inicia sesion con tu cuenta de GitHub
echo  y pulsa "Deploy Blueprint". En unos minutos tendras tu direccion
echo  tipo https://geocanarias.onrender.com para compartir con quien quieras.
echo.
if "%VISIBILIDAD%"=="--private" echo  Como el repositorio es privado, Render te pedira permiso para leerlo en GitHub.
start "" "https://render.com/deploy?repo=%URL%"
goto fin

rem ---------------------------------------------------------------- errores
:sin_git
echo No encuentro git. Instalalo con este comando y vuelve a abrir este archivo:
echo    winget install --id Git.Git -e
goto fin

:sin_gh
echo No se pudo instalar GitHub CLI. Descargalo de https://cli.github.com y vuelve a abrir este archivo.
goto fin

:sin_sesion
echo No se ha podido iniciar sesion en GitHub. Vuelve a abrir este archivo para intentarlo de nuevo.
goto fin

:error_commit
echo No se pudieron guardar los cambios con git. Revisa el mensaje de arriba.
goto fin

:error_repo
echo No se pudo crear el repositorio en GitHub. Revisa el mensaje de arriba.
goto fin

:error_push
echo No se pudo subir a GitHub. Revisa tu conexion y el mensaje de arriba.
goto fin

:fin
echo.
pause
endlocal
