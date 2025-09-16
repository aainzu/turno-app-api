#!/usr/bin/env node

/**
 * CosmosDB Utility Script for Turno App
 * 
 * This script provides various utilities for managing the CosmosDB database:
 * - Check database status and statistics
 * - Clean up test data
 * - Backup and restore operations
 * - Performance monitoring
 * 
 * Usage:
 *   node scripts/cosmos-utils.js <command> [options]
 * 
 * Commands:
 *   status     Show database status and document count
 *   stats      Show detailed statistics and performance metrics
 *   cleanup    Remove test or temporary data
 *   backup     Export data to JSON file
 *   query      Execute a custom SQL query
 * 
 * Environment Variables Required:
 *   - COSMOS_ENDPOINT: Your CosmosDB endpoint URL
 *   - COSMOS_KEY: Your CosmosDB primary key
 *   - COSMOS_DATABASE_ID: Database name (default: turno-db)
 *   - COSMOS_CONTAINER_ID: Container name (default: turnos)
 */

import { CosmosClient } from '@azure/cosmos';
import { writeFileSync } from 'fs';
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
};

// Parse command line arguments
const [command, ...args] = process.argv.slice(2);

// Validate required environment variables
if (!config.endpoint || !config.key) {
  console.error('❌ Error: Missing required environment variables');
  console.error('Please set COSMOS_ENDPOINT and COSMOS_KEY in your .env file');
  process.exit(1);
}

// Create CosmosDB client
const client = new CosmosClient({
  endpoint: config.endpoint,
  key: config.key,
});

/**
 * Show database status
 */
async function showStatus() {
  try {
    console.log('📊 CosmosDB Status Check');
    console.log('========================');
    console.log('');

    const database = client.database(config.databaseId);
    const container = database.container(config.containerId);

    // Check database exists
    console.log('🗄️  Database Status:');
    try {
      const dbResponse = await database.read();
      console.log(`   ✅ Database '${config.databaseId}' is accessible`);
      console.log(`   📅 Last modified: ${new Date(dbResponse.resource._ts * 1000).toLocaleString()}`);
    } catch (error) {
      console.log(`   ❌ Database '${config.databaseId}' not found or inaccessible`);
      return;
    }

    // Check container exists
    console.log('');
    console.log('📦 Container Status:');
    try {
      const containerResponse = await container.read();
      const containerProps = containerResponse.resource;
      console.log(`   ✅ Container '${config.containerId}' is accessible`);
      console.log(`   🔑 Partition Key: ${JSON.stringify(containerProps.partitionKey)}`);
      console.log(`   📅 Last modified: ${new Date(containerProps._ts * 1000).toLocaleString()}`);
    } catch (error) {
      console.log(`   ❌ Container '${config.containerId}' not found or inaccessible`);
      return;
    }

    // Get document count
    console.log('');
    console.log('📄 Document Statistics:');
    const countQuery = {
      query: 'SELECT VALUE COUNT(1) FROM c'
    };
    const { resources: countResult } = await container.items.query(countQuery).fetchAll();
    const totalDocs = countResult[0] || 0;
    console.log(`   📊 Total documents: ${totalDocs}`);

    if (totalDocs > 0) {
      // Get date range
      const dateRangeQuery = {
        query: 'SELECT MIN(c.fecha) as minDate, MAX(c.fecha) as maxDate FROM c'
      };
      const { resources: dateRange } = await container.items.query(dateRangeQuery).fetchAll();
      if (dateRange[0]) {
        console.log(`   📅 Date range: ${dateRange[0].minDate} to ${dateRange[0].maxDate}`);
      }

      // Get vacation count
      const vacationQuery = {
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.esVacaciones = true'
      };
      const { resources: vacationCount } = await container.items.query(vacationQuery).fetchAll();
      console.log(`   🏖️  Vacation days: ${vacationCount[0] || 0}`);

      // Get turno distribution
      const turnoQuery = {
        query: 'SELECT c.turno, COUNT(1) as count FROM c WHERE IS_DEFINED(c.turno) GROUP BY c.turno'
      };
      const { resources: turnoStats } = await container.items.query(turnoQuery).fetchAll();
      if (turnoStats.length > 0) {
        console.log('   🕐 Turno distribution:');
        turnoStats.forEach(stat => {
          console.log(`      ${stat.turno}: ${stat.count}`);
        });
      }
    }

    console.log('');
    console.log('✅ Status check completed');

  } catch (error) {
    console.error('❌ Error checking status:', error.message);
    process.exit(1);
  }
}

/**
 * Show detailed statistics
 */
async function showStats() {
  try {
    console.log('📈 CosmosDB Detailed Statistics');
    console.log('================================');
    console.log('');

    const database = client.database(config.databaseId);
    const container = database.container(config.containerId);

    // Get throughput information
    console.log('⚡ Throughput Information:');
    try {
      const throughputResponse = await container.readThroughput();
      if (throughputResponse.resource) {
        console.log(`   💰 Provisioned RU/s: ${throughputResponse.resource.throughput}`);
      } else {
        console.log('   📊 Using shared database throughput');
      }
    } catch (error) {
      console.log('   ℹ️  Throughput information not available');
    }

    // Get partition key statistics
    console.log('');
    console.log('🔑 Partition Statistics:');
    const partitionQuery = {
      query: 'SELECT c.fecha, COUNT(1) as count FROM c GROUP BY c.fecha ORDER BY c.fecha'
    };
    const { resources: partitionStats } = await container.items.query(partitionQuery).fetchAll();
    
    if (partitionStats.length > 0) {
      console.log(`   📊 Total partitions: ${partitionStats.length}`);
      console.log('   📈 Documents per partition (showing first 10):');
      partitionStats.slice(0, 10).forEach(stat => {
        console.log(`      ${stat.fecha}: ${stat.count} documents`);
      });
      if (partitionStats.length > 10) {
        console.log(`      ... and ${partitionStats.length - 10} more partitions`);
      }

      // Show partition distribution
      const counts = partitionStats.map(s => s.count);
      const avgDocsPerPartition = counts.reduce((a, b) => a + b, 0) / counts.length;
      const maxDocsPerPartition = Math.max(...counts);
      const minDocsPerPartition = Math.min(...counts);
      
      console.log('');
      console.log('   📊 Partition distribution:');
      console.log(`      Average: ${avgDocsPerPartition.toFixed(1)} docs/partition`);
      console.log(`      Maximum: ${maxDocsPerPartition} docs/partition`);
      console.log(`      Minimum: ${minDocsPerPartition} docs/partition`);
    }

    // Index usage statistics
    console.log('');
    console.log('🗂️  Index Information:');
    const containerProps = await container.read();
    const indexPolicy = containerProps.resource.indexingPolicy;
    console.log(`   🔍 Indexing mode: ${indexPolicy.indexingMode}`);
    console.log(`   📝 Automatic indexing: ${indexPolicy.automatic}`);
    console.log(`   🔗 Composite indexes: ${indexPolicy.compositeIndexes?.length || 0}`);

    console.log('');
    console.log('✅ Statistics completed');

  } catch (error) {
    console.error('❌ Error getting statistics:', error.message);
    process.exit(1);
  }
}

/**
 * Backup data to JSON file
 */
async function backupData() {
  try {
    const outputFile = args.find(arg => arg.startsWith('--output='))?.split('=')[1] 
                     || join(projectRoot, 'data', `backup-${new Date().toISOString().split('T')[0]}.json`);
    
    console.log('💾 CosmosDB Data Backup');
    console.log('=======================');
    console.log(`📁 Output file: ${outputFile}`);
    console.log('');

    const database = client.database(config.databaseId);
    const container = database.container(config.containerId);

    console.log('📊 Fetching all documents...');
    const query = {
      query: 'SELECT * FROM c ORDER BY c.fecha'
    };

    const { resources: documents } = await container.items.query(query).fetchAll();
    console.log(`✅ Retrieved ${documents.length} documents`);

    // Clean up CosmosDB metadata for cleaner backup
    const cleanDocuments = documents.map(doc => {
      const { _rid, _self, _etag, _attachments, _ts, ...cleanDoc } = doc;
      return cleanDoc;
    });

    console.log('💾 Writing to file...');
    writeFileSync(outputFile, JSON.stringify(cleanDocuments, null, 2));
    console.log(`✅ Backup saved to: ${outputFile}`);

  } catch (error) {
    console.error('❌ Error during backup:', error.message);
    process.exit(1);
  }
}

/**
 * Execute custom query
 */
async function executeQuery() {
  try {
    const queryArg = args.find(arg => arg.startsWith('--query='))?.split('=')[1];
    if (!queryArg) {
      console.error('❌ Please provide a query with --query="SELECT * FROM c"');
      process.exit(1);
    }

    console.log('🔍 CosmosDB Query Execution');
    console.log('===========================');
    console.log(`📝 Query: ${queryArg}`);
    console.log('');

    const database = client.database(config.databaseId);
    const container = database.container(config.containerId);

    const startTime = Date.now();
    const { resources: results, requestCharge } = await container.items.query({
      query: queryArg
    }).fetchAll();
    const endTime = Date.now();

    console.log('📊 Results:');
    console.log(`   🔢 Documents returned: ${results.length}`);
    console.log(`   ⚡ Request charge: ${requestCharge} RUs`);
    console.log(`   ⏱️  Execution time: ${endTime - startTime}ms`);
    console.log('');

    if (results.length > 0) {
      console.log('📄 Sample results (first 5):');
      results.slice(0, 5).forEach((result, index) => {
        console.log(`   ${index + 1}. ${JSON.stringify(result)}`);
      });
      if (results.length > 5) {
        console.log(`   ... and ${results.length - 5} more results`);
      }
    }

  } catch (error) {
    console.error('❌ Error executing query:', error.message);
    process.exit(1);
  }
}

/**
 * Cleanup test data
 */
async function cleanupData() {
  try {
    const confirm = args.includes('--confirm');
    const testPattern = args.find(arg => arg.startsWith('--pattern='))?.split('=')[1] || 'test';

    console.log('🧹 CosmosDB Data Cleanup');
    console.log('========================');
    console.log(`🔍 Pattern to match: ${testPattern}`);
    console.log('');

    if (!confirm) {
      console.log('⚠️  This is a DRY RUN. Use --confirm to actually delete data.');
      console.log('');
    }

    const database = client.database(config.databaseId);
    const container = database.container(config.containerId);

    // Find documents matching the pattern
    const query = {
      query: `SELECT c.id, c.fecha FROM c WHERE CONTAINS(LOWER(c.notas), '${testPattern.toLowerCase()}') OR CONTAINS(LOWER(c.id), '${testPattern.toLowerCase()}')`
    };

    const { resources: documentsToDelete } = await container.items.query(query).fetchAll();
    console.log(`🔍 Found ${documentsToDelete.length} documents matching pattern '${testPattern}'`);

    if (documentsToDelete.length === 0) {
      console.log('✅ No documents to clean up');
      return;
    }

    if (!confirm) {
      console.log('📋 Documents that would be deleted:');
      documentsToDelete.forEach(doc => {
        console.log(`   • ${doc.id} (${doc.fecha})`);
      });
      console.log('');
      console.log('💡 Run with --confirm to actually delete these documents');
      return;
    }

    // Actually delete the documents
    console.log('🗑️  Deleting documents...');
    let deleted = 0;
    let errors = 0;

    for (const doc of documentsToDelete) {
      try {
        await container.item(doc.id, doc.fecha).delete();
        deleted++;
        console.log(`   ✅ Deleted: ${doc.id}`);
      } catch (error) {
        errors++;
        console.error(`   ❌ Error deleting ${doc.id}:`, error.message);
      }
    }

    console.log('');
    console.log('📊 Cleanup Summary:');
    console.log(`   ✅ Deleted: ${deleted} documents`);
    console.log(`   ❌ Errors: ${errors} documents`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

/**
 * Show help
 */
function showHelp() {
  console.log('CosmosDB Utility Script for Turno App');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/cosmos-utils.js <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  status                    Show database status and document count');
  console.log('  stats                     Show detailed statistics and performance metrics');
  console.log('  backup [--output=file]    Export data to JSON file');
  console.log('  query --query="SQL"       Execute a custom SQL query');
  console.log('  cleanup [--pattern=text]  Remove documents containing pattern');
  console.log('          [--confirm]       Actually delete (default is dry run)');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/cosmos-utils.js status');
  console.log('  node scripts/cosmos-utils.js backup --output=my-backup.json');
  console.log('  node scripts/cosmos-utils.js query --query="SELECT * FROM c WHERE c.esVacaciones = true"');
  console.log('  node scripts/cosmos-utils.js cleanup --pattern=test --confirm');
  console.log('');
  console.log('Environment Variables:');
  console.log('  COSMOS_ENDPOINT    Your CosmosDB endpoint URL');
  console.log('  COSMOS_KEY         Your CosmosDB primary key');
  console.log('  COSMOS_DATABASE_ID Database name (default: turno-db)');
  console.log('  COSMOS_CONTAINER_ID Container name (default: turnos)');
}

// Main command dispatcher
async function main() {
  switch (command) {
    case 'status':
      await showStatus();
      break;
    case 'stats':
      await showStats();
      break;
    case 'backup':
      await backupData();
      break;
    case 'query':
      await executeQuery();
      break;
    case 'cleanup':
      await cleanupData();
      break;
    case 'help':
    case '--help':
    case '-h':
    default:
      showHelp();
      if (command && !['help', '--help', '-h'].includes(command)) {
        console.log('');
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
      }
  }
}

// Run the utility
main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
