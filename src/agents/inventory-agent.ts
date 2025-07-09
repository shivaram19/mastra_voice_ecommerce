import { OllamaService } from '../lib/ollama-service.js';
import { DatabaseService } from '../lib/database.js';
import { PineconeService } from '../lib/pinecone-service.js';
import { 
  inventoryUpdateTool, 
  inventoryCheckTool, 
  bulkInventoryUpdateTool 
} from '../tools/inventory-management.js';

const ollamaService = new OllamaService();
const dbService = new DatabaseService();
const pineconeService = new PineconeService();

export interface InventoryAgentConfig {
  name: string;
  description: string;
  lowStockThreshold: number;
  autoEmbeddingManagement: boolean;
  batchSize: number;
}

export class InventoryAgent {
  private config: InventoryAgentConfig;

  constructor() {
    this.config = {
      name: "InventoryAgent",
      description: "Manages stock levels, embeddings, and inventory workflows",
      lowStockThreshold: parseInt(process.env.LOW_STOCK_THRESHOLD || '5'),
      autoEmbeddingManagement: true,
      batchSize: 50
    };
  }

  async processInventoryUpdate(productId: string, newQuantity: number): Promise<{
    success: boolean;
    message: string;
    recommendations?: string[];
  }> {
    try {
      console.log(`Processing inventory update for product ${productId}: ${newQuantity}`);

      const result = await inventoryUpdateTool.execute({
        productId,
        quantity: newQuantity,
        updateEmbedding: this.config.autoEmbeddingManagement
      });

      if (!result.success) {
        return {
          success: false,
          message: result.error || 'Failed to update inventory'
        };
      }

      let message = `Inventory updated for product ${productId}: ${result.previousQuantity} → ${result.newQuantity}`;
      const recommendations: string[] = [];

      // Add status change information
      if (result.statusChange) {
        const { wasActive, isActive, embeddingAction } = result.statusChange;
        
        if (wasActive && !isActive) {
          message += '. Product deactivated due to low/no stock';
          recommendations.push('Consider restocking this product');
        } else if (!wasActive && isActive) {
          message += '. Product reactivated and available for search';
        }

        if (embeddingAction !== 'none') {
          message += `. Search embedding ${embeddingAction}`;
        }

        // Generate recommendations based on stock level
        if (result.newQuantity === 0) {
          recommendations.push('Product is out of stock - consider emergency restocking');
          recommendations.push('Check for customer backorders');
        } else if (result.newQuantity < this.config.lowStockThreshold) {
          recommendations.push('Low stock alert - plan reorder soon');
          recommendations.push('Consider increasing safety stock for this product');
        }
      }

      return {
        success: true,
        message,
        recommendations: recommendations.length > 0 ? recommendations : undefined
      };

    } catch (error) {
      console.error('Error processing inventory update:', error);
      return {
        success: false,
        message: 'Internal error during inventory update'
      };
    }
  }

  async generateInventoryReport(): Promise<{
    success: boolean;
    report?: {
      summary: any;
      lowStockProducts: any[];
      outOfStockProducts: any[];
      recommendations: string[];
    };
    error?: string;
  }> {
    try {
      console.log('Generating inventory report...');

      // Get comprehensive inventory data
      const [stats, lowStockProducts, outOfStockProducts] = await Promise.all([
        dbService.getProductStats(),
        dbService.getLowStockProducts(this.config.lowStockThreshold),
        dbService.getOutOfStockProducts()
      ]);

      // Generate AI-powered recommendations
      const recommendations = await this.generateInventoryRecommendations(
        stats,
        lowStockProducts,
        outOfStockProducts
      );

      return {
        success: true,
        report: {
          summary: {
            ...stats,
            lowStockCount: lowStockProducts.length,
            outOfStockCount: outOfStockProducts.length,
            timestamp: new Date().toISOString()
          },
          lowStockProducts: lowStockProducts.map((p : any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            quantity: p.quantity,
            category: p.category,
            brand: p.brand
          })),
          outOfStockProducts: outOfStockProducts.map((p : any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            category: p.category,
            brand: p.brand
          })),
          recommendations
        }
      };

    } catch (error) {
      console.error('Error generating inventory report:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async performLowStockMaintenance(): Promise<{
    success: boolean;
    processed: number;
    deactivated: number;
    embeddingsRemoved: number;
    message: string;
  }> {
    try {
      console.log('Performing low stock maintenance...');

      const lowStockProducts = await dbService.getLowStockProducts(this.config.lowStockThreshold);
      
      let deactivated = 0;
      let embeddingsRemoved = 0;

      // Process in batches
      const batchSize = this.config.batchSize;
      for (let i = 0; i < lowStockProducts.length; i += batchSize) {
        const batch = lowStockProducts.slice(i, i + batchSize);
        
        for (const product of batch) {
          try {
            // Deactivate product if quantity is 0
            if (product.quantity <= 0 && product.isActive) {
              await dbService.updateProduct(product.id, { 
                isActive: false 
              });
              deactivated++;
            }

            // Remove embedding if low stock and has embedding
            if (product.quantity < this.config.lowStockThreshold && product.hasEmbedding && product.pineconeId) {
              await pineconeService.deleteProduct(product.pineconeId);
              await dbService.markProductNotEmbedded(product.id);
              embeddingsRemoved++;
            }
          } catch (error) {
            console.error(`Error processing product ${product.id}:`, error);
          }
        }

        // Small delay between batches
        if (i + batchSize < lowStockProducts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return {
        success: true,
        processed: lowStockProducts.length,
        deactivated,
        embeddingsRemoved,
        message: `Processed ${lowStockProducts.length} low stock products. Deactivated: ${deactivated}, Embeddings removed: ${embeddingsRemoved}`
      };

    } catch (error) {
      console.error('Error in low stock maintenance:', error);
      return {
        success: false,
        processed: 0,
        deactivated: 0,
        embeddingsRemoved: 0,
        message: 'Failed to perform low stock maintenance'
      };
    }
  }

  async syncAllEmbeddings(): Promise<{
    success: boolean;
    processed: number;
    added: number;
    updated: number;
    removed: number;
    message: string;
  }> {
    try {
      console.log('Starting full embedding sync...');

      // Get all active products that need embeddings
      const activeProducts = await dbService.getAllProducts({
        isActive: true,
        hasStock: true
      });

      // Get products that need embedding removal (inactive or out of stock)
      const inactiveProducts = await dbService.getAllProducts({
        isActive: false
      });

      let added = 0;
      let updated = 0;
      let removed = 0;

      // Process active products - add/update embeddings
      const batchSize = this.config.batchSize;
      for (let i = 0; i < activeProducts.length; i += batchSize) {
        const batch = activeProducts.slice(i, i + batchSize);
        
        for (const product of batch) {
          try {
            const embeddingText = this.createProductEmbeddingText(product);
            const embedding = await ollamaService.generateEmbedding(embeddingText);
            
            await pineconeService.upsertProduct(product, embedding);
            await dbService.markProductEmbedded(product.id, product.pineconeId);
            
            if (!product.hasEmbedding) {
              added++;
            } else {
              updated++;
            }
          } catch (error) {
            console.error(`Error processing product ${product.id}:`, error);
          }
        }

        // Progress update
        console.log(`Processed ${Math.min(i + batchSize, activeProducts.length)}/${activeProducts.length} active products`);
        
        // Delay between batches
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Process inactive products - remove embeddings
      for (let i = 0; i < inactiveProducts.length; i += batchSize) {
        const batch = inactiveProducts.slice(i, i + batchSize);
        
        for (const product of batch) {
          try {
            if (product.hasEmbedding && product.pineconeId) {
              await pineconeService.deleteProduct(product.pineconeId);
              await dbService.markProductNotEmbedded(product.id);
              removed++;
            }
          } catch (error) {
            console.error(`Error removing embedding for product ${product.id}:`, error);
          }
        }

        console.log(`Processed ${Math.min(i + batchSize, inactiveProducts.length)}/${inactiveProducts.length} inactive products`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const total = activeProducts.length + inactiveProducts.length;
      return {
        success: true,
        processed: total,
        added,
        updated,
        removed,
        message: `Embedding sync complete. Processed: ${total}, Added: ${added}, Updated: ${updated}, Removed: ${removed}`
      };

    } catch (error) {
      console.error('Error in embedding sync:', error);
      return {
        success: false,
        processed: 0,
        added: 0,
        updated: 0,
        removed: 0,
        message: 'Failed to sync embeddings'
      };
    }
  }

  private async generateInventoryRecommendations(
    stats: any,
    lowStockProducts: any[],
    outOfStockProducts: any[]
  ): Promise<string[]> {
    try {
      const recommendations: string[] = [];

      // Basic rule-based recommendations
      if (outOfStockProducts.length > 0) {
        recommendations.push(`URGENT: ${outOfStockProducts.length} products are out of stock and need immediate restocking`);
      }

      if (lowStockProducts.length > 0) {
        recommendations.push(`${lowStockProducts.length} products are running low on stock`);
      }

      if (stats.embeddingCoverage < 90) {
        recommendations.push(`Embedding coverage is ${stats.embeddingCoverage.toFixed(1)}% - consider running full embedding sync`);
      }

      // AI-generated strategic recommendations
      const context = {
        totalProducts: stats.totalProducts,
        activeProducts: stats.activeProducts,
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
        embeddingCoverage: stats.embeddingCoverage
      };

      const aiRecommendations = await this.generateAIRecommendations(context);
      recommendations.push(...aiRecommendations);

      return recommendations;

    } catch (error) {
      console.error('Error generating recommendations:', error);
      return ['Error generating recommendations - manual review recommended'];
    }
  }

  private async generateAIRecommendations(context: any): Promise<string[]> {
    try {
      const prompt = `Analyze this ecommerce inventory situation and provide 3-5 actionable recommendations:

Inventory Status:
- Total Products: ${context.totalProducts}
- Active Products: ${context.activeProducts}
- Low Stock Items: ${context.lowStockCount}
- Out of Stock Items: ${context.outOfStockCount}
- Search Embedding Coverage: ${context.embeddingCoverage.toFixed(1)}%

Provide specific, actionable recommendations for inventory management. Focus on immediate actions and strategic improvements.`;

      const response = await ollamaService.chat([
        { role: 'user', content: prompt }
      ]);

      // Parse recommendations from AI response
      const lines = response.split('\n').filter(line => line.trim().length > 0);
      return lines.slice(0, 5); // Limit to 5 recommendations

    } catch (error) {
      console.error('Error generating AI recommendations:', error);
      return [];
    }
  }

  private createProductEmbeddingText(product: any): string {
    const parts = [
      product.name,
      product.description,
      product.category,
      product.brand,
      ...(product.tags || []),
      product.searchKeywords
    ].filter(Boolean);

    return parts.join(' ');
  }

  getConfig(): InventoryAgentConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<InventoryAgentConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}