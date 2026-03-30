const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

async function saveExpense({ userId, amount, currency, category, description, merchant, expenseDate, inputType, rawInput, confidence }) {
  const sql = `INSERT INTO expenses (user_id, amount, currency, category, description, merchant, expense_date, input_type, raw_input, confidence)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [userId, amount, currency || 'MXN', category, description, merchant, expenseDate, inputType, rawInput, confidence];
  const [result] = await getPool().execute(sql, params);
  return result.insertId;
}

async function runQuery(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function testConnection() {
  const conn = await getPool().getConnection();
  await conn.ping();
  conn.release();
  return true;
}

module.exports = { saveExpense, runQuery, testConnection };
