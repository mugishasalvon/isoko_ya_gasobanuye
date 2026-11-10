import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';

try {
  await pool.query('SELECT 1');
  app.listen(config.port, () => {
    console.log(`Noirplay API listening on http://localhost:${config.port}`);
  });
} catch (error) {
  console.error('Unable to connect to MySQL. Check backend/.env and ensure MySQL is running.', error);
  process.exitCode = 1;
}
