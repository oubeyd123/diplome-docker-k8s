const env = process.env;

export const config = {
  port: Number(env.PORT || 4000),
  mongoUri: env.MONGO_URI || 'mongodb://localhost:27017/diplomes',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '12h',
  adminEmail: (env.ADMIN_EMAIL || 'admin@univ.local').toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || 'admin1234',
  maxPdfBytes: Number(env.MAX_PDF_MB || 5) * 1024 * 1024,
  isProd: env.NODE_ENV === 'production',
};

if (config.isProd && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
