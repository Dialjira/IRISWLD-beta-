# Prepara la carpeta del proyecto «Cuadrantes Belén» en el PC de Diego.
# Uso: clic derecho → «Ejecutar con PowerShell»  (o doble clic en instalar-mapas-police.bat)
# Es seguro repetirlo: si algo ya existe, lo actualiza en vez de borrarlo.

$ErrorActionPreference = 'Stop'
$Root   = Join-Path $env:USERPROFILE 'Downloads\MAPAS POLICE'
$Repo   = Join-Path $Root 'IRISWLD-beta-'
$App    = Join-Path $Repo 'app-cuadrantes'
$Rama   = 'ccr-911125b8-sxviui'
$Url    = 'https://github.com/Dialjira/IRISWLD-beta-.git'

function Paso($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "   OK  $t" -ForegroundColor Green }
function Ojo($t)  { Write-Host "   !!  $t" -ForegroundColor Yellow }
function Tiene($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Paso "Carpetas en $Root"
foreach ($d in @('', 'firma', 'datos-privados', 'datos-fuente', 'entregas')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Root $d) | Out-Null
}
Ok 'firma\  datos-privados\  datos-fuente\  entregas\'

Paso 'Programas necesarios'
$faltan = @()
if (-not (Tiene git))  { $faltan += @{n='Git';      id='Git.Git'} }
if (-not (Tiene node)) { $faltan += @{n='Node.js';  id='OpenJS.NodeJS.LTS'} }
if (-not (Tiene java)) { $faltan += @{n='Java 21';  id='Microsoft.OpenJDK.21'} }
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
if (-not (Test-Path $sdk)) { $faltan += @{n='Android Studio (trae el SDK)'; id='Google.AndroidStudio'} }
if ($faltan.Count) {
  foreach ($f in $faltan) { Ojo "Falta $($f.n)  →  winget install --id $($f.id) -e" }
  if (Tiene winget) {
    $r = Read-Host '¿Instalarlos ahora con winget? (s/n)'
    if ($r -match '^[sS]') {
      foreach ($f in $faltan) { winget install --id $f.id -e --accept-source-agreements --accept-package-agreements }
      Ojo 'Cierra y vuelve a abrir PowerShell, y ejecuta este script otra vez.'
      if ($faltan.n -contains 'Android Studio (trae el SDK)') { Ojo 'Abre Android Studio una vez para que descargue el SDK (Android 15 / API 35).' }
      Read-Host 'Enter para salir'; exit
    }
  }
} else { Ok 'Git, Node.js, Java y Android SDK encontrados' }

Paso 'Código del proyecto'
if (Test-Path (Join-Path $Repo '.git')) {
  git -C $Repo fetch origin $Rama
  git -C $Repo checkout $Rama
  git -C $Repo pull --ff-only origin $Rama
  Ok "Actualizado: $Repo"
} elseif (Tiene git) {
  git clone --branch $Rama $Url $Repo
  Ok "Clonado en $Repo"
} else { Ojo 'Sin Git no se puede descargar el código. Instálalo y repite.'; Read-Host 'Enter'; exit }

Paso 'Dependencias de la app'
Push-Location $App
if (Tiene node) {
  npm ci
  npm run vendor
  npm test
  Ok 'Dependencias instaladas y pruebas del buscador en verde'
}
Pop-Location

Paso 'Android: SDK y firma'
if (Test-Path $sdk) {
  ("sdk.dir=" + ($sdk -replace '\\', '/')) | Set-Content -Encoding ASCII (Join-Path $App 'android\local.properties')
  Ok "local.properties → $sdk"
}
$jks = Join-Path $Root 'firma\cuadrantes-belen.jks'
$ksp = Join-Path $App 'android\keystore.properties'
if (Test-Path $jks) {
  if (-not (Test-Path $ksp)) {
    $sec = Read-Host 'Contraseña de la llave (está en firma\LEEME-FIRMA.txt)' -AsSecureString
    $pw  = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    @("storeFile=" + ($jks -replace '\\', '/'), "storePassword=$pw", 'keyAlias=cuadrantes', "keyPassword=$pw") |
      Set-Content -Encoding ASCII $ksp
    Ok 'keystore.properties creado (no se sube a GitHub)'
  } else { Ok 'keystore.properties ya existe' }
} else {
  Ojo "Copia cuadrantes-belen.jks y LEEME-FIRMA.txt a: $(Join-Path $Root 'firma')  y vuelve a ejecutar."
  Ojo 'Sin la llave, la APK no se podrá instalar encima de la versión que ya tienes en el celular.'
}

Paso 'Skill y accesos directos'
$skillSrc = Join-Path $Repo '.claude\skills\cuadrantes-belen'
$skillDst = Join-Path $env:USERPROFILE '.claude\skills\cuadrantes-belen'
New-Item -ItemType Directory -Force -Path $skillDst | Out-Null
Copy-Item -Force (Join-Path $skillSrc 'SKILL.md') $skillDst
Ok "Skill copiada a $skillDst (Claude Code la encuentra desde cualquier carpeta)"
Copy-Item -Force (Join-Path $App 'tools\windows\CLAUDE.md') (Join-Path $Root 'CLAUDE.md')
Copy-Item -Force (Join-Path $App 'tools\windows\compilar-apk.bat') (Join-Path $Root 'compilar-apk.bat')
Ok 'CLAUDE.md y compilar-apk.bat en la carpeta del proyecto'

Paso 'Listo'
Write-Host "   Carpeta del proyecto: $Root"
Write-Host '   Para trabajar con Claude Code:  cd "%USERPROFILE%\Downloads\MAPAS POLICE"  y luego  claude'
Write-Host '   Para generar la APK: doble clic en compilar-apk.bat (queda en entregas\)'
Start-Process explorer.exe $Root
Read-Host 'Enter para cerrar'
