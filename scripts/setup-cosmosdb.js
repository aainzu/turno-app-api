#!/usr/bin/env node

/**
 * CosmosDB Setup Script for Turno App
 * 
 * This script creates the database, container, and sets up proper indexing
 * for the Turno application in Azure CosmosDB.
 * 
 * Usage:
 *   node scripts/setup-cosmosdb.js
 * 
 * Environment Variables Required:
 *   - COSMOS_ENDPOINT: Your CosmosDB endpoint URL
 *   - COSMOS_KEY: Your CosmosDB primary key
 *   - COSMOS_DATABASE_ID: Database name (default: turno-db)
 *   - COSMOS_CONTAINER_ID: Container name (default: turnos)
 */

import { CosmosClient } from '@azure/cosmos';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const config = {
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
  databaseId: process.env.COSMOS_DATABASE_ID || 'turno-db',
  containerId: process.env.COSMOS_CONTAINER_ID || 'turnos',
};

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

async function setupCosmosDB() {
  try {
    console.log('🚀 Starting CosmosDB setup...');
    console.log(`📍 Endpoint: ${config.endpoint}`);
    console.log(`🗄️  Database: ${config.databaseId}`);
    console.log(`📦 Container: ${config.containerId}`);
    console.log('');

    // Step 1: Create Database
    console.log('1️⃣  Creating database...');
    const { database } = await client.databases.createIfNotExists({
      id: config.databaseId,
      throughput: 400, // Minimum throughput for shared database
    });
    console.log(`✅ Database '${config.databaseId}' created/verified`);

    // Step 2: Create Container with proper configuration
    console.log('2️⃣  Creating container...');
    const containerDefinition = {
      id: config.containerId,
      partitionKey: {
        paths: ['/fecha'], // Partition by date for optimal performance
        kind: 'Hash'
      },
      indexingPolicy: {
        indexingMode: 'consistent',
        automatic: true,
        includedPaths: [
          {
            path: '/*', // Index all paths by default
          }
        ],
        excludedPaths: [
          {
            path: '/"_etag"/?', // Exclude etag from indexing
          }
        ],
        compositeIndexes: [
          // Composite index for date range queries with personaId
          [
            { path: '/fecha', order: 'ascending' },
            { path: '/personaId', order: 'ascending' }
          ],
          // Composite index for date range queries with turno type
          [
            { path: '/fecha', order: 'ascending' },
            { path: '/turno', order: 'ascending' }
          ],
          // Composite index for vacation queries
          [
            { path: '/fecha', order: 'ascending' },
            { path: '/esVacaciones', order: 'ascending' }
          ]
        ],
        spatialIndexes: [], // No spatial data
      },
      uniqueKeyPolicy: {
        uniqueKeys: [
          {
            paths: ['/fecha', '/personaId'] // Ensure unique turno per date per person
          }
        ]
      },
      defaultTtl: -1, // No automatic expiration
    };

    const { container } = await database.containers.createIfNotExists(
      containerDefinition,
      {
        throughput: 400 // Minimum throughput for the container
      }
    );
    console.log(`✅ Container '${config.containerId}' created/verified`);

    // Step 3: Verify container settings
    console.log('3️⃣  Verifying container configuration...');
    const containerResponse = await container.read();
    const containerProps = containerResponse.resource;
    
    console.log('📋 Container Properties:');
    console.log(`   • Partition Key: ${JSON.stringify(containerProps.partitionKey)}`);
    console.log(`   • Indexing Mode: ${containerProps.indexingPolicy.indexingMode}`);
    console.log(`   • Composite Indexes: ${containerProps.indexingPolicy.compositeIndexes?.length || 0}`);
    console.log(`   • Unique Key Policies: ${containerProps.uniqueKeyPolicy?.uniqueKeys?.length || 0}`);

    // Step 4: Test connection with a simple query
    console.log('4️⃣  Testing container connectivity...');
    const querySpec = {
      query: 'SELECT VALUE COUNT(1) FROM c',
    };
    
    const { resources } = await container.items.query(querySpec).fetchAll();
    const documentCount = resources[0] || 0;
    console.log(`✅ Container is accessible. Current document count: ${documentCount}`);

    console.log('');
    console.log('🎉 CosmosDB setup completed successfully!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. Update your .env file with the CosmosDB configuration');
    console.log('   2. Run your application to start using CosmosDB');
    console.log('   3. Optional: Run the data migration script to import existing data');
    console.log('');

  } catch (error) {
    console.error('❌ Error during CosmosDB setup:', error);
    
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

// Run the setup
setupCosmosDB();
