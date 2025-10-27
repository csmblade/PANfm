# Docker Auto-Testing on Windows

This guide covers automated Docker testing after code changes on Windows.

## Prerequisites

1. **Docker Desktop for Windows** must be installed and running
2. **WSL 2 Backend** recommended for better performance
3. **PowerShell** (comes with Windows)
4. **Git Bash** (optional, for running bash scripts)

## Docker Desktop Configuration

### Enable WSL 2 Integration

1. Open Docker Desktop
2. Go to **Settings → General**
3. Enable "Use the WSL 2 based engine"
4. Go to **Settings → Resources → WSL Integration**
5. Enable integration with your WSL distros (if using WSL)

### Configure Resources

1. Go to **Settings → Resources → Advanced**
2. Recommended settings:
   - CPUs: At least 4
   - Memory: At least 4GB
   - Swap: 1GB
   - Disk image size: As needed

### File Sharing

1. Go to **Settings → Resources → File Sharing**
2. Ensure your project drive (S:) is shared
3. Apply & Restart if needed

## Auto-Testing Methods

### Method 1: PowerShell File Watcher (Recommended)

The `watch-and-test.ps1` script automatically runs Docker tests when files change.

#### Usage:

```powershell
# Smart mode: Rebuild + quick health check
.\watch-and-test.ps1

# Build only (faster)
.\watch-and-test.ps1 -BuildOnly

# Full test suite (slower but thorough)
.\watch-and-test.ps1 -FullTest
```

#### What it watches:
- `*.py` - All Python files
- `requirements.txt` - Dependencies
- `Dockerfile` - Container configuration
- `docker-compose.yml` - Compose configuration

#### What it does:
1. Detects file changes
2. Waits 5 seconds to debounce multiple rapid changes
3. Runs the appropriate test based on mode
4. Shows results in the terminal

#### To stop:
Press `Ctrl+C`

### Method 2: VSCode Tasks

Use VSCode's built-in task runner for manual or automated testing.

#### Available Tasks:

1. **Docker: Watch and Auto-Test** (Background task)
   - Runs the PowerShell watcher
   - Stays active while you work
   - Shows results in dedicated panel

2. **Docker: Build and Test**
   - Runs full `docker-test.sh` suite
   - Keyboard shortcut: `Ctrl+Shift+B` (if set as default)

3. **Docker: Quick Build**
   - Just rebuilds the image
   - Fast feedback

4. **Docker: Start Development**
   - Starts container with live reload
   - Uses volume mounts for instant changes

5. **Docker: Stop**
   - Stops all containers

#### Run Tasks:
- Press `Ctrl+Shift+P`
- Type "Tasks: Run Task"
- Select the task

### Method 3: Manual Testing

```powershell
# Full test suite
bash ./docker-test.sh

# Or on Windows with Git Bash
./docker-test.sh

# Quick build test
docker-compose build

# Start for development (with live reload)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Development Workflow

### Option A: With Auto-Watcher (Recommended for active development)

```powershell
# Terminal 1: Start the auto-watcher
.\watch-and-test.ps1

# Terminal 2: Your normal development
# Edit code, save files, watcher runs tests automatically
```

### Option B: Manual Testing

```powershell
# Make your changes
# Save files

# Run tests manually
bash ./docker-test.sh

# Or just rebuild
docker-compose build && docker-compose up -d
```

### Option C: Live Development Mode

```powershell
# Start container with volume mounts
docker-compose up -d

# Container automatically reloads when you save Python files
# Flask's debug mode handles hot reload

# View logs to see reload messages
docker-compose logs -f
```

## Troubleshooting

### PowerShell Execution Policy

If you get an execution policy error:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Docker Desktop Not Starting

1. Check if Hyper-V or WSL 2 is enabled
2. Restart Docker Desktop
3. Check Windows Services for "Docker Desktop Service"

### Port Already in Use

```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or change port in docker-compose.yml
# ports:
#   - "3001:3000"  # Use 3001 on host instead
```

### File Watching Not Working

1. Ensure Docker Desktop is running
2. Check file sharing settings in Docker Desktop
3. Verify the script has permissions to watch the directory
4. Try running PowerShell as Administrator

### Build Fails

```powershell
# Clean Docker cache
docker system prune -a

# Rebuild from scratch
docker-compose build --no-cache

# Check Docker Desktop logs
# Docker Desktop → Troubleshoot → Show logs
```

## Performance Tips

1. **Use WSL 2 Backend**: Much faster than Hyper-V
2. **Store Code in WSL**: If using WSL, store your code in WSL filesystem (not /mnt/c/)
3. **Exclude from Antivirus**: Add Docker Desktop and your project to Windows Defender exclusions
4. **Increase Resources**: Give Docker more CPU and RAM in settings
5. **Use .dockerignore**: Exclude unnecessary files from build context

## CI/CD Integration

For GitHub Actions or other CI/CD:

```yaml
# .github/workflows/docker-test.yml
name: Docker Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Docker Tests
        run: bash ./docker-test.sh
```

## Additional Resources

- [Docker Desktop Documentation](https://docs.docker.com/desktop/windows/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [WSL 2 Setup](https://docs.microsoft.com/en-us/windows/wsl/install)
