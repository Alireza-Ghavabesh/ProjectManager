module.exports = {
  apps: [
    {
      name: 'council-app',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'server.ts --production',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
