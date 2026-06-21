# Direct Upload Server - Complete Setup Guide

## What This Does
Creates a **separate Express server** just for file uploads, completely bypassing Next.js.
This is MUCH faster and more reliable for large files.

---

## Architecture

```
APK Upload Request
    ↓
Nginx (port 443)
    ↓
/api/direct-upload → Express Upload Server (port 6788) ← DIRECT, FAST
/api/* → Next.js Server (port 6789) ← For other APIs
```

---

## Step-by-Step VPS Deployment

### 1. SSH into VPS
```bash
ssh root@millerstorm.tech
cd /var/www/millerstorm
```

### 2. Pull Latest Code
```bash
git pull origin main
```

### 3. Install New Dependencies
```bash
npm install express multer cors
```

### 4. Update Nginx Configuration
```bash
# Copy new nginx config
sudo cp nginx-with-direct-upload.conf /etc/nginx/sites-available/millerstorm.conf

# Test nginx
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 5. Stop Old PM2 Processes
```bash
pm2 stop all
pm2 delete all
```

### 6. Start Both Servers with PM2
```bash
pm2 start ecosystem-with-upload.config.js
pm2 save
```

### 7. Check Status
```bash
pm2 status
```

You should see:
- ✅ millerstorm (Next.js on port 6789)
- ✅ upload-server (Express on port 6788)

### 8. Test Upload
```bash
# From VPS
curl -X POST https://millerstorm.tech/api/direct-upload \
  -F "file=@/path/to/test-video.mp4"

# Should return: {"success":true,"url":"/uploads/..."}
```

---

## Update APK Code

In `storm_chat_room_screen.dart`, change the upload URL:

### Find this line (around line 517):
```dart
Uri.parse('https://millerstorm.tech/api/upload-image'),
```

### Change to:
```dart
Uri.parse('https://millerstorm.tech/api/direct-upload'),
```

That's it! Just one line change in the APK.

---

## Files Created

1. **upload-server.js** - Standalone Express server for uploads
2. **ecosystem-with-upload.config.js** - PM2 config for both servers
3. **nginx-with-direct-upload.conf** - Nginx config with direct upload route
4. **test-direct-upload.js** - Test script

---

## Advantages of Direct Upload

| Feature | Next.js API | Direct Upload Server |
|---------|-------------|---------------------|
| Speed | Slow (goes through Next.js) | Fast (direct to Express) |
| Timeout | 60s default | 15 minutes |
| Memory | Shared with Next.js | Dedicated 2GB |
| Reliability | Can timeout | Very reliable |
| File Size | Limited | Up to 1000MB |

---

## Monitoring

### Check if both servers are running:
```bash
pm2 status
```

### View upload server logs:
```bash
pm2 logs upload-server
```

### View Next.js logs:
```bash
pm2 logs millerstorm
```

### Check ports:
```bash
netstat -tulpn | grep 6788  # Upload server
netstat -tulpn | grep 6789  # Next.js server
```

---

## Troubleshooting

### Upload server not starting:
```bash
# Check logs
pm2 logs upload-server --err

# Restart
pm2 restart upload-server
```

### Port already in use:
```bash
# Find what's using port 6788
lsof -i :6788

# Kill it
kill -9 <PID>

# Restart upload server
pm2 restart upload-server
```

### Nginx 502 Bad Gateway:
```bash
# Check if upload server is running
pm2 status

# Check nginx error log
sudo tail -f /var/log/nginx/error.log

# Restart everything
pm2 restart all
sudo systemctl restart nginx
```

---

## Testing

### Test from local machine:
```bash
cd /var/www/millerstorm
node test-direct-upload.js
```

### Test from APK:
1. Rebuild APK with new upload URL
2. Install on device
3. Open StormChat
4. Upload a video
5. Should be MUCH faster now!

---

## Performance Expectations

| File Size | Upload Time (Good Network) |
|-----------|---------------------------|
| 10 MB | ~5-10 seconds |
| 50 MB | ~30-60 seconds |
| 100 MB | ~1-2 minutes |
| 500 MB | ~5-10 minutes |

---

## Rollback (if needed)

If something goes wrong, rollback:

```bash
# Use old ecosystem config
pm2 stop all
pm2 delete all
pm2 start ecosystem.config.js
pm2 save

# Use old nginx config
sudo cp nginx-millerstorm-updated.conf /etc/nginx/sites-available/millerstorm.conf
sudo nginx -t
sudo systemctl reload nginx
```

---

## Quick Deploy Script

Save as `deploy-direct-upload.sh`:

```bash
#!/bin/bash
cd /var/www/millerstorm
git pull
npm install express multer cors
sudo cp nginx-with-direct-upload.conf /etc/nginx/sites-available/millerstorm.conf
sudo nginx -t && sudo systemctl reload nginx
pm2 stop all
pm2 delete all
pm2 start ecosystem-with-upload.config.js
pm2 save
pm2 status
echo "✅ Direct upload server deployed!"
```

Run:
```bash
chmod +x deploy-direct-upload.sh
./deploy-direct-upload.sh
```

---

## Summary

✅ **Faster** - Direct to Express, no Next.js overhead
✅ **More Reliable** - Dedicated server for uploads
✅ **Better Timeout** - 15 minutes instead of 60 seconds
✅ **Easier to Debug** - Separate logs for uploads
✅ **Scalable** - Can add more upload server instances

The upload should now work perfectly! 🚀
