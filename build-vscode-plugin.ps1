# 윈도우 파워쉘 Set-ExecutionPolicy RemoteSigned
#!/usr/bin/env pwsh

$env:NODE_OPTIONS="--max-old-space-size=8192"
$artifactVersion = (& (Join-Path $PSScriptRoot "scripts\\sync-plugin-versions.ps1") | Select-Object -Last 1).Trim()
# 1. Navigate to gui and run npm run build
Write-Host "Building GUI..."
Set-Location -Path "gui"
Remove-Item -Path "dist\\*" -Recurse -Force -ErrorAction SilentlyContinue
npm run build
Set-Location -Path ".."

# 2. Build binary project
Write-Host "Installing dependencies for binary project..."
Set-Location -Path "binary"
Remove-Item -Path "out\\*" -Recurse -Force -ErrorAction SilentlyContinue
npm install
Write-Host "Building binary project..."
npm run build
Set-Location -Path ".."

# 3. Reset extensions\vscode\gui
Write-Host "Cleaning extensions\\vscode\\gui..."
$vscodeGuiPath = "extensions\\vscode\\gui"
Remove-Item -LiteralPath $vscodeGuiPath -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $vscodeGuiPath -Force | Out-Null

# 4. Copy gui/dist contents to extensions\vscode\gui
Write-Host "Copying GUI build artifacts..."
Copy-Item -Path "gui\\dist\\*" -Destination $vscodeGuiPath -Recurse -Force

# 5. Delete extensions\vscode\bin folder
Write-Host "Cleaning extensions\\vscode\\bin..."
Remove-Item -Path "extensions\\vscode\\bin" -Recurse -Force -ErrorAction SilentlyContinue

# 6. Create extensions\vscode\bin folder
Write-Host "Creating extensions\\vscode\\bin folder..."
New-Item -ItemType Directory -Path "extensions\\vscode\\bin" -Force

# 7. Copy binary build to extensions\vscode\bin
Write-Host "Copying binary build artifacts..."
Copy-Item -Path "binary\\bin\\*" -Destination "extensions\\vscode\\bin" -Recurse -Force

# 8. Delete extensions\vscode\out folder
Write-Host "Cleaning extensions\\vscode\\out..."
Remove-Item -Path "extensions\\vscode\\out" -Recurse -Force -ErrorAction SilentlyContinue

# 9. Navigate to extensions\vscode and build the extension
Write-Host "Building VS Code extension..."
Set-Location -Path "extensions\\vscode"

# Install dependencies if needed
Write-Host "Installing VS Code extension dependencies..."
npm install

# Build the extension
Write-Host "Compiling TypeScript..."
npm run esbuild

# Package the extension
Write-Host "Packaging VS Code extension..."
npm run package

$vsixArtifact = Get-ChildItem -Path ".\\build\\*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($null -ne $vsixArtifact) {
    $renamedVsix = "prometheus-vscode-$artifactVersion$($vsixArtifact.Extension)"
    Move-Item -Path $vsixArtifact.FullName -Destination (Join-Path $vsixArtifact.DirectoryName $renamedVsix) -Force
    Write-Host "Renamed VS Code artifact to $renamedVsix"
}

Set-Location -Path "..\\.."

Write-Host "VS Code plugin build script finished."
