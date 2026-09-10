const { Pool } = require('pg');

// Railway automatically provides DATABASE_URL once you attach a PostgreSQL
// database to this service - you don't type this in yourself.
if (!process.env.DATABASE_URL) {
  console.warn(
    'Warning: DATABASE_URL is not set. Add a PostgreSQL database in Railway ' +
      'and it will be provided automatically.'
  );
}

// Railway's internal database connections don't need SSL. If you ever connect
// from outside Railway (e.g. your own computer) using the public connection
// string, set PGSSL=true in your environment first.
const useSSL = process.env.PGSSL === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres error on idle client:', err.message);
});

module.exports = pool;
