/** Tests use synthetic settings and in-memory stores, never deployment credentials. */
export function testEnvironment(source) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/^(OZ_|VERCEL(?:_|$)|NEXT_PUBLIC_|POSTGRES(?:_|$)|PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SERVICE|SSLMODE|PASSFILE)$)/i.test(key)
      || /^(DATABASE_URL|DATABASE_URL_UNPOOLED|CENSUS_API_KEY|CENSUS_ENV_FILE|BLS_API_KEY|FSQ_PORTAL_TOKEN)$/.test(key)) delete env[key];
  }
  // Set before Vitest/Vite/React load; setting this in a test hook is too late.
  env.NODE_ENV = "test";
  return env;
}
