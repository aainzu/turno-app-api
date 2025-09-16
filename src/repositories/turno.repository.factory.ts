import { useJsonProxy } from '../config/database.js';
import { TurnoRepository } from './turno.repository.js';
import { JsonTurnoRepository } from './turno.json.repository.js';

// Define the interface that both repositories implement
export interface ITurnoRepository {
  create(data: any): Promise<any>;
  update(id: string, data: any): Promise<any>;
  delete(id: string, partitionKey: string): Promise<boolean>;
  findById(id: string, partitionKey: string): Promise<any>;
  findByFecha(fecha: string, personaId?: string): Promise<any>;
  findByDateRange(from: string, to: string, personaId?: string): Promise<any[]>;
  search(filters: any): Promise<any>;
  upsert(data: any): Promise<any>;
  bulkUpsert(turnosData: any[]): Promise<any>;
  getStats(from?: string, to?: string): Promise<any>;
  deleteOlderThan(date: string): Promise<number>;
}

// Repository factory
class RepositoryFactory {
  private static instance: ITurnoRepository | null = null;

  static getTurnoRepository(): ITurnoRepository {
    if (!this.instance) {
      if (useJsonProxy) {
        console.log('🏭 Using JSON Turno Repository');
        this.instance = new JsonTurnoRepository();
      } else {
        console.log('🏭 Using CosmosDB Turno Repository');
        this.instance = new TurnoRepository();
      }
    }
    return this.instance;
  }

  // Reset instance (useful for testing)
  static reset() {
    this.instance = null;
  }
}

// Export the factory-created repository instance
export const turnoRepository = RepositoryFactory.getTurnoRepository();
export { RepositoryFactory };
