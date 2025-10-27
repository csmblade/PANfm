# Docker Development Workflow

## Quick Reference

After making code changes, restart Docker to see the changes:

### Windows (Recommended)
```cmd
# Full restart (clears volumes - clean state)
restart-docker.bat

# Quick restart (keeps data - faster)
quick-restart.bat
```

### Linux/Mac/Git Bash
```bash
# Full restart (clears volumes - clean state)
./restart-docker.sh

# Quick restart (keeps data - faster)
docker-compose restart
```

---

## Restart Scripts

### Full Restart: `restart-docker.bat` / `restart-docker.sh`

**When to use:**
- After significant code changes
- When you want a clean state
- After changing dependencies
- After modifying Dockerfile or docker-compose.yml
- When troubleshooting issues

**What it does:**
1. Stops all containers
2. Removes volumes (`-v` flag) - **clears all data**
3. Rebuilds images with latest code
4. Starts containers fresh
5. Shows logs to verify startup

**Important:** This **removes all volumes**, which means:
- settings.json will be reset
- devices.json will be reset
- debug.log will be cleared
- encryption.key will be regenerated (breaking encrypted data)

**Data Loss:** Yes - all runtime data cleared

**Speed:** Slower (~30-60 seconds)

---

### Quick Restart: `quick-restart.bat`

**When to use:**
- Minor code changes (routes, templates, JavaScript)
- When you want to keep existing data
- Frequent restarts during development
- When testing with existing devices/settings

**What it does:**
1. Restarts containers (keeps volumes)
2. Reloads code changes
3. Preserves all data

**Data Loss:** No - keeps settings, devices, logs

**Speed:** Fast (~5-10 seconds)

---

## Development Workflow

### Typical Development Cycle

```
1. Make code changes
   ↓
2. Save files
   ↓
3. Run quick-restart.bat  (or restart-docker.bat if needed)
   ↓
4. Test changes in browser (http://localhost:3000)
   ↓
5. Check logs if issues: docker-compose logs -f
   ↓
6. Repeat from step 1
```

---

## Docker Commands Cheat Sheet

### View Logs
```bash
# Follow logs in real-time
docker-compose logs -f

# Last 50 lines
docker-compose logs --tail=50

# Specific service only
docker-compose logs -f panfm
```

### Container Management
```bash
# Check running containers
docker ps

# Stop containers (keeps volumes)
docker-compose stop

# Start stopped containers
docker-compose start

# Restart containers (keeps volumes)
docker-compose restart

# Stop and remove containers (keeps volumes)
docker-compose down

# Stop and remove containers + volumes (clean slate)
docker-compose down -v
```

### Build and Start
```bash
# Build and start in background
docker-compose up -d

# Build and start with rebuild
docker-compose up -d --build

# Build without starting
docker-compose build

# Force rebuild (no cache)
docker-compose build --no-cache
```

### Troubleshooting
```bash
# Enter running container
docker-compose exec panfm /bin/bash

# Check container resource usage
docker stats

# Remove all stopped containers
docker container prune

# Remove unused images
docker image prune

# Remove everything (containers, images, volumes)
docker system prune -a --volumes
```

---

## File Persistence

### What Gets Preserved Between Restarts?

**With `quick-restart.bat` or `docker-compose restart`:**
- ✅ settings.json
- ✅ devices.json
- ✅ auth.json
- ✅ encryption.key
- ✅ debug.log
- ✅ All persistent data

**With `restart-docker.bat` or `docker-compose down -v`:**
- ❌ All volumes removed
- ❌ All runtime data lost
- ✅ Source code preserved (mounted from host)

---

## Automatic Restart After Code Changes

**Current setup:** Manual restart required after code changes.

**To automate:** Use a file watcher:

### Option 1: PowerShell Watch Script
The `watch-and-test.ps1` script can be extended to restart Docker on changes.

### Option 2: Docker Compose Watch (Docker Compose 2.22+)
Add to docker-compose.yml:
```yaml
services:
  panfm:
    develop:
      watch:
        - action: rebuild
          path: ./
          ignore:
            - venv/
            - __pycache__/
```

Then run: `docker-compose watch`

---

## Best Practices

1. **Quick iterations:** Use `quick-restart.bat` during active development
2. **Clean state testing:** Use `restart-docker.bat` periodically to test fresh installs
3. **Check logs:** Always check `docker-compose logs` if something doesn't work
4. **Backup data:** Before `docker-compose down -v`, backup important files
5. **Keep Docker running:** Ensure Docker Desktop is running before executing scripts

---

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs --tail=50

# Check if port 3000 is in use
netstat -ano | findstr :3000

# Force clean restart
docker-compose down -v
docker-compose up -d --build
```

### Changes not reflecting
1. Verify you saved the files
2. Try `docker-compose restart` instead of `start`
3. Try full rebuild: `docker-compose up -d --build`
4. Check if changes are in mounted directory
5. Verify docker-compose.yml volume mounts

### Out of disk space
```bash
# Clean up unused images and containers
docker system prune -a

# Clean up volumes (WARNING: deletes data)
docker volume prune
```

---

## Integration with Development Tools

### VSCode Tasks
The `.vscode/tasks.json` includes Docker tasks:
- `Ctrl+Shift+P` → "Tasks: Run Task" → Select Docker task

### Watch Scripts
Use `watch-and-test.ps1` for automated Docker rebuilds on file changes.

---

**Remember:** After each coding session, run the appropriate restart script to see your changes!
