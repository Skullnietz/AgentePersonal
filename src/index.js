require('dotenv').config();

const { createBot } = require('./bot');
const { testConnection } = require('./services/dbService');

async function main() {
  console.log('🚀 Iniciando FinBot...');

  // Test database connection
  try {
    await testConnection();
    console.log('✅ Conexión a MySQL establecida');
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error.message);
    console.error('   Verifica las credenciales en .env y que MySQL esté corriendo.');
    process.exit(1);
  }

  // Start bot
  const bot = await createBot();
  console.log('✅ Bot de Telegram iniciado (polling)');
  console.log('📊 Módulo activo: Finanzas');
  console.log('---');
  console.log('Esperando mensajes...');
}

main().catch((error) => {
  console.error('Error fatal:', error);
  process.exit(1);
});
