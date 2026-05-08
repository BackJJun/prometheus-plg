#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"
$env:NODE_OPTIONS = "--max-old-space-size=8192"

function Assert-LastExitCode {
    param(
        [string]$StepName
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$StepName failed with exit code $LASTEXITCODE"
    }
}

function Assert-PathExists {
    param(
        [string]$PathToCheck,
        [string]$Description
    )

    if (-not (Test-Path -Path $PathToCheck)) {
        throw "$Description not found: $PathToCheck"
    }
}

function Remove-PathWithRetry {
    param(
        [string]$PathToRemove,
        [int]$MaxAttempts = 5,
        [int]$DelayMs = 1500
    )

    if (-not (Test-Path -Path $PathToRemove)) {
        return
    }

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            Remove-Item -Path $PathToRemove -Recurse -Force -ErrorAction Stop
            return
        } catch {
            if ($attempt -eq $MaxAttempts) {
                throw "Failed to remove locked path after $MaxAttempts attempts: $PathToRemove. Close IntelliJ sandbox, continue-binary.exe, and related node.exe processes, then retry."
            }
            Start-Sleep -Milliseconds $DelayMs
        }
    }
}

$artifactVersion = (& (Join-Path $PSScriptRoot "scripts\\sync-plugin-versions.ps1") | Select-Object -Last 1).Trim()

Write-Host "Building GUI..."
Set-Location -Path "gui"
Remove-Item -Path "dist\\*" -Recurse -Force -ErrorAction SilentlyContinue
npm run build
Assert-LastExitCode "GUI build"
Set-Location -Path ".."
Assert-PathExists "gui\\dist\\index.html" "GUI build artifact"

Write-Host "Installing dependencies for binary project..."
Set-Location -Path "binary"
Remove-PathWithRetry "out"
Remove-PathWithRetry "build"
Remove-PathWithRetry "bin"
Remove-PathWithRetry "tmp"
Remove-PathWithRetry "tree-sitter"
npm install
Assert-LastExitCode "Binary npm install"

Write-Host "Building binary project..."
npm run build
Assert-LastExitCode "Binary build"
Set-Location -Path ".."
Assert-PathExists "binary\\bin\\win32-x64\\continue-binary.exe" "Windows core binary"
Assert-PathExists "binary\\bin\\win32-x64\\rg.exe" "Windows ripgrep binary"

Write-Host "Cleaning extensions\\intellij\\src\\main\\resources\\webview..."
Remove-Item -Path "extensions\\intellij\\src\\main\\resources\\webview\\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Copying GUI build artifacts..."
Copy-Item -Path "gui\\dist\\*" -Destination "extensions\\intellij\\src\\main\\resources\\webview" -Recurse -Force

Write-Host "Cleaning extensions\\intellij\\build..."
$intellijBuildPaths = @(
    "extensions\\intellij\\build\\classes",
    "extensions\\intellij\\build\\distributions",
    "extensions\\intellij\\build\\generated",
    "extensions\\intellij\\build\\instrumented",
    "extensions\\intellij\\build\\kotlin",
    "extensions\\intellij\\build\\libs",
    "extensions\\intellij\\build\\reports",
    "extensions\\intellij\\build\\resources",
    "extensions\\intellij\\build\\tmp"
)
foreach ($path in $intellijBuildPaths) {
    Remove-PathWithRetry $path
}

Write-Host "Building IntelliJ plugin..."
Set-Location -Path "extensions\\intellij"
.\\gradlew buildPlugin
Assert-LastExitCode "IntelliJ plugin build"

$intellijArtifact = Get-ChildItem -Path ".\\build\\distributions\\*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($null -eq $intellijArtifact) {
    throw "IntelliJ plugin artifact was not created."
}

$renamedZip = "prometheus-intellij-$artifactVersion$($intellijArtifact.Extension)"
Move-Item -Path $intellijArtifact.FullName -Destination (Join-Path $intellijArtifact.DirectoryName $renamedZip) -Force
Write-Host "Renamed IntelliJ artifact to $renamedZip"

Set-Location -Path ".."
Write-Host "IntelliJ plugin build script finished."
