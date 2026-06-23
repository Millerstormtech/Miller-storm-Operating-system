module.exports = {
  apps: [
    {
      name: 'millerstorm',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/millerstorm',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '3G',
      env: {
        NODE_ENV: 'production',
        PORT: 6790,
        FIREBASE_SERVICE_ACCOUNT_PATH: '/var/www/millerstorm/firebase-service-account.json'
      },
      error_file: '/var/www/millerstorm/logs/err.log',
      out_file: '/var/www/millerstorm/logs/out.log',
      log_file: '/var/www/millerstorm/logs/combined.log',
      merge_logs: true,
      log_type: 'json',
      time: true
    },
    {
      name: 'upload-server',
      script: 'upload-server.js',
      cwd: '/var/www/millerstorm',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 6788
      },
      error_file: '/var/www/millerstorm/logs/upload-err.log',
      out_file: '/var/www/millerstorm/logs/upload-out.log',
      merge_logs: true,
      time: true
    },
    {
      name: 'acculynx-sync',
      script: 'scripts/acculynx-sync-cron.js',
      cwd: '/var/www/millerstorm',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 6789
      },
      error_file: '/var/www/millerstorm/logs/acculynx-sync-err.log',
      out_file: '/var/www/millerstorm/logs/acculynx-sync-out.log',
      merge_logs: true,
      time: true
    }
  ]
};
