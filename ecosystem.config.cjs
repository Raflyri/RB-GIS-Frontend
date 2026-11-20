/**
 * PM2 Process Manager Configuration - LDKH Web GIS Frontend (CT 140)
 * Menjalankan Next.js Production Server secara otomatis di CT Frontend.
 *
 * Perintah aktivasi di CT 140:
 *   npm run build
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup systemd
 */
module.exports = {
  apps: [
    {
      name: "ldkh-gis-frontend",
      cwd: "/opt/rb-gis/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0 -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
        NEXT_PUBLIC_API_BASE_URL: "/api/v1",
        BACKEND_INTERNAL_URL: "http://172.16.10.130:8000",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
};
