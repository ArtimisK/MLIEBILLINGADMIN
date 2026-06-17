// Side-effect module: load .env for standalone scripts run via tsx (db:migrate,
// db:seed). Next.js loads .env itself, so this is only used by the CLI scripts.
// Imported FIRST so its effect runs before the db client module is evaluated.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — rely on the ambient environment
}
