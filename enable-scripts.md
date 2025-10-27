# Fix "Running Scripts is Disabled" Error on Windows

## Quick Fix (Recommended)

Open PowerShell as **Administrator** and run:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then type `Y` and press Enter.

## What This Does

- Allows locally created scripts to run
- Still requires downloaded scripts to be signed
- Only affects your user account (safe)
- Does NOT require admin rights

## Alternative: Run Without Changing Policy

If you don't want to change the execution policy, you can bypass it for a single script:

```powershell
powershell -ExecutionPolicy Bypass -File .\watch-and-test.ps1
```

## Or Use the Batch File Wrapper

We've created `watch-and-test.bat` that handles this automatically - just double-click it or run:

```cmd
watch-and-test.bat
```

## Verify It Worked

Check your current policy:

```powershell
Get-ExecutionPolicy -List
```

You should see `RemoteSigned` for `CurrentUser`.

## Security Note

This is a safe change that:
- ✅ Allows your own scripts to run
- ✅ Still protects against downloaded malicious scripts
- ✅ Only affects your user account
- ❌ Does NOT disable Windows security features
