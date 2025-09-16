import { container } from '../config/database.js';
import { 
  TurnoDocument, 
  TurnoInsert, 
  TurnoUpdate, 
  generateTurnoId, 
  createTurnoDocument 
} from '../models/turno.model.js';
import { SqlQuerySpec } from '@azure/cosmos';

export interface TurnoFilters {
  fecha?: string;
  turno?: 'mañana' | 'tarde' | 'noche';
  esVacaciones?: boolean;
  personaId?: string;
  from?: string;
  to?: string;
}

export interface TurnoSearchResult {
  items: TurnoDocument[];
  total: number;
}

export interface BulkResult {
  inserted: number;
  updated: number;
  skipped: number;
  warnings: string[];
  items: TurnoDocument[];
}

export class TurnoRepository {
  
  // Create a new turno
  async create(data: TurnoInsert): Promise<TurnoDocument> {
    try {
      const document = createTurnoDocument(data);
      const { resource } = await container.items.create(document);
      return resource as TurnoDocument;
    } catch (error: any) {
      if (error.code === 409) {
        throw new Error(`Ya existe un turno para la fecha ${data.fecha}`);
      }
      throw error;
    }
  }

  // Update an existing turno
  async update(id: string, data: TurnoUpdate): Promise<TurnoDocument | null> {
    try {
      const { resource: existing } = await container.item(id, data.fecha || id.split('_')[0]).read();
      if (!existing) {
        return null;
      }

      const updatedDocument: TurnoDocument = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
      };

      const { resource } = await container.item(id, updatedDocument.fecha).replace(updatedDocument);
      return resource as TurnoDocument;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  // Delete a turno
  async delete(id: string, partitionKey: string): Promise<boolean> {
    try {
      await container.item(id, partitionKey).delete();
      return true;
    } catch (error: any) {
      if (error.code === 404) {
        return false;
      }
      throw error;
    }
  }

  // Find turno by ID
  async findById(id: string, partitionKey: string): Promise<TurnoDocument | null> {
    try {
      const { resource } = await container.item(id, partitionKey).read();
      return resource as TurnoDocument;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  // Find turno by fecha
  async findByFecha(fecha: string, personaId?: string): Promise<TurnoDocument | null> {
    const id = generateTurnoId(fecha, personaId);
    return this.findById(id, fecha);
  }

  // Find turnos by date range
  async findByDateRange(from: string, to: string, personaId?: string): Promise<TurnoDocument[]> {
    let querySpec: SqlQuerySpec = {
      query: 'SELECT * FROM c WHERE c.fecha >= @from AND c.fecha <= @to',
      parameters: [
        { name: '@from', value: from },
        { name: '@to', value: to }
      ]
    };

    if (personaId) {
      querySpec.query += ' AND c.personaId = @personaId';
      querySpec.parameters!.push({ name: '@personaId', value: personaId });
    }

    querySpec.query += ' ORDER BY c.fecha ASC';

    const { resources } = await container.items.query(querySpec).fetchAll();
    return resources as TurnoDocument[];
  }

  // Search turnos with filters
  async search(filters: TurnoFilters): Promise<TurnoSearchResult> {
    let query = 'SELECT * FROM c WHERE 1=1';
    const parameters: any[] = [];

    if (filters.fecha) {
      query += ' AND c.fecha = @fecha';
      parameters.push({ name: '@fecha', value: filters.fecha });
    }

    if (filters.turno) {
      query += ' AND c.turno = @turno';
      parameters.push({ name: '@turno', value: filters.turno });
    }

    if (filters.esVacaciones !== undefined) {
      query += ' AND c.esVacaciones = @esVacaciones';
      parameters.push({ name: '@esVacaciones', value: filters.esVacaciones });
    }

    if (filters.personaId) {
      query += ' AND c.personaId = @personaId';
      parameters.push({ name: '@personaId', value: filters.personaId });
    }

    if (filters.from && filters.to) {
      query += ' AND c.fecha >= @from AND c.fecha <= @to';
      parameters.push(
        { name: '@from', value: filters.from },
        { name: '@to', value: filters.to }
      );
    } else if (filters.from) {
      query += ' AND c.fecha >= @from';
      parameters.push({ name: '@from', value: filters.from });
    } else if (filters.to) {
      query += ' AND c.fecha <= @to';
      parameters.push({ name: '@to', value: filters.to });
    }

    query += ' ORDER BY c.fecha DESC';

    const querySpec: SqlQuerySpec = { query, parameters };
    const { resources } = await container.items.query(querySpec).fetchAll();

    return {
      items: resources as TurnoDocument[],
      total: resources.length,
    };
  }

  // Upsert (create or update)
  async upsert(data: TurnoInsert): Promise<TurnoDocument> {
    const existing = await this.findByFecha(data.fecha, data.personaId);
    
    if (existing) {
      return await this.update(existing.id, data) as TurnoDocument;
    } else {
      return await this.create(data);
    }
  }

  // Bulk upsert
  async bulkUpsert(turnosData: TurnoInsert[]): Promise<BulkResult> {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const warnings: string[] = [];
    const items: TurnoDocument[] = [];

    for (const turnoData of turnosData) {
      try {
        const existing = await this.findByFecha(turnoData.fecha, turnoData.personaId);
        const result = await this.upsert(turnoData);
        items.push(result);

        if (existing) {
          updated++;
        } else {
          inserted++;
        }
      } catch (error: any) {
        skipped++;
        warnings.push(`Error procesando turno para fecha ${turnoData.fecha}: ${error.message}`);
      }
    }

    return { inserted, updated, skipped, warnings, items };
  }

  // Get statistics
  async getStats(from?: string, to?: string): Promise<{
    total: number;
    porTurno: Record<string, number>;
    vacaciones: number;
  }> {
    let query = 'SELECT * FROM c';
    const parameters: any[] = [];

    if (from && to) {
      query += ' WHERE c.fecha >= @from AND c.fecha <= @to';
      parameters.push(
        { name: '@from', value: from },
        { name: '@to', value: to }
      );
    } else if (from) {
      query += ' WHERE c.fecha >= @from';
      parameters.push({ name: '@from', value: from });
    } else if (to) {
      query += ' WHERE c.fecha <= @to';
      parameters.push({ name: '@to', value: to });
    }

    const querySpec: SqlQuerySpec = { query, parameters };
    const { resources } = await container.items.query(querySpec).fetchAll();
    const allTurnos = resources as TurnoDocument[];

    const stats = {
      total: allTurnos.length,
      porTurno: {} as Record<string, number>,
      vacaciones: 0,
    };

    for (const turno of allTurnos) {
      if (turno.esVacaciones) {
        stats.vacaciones++;
      } else if (turno.turno) {
        stats.porTurno[turno.turno] = (stats.porTurno[turno.turno] || 0) + 1;
      }
    }

    return stats;
  }

  // Delete older than date
  async deleteOlderThan(date: string): Promise<number> {
    const querySpec: SqlQuerySpec = {
      query: 'SELECT c.id, c.fecha FROM c WHERE c.fecha < @date',
      parameters: [{ name: '@date', value: date }]
    };

    const { resources } = await container.items.query(querySpec).fetchAll();
    let deletedCount = 0;

    for (const item of resources) {
      try {
        await container.item(item.id, item.fecha).delete();
        deletedCount++;
      } catch (error) {
        console.error(`Error deleting item ${item.id}:`, error);
      }
    }

    return deletedCount;
  }
}

// Export singleton instance
export const turnoRepository = new TurnoRepository();
