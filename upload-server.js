const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 6788; // Different port from Next.js

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
    }
});

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'upload-server' });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    
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
    console.log('Endpoint: http://localhost:' + PORT + '/upload');
    console.log('=================================');
});
