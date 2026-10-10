// Type definitions for SQLite Studio

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: any;
  pk: boolean;
}

export interface ForeignKeyInfo {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
}

export interface IndexInfo {
  seq: number;
  name: string;
  unique: boolean;
  origin: string;
  partial: boolean;
}

export interface TableSchema {
  name: string;
  type: 'table' | 'view';
  columns: ColumnInfo[];
  primaryKeys: string[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
  rowCount: number;
  ddl: string;
}

export interface DatabaseMetadata {
  id: string;
  name: string;
  alias?: string;
  color?: string;
  sizeBytes: number;
  tables: TableSchema[];
  isDirty: boolean;
  syncMode: 'direct' | 'sandbox';
  fileHandle?: any; // FileSystemFileHandle if supported
  walDetected: boolean;
  companionFiles: {
    wal: boolean;
    shm: boolean;
  };
  lastModified: number;
}

export interface QueryResult {
  columns: string[];
  values: any[][];
  rowsAffected?: number;
  executionTimeMs: number;
  query: string;
  error?: string;
}

export interface QueryPreset {
  id: string;
  title: string;
  description: string;
  sql: string;
  category: 'crud' | 'diagnostic' | 'maintenance' | 'custom';
}

export interface QueryHistoryItem {
  id: string;
  sql: string;
  timestamp: number;
  executionTimeMs: number;
  error?: string;
  rowCount?: number;
}

export interface CustomSnippet {
  id: string;
  title: string;
  description: string;
  sql: string;
  tags?: string[];
}

export interface SafeGuardAlert {
  statementType: 'UPDATE' | 'DELETE' | 'DROP';
  tableName: string;
  query: string;
  rowCountWarning?: number;
}

export type ActiveView = 'grid' | 'sql' | 'schema' | 'erd' | 'diff' | 'diagnostics';
