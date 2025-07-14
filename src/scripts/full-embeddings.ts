import dotenv from 'dotenv';
import { DatabaseService } from '../lib/database.js';
import { OllamaService } from '../lib/ollama-service.js';
import { PineconeService } from '../lib/pinecone-service.js';
import { JobType } from '../generated/prisma';

dotenv.config();

const dbService = new DatabaseService();
const ollamaService = new OllamaService();
const pineconeService = new PineconeService();

interface EmbeddingProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  startTime: Date;
}

async function createProductEmbeddingText(product: any): Promise<string> {
  // Create comprehensive text for embedding
  const parts = [
    product.name,
    product.description || '',
    product.category || '',
    product.brand || '',
    ...(product.tags || []),
    product.searchKeywords || '',
    `SKU: ${product.sku}`,
    `Price: $${product.price}`
  ].filter(part => part && part.trim().length > 0);

  return parts.join(' ').trim();
}

async function processProductEmbedding(product: any, progress: EmbeddingProgress): Promise<boolean> {
  try {
    console.log(`Processing ${progress.processed + 1}/${progress.total}: ${product.name}`);

    // Skip if product is inactive or out of stock
    if (!product.isActive || product.quantity <= 0) {
      console.log(`  ⏭️  Skipping inactive/out-of-stock product: ${product.name}`);
      progress.skipped++;
      return true;
    }

    // Create embedding text
    const embeddingText = await createProductEmbeddingText(product);
    
    if (!embeddingText || embeddingText.trim().length < 10) {
      console.log(`  ⚠️  Insufficient text for embedding: ${product.name}`);
      progress.skipped++;
      return true;
    }

    // Generate embedding
    console.log(`  🧠 Generating embedding...`);
    const embedding = await ollamaService.generateEmbedding(embeddingText);
    
    if (!embedding || embedding.length === 0) {
      throw new Error('Empty embedding returned from Ollama');
    }

    // Ensure product has pineconeId
    if (!product.pineconeId) {
      product.pineconeId = `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await dbService.updateProduct(product.id, { pineconeId: product.pineconeId });
    }

    // Upsert to Pinecone
    console.log(`  🔍 Uploading to Pinecone...`);
    await pineconeService.upsertProduct(product, embedding);

    // Update database
    await dbService.markProductEmbedded(product.id, product.pineconeId);

    console.log(`  ✅ Successfully processed: ${product.name}`);
    progress.successful++;
    return true;

  } catch (error) {
    console.error(`  ❌ Error processing product ${product.name}:`, error);
    progress.failed++;
    return false;
  }
}

async function generateFullEmbeddings(): Promise<void> {
  const startTime = new Date();
  console.log('🚀 Starting full embedding generation...');
  console.log(`⏰ Started at: ${startTime.toISOString()}\n`);

  let embeddingJobId: string | null = null;

  try {
    // Initialize services
    console.log('🔧 Initializing services...');
    
    console.log('  🤖 Checking Ollama models...');
    await ollamaService.ensureModelsExist();
    
    console.log('  🔍 Initializing Pinecone index...');
    await pineconeService.initializeIndex();
    
    console.log('  📊 Getting Pinecone index stats...');
    const initialStats = await pineconeService.getIndexStats();
    console.log(`     Initial vector count: ${initialStats.totalRecordCount || 0}`);

    // Get all products that need embeddings
    console.log('\n📦 Fetching products...');
    const allProducts = await dbService.getAllProducts({
      isActive: true,
      hasStock: false, // Include all products, we'll filter during processing
      limit: 10000 // Large limit to get all products
    });

    if (allProducts.length === 0) {
      console.log('⚠️  No products found to process.');
      return;
    }

    console.log(`📊 Found ${allProducts.length} products to process\n`);

    // Create embedding job
    const embeddingJob = await dbService.createEmbeddingJob({
      jobType: JobType.BULK_EMBED,
      totalItems: allProducts.length
    });
    embeddingJobId = embeddingJob.id;

    // Initialize progress tracking
    const progress: EmbeddingProgress = {
      total: allProducts.length,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      startTime
    };

    // Update job status
    await dbService.updateEmbeddingJob(embeddingJobId, {
      status: 'RUNNING'
    });

    // Process products in batches to avoid overwhelming services
    const batchSize = 5; // Process 5 products at a time
    const delayBetweenBatches = 1000; // 1 second delay between batches

    console.log(`🔄 Processing in batches of ${batchSize}...\n`);

    for (let i = 0; i < allProducts.length; i += batchSize) {
      const batch = allProducts.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allProducts.length / batchSize);
      
      console.log(`📦 Batch ${batchNumber}/${totalBatches} (${batch.length} products)`);

      // Process batch sequentially to avoid rate limits
      for (const product of batch) {
        await processProductEmbedding(product, progress);
        progress.processed++;

        // Update job progress every 10 products
        if (progress.processed % 10 === 0) {
          await dbService.updateEmbeddingJob(embeddingJobId, {
            processedItems: progress.processed
          });
        }

        // Small delay between products
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Progress update
      const progressPercent = ((progress.processed / progress.total) * 100).toFixed(1);
      const elapsed = Date.now() - progress.startTime.getTime();
      const avgTimePerProduct = elapsed / progress.processed;
      const estimatedRemaining = (progress.total - progress.processed) * avgTimePerProduct;

      console.log(`📈 Progress: ${progress.processed}/${progress.total} (${progressPercent}%)`);
      console.log(`   ✅ Successful: ${progress.successful}`);
      console.log(`   ❌ Failed: ${progress.failed}`);
      console.log(`   ⏭️  Skipped: ${progress.skipped}`);
      console.log(`   ⏱️  ETA: ${Math.round(estimatedRemaining / 60000)} minutes\n`);

      // Delay between batches (except for the last batch)
      if (i + batchSize < allProducts.length) {
        console.log(`⏳ Waiting ${delayBetweenBatches}ms before next batch...\n`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    // Final results
    const endTime = new Date();
    const totalTime = endTime.getTime() - startTime.getTime();

    console.log('\n🎉 Full embedding generation completed!');
    console.log('📊 Final Results:');
    console.log(`   📦 Total products: ${progress.total}`);
    console.log(`   ✅ Successful: ${progress.successful}`);
    console.log(`   ❌ Failed: ${progress.failed}`);
    console.log(`   ⏭️  Skipped: ${progress.skipped}`);
    console.log(`   ⏱️  Total time: ${Math.round(totalTime / 60000)} minutes`);
    console.log(`   🚀 Average: ${(totalTime / progress.processed / 1000).toFixed(2)}s per product`);

    // Get final Pinecone stats
    console.log('\n🔍 Final Pinecone Statistics:');
    const finalStats = await pineconeService.getIndexStats();
    console.log(`   📊 Total vectors: ${finalStats.totalRecordCount || 0}`);
    console.log(`   📈 Index fullness: ${((finalStats.indexFullness || 0) * 100).toFixed(2)}%`);

    // Get database stats
    console.log('\n📊 Database Statistics:');
    const dbStats = await dbService.getProductStats();
    console.log(`   📦 Total products: ${dbStats.totalProducts}`);
    console.log(`   ✅ Active products: ${dbStats.activeProducts}`);
    console.log(`   🧠 Products with embeddings: ${dbStats.productsWithEmbeddings}`);
    console.log(`   📈 Embedding coverage: ${dbStats.embeddingCoverage.toFixed(1)}%`);

    // Update job as completed
    await dbService.updateEmbeddingJob(embeddingJobId, {
      status: 'COMPLETED',
      processedItems: progress.processed,
      completedAt: endTime
    });

    // Success recommendations
    if (progress.successful > 0) {
      console.log('\n💡 Next Steps:');
      console.log('   🚀 Start the server: npm run dev');
      console.log('   🧪 Test search: POST /api/search');
      console.log('   💬 Test chat: POST /api/chat');
      console.log('   📊 Check health: GET /health');
    }

    if (progress.failed > 0) {
      console.log('\n⚠️  Some products failed to process. Check the logs above for details.');
      console.log('   You can re-run this script to retry failed products.');
    }

  } catch (error) {
    console.error('\n💥 Fatal error during embedding generation:', error);
    
    if (embeddingJobId) {
      await dbService.updateEmbeddingJob(embeddingJobId, {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
    }
    
    throw error;
  }
}

async function cleanup() {
  try {
    console.log('🧹 Cleaning up...');
    await dbService.cleanup();
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

async function main() {
  try {
    await generateFullEmbeddings();
    console.log('\n🎉 Embedding generation completed successfully!');
  } catch (error) {
    console.error('\n💥 Embedding generation failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

// Handle interrupts gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Interrupted, cleaning up...');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Terminated, cleaning up...');
  await cleanup();
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main();
}

export { generateFullEmbeddings };