import { 
  users, 
  products, 
  tracks,
  keywords,
  type User, 
  type InsertUser,
  type Product,
  type InsertProduct,
  type Track,
  type Keyword,
  type InsertKeyword
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, gte, lte, or } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser & { passwordHash: string }): Promise<User>;
  updateUserPassword(userId: number, newPasswordHash: string): Promise<void>;
  deleteUser(userId: number): Promise<void>;

  // Product operations
  getProducts(userId: number, filters?: { type?: string; active?: boolean }): Promise<Product[]>;
  getProduct(id: number, userId: number): Promise<Product | undefined>;
  createProduct(product: Omit<InsertProduct, 'userId'> & { userId: number }): Promise<Product>;
  updateProduct(id: number, userId: number, updates: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number, userId: number): Promise<boolean>;
  updateProductSortOrder(userId: number, productIds: number[]): Promise<void>;

  // Track operations
  getTracks(productId: number, from?: Date, to?: Date): Promise<Track[]>;
  createTrack(track: Omit<Track, 'id' | 'checkedAt'>): Promise<Track>;
  getLatestTrack(productId: number): Promise<Track | undefined>;
  getProductTracksInRange(productId: number, userId: number, fromDate: string, toDate: string): Promise<Track[]>;

  // Keywords operations
  getUserKeywords(userId: number): Promise<Keyword[]>;
  createKeyword(keywordData: InsertKeyword & { userId: number }): Promise<Keyword>;
  updateKeyword(keywordId: number, userId: number, updateData: Partial<InsertKeyword>): Promise<Keyword | null>;
  deleteKeyword(keywordId: number, userId: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    const allUsers = await db.select().from(users);
    return allUsers;
  }

  async createUser(user: InsertUser & { passwordHash: string }): Promise<User> {
    const [newUser] = await db
      .insert(users)
      .values(user)
      .returning();
    return newUser;
  }

  async updateUserPassword(userId: number, newPasswordHash: string): Promise<void> {
    await db
      .update(users)
      .set({ passwordHash: newPasswordHash })
      .where(eq(users.id, userId));
  }

  async deleteUser(userId: number): Promise<void> {
    // 사용자의 모든 제품의 트랙 데이터 삭제
    const userProductIds = await db.select({ id: products.id }).from(products).where(eq(products.userId, userId));
    const productIds = userProductIds.map(p => p.id);
    if (productIds.length > 0) {
      await db.delete(tracks).where(
        productIds.length === 1 
          ? eq(tracks.productId, productIds[0])
          : or(...productIds.map(id => eq(tracks.productId, id)))
      );
    }
    
    // 사용자의 모든 제품 삭제
    await db.delete(products).where(eq(products.userId, userId));
    
    // 사용자 삭제
    await db.delete(users).where(eq(users.id, userId));
  }

  // Product operations
  async getProducts(userId: number, filters?: { type?: string; active?: boolean }): Promise<Product[]> {
    const conditions = [eq(products.userId, userId)];

    if (filters?.type) {
      conditions.push(eq(products.type, filters.type as any));
    }

    if (filters?.active !== undefined) {
      conditions.push(eq(products.active, filters.active));
    }

    // 제품 목록 가져오기
    const productList = await db.select().from(products)
      .where(and(...conditions))
      .orderBy(asc(products.sortOrder), desc(products.createdAt));

    // 각 제품별로 최신 트랙 정보와 최근 2개 트랙 가져오기
    const productsWithTracks = await Promise.all(
      productList.map(async (product: Product) => {
        const latestTrack = await this.getLatestTrack(product.id);
        const recentTracks = await this.getRecentTracks(product.id, 5000);
        return {
          ...product,
          latestTrack,
          tracks: recentTracks
        };
      })
    );

    return productsWithTracks;
  }

  async getProduct(id: number, userId: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products)
      .where(and(eq(products.id, id), eq(products.userId, userId)));
    return product;
  }

  async createProduct(product: Omit<InsertProduct, 'userId'> & { userId: number }): Promise<Product> {
    const [newProduct] = await db
      .insert(products)
      .values(product)
      .returning();
    return newProduct;
  }

  async updateProduct(id: number, userId: number, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updatedProduct] = await db
      .update(products)
      .set(updates)
      .where(and(eq(products.id, id), eq(products.userId, userId)))
      .returning();
    return updatedProduct;
  }

  async deleteProduct(id: number, userId: number): Promise<boolean> {
    const result = await db
      .delete(products)
      .where(and(eq(products.id, id), eq(products.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async updateProductSortOrder(userId: number, productIds: number[]): Promise<void> {
    for (let i = 0; i < productIds.length; i++) {
      await db
        .update(products)
        .set({ sortOrder: i })
        .where(and(eq(products.id, productIds[i]), eq(products.userId, userId)));
    }
  }

  // Track operations
  async getTracks(productId: number, from?: Date, to?: Date): Promise<Track[]> {
    const conditions = [eq(tracks.productId, productId)];

    if (from) {
      conditions.push(gte(tracks.checkedAt, from));
    }

    if (to) {
      conditions.push(lte(tracks.checkedAt, to));
    }

    return await db.select().from(tracks)
      .where(and(...conditions))
      .orderBy(desc(tracks.checkedAt));
  }

  async createTrack(track: Omit<Track, 'id' | 'checkedAt'>): Promise<Track> {
    const [newTrack] = await db
      .insert(tracks)
      .values(track)
      .returning();
    return newTrack;
  }

  async getLatestTrack(productId: number): Promise<Track | undefined> {
    const [track] = await db.select().from(tracks)
      .where(eq(tracks.productId, productId))
      .orderBy(desc(tracks.checkedAt))
      .limit(1);
    return track;
  }

  async getRecentTracks(productId: number, limit: number = 2): Promise<Track[]> {
    const recentTracks = await db.select().from(tracks)
      .where(eq(tracks.productId, productId))
      .orderBy(desc(tracks.checkedAt))
      .limit(limit);
    return recentTracks;
  }

  async getProductTracksInRange(productId: number, userId: number, fromDate: string, toDate: string): Promise<Track[]> {
    // 제품 소유권 확인을 위해 product와 join
    const result = await db.select({
      id: tracks.id,
      productId: tracks.productId,
      checkedAt: tracks.checkedAt,
      isAd: tracks.isAd,
      page: tracks.page,
      rankOnPage: tracks.rankOnPage,
      globalRank: tracks.globalRank,
      priceKrw: tracks.priceKrw,
      mallName: tracks.mallName,
      productLink: tracks.productLink
    })
    .from(tracks)
    .innerJoin(products, eq(tracks.productId, products.id))
    .where(and(
      eq(tracks.productId, productId),
      eq(products.userId, userId),
      gte(tracks.checkedAt, new Date(fromDate)),
      lte(tracks.checkedAt, new Date(toDate))
    ))
    .orderBy(asc(tracks.checkedAt));
    
    return result;
  }

  // Keywords methods
  async getUserKeywords(userId: number): Promise<Keyword[]> {
    return await db
      .select()
      .from(keywords)
      .where(eq(keywords.userId, userId));
  }

  async createKeyword(keywordData: InsertKeyword & { userId: number }): Promise<Keyword> {
    const [result] = await db
      .insert(keywords)
      .values(keywordData)
      .returning();
    
    return result;
  }

  async updateKeyword(keywordId: number, userId: number, updateData: Partial<InsertKeyword>): Promise<Keyword | null> {
    const [result] = await db
      .update(keywords)
      .set(updateData)
      .where(and(
        eq(keywords.id, keywordId),
        eq(keywords.userId, userId)
      ))
      .returning();
    
    return result || null;
  }

  async deleteKeyword(keywordId: number, userId: number): Promise<boolean> {
    try {
      await db
        .delete(keywords)
        .where(and(
          eq(keywords.id, keywordId),
          eq(keywords.userId, userId)
        ));
      
      return true;
    } catch {
      return false;
    }
  }

  // 3년 이상 된 순위 추적 및 가격 데이터 자동 정리 (회원 계정, 키워드, 제품 데이터는 영구 보관)
  async cleanupOldData(): Promise<{ deletedTracks: number }> {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    
    try {
      // 3년 이상 된 순위 추적 데이터 삭제 (가격 정보 포함)
      const deletedTracksResult = await db
        .delete(tracks)
        .where(lte(tracks.checkedAt, threeYearsAgo));

      const result = {
        deletedTracks: deletedTracksResult.rowCount || 0
      };

      console.log(`🗑️ 3년 이상 된 순위 추적 및 가격 데이터 정리 완료:`, result);
      return result;
    } catch (error) {
      console.error('데이터 정리 중 오류:', error);
      return { deletedTracks: 0 };
    }
  }

}

export const storage = new DatabaseStorage();