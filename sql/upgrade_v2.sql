USE finbot;

-- =============================================
-- Tabla: cards (tarjetas de crédito/débito)
-- =============================================
CREATE TABLE IF NOT EXISTS cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  card_type ENUM('credito','debito') NOT NULL DEFAULT 'credito',
  bank VARCHAR(100),
  last_four VARCHAR(4),
  credit_limit DECIMAL(12,2) DEFAULT 0,
  current_balance DECIMAL(12,2) DEFAULT 0,
  cut_off_day TINYINT,
  payment_due_day TINYINT,
  interest_rate DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cards_user (user_id)
);

-- =============================================
-- Tabla: loans (préstamos y deudas)
-- =============================================
CREATE TABLE IF NOT EXISTS loans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  loan_type ENUM('personal','auto','hipoteca','educativo','otro') NOT NULL DEFAULT 'personal',
  lender VARCHAR(100),
  original_amount DECIMAL(12,2) NOT NULL,
  remaining_amount DECIMAL(12,2) NOT NULL,
  monthly_payment DECIMAL(12,2) NOT NULL,
  interest_rate DECIMAL(5,2) DEFAULT 0,
  payment_day TINYINT,
  start_date DATE,
  end_date DATE,
  total_installments INT,
  paid_installments INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_loans_user (user_id)
);

-- =============================================
-- Tabla: loan_payments (pagos registrados de préstamos)
-- =============================================
CREATE TABLE IF NOT EXISTS loan_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  loan_id INT NOT NULL,
  user_id BIGINT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  note VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  INDEX idx_lp_loan (loan_id),
  INDEX idx_lp_user (user_id)
);

-- =============================================
-- Tabla: recurring_expenses (gastos fijos mensuales)
-- =============================================
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'MXN',
  category VARCHAR(50),
  payment_day TINYINT,
  card_id INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
  INDEX idx_re_user (user_id)
);

-- =============================================
-- Agregar columna card_id a expenses (opcional)
-- =============================================
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS card_id INT DEFAULT NULL;
ALTER TABLE expenses ADD CONSTRAINT fk_expense_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL;
