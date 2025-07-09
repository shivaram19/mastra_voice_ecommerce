import { z } from 'zod';
import { OllamaService } from '../lib/ollama-service.js';
import { PineconeService } from '../lib/pinecone-service.js';
import { DatabaseService } from '../lib/database.js';

const ollamaService = new OllamaService();
const pineconeService = new PineconeService();
const dbService = new DatabaseService();

export const productSearchSchema = z.object({
  query: z.string().describe("User's search query for products"),
  maxResults: z.number().min(1).max(20).default(10).describe("Maximum number of results to return"),
  category: z.string().optional().describe("Filter by specific category"),
  minPrice: z.number().min(0).optional().describe("Minimum price filter"),
  maxPrice: z.number().min(0).optional().describe("Maximum price filter"),
  brand: z.string().optional().describe("Filter by specific brand"),
  inStockOnly: z.boolean().default(true).describe("Only return products that are in stock")
});

export type ProductSearchInput = z.infer<typeof productSearchSchema>;

export interface ProductSearchResult {
  success: boolean;
  products: Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    quantity: number;
    category?: string;
    brand?: string;
    sku: string;
    imageUrl?: string;
    relevanceScore: number;
  }>;
  totalFound: number;
  searchTerms: string;
  filters?: {
    category?: string;
    priceRange?: { min: number; max: number };
    brand?: string;
  };
  suggestions?: string[];
  error?: string;
}

export async function executeProductSearch(input: ProductSearchInput): Promise<ProductSearchResult> {
  try {
    console.log('Executing product search:', input);

    // Extract search intent and enhanced terms
    const searchIntent = await ollamaService.extractSearchIntent(input.query);
    console.log('Search intent:', searchIntent);

    // Generate embedding for the search query
    const searchEmbedding = await ollamaService.generateEmbedding(
      searchIntent.searchTerms || input.query
    );

    // Build search filters
    const searchFilters: Record<string, any> = {};
    
    if (input.inStockOnly) {
      searchFilters.quantity = { $gt: 0 };
      searchFilters.isActive = { $eq: true };
    }

    if (input.category || searchIntent.category) {
      searchFilters.category = { $eq: input.category || searchIntent.category };
    }

    if (input.brand || searchIntent.brand) {
      searchFilters.brand = { $eq: input.brand || searchIntent.brand };
    }

    // Handle price range
    if (input.minPrice !== undefined || input.maxPrice !== undefined || searchIntent.priceRange) {
      const priceFilter: any = {};
      
      if (input.minPrice !== undefined) {
        priceFilter.$gte = input.minPrice;
      } else if (searchIntent.priceRange?.min) {
        priceFilter.$gte = searchIntent.priceRange.min;
      }
      
      if (input.maxPrice !== undefined) {
        priceFilter.$lte = input.maxPrice;
      } else if (searchIntent.priceRange?.max) {
        priceFilter.$lte = searchIntent.priceRange.max;
      }
      
      if (Object.keys(priceFilter).length > 0) {
        searchFilters.price = priceFilter;
      }
    }

    // Search in Pinecone
    const searchResults = await pineconeService.searchProducts(searchEmbedding, {
      topK: input.maxResults,
      filter: searchFilters,
      minScore: 0.6 // Adjust based on your needs
    });

    // Format results
    const products = searchResults.map(result => ({
      id: result.metadata.id,
      name: result.metadata.name,
      description: result.metadata.description || '',
      price: result.metadata.price,
      quantity: result.metadata.quantity,
      category: result.metadata.category,
      brand: result.metadata.brand,
      sku: result.metadata.sku,
      imageUrl: undefined, // Would need to fetch from DB if needed
      relevanceScore: Math.round(result.score * 100) / 100
    }));

    // Generate suggestions if few results
    let suggestions: string[] = [];
    if (products.length < 3) {
      suggestions = await generateSearchSuggestions(input.query, searchIntent);
    }

    const appliedFilters: any = {};
    if (input.category || searchIntent.category) {
      appliedFilters.category = input.category || searchIntent.category;
    }
    if (input.minPrice !== undefined || input.maxPrice !== undefined || searchIntent.priceRange) {
      appliedFilters.priceRange = {
        min: input.minPrice || searchIntent.priceRange?.min,
        max: input.maxPrice || searchIntent.priceRange?.max
      };
    }
    if (input.brand || searchIntent.brand) {
      appliedFilters.brand = input.brand || searchIntent.brand;
    }

    return {
      success: true,
      products,
      totalFound: products.length,
      searchTerms: searchIntent.searchTerms || input.query,
      filters: Object.keys(appliedFilters).length > 0 ? appliedFilters : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined
    };

  } catch (error) {
    console.error('Error in product search:', error);
    
    return {
      success: false,
      products: [],
      totalFound: 0,
      searchTerms: input.query,
      error: error instanceof Error ? error.message : 'Unknown search error'
    };
  }
}

async function generateSearchSuggestions(originalQuery: string, searchIntent: any): Promise<string[]> {
  try {
    // Get popular categories and brands from database
    const [categories, brands] = await Promise.all([
      dbService.getCategories(),
      dbService.getBrands()
    ]);

    const suggestions: string[] = [];

    // Add category suggestions
    if (!searchIntent.category && categories.length > 0) {
      const relatedCategories = categories.slice(0, 3);
      suggestions.push(...relatedCategories.map((cat:any) => `${originalQuery} in ${cat}`));
    }

    // Add brand suggestions
    if (!searchIntent.brand && brands.length > 0) {
      const relatedBrands = brands.slice(0, 2);
      suggestions.push(...relatedBrands.map((brand:any) => `${brand} ${originalQuery}`));
    }

    // Add price range suggestions
    if (!searchIntent.priceRange) {
      suggestions.push(
        `${originalQuery} under $50`,
        `${originalQuery} under $100`,
        `affordable ${originalQuery}`
      );
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return [];
  }
}

// Tool definition for Mastra
export const productSearchTool = {
  id: 'product-search',
  name: 'Product Search',
  description: 'Search for products using semantic search with filters',
  inputSchema: productSearchSchema,
  execute: executeProductSearch
};