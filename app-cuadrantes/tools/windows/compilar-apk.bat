@echo off
rem Compila la APK firmada de Cuadrantes Belen y la deja en entregas\
setlocal
set "ROOT=%~dp0"
set "APP=%ROOT%IRISWLD-beta-\app-cuadrantes"
if not exist "%APP%\package.json" (
  echo No encuentro la app en "%APP%". Ejecuta primero instalar-mapas-police.ps1
  pause & exit /b 1
)
if not exist "%APP%\android\keystore.properties" (
  echo Falta la firma: copia cuadrantes-belen.jks a "%ROOT%firma" y ejecuta instalar-mapas-police.ps1
  pause & exit /b 1
)
pushd "%APP%"
call npm test || goto :error
call npm run vendor || goto :error
call npx cap sync android || goto :error
pushd android
call gradlew.bat assembleRelease || goto :error
popd
for /f "tokens=2 delims=: " %%v in ('findstr /c:"versionName" android\app\build.gradle') do set "VER=%%~v"
set "VER=%VER:"=%"
copy /y "android\app\build\outputs\apk\release\app-release.apk" "%ROOT%entregas\CuadrantesBelen-%VER%.apk" >nul
popd
echo.
echo Listo: "%ROOT%entregas\CuadrantesBelen-%VER%.apk"
explorer "%ROOT%entregas"
pause
exit /b 0
:error
echo.
echo Algo fallo. Copia el mensaje de arriba y pegaselo a Claude.
pause
exit /b 1
