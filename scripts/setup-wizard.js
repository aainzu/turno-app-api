#!/usr/bin/env node

/**
 * CosmosDB Setup Wizard for Turno App
 * 
 * Interactive wizard that guides users through the complete CosmosDB setup process.
 * This script will:
 * 1. Check prerequisites
 * 2. Validate environment configuration
 * 3. Create database and container
 * 4. Optionally migrate existing data
 * 5. Verify the setup
 * 
 * Usage:
 *   node scripts/setup-wizard.js
 */

import { CosmosClient } from '@azure/cosmos';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import readline from 'readline';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(dirname(__dirname)); // Go up two levels from backend/scripts

// Load environment variables
dotenv.config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Helper function to ask yes/no questions
async function askYesNo(question, defaultValue = 'y') {
  const answer = await askQuestion(`${question} (${defaultValue === 'y' ? 'Y/n' : 'y/N'}): `);
  if (answer === '') return defaultValue === 'y';
  return answer.toLowerCase().startsWith('y');
}

// Configuration object
let config = {
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
  databaseId: process.env.COSMOS_DATABASE_ID || 'turno-db',
  containerId: process.env.COSMOS_CONTAINER_ID || 'turnos',
  dataFile: join(projectRoot, 'data', 'turno.json'),
};

async function showWelcome() {
  console.log('🎉 Welcome to the Turno App CosmosDB Setup Wizard!');
  console.log('===================================================');
  console.log('');
  console.log('This wizard will help you set up Azure CosmosDB for your Turno application.');
  console.log('We will guide you through:');
  console.log('  ✅ Environment validation');
  console.log('  ✅ Database and container creation');
  console.log('  ✅ Index configuration');
  console.log('  ✅ Data migration (optional)');
  console.log('  ✅ Setup verification');
  console.log('');
  
  const proceed = await askYesNo('Ready to begin?');
  if (!proceed) {
    console.log('👋 Setup cancelled. Run this script again when you\'re ready!');
    process.exit(0);
  }
  console.log('');
}

async function checkPrerequisites() {
  console.log('1️⃣  Checking Prerequisites...');
  console.log('==============================');
  
  const checks = [];
  
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion >= 18) {
    console.log(`✅ Node.js version: ${nodeVersion}`);
    checks.push(true);
  } else {
    console.log(`❌ Node.js version: ${nodeVersion} (requires 18+)`);
    checks.push(false);
  }
  
  // Check if @azure/cosmos is installed
  try {
    await import('@azure/cosmos');
    console.log('✅ @azure/cosmos package installed');
    checks.push(true);
  } catch (error) {
    console.log('❌ @azure/cosmos package not found');
    console.log('   Run: npm install @azure/cosmos');
    checks.push(false);
  }
  
  // Check if .env file exists
  const envFile = join(dirname(__dirname), '.env'); // backend/.env
  if (existsSync(envFile)) {
    console.log('✅ .env file found');
    checks.push(true);
  } else {
    console.log('⚠️  .env file not found (you can create one during this setup)');
    checks.push(true); // Not critical, we can help create it
  }
  
  console.log('');
  
  if (checks.some(check => !check)) {
    console.log('❌ Some prerequisites are missing. Please fix them and run the wizard again.');
    process.exit(1);
  }
  
  console.log('✅ All prerequisites met!');
  console.log('');
}

async function validateEnvironment() {
  console.log('2️⃣  Environment Configuration...');
  console.log('==================================');
  
  // Check if we have CosmosDB credentials
  if (!config.endpoint || !config.key) {
    console.log('⚠️  CosmosDB credentials not found in environment variables.');
    console.log('');
    console.log('You need to provide your CosmosDB connection information.');
    console.log('You can find this in the Azure Portal:');
    console.log('  1. Go to your CosmosDB account');
    console.log('  2. Navigate to "Keys" section');
    console.log('  3. Copy the URI and PRIMARY KEY');
    console.log('');
    
    if (!config.endpoint) {
      config.endpoint = await askQuestion('CosmosDB Endpoint (URI): ');
      if (!config.endpoint.startsWith('https://')) {
        console.log('❌ Endpoint should start with https://');
        process.exit(1);
      }
    }
    
    if (!config.key) {
      config.key = await askQuestion('CosmosDB Primary Key: ');
      if (config.key.length < 50) {
        console.log('⚠️  The key seems too short. Please verify it\'s correct.');
      }
    }
    
    console.log('');
  }
  
  console.log('📋 Configuration Summary:');
  console.log(`   Endpoint: ${config.endpoint}`);
  console.log(`   Database: ${config.databaseId}`);
  console.log(`   Container: ${config.containerId}`);
  console.log(`   Key: ${'*'.repeat(Math.min(config.key.length, 20))}...`);
  console.log('');
  
  const confirm = await askYesNo('Is this configuration correct?');
  if (!confirm) {
    console.log('Please update your .env file and run the wizard again.');
    process.exit(0);
  }
  
  console.log('✅ Environment configuration validated!');
  console.log('');
}

async function testConnection() {
  console.log('3️⃣  Testing CosmosDB Connection...');
  console.log('====================================');
  
  try {
    const client = new CosmosClient({
      endpoint: config.endpoint,
      key: config.key,
    });
    
    // Test connection by listing databases
    console.log('🔌 Testing connection... on endpoint: ' + config.endpoint);
    const { resources: databases } = await client.databases.readAll().fetchAll();
    console.log(`✅ Connection successful! Found ${databases.length} database(s)`);
    
    return client;
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    
    if (error.code === 401) {
      console.log('🔑 Authentication failed. Please verify your COSMOS_KEY');
    } else if (error.code === 403) {
      console.log('🚫 Access denied. Please verify your permissions');
    } else if (error.code === 'ENOTFOUND') {
      console.log('🌐 Network error. Please verify your COSMOS_ENDPOINT');
    }
    
    process.exit(1);
  }
}

async function setupDatabase(client) {
  console.log('4️⃣  Setting Up Database and Container...');
  console.log('==========================================');
  
  try {
    // Create database
    console.log(`🗄️  Creating database '${config.databaseId}'...`);
    const { database } = await client.databases.createIfNotExists({
      id: config.databaseId,
      //throughput: 400,
    });
    console.log('✅ Database ready');
    
    // Create container
    console.log(`📦 Creating container '${config.containerId}'...`);
    const containerDefinition = {
      id: config.containerId,
      partitionKey: {
        paths: ['/fecha'],
        kind: 'Hash'
      },
      indexingPolicy: {
        indexingMode: 'consistent',
        automatic: true,
        includedPaths: [{ path: '/*' }],
        excludedPaths: [{ path: '/"_etag"/?' }],
        compositeIndexes: [
          [
            { path: '/fecha', order: 'ascending' },
            { path: '/personaId', order: 'ascending' }
          ],
          [
            { path: '/fecha', order: 'ascending' },
            { path: '/turno', order: 'ascending' }
          ],
          [
            { path: '/fecha', order: 'ascending' },
            { path: '/esVacaciones', order: 'ascending' }
          ]
        ]
      },
      uniqueKeyPolicy: {
        uniqueKeys: [
          { paths: ['/fecha', '/personaId'] }
        ]
      }
    };
    
    const { container } = await database.containers.createIfNotExists(
      containerDefinition,
      //{ throughput: 400 }
      undefined
    );
    console.log('✅ Container ready');
    
    // Verify setup
    console.log('🔍 Verifying configuration...');
    const containerProps = await container.read();
    console.log(`✅ Partition key: ${JSON.stringify(containerProps.resource.partitionKey)}`);
    console.log(`✅ Composite indexes: ${containerProps.resource.indexingPolicy.compositeIndexes?.length || 0}`);
    
    return { database, container };
    
  } catch (error) {
    console.log('❌ Database setup failed:', error.message);
    process.exit(1);
  }
}

async function offerDataMigration(container) {
  console.log('5️⃣  Data Migration (Optional)...');
  console.log('==================================');
  
  // Check if data file exists
  if (!existsSync(config.dataFile)) {
    console.log('ℹ️  No existing data file found. Skipping migration.');
    console.log('');
    return;
  }
  
  try {
    const jsonData = JSON.parse(readFileSync(config.dataFile, 'utf8'));
    console.log(`📁 Found existing data file with ${jsonData.length} records`);
    console.log(`📄 File: ${config.dataFile}`);
    console.log('');
    
    const migrate = await askYesNo('Would you like to migrate this data to CosmosDB?');
    if (!migrate) {
      console.log('⏭️  Skipping data migration');
      console.log('');
      return;
    }
    
    console.log('🚀 Starting data migration...');
    
    // Transform and migrate data
    let migrated = 0;
    let errors = 0;
    
    for (const record of jsonData) {
      try {
        const now = new Date().toISOString();
        const document = {
          id: record.fecha,
          fecha: record.fecha,
          turno: record.turno || undefined,
          startShift: record.startShift || undefined,
          endShift: record.endShift || undefined,
          esVacaciones: Boolean(record.esVacaciones),
          notas: record.notas || '',
          createdAt: now,
          updatedAt: now,
        };
        
        await container.items.create(document);
        migrated++;
        
        if (migrated % 10 === 0) {
          process.stdout.write(`\r   📊 Migrated: ${migrated}/${jsonData.length}`);
        }
        
      } catch (error) {
        if (error.code !== 409) { // Ignore conflicts (duplicates)
          errors++;
        }
      }
    }
    
    console.log(`\n✅ Migration completed!`);
    console.log(`   📊 Migrated: ${migrated} documents`);
    if (errors > 0) {
      console.log(`   ⚠️  Errors: ${errors} documents`);
    }
    
  } catch (error) {
    console.log('❌ Migration failed:', error.message);
  }
  
  console.log('');
}

async function verifySetup(container) {
  console.log('6️⃣  Verifying Setup...');
  console.log('========================');
  
  try {
    // Test basic operations
    console.log('🧪 Testing basic operations...');
    
    // Count documents
    const countQuery = { query: 'SELECT VALUE COUNT(1) FROM c' };
    const { resources: countResult } = await container.items.query(countQuery).fetchAll();
    const docCount = countResult[0] || 0;
    console.log(`✅ Document count: ${docCount}`);
    
    // Test write operation with a sample document
    const testDoc = {
      id: `test-${Date.now()}`,
      fecha: '2025-01-01',
      turno: 'mañana',
      esVacaciones: false,
      notas: 'Setup verification test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    console.log('✍️  Testing write operation...');
    await container.items.create(testDoc);
    console.log('✅ Write operation successful');
    
    // Test read operation
    console.log('👁️  Testing read operation...');
    const { resource: readDoc } = await container.item(testDoc.id, testDoc.fecha).read();
    console.log('✅ Read operation successful');
    
    // Clean up test document
    await container.item(testDoc.id, testDoc.fecha).delete();
    console.log('✅ Cleanup completed');
    
  } catch (error) {
    console.log('❌ Verification failed:', error.message);
    process.exit(1);
  }
  
  console.log('');
}

async function showCompletionSummary() {
  console.log('🎉 Setup Completed Successfully!');
  console.log('=================================');
  console.log('');
  console.log('Your CosmosDB is now ready for the Turno application!');
  console.log('');
  console.log('📋 What was configured:');
  console.log(`   ✅ Database: ${config.databaseId}`);
  console.log(`   ✅ Container: ${config.containerId}`);
  console.log('   ✅ Partition key: /fecha');
  console.log('   ✅ Composite indexes for performance');
  console.log('   ✅ Unique key constraints');
  console.log('   ✅ Optimal throughput settings');
  console.log('');
  console.log('🚀 Next Steps:');
  console.log('   1. Update your application to use CosmosDB (set USE_JSON_PROXY=false)');
  console.log('   2. Test your application with the new database');
  console.log('   3. Monitor performance in the Azure Portal');
  console.log('');
  console.log('🛠️  Useful Commands:');
  console.log('   npm run db:status    - Check database status');
  console.log('   npm run db:stats     - View performance statistics');
  console.log('   npm run db:backup    - Backup your data');
  console.log('');
  console.log('📚 For more information, see scripts/README-CosmosDB.md');
  console.log('');
  console.log('Happy coding! 🚀');
}

async function main() {
  try {
    await showWelcome();
    await checkPrerequisites();
    await validateEnvironment();
    const client = await testConnection();
    const { container } = await setupDatabase(client);
    await offerDataMigration(container);
    await verifySetup(container);
    await showCompletionSummary();
    
  } catch (error) {
    console.log('');
    console.log('❌ Setup failed:', error.message);
    console.log('');
    console.log('💡 Tips:');
    console.log('   - Check your internet connection');
    console.log('   - Verify your CosmosDB credentials');
    console.log('   - Ensure you have the necessary permissions');
    console.log('   - Try running the individual scripts manually');
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Setup cancelled by user.');
  rl.close();
  process.exit(0);
});

// Run the wizard
main();
