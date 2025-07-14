import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { OllamaService } from './lib/ollama-service.js';
import { PineconeService } from './lib/pinecone-service.js';
import { DatabaseService } from './lib/database.js';
import { EcommerceAgent } from './agents/ecommerce-agent.js';
import { InventoryAgent } from './agents/inventory-agent.js';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Services
let ollamaService: OllamaService;
let pineconeService: PineconeService;
let dbService: DatabaseService;
let ecommerceAgent: EcommerceAgent;
let inventoryAgent: InventoryAgent;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      ollama: !!ollamaService,
      pinecone: !!pineconeService,
      database: !!dbService
    }
  });
});

// Chat endpoint for ecommerce agent
// app.post('/api/chat', async (req, res) => {
//   try {
//     const { message, isVoiceInput = false } = req.body;

//     if (!message) {
//       return res.status(400).json({ error: 'Message is required' });
//     }

//     const response = await ecommerceAgent.processMessage(message, isVoiceInput);
    
//     res.json({
//       success: true,
//       response,
//       timestamp: new Date().toISOString()
//     });

//   } catch (error) {
//     console.error('Error in chat endpoint:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Internal server error'
//     });
//   }
// });

// Streaming chat endpoint
// app.post('/api/chat/stream', (req, res) => {
//   try {
//     const { message, isVoiceInput = false } = req.body;

//     if (!message) {
//       return res.status(400).json({ error: 'Message is required' });
//     }

//     // Set up SSE headers
//     res.writeHead(200, {
//       'Content-Type': 'text/event-stream',
//       'Cache-Control': 'no-cache',
//       'Connection': 'keep-alive',
//       'Access-Control-Allow-Origin': '*',
//       'Access-Control-Allow-Headers': 'Cache-Control'
//     });

//     // Stream response
//     ecommerceAgent.streamResponse(message, isVoiceInput, (chunk) => {
//       res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
//     }).then((fullResponse) => {
//       res.write(`data: ${JSON.stringify({ done: true, fullResponse })}\n\n`);
//       res.end();
//     }).catch((error) => {
//       console.error('Error in streaming chat:', error);
//       res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
//       res.end();
//     });

//   } catch (error) {
//     console.error('Error setting up chat stream:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Internal server error'
//     });
//   }
// });

// Product search endpoint
// app.post('/api/search', async (req , res) => {
//   try {
//     const { query, filters = {} } = req.body;

//     if (!query) {
//       return res.status(400).json({ error: 'Search query is required' });
//     }

//     const response = await ecommerceAgent.processMessage(`Find ${query}`, false);
    
//     res.json({
//       success: true,
//       response,
//       timestamp: new Date().toISOString()
//     });

//   } catch (error) {
//     console.error('Error in search endpoint:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Internal server error'
//     });
//   }
// });

// Inventory management endpoints
// app.post('/api/inventory/update', async (req, res) => {
//   try {
//     const { productId, quantity } = req.body;

//     if (!productId || quantity === undefined) {
//       return res.status(400).json({ error: 'Product ID and quantity are required' });
//     }

//     const result = await inventoryAgent.processInventoryUpdate(productId, quantity);
    
//     res.json({
//       ...result,
//       timestamp: new Date().toISOString()
//     });

//   } catch (error) {
//     console.error('Error in inventory update endpoint:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error'
//     });
//   }
// });

app.get('/api/inventory/report', async (req, res) => {
  try {
    const result = await inventoryAgent.generateInventoryReport();
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in inventory report endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/inventory/maintenance', async (req, res) => {
  try {
    const result = await inventoryAgent.performLowStockMaintenance();
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in inventory maintenance endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

app.post('/api/embeddings/sync', async (req, res) => {
  try {
    const result = await inventoryAgent.syncAllEmbeddings();
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in embedding sync endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Product management endpoints
app.get('/api/products', async (req, res) => {
  try {
    const { 
      category, 
      isActive = 'true', 
      hasStock = 'false',
      limit = '50',
      offset = '0'
    } = req.query;

    const products = await dbService.getAllProducts({
      category: category as string,
      isActive: isActive === 'true',
      hasStock: hasStock === 'true',
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json({
      success: true,
      products,
      count: products.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in products endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/products/stats', async (req, res) => {
  try {
    const stats = await dbService.getProductStats();
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in product stats endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await dbService.getCategories();
    
    res.json({
      success: true,
      categories,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in categories endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/brands', async (req, res) => {
  try {
    const brands = await dbService.getBrands();
    
    res.json({
      success: true,
      brands,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in brands endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Initialize services and start server
async function initialize() {
  try {
    console.log('🚀 Initializing Mastra Ecommerce Bot...');

    // Initialize services
    console.log('📊 Initializing database service...');
    dbService = new DatabaseService();

    console.log('🤖 Initializing Ollama service...');
    ollamaService = new OllamaService();
    await ollamaService.ensureModelsExist();

    console.log('🔍 Initializing Pinecone service...');
    pineconeService = new PineconeService();
    await pineconeService.initializeIndex();

    // Initialize agents
    console.log('🛍️ Initializing ecommerce agent...');
    ecommerceAgent = new EcommerceAgent();

    console.log('📦 Initializing inventory agent...');
    inventoryAgent = new InventoryAgent();

    console.log('✅ All services initialized successfully');

    // Start server
    app.listen(port, () => {
      console.log(`🌟 Mastra Ecommerce Bot server running on port ${port}`);
      console.log(`📱 Health check: http://localhost:${port}/health`);
      console.log(`💬 Chat API: http://localhost:${port}/api/chat`);
      console.log(`🔍 Search API: http://localhost:${port}/api/search`);
      console.log(`📊 Inventory API: http://localhost:${port}/api/inventory/*`);
    });

  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Graceful shutdown initiated...');
  
  try {
    if (dbService) {
      await dbService.cleanup();
    }
    
    console.log('✅ Cleanup completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
initialize();