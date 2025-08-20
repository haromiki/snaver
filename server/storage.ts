import { 
  users, 
  products, 
  tracks,
  type User, 
  type InsertUser,
  type Product,
  type InsertProduct,
  type Track
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, gte, lte, or } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser & { passwordHash: string }): Promise<User>;

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

  async createUser(user: InsertUser & { passwordHash: string }): Promise<User> {
    const [newUser] = await db
      .insert(users)
      .values(user)
      .returning();
    return newUser;
  }

  // Product operations
  async getProducts(userId: number, filters?: { type?: string; active?: boolean }): Promise<Product[]> {
    let query = db.select().from(products).where(eq(products.userId, userId));
    
    const conditions = [eq(products.userId, userId)];
    
    if (filters?.type) {
      conditions.push(eq(products.type, filters.type as any));
    }
    
    if (filters?.active !== undefined) {
      conditions.push(eq(products.active, filters.active));
    }

    return await db.select().from(products)
      .where(and(...conditions))
      .orderBy(asc(products.sortOrder), desc(products.createdAt));
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
}

export const storage = new DatabaseStorage();
