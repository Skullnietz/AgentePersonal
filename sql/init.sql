CREATE DATABASE IF NOT EXISTS finbot
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE finbot;

CREATE TABLE IF NOT EXISTS expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'MXN',
  category VARCHAR(50) NOT NULL,
  description VARCHAR(255),
  merchant VARCHAR(100),
  expense_date DATE NOT NULL,
  input_type ENUM('text','photo','audio') NOT NULL,
  raw_input TEXT,
  confidence DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_date (expense_date),
  INDEX idx_category (category)
);

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  keywords TEXT,
  icon VARCHAR(10)
);

INSERT IGNORE INTO categories (name, keywords, icon) VALUES
  ('Comida', 'restaurante,comida,cena,almuerzo,desayuno,cafe,taco,pizza', '🍔'),
  ('Transporte', 'uber,didi,taxi,gasolina,gas,estacionamiento,peaje,metro', '🚗'),
  ('Hogar', 'renta,agua,luz,gas,internet,mantenimiento,limpieza', '🏠'),
  ('Compras', 'super,supermercado,ropa,zapatos,tienda,amazon,mercado', '🛒'),
  ('Salud', 'doctor,medicina,farmacia,hospital,dentista,consulta', '⚕️'),
  ('Entretenimiento', 'cine,netflix,spotify,juego,bar,fiesta,concierto', '🎉'),
  ('Educación', 'curso,libro,colegiatura,escuela,capacitación', '📚'),
  ('Servicios', 'telefono,celular,seguro,suscripcion,membresia', '💳'),
  ('Trabajo', 'herramienta,dominio,hosting,software,equipo', '💼'),
  ('Otros', '', '❓');
