# Device Selection Test Plan

## Current Status
- ✅ 2 Devices configured (PA1410, PA440)
- ❌ Device selection not persisting (`selected_device_id` is empty in settings.json)
- ✅ Backend fix applied (routes.py now saves monitored_interface)
- ✅ Frontend async fix applied (updateDeviceSelector is properly async)

## Root Cause Analysis Complete

The system should work. All code is in place. But testing is needed to verify:

1. **Does the dropdown show devices?**
   - Open browser → Should see PA1410 and PA440 in dropdown

2. **Does device change save?**
   - Select a device → Check browser console for save logs
   - Check `settings.json` → Should have device ID

3. **Does selection persist on refresh?**
   - Refresh page → Dropdown should show same device

## Manual Testing Steps

### Step 1: Start Application
```bash
cd "/Users/chmiles/Documents/App Development/panfm"
./start.sh
```

### Step 2: Open Browser Console (F12)
Navigate to: http://localhost:3000

### Step 3: Check Console Logs
Look for these logs on page load:
```
=== initDeviceSelector called ===
=== updateDeviceSelector called ===
Fetching settings to get selected device...
Got selectedDeviceId from settings: [should show device ID or empty]
```

### Step 4: Select Device from Dropdown
Watch console for:
```
=== onDeviceChange fired ===
Device dropdown changed!
Selected device ID: [device-id-here]
Fetching current settings...
Current settings: {...}
Saving device selection to settings...
Found device: {...}
Device interface: ethernet1/12
Saving interface to settings...
Interface save response: 200
```

### Step 5: Verify settings.json
```bash
cat settings.json
```

Should show:
```json
{
  "selected_device_id": "44f6e834-f873-432e-82f3-f78cad961096",
  "monitored_interface": "ethernet1/12",
  ...
}
```

### Step 6: Test Persistence
1. Refresh browser (F5 or Cmd+R)
2. Check dropdown → Should show the device you selected
3. Check console → Should load the saved device ID

### Step 7: Test Page Data Loading
1. Select a device
2. Navigate to Applications page
3. Check console → Should see `loadApplications()` called
4. Page should show data from selected firewall

## Browser Console Test Script

Paste this in browser console to test device save manually:

```javascript
// Test device selection save
async function testDeviceSave() {
    console.log('=== TESTING DEVICE SAVE ===');

    // Get current settings
    const response = await fetch('/api/settings');
    const data = await response.json();
    console.log('Current settings:', data);

    // Set device ID to first device
    data.settings.selected_device_id = '44f6e834-f873-432e-82f3-f78cad961096';
    data.settings.monitored_interface = 'ethernet1/12';

    console.log('Saving:', data.settings);

    // Save settings
    const saveResponse = await fetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data.settings)
    });

    const saveResult = await saveResponse.json();
    console.log('Save result:', saveResult);

    // Verify save
    const verifyResponse = await fetch('/api/settings');
    const verifyData = await verifyResponse.json();
    console.log('Verified settings:', verifyData);

    if (verifyData.settings.selected_device_id === '44f6e834-f873-432e-82f3-f78cad961096') {
        console.log('✅ SAVE SUCCESSFUL!');
    } else {
        console.log('❌ SAVE FAILED!');
    }
}

testDeviceSave();
```

## Expected Behavior After Fix

1. **Device Dropdown**
   - Shows all configured devices (PA1410, PA440)
   - Default selection is first device OR previously selected device

2. **Device Change**
   - Selecting device triggers onDeviceChange()
   - Console shows save logs
   - settings.json updated immediately
   - All page data refreshes with new device

3. **Page Refresh**
   - Dropdown shows previously selected device
   - No reset to first device
   - Data loads from correct firewall

4. **Page Navigation**
   - Applications page: Calls loadApplications() → Shows apps from selected firewall
   - Connected Devices page: Calls loadConnectedDevices() → Shows devices from selected firewall
   - All pages: Use selected device automatically

## Troubleshooting

### If dropdown is empty:
- Check: Do devices exist? `cat devices.json`
- Check console: Any errors loading devices?

### If save doesn't work:
- Check console: Are there POST /api/settings errors?
- Check: File permissions on settings.json
- Check: Debug logging enabled? (should see save logs in terminal)

### If persistence doesn't work:
- Check: Is settings.json being updated? `cat settings.json`
- Check: Are there errors loading settings on page init?
- Check: Is selected_device_id in the saved JSON?

### If pages don't load data:
- Check: Is selected_device_id being used by backend?
- Check: Are API calls returning 200 OK?
- Check: Browser console for API errors

## Debug Commands

```bash
# Check settings content
cat settings.json

# Check devices content
cat devices.json

# Enable debug logging
# In UI: Settings page → Enable "Debug Logging" → Save

# Watch terminal logs
# Terminal running ./start.sh will show debug logs

# Check file permissions
ls -la settings.json devices.json encryption.key
```

## Next Steps

1. Run the browser console test script above
2. If it works → Device selection save is working, test in UI
3. If it fails → Check terminal logs for errors, file permissions
4. Report back results with console output
