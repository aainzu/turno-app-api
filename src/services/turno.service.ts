import { turnoRepository } from '../repositories/turno.repository.factory.js';
import { type TurnoFilters, type BulkResult } from '../repositories/turno.repository.js';
import { TurnoInsert, turnoInsertSchema, ExcelRow, excelRowSchema, type TurnoType } from '../models/turno.model.js';
import { normalizeDateInput, getLocalizedDate } from '../utils/date.js';
import { z } from 'zod';

export class TurnoService {
  
  // Get turno by specific date
  async getTurnoByFecha(fecha: string, personaId?: string) {
    try {
      const turno = await turnoRepository.findByFecha(fecha, personaId);
      return turno;
    } catch (error) {
      console.error('Error obteniendo turno por fecha:', error);
      throw new Error('Error al obtener el turno');
    }
  }

  // Get turnos in date range
  async getTurnosByRange(from: string, to: string, personaId?: string) {
    try {
      const turnos = await turnoRepository.findByDateRange(from, to, personaId);
      return {
        items: turnos,
        total: turnos.length,
      };
    } catch (error) {
      console.error('Error obteniendo turnos por rango:', error);
      throw new Error('Error al obtener los turnos');
    }
  }

  // Get today's turno
  async getTodayTurno(personaId?: string) {
    try {
      const today = getLocalizedDate();
      const fechaISO = today.formatISO();
      return await this.getTurnoByFecha(fechaISO, personaId);
    } catch (error) {
      console.error('Error obteniendo turno de hoy:', error);
      throw new Error('Error al obtener el turno de hoy');
    }
  }

  // Create or update turno
  async upsertTurno(data: TurnoInsert) {
    try {
      // Validate data with Zod
      const validatedData = turnoInsertSchema.parse(data);

      // Normalize date if necessary
      if (validatedData.fecha) {
        validatedData.fecha = normalizeDateInput(validatedData.fecha);
      }

      // Business rules: if on vacation, turno and shift times should be null
      if (validatedData.esVacaciones) {
        validatedData.turno = undefined;
        validatedData.startShift = undefined;
        validatedData.endShift = undefined;
      }

      // Business rules: if there's a turno, can't be on vacation
      if (validatedData.turno && validatedData.esVacaciones) {
        throw new Error('No se puede tener un turno específico y marcar como vacaciones al mismo tiempo');
      }

      // Business rules: start and end shift should be provided together or not at all
      if ((validatedData.startShift && !validatedData.endShift) || (!validatedData.startShift && validatedData.endShift)) {
        throw new Error('Debe proporcionar tanto la hora de inicio como la hora de fin del turno, o ninguna de las dos');
      }

      // Business rules: start shift should be before end shift
      if (validatedData.startShift && validatedData.endShift) {
        const [startHour, startMin] = validatedData.startShift.split(':').map(Number);
        const [endHour, endMin] = validatedData.endShift.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        
        // Allow overnight shifts (end time next day)
        if (startMinutes >= endMinutes && endMinutes !== 0) {
          throw new Error('La hora de inicio debe ser anterior a la hora de fin (excepto para turnos nocturnos que cruzan medianoche)');
        }
      }

      const turno = await turnoRepository.upsert(validatedData);
      return turno;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Datos inválidos: ${error.issues.map(e => e.message).join(', ')}`);
      }
      console.error('Error upsert turno:', error);
      throw error;
    }
  }

  // Process Excel data and create turnos
  async processExcelData(excelData: ExcelRow[]): Promise<BulkResult> {
    const warnings: string[] = [];
    const validRows: TurnoInsert[] = [];

    // Process each Excel row
    for (let i = 0; i < excelData.length; i++) {
      const row = excelData[i];
      const rowNumber = i + 2; // +2 because rows start at 1 and there are headers

      try {
        // Validate row with Zod
        const validatedRow = excelRowSchema.parse(row);

        // Additional business validations
        if (validatedRow.vacaciones && validatedRow.turno) {
          warnings.push(`Fila ${rowNumber}: Se especificó turno y vacaciones, se priorizarán las vacaciones`);
        }

        // Create turno object
        const turnoData: TurnoInsert = {
          fecha: validatedRow.fecha,
          turno: validatedRow.vacaciones ? undefined : (validatedRow.turno as TurnoType),
          startShift: validatedRow.vacaciones ? undefined : validatedRow.startshift,
          endShift: validatedRow.vacaciones ? undefined : validatedRow.endshift,
          esVacaciones: validatedRow.vacaciones,
          notas: validatedRow.notas || '',
        };

        validRows.push(turnoData);

      } catch (error) {
        if (error instanceof z.ZodError) {
          warnings.push(`Fila ${rowNumber}: ${error.issues.map(e => `${e.path}: ${e.message}`).join(', ')}`);
        } else {
          warnings.push(`Fila ${rowNumber}: Error procesando fila - ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Check for duplicates in file
    const fechasVistas = new Set<string>();
    const uniqueRows: TurnoInsert[] = [];

    for (const row of validRows) {
      if (fechasVistas.has(row.fecha)) {
        warnings.push(`Fecha duplicada en archivo: ${row.fecha}`);
        continue;
      }
      fechasVistas.add(row.fecha);
      uniqueRows.push(row);
    }

    // Insert into database
    try {
      const result = await turnoRepository.bulkUpsert(uniqueRows);

      return {
        ...result,
        warnings,
      };
    } catch (error) {
      console.error('Error insertando datos en bulk:', error);
      throw new Error('Error al guardar los datos en la base de datos');
    }
  }

  // Validate Excel file before processing
  validateExcelFile(file: Express.Multer.File): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const maxSize = parseInt(process.env.MAX_UPLOAD_MB || '5') * 1024 * 1024;

    // Check file size
    if (file.size > maxSize) {
      errors.push(`El archivo es demasiado grande. Máximo permitido: ${process.env.MAX_UPLOAD_MB || '5'}MB`);
    }

    // Check file type
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      errors.push('Solo se permiten archivos Excel (.xlsx)');
    }

    // Check if not empty
    if (file.size === 0) {
      errors.push('El archivo está vacío');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Get turno statistics
  async getTurnosStats(from?: string, to?: string) {
    try {
      return await turnoRepository.getStats(from, to);
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw new Error('Error al obtener estadísticas');
    }
  }

  // Clean old data (maintenance)
  async cleanupOldData(daysOld: number = 365): Promise<number> {
    try {
      const cutoffDate = getLocalizedDate();
      const pastDate = cutoffDate.subtractDays(daysOld);
      const cutoffISO = pastDate.formatISO();

      const deletedCount = await turnoRepository.deleteOlderThan(cutoffISO);
      return deletedCount;
    } catch (error) {
      console.error('Error limpiando datos antiguos:', error);
      throw new Error('Error al limpiar datos antiguos');
    }
  }

  // Check date conflicts
  async checkDateConflicts(fecha: string, personaId?: string): Promise<{
    hasConflict: boolean;
    existingTurno?: any;
  }> {
    try {
      const existing = await turnoRepository.findByFecha(fecha, personaId);
      return {
        hasConflict: !!existing,
        existingTurno: existing,
      };
    } catch (error) {
      console.error('Error verificando conflictos de fecha:', error);
      return { hasConflict: false };
    }
  }
}

// Export singleton instance
export const turnoService = new TurnoService();
