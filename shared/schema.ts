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
  email: varchar("email", { length: 120 }).unique(), // 이메일은 이제 옵셔널
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Keywords table - 자주 사용하는 키워드 관리
export const keywords = pgTable("keywords", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  keyword: varchar("keyword", { length: 255 }).notNull(),
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

// Statistics table - 통계 데이터 3년 보관
export const statisticsTypeEnum = pgEnum("statistics_type", ["daily", "weekly", "monthly", "yearly"]);

// Weekly mini charts table - 1주일 미니 그래프 스냅샷 3년 보관
export const weeklyCharts = pgTable("weekly_charts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  productId: bigint("product_id", { mode: "number" }).notNull().references(() => products.id, { onDelete: "cascade" }),
  weekStart: timestamp("week_start", { withTimezone: true }).notNull(), // 한국시간 기준 주 시작일
  chartData: text("chart_data").notNull(), // JSON 형태의 일주일 순위 데이터
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  productWeekIndex: index("idx_weekly_charts_product_week").on(table.productId, table.weekStart),
}));

export const statistics = pgTable("statistics", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  productId: bigint("product_id", { mode: "number" }).notNull().references(() => products.id, { onDelete: "cascade" }),
  type: statisticsTypeEnum("type").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  bestRank: integer("best_rank"),
  worstRank: integer("worst_rank"),
  averageRank: integer("average_rank"),
  foundRate: integer("found_rate"), // 발견율 (%)
  totalChecks: integer("total_checks").notNull().default(0),
  avgPrice: bigint("avg_price", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  productPeriodIndex: index("idx_statistics_product_period").on(table.productId, table.type, table.periodStart),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  products: many(products),
  keywords: many(keywords),
}));

export const keywordsRelations = relations(keywords, ({ one }) => ({
  user: one(users, {
    fields: [keywords.userId],
    references: [users.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  user: one(users, {
    fields: [products.userId],
    references: [users.id],
  }),
  tracks: many(tracks),
  statistics: many(statistics),
  weeklyCharts: many(weeklyCharts),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  product: one(products, {
    fields: [tracks.productId],
    references: [products.id],
  }),
}));

export const statisticsRelations = relations(statistics, ({ one }) => ({
  product: one(products, {
    fields: [statistics.productId],
    references: [products.id],
  }),
}));

export const weeklyChartsRelations = relations(weeklyCharts, ({ one }) => ({
  product: one(products, {
    fields: [weeklyCharts.productId],
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
  email: z.string().email("올바른 이메일 주소를 입력하세요").optional(), // 이메일은 이제 옵셔널
});

export const insertKeywordSchema = createInsertSchema(keywords).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  keyword: z.string().min(1, "키워드를 입력하세요").max(255, "키워드는 최대 255자까지 가능합니다"),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  productName: z.string().min(1, "제품명을 입력하세요").max(200, "제품명은 최대 200자까지 가능합니다"),
  intervalMin: z.number().refine(val => [60, 360, 720, 1440].includes(val), "추적 주기는 1, 6, 12, 24시간 중 선택해야 합니다"),
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
export type Keyword = typeof keywords.$inferSelect;
export type InsertKeyword = z.infer<typeof insertKeywordSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Track = typeof tracks.$inferSelect;
export type Statistic = typeof statistics.$inferSelect;
export type WeeklyChart = typeof weeklyCharts.$inferSelect;
export type LoginRequest = z.infer<typeof loginSchema>;

// 새로운 랭킹 시스템 타입들
export type RankQuery = z.infer<typeof rankQuerySchema>;
export type RankResult = z.infer<typeof rankResultSchema>;
