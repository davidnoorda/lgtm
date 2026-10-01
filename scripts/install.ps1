#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Repo = $env:LGTM_REPO,
    [string]$Version = 'latest',
    [string]$InstallDir = $(if ($env:LGTM_INSTALL_DIR) { $env:LGTM_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\lgtm\bin' }),
    [switch]$AddToPath
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This installer supports Windows. Use install.sh on Linux/macOS.' }
if ($Repo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'Set -Repo OWNER/REPO (or LGTM_REPO).' }
if ([string]::IsNullOrWhiteSpace($InstallDir)) { throw 'Installation directory cannot be empty.' }
$arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($arch -ne 'AMD64') { throw 'The Windows release currently supports x86_64 only.' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Install Git for Windows first: https://git-scm.com/download/win' }
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
if ($Version -eq 'latest') {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ 'User-Agent' = 'lgtm-installer' }
    $Version = $release.tag_name
}
if ($Version -cnotmatch '^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$') { throw 'Version must be a tag such as v0.1.0.' }
$asset = "lgtm-$Version-windows-x86_64.zip"
$base = "https://github.com/$Repo/releases/download/$Version"
$temp = Join-Path ([IO.Path]::GetTempPath()) ('lgtm-install-' + [Guid]::NewGuid())
$staged = $null
try {
    New-Item -ItemType Directory -Path $temp | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile (Join-Path $temp $asset)
    Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS" -OutFile (Join-Path $temp 'SHA256SUMS')
    $lines = @(Get-Content (Join-Path $temp 'SHA256SUMS') | Where-Object { $_ -match ('^[0-9a-fA-F]{64}  ' + [regex]::Escape($asset) + '$') })
    if ($lines.Count -ne 1) { throw "Missing or invalid checksum for $asset" }
    $expected = $lines[0].Substring(0, 64)
    $actual = (Get-FileHash -Algorithm SHA256 -Path (Join-Path $temp $asset)).Hash
    if ($actual -ine $expected) { throw 'Checksum mismatch; existing installation unchanged.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead((Join-Path $temp $asset))
    try {
        $entries = @($archive.Entries | Where-Object { $_.FullName -ceq 'lgtm.exe' })
        if ($entries.Count -ne 1) { throw 'Archive must contain exactly one lgtm.exe.' }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0], (Join-Path $temp 'lgtm.exe'))
    } finally { $archive.Dispose() }
    $output = & (Join-Path $temp 'lgtm.exe') --version
    if ($LASTEXITCODE -ne 0 -or $output -cne "lgtm $($Version.Substring(1))") { throw 'Downloaded executable has an unexpected version or cannot run.' }
    $InstallDir = [IO.Path]::GetFullPath($InstallDir)
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    $staged = Join-Path $InstallDir ('.lgtm-install-' + [Guid]::NewGuid() + '.exe')
    Copy-Item (Join-Path $temp 'lgtm.exe') $staged
    $destination = Join-Path $InstallDir 'lgtm.exe'
    if (Test-Path $destination) {
        # Atomic replacement; a running executable may prevent it, leaving the old file intact.
        [IO.File]::Replace($staged, $destination, [System.Management.Automation.Language.NullString]::Value)
    } else {
        [IO.File]::Move($staged, $destination)
    }
    $staged = $null
    if ($AddToPath) {
        $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        $parts = @($userPath -split ';' | Where-Object { $_ })
        if ($parts -notcontains $InstallDir) {
            [Environment]::SetEnvironmentVariable('Path', (($parts + $InstallDir) -join ';'), 'User')
        }
        if (($env:Path -split ';') -notcontains $InstallDir) { $env:Path += ";$InstallDir" }
        Write-Output 'PATH updated for this session and future terminals.'
    } elseif (($env:Path -split ';') -notcontains $InstallDir) {
        Write-Output "Add $InstallDir to PATH, or rerun with -AddToPath."
    }
    Write-Output "Installed $Version to $destination"
} finally {
    if ($staged -and (Test-Path $staged)) { Remove-Item -Force $staged }
    if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
}
