# Docker Access Troubleshooting Guide

## Issue: Cannot Access Application After v2.2 Security Update

After the v2.2 security hardening update, authentication is now required for all access to PANfm.

## Quick Fix

### Step 1: Start Docker
Docker Desktop needs to be running:
- Open Docker Desktop application
- Wait for it to fully start (whale icon should be steady, not animated)

### Step 2: Restart the Container
```bash
# Stop existing container
docker-compose down

# Start with fresh build
docker-compose up -d --build

# View logs
docker-compose logs -f
```

### Step 3: Access the Application
1. Open browser to: http://localhost:3000
2. You should see the **login page** (NEW in v2.2)
3. Use default credentials:
   - **Username:** `admin`
   - **Password:** `admin`
4. **IMPORTANT:** You will be prompted to change the password on first login

## Common Issues & Solutions

### Issue: "Cannot connect to the Docker daemon"
**Cause:** Docker Desktop is not running

**Solution:**
1. Open Docker Desktop
2. Wait for it to start completely
3. Try again: `docker-compose up -d`

### Issue: "Connection refused" or "Cannot access localhost:3000"
**Cause:** Container not running or port conflict

**Solution:**
```bash
# Check if container is running
docker ps

# Check container logs
docker-compose logs panfm

# Check if port 3000 is in use
lsof -i :3000

# Restart container
docker-compose restart
```

### Issue: "Blank page" or "No response"
**Cause:** Container may be starting up or crashed

**Solution:**
```bash
# Check logs for errors
docker-compose logs panfm

# Look for Python errors or authentication issues
# Container should show: "Running on http://0.0.0.0:3000"
```

### Issue: "Authentication required" or redirects to /login
**Cause:** This is EXPECTED behavior after v2.2 update!

**Solution:**
This is the new authentication system working correctly:
1. Navigate to http://localhost:3000
2. You'll be redirected to login page
3. Use credentials: admin/admin
4. Change password when prompted

### Issue: "CSRF token missing or invalid"
**Cause:** Session/cookie issue or cached old page

**Solution:**
1. Clear browser cache and cookies for localhost:3000
2. Hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+F5 on Windows)
3. Try incognito/private browsing mode
4. Ensure JavaScript is enabled

### Issue: Container starts but crashes immediately
**Cause:** Missing dependencies or encryption key issues

**Solution:**
```bash
# Rebuild with no cache
docker-compose build --no-cache

# Check logs for specific error
docker-compose logs panfm

# Common errors:
# - "encryption.key not found" - Normal on first run, will auto-generate
# - "auth.json not found" - Normal on first run, will auto-create
# - "ModuleNotFoundError" - Rebuild container with --no-cache
```

## Complete Docker Restart Process

If all else fails, do a complete restart:

```bash
# Stop everything
docker-compose down

# Remove old containers and images (CAREFUL - removes all PANfm data!)
docker-compose down -v
docker rmi panfm-panfm

# Rebuild from scratch
docker-compose up -d --build

# Watch logs
docker-compose logs -f panfm
```

**WARNING:** Using `docker-compose down -v` will delete volumes and you'll lose:
- encryption.key (cannot decrypt existing devices/settings)
- auth.json (lose admin password - will reset to admin/admin)
- settings.json
- devices.json

Backup these files before running if you want to preserve data!

## Accessing the Login Page

After v2.2, the application flow is:

1. **Navigate to:** http://localhost:3000
2. **Redirected to:** http://localhost:3000/login (login page)
3. **Enter credentials:** admin / admin
4. **Change password** (forced on first login)
5. **Redirected to:** http://localhost:3000 (main dashboard)

## Verifying Container is Working

```bash
# Check container is running
docker ps | grep panfm
# Should show: panfm, Up X minutes, 0.0.0.0:3000->3000/tcp

# Check logs show successful startup
docker-compose logs panfm | tail -20
# Should show: "Running on http://0.0.0.0:3000"

# Test health endpoint (bypasses auth)
curl http://localhost:3000/api/health
# Should return: {"status":"ok","timestamp":"..."}

# Test if main page redirects to login
curl -I http://localhost:3000
# Should return: HTTP/1.1 302 FOUND
# Location: /login
```

## Environment Variables for Docker

By default, Docker uses development configuration from docker-compose.yml:
```yaml
environment:
  - FLASK_ENV=development
  - FLASK_DEBUG=1
```

For production, change to:
```yaml
environment:
  - FLASK_ENV=production
  - FLASK_DEBUG=0
  - SECRET_KEY=your-secret-key-here
```

## Docker Logs - What to Look For

**Successful startup:**
```
Creating panfm container
panfm | Checking if auth file exists
panfm | Auth file not found, creating with default credentials
panfm | Created default admin account - password must be changed on first login
panfm | Checking encryption key permissions
panfm |  * Running on http://0.0.0.0:3000
panfm |  * Debug mode: on
```

**Error indicators:**
```
panfm | ModuleNotFoundError: No module named 'flask_wtf'
# Solution: Rebuild container (docker-compose build --no-cache)

panfm | Permission denied: 'encryption.key'
# Solution: Check file permissions in container

panfm | Address already in use
# Solution: Port 3000 is taken, stop other service or change port
```

## Still Having Issues?

### Debug Steps:

1. **Check Docker is running:**
   ```bash
   docker --version
   docker ps
   ```

2. **Verify files exist:**
   ```bash
   ls -la | grep -E "(Dockerfile|docker-compose.yml|requirements.txt)"
   ```

3. **Check requirements.txt has new dependencies:**
   ```bash
   grep -E "(Flask-WTF|Flask-Limiter|bcrypt)" requirements.txt
   ```

4. **Rebuild completely:**
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   docker-compose logs -f
   ```

5. **Access login page directly:**
   ```bash
   open http://localhost:3000/login
   # Or manually navigate in browser
   ```

## Quick Reference

**Start Docker container:**
```bash
docker-compose up -d
```

**View logs:**
```bash
docker-compose logs -f
```

**Stop container:**
```bash
docker-compose down
```

**Rebuild container:**
```bash
docker-compose up -d --build
```

**Access application:**
- URL: http://localhost:3000
- Default login: admin / admin
- Must change password on first login

## Need More Help?

1. Check logs: `docker-compose logs panfm`
2. Enable debug logging in application (after logging in)
3. Review PROJECT_MANIFEST.md Security Architecture section
4. Check SECURITY_IMPLEMENTATION_SUMMARY.md

---

**Remember:** The authentication system is a NEW security feature in v2.2. 
The login page is expected and required - this is protecting your firewall monitoring dashboard!
