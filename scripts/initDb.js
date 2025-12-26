// ============================================
// 📋 STEP 12: DATABASE INITIALIZATION
// ============================================
// Run this once to set up all tables
// Configured for external MySQL services (PlanetScale, Railway, etc.)

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

console.log('Starting database initialization...');

// Support Railway format (MYSQL*) or standard format (DB_*)
function getDbConfig() {
  // Try Railway format first
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
  
  // Fall back to standard format
  return {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306')
};
}

const dbConfig = getDbConfig();
console.log('DB_HOST:', dbConfig.host);
console.log('DB_USER:', dbConfig.user);

async function initializeDatabase() {
  let conn;
  try {
    console.log('Attempting MySQL connection...');
    
    const poolConfig = {
      host: dbConfig.host || 'localhost',
      user: dbConfig.user || 'root',
      password: dbConfig.password || '',
      database: dbConfig.database || 'gpsphere_db',
      port: dbConfig.port || 3306,
      ssl: (process.env.DB_SSL === 'true' || process.env.MYSQLHOST || process.env.NODE_ENV === 'production') 
        ? { rejectUnauthorized: false } 
        : false
    };

    const pool = mysql.createPool(poolConfig);
    conn = await pool.getConnection();

    console.log('✅ Connected to MySQL');
    console.log(`   Host: ${poolConfig.host}:${poolConfig.port}`);
    console.log(`   User: ${poolConfig.user}`);

    const dbName = dbConfig.database || 'gpsphere_db';

    // 1. Create users table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('student','member','admin') DEFAULT 'student',
        status ENUM('pending','approved') DEFAULT 'pending',
        tac_code VARCHAR(10),
        tac_expiry DATETIME,
        reset_code VARCHAR(10),
        reset_expiry DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        profile_picture VARCHAR(255) DEFAULT NULL
      )
    `);
    console.log('✅ Table users created or exists');

    // 2. Create events table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_name VARCHAR(200) NOT NULL,
        description TEXT,
        event_date DATE,
        event_time TIME,
        location VARCHAR(150),
        director_needed INT DEFAULT 1,
        helper_needed INT DEFAULT 5,
        status ENUM('ongoing','finished') DEFAULT 'ongoing',
        created_by VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table events created or exists');

    // 3. Create event_roles table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS event_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id INT NOT NULL,
        role_name VARCHAR(100) NOT NULL,
        slots INT DEFAULT 1,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Table event_roles created or exists');

    // 4. Create event_applications table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS event_applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id INT NOT NULL,
        role_id INT NOT NULL,
        user_id INT NOT NULL,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES event_roles(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Table event_applications created or exists');

    // 5. Setup event_feedback table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS event_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id INT NOT NULL,
        user_id INT NOT NULL,
        rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (event_id, user_id)
      )
    `);
    console.log('✅ Table event_feedback created or exists');

    // 6. Create notifications table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'event',
        title VARCHAR(200) NOT NULL,
        message TEXT,
        related_id INT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Table notifications created or exists');

    // Add indexes if they don't exist
    try {
      await conn.query(`
        CREATE INDEX idx_user_read ON notifications(user_id, is_read)
      `);
      console.log('✅ Added index idx_user_read');
    } catch (err) {
      if (err.code !== 'ER_DUP_KEYNAME') {
        throw err;
      }
      console.log('ℹ️  Index idx_user_read already exists');
    }

    try {
      await conn.query(`
        CREATE INDEX idx_created_at ON notifications(created_at)
      `);
      console.log('✅ Added index idx_created_at');
    } catch (err) {
      if (err.code !== 'ER_DUP_KEYNAME') {
        throw err;
      }
      console.log('ℹ️  Index idx_created_at already exists');
    }

    // 7. Create chatbot_knowledge table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS chatbot_knowledge (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(100) NOT NULL UNIQUE,
        keywords TEXT NOT NULL,
        response TEXT NOT NULL,
        suggestions TEXT,
        priority INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table chatbot_knowledge created or exists');

    // Add indexes if they don't exist
    try {
      await conn.query(`
        CREATE INDEX idx_category ON chatbot_knowledge(category)
      `);
      console.log('✅ Added index idx_category');
    } catch (err) {
      if (err.code !== 'ER_DUP_KEYNAME') {
        throw err;
      }
      console.log('ℹ️  Index idx_category already exists');
    }

    try {
      await conn.query(`
        CREATE INDEX idx_active ON chatbot_knowledge(is_active)
      `);
      console.log('✅ Added index idx_active');
    } catch (err) {
      if (err.code !== 'ER_DUP_KEYNAME') {
        throw err;
      }
      console.log('ℹ️  Index idx_active already exists');
    }

    try {
      await conn.query(`
        CREATE INDEX idx_priority ON chatbot_knowledge(priority)
      `);
      console.log('✅ Added index idx_priority');
    } catch (err) {
      if (err.code !== 'ER_DUP_KEYNAME') {
        throw err;
      }
      console.log('ℹ️  Index idx_priority already exists');
    }

    // 8. Insert default admin if not exists
    const [admins] = await conn.query(
      "SELECT id FROM users WHERE email = ?",
      ['admin@gpsphere.com']
    );

    if (admins.length === 0) {
      const hashedPassword = await bcrypt.hash('Admin123!', 10);
      await conn.query(
        "INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)",
        ['System Admin', 'admin@gpsphere.com', hashedPassword, 'admin', 'approved']
      );
      console.log('✅ Default admin created (Email: admin@gpsphere.com | Password: Admin123!)');
    } else {
      console.log('ℹ️  Admin account already exists');
    }

    // 9. Populate initial chatbot knowledge if empty
    const [knowledgeCount] = await conn.query("SELECT COUNT(*) as count FROM chatbot_knowledge");
    
    if (parseInt(knowledgeCount[0].count) === 0) {
      console.log('📝 Populating initial chatbot knowledge...');
      
      const initialKnowledge = [
        {
          category: 'greeting',
          keywords: 'hi,hello,hey,greetings,good morning,good afternoon,good evening',
          response: '👋 Hello! I\'m the GPS UTM Assistant. How can I help you today?',
          suggestions: 'What is GPS UTM?|How do I register?|Tell me about events',
          priority: 10
        },
        {
          category: 'gps_info',
          keywords: 'gps,what is gps,gps utm,gerakan pengguna siswa',
          response: '🌍 **GPS UTM** (Gerakan Pengguna Siswa) is the Student Consumer Movement at Universiti Teknologi Malaysia.\n\nWe empower students to become smart, ethical, and responsible consumers through:\n• Educational workshops\n• Consumer rights awareness\n• Community events\n• Student advocacy\n\nGPSphere is our digital platform for managing members, events, and activities!',
          suggestions: 'How do I join?|What events are available?|How do I register?',
          priority: 9
        },
        {
          category: 'registration',
          keywords: 'register,sign up,create account,how to register',
          response: '📝 **Registration Process:**\n\n1. Click on "Register" or go to the registration page\n2. Fill in your details (name, email, password)\n3. Make sure your password is strong (8+ characters, uppercase, lowercase, number, and symbol)\n4. Submit your registration\n5. Wait for admin approval (usually 1-2 business days)\n6. You\'ll receive an email notification once approved!\n\nOnce approved, you\'ll become a GPS member and can participate in events!',
          suggestions: 'What is TAC?|How do I login?|What happens after registration?',
          priority: 8
        },
        {
          category: 'login_tac',
          keywords: 'login,sign in,tac,authentication code',
          response: '🔐 **Login & TAC System:**\n\n**TAC** stands for "Time Authentication Code" - it\'s a 6-digit security code sent to your email.\n\n**Login Steps:**\n1. Enter your email and password\n2. Click "Login"\n3. Check your email for the TAC code\n4. Enter the TAC code (expires in 15 minutes)\n5. You\'re in! 🎉\n\n**Note:** In test mode, the TAC appears on screen instead of email.',
          suggestions: 'I didn\'t receive TAC|Forgot password|How to change password?',
          priority: 8
        },
        {
          category: 'events',
          keywords: 'event,activities,what events,upcoming',
          response: '📅 You can view all available events on your dashboard after logging in!\n\nEvents include workshops, competitions, and community activities.',
          suggestions: 'How do I join an event?|What roles are available?|How to apply?',
          priority: 7
        },
        {
          category: 'join_event',
          keywords: 'join,apply,participate,how to join event',
          response: '🎉 **How to Join an Event:**\n\n1. **Login** to your member dashboard\n2. **Browse** available events\n3. **Select** an event you\'re interested in\n4. **Choose** a role (Director, Helper, Technical Crew, etc.)\n5. **Click** "Apply" on your desired role\n6. **Wait** for admin approval\n7. You\'ll be notified once approved! ✅\n\n**Note:** You must be an approved member to join events.',
          suggestions: 'What roles are available?|How long does approval take?|Can I apply for multiple roles?',
          priority: 7
        },
        {
          category: 'roles',
          keywords: 'role,position,crew,director,helper',
          response: '💼 **Available Event Roles:**\n\nEvents typically have various roles you can apply for:\n\n• **Director** - Overall event coordination\n• **Secretary** - Documentation and administration\n• **Technical Crew** - Setup and technical support\n• **Helper** - General assistance and support\n• **Publicity** - Marketing and promotion\n\nEach event may have different roles and requirements. Check the event details for specific roles available!',
          suggestions: 'How do I apply?|What are the requirements?|Can I apply for multiple roles?',
          priority: 6
        },
        {
          category: 'contact',
          keywords: 'contact,help,support,email,phone',
          response: '📞 **Contact GPS UTM:**\n\nYou can reach us through:\n\n• **Email:** info@gpsphere.com\n• **GPS Room:** Visit the GPS office at UTM\n• **Social Media:** Follow our official pages\n• **Website:** Use the contact form\n\nFor urgent matters, please visit the GPS room during office hours.',
          suggestions: 'Where is the GPS room?|What are office hours?|How to report an issue?',
          priority: 6
        },
        {
          category: 'status',
          keywords: 'status,approval,pending,approved,when will',
          response: '⏳ **Account Status:**\n\nAfter registration, your account status is "Pending" until an admin reviews and approves it.\n\n**Timeline:**\n• Registration submitted → Pending\n• Admin review → Usually 1-2 business days\n• Approval → You become a member! ✅\n\nYou can check your status on your dashboard. You\'ll also receive an email notification when approved!',
          suggestions: 'How long does it take?|What if I\'m rejected?|How to check status?',
          priority: 5
        },
        {
          category: 'password',
          keywords: 'password,forgot password,reset password',
          response: '🔑 **Password Help:**\n\n**Password Requirements:**\n• At least 8 characters\n• One uppercase letter\n• One lowercase letter\n• One number\n• One special symbol\n\n**If you forgot your password:**\nPlease contact the admin or visit the GPS room for password reset assistance.',
          suggestions: 'How to change password?|Contact admin|What if I\'m locked out?',
          priority: 5
        },
        {
          category: 'thanks',
          keywords: 'thanks,thank you,ty,appreciate,grateful',
          response: '😊 You\'re welcome! Is there anything else I can help you with?',
          suggestions: 'Tell me about events|How to register?|Contact information',
          priority: 4
        },
        {
          category: 'goodbye',
          keywords: 'bye,goodbye,see you,farewell,exit,quit',
          response: '👋 Goodbye! Feel free to come back if you have any questions. Have a great day!',
          suggestions: '',
          priority: 3
        }
      ];

      for (const knowledge of initialKnowledge) {
        await conn.query(
          "INSERT INTO chatbot_knowledge (category, keywords, response, suggestions, priority) VALUES (?, ?, ?, ?, ?)",
          [knowledge.category, knowledge.keywords, knowledge.response, knowledge.suggestions, knowledge.priority]
        );
      }
      console.log(`✅ Inserted ${initialKnowledge.length} chatbot knowledge entries`);
    } else {
      console.log('ℹ️  Chatbot knowledge already exists');
    }

    conn.release();
    console.log('\n🎉 Database initialization complete!');
    process.exit(0);
  } catch (error) {
    if (conn) conn.release();
    console.error('❌ Error:', error);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    process.exit(1);
  }
}

initializeDatabase();
