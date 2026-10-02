const { config } = require("./config");
const { logger } = require("./observability/logger");
const { hashPassword } = require("./auth/passwords");
const { seed } = require("./db/seed");
const { app } = require("./app");

async function bootstrap() {
  const { seeded } = await seed({ hashPassword });

  const server = app.listen(config.port, () => {
    logger.info("server listening", {
      port: config.port,
      env: config.nodeEnv,
      provider: config.openai.apiKey ? "openai" : "mock"
    });

    console.log("");
    console.log(`  Angular Conversational AI API  ->  http://localhost:${config.port}`);
    console.log(`  Chat provider: ${config.openai.apiKey ? config.openai.model : "mock (no API key)"}`);
    if (seeded) {
      console.log("  Demo login:      demo@example.com / password123");
    }
    console.log("");
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      logger.info("shutting down", { signal });
      server.close(() => process.exit(0));
    });
  }

  return server;
}

if (require.main === module) {
  bootstrap().catch((error) => {
    logger.error("failed to start server", { message: error.message, stack: error.stack });
    process.exit(1);
  });
}

module.exports = { bootstrap };
