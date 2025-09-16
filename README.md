# Turno API Backend

Backend API server for the Turno Management application using Express.js and Azure CosmosDB.

## Features

- **RESTful API** for turno management
- **Azure CosmosDB** integration for scalable data storage
- **Excel file processing** for bulk data import
- **Input validation** with Zod schemas
- **CORS support** for frontend integration
- **Error handling** and logging
- **Health check** endpoint

## Tech Stack

- **Node.js** with TypeScript
- **Express.js** web framework
- **Azure CosmosDB** for data persistence
- **Zod** for input validation
- **Multer** for file uploads
- **XLSX** for Excel processing

## Prerequisites

- Node.js 18+ 
- Azure CosmosDB account
- npm or yarn

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp env.example .env
   ```

   Edit `.env` with your Azure CosmosDB credentials:
   ```env
   # Azure CosmosDB Configuration
   COSMOS_ENDPOINT=https://your-cosmosdb-account.documents.azure.com:443/
   COSMOS_KEY=your-cosmos-primary-key
   COSMOS_DATABASE_ID=turno-db
   COSMOS_CONTAINER_ID=turnos
   
   # Server Configuration
   PORT=3001
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:5173
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Turnos
- `GET /api/turnos` - Get turnos by date range
- `GET /api/turnos/today` - Get today's turno
- `GET /api/turnos/stats` - Get turno statistics
- `GET /api/turnos/:fecha` - Get turno by specific date
- `POST /api/turnos` - Create/update turno
- `POST /api/turnos/excel` - Upload Excel file
- `DELETE /api/turnos/cleanup` - Cleanup old data

### Example Requests

**Get turnos by date range:**
```bash
curl "http://localhost:3001/api/turnos?from=2025-01-01&to=2025-01-31"
```

**Create/update turno:**
```bash
curl -X POST http://localhost:3001/api/turnos \
  -H "Content-Type: application/json" \
  -d '{"fecha":"2025-01-15","turno":"mañana","esVacaciones":false,"notas":"Turno regular"}'
```

**Upload Excel file:**
```bash
curl -X POST http://localhost:3001/api/turnos/excel \
  -F "file=@turnos.xlsx"
```

## Excel File Format

The Excel file should have the following columns:
- `fecha` - Date in YYYY-MM-DD or DD/MM/YYYY format
- `turno` - Shift type: "mañana", "tarde", or "noche" 
- `vacaciones` - Vacation flag: true/false, "sí"/"no", 1/0
- `notas` - Optional notes

## Database Schema

The application uses Azure CosmosDB with the following document structure:

```json
{
  "id": "2025-01-15",
  "fecha": "2025-01-15",
  "turno": "mañana",
  "esVacaciones": false,
  "notas": "Turno regular",
  "personaId": "optional-user-id",
  "createdAt": "2025-01-15T10:00:00.000Z",
  "updatedAt": "2025-01-15T10:00:00.000Z"
}
```

## Deployment

### Azure App Service

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Deploy to Azure App Service** with the following configuration:
   - Node.js runtime
   - Set environment variables in App Service settings
   - Use `npm start` as the startup command

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["npm", "start"]
```

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run test` - Run tests
- `npm run lint` - Run ESLint

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `COSMOS_ENDPOINT` | CosmosDB endpoint | Required |
| `COSMOS_KEY` | CosmosDB access key | Required |
| `COSMOS_DATABASE_ID` | Database name | `turno-db` |
| `COSMOS_CONTAINER_ID` | Container name | `turnos` |
| `MAX_UPLOAD_MB` | Max file upload size | `5` |
| `LOG_LEVEL` | Logging level | `info` |
