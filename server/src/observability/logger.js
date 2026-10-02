const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function createLogger(base = {}) {
  const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

  const write = (level, message, fields) => {
    if (LEVELS[level] < threshold) return;

    const entry = {
      time: new Date().toISOString(),
      level,
      message,
      ...base,
      ...(fields || {})
    };

    const line = `${JSON.stringify(entry)}\n`;
    if (level === "error") process.stderr.write(line);
    else process.stdout.write(line);
  };

  return {
    child: (fields) => createLogger({ ...base, ...fields }),
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields)
  };
}

module.exports = { createLogger, logger: createLogger() };
