import { Request, Response } from 'express';
import { turnoService } from '../services/turno.service.js';
import { turnoInsertSchema, turnoQuerySchema, excelRowSchema } from '../models/turno.model.js';
import { z } from 'zod';
import XLSX from 'xlsx';

export class TurnoController {
  
  // GET /api/turnos - Get turnos by date range
  async getTurnos(req: Request, res: Response) {
    try {
      const { from, to, personaId } = req.query;

      // Validate required parameters
      if (!from || !to) {
        return res.status(400).json({
          error: 'Parámetros requeridos: from y to (formato YYYY-MM-DD)',
          example: '/api/turnos?from=2025-01-01&to=2025-01-31'
        });
      }

      // Validate parameters with Zod
      const validation = turnoQuerySchema.safeParse({ from, to, personaId });
      if (!validation.success) {
        return res.status(400).json({
          error: 'Parámetros inválidos',
          details: validation.error.issues
        });
      }

      // Get turnos from service
      const result = await turnoService.getTurnosByRange(
        from as string, 
        to as string, 
        personaId as string
      );

      res.json(result);

    } catch (error) {
      console.error('Error en GET /api/turnos:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }

  // GET /api/turnos/:fecha - Get turno by specific date
  async getTurnoByFecha(req: Request, res: Response) {
    try {
      const { fecha } = req.params;
      const { personaId } = req.query;

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({
          error: 'Formato de fecha inválido. Use YYYY-MM-DD'
        });
      }

      const turno = await turnoService.getTurnoByFecha(fecha, personaId as string);

      if (!turno) {
        return res.status(404).json({
          error: 'No se encontró turno para la fecha especificada'
        });
      }

      res.json(turno);

    } catch (error) {
      console.error('Error en GET /api/turnos/:fecha:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }

  // GET /api/turnos/today - Get today's turno
  async getTodayTurno(req: Request, res: Response) {
    try {
      const { personaId } = req.query;
      const turno = await turnoService.getTodayTurno(personaId as string);

      if (!turno) {
        return res.status(404).json({
          error: 'No se encontró turno para el día de hoy'
        });
      }

      res.json(turno);

    } catch (error) {
      console.error('Error en GET /api/turnos/today:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }

  // POST /api/turnos - Create or update turno
  async upsertTurno(req: Request, res: Response) {
    try {
      // Validate request body
      const validation = turnoInsertSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Datos inválidos',
          details: validation.error.issues
        });
      }

      const turno = await turnoService.upsertTurno(validation.data);
      res.status(201).json(turno);

    } catch (error) {
      console.error('Error en POST /api/turnos:', error);
      
      if (error instanceof Error && error.message.includes('vacaciones')) {
        return res.status(400).json({
          error: error.message
        });
      }

      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }

  // POST /api/turnos/excel - Process Excel file upload
  async processExcelUpload(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No se encontró archivo en la solicitud'
        });
      }

      // Validate file
      const fileValidation = turnoService.validateExcelFile(req.file);
      if (!fileValidation.valid) {
        return res.status(400).json({
          error: 'Archivo inválido',
          details: fileValidation.errors
        });
      }

      // Read Excel file
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length < 2) {
        return res.status(400).json({
          error: 'El archivo Excel debe tener al menos una fila de headers y una fila de datos'
        });
      }

      // Extract headers and data
      const headers = jsonData[0] as string[];
      const dataRows = jsonData.slice(1);

      // Convert to objects
      const excelData = dataRows.map((row: unknown) => {
        const rowArray = row as any[];
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header.toLowerCase().trim()] = rowArray[index];
        });
        return obj;
      });

      // Validate and process data
      const validatedData = [];
      for (const row of excelData) {
        try {
          const validatedRow = excelRowSchema.parse(row);
          validatedData.push(validatedRow);
        } catch (error) {
          // Skip invalid rows for now, they'll be handled in the service
          validatedData.push(row);
        }
      }

      // Process through service
      const result = await turnoService.processExcelData(validatedData);
      
      res.json({
        success: true,
        message: `Procesamiento completado: ${result.inserted} insertados, ${result.updated} actualizados, ${result.skipped} omitidos`,
        details: result
      });

    } catch (error) {
      console.error('Error en POST /api/turnos/excel:', error);
      res.status(500).json({
        error: 'Error procesando archivo Excel',
        message: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }

  // GET /api/turnos/stats - Get turno statistics
  async getTurnosStats(req: Request, res: Response) {
    try {
      const { from, to } = req.query;
      const stats = await turnoService.getTurnosStats(from as string, to as string);
      res.json(stats);

    } catch (error) {
      console.error('Error en GET /api/turnos/stats:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }

  // DELETE /api/turnos/cleanup - Clean old data (maintenance endpoint)
  async cleanupOldData(req: Request, res: Response) {
    try {
      const { daysOld } = req.query;
      const days = daysOld ? parseInt(daysOld as string) : 365;
      
      const deletedCount = await turnoService.cleanupOldData(days);
      
      res.json({
        success: true,
        message: `${deletedCount} registros eliminados`,
        deletedCount
      });

    } catch (error) {
      console.error('Error en DELETE /api/turnos/cleanup:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }
}

// Export singleton instance
export const turnoController = new TurnoController();
