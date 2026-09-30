module.exports = {
  apps: [{
    name: 'hanjing-clinic-backend',
    script: 'server.js',
    instances: 1,              // Jobs, WebSocket sessions and rate limits are process-local.
    exec_mode: 'fork',          // Scale only after adding shared state and a job lease.
    kill_timeout: 16000,
    watch: false,               // Disable watch in production to avoid random restarts
    max_memory_restart: '1G',   // Auto-restart if memory exceeds 1GB to prevent leaks
    env_production: {
      NODE_ENV: 'production',
      PORT: 5005,
      ALLOW_CLIENT_APPOINTMENT_PAY_CONFIRM: 'false', // Enforce secure callbacks in production
      ALERT_WEBHOOK_URL: ''     // Configure your DingTalk/Feishu chatbot URL here
    },
    error_file: './logs/pm2_error.log',
    out_file: './logs/pm2_access.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    combine_logs: true
  }]
};
