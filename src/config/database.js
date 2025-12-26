// ============================================
// 📋 STEP 1: DATABASE CONFIGURATION
// ============================================
// This replaces your PHP config.php
// This file sets up the MySQL connection pool
// Configured for external MySQL services (PlanetScale, Railway, etc.)

const mysql = require('mysql2/promise');
require('dotenv').config();

// Support multiple environment variable formats:
// 1. Railway format: MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT
// 2. Standard format: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT
// 3. DATABASE_URL connection string (if provided)

function parseDatabaseUrl(url) {
  if (!url) return null;
  
  try {
    // Parse mysql://user:password@host:port/database format
    const match = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
    if (match) {
      return {
        user: match[1],
        password: match[2],
        host: match[3],
        port: parseInt(match[4]),
        database: match[5]
      };
    }
  } catch (err) {
    console.error('Error parsing DATABASE_URL:', err.message);
  }
  return null;
}

// Get database configuration from various sources
function getDbConfig() {
  // Try DATABASE_URL first (Railway/other providers may provide this)
  const dbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
  const urlConfig = parseDatabaseUrl(dbUrl);
  
  if (urlConfig) {
    console.log('📦 Using DATABASE_URL connection string');
    return urlConfig;
  }
  
  // Try Railway format (MYSQL* variables)
  if (process.env.MYSQLHOST || process.env.MYSQLUSER) {
    console.log('🚂 Using Railway MySQL variables');
    return {
      host: process.env.MYSQLHOST,
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      port: parseInt(process.env.MYSQLPORT || '3306')
    };
  }
  
  // Fall back to standard DB_* format
  return {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306')
  };
}

const dbConfig = getDbConfig();

console.log('Database config:', {
  host: dbConfig.host || 'localhost',
  user: dbConfig.user || 'root',
  port: dbConfig.port || 3306,
  database: dbConfig.database || 'gpsphere_db'
});

// Create a connection pool (better than single connection)
const poolConfig = {
  host: dbConfig.host || 'localhost',
  user: dbConfig.user || 'root',
  password: dbConfig.password || '',
  database: dbConfig.database || 'gpsphere_db',
  port: dbConfig.port || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  reconnect: true,
  idleTimeout: 60000, // Close idle connections after 60 seconds
  timezone: 'local',
  acquireTimeout: 30000, // Timeout for getting connection from pool (30 seconds)
  timeout: 30000, // Query timeout (30 seconds)
  connectTimeout: 30000 // Connection timeout (30 seconds) - important for cloud databases
};

// Enable SSL for cloud databases
// Check multiple sources: DB_SSL, or if Railway/Render variables are present (usually need SSL)
const needsSSL = process.env.DB_SSL === 'true' || 
                 process.env.MYSQLHOST || // Railway usually needs SSL
                 process.env.DATABASE_URL || // Connection strings usually include SSL
                 process.env.NODE_ENV === 'production'; // Production usually needs SSL

if (needsSSL) {
  poolConfig.ssl = {
    rejectUnauthorized: false // For most cloud providers (PlanetScale, Railway, etc.)
  };
  console.log('🔒 SSL enabled for database connection');
}

const pool = mysql.createPool(poolConfig);

// Test connection with better error handling
pool.getConnection()
  .then(conn => {
    console.log('✅ Connected to MySQL database');
    console.log(`   Host: ${poolConfig.host}:${poolConfig.port}`);
    console.log(`   Database: ${poolConfig.database}`);
    conn.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    console.error('   Error code:', err.code);
    console.error('   Error type:', err.errno);
    
    // Show current configuration (without password)
    console.error('\n📋 Current Database Configuration:');
    console.error(`   Host: ${poolConfig.host || 'NOT SET'}`);
    console.error(`   Port: ${poolConfig.port || 'NOT SET'}`);
    console.error(`   User: ${poolConfig.user || 'NOT SET'}`);
    console.error(`   Database: ${poolConfig.database || 'NOT SET'}`);
    console.error(`   SSL: ${poolConfig.ssl ? 'Enabled' : 'Disabled'}`);
    
    console.error('\n💡 Troubleshooting tips:');
    
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      console.error('   ⚠️  Connection timeout/refused - This usually means:');
      console.error('   1. Database host is incorrect or unreachable');
      console.error('   2. Database is not running or not accessible');
      console.error('   3. Firewall is blocking the connection');
      console.error('   4. Wrong port number (MySQL uses 3306)');
      console.error('   5. SSL required but not enabled');
      console.error('\n   For External MySQL Services:');
      console.error('   - PlanetScale: Use connection string, ensure SSL enabled');
      console.error('   - Railway: Check MYSQLHOST, MYSQLUSER, MYSQLPASSWORD variables');
      console.error('            Or use DATABASE_URL if provided');
      console.error('            SSL is automatically enabled for Railway');
      console.error('   - Aiven: Verify service is running, check connection details');
      console.error('   - Ensure DB_SSL=true is set for cloud databases (if using DB_* vars)');
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   ⚠️  Access denied - Check username and password');
      console.error('   - Railway: Verify MYSQLUSER and MYSQLPASSWORD');
      console.error('   - Standard: Verify DB_USER and DB_PASSWORD');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('   ⚠️  Database does not exist - Run initialization script');
      console.error('   - Railway: Check MYSQLDATABASE variable');
      console.error('   - Standard: Check DB_NAME variable');
    }
    
    console.error('\n   General steps:');
    console.error('   1. Verify environment variables are set correctly:');
    console.error('      - Railway: MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT');
    console.error('      - Standard: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT');
    console.error('      - Or: DATABASE_URL (connection string format)');
    console.error('   2. Check database is running and accessible');
    console.error('   3. SSL is automatically enabled for Railway and production');
    console.error('   4. Initialize database: Visit /api/init-db?secret=YOUR_SECRET');
    
    // Don't exit in development - allow server to start and show error
    // process.exit(1);
  });

module.exports = pool;
