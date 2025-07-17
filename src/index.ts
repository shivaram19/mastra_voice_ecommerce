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
app.post('/api/chat', async (req, res) => {
  console.log('Endpoint /api/chat hit with data:', req.body);
  try {
    const { message, isVoiceInput = false } = req.body;

    if (!message) {
      console.error('Missing message in /api/chat');
      res.status(400).json({ error: 'Message is required' });
    }

    const response = await ecommerceAgent.processMessage(message, isVoiceInput);
    console.log('Endpoint /api/chat processed successfully');
    
    res.json({
      success: true,
      response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /api/chat endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Streaming chat endpoint
app.post('/api/chat/stream', async (req, res) => {
  console.log('Endpoint /api/chat/stream hit with data:', req.body);
  try {
    const { message, isVoiceInput = false } = req.body;

    if (!message) {
      console.error('Missing message in /api/chat/stream');
      res.status(400).json({ error: 'Message is required' });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Stream response
    ecommerceAgent.streamResponse(message, isVoiceInput, (chunk) => {
      console.log('Streaming chunk in /api/chat/stream:', chunk);
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }).then((fullResponse) => {
      console.log('Completed streaming in /api/chat/stream');
      res.write(`data: ${JSON.stringify({ done: true, fullResponse })}\n\n`);
      res.end();
    }).catch((error) => {
      console.error('Error during streaming in /api/chat/stream:', error);
      res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error('Error setting up /api/chat/stream:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Product search endpoint
app.post('/api/search', async (req, res) => {
  console.log('Endpoint /api/search hit with data:', req.body);
  try {
    const { query, filters = {} } = req.body;

    if (!query) {
      console.error('Missing search query in /api/search');
      res.status(400).json({ error: 'Search query is required' });
    }

    const response = await ecommerceAgent.processMessage(`Find ${query}`, false);
    console.log('Endpoint /api/search processed successfully');
    
    res.json({
      success: true,
      response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /api/search endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Inventory management endpoints
app.post('/api/inventory/update', async (req, res) => {
  console.log('Endpoint /api/inventory/update hit with data:', req.body);
  try {
    const { productId, quantity } = req.body;

    if (!productId || quantity === undefined) {
      console.error('Missing parameters in /api/inventory/update');
      res.status(400).json({ error: 'Product ID and quantity are required' });
    }

    const result = await inventoryAgent.processInventoryUpdate(productId, quantity);
    console.log('Endpoint /api/inventory/update processed successfully');
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /api/inventory/update endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

app.get('/api/inventory/report', async (req, res) => {
  console.log('Endpoint /api/inventory/report hit');
  try {
    const result = await inventoryAgent.generateInventoryReport();
    console.log('Endpoint /api/inventory/report processed successfully');
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /api/inventory/report endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/inventory/maintenance', async (req, res) => {
  console.log('Endpoint /api/inventory/maintenance hit');
  try {
    const result = await inventoryAgent.performLowStockMaintenance();
    console.log('Endpoint /api/inventory/maintenance processed successfully');
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /api/inventory/maintenance endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

app.post('/api/embeddings/sync', async (req, res) => {
  console.log('Endpoint /api/embeddings/sync hit');
  try {
    const result = await inventoryAgent.syncAllEmbeddings();
    console.log('Endpoint /api/embeddings/sync processed successfully');
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /api/embeddings/sync endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Product management endpoints
app.get('/api/products', async (req, res) => {
  console.log('Endpoint /api/products hit with query:', req.query);
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

    console.log('Endpoint /api/products processed successfully, product count:', products.length);
    
    res.json({
      success: true,
      products,
      count: products.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /api/products endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/products/stats', async (req, res) => {
  console.log('Endpoint /api/products/stats hit');
  try {
    const stats = await dbService.getProductStats();
    console.log('Endpoint /api/products/stats processed successfully');
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /api/products/stats endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/categories', async (req, res) => {
  console.log('Endpoint /api/categories hit');
  try {
    const categories = await dbService.getCategories();
    console.log('Endpoint /api/categories processed successfully');
    
    res.json({
      success: true,
      categories,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /api/categories endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/brands', async (req, res) => {
  console.log('Endpoint /api/brands hit');
  try {
    const brands = await dbService.getBrands();
    console.log('Endpoint /api/brands processed successfully');
    
    res.json({
      success: true,
      brands,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /api/brands endpoint:', error);
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