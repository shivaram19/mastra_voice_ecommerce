import { z } from 'zod';
import { DatabaseService } from '../lib/database.js';
import { PineconeService } from '../lib/pinecone-service.js';
import { OllamaService } from '../lib/ollama-service.js';

const dbService = new DatabaseService();
const pineconeService = new PineconeService();
const ollamaService = new OllamaService();

export const inventoryUpdateSchema = z.object({
  productId: z.string().describe("Product ID to update"),
  quantity: z.number().min(0).describe("New quantity for the product"),
  updateEmbedding: z.boolean().default(true).describe("Whether to update/remove embedding based on stock level")
});

export const inventoryCheckSchema = z.object({
  productId: z.string().optional().describe("Specific product ID to check"),
  sku: z.string().optional().describe("Product SKU to check"),
  threshold: z.number().min(0).default(5).describe("Low stock threshold")
});

export const bulkInventoryUpdateSchema = z.object({
  updates: z.array(z.object({
    productId: z.string(),
    quantity: z.number().min(0)
  })).describe("Array of product updates"),
  updateEmbeddings: z.boolean().default(true).describe("Whether to update embeddings for affected products")
});

export type InventoryUpdateInput = z.infer<typeof inventoryUpdateSchema>;
export type InventoryCheckInput = z.infer<typeof inventoryCheckSchema>;
export type BulkInventoryUpdateInput = z.infer<typeof bulkInventoryUpdateSchema>;

export interface InventoryUpdateResult {
  success: boolean;
  productId: string;
  previousQuantity: number;
  newQuantity: number;
  statusChange?: {
    wasActive: boolean;
    isActive: boolean;
    embeddingAction: 'added' | 'removed' | 'updated' | 'none';
  };
  error?: string;
}

export interface InventoryCheckResult {
  success: boolean;
  product?: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    isActive: boolean;
    isLowStock: boolean;
    isOutOfStock: boolean;
  };
  lowStockProducts?: Array<{
    id: string;
    name: string;
    sku: string;
    quantity: number;
  }>;
  error?: string;
}

export async function executeInventoryUpdate(input: InventoryUpdateInput): Promise<InventoryUpdateResult> {
  try {
    console.log('Updating inventory:', input);

    // Get current product state
    const currentProduct = await dbService.getProduct(input.productId);
    if (!currentProduct) {
      return {
        success: false,
        productId: input.productId,
        previousQuantity: 0,
        newQuantity: input.quantity,
        error: 'Product not found'
      };
    }

    const previousQuantity = currentProduct.quantity;
    const threshold = parseInt(process.env.LOW_STOCK_THRESHOLD || '5');

    // Update inventory in database
    const updatedProduct = await dbService.updateInventory(input.productId, input.quantity);

    // Determine status changes
    const wasActive = currentProduct.isActive;
    const isActive = updatedProduct.isActive;
    const wasLowStock = previousQuantity < threshold;
    const isLowStock = input.quantity < threshold;
    const wasOutOfStock = previousQuantity <= 0;
    const isOutOfStock = input.quantity <= 0;

    let embeddingAction: 'added' | 'removed' | 'updated' | 'none' = 'none';

    if (input.updateEmbedding) {
      try {
        if (isOutOfStock || isLowStock) {
          // Remove from search if out of stock or low stock
          if (currentProduct.pineconeId && currentProduct.hasEmbedding) {
            await pineconeService.deleteProduct(currentProduct.pineconeId);
            await dbService.markProductNotEmbedded(input.productId);
            embeddingAction = 'removed';
          }
        } else if (!wasActive && isActive) {
          // Product became active - add to search
          const embeddingText = createProductEmbeddingText(updatedProduct);
          const embedding = await ollamaService.generateEmbedding(embeddingText);
          await pineconeService.upsertProduct(updatedProduct, embedding);
          await dbService.markProductEmbedded(input.productId, updatedProduct.pineconeId);
          embeddingAction = 'added';
        } else if (isActive && currentProduct.hasEmbedding) {
          // Product is active and had embedding - update it
          const embeddingText = createProductEmbeddingText(updatedProduct);
          const embedding = await ollamaService.generateEmbedding(embeddingText);
          await pineconeService.upsertProduct(updatedProduct, embedding);
          await dbService.markProductEmbedded(input.productId, updatedProduct.pineconeId);
          embeddingAction = 'updated';
        }
      } catch (embeddingError) {
        console.error('Error updating embedding:', embeddingError);
        // Don't fail the whole operation for embedding errors
      }
    }

    return {
      success: true,
      productId: input.productId,
      previousQuantity,
      newQuantity: input.quantity,
      statusChange: {
        wasActive,
        isActive,
        embeddingAction
      }
    };

  } catch (error) {
    console.error('Error updating inventory:', error);
    
    return {
      success: false,
      productId: input.productId,
      previousQuantity: 0,
      newQuantity: input.quantity,
      error: error instanceof Error ? error.message : 'Unknown inventory update error'
    };
  }
}

export async function executeInventoryCheck(input: InventoryCheckInput): Promise<InventoryCheckResult> {
  try {
    console.log('Checking inventory:', input);

    if (input.productId || input.sku) {
      // Check specific product
      const product = input.productId 
        ? await dbService.getProduct(input.productId)
        : await dbService.getProductBySku(input.sku!);

      if (!product) {
        return {
          success: false,
          error: 'Product not found'
        };
      }

      return {
        success: true,
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          quantity: product.quantity,
          isActive: product.isActive,
          isLowStock: product.quantity < input.threshold && product.quantity > 0,
          isOutOfStock: product.quantity <= 0
        }
      };
    } else {
      // Get all low stock products
      const lowStockProducts = await dbService.getLowStockProducts(input.threshold);

      return {
        success: true,
        lowStockProducts: lowStockProducts.map((product : any) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          quantity: product.quantity
        }))
      };
    }

  } catch (error) {
    console.error('Error checking inventory:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown inventory check error'
    };
  }
}

export async function executeBulkInventoryUpdate(input: BulkInventoryUpdateInput): Promise<{
  success: boolean;
  results: InventoryUpdateResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    embeddingsUpdated: number;
  };
  error?: string;
}> {
  try {
    console.log('Executing bulk inventory update:', input.updates.length, 'products');

    const results: InventoryUpdateResult[] = [];
    let embeddingsUpdated = 0;

    // Process updates in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < input.updates.length; i += batchSize) {
      const batch = input.updates.slice(i, i + batchSize);
      
      const batchPromises = batch.map(update => 
        executeInventoryUpdate({
          productId: update.productId,
          quantity: update.quantity,
          updateEmbedding: input.updateEmbeddings
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Count embedding updates
      embeddingsUpdated += batchResults.filter(result => 
        result.statusChange?.embeddingAction !== 'none'
      ).length;

      // Small delay between batches
      if (i + batchSize < input.updates.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      success: true,
      results,
      summary: {
        total: results.length,
        successful,
        failed,
        embeddingsUpdated
      }
    };

  } catch (error) {
    console.error('Error in bulk inventory update:', error);
    
    return {
      success: false,
      results: [],
      summary: {
        total: 0,
        successful: 0,
        failed: input.updates.length,
        embeddingsUpdated: 0
      },
      error: error instanceof Error ? error.message : 'Unknown bulk update error'
    };
  }
}

function createProductEmbeddingText(product: any): string {
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

// Tool definitions for Mastra
export const inventoryUpdateTool = {
  id: 'inventory-update',
  name: 'Update Inventory',
  description: 'Update product inventory quantity and manage search embeddings',
  inputSchema: inventoryUpdateSchema,
  execute: executeInventoryUpdate
};

export const inventoryCheckTool = {
  id: 'inventory-check',
  name: 'Check Inventory',
  description: 'Check inventory levels for specific products or get low stock alerts',
  inputSchema: inventoryCheckSchema,
  execute: executeInventoryCheck
};

export const bulkInventoryUpdateTool = {
  id: 'bulk-inventory-update',
  name: 'Bulk Inventory Update',
  description: 'Update inventory for multiple products at once',
  inputSchema: bulkInventoryUpdateSchema,
  execute: executeBulkInventoryUpdate
};