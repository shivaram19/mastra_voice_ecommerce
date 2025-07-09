import { PrismaClient } from '@prisma/client';
import { JobStatus, JobType, Product } from '../generated/prisma/client';

export const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

export class DatabaseService {
  constructor() {}

  // Product operations
  async createProduct(data: {
    name: string;
    description?: string;
    sku: string;
    price: number;
    quantity: number;
    category?: string;
    brand?: string;
    imageUrl?: string;
    tags?: string[];
    searchKeywords?: string;
  }) {
    try {
      const product = await prisma.product.create({
        data: {
          ...data,
          pineconeId: `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      });
      return product;
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  }

  async updateProduct(id: string, data: Partial<Product>) {
    try {
      const product = await prisma.product.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date()
        }
      });
      return product;
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  async getProduct(id: string) {
    try {
      return await prisma.product.findUnique({
        where: { id }
      });
    } catch (error) {
      console.error('Error getting product:', error);
      throw error;
    }
  }

  async getProductBySku(sku: string) {
    try {
      return await prisma.product.findUnique({
        where: { sku }
      });
    } catch (error) {
      console.error('Error getting product by SKU:', error);
      throw error;
    }
  }

  async getAllProducts(options: {
    isActive?: boolean;
    hasStock?: boolean;
    category?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    try {
      const {
        isActive = true,
        hasStock = false,
        category,
        limit = 100,
        offset = 0
      } = options;

      const where: any = {};
      
      if (isActive !== undefined) {
        where.isActive = isActive;
      }
      
      if (hasStock) {
        where.quantity = { gt: 0 };
      }
      
      if (category) {
        where.category = category;
      }

      const products = await prisma.product.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { updatedAt: 'desc' }
      });

      return products;
    } catch (error) {
      console.error('Error getting products:', error);
      throw error;
    }
  }

  async getProductsNeedingEmbedding() {
    try {
      return await prisma.product.findMany({
        where: {
          OR: [
            { hasEmbedding: false },
            { lastEmbedded: null },
            {
              AND: [
                { updatedAt: { gt: { lastEmbedded: true } } },
                { hasEmbedding: true }
              ]
            }
          ],
          isActive: true,
          quantity: { gt: 0 }
        }
      });
    } catch (error) {
      console.error('Error getting products needing embedding:', error);
      throw error;
    }
  }

  async getLowStockProducts(threshold: number = 5) {
    try {
      return await prisma.product.findMany({
        where: {
          quantity: { lt: threshold },
          isActive: true
        }
      });
    } catch (error) {
      console.error('Error getting low stock products:', error);
      throw error;
    }
  }

  async getOutOfStockProducts() {
    try {
      return await prisma.product.findMany({
        where: {
          quantity: { lte: 0 }
        }
      });
    } catch (error) {
      console.error('Error getting out of stock products:', error);
      throw error;
    }
  }

  async markProductEmbedded(id: string, pineconeId?: string) {
    try {
      const updateData: any = {
        hasEmbedding: true,
        lastEmbedded: new Date()
      };

      if (pineconeId) {
        updateData.pineconeId = pineconeId;
      }

      return await prisma.product.update({
        where: { id },
        data: updateData
      });
    } catch (error) {
      console.error('Error marking product as embedded:', error);
      throw error;
    }
  }

  async markProductNotEmbedded(id: string) {
    try {
      return await prisma.product.update({
        where: { id },
        data: {
          hasEmbedding: false,
          lastEmbedded: null
        }
      });
    } catch (error) {
      console.error('Error marking product as not embedded:', error);
      throw error;
    }
  }

  async updateInventory(id: string, quantity: number) {
    try {
      const product = await prisma.product.update({
        where: { id },
        data: {
          quantity,
          isActive: quantity > 0, // Auto-deactivate if out of stock
          updatedAt: new Date()
        }
      });
      return product;
    } catch (error) {
      console.error('Error updating inventory:', error);
      throw error;
    }
  }

  // Embedding job operations
  async createEmbeddingJob(data: {
    jobType: JobType;
    productId?: string;
    totalItems?: number;
  }) {
    try {
      return await prisma.embeddingJob.create({
        data
      });
    } catch (error) {
      console.error('Error creating embedding job:', error);
      throw error;
    }
  }

  async updateEmbeddingJob(id: string, data: {
    status?: JobStatus;
    processedItems?: number;
    errorMessage?: string;
    completedAt?: Date;
  }) {
    try {
      return await prisma.embeddingJob.update({
        where: { id },
        data
      });
    } catch (error) {
      console.error('Error updating embedding job:', error);
      throw error;
    }
  }

  async getActiveEmbeddingJobs() {
    try {
      return await prisma.embeddingJob.findMany({
        where: {
          status: { in: ['PENDING', 'RUNNING'] }
        },
        orderBy: { createdAt: 'asc' }
      });
    } catch (error) {
      console.error('Error getting active embedding jobs:', error);
      throw error;
    }
  }

  // Statistics
  async getProductStats() {
    try {
      const [
        totalProducts,
        activeProducts,
        productsWithEmbeddings,
        lowStockProducts,
        outOfStockProducts
      ] = await Promise.all([
        prisma.product.count(),
        prisma.product.count({ where: { isActive: true } }),
        prisma.product.count({ where: { hasEmbedding: true } }),
        prisma.product.count({ 
          where: { 
            quantity: { 
              lt: parseInt(process.env.LOW_STOCK_THRESHOLD || '5'),
              gt: 0
            }
          } 
        }),
        prisma.product.count({ where: { quantity: { lte: 0 } } })
      ]);

      return {
        totalProducts,
        activeProducts,
        productsWithEmbeddings,
        lowStockProducts,
        outOfStockProducts,
        embeddingCoverage: totalProducts > 0 ? (productsWithEmbeddings / totalProducts) * 100 : 0
      };
    } catch (error) {
      console.error('Error getting product stats:', error);
      throw error;
    }
  }

  // Categories and brands
  async getCategories() {
    try {
      const categories = await prisma.product.findMany({
        where: {
          category: { not: null },
          isActive: true
        },
        select: { category: true },
        distinct: ['category']
      });

      return categories
        .map((p : any) => p.category)
        .filter(Boolean)
        .sort();
    } catch (error) {
      console.error('Error getting categories:', error);
      throw error;
    }
  }

  async getBrands() {
    try {
      const brands = await prisma.product.findMany({
        where: {
          brand: { not: null },
          isActive: true
        },
        select: { brand: true },
        distinct: ['brand']
      });

      return brands
        .map((p : any) => p.brand)
        .filter(Boolean)
        .sort();
    } catch (error) {
      console.error('Error getting brands:', error);
      throw error;
    }
  }

  // Cleanup operations
  async cleanup() {
    try {
      await prisma.$disconnect();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}