import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import multer from 'multer';
import turnoRoutes from './routes/turno.routes.js';
import { initializeDatabase } from './config/database.js';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Logging middleware
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api/turnos', turnoRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint no encontrado',
    message: `La ruta ${req.method} ${req.originalUrl} no existe`,
    availableEndpoints: {
      'GET /health': 'Health check',
      'GET /api/turnos': 'Get turnos by date range',
      'GET /api/turnos/today': 'Get today\'s turno',
      'GET /api/turnos/stats': 'Get turno statistics',
      'GET /api/turnos/:fecha': 'Get turno by date',
      'POST /api/turnos': 'Create/update turno',
      'POST /api/turnos/excel': 'Upload Excel file',
      'DELETE /api/turnos/cleanup': 'Cleanup old data'
    }
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);

  // Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'Archivo demasiado grande',
        message: `El archivo debe ser menor a ${process.env.MAX_UPLOAD_MB || '5'}MB`
      });
    }
  }

  // Default error response
  res.status(err.status || 500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Ha ocurrido un error inesperado',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize database connection
export async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
    
    const port = process.env.PORT || 3001;
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${port}/health`);
      console.log(`📊 API base URL: http://localhost:${port}/api`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

export default app;
