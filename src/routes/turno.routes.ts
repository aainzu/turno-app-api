import { Router } from 'express';
import multer from 'multer';
import { turnoController } from '../controllers/turno.controller.js';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_UPLOAD_MB || '5') * 1024 * 1024, // 5MB default
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx)'));
    }
  }
});

// GET /api/turnos/today - Get today's turno (must be before /:fecha route)
router.get('/today', turnoController.getTodayTurno.bind(turnoController));

// GET /api/turnos/stats - Get statistics
router.get('/stats', turnoController.getTurnosStats.bind(turnoController));

// GET /api/turnos - Get turnos by date range
router.get('/', turnoController.getTurnos.bind(turnoController));

// GET /api/turnos/:fecha - Get turno by specific date
router.get('/:fecha', turnoController.getTurnoByFecha.bind(turnoController));

// POST /api/turnos - Create or update turno
router.post('/', turnoController.upsertTurno.bind(turnoController));

// POST /api/turnos/excel - Process Excel file upload
router.post('/excel', upload.single('file'), turnoController.processExcelUpload.bind(turnoController));

// DELETE /api/turnos/cleanup - Clean old data (maintenance)
router.delete('/cleanup', turnoController.cleanupOldData.bind(turnoController));

export default router;
