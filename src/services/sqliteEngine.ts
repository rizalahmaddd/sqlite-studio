import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { TableSchema, ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, SafeGuardAlert } from '../types/database';

let SQLPromise: Promise<SqlJsStatic> | null = null;
const activeDatabases = new Map<string, Database>();

// COUNT(*) walks the whole table, which gets slow on big databases, so counts are
// kept per table and only dropped when that table gains or loses rows.
const rowCountCache = new Map<string, Map<string, number>>();

// The update hook misses these: truncating DELETE, REPLACE conflicts, DDL and rollbacks.
const COUNT_UNSAFE_SQL = /\b(delete|replace|drop|create|alter|rollback|attach|detach|vacuum)\b/i;

function resetRowCounts(id: string): void {
  rowCountCache.get(id)?.clear();
}

function trackRowCountChanges(id: string, db: Database): void {
  db.updateHook((operation, _database, table) => {
    if (operation !== 'update') {
      rowCountCache.get(id)?.delete(table);
    }
  });
}

async function fetchValidWasmBytes(): Promise<ArrayBuffer> {
  const candidateUrls = [
    sqlWasmUrl,
    `${import.meta.env.BASE_URL || '/'}sql-wasm.wasm`,
    '/sql-wasm.wasm'
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        // Ensure WebAssembly magic bytes (0x00, 0x61, 0x73, 0x6d -> '\0asm')
        if (bytes.length > 4 && bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d) {
          return buf;
        }
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error('Could not fetch valid SQLite WebAssembly binary from any source.');
}

export async function getSqlJs(): Promise<SqlJsStatic> {
  if (!SQLPromise) {
    SQLPromise = (async () => {
      try {
        const wasmBuffer = await fetchValidWasmBytes();
        return await initSqlJs({
          instantiateWasm(imports, successCallback) {
            WebAssembly.instantiate(wasmBuffer, imports)
              .then(output => (successCallback as any)(output.instance, output.module))
              .catch(err => {
                console.error('WebAssembly instantiate error:', err);
              });
            return {};
          }
        });
      } catch (err) {
        SQLPromise = null;
        throw err;
      }
    })();
  }
  return SQLPromise;
}

/**
 * Validate SQLite magic header bytes ('SQLite format 3\0')
 */
export function validateSqliteHeader(buffer: Uint8Array): { valid: boolean; reason?: string } {
  if (!buffer || buffer.length === 0) {
    return { valid: false, reason: 'File kosong (0 bytes)' };
  }
  if (buffer.length < 100) {
    return { valid: false, reason: 'Ukuran file terlalu kecil (minimal 100 bytes untuk header SQLite)' };
  }
  const magic = 'SQLite format 3\0';
  let headerStr = '';
  for (let i = 0; i < 16; i++) {
    headerStr += String.fromCharCode(buffer[i]);
  }
  if (headerStr !== magic) {
    return { 
      valid: false, 
      reason: 'Bukan file SQLite yang valid atau file terenkripsi (SQLCipher). Header magic bytes tidak cocok.' 
    };
  }
  return { valid: true };
}

/**
 * Check bytes 18 & 19 to determine if database was in WAL mode (value 2)
 */
export function isWalMode(buffer: Uint8Array): boolean {
  if (buffer.length < 20) return false;
  // SQLite header: byte 18: file format write version (1 for legacy, 2 for WAL)
  // byte 19: file format read version (1 for legacy, 2 for WAL)
  return buffer[18] === 2 || buffer[19] === 2;
}

/**
 * Convert Uint8Array to SQLite Hex Literal (X'...')
 */
export function uint8ArrayToHexLiteral(bytes: Uint8Array): string {
  let hex = "X'";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0').toUpperCase();
  }
  hex += "'";
  return hex;
}

/**
 * Safely escape SQL identifiers (table and column names)
 */
export function escapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function loadDatabase(id: string, buffer?: Uint8Array): Promise<Database> {
  const SQL = await getSqlJs();
  if (activeDatabases.has(id)) {
    activeDatabases.get(id)?.close();
  }
  const db = buffer ? new SQL.Database(buffer) : new SQL.Database();
  
  // Enable Foreign Key constraint enforcement by default
  try {
    db.exec('PRAGMA foreign_keys = ON;');
  } catch (err) {
    console.warn('Could not enable foreign keys:', err);
  }

  rowCountCache.set(id, new Map());
  trackRowCountChanges(id, db);
  activeDatabases.set(id, db);
  return db;
}

export function getDatabase(id: string): Database | undefined {
  return activeDatabases.get(id);
}

export function closeDatabase(id: string): void {
  const db = activeDatabases.get(id);
  if (db) {
    db.close();
    activeDatabases.delete(id);
    rowCountCache.delete(id);
  }
}

export function exportDatabaseBinary(id: string): Uint8Array {
  const db = activeDatabases.get(id);
  if (!db) throw new Error(`Database ${id} not found`);

  // sql.js closes and reopens the connection on export, which silently resets
  // connection state: foreign key enforcement goes back to OFF and hooks are lost.
  let foreignKeysOn = true;
  try {
    foreignKeysOn = Number(db.exec('PRAGMA foreign_keys;')[0]?.values[0]?.[0]) !== 0;
  } catch {
    // keep default
  }

  const binary = db.export();

  try {
    db.exec(`PRAGMA foreign_keys = ${foreignKeysOn ? 'ON' : 'OFF'};`);
  } catch (err) {
    console.warn('Could not restore foreign key setting after export:', err);
  }
  trackRowCountChanges(id, db);
  return binary;
}

/**
 * Current database size in bytes, without exporting it
 */
export function getDatabaseSize(id: string): number {
  const db = activeDatabases.get(id);
  if (!db) return 0;
  try {
    const res = db.exec('SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size();');
    return Number(res[0]?.values[0]?.[0]) || 0;
  } catch {
    return 0;
  }
}

/**
 * Inspect schema, columns, constraints, foreign keys, and indexes
 */
export function inspectSchema(id: string): TableSchema[] {
  const db = activeDatabases.get(id);
  if (!db) return [];

  const tables: TableSchema[] = [];
  const cachedCounts = rowCountCache.get(id) ?? new Map<string, number>();
  const freshCounts = new Map<string, number>();
  try {
    // Triggers can change other tables in ways the update hook does not report
    const hasTriggers = db.exec(`SELECT 1 FROM sqlite_master WHERE type = 'trigger' LIMIT 1;`).length > 0;

    const masterRes = db.exec(`
      SELECT name, type, sql 
      FROM sqlite_master 
      WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC;
    `);

    if (masterRes.length > 0 && masterRes[0].values) {
      for (const row of masterRes[0].values) {
        const name = String(row[0]);
        const type = String(row[1]) as 'table' | 'view';
        const ddl = String(row[2] || '');

        // 1. Column Information
        const colRes = db.exec(`PRAGMA table_info(${escapeIdentifier(name)});`);
        const columns: ColumnInfo[] = [];
        const primaryKeys: string[] = [];

        if (colRes.length > 0 && colRes[0].values) {
          for (const colRow of colRes[0].values) {
            const colName = String(colRow[1]);
            const isPk = Boolean(colRow[5]);
            columns.push({
              cid: Number(colRow[0]),
              name: colName,
              type: String(colRow[2] || 'TEXT'),
              notnull: Boolean(colRow[3]),
              dflt_value: colRow[4],
              pk: isPk
            });
            if (isPk) {
              primaryKeys.push(colName);
            }
          }
        }

        // 2. Foreign Keys
        const fkRes = db.exec(`PRAGMA foreign_key_list(${escapeIdentifier(name)});`);
        const foreignKeys: ForeignKeyInfo[] = [];
        if (fkRes.length > 0 && fkRes[0].values) {
          for (const fkRow of fkRes[0].values) {
            foreignKeys.push({
              id: Number(fkRow[0]),
              seq: Number(fkRow[1]),
              table: String(fkRow[2]),
              from: String(fkRow[3]),
              to: String(fkRow[4]),
              on_update: String(fkRow[5]),
              on_delete: String(fkRow[6])
            });
          }
        }

        // 3. Indexes
        const idxRes = db.exec(`PRAGMA index_list(${escapeIdentifier(name)});`);
        const indexes: IndexInfo[] = [];
        if (idxRes.length > 0 && idxRes[0].values) {
          for (const idxRow of idxRes[0].values) {
            indexes.push({
              seq: Number(idxRow[0]),
              name: String(idxRow[1]),
              unique: Boolean(idxRow[2]),
              origin: String(idxRow[3]),
              partial: Boolean(idxRow[4])
            });
          }
        }

        // 4. Row Count
        const canCacheCount = type === 'table' && !hasTriggers && !/^\s*CREATE\s+VIRTUAL|WITHOUT\s+ROWID/i.test(ddl);
        let rowCount = 0;
        if (canCacheCount && cachedCounts.has(name)) {
          rowCount = cachedCounts.get(name)!;
          freshCounts.set(name, rowCount);
        } else {
          try {
            const countRes = db.exec(`SELECT COUNT(*) FROM ${escapeIdentifier(name)};`);
            if (countRes.length > 0 && countRes[0].values.length > 0) {
              rowCount = Number(countRes[0].values[0][0]);
              if (canCacheCount) freshCounts.set(name, rowCount);
            }
          } catch {
            // View or virtual table count fallback
          }
        }

        tables.push({
          name,
          type,
          columns,
          primaryKeys,
          foreignKeys,
          indexes,
          rowCount,
          ddl
        });
      }
    }
  } catch (err) {
    console.error('Error inspecting schema:', err);
  }

  if (rowCountCache.has(id)) {
    rowCountCache.set(id, freshCounts);
  }
  return tables;
}

/**
 * Execute raw SQL query with benchmark timing
 */
export function executeRawQuery(id: string, sqlQuery: string): QueryResult {
  const db = activeDatabases.get(id);
  if (!db) {
    return {
      columns: [],
      values: [],
      executionTimeMs: 0,
      query: sqlQuery,
      error: 'Database is not loaded or has been closed'
    };
  }

  if (COUNT_UNSAFE_SQL.test(sqlQuery)) {
    resetRowCounts(id);
  }

  const startTime = performance.now();
  try {
    const trimmed = sqlQuery.trim();
    const res = db.exec(trimmed);
    const endTime = performance.now();
    const executionTimeMs = Math.round((endTime - startTime) * 100) / 100;

    let rowsAffected = undefined;
    try {
      rowsAffected = db.getRowsModified();
    } catch {
      // getRowsModified might throw if not a modifying query
    }

    if (res.length > 0) {
      return {
        columns: res[0].columns,
        values: res[0].values,
        rowsAffected,
        executionTimeMs,
        query: sqlQuery
      };
    } else {
      return {
        columns: [],
        values: [],
        rowsAffected,
        executionTimeMs,
        query: sqlQuery
      };
    }
  } catch (err: any) {
    const endTime = performance.now();
    return {
      columns: [],
      values: [],
      executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
      query: sqlQuery,
      error: err.message || String(err)
    };
  }
}

/**
 * Safe query check to detect dangerous UPDATE/DELETE without WHERE
 */
export function checkDestructiveQuery(sqlQuery: string): SafeGuardAlert | null {
  const clean = sqlQuery.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const upper = clean.toUpperCase();

  // Check DELETE without WHERE
  const deleteMatch = upper.match(/^DELETE\s+FROM\s+["`]?([A-Za-z0-9_]+)["`]?(\s*;?|\s+WHERE\s+(.*))?$/i);
  if (deleteMatch) {
    const hasWhere = upper.includes('WHERE');
    if (!hasWhere) {
      return {
        statementType: 'DELETE',
        tableName: deleteMatch[1],
        query: sqlQuery
      };
    }
  }

  // Check UPDATE without WHERE
  const updateMatch = upper.match(/^UPDATE\s+["`]?([A-Za-z0-9_]+)["`]?\s+SET\s+(.+)$/i);
  if (updateMatch) {
    const hasWhere = upper.includes('WHERE');
    if (!hasWhere) {
      return {
        statementType: 'UPDATE',
        tableName: updateMatch[1],
        query: sqlQuery
      };
    }
  }

  // Check DROP TABLE
  const dropMatch = upper.match(/^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?["`]?([A-Za-z0-9_]+)["`]?/i);
  if (dropMatch) {
    return {
      statementType: 'DROP',
      tableName: dropMatch[2],
      query: sqlQuery
    };
  }

  return null;
}

/**
 * Execute within an atomic transaction with auto-rollback
 */
export function executeInTransaction(id: string, statements: string[]): { success: boolean; error?: string } {
  const db = activeDatabases.get(id);
  if (!db) return { success: false, error: 'Database not available' };

  resetRowCounts(id);
  try {
    db.exec('BEGIN TRANSACTION;');
    for (const stmt of statements) {
      db.exec(stmt);
    }
    db.exec('COMMIT;');
    return { success: true };
  } catch (err: any) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // rollback fallback
    }
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Format a value for SQL statements
 */
export function formatSqlValue(val: any): string {
  if (val === null || val === undefined) {
    return 'NULL';
  }
  if (val instanceof Uint8Array) {
    return uint8ArrayToHexLiteral(val);
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return 'NULL';
    return String(val);
  }
  if (typeof val === 'boolean') {
    return val ? '1' : '0';
  }
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Safe Cell Update with Composite PK / Rowid support
 */
export function updateCellValueWithKeys(
  id: string,
  tableName: string,
  whereKeys: Record<string, any>,
  targetColumn: string,
  newValue: any
): { success: boolean; error?: string } {
  const db = activeDatabases.get(id);
  if (!db) return { success: false, error: 'Database not found' };

  try {
    const formattedValue = formatSqlValue(newValue);
    const whereConditions = Object.entries(whereKeys).map(([col, val]) => {
      if (col === '__studio_rowid__') {
        return `rowid = ${formatSqlValue(val)}`;
      }
      return `${escapeIdentifier(col)} = ${formatSqlValue(val)}`;
    });

    if (whereConditions.length === 0) {
      return { success: false, error: 'Cannot update: No identifying key found' };
    }

    const query = `UPDATE ${escapeIdentifier(tableName)} SET ${escapeIdentifier(targetColumn)} = ${formattedValue} WHERE ${whereConditions.join(' AND ')};`;
    db.exec(query);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Safe Cell Update (Backwards compatibility)
 */
export function updateCellValue(
  id: string,
  tableName: string,
  pkColumn: string,
  pkValue: any,
  targetColumn: string,
  newValue: any
): { success: boolean; error?: string } {
  return updateCellValueWithKeys(id, tableName, { [pkColumn]: pkValue }, targetColumn, newValue);
}

/**
 * Delete Rows by Composite Keys or Rowid
 */
export function deleteRowsWithKeys(
  id: string,
  tableName: string,
  rowsKeys: Record<string, any>[]
): { success: boolean; error?: string } {
  const db = activeDatabases.get(id);
  if (!db) return { success: false, error: 'Database not found' };

  try {
    db.exec('BEGIN TRANSACTION;');
    for (const keys of rowsKeys) {
      const whereConditions = Object.entries(keys).map(([col, val]) => {
        if (col === '__studio_rowid__') {
          return `rowid = ${formatSqlValue(val)}`;
        }
        return `${escapeIdentifier(col)} = ${formatSqlValue(val)}`;
      });
      if (whereConditions.length > 0) {
        db.exec(`DELETE FROM ${escapeIdentifier(tableName)} WHERE ${whereConditions.join(' AND ')};`);
      }
    }
    db.exec('COMMIT;');
    return { success: true };
  } catch (err: any) {
    try { db.exec('ROLLBACK;'); } catch {}
    resetRowCounts(id);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Delete Rows by Primary Key (Backwards compatibility)
 */
export function deleteRowsByPk(
  id: string,
  tableName: string,
  pkColumn: string,
  pkValues: any[]
): { success: boolean; error?: string } {
  const rowsKeys = pkValues.map(v => ({ [pkColumn]: v }));
  return deleteRowsWithKeys(id, tableName, rowsKeys);
}

/**
 * Insert a new record
 */
export function insertRecord(
  id: string,
  tableName: string,
  record: Record<string, any>
): { success: boolean; error?: string } {
  const db = activeDatabases.get(id);
  if (!db) return { success: false, error: 'Database not found' };

  try {
    const cols = Object.keys(record);
    if (cols.length === 0) {
      db.exec(`INSERT INTO ${escapeIdentifier(tableName)} DEFAULT VALUES;`);
      return { success: true };
    }
    const escapedCols = cols.map(c => escapeIdentifier(c)).join(', ');
    const values = cols.map(c => formatSqlValue(record[c])).join(', ');

    const query = `INSERT INTO ${escapeIdentifier(tableName)} (${escapedCols}) VALUES (${values});`;
    db.exec(query);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Fetch records from parent table to populate Foreign Key relation search dropdowns
 */
export function getRelatedTableRecords(
  dbId: string, 
  parentTable: string, 
  targetCol: string
): { value: any; label: string; detail?: string }[] {
  const db = activeDatabases.get(dbId);
  if (!db) return [];

  try {
    const res = db.exec(`SELECT * FROM ${escapeIdentifier(parentTable)} LIMIT 150;`);
    if (res.length === 0 || !res[0].values) return [];

    const columns = res[0].columns;
    const targetIdx = columns.indexOf(targetCol);
    if (targetIdx < 0) return [];

    // Find candidate display columns like name, title, email, label, username, code
    const displayColIdx = columns.findIndex(c => 
      /^(name|title|email|label|username|code|description|sku)$/i.test(c)
    );

    // Find secondary detail column like price, category, status
    const detailColIdx = columns.findIndex(c => 
      c !== targetCol && c !== columns[displayColIdx] && /^(price|category|status|role|total_amount)$/i.test(c)
    );

    return res[0].values.map(row => {
      const val = row[targetIdx];
      let label = String(val);
      if (displayColIdx >= 0 && row[displayColIdx] !== null) {
        label = `${row[displayColIdx]}`;
      }
      let detail = undefined;
      if (detailColIdx >= 0 && row[detailColIdx] !== null) {
        detail = `${columns[detailColIdx]}: ${row[detailColIdx]}`;
      }
      return { value: val, label, detail };
    });
  } catch (err) {
    console.warn(`Error getting related records for ${parentTable}:`, err);
    return [];
  }
}

/**
 * Fetch distinct values of a column for quick category/status suggestion chips
 */
export function getDistinctColumnValues(
  dbId: string,
  tableName: string,
  column: string
): string[] {
  const db = activeDatabases.get(dbId);
  if (!db) return [];

  try {
    const query = `SELECT DISTINCT ${escapeIdentifier(column)} FROM ${escapeIdentifier(tableName)} WHERE ${escapeIdentifier(column)} IS NOT NULL AND ${escapeIdentifier(column)} != '' LIMIT 12;`;
    const res = db.exec(query);
    if (res.length > 0 && res[0].values) {
      return res[0].values.map(r => String(r[0]));
    }
  } catch {
    // fallback
  }
  return [];
}

/**
 * Get human-readable summary for a foreign key cell tooltip
 */
export function getRelatedRecordSummary(
  dbId: string,
  parentTable: string,
  targetCol: string,
  targetValue: any
): string | null {
  const db = activeDatabases.get(dbId);
  if (!db || targetValue === null || targetValue === undefined) return null;

  try {
    const query = `SELECT * FROM ${escapeIdentifier(parentTable)} WHERE ${escapeIdentifier(targetCol)} = ${formatSqlValue(targetValue)} LIMIT 1;`;
    const res = db.exec(query);
    if (res.length > 0 && res[0].values && res[0].values.length > 0) {
      const row = res[0].values[0];
      const cols = res[0].columns;
      const nameCol = cols.find(c => /^(name|title|email|label|username|code)$/i.test(c));
      if (nameCol) {
        const val = row[cols.indexOf(nameCol)];
        return val ? String(val) : null;
      }
    }
  } catch {}
  return null;
}

/**
 * Generate full SQL Dump (DDL + INSERT statements) for a database
 */
export function exportDatabaseSqlDump(id: string): string {
  const db = activeDatabases.get(id);
  if (!db) throw new Error(`Database ${id} not found`);

  const lines: string[] = [
    `-- SQLite Studio SQL Dump`,
    `-- Generated: ${new Date().toISOString()}`,
    `PRAGMA foreign_keys=OFF;`,
    `BEGIN TRANSACTION;`,
    ``
  ];

  const tables = inspectSchema(id);
  for (const table of tables) {
    if (table.ddl) {
      lines.push(`${table.ddl};`);
      lines.push('');
    }

    if (table.type === 'table') {
      try {
        const rowsRes = db.exec(`SELECT * FROM ${escapeIdentifier(table.name)};`);
        if (rowsRes.length > 0 && rowsRes[0].values.length > 0) {
          const cols = rowsRes[0].columns.map(c => escapeIdentifier(c)).join(', ');
          for (const row of rowsRes[0].values) {
            const formattedVals = row.map(val => formatSqlValue(val)).join(', ');
            lines.push(`INSERT INTO ${escapeIdentifier(table.name)} (${cols}) VALUES (${formattedVals});`);
          }
          lines.push('');
        }
      } catch (err) {
        console.warn(`Could not dump data for table ${table.name}`, err);
      }
    }
  }

  lines.push(`COMMIT;`);
  return lines.join('\n');
}

/**
 * Clone an active database into a new in-memory instance
 */
export async function cloneDatabase(sourceId: string, targetId: string): Promise<Database> {
  const binary = exportDatabaseBinary(sourceId);
  return loadDatabase(targetId, binary);
}


