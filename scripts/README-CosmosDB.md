# CosmosDB Setup Guide for Turno App

This guide provides step-by-step instructions for setting up Azure CosmosDB for the Turno application, including database creation, data migration, and ongoing management.

## Prerequisites

1. **Azure Account**: You need an active Azure subscription
2. **CosmosDB Account**: Create a CosmosDB account in the Azure portal
3. **Node.js**: Version 18 or higher
4. **Environment Variables**: Properly configured `.env` file

## Quick Start

### 1. Create CosmosDB Account in Azure

1. Go to the [Azure Portal](https://portal.azure.com)
2. Create a new **Azure Cosmos DB** resource
3. Choose **Core (SQL)** API
4. Configure your account settings (resource group, account name, location)
5. Wait for deployment to complete

### 2. Get Connection Information

From your CosmosDB account in Azure Portal:
1. Go to **Keys** section
2. Copy the **URI** (endpoint)
3. Copy the **PRIMARY KEY**

### 3. Configure Environment Variables

Create or update your `backend/.env` file:

```env
# Azure CosmosDB Configuration
COSMOS_ENDPOINT=https://your-cosmosdb-account.documents.azure.com:443/
COSMOS_KEY=your-cosmos-primary-key-here
COSMOS_DATABASE_ID=turno-db
COSMOS_CONTAINER_ID=turnos

# Other configurations...
PORT=3001
NODE_ENV=production
```

### 4. Install Dependencies

```bash
cd backend
npm install
```

### 5. Setup Database and Container

```bash
# Create database, container, and configure indexing
npm run db:setup
```

This script will:
- ✅ Create the `turno-db` database
- ✅ Create the `turnos` container with proper partition key (`/fecha`)
- ✅ Configure optimal indexing policies
- ✅ Set up composite indexes for performance
- ✅ Configure unique key constraints

### 6. Migrate Existing Data (Optional)

If you have existing data in `data/turno.json`:

```bash
# Dry run to see what would be migrated
npm run db:migrate -- --dry-run

# Actually migrate the data
npm run db:migrate
```

## Scripts Overview

### Database Setup Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Setup** | `npm run db:setup` | Create database, container, and configure indexing |
| **Migrate** | `npm run db:migrate` | Migrate data from JSON file to CosmosDB |
| **Status** | `npm run db:status` | Check database status and document count |
| **Stats** | `npm run db:stats` | Show detailed performance statistics |
| **Backup** | `npm run db:backup` | Export all data to JSON file |
| **Utils** | `npm run db:utils <command>` | Run utility commands |
| **Wizard** | `npm run db:wizard` | Interactive setup wizard |

### Migration Options

```bash
# Dry run (show what would be migrated without doing it)
npm run db:migrate -- --dry-run

# Custom batch size (default: 25)
npm run db:migrate -- --batch-size=50

# Overwrite existing documents (default: skip duplicates)
npm run db:migrate -- --overwrite

# Combine options
npm run db:migrate -- --batch-size=10 --overwrite
```

### Utility Commands

```bash
# Check database status
npm run db:utils status

# Show detailed statistics
npm run db:utils stats

# Backup data to file
npm run db:utils backup --output=my-backup.json

# Execute custom query
npm run db:utils query --query="SELECT * FROM c WHERE c.esVacaciones = true"

# Clean up test data
npm run db:utils cleanup --pattern=test --confirm
```

## Database Schema

### Document Structure

```json
{
  "id": "2025-08-18",              // Document ID (fecha + personaId)
  "fecha": "2025-08-18",           // Date in YYYY-MM-DD format (Partition Key)
  "turno": "mañana",               // Shift type: "mañana", "tarde", "noche"
  "startShift": "07:30",           // Start time in HH:MM format
  "endShift": "15:00",             // End time in HH:MM format
  "esVacaciones": false,           // Boolean: is vacation day
  "notas": "Regular shift",        // Optional notes
  "personaId": "user123",          // Optional: for multi-user support
  "createdAt": "2025-01-01T00:00:00.000Z",  // ISO timestamp
  "updatedAt": "2025-01-01T00:00:00.000Z"   // ISO timestamp
}
```

### Indexing Strategy

- **Partition Key**: `/fecha` - Optimal for date-range queries
- **Composite Indexes**:
  - `fecha` + `personaId` - Multi-user date queries
  - `fecha` + `turno` - Shift type filtering
  - `fecha` + `esVacaciones` - Vacation day queries
- **Unique Key**: `fecha` + `personaId` - Prevent duplicates

## Performance Considerations

### Throughput Configuration

- **Development**: 400 RU/s (minimum)
- **Production**: Scale based on usage patterns
- **Autoscale**: Recommended for variable workloads

### Query Optimization

```sql
-- ✅ Good: Uses partition key
SELECT * FROM c WHERE c.fecha >= '2025-01-01' AND c.fecha <= '2025-01-31'

-- ✅ Good: Uses composite index
SELECT * FROM c WHERE c.fecha = '2025-01-15' AND c.personaId = 'user123'

-- ❌ Avoid: Cross-partition queries without partition key
SELECT * FROM c WHERE c.turno = 'mañana'
```

### Best Practices

1. **Always include partition key** (`fecha`) in queries when possible
2. **Use composite indexes** for multi-field queries
3. **Batch operations** for bulk inserts/updates
4. **Monitor RU consumption** and adjust throughput as needed
5. **Use continuation tokens** for large result sets

## Monitoring and Maintenance

### Health Checks

```bash
# Quick status check
npm run db:status

# Detailed performance metrics
npm run db:stats
```

### Regular Maintenance

```bash
# Monthly backup
npm run db:backup --output=backup-$(date +%Y-%m).json

# Clean up test data
npm run db:utils cleanup --pattern=test --confirm

# Monitor partition distribution
npm run db:utils stats
```

### Cost Optimization

1. **Monitor RU consumption** in Azure Portal
2. **Use autoscale** for variable workloads
3. **Archive old data** if not frequently accessed
4. **Optimize queries** to minimize cross-partition operations

## Troubleshooting

### Common Issues

#### Connection Problems

```
❌ Error: Missing required environment variables
```
**Solution**: Check your `.env` file has `COSMOS_ENDPOINT` and `COSMOS_KEY`

```
❌ Network error. Please verify your COSMOS_ENDPOINT
```
**Solution**: Verify the endpoint URL format and network connectivity

#### Authentication Issues

```
❌ Authentication failed. Please verify your COSMOS_KEY
```
**Solution**: 
1. Check the key is correct (no extra spaces)
2. Ensure you're using the PRIMARY KEY, not secondary
3. Verify the key hasn't been regenerated

#### Performance Issues

```
⚠️ High RU consumption detected
```
**Solution**:
1. Review query patterns
2. Add appropriate indexes
3. Consider increasing throughput
4. Optimize partition key distribution

### Getting Help

1. **Check logs**: Scripts provide detailed error messages
2. **Azure Portal**: Monitor metrics and diagnostics
3. **Documentation**: [Azure CosmosDB Docs](https://docs.microsoft.com/azure/cosmos-db/)

## Migration from Development

When moving from JSON-based development to CosmosDB:

1. **Keep JSON as backup**: Don't delete your `data/turno.json`
2. **Test migration**: Use `--dry-run` first
3. **Verify data**: Use `db:status` to confirm migration
4. **Update environment**: Change `USE_JSON_PROXY=false`
5. **Monitor performance**: Use `db:stats` regularly

## Security Best Practices

1. **Use connection strings with minimal permissions**
2. **Rotate keys regularly**
3. **Enable firewall rules** in production
4. **Use managed identity** when possible
5. **Monitor access logs**

## Scaling Considerations

### Horizontal Scaling

- **Partition Strategy**: Date-based partitioning works well for time-series data
- **Hot Partitions**: Monitor for uneven distribution
- **Cross-Partition Queries**: Minimize when possible

### Vertical Scaling

- **Throughput**: Start with 400 RU/s, scale based on metrics
- **Storage**: CosmosDB scales storage automatically
- **Indexing**: Balance query performance vs. write cost

---

For more detailed information, see the [Azure CosmosDB documentation](https://docs.microsoft.com/azure/cosmos-db/).
