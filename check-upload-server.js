const https = require('https');

console.log('Checking Upload Server Status...\n');

// Check if upload server is accessible
const options = {
    hostname: 'millerstorm.tech',
    port: 443,
    path: '/api/direct-upload',
    method: 'GET',
    timeout: 5000
};

const req = https.request(options, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers, null, 2));
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('\nResponse:', data.substring(0, 200));
        
        if (res.statusCode === 404) {
            console.log('\n❌ Upload server NOT running!');
            console.log('\nRun on VPS:');
            console.log('  pm2 status');
            console.log('  pm2 logs upload-server');
        } else if (res.statusCode === 405) {
            console.log('\n✅ Upload server IS running! (405 = Method Not Allowed for GET)');
        } else {
            console.log('\n✅ Upload server responding!');
        }
    });
});

req.on('error', (error) => {
    console.error('Error:', error.message);
});

req.on('timeout', () => {
    console.error('Request timeout');
    req.destroy();
});

req.end();
