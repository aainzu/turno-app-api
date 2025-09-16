import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  TurnoDocument, 
  TurnoInsert, 
  TurnoUpdate, 
  generateTurnoId, 
  createTurnoDocument 
} from '../models/turno.model.js';
import { TurnoFilters, TurnoSearchResult, BulkResult } from './turno.repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JSON data structure from the file
interface JsonTurnoData {
  fecha: string;
  turno: 'mañana' | 'tarde' | 'noche' | null;
  esVacaciones: boolean;
  notas: string;
}

export class JsonTurnoRepository {
  private jsonFilePath: string;
  private cache: TurnoDocument[] | null = null;
  private lastModified: number = 0;

  constructor() {
    // Path to the JSON file in the data directory
    this.jsonFilePath = path.resolve(__dirname, '../../../data/turno.json');
  }

  // Load and cache data from JSON file
  private async loadData(): Promise<TurnoDocument[]> {
    try {
      const stats = await fs.stat(this.jsonFilePath);
      
      // Check if cache is still valid
      if (this.cache && this.lastModified >= stats.mtime.getTime()) {
        return this.cache;
      }

      // Read and parse JSON file
      const jsonContent = await fs.readFile(this.jsonFilePath, 'utf-8');
      const jsonData: JsonTurnoData[] = JSON.parse(jsonContent);

      // Transform JSON data to TurnoDocument format
      this.cache = jsonData.map(item => this.transformJsonToDocument(item));
      this.lastModified = stats.mtime.getTime();

      console.log(`📄 Loaded ${this.cache.length} turnos from JSON file`);
      return this.cache;
    } catch (error) {
      console.error('Error loading turno data from JSON:', error);
      throw new Error('Failed to load turno data from JSON file');
    }
  }

  // Transform JSON data to TurnoDocument
  private transformJsonToDocument(jsonItem: JsonTurnoData): TurnoDocument {
    const now = new Date().toISOString();
    return {
      id: generateTurnoId(jsonItem.fecha),
      fecha: jsonItem.fecha,
      turno: jsonItem.turno || undefined,
      startShift: (jsonItem as any).startShift || undefined,
      endShift: (jsonItem as any).endShift || undefined,
      esVacaciones: jsonItem.esVacaciones,
      notas: jsonItem.notas || '',
      createdAt: now,
      updatedAt: now,
    };
  }

  // Create a new turno (not supported in JSON mode)
  async create(data: TurnoInsert): Promise<TurnoDocument> {
    throw new Error('Create operation not supported in development JSON mode. Data is read-only.');
  }

  // Update an existing turno (not supported in JSON mode)
  async update(id: string, data: TurnoUpdate): Promise<TurnoDocument | null> {
    throw new Error('Update operation not supported in development JSON mode. Data is read-only.');
  }

  // Delete a turno (not supported in JSON mode)
  async delete(id: string, partitionKey: string): Promise<boolean> {
    throw new Error('Delete operation not supported in development JSON mode. Data is read-only.');
  }

  // Find turno by ID
  async findById(id: string, partitionKey: string): Promise<TurnoDocument | null> {
    const data = await this.loadData();
    return data.find(turno => turno.id === id) || null;
  }

  // Find turno by fecha
  async findByFecha(fecha: string, personaId?: string): Promise<TurnoDocument | null> {
    const id = generateTurnoId(fecha, personaId);
    return this.findById(id, fecha);
  }

  // Find turnos by date range
  async findByDateRange(from: string, to: string, personaId?: string): Promise<TurnoDocument[]> {
    const data = await this.loadData();
    
    return data.filter(turno => {
      const fechaMatch = turno.fecha >= from && turno.fecha <= to;
      const personaMatch = !personaId || turno.personaId === personaId;
      return fechaMatch && personaMatch;
    }).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  // Search turnos with filters
  async search(filters: TurnoFilters): Promise<TurnoSearchResult> {
    const data = await this.loadData();
    
    let filteredData = data.filter(turno => {
      // Filter by fecha
      if (filters.fecha && turno.fecha !== filters.fecha) {
        return false;
      }

      // Filter by turno type
      if (filters.turno && turno.turno !== filters.turno) {
        return false;
      }

      // Filter by vacation status
      if (filters.esVacaciones !== undefined && turno.esVacaciones !== filters.esVacaciones) {
        return false;
      }

      // Filter by personaId
      if (filters.personaId && turno.personaId !== filters.personaId) {
        return false;
      }

      // Filter by date range
      if (filters.from && turno.fecha < filters.from) {
        return false;
      }
      if (filters.to && turno.fecha > filters.to) {
        return false;
      }

      return true;
    });

    // Sort by fecha descending
    filteredData.sort((a, b) => b.fecha.localeCompare(a.fecha));

    return {
      items: filteredData,
      total: filteredData.length,
    };
  }

  // Upsert (not supported in JSON mode)
  async upsert(data: TurnoInsert): Promise<TurnoDocument> {
    throw new Error('Upsert operation not supported in development JSON mode. Data is read-only.');
  }

  // Bulk upsert (not supported in JSON mode)
  async bulkUpsert(turnosData: TurnoInsert[]): Promise<BulkResult> {
    throw new Error('Bulk upsert operation not supported in development JSON mode. Data is read-only.');
  }

  // Get statistics
  async getStats(from?: string, to?: string): Promise<{
    total: number;
    porTurno: Record<string, number>;
    vacaciones: number;
  }> {
    const data = await this.loadData();
    
    // Filter by date range if provided
    let filteredData = data;
    if (from || to) {
      filteredData = data.filter(turno => {
        if (from && turno.fecha < from) return false;
        if (to && turno.fecha > to) return false;
        return true;
      });
    }

    const stats = {
      total: filteredData.length,
      porTurno: {} as Record<string, number>,
      vacaciones: 0,
    };

    for (const turno of filteredData) {
      if (turno.esVacaciones) {
        stats.vacaciones++;
      } else if (turno.turno) {
        stats.porTurno[turno.turno] = (stats.porTurno[turno.turno] || 0) + 1;
      }
    }

    return stats;
  }

  // Delete older than date (not supported in JSON mode)
  async deleteOlderThan(date: string): Promise<number> {
    throw new Error('Delete operation not supported in development JSON mode. Data is read-only.');
  }
}
