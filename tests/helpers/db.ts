import './env';
import mysql from 'mysql2/promise';
import { TEST_DB_URL } from './env';

export async function testDb() {
  return mysql.createConnection(TEST_DB_URL);
}
