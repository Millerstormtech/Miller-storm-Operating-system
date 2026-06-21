const fs = require('fs');
const https = require('https');

const VIDEO_PATH = 'D:\\Youtube\\My Video.mp4';
const UPLOAD_URL = 'https://millerstorm.tech/api/upload-image';

console.log('Miller Storm Upload Test');
console.log('========================\n');

// Check if file exists
if (!fs.existsSync(VIDEO_PATH)) {
    console.error('ERROR: Video file not found:', VIDEO_PATH);
    process.exit(1);
}

// Get file info
const stats = fs.statSync(VIDEO_PATH);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log('File:', VIDEO_PATH.split('\\').pop());
console.log('Size:', fileSizeMB, 'MB');
console.log('URL:', UPLOAD_URL);
console.log('\nStarting upload...\n');

const startTime = Date.now();

// Create boundary
const boundary = '----WebKitFormBoundary' + Math.random().toString(36);

// Read file
const fileContent = fs.readFileSync(VIDEO_PATH);
const fileName = VIDEO_PATH.split('\\').pop();

// Build multipart body
const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: video/quicktime\r\n\r\n`
);

const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

const body = Buffer.concat([header, fileContent, footer]);

// Parse URL
const url = new URL(UPLOAD_URL);

// Request options
const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Accept': 'application/json'
    },
    timeout: 900000 // 15 minutes
};

// Make request
const req = https.request(options, (res) => {
    console.log('Response Status:', res.statusCode);
    
    let responseData = '';
    
    res.on('data', (chunk) => {
        responseData += chunk;
    });
    
    res.on('end', () => {
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('\nUpload Duration:', duration, 'seconds');
        console.log('Response:', responseData);
        
        if (res.statusCode === 200) {
            console.log('\nSUCCESS! Upload completed');
            try {
                const data = JSON.parse(responseData);
                console.log('File URL:', data.url);
                console.log('Full URL: https://millerstorm.tech' + data.url);
            } catch (e) {
                console.log('Could not parse response');
            }
        } else {
            console.log('\nFAILED! Status:', res.statusCode);
        }
    });
});

req.on('error', (error) => {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.error('\nERROR after', duration, 'seconds');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
});

req.on('timeout', () => {
    console.error('\nTIMEOUT after 15 minutes');
    req.destroy();
});

// Write body
req.write(body);
req.end();

console.log('Upload in progress...');
