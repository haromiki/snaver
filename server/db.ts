import * as schema from "@shared/schema";

let db: any;

if (process.env.VITE_IS_SERVER_DEPLOY === "true") {
  // 👇️ DO NOT MODIFY BELOW: Server-specific database driver for PostgreSQL (pg + drizzle)
  import("pg").then(({ Pool }) => {
    import("drizzle-orm/node-postgres").then(({ drizzle }) => {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
      });

      db = drizzle(pool, { schema });
      console.log("✅ Using pg + drizzle on server");
    });
  });
  // 👆️ DO NOT MODIFY ABOVE
} else {
  // ✅ Replit / Dev environment (Neon serverless)
  import("@neondatabase/serverless").then(({ Pool, neonConfig }) => {
    import("drizzle-orm/neon-serverless").then(({ drizzle }) => {
      import("ws").then((ws) => {
        neonConfig.webSocketConstructor = ws.default;

        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
        });

        db = drizzle({ client: pool, schema });
        console.log("✅ Using Neon + drizzle on Replit");
      });
    });
  });
}

export { db };
