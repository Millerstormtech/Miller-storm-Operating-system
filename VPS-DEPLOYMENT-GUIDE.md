# VPS Deployment Guide - Large File Upload Configuration

## Overview
This guide covers all the configurations needed on your VPS to support large video uploads (up to 1GB) in StormChat.

## Files Modified

### 1. nginx-millerstorm.conf
**Changes:**
- `client_max_body_size`: Increased from 500M to **1000M** (1GB)
- `client_body_timeout`: Increased from 300s to **600s** (10 minutes)
- Added `client_body_buffer_size: 128k` for better buffering
- Added `proxy_request_buffering off` to prevent nginx from buffering entire upload

### 2. ecosystem.config.js (PM2)
**Changes:**
- `max_memory_restart`: Increased from 1G to **3G** to handle large file processing

### 3. next.config.mjs
**Changes:**
- Added API body size limit: **1000mb**
- Disabled response limit

### 4. pages/api/upload-image.ts
**Changes:**
- Increased formidable limits to 1000MB
- Added better error handling
- Added external resolver flag

---

## VPS Deployment Steps

### Step 1: Update Code on VPS
```bash
# SSH into your VPS
ssh root@millerstorm.tech

# Navigate to project directory
cd /var/www/millerstorm

# Pull latest changes
git pull origin main

# Install dependencies (if needed)
npm install

# Build the project
npm run build
```

### Step 2: Update Nginx Configuration
```bash
# Copy the updated nginx config
sudo cp nginx-millerstorm.conf /etc/nginx/sites-available/millerstorm.conf

# Test nginx configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

### Step 3: Restart PM2 Application
```bash
# Restart the application with new config
pm2 restart ecosystem.config.js

# Or if you want to reload without downtime
pm2 reload millerstorm

# Check status
pm2 status

# View logs
pm2 logs millerstorm --lines 50
```

### Step 4: Verify Upload Directory Permissions
```bash
# Ensure uploads directory exists and has correct permissions
mkdir -p /var/www/millerstorm/public/uploads
chmod 755 /var/www/millerstorm/public/uploads
chown -R www-data:www-data /var/www/millerstorm/public/uploads
```

---

## Additional VPS Configurations (Optional but Recommended)

### 1. Increase System File Upload Limits
Edit `/etc/security/limits.conf`:
```bash
sudo nano /etc/security/limits.conf
```

Add these lines:
```
* soft nofile 65536
* hard nofile 65536
```

### 2. Increase PHP Upload Limits (if using PHP anywhere)
Edit `/etc/php/8.x/fpm/php.ini`:
```ini
upload_max_filesize = 1000M
post_max_size = 1000M
max_execution_time = 600
max_input_time = 600
memory_limit = 512M
```

### 3. Configure Firewall (if needed)
```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 4. Monitor Disk Space
```bash
# Check available disk space
df -h

# Check uploads directory size
du -sh /var/www/millerstorm/public/uploads
```

---

## Testing Large Video Upload

### From APK:
1. Open StormChat
2. Select a group
3. Click attach icon
4. Select a video (up to 500MB - APK limit)
5. Wait for upload to complete (may take several minutes)

### Monitor Upload Progress on VPS:
```bash
# Watch nginx access logs
tail -f /var/www/millerstorm/logs/nginx-access.log

# Watch application logs
pm2 logs millerstorm

# Monitor system resources
htop
```

---

## Troubleshooting

### Issue: Upload still fails after 1-2 minutes
**Solution:** Check nginx error logs
```bash
tail -f /var/www/millerstorm/logs/nginx-error.log
```

### Issue: "413 Request Entity Too Large"
**Solution:** Nginx config not reloaded
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Issue: "502 Bad Gateway"
**Solution:** PM2 app crashed or out of memory
```bash
pm2 restart millerstorm
pm2 logs millerstorm --err
```

### Issue: Upload succeeds but file not accessible
**Solution:** Check file permissions
```bash
ls -la /var/www/millerstorm/public/uploads/
chmod 644 /var/www/millerstorm/public/uploads/*
```

### Issue: Slow upload speed
**Solution:** Check VPS bandwidth and network
```bash
# Test network speed
speedtest-cli

# Check current connections
netstat -an | grep :80 | wc -l
```

---

## Current Configuration Summary

| Setting | Value | Location |
|---------|-------|----------|
| Max Upload Size | 1000MB | nginx + Next.js |
| Upload Timeout | 600s (10 min) | nginx |
| Proxy Timeout | 600s (10 min) | nginx |
| PM2 Memory Limit | 3GB | ecosystem.config.js |
| APK Video Limit | 500MB | Flutter app |
| APK Upload Timeout | 15 minutes | Flutter app |

---

## Advantages of VPS vs Vercel

### What You CAN Change on VPS:
✅ Nginx configuration (upload limits, timeouts)
✅ PM2 process management (memory, instances)
✅ System-level configurations
✅ File system permissions
✅ Custom ports and networking
✅ Database configurations
✅ Unlimited function execution time
✅ Custom SSL certificates
✅ Server-side caching
✅ Background jobs and cron tasks

### What You CANNOT Change on Vercel:
❌ Function timeout (max 300s on Pro plan)
❌ Memory limits (fixed per plan)
❌ File system access (read-only)
❌ Custom server configurations
❌ Long-running processes
❌ WebSocket connections (limited)

---

## Maintenance Commands

### Update Application:
```bash
cd /var/www/millerstorm
git pull
npm install
npm run build
pm2 restart millerstorm
```

### Clear Uploads (if needed):
```bash
# Delete old uploads (older than 30 days)
find /var/www/millerstorm/public/uploads -type f -mtime +30 -delete
```

### Backup Uploads:
```bash
# Create backup
tar -czf uploads-backup-$(date +%Y%m%d).tar.gz /var/www/millerstorm/public/uploads/

# Move to backup location
mv uploads-backup-*.tar.gz /var/backups/
```

### Monitor Logs:
```bash
# Real-time logs
pm2 logs millerstorm

# Last 100 lines
pm2 logs millerstorm --lines 100

# Error logs only
pm2 logs millerstorm --err
```

---

## Security Recommendations

1. **Limit upload file types** - Add validation in upload API
2. **Scan uploaded files** - Use ClamAV or similar
3. **Rate limiting** - Prevent abuse
4. **Authentication** - Ensure only logged-in users can upload
5. **HTTPS only** - Force SSL for all uploads
6. **Regular backups** - Backup uploads directory
7. **Monitor disk usage** - Set up alerts for low disk space

---

## Performance Optimization

1. **Use CDN** - Serve uploaded files via CloudFlare or similar
2. **Compress videos** - Add server-side video compression
3. **Lazy loading** - Load videos on demand in APK
4. **Cleanup old files** - Implement automatic cleanup
5. **Use object storage** - Consider AWS S3 or DigitalOcean Spaces for uploads

---

## Contact & Support

If you encounter issues after deployment:
1. Check logs: `pm2 logs millerstorm`
2. Check nginx: `sudo nginx -t`
3. Check disk space: `df -h`
4. Restart services: `pm2 restart millerstorm && sudo systemctl reload nginx`
