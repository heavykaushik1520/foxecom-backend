# Database Migrations

## Add Shipping Fields to Orders Table

### Problem
The Order model defines shipping-related fields (`shiprocketOrderId`, `shipmentId`, `awbCode`, `courierName`, `shipmentStatus`) that don't exist in the database table yet, causing SQL errors when querying orders.

### Solution
Run the migration script to add the missing columns to the `orders` table.

### How to Run

**Option 1: Using MySQL Command Line**
```bash
mysql -u your_username -p your_database_name < migrations/add_shipping_fields_to_orders.sql
```

**Option 2: Using MySQL Workbench or phpMyAdmin**
1. Open the SQL script: `migrations/add_shipping_fields_to_orders.sql`
2. Copy the SQL commands
3. Execute them in your database management tool

**Option 3: Using Node.js (if you have a database connection)**
```javascript
const mysql = require('mysql2/promise');
const fs = require('fs');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: 'your_host',
    user: 'your_username',
    password: 'your_password',
    database: 'your_database'
  });

  const sql = fs.readFileSync('migrations/add_shipping_fields_to_orders.sql', 'utf8');
  await connection.query(sql);
  await connection.end();
  console.log('Migration completed successfully!');
}

runMigration().catch(console.error);
```

### What the Migration Does
Adds the following columns to the `orders` table:
- `shiprocketOrderId` (VARCHAR(255), nullable)
- `shipmentId` (VARCHAR(255), nullable)
- `awbCode` (VARCHAR(255), nullable)
- `courierName` (VARCHAR(255), nullable)
- `shipmentStatus` (VARCHAR(255), default: 'not created')

### Note
- The code has been updated to work without these columns (by explicitly selecting only existing columns)
- After running the migration, you can remove the explicit `attributes` arrays from the queries if desired
- The migration uses `IF NOT EXISTS` which may not work in older MySQL versions - if you get an error, remove those keywords
