import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL,
  origin: process.env.APP_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`,
  production: process.env.NODE_ENV === 'production',
  sessionHours: Math.min(24 * 7, Math.max(1, Number(process.env.SESSION_HOURS) || 8))
};
