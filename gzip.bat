@echo off
setlocal ENABLEDELAYEDEXPANSION

echo ===========================================
echo IMPLEMENTACION AUTOMATICA - SOLUCION GZIP
echo ===========================================
echo.

REM --------------------------------------------------
REM Paso 0: verificar repositorio git
REM --------------------------------------------------
if not exist .git (
    echo [ERROR] No estas en un repositorio git
    echo Ejecuta primero: git init
    exit /b 1
)

echo [OK] Repositorio git detectado
echo.

REM --------------------------------------------------
REM Paso 1: Backups
REM --------------------------------------------------
echo Paso 1: Creando backups...

if exist liquidaciones.py (
    copy liquidaciones.py liquidaciones_original.py.bak >nul
    echo [OK] Backup de liquidaciones.py creado
)

if exist app.js (
    copy app.js app_original.js.bak >nul
    echo [OK] Backup de app.js creado
)

if exist index.html (
    copy index.html index_original.html.bak >nul
    echo [OK] Backup de index.html creado
)

echo.

REM --------------------------------------------------
REM Paso 2: Verificar archivo principal
REM --------------------------------------------------
echo Paso 2: Verificando archivos necesarios...

if not exist liquidaciones.py (
    echo [ERROR] liquidaciones.py no encontrado
    exit /b 1
)

echo [OK] liquidaciones.py encontrado
echo.

REM --------------------------------------------------
REM Paso 3: .gitignore
REM --------------------------------------------------
echo Paso 3: Configurando .gitignore...

(
echo # JSON sin comprimir
echo liquidaciones_db.json
echo liquidaciones.json
echo.
echo # Mantener comprimidos
echo !liquidaciones_db.json.gz
echo !*.json.gz
echo.
echo # Backups
echo *.bak
echo.
echo # Python
echo __pycache__/
echo *.py[cod]
echo venv/
echo .env
echo.
echo # IDEs
echo .vscode/
echo .idea/
echo .DS_Store
) > .gitignore

echo [OK] .gitignore configurado
echo.

REM --------------------------------------------------
REM Paso 4: Generar JSON comprimido
REM --------------------------------------------------
echo Paso 4: Generando JSON comprimido...
echo Esto puede tardar varios minutos...
echo.

py liquidaciones.py
if errorlevel 1 (
    echo [ERROR] Fallo al generar el JSON
    exit /b 1
)

echo.
echo [OK] JSON generado correctamente
echo.

REM --------------------------------------------------
REM Paso 5: Mostrar tamanos
REM --------------------------------------------------
if exist liquidaciones_db.json (
    for %%A in (liquidaciones_db.json) do echo JSON normal: %%~zA bytes
)

if exist liquidaciones_db.json.gz (
    for %%A in (liquidaciones_db.json.gz) do echo JSON comprimido: %%~zA bytes
)

echo.

REM --------------------------------------------------
REM Paso 6: Preparar Git
REM --------------------------------------------------
echo Paso 6: Preparando archivos para Git...

git add .gitignore
git add liquidaciones.py

if exist index.html git add index.html
if exist app.js git add app.js
if exist liquidaciones_db.json.gz git add liquidaciones_db.json.gz

echo [OK] Archivos agregados a staging
echo.

REM --------------------------------------------------
REM Resumen final
REM --------------------------------------------------
echo ===========================================
echo IMPLEMENTACION COMPLETADA
echo ===========================================
echo.
echo Proximos pasos:
echo 1. Revisar cambios: git status
echo 2. Commit:
echo    git commit -m "Optimizar: JSON comprimido con GZIP"
echo 3. Push:
echo    git push origin main
echo.

REM --------------------------------------------------
REM Verificar tamano (<100MB)
REM --------------------------------------------------
if exist liquidaciones_db.json.gz (
    for %%A in (liquidaciones_db.json.gz) do set SIZE=%%~zA
    set /a SIZEMB=!SIZE!/1024/1024

    if !SIZEMB! LSS 50 (
        echo [OK] Archivo comprimido !SIZEMB! MB - seguro para GitHub
    ) else if !SIZEMB! LSS 100 (
        echo [WARN] Archivo comprimido !SIZEMB! MB - GitHub puede advertir
    ) else (
        echo [ERROR] Archivo comprimido !SIZEMB! MB - usa Git LFS o chunks
    )
)

endlocal
