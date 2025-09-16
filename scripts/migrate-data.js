#!/usr/bin/env node

/**
 * Data Migration Script for Turno App
 * 
 * This script migrates data from the local JSON file to CosmosDB.
 * It handles data transformation and ensures proper document structure.
 * 
 * Usage:
 *   node scripts/migrate-data.js
 * 
 * Options:
 *   --dry-run    Show what would be migrated without actually doing it
 *   --batch-size Number of documents to process in each batch (default: 25)
 *   --overwrite  Overwrite existing documents (default: false, skip duplicates)
 * 
 * Environment Variables Required:
 *   - COSMOS_ENDPOINT: Your CosmosDB endpoint URL
 *   - COSMOS_KEY: Your CosmosDB primary key
 *   - COSMOS_DATABASE_ID: Database name (default: turno-db)
 *   - COSMOS_CONTAINER_ID: Container name (default: turnos)
 */

import { CosmosClient } from '@azure/cosmos';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(dirname(__dirname)); // Go up two levels from backend/scripts

// Configuration
const config = {
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
  databaseId: process.env.COSMOS_DATABASE_ID || 'turno-db',
  containerId: process.env.COSMOS_CONTAINER_ID || 'turnos',
  dataFile: join(projectRoot, 'data', 'turno.json'),
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 25,
  overwrite: args.includes('--overwrite'),
};

// Validate required environment variables
if (!options.dryRun && (!config.endpoint || !config.key)) {
  console.error('❌ Error: Missing required environment variables');
  console.error('Please set COSMOS_ENDPOINT and COSMOS_KEY in your .env file');
  console.error('Or use --dry-run to test the migration process');
  process.exit(1);
}

// Create CosmosDB client
const client = options.dryRun ? null : new CosmosClient({
  endpoint: config.endpoint,
  key: config.key,
});

/**
 * Transform JSON data to CosmosDB document format
 */
function transformToCosmosDocument(jsonRecord, personaId = 'default') {
  const now = new Date().toISOString();
  
  // Generate document ID (fecha + personaId for uniqueness)
  const id = personaId !== 'default' ? `${jsonRecord.fecha}_${personaId}` : jsonRecord.fecha;
  
  return {
    id,
    fecha: jsonRecord.fecha,
    turno: jsonRecord.turno || undefined,
    startShift: jsonRecord.startShift || undefined,
    endShift: jsonRecord.endShift || undefined,
    esVacaciones: Boolean(jsonRecord.esVacaciones),
    notas: jsonRecord.notas || '',
    personaId: personaId !== 'default' ? personaId : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Process documents in batches
 */
async function processBatch(container, documents, batchNumber, totalBatches) {
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${documents.length} documents)...`);

  for (const doc of documents) {
    try {
      if (options.dryRun) {
        console.log(`   [DRY RUN] Would process: ${doc.id} (${doc.fecha})`);
        results.created++;
        continue;
      }

      // Try to read existing document
      let existingDoc = null;
      try {
        const response = await container.item(doc.id, doc.fecha).read();
        existingDoc = response.resource;
      } catch (error) {
        if (error.code !== 404) {
          throw error; // Re-throw if it's not a "not found" error
        }
      }

      if (existingDoc) {
        if (options.overwrite) {
          // Update existing document
          doc.createdAt = existingDoc.createdAt; // Preserve original creation time
          await container.item(doc.id, doc.fecha).replace(doc);
          results.updated++;
          console.log(`   ✏️  Updated: ${doc.id}`);
        } else {
          // Skip existing document
          results.skipped++;
          console.log(`   ⏭️  Skipped: ${doc.id} (already exists)`);
        }
      } else {
        // Create new document
        await container.items.create(doc);
        results.created++;
        console.log(`   ✅ Created: ${doc.id}`);
      }

    } catch (error) {
      results.errors++;
      console.error(`   ❌ Error processing ${doc.id}:`, error.message);
    }
  }

  return results;
}

/**
 * Main migration function
 */
async function migrateData() {
  try {
    console.log('🚀 Starting data migration...');
    console.log(`📁 Source file: ${config.dataFile}`);
    console.log(`🗄️  Target database: ${config.databaseId}`);
    console.log(`📦 Target container: ${config.containerId}`);
    console.log(`🔧 Options:`, options);
    console.log('');

    // Step 1: Check if data file exists
    if (!existsSync(config.dataFile)) {
      console.error(`❌ Data file not found: ${config.dataFile}`);
      process.exit(1);
    }

    // Step 2: Load and parse JSON data
    console.log('1️⃣  Loading source data...');
    const jsonData = JSON.parse(readFileSync(config.dataFile, 'utf8'));
    console.log(`✅ Loaded ${jsonData.length} records from JSON file`);

    // Step 3: Transform data to CosmosDB format
    console.log('2️⃣  Transforming data...');
    const cosmosDocuments = jsonData.map(record => transformToCosmosDocument(record));
    console.log(`✅ Transformed ${cosmosDocuments.length} documents`);

    // Step 4: Validate transformed data
    console.log('3️⃣  Validating data...');
    const validationErrors = [];
    cosmosDocuments.forEach((doc, index) => {
      if (!doc.id || !doc.fecha) {
        validationErrors.push(`Document ${index}: Missing required fields (id, fecha)`);
      }
      if (doc.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(doc.fecha)) {
        validationErrors.push(`Document ${index}: Invalid date format: ${doc.fecha}`);
      }
    });

    if (validationErrors.length > 0) {
      console.error('❌ Validation errors found:');
      validationErrors.forEach(error => console.error(`   ${error}`));
      process.exit(1);
    }
    console.log('✅ Data validation passed');

    if (options.dryRun) {
      console.log('');
      console.log('🔍 DRY RUN - No actual changes will be made');
      console.log('📋 Sample documents that would be created:');
      cosmosDocuments.slice(0, 3).forEach(doc => {
        console.log(`   • ${doc.id}: ${doc.fecha} - ${doc.turno || 'No turno'} - Vacaciones: ${doc.esVacaciones}`);
      });
      console.log(`   ... and ${Math.max(0, cosmosDocuments.length - 3)} more documents`);
      console.log('');
      console.log('✅ Dry run completed. Use without --dry-run to perform actual migration.');
      return;
    }

    // Step 5: Connect to CosmosDB
    console.log('4️⃣  Connecting to CosmosDB...');
    const database = client.database(config.databaseId);
    const container = database.container(config.containerId);

    // Verify container exists
    try {
      await container.read();
      console.log('✅ Connected to CosmosDB container');
    } catch (error) {
      console.error('❌ Failed to connect to container. Make sure to run setup-cosmosdb.js first');
      throw error;
    }

    // Step 6: Process data in batches
    console.log('5️⃣  Migrating data...');
    const totalBatches = Math.ceil(cosmosDocuments.length / options.batchSize);
    const overallResults = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    };

    for (let i = 0; i < totalBatches; i++) {
      const start = i * options.batchSize;
      const end = Math.min(start + options.batchSize, cosmosDocuments.length);
      const batch = cosmosDocuments.slice(start, end);

      const batchResults = await processBatch(container, batch, i + 1, totalBatches);
      
      // Accumulate results
      overallResults.created += batchResults.created;
      overallResults.updated += batchResults.updated;
      overallResults.skipped += batchResults.skipped;
      overallResults.errors += batchResults.errors;

      // Small delay between batches to avoid throttling
      if (i < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Step 7: Summary
    console.log('');
    console.log('🎉 Migration completed!');
    console.log('📊 Summary:');
    console.log(`   • Created: ${overallResults.created} documents`);
    console.log(`   • Updated: ${overallResults.updated} documents`);
    console.log(`   • Skipped: ${overallResults.skipped} documents`);
    console.log(`   • Errors: ${overallResults.errors} documents`);
    console.log(`   • Total processed: ${overallResults.created + overallResults.updated + overallResults.skipped + overallResults.errors}`);

    if (overallResults.errors > 0) {
      console.log('');
      console.log('⚠️  Some documents had errors. Check the logs above for details.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    
    if (error.code === 401) {
      console.error('🔑 Authentication failed. Please verify your COSMOS_KEY');
    } else if (error.code === 403) {
      console.error('🚫 Access denied. Please verify your permissions');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🌐 Network error. Please verify your COSMOS_ENDPOINT');
    }
    
    process.exit(1);
  }
}

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log('CosmosDB Data Migration Script');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/migrate-data.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run          Show what would be migrated without actually doing it');
  console.log('  --batch-size=N     Number of documents to process in each batch (default: 25)');
  console.log('  --overwrite        Overwrite existing documents (default: skip duplicates)');
  console.log('  --help, -h         Show this help message');
  console.log('');
  console.log('Environment Variables:');
  console.log('  COSMOS_ENDPOINT    Your CosmosDB endpoint URL');
  console.log('  COSMOS_KEY         Your CosmosDB primary key');
  console.log('  COSMOS_DATABASE_ID Database name (default: turno-db)');
  console.log('  COSMOS_CONTAINER_ID Container name (default: turnos)');
  process.exit(0);
}

// Run the migration
migrateData();
