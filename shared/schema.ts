import { sql, relations } from "drizzle-orm";
import { 
  pgTable, 
  bigserial, 
  varchar, 
  text, 
  boolean, 
  integer, 
  bigint,
  timestamp,
  pgEnum,
  index
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User table
export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  email: varchar("email", { length: 120 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Product type enum
export const productTypeEnum = pgEnum("product_type", ["ad", "organic"]);

// Products table
export const products = pgTable("products", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  productName: varchar("product_name", { length: 200 }).notNull(),
  productNo: varchar("product_no", { length: 64 }).notNull(),
  keyword: varchar("keyword", { length: 200 }).notNull(),
  type: productTypeEnum("type").notNull(),
  intervalMin: integer("interval_min").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(1000),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueUserProduct: index("unique_user_product").on(table.userId, table.productNo, table.keyword, table.type),
}));

// Tracks table
export const tracks = pgTable("tracks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  productId: bigint("product_id", { mode: "number" }).notNull().references(() => products.id, { onDelete: "cascade" }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow(),
  isAd: boolean("is_ad").notNull(),
  page: integer("page"),
  rankOnPage: integer("rank_on_page"),
  globalRank: integer("global_rank"),
  priceKrw: bigint("price_krw", { mode: "number" }),
  mallName: text("mall_name"),
  productLink: text("product_link"),
}, (table) => ({
  productTimeIndex: index("idx_tracks_product_time").on(table.productId, table.checkedAt),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  user: one(users, {
    fields: [products.userId],
    references: [users.id],
  }),
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  product: one(products, {
    fields: [tracks.productId],
    references: [products.id],
  }),
}));

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  passwordHash: true,
}).extend({
  password: z.string().min(6, "비밀번호는 최소 6자 이상이어야 합니다"),
  username: z.string().min(3, "사용자명은 최소 3자 이상이어야 합니다").max(50, "사용자명은 최대 50자까지 가능합니다"),
  email: z.string().email("올바른 이메일 주소를 입력하세요"),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  productName: z.string().min(1, "제품명을 입력하세요").max(200, "제품명은 최대 200자까지 가능합니다"),
  intervalMin: z.number().refine(val => [5, 10, 15, 30, 60].includes(val), "추적 주기는 5, 10, 15, 30, 60분 중 선택해야 합니다"),
});

export const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, "아이디 또는 이메일을 입력하세요"),
  password: z.string().min(1, "비밀번호를 입력하세요"),
});

// 새로운 랭킹 시스템 DTO 타입들
export const rankQuerySchema = z.object({
  productId: z.string().min(1, "상품번호를 입력하세요"),
  keyword: z.string().min(1, "키워드를 입력하세요"),
  maxPages: z.number().optional().default(10), // 광고 검색용
});

export const rankResultSchema = z.object({
  productId: z.string(),
  storeName: z.string().optional(),
  storeLink: z.string().optional(),
  price: z.number().optional(),
  globalRank: z.number().optional(),
  page: z.number().optional(),
  rankInPage: z.number().optional(),
  found: z.boolean(),
  notes: z.array(z.string()).optional(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Track = typeof tracks.$inferSelect;
export type LoginRequest = z.infer<typeof loginSchema>;

// 새로운 랭킹 시스템 타입들
export type RankQuery = z.infer<typeof rankQuerySchema>;
export type RankResult = z.infer<typeof rankResultSchema>;
