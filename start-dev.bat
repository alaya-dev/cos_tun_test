@echo off
setlocal

set "PROJECT_DIR=C:\Users\HP OMEN\Desktop\mostql\cos_tun"

echo Starting Passion Cosmetic local development services...
echo Ensure XAMPP MariaDB and the Memurai service are running first.

start "Passion Cosmetic - Laravel" cmd /k "cd /d "%PROJECT_DIR%" && php artisan serve --host=127.0.0.1 --port=8000"
start "Passion Cosmetic - Vite" cmd /k "cd /d "%PROJECT_DIR%" && npm run dev"
start "Passion Cosmetic - Queue" cmd /k "cd /d "%PROJECT_DIR%" && php artisan queue:work redis --queue=high,meta,media,default,low --tries=3 --timeout=90"
start "Passion Cosmetic - Scheduler" cmd /k "cd /d "%PROJECT_DIR%" && php artisan schedule:work"

echo.
echo Services started:
echo   Storefront: http://127.0.0.1:8000
echo   Admin shell: http://127.0.0.1:8000/admin
echo   Vite: http://127.0.0.1:5173
endlocal
