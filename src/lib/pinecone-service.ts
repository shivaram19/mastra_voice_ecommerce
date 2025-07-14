import { Pinecone } from '@pinecone-database/pinecone';
import { Product } from '../generated/prisma';

export interface ProductMetadata {
  id: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  category?: string;
  brand?: string;
  sku: string;
  isActive: boolean;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: ProductMetadata;
}

export class PineconeService {
  private pinecone: Pinecone;
  private indexName: string;

  constructor() {
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    this.indexName = process.env.PINECONE_INDEX_NAME!;
  }

  async initializeIndex() {
    try {
      // Check if index exists
      const indexList = await this.pinecone.listIndexes();
      const indexExists = indexList.indexes?.some(index => index.name === this.indexName);

      if (!indexExists) {
        console.log(`Creating Pinecone index: ${this.indexName}`);
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: parseInt(process.env.VECTOR_DIMENSION || '768'),
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });
        
        // Wait for index to be ready
        await this.waitForIndexReady();
      }

      console.log(`Pinecone index ${this.indexName} is ready`);
    } catch (error) {
      console.error('Error initializing Pinecone index:', error);
      throw error;
    }
  }

  private async waitForIndexReady() {
    const index = this.pinecone.index(this.indexName);
    let isReady = false;
    
    while (!isReady) {
      try {
        const stats = await index.describeIndexStats();
        isReady = true;
        console.log('Index stats:', stats);
      } catch (error) {
        console.log('Waiting for index to be ready...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async upsertProduct(product: Product, embedding: number[]) {
    try {
      const index = this.pinecone.index(this.indexName);
      
      const metadata: ProductMetadata = {
        id: product.id,
        name: product.name,
        description: product.description || '',
        price: product.price,
        quantity: product.quantity,
        category: product.category || '',
        brand: product.brand || '',
        sku: product.sku,
        isActive: product.isActive
      };

      await index.upsert([
        {
          id: product.pineconeId || product.id,
          values: embedding,
          // metadata
        }
      ]);

      console.log(`Upserted product ${product.name} to Pinecone`);
      return true;
    } catch (error) {
      console.error(`Error upserting product ${product.id}:`, error);
      throw error;
    }
  }

  async searchProducts(
    queryEmbedding: number[],
    options: {
      topK?: number;
      minScore?: number;
      filter?: Record<string, any>;
      includeMetadata?: boolean;
    } = {}
  ): Promise<SearchResult[]> {
    try {
      const index = this.pinecone.index(this.indexName);
      
      const {
        topK = 10,
        minScore = 0.7,
        filter = {},
        includeMetadata = true
      } = options;

      // Default filter: only active products with stock
      const defaultFilter = {
        isActive: { $eq: true },
        quantity: { $gt: 0 }
      };

      const queryFilter = { ...defaultFilter, ...filter };

      const queryResponse = await index.query({
        vector: queryEmbedding,
        topK,
        filter: queryFilter,
        includeMetadata
      });

      const results: SearchResult[] = queryResponse.matches
        ?.filter(match => (match.score || 0) >= minScore)
        .map(match => ({
          id: match.id,
          score: match.score || 0,
          metadata: match.metadata as unknown as ProductMetadata
        })) || [];

      console.log(`Found ${results.length} products for search`);
      return results;
    } catch (error) {
      console.error('Error searching products:', error);
      throw error;
    }
  }

  async deleteProduct(pineconeId: string) {
    try {
      const index = this.pinecone.index(this.indexName);
      await index.deleteOne(pineconeId);
      console.log(`Deleted product ${pineconeId} from Pinecone`);
      return true;
    } catch (error) {
      console.error(`Error deleting product ${pineconeId}:`, error);
      throw error;
    }
  }

  async deleteProducts(pineconeIds: string[]) {
    try {
      const index = this.pinecone.index(this.indexName);
      await index.deleteMany(pineconeIds);
      console.log(`Deleted ${pineconeIds.length} products from Pinecone`);
      return true;
    } catch (error) {
      console.error('Error deleting products:', error);
      throw error;
    }
  }

  async getIndexStats() {
    try {
      const index = this.pinecone.index(this.indexName);
      const stats = await index.describeIndexStats();
      return stats;
    } catch (error) {
      console.error('Error getting index stats:', error);
      throw error;
    }
  }

  async searchByCategory(
    queryEmbedding: number[],
    category: string,
    topK: number = 10
  ): Promise<SearchResult[]> {
    return this.searchProducts(queryEmbedding, {
      topK,
      filter: { category: { $eq: category } }
    });
  }

  async searchByPriceRange(
    queryEmbedding: number[],
    minPrice: number,
    maxPrice: number,
    topK: number = 10
  ): Promise<SearchResult[]> {
    return this.searchProducts(queryEmbedding, {
      topK,
      filter: {
        price: { $gte: minPrice, $lte: maxPrice }
      }
    });
  }

  async searchByBrand(
    queryEmbedding: number[],
    brand: string,
    topK: number = 10
  ): Promise<SearchResult[]> {
    return this.searchProducts(queryEmbedding, {
      topK,
      filter: { brand: { $eq: brand } }
    });
  }
}