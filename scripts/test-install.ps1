#Requires -Version 5.1
param([Parameter(Mandatory = $true)][string]$Binary)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$Binary = (Resolve-Path $Binary).Path
$version = 'v' + ((& $Binary --version) -replace '^lgtm ', '')
$temp = Join-Path ([IO.Path]::GetTempPath()) ('lgtm-installer-test-' + [Guid]::NewGuid())
$originalPath = $env:Path
$originalUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
try {
    New-Item -ItemType Directory -Path $temp | Out-Null
    $asset = "lgtm-$version-windows-x86_64.zip"
    $fixture = Join-Path $temp $asset
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::Open($fixture, [IO.Compression.ZipArchiveMode]::Create)
    try { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $Binary, 'lgtm.exe') | Out-Null } finally { $zip.Dispose() }
    $checksum = (Get-FileHash $fixture -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $asset
    $failureMode = ''
    # Shadow HTTP cmdlets so the real installer runs entirely offline.
    function Invoke-RestMethod {
        param($Uri, $Headers)
        if ($Uri -ne 'https://api.github.com/repos/test/lgtm/releases/latest') { throw "Unexpected URL: $Uri" }
        return @{ tag_name = $version }
    }
    function Invoke-WebRequest {
        param([switch]$UseBasicParsing, $Uri, $OutFile)
        if (-not $Uri.StartsWith("https://github.com/test/lgtm/releases/download/$version/")) { throw "Unexpected URL: $Uri" }
        if ($failureMode -eq 'download') { throw 'Simulated download failure' }
        if ($Uri.EndsWith('/SHA256SUMS')) {
            if ($failureMode -eq 'missing') { Set-Content -Path $OutFile -Value '' } else { Set-Content -Path $OutFile -Value $checksum }
        } elseif ($failureMode -eq 'corrupt') {
            Set-Content -Path $OutFile -Value 'corrupted'
        } else {
            Copy-Item $fixture $OutFile
        }
    }
    $destination = Join-Path $temp 'installation with spaces'
    & "$PSScriptRoot/install.ps1" -Repo 'test/lgtm' -InstallDir $destination -AddToPath
    & "$PSScriptRoot/install.ps1" -Repo 'test/lgtm' -Version $version -InstallDir $destination -AddToPath
    if (@(([Environment]::GetEnvironmentVariable('Path', 'User') -split ';') | Where-Object { $_ -eq $destination }).Count -ne 1) { throw 'PATH entry was not added exactly once' }
    $installed = Join-Path $destination 'lgtm.exe'
    $before = (Get-FileHash $installed -Algorithm SHA256).Hash
    foreach ($failureMode in @('corrupt', 'missing', 'download')) {
        $failed = $false
        try { & "$PSScriptRoot/install.ps1" -Repo 'test/lgtm' -Version $version -InstallDir $destination } catch { $failed = $true }
        if (-not $failed) { throw "Installer accepted $failureMode" }
        if ((Get-FileHash $installed -Algorithm SHA256).Hash -ne $before) { throw "Installer damaged the existing executable for $failureMode" }
        if (@(Get-ChildItem $destination -Filter '.lgtm-install-*').Count -ne 0) { throw 'Staged files were not cleaned up' }
    }
    Write-Output 'Windows installer tests passed'
} finally {
    $env:Path = $originalPath
    [Environment]::SetEnvironmentVariable('Path', $originalUserPath, 'User')
    if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
}
