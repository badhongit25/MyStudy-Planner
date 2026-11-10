module.exports = {
  apps: [
    {
      name: "mystudy-server",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      restart_delay: 2000,
      env: {
        NODE_ENV: "production",
        PORT: 5000
      }
    }
  ]
};
