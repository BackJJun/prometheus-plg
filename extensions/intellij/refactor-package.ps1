# IntelliJ Package Refactoring Script
# Changes: com.github.continuedev.continueintellijextension -> com.github.crux.prometheus

$baseDir = "d:\temp\crux-continue-custom\extensions\intellij"
$oldPackage = "com.github.continuedev.continueintellijextension"
$newPackage = "com.github.crux.prometheus"
$oldPath = "com\github\continuedev\continueintellijextension"
$newPath = "com\github\crux\prometheus"

Write-Host "=== IntelliJ Package Refactoring ===" -ForegroundColor Cyan

# Step 1: Update all .kt files - package declarations and imports
Write-Host "`n[1/4] Updating Kotlin files..." -ForegroundColor Yellow
$ktFiles = Get-ChildItem -Path "$baseDir\src" -Recurse -Filter "*.kt"
foreach ($file in $ktFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $newContent = $content -replace [regex]::Escape($oldPackage), $newPackage
    if ($content -ne $newContent) {
        Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8 -NoNewline
        Write-Host "  Updated: $($file.Name)"
    }
}

# Step 2: Update XML files
Write-Host "`n[2/4] Updating XML files..." -ForegroundColor Yellow
$xmlFiles = Get-ChildItem -Path "$baseDir\src\main\resources\META-INF" -Filter "*.xml"
foreach ($file in $xmlFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $newContent = $content -replace [regex]::Escape($oldPackage), $newPackage
    if ($content -ne $newContent) {
        Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8 -NoNewline
        Write-Host "  Updated: $($file.Name)"
    }
}

# Step 3: Update gradle.properties
Write-Host "`n[3/4] Updating gradle.properties..." -ForegroundColor Yellow
$gradleProps = "$baseDir\gradle.properties"
$content = Get-Content $gradleProps -Raw -Encoding UTF8
$newContent = $content -replace [regex]::Escape($oldPackage), $newPackage
Set-Content -Path $gradleProps -Value $newContent -Encoding UTF8 -NoNewline
Write-Host "  Updated: gradle.properties"

# Step 4: Move directories
Write-Host "`n[4/4] Moving directories..." -ForegroundColor Yellow

# Main source
$oldMainDir = "$baseDir\src\main\kotlin\$oldPath"
$newMainDir = "$baseDir\src\main\kotlin\$newPath"
if (Test-Path $oldMainDir) {
    # Create new directory structure
    $parentDir = Split-Path $newMainDir -Parent
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    # Move content
    Move-Item -Path $oldMainDir -Destination $newMainDir -Force
    Write-Host "  Moved main source to: $newPath"
    
    # Clean up empty parent directories
    $cleanupDir = "$baseDir\src\main\kotlin\com\github\continuedev"
    if (Test-Path $cleanupDir) {
        Remove-Item -Path $cleanupDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Test source
$oldTestDir = "$baseDir\src\test\kotlin\$oldPath"
$newTestDir = "$baseDir\src\test\kotlin\$newPath"
if (Test-Path $oldTestDir) {
    $parentDir = Split-Path $newTestDir -Parent
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    Move-Item -Path $oldTestDir -Destination $newTestDir -Force
    Write-Host "  Moved test source to: $newPath"
    
    $cleanupDir = "$baseDir\src\test\kotlin\com\github\continuedev"
    if (Test-Path $cleanupDir) {
        Remove-Item -Path $cleanupDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Test integration source
$oldTestIntDir = "$baseDir\src\testIntegration\kotlin\$oldPath"
$newTestIntDir = "$baseDir\src\testIntegration\kotlin\$newPath"
if (Test-Path $oldTestIntDir) {
    $parentDir = Split-Path $newTestIntDir -Parent
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    Move-Item -Path $oldTestIntDir -Destination $newTestIntDir -Force
    Write-Host "  Moved testIntegration source to: $newPath"
    
    $cleanupDir = "$baseDir\src\testIntegration\kotlin\com\github\continuedev"
    if (Test-Path $cleanupDir) {
        Remove-Item -Path $cleanupDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "`n=== Refactoring Complete ===" -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "1. Run: ./gradlew clean buildPlugin"
Write-Host "2. Install the new plugin"
