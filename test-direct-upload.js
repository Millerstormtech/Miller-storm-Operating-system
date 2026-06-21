const fs = require('fs');
const https = require('https');

const VIDEO_PATH = 'D:\\Youtube\\My Video.mp4';
const UPLOAD_URL = 'https://millerstorm.tech/api/direct-upload'; // NEW ENDPOINT

console.log('Miller Storm DIRECT Upload Test');
console.log('================================\n');

if (!fs.existsSync(VIDEO_PATH)) {
    console.error('ERROR: Video file not found:', VIDEO_PATH);
    process.exit(1);
}

const stats = fs.statSync(VIDEO_PATH);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log('File:', VIDEO_PATH.split('\\').pop());
console.log('Size:', fileSizeMB, 'MB');
console.log('URL:', UPLOAD_URL);
console.log('\nStarting DIRECT upload (bypassing Next.js)...\n');

const startTime = Date.now();

const boundary = '----WebKitFormBoundary' + Math.random().toString(36);
const fileContent = fs.readFileSync(VIDEO_PATH);
const fileName = VIDEO_PATH.split('\\').pop();

const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: video/mp4\r\n\r\n`
);

const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
const body = Buffer.concat([header, fileContent, footer]);

const url = new URL(UPLOAD_URL);

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
    timeout: 900000
};

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
            console.log('\n✅ SUCCESS! Direct upload completed');
            try {
                const data = JSON.parse(responseData);
                console.log('File URL:', data.url);
                console.log('Full URL: https://millerstorm.tech' + data.url);
            } catch (e) {
                console.log('Could not parse response');
            }
        } else {
            console.log('\n❌ FAILED! Status:', res.statusCode);
        }
    });
});

req.on('error', (error) => {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.error('\n❌ ERROR after', duration, 'seconds');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
});

req.on('timeout', () => {
    console.error('\n❌ TIMEOUT after 15 minutes');
    req.destroy();
});

req.write(body);
req.end();

console.log('Upload in progress...');
