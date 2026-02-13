module.exports = {
  apps: [
    {
      name: 'craig.horse',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 3000,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
