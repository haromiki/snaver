import * as schema from "@shared/schema";

let db: any;

// 로컬 PostgreSQL 사용
import("pg").then(({ Pool }) => {
  import("drizzle-orm/node-postgres").then(({ drizzle }) => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    db = drizzle(pool, { schema });
    console.log("✅ Using local PostgreSQL with pg + drizzle");
  });
});

export { db };