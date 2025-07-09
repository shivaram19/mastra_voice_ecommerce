import dotenv from 'dotenv';
import { InventoryAgent } from '../agents/inventory-agent.js';
import { OllamaService } from '../lib/ollama-service.js';
import { PineconeService } from '../lib/pinecone-service.js';

dotenv.config();

async function main() {
  console.log('🔄 Starting embedding synchronization...');

  try {
    // Initialize services
    console.log('🤖 Initializing Ollama service...');
    const ollamaService = new OllamaService();
    await ollamaService.ensureModelsExist();

    console.log('🔍 Initializing Pinecone service...');
    const pineconeService = new PineconeService();
    await pineconeService.initializeIndex();

    console.log('📦 Initializing inventory agent...');
    const inventoryAgent = new InventoryAgent();

    // Perform full embedding sync
    console.log('🚀 Starting full embedding synchronization...');
    const result = await inventoryAgent.syncAllEmbeddings();

    if (result.success) {
      console.log('✅ Embedding sync completed successfully!');
      console.log(`📊 Results:`);
      console.log(`   Processed: ${result.processed} products`);
      console.log(`   Added: ${result.added} embeddings`);
      console.log(`   Updated: ${result.updated} embeddings`);
      console.log(`   Removed: ${result.removed} embeddings`);
      
      // Get final index stats
      const indexStats = await pineconeService.getIndexStats();
      console.log(`\n🔍 Pinecone Index Stats:`);
      console.log(`   Total Vectors: ${indexStats.totalRecordCount || 0}`);
      console.log(`   Index Fullness: ${((indexStats.indexFullness || 0) * 100).toFixed(2)}%`);
      
    } else {
      console.error('❌ Embedding sync failed:', result.message);
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Error during embedding sync:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}