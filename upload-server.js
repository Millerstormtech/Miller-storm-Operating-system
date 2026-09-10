const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = 6788; // Different port from Next.js

// --- Load AUTH_SECRET from .env (this process gets only NODE_ENV/PORT from PM2).
// Mirrors the cron scripts' loader: does not clobber anything already set.
(function loadEnv() {
  const file = path.resolve(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq === -1) continue;
    const k = s.slice(0, eq).trim();
    const v = s.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
})();

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET || AUTH_SECRET.length < 16) {
  // Same stance as src/lib/auth.ts: never run unauthenticated in production.
  console.error('[upload-server] AUTH_SECRET is missing or too short — refusing to start.');
  process.exit(1);
}

// Verify the same HMAC session token the Next app issues (src/lib/auth.ts):
// base64url(payload).base64url(hmacSHA256(payload, AUTH_SECRET)). We only need
// to know the caller holds a valid, unexpired token — any logged-in user may
// upload, exactly as the in-app /api/upload-image route allows.
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payloadB64).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme && scheme.toLowerCase() === 'bearer' && verifyToken(token && token.trim())) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
}

// Allowlist of uploadable file types. An uploaded file is served from the app's
// own origin, so an .html/.svg/.js file would run as same-origin script (stored
// XSS). Allow only inert media/documents. KEEP IN SYNC with
// src/lib/uploads/allowedTypes.ts (that TS file cannot be require()d here).
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif',
  '.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv',
  '.mp3', '.m4a', '.wav', '.ogg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv',
  '.zip', '.rar',
]);
const FORBIDDEN_SUBSTRINGS = [
  '.html', '.htm', '.xhtml', '.svg', '.js', '.mjs', '.cjs', '.php', '.phtml',
  '.asp', '.aspx', '.jsp', '.sh', '.bat', '.cmd', '.exe', '.com', '.scr',
  '.vbs', '.jar', '.htaccess',
];
function isAllowedName(name) {
  if (!name || typeof name !== 'string') return false;
  const lower = name.toLowerCase();
  if (FORBIDDEN_SUBSTRINGS.some((bad) => lower.includes(bad))) return false;
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return false;
  return ALLOWED_EXTENSIONS.has(lower.slice(dot));
}

// Enable CORS
app.use(cors());

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1000 * 1024 * 1024 // 1000MB
    },
    // Reject disallowed types before a single byte is written to disk.
    fileFilter: function (req, file, cb) {
        if (isAllowedName(file.originalname)) return cb(null, true);
        const err = new Error('File type not allowed');
        err.code = 'INVALID_FILE_TYPE';
        return cb(err, false);
    }
});

// Upload endpoint — now requires a valid session token.
app.post('/upload', requireAuth, upload.single('file'), (req, res) => {
    console.log('Upload request received');

    if (!req.file) {
        console.error('No file in request');
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);

    console.log('File uploaded successfully:');
    console.log('  - Filename:', req.file.filename);
    console.log('  - Size:', fileSizeMB, 'MB');
    console.log('  - URL:', fileUrl);

    res.json({
        success: true,
        url: fileUrl,
        filename: req.file.filename,
        size: req.file.size
    });
});

// Health check endpoint (no auth — just liveness).
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'upload-server' });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);

    if (err && err.code === 'INVALID_FILE_TYPE') {
        return res.status(415).json({ error: 'File type not allowed' });
    }
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large (max 1000MB)' });
        }
        return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: 'Upload failed', details: err.message });
});

// Start server
app.listen(PORT, () => {
    console.log('=================================');
    console.log('📤 Upload Server Started');
    console.log('=================================');
    console.log('Port:', PORT);
    console.log('Upload Directory:', uploadDir);
    console.log('Max File Size: 1000MB');
    console.log('Auth: Bearer token required');
    console.log('Endpoint: http://localhost:' + PORT + '/upload');
    console.log('=================================');
});
