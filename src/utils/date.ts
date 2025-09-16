// Configuración de localización por defecto (se puede personalizar)
export interface LocaleConfig {
  timezone: string;
  locale: string;
  weekStartsOn?: 0 | 1; // 0 = domingo, 1 = lunes
}

// Detectar configuración del servidor (adaptado para Node.js)
export function detectServerLocale(): LocaleConfig {
  // En servidor, usar configuración por defecto o variables de entorno
  const timezone = process.env.TZ || 'America/Argentina/Buenos_Aires';
  const locale = process.env.LOCALE || 'es-AR';
  
  return {
    timezone,
    locale,
    weekStartsOn: 1 // Lunes por defecto
  };
}

// Configuración global (se puede sobrescribir)
let globalLocaleConfig: LocaleConfig = detectServerLocale();

// Función para personalizar la configuración global
export function setGlobalLocaleConfig(config: Partial<LocaleConfig>): void {
  globalLocaleConfig = { ...globalLocaleConfig, ...config };
}

// Obtener la configuración actual
export function getGlobalLocaleConfig(): LocaleConfig {
  return globalLocaleConfig;
}

// Compatibilidad con Argentina (mantener constantes para código existente)
export const ARGENTINA_TIMEZONE = 'America/Argentina/Buenos_Aires';
export const ARGENTINA_LOCALE = 'es-AR';

// Clase para manejar fechas con localización configurable
export class LocalizedDate {
  private date: Date;
  private config: LocaleConfig;

  constructor(date?: Date | string | number, config?: LocaleConfig) {
    this.config = config || getGlobalLocaleConfig();
    
    if (typeof date === 'string') {
      // Si es string, asumir formato YYYY-MM-DD y crear en zona horaria local
      this.date = new Date(date + 'T00:00:00');
    } else if (typeof date === 'number') {
      this.date = new Date(date);
    } else if (date instanceof Date) {
      this.date = new Date(date);
    } else {
      // Fecha actual en zona horaria del usuario
      this.date = new Date();
    }
  }

  // Obtener fecha actual con configuración del usuario
  static now(config?: LocaleConfig): LocalizedDate {
    return new LocalizedDate(undefined, config);
  }

  // Parsear fecha desde string YYYY-MM-DD
  static fromISO(dateStr: string, config?: LocaleConfig): LocalizedDate {
    return new LocalizedDate(dateStr, config);
  }

  // Parsear fecha desde DD/MM/YYYY u otros formatos según el locale
  static fromShort(dateStr: string, config?: LocaleConfig): LocalizedDate {
    const localeConfig = config || getGlobalLocaleConfig();
    
    // Detectar formato según el locale
    if (localeConfig.locale.startsWith('en-US')) {
      // Formato MM/DD/YYYY para EE.UU.
      const [month, day, year] = dateStr.split('/').map(Number);
      const date = new Date(year, month - 1, day);
      return new LocalizedDate(date, config);
    } else {
      // Formato DD/MM/YYYY para el resto del mundo
      const [day, month, year] = dateStr.split('/').map(Number);
      const date = new Date(year, month - 1, day);
      return new LocalizedDate(date, config);
    }
  }

  // Obtener año
  get year(): number {
    return this.date.getFullYear();
  }

  // Obtener mes (1-12)
  get month(): number {
    return this.date.getMonth() + 1;
  }

  // Obtener día del mes
  get day(): number {
    return this.date.getDate();
  }

  // Obtener día de la semana (respetando configuración de inicio de semana)
  get dayOfWeek(): number {
    const day = this.date.getDay();
    if (this.config.weekStartsOn === 1) {
      // Lunes = 1, Domingo = 7
      return day === 0 ? 7 : day;
    }
    // Domingo = 0, Sábado = 6
    return day;
  }

  // Obtener días en el mes actual
  get daysInMonth(): number {
    return new Date(this.year, this.month, 0).getDate();
  }

  // Formatear para display según el locale del usuario
  formatForDisplay(): string {
    return this.date.toLocaleDateString(this.config.locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: this.config.timezone,
    });
  }

  // Formatear fecha corta según el locale del usuario
  formatShort(): string {
    return this.date.toLocaleDateString(this.config.locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: this.config.timezone,
    });
  }

  // Formatear fecha ISO (YYYY-MM-DD)
  formatISO(): string {
    const year = this.year.toString().padStart(4, '0');
    const month = this.month.toString().padStart(2, '0');
    const day = this.day.toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Obtener nombre del día de la semana según el locale
  getDayName(): string {
    return this.date.toLocaleDateString(this.config.locale, {
      weekday: 'long',
      timeZone: this.config.timezone,
    });
  }

  // Obtener nombre del mes según el locale
  getMonthName(): string {
    return this.date.toLocaleDateString(this.config.locale, {
      month: 'long',
      timeZone: this.config.timezone,
    });
  }

  // Añadir días
  addDays(days: number): LocalizedDate {
    const newDate = new Date(this.date);
    newDate.setDate(newDate.getDate() + days);
    return new LocalizedDate(newDate, this.config);
  }

  // Restar días
  subtractDays(days: number): LocalizedDate {
    return this.addDays(-days);
  }

  // Comparar con otra fecha
  compare(other: LocalizedDate): number {
    return this.date.getTime() - other.date.getTime();
  }

  // Verificar si es igual a otra fecha
  equals(other: LocalizedDate): boolean {
    return this.compare(other) === 0;
  }

  // Verificar si es anterior a otra fecha
  isBefore(other: LocalizedDate): boolean {
    return this.compare(other) < 0;
  }

  // Verificar si es posterior a otra fecha
  isAfter(other: LocalizedDate): boolean {
    return this.compare(other) > 0;
  }

  // Clonar la fecha
  clone(): LocalizedDate {
    return new LocalizedDate(new Date(this.date), this.config);
  }

  // Cambiar propiedades de la fecha
  with(changes: { year?: number; month?: number; day?: number }): LocalizedDate {
    const newDate = new Date(this.date);
    if (changes.year !== undefined) newDate.setFullYear(changes.year);
    if (changes.month !== undefined) newDate.setMonth(changes.month - 1);
    if (changes.day !== undefined) newDate.setDate(changes.day);
    return new LocalizedDate(newDate, this.config);
  }

  // Obtener timestamp
  getTime(): number {
    return this.date.getTime();
  }

  // Obtener configuración de locale
  getLocaleConfig(): LocaleConfig {
    return this.config;
  }
}

// Funciones de utilidad

// Obtener fecha actual con configuración del usuario
export function getLocalizedDate(config?: LocaleConfig): LocalizedDate {
  return LocalizedDate.now(config);
}

// Obtener fecha actual con configuración de Argentina (compatibilidad)
export function getArgentinaDate(): LocalizedDate {
  return new LocalizedDate(undefined, {
    timezone: ARGENTINA_TIMEZONE,
    locale: ARGENTINA_LOCALE,
    weekStartsOn: 1
  });
}

// Parsear fecha desde string con configuración del usuario
export function parseDate(dateStr: string, config?: LocaleConfig): LocalizedDate {
  return LocalizedDate.fromISO(dateStr, config);
}

// Formatear fecha ISO (siempre igual, independiente del locale)
export function formatDateISO(date: Date | LocalizedDate): string {
  if (date instanceof LocalizedDate) {
    return date.formatISO();
  }
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Normalizar fechas de diferentes formatos a ISO con configuración dinámica
export function normalizeDateInput(input: string, config?: LocaleConfig): string {
  // Si ya está en formato YYYY-MM-DD, devolver como está
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }

  // Detectar formato según configuración
  const localeConfig = config || getGlobalLocaleConfig();
  
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(input)) {
    const date = LocalizedDate.fromShort(input, config);
    return date.formatISO();
  }

  throw new Error(`Formato de fecha no válido: ${input}. Use YYYY-MM-DD o el formato apropiado para su región`);
}

// Validar que una fecha string sea válida
export function isValidDate(dateStr: string, config?: LocaleConfig): boolean {
  try {
    parseDate(dateStr, config);
    return true;
  } catch {
    return false;
  }
}
