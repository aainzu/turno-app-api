import { ExcelRow, TurnoInsert } from '../models/turno.model.js';

// Función para mapear datos de Excel a entidades de turno
export function mapExcelRowToTurno(excelRow: ExcelRow): TurnoInsert {
  return {
    fecha: excelRow.fecha,
    turno: excelRow.vacaciones ? undefined : excelRow.turno as 'mañana' | 'tarde' | 'noche',
    startShift: excelRow.vacaciones ? undefined : (excelRow as any).startshift,
    endShift: excelRow.vacaciones ? undefined : (excelRow as any).endshift,
    esVacaciones: excelRow.vacaciones,
    notas: excelRow.notas || '',
  };
}

// Función para mapear múltiples filas de Excel
export function mapExcelRowsToTurnos(excelRows: ExcelRow[]): TurnoInsert[] {
  return excelRows.map(mapExcelRowToTurno);
}

// Función para validar estructura de Excel
export function validateExcelHeaders(headers: string[]): {
  valid: boolean;
  missingHeaders: string[];
  warnings: string[];
} {
  const requiredHeaders = ['fecha', 'turno', 'vacaciones'];
  const optionalHeaders = ['notas'];

  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
  const missingHeaders = requiredHeaders.filter(
    header => !normalizedHeaders.includes(header)
  );

  const warnings: string[] = [];

  // Verificar headers opcionales
  optionalHeaders.forEach(header => {
    if (!normalizedHeaders.includes(header)) {
      warnings.push(`Header opcional faltante: ${header}`);
    }
  });

  // Verificar headers extra
  const allExpectedHeaders = [...requiredHeaders, ...optionalHeaders];
  const extraHeaders = normalizedHeaders.filter(
    header => !allExpectedHeaders.includes(header)
  );

  if (extraHeaders.length > 0) {
    warnings.push(`Headers extra encontrados (serán ignorados): ${extraHeaders.join(', ')}`);
  }

  return {
    valid: missingHeaders.length === 0,
    missingHeaders,
    warnings,
  };
}

// Función para detectar y reportar problemas comunes en datos de Excel
export function analyzeExcelDataQuality(excelRows: ExcelRow[]): {
  totalRows: number;
  validRows: number;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let validRows = 0;

  // Verificar fechas duplicadas
  const fechasVistas = new Set<string>();
  const fechasDuplicadas = new Set<string>();

  excelRows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 porque filas empiezan en 1 y hay headers

    try {
      // Verificar fecha
      if (!row.fecha) {
        issues.push(`Fila ${rowNumber}: Fecha faltante`);
        return;
      }

      // Verificar duplicados
      if (fechasVistas.has(row.fecha)) {
        fechasDuplicadas.add(row.fecha);
      } else {
        fechasVistas.add(row.fecha);
      }

      // Verificar consistencia de vacaciones y turno
      if (row.vacaciones && row.turno) {
        suggestions.push(`Fila ${rowNumber}: Tiene turno y vacaciones, se priorizarán las vacaciones`);
      }

      validRows++;

    } catch (error: any) {
      issues.push(`Fila ${rowNumber}: Error procesando fila - ${error.message}`);
    }
  });

  // Reportar fechas duplicadas
  if (fechasDuplicadas.size > 0) {
    issues.push(`Fechas duplicadas en el archivo: ${Array.from(fechasDuplicadas).join(', ')}`);
    suggestions.push('Considere eliminar filas duplicadas antes de subir el archivo');
  }

  // Verificar si hay muchas filas vacías
  const emptyRows = excelRows.length - validRows;
  if (emptyRows > excelRows.length * 0.1) {
    issues.push(`${emptyRows} filas parecen estar vacías o con datos inválidos`);
    suggestions.push('Verifique que todas las filas tengan datos válidos');
  }

  return {
    totalRows: excelRows.length,
    validRows,
    issues,
    suggestions,
  };
}

// Función para generar preview de datos antes de importar
export function generateExcelPreview(excelRows: ExcelRow[], maxRows: number = 5): {
  headers: string[];
  previewRows: any[];
  totalRows: number;
  hasMore: boolean;
} {
  const headers = ['fecha', 'turno', 'vacaciones', 'notas'];

  const previewRows = excelRows
    .slice(0, maxRows)
    .map(row => ({
      fecha: row.fecha,
      turno: row.vacaciones ? 'Vacaciones' : (row.turno || 'Sin turno'),
      vacaciones: row.vacaciones ? 'Sí' : 'No',
      notas: row.notas || '',
    }));

  return {
    headers,
    previewRows,
    totalRows: excelRows.length,
    hasMore: excelRows.length > maxRows,
  };
}
