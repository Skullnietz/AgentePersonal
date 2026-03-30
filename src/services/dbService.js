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

async function saveExpense({ userId, amount, currency, category, description, merchant, expenseDate, inputType, rawInput, confidence, cardId }) {
  const sql = `INSERT INTO expenses (user_id, amount, currency, category, description, merchant, expense_date, input_type, raw_input, confidence, card_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [userId, amount, currency || 'MXN', category, description, merchant, expenseDate, inputType, rawInput, confidence, cardId || null];
  const [result] = await getPool().execute(sql, params);
  return result.insertId;
}

async function saveExpenses(expenses) {
  const conn = await getPool().getConnection();

  try {
    await conn.beginTransaction();

    const insertedIds = [];
    const sql = `INSERT INTO expenses (user_id, amount, currency, category, description, merchant, expense_date, input_type, raw_input, confidence, card_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    for (const expense of expenses) {
      const params = [
        expense.userId,
        expense.amount,
        expense.currency || 'MXN',
        expense.category,
        expense.description,
        expense.merchant,
        expense.expenseDate,
        expense.inputType,
        expense.rawInput,
        expense.confidence,
        expense.cardId || null,
      ];
      const [result] = await conn.execute(sql, params);
      insertedIds.push(result.insertId);
    }

    await conn.commit();
    return insertedIds;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
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

module.exports = { saveExpense, saveExpenses, runQuery, testConnection };
