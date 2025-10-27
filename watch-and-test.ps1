# Docker Auto-Test Watcher for Windows
# Watches for file changes and automatically runs Docker tests

param(
    [switch]$BuildOnly,
    [switch]$FullTest
)

Write-Host "======================================"
Write-Host "PANfm Docker Auto-Test Watcher"
Write-Host "======================================"
Write-Host ""
Write-Host "Watching for changes in:"
Write-Host "  - *.py files"
Write-Host "  - requirements.txt"
Write-Host "  - Dockerfile"
Write-Host "  - docker-compose.yml"
Write-Host ""
Write-Host "Press Ctrl+C to stop watching"
Write-Host ""

# Track last run time to debounce rapid changes
$script:lastRunTime = Get-Date
$script:debounceSeconds = 5

function Run-DockerTest {
    param([string]$changedFile)

    $currentTime = Get-Date
    $timeSinceLastRun = ($currentTime - $script:lastRunTime).TotalSeconds

    # Debounce: Only run if at least 5 seconds have passed
    if ($timeSinceLastRun -lt $script:debounceSeconds) {
        Write-Host "  (Debounced - waiting for more changes...)" -ForegroundColor Yellow
        return
    }

    $script:lastRunTime = $currentTime

    Write-Host ""
    Write-Host "======================================"
    Write-Host "Change detected: $changedFile"
    Write-Host "Running Docker tests..."
    Write-Host "======================================"
    Write-Host ""

    if ($BuildOnly) {
        # Quick build test only
        Write-Host "Running quick build test..." -ForegroundColor Cyan
        docker-compose build
    }
    elseif ($FullTest) {
        # Full test suite
        Write-Host "Running full test suite..." -ForegroundColor Cyan
        & ".\docker-test.sh"
    }
    else {
        # Smart test: rebuild and quick health check
        Write-Host "Running smart rebuild and health check..." -ForegroundColor Cyan

        # Rebuild the image
        Write-Host "`n1. Rebuilding Docker image..." -ForegroundColor Yellow
        docker-compose build

        if ($LASTEXITCODE -eq 0) {
            Write-Host "   Success: Build successful" -ForegroundColor Green

            # Quick health check
            Write-Host "`n2. Quick health check..." -ForegroundColor Yellow
            docker-compose up -d
            Start-Sleep -Seconds 5

            $running = docker ps --filter "name=panfm" --format "{{.Names}}"
            if ($running -match "panfm") {
                Write-Host "   Success: Container started successfully" -ForegroundColor Green

                # Test HTTP response
                try {
                    $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5
                    Write-Host "   Success: Application responding (HTTP $($response.StatusCode))" -ForegroundColor Green
                }
                catch {
                    Write-Host "   Error: Application not responding" -ForegroundColor Red
                }

                docker-compose down
            }
            else {
                Write-Host "   Error: Container failed to start" -ForegroundColor Red
                docker-compose logs --tail=10
                docker-compose down
            }
        }
        else {
            Write-Host "   Error: Build failed" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "Waiting for changes..." -ForegroundColor Cyan
}

# Create file system watcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $PSScriptRoot
$watcher.Filter = "*.*"
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

# Define file patterns to watch
$watchPatterns = @("*.py", "requirements.txt", "Dockerfile", "docker-compose.yml")

# Register event handlers
$action = {
    $path = $Event.SourceEventArgs.FullPath
    $changeType = $Event.SourceEventArgs.ChangeType
    $fileName = Split-Path $path -Leaf

    # Check if file matches our watch patterns
    $shouldProcess = $false
    foreach ($pattern in $watchPatterns) {
        if ($fileName -like $pattern) {
            $shouldProcess = $true
            break
        }
    }

    # Skip certain directories
    if ($path -match "\\(venv|__pycache__|\.git|\.vscode|node_modules)\\") {
        $shouldProcess = $false
    }

    if ($shouldProcess) {
        Write-Host "[$changeType] $fileName" -ForegroundColor Yellow
        Run-DockerTest -changedFile $fileName
    }
}

# Register the events
$handlers = @()
$handlers += Register-ObjectEvent -InputObject $watcher -EventName "Changed" -Action $action
$handlers += Register-ObjectEvent -InputObject $watcher -EventName "Created" -Action $action
$handlers += Register-ObjectEvent -InputObject $watcher -EventName "Renamed" -Action $action

# Keep script running
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
}
finally {
    # Cleanup on exit
    Write-Host "`nStopping watcher..." -ForegroundColor Yellow
    $watcher.EnableRaisingEvents = $false
    $handlers | ForEach-Object { Unregister-Event -SourceIdentifier $_.Name }
    $watcher.Dispose()
    Write-Host "Watcher stopped." -ForegroundColor Green
}
