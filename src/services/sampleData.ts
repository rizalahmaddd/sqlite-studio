import { loadDatabase, inspectSchema } from './sqliteEngine';
import type { DatabaseMetadata } from '../types/database';

export async function createSampleEcommerceDb(): Promise<DatabaseMetadata> {
  const dbId = 'demo-ecommerce-' + Date.now();
  const db = await loadDatabase(dbId);

  const initSql = `
    PRAGMA foreign_keys = ON;

    -- 1. Customers Table
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      balance REAL DEFAULT 0.0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      metadata TEXT,
      avatar BLOB
    );

    CREATE INDEX idx_customers_email ON customers(email);

    -- 2. Products Table
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      specs TEXT
    );

    CREATE INDEX idx_products_category ON products(category);

    -- 3. Orders Table
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      order_code TEXT UNIQUE NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'completed',
      created_at TEXT DEFAULT (datetime('now')),
      shipping_address TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    -- 4. Order Items Table
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    -- 5. Reviews Table
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      is_verified INTEGER DEFAULT 1,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    -- Seed Customers
    INSERT INTO customers (name, email, balance, status, metadata, avatar) VALUES
    ('Ahmad Rizal', 'rizal@antigravity.dev', 1250.50, 'active', '{"role":"lead_architect","vip":true,"theme":"dark","tags":["tech","cloud"]}', X'89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082'),
    ('Budi Santoso', 'budi.santoso@company.id', 450.00, 'active', '{"role":"data_engineer","vip":false,"notifications":{"email":true,"sms":false}}', X'89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082'),
    ('Citra Lestari', 'citra.lestari@gmail.com', 89.20, 'pending', '{"role":"buyer","vip":false,"preferred_currency":"IDR"}', NULL),
    ('Dewi Anggraini', 'dewi@techflow.io', 3420.00, 'active', '{"role":"enterprise_buyer","vip":true,"credit_limit":10000}', NULL),
    ('Eko Prasetyo', 'eko.prasetyo@outlook.com', 0.00, 'suspended', '{"reason":"chargeback_risk","flagged":true}', NULL);

    -- Seed Products
    INSERT INTO products (title, category, price, stock, sku, specs) VALUES
    ('MacBook Pro M3 Max 16-inch', 'Laptops', 3499.00, 15, 'MBP-M3M-16-1TB', '{"ram":"36GB","storage":"1TB SSD","cpu":"14-core","color":"Space Black"}'),
    ('Logitech MX Master 3S', 'Peripherals', 99.99, 120, 'LOGI-MXM3S-BLK', '{"sensor":"8000 DPI","connectivity":"Bluetooth/Bolt","battery":"70 days"}'),
    ('Dell UltraSharp 32 4K USB-C Hub Monitor', 'Monitors', 799.00, 24, 'DELL-U3223QE', '{"resolution":"3840x2160","panel":"IPS Black","hdr":"DisplayHDR 400"}'),
    ('Keychron Q1 Pro Wireless Custom Mechanical Keyboard', 'Keyboards', 199.00, 48, 'KC-Q1P-RED', '{"switches":"Gateron Jupiter Red","layout":"75%","body":"CNC Aluminum"}'),
    ('Sony WH-1000XM5 Wireless Noise-Cancelling Headphones', 'Audio', 398.00, 65, 'SONY-WH1000XM5', '{"anc":"Auto NC Optimizer","battery":"30 hours","codec":["LDAC","AAC"]}');

    -- Seed Orders
    INSERT INTO orders (customer_id, order_code, total_amount, status, shipping_address) VALUES
    (1, 'ORD-2026-001', 3598.99, 'completed', 'Sudirman Central Business District, Tower 2, Lt 18, Jakarta'),
    (2, 'ORD-2026-002', 199.00, 'processing', 'Jl. Kaliurang KM 5.5, Sleman, DI Yogyakarta'),
    (1, 'ORD-2026-003', 799.00, 'completed', 'Sudirman Central Business District, Tower 2, Lt 18, Jakarta'),
    (4, 'ORD-2026-004', 3897.00, 'shipped', 'Jl. Gatot Subroto No. 42, Bandung, Jawa Barat');

    -- Seed Order Items
    INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    (1, 1, 1, 3499.00),
    (1, 2, 1, 99.99),
    (2, 4, 1, 199.00),
    (3, 3, 1, 799.00),
    (4, 1, 1, 3499.00),
    (4, 5, 1, 398.00);

    -- Seed Reviews
    INSERT INTO reviews (product_id, customer_id, rating, comment, is_verified) VALUES
    (1, 1, 5, 'Performa M3 Max luar biasa untuk kompilasi lokal dan pengolahan model AI!', 1),
    (2, 1, 5, 'Scroll wheel MagSpeed sangat mempermudah browsing data tabel ribuan baris.', 1),
    (4, 2, 4, 'Build quality sangat kokoh, suara switch empuk namun agak berat untuk dibawa travel.', 1),
    (3, 1, 5, 'IPS Black panel menghasilkan kontras yang sangat memuaskan di dark mode.', 1);
  `;

  db.exec(initSql);
  const tables = inspectSchema(dbId);
  const binary = db.export();

  return {
    id: dbId,
    name: 'ecommerce_store.db',
    alias: 'E-Commerce Store (Demo)',
    color: '#6366f1',
    sizeBytes: binary.length,
    tables,
    isDirty: false,
    syncMode: 'sandbox',
    walDetected: false,
    companionFiles: { wal: false, shm: false },
    lastModified: Date.now()
  };
}
