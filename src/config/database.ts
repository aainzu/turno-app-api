import { CosmosClient, Database, Container } from '@azure/cosmos';
import dotenv from 'dotenv';

dotenv.config({path: ["backend\\..\\.env.local", "backend\\..\\.env"]});

// Check if we're in development mode
export const isDevelopment = process.env.NODE_ENV === 'development';
export const useJsonProxy = isDevelopment && (process.env.USE_JSON_PROXY === 'true' || (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY));

// CosmosDB Configuration
const config = {
  endpoint: process.env.COSMOS_ENDPOINT!,
  key: process.env.COSMOS_KEY!,
  databaseId: process.env.COSMOS_DATABASE_ID || 'turno-db',
  containerId: process.env.COSMOS_CONTAINER_ID || 'turnos',
};

console.log("config: " + JSON.stringify(config));
console.log("env: " + JSON.stringify(process.env));

// Validate required environment variables (only if not using JSON proxy)
if (!useJsonProxy && (!config.endpoint || !config.key)) {
  throw new Error('Missing required CosmosDB configuration. Please check COSMOS_ENDPOINT and COSMOS_KEY environment variables.');
}

// Create CosmosDB client (only if not using JSON proxy)
export const cosmosClient = useJsonProxy ? null : new CosmosClient({
  endpoint: config.endpoint,
  key: config.key,
});

// Database and Container references
export let database: Database;
export let container: Container;

// Initialize database connection
export async function initializeDatabase() {
  if (useJsonProxy) {
    console.log('🔌 Running in development mode with JSON proxy');
    console.log('📄 Using data/turno.json for data storage');
    console.log('⚠️  Write operations are disabled in JSON mode');
    return;
  }

  try {
    console.log('🔌 Connecting to CosmosDB...');
    
    // Create database if it doesn't exist
    const { database: db } = await cosmosClient!.databases.createIfNotExists({
      id: config.databaseId,
    });
    database = db;
    
    // Create container if it doesn't exist
    const { container: cont } = await database.containers.createIfNotExists({
      id: config.containerId,
      partitionKey: {
        paths: ['/fecha'], // Partition by date for better performance
      },
      indexingPolicy: {
        indexingMode: 'consistent',
        automatic: true,
        includedPaths: [
          { path: '/*' }
        ],
        excludedPaths: [
          { path: '/"_etag"/?' }
        ],
        compositeIndexes: [
          [
            { path: '/fecha', order: 'ascending' },
            { path: '/personaId', order: 'ascending' }
          ]
        ]
      }
    });
    container = cont;
    
    console.log('✅ CosmosDB connected successfully');
    console.log(`📊 Database: ${config.databaseId}`);
    console.log(`📦 Container: ${config.containerId}`);
    
  } catch (error) {
    console.error('❌ Failed to initialize CosmosDB:', error);
    throw error;
  }
}

// Close database connection
export function closeDatabase() {
  // CosmosDB client doesn't need explicit closing
  console.log('🔌 CosmosDB connection closed');
}

export { config as dbConfig };
