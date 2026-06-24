// PM2 ecosystem — Productivity App backend (tracker.wiloxagency.com)
//
// IMPORTANT: this file only manages the "tracker-api" process. PM2 commands
// that reference this file (e.g. `pm2 startOrReload ecosystem.config.cjs`)
// will NEVER touch your other PM2 apps.
//
// The PORT below is intentionally non-standard to avoid clashing with your
// other APIs. If you change it, update deploy/nginx/tracker.wiloxagency.com.conf
// (the proxy_pass port) as well.
//
// Secrets/config such as MONGODB_URI and JWT_SECRET are NOT defined here.
// They are read from api/.env via dotenv (api/index.js calls dotenv.config()).
// Note: variables set here take precedence over api/.env, so PORT here wins.

module.exports = {
  apps: [
    {
      name: 'tracker-api',
      cwd: '/projects/productivity-app/api',
      script: 'index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 8730,
      },
      out_file: '/projects/productivity-app/logs/tracker-api.out.log',
      error_file: '/projects/productivity-app/logs/tracker-api.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
