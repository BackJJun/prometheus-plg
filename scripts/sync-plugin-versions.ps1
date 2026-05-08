#!/usr/bin/env pwsh

$repoRoot = Split-Path -Parent $PSScriptRoot
$versionFile = Join-Path $repoRoot "plugin-version.txt"

if (-not (Test-Path -Path $versionFile)) {
    throw "plugin-version.txt file not found at $versionFile"
}

$version = (Get-Content -Path $versionFile -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($version)) {
    throw "plugin-version.txt file is empty."
}

function Update-FileContent {
    param(
        [string]$Path,
        [string]$Pattern,
        [string]$Replacement
    )

    $content = Get-Content -Path $Path -Raw
    if (-not [regex]::IsMatch($content, $Pattern)) {
        throw "Failed to find version pattern in $Path"
    }

    $updated = [regex]::Replace($content, $Pattern, $Replacement, 1)
    if ($updated -eq $content) {
        return
    }

    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $updated, $utf8NoBom)
}

$vscodePackageJson = Join-Path $repoRoot "extensions\\vscode\\package.json"
$intellijGradleProperties = Join-Path $repoRoot "extensions\\intellij\\gradle.properties"

Update-FileContent -Path $vscodePackageJson -Pattern '"version"\s*:\s*"[^"]+"' -Replacement "`"version`": `"$version`""
Update-FileContent -Path $intellijGradleProperties -Pattern "(?m)^pluginVersion=.*$" -Replacement "pluginVersion=$version"

Write-Host "Synced plugin versions to $version"
Write-Output $version
