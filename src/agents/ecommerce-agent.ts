import { OllamaService } from '../lib/ollama-service.js';
import { productSearchTool } from '../tools/product-search.js';
import { inventoryCheckTool } from '../tools/inventory-management.js';

const ollamaService = new OllamaService();

export interface EcommerceAgentConfig {
  name: string;
  description: string;
  instructions: string;
  temperature: number;
  maxTokens: number;
  tools: string[];
}

export class EcommerceAgent {
  private config: EcommerceAgentConfig;
  private conversationHistory: Array<{ role: string; content: string }>;

  constructor() {
    this.config = {
      name: "EcommerceAgent",
      description: "Hybrid voice+text product search and shopping assistant",
      instructions: this.getSystemInstructions(),
      temperature: 0.7,
      maxTokens: 1000,
      tools: ['product-search', 'inventory-check']
    };
    
    this.conversationHistory = [];
  }

  private getSystemInstructions(): string {
    return `You are an intelligent ecommerce shopping assistant that helps customers find products through both voice and text interactions.

CORE CAPABILITIES:
1. Product Search: Use semantic search to find relevant products based on customer queries
2. Inventory Information: Check stock levels and availability
3. Product Recommendations: Suggest alternatives and related products
4. Shopping Guidance: Help customers make informed purchasing decisions

PERSONALITY & TONE:
- Friendly, helpful, and professional
- Enthusiastic about products without being pushy
- Clear and concise in explanations
- Patient with customer questions and clarifications
- Proactive in offering helpful suggestions

SEARCH BEHAVIOR:
- Always use the product-search tool for product queries
- Interpret natural language requests intelligently
- Consider synonyms and related terms
- Filter results based on customer preferences (price, brand, category)
- Handle voice input naturally (may contain speech recognition errors)

PRODUCT PRESENTATION:
- Show product name, price, and key features
- Mention stock availability (in stock, low stock, out of stock)
- Highlight relevant features based on customer needs
- Provide clear, scannable information
- Include relevance scores when helpful

CONVERSATION FLOW:
1. Understand customer intent and preferences
2. Search for relevant products
3. Present results in an organized way
4. Ask clarifying questions if needed
5. Offer alternatives or suggestions
6. Help with product comparisons

HANDLING EDGE CASES:
- If no products found: Suggest similar terms or broader categories
- If too many results: Help narrow down with filters
- If out of stock: Offer similar alternatives
- If price sensitive: Show products in different price ranges

EXAMPLE INTERACTIONS:
Customer: "I need wireless headphones under $100"
Assistant: "I'll help you find wireless headphones under $100. Let me search our inventory..."
[Use product-search tool with price filter]
[Present results with key features, prices, and availability]

Customer: "Do you have any running shoes?"
Assistant: "I'll search for running shoes in our current inventory..."
[Use product-search tool for "running shoes"]
[Show variety of options with different brands and prices]

Remember to:
- Always search before answering product questions
- Be specific about stock levels and pricing
- Offer to check inventory for specific items
- Suggest related products when appropriate
- Handle both voice and text input naturally`;
  }

  async processMessage(userMessage: string, isVoiceInput: boolean = false): Promise<string> {
    try {
      // Add user message to conversation history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Determine if this requires tool usage
      const needsProductSearch = this.requiresProductSearch(userMessage);
      const needsInventoryCheck = this.requiresInventoryCheck(userMessage);

      let response = '';

      if (needsProductSearch) {
        response = await this.handleProductSearch(userMessage);
      } else if (needsInventoryCheck) {
        response = await this.handleInventoryCheck(userMessage);
      } else {
        response = await this.handleGeneralChat(userMessage);
      }

      // Add assistant response to history
      this.conversationHistory.push({ role: 'assistant', content: response });

      // Keep conversation history manageable
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-16);
      }

      return response;

    } catch (error) {
      console.error('Error processing message:', error);
      return "I'm sorry, I encountered an error while processing your request. Could you please try again?";
    }
  }

  private requiresProductSearch(message: string): boolean {
    const searchKeywords = [
      'find', 'search', 'looking for', 'need', 'want', 'show me', 'do you have',
      'available', 'sell', 'products', 'items', 'buy', 'purchase', 'browse'
    ];
    
    const lowerMessage = message.toLowerCase();
    return searchKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  private requiresInventoryCheck(message: string): boolean {
    const inventoryKeywords = [
      'in stock', 'available', 'inventory', 'quantity', 'how many',
      'stock level', 'out of stock', 'sold out'
    ];
    
    const lowerMessage = message.toLowerCase();
    return inventoryKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  private async handleProductSearch(userMessage: string): Promise<string> {
    try {
      // Extract search parameters from the message
      const searchIntent = await ollamaService.extractSearchIntent(userMessage);
      
      // Execute product search
      const searchResult = await productSearchTool.execute({
        query: userMessage,
        maxResults: 10,
        category: searchIntent.category,
        minPrice: searchIntent.priceRange?.min,
        maxPrice: searchIntent.priceRange?.max,
        brand: searchIntent.brand,
        inStockOnly: true
      });

      if (!searchResult.success) {
        return `I'm sorry, I couldn't search for products right now. ${searchResult.error || 'Please try again later.'}`;
      }

      if (searchResult.products.length === 0) {
        let response = `I couldn't find any products matching "${userMessage}".`;
        
        if (searchResult.suggestions && searchResult.suggestions.length > 0) {
          response += ` Here are some suggestions you might try:\n`;
          searchResult.suggestions.forEach((suggestion, index) => {
            response += `${index + 1}. ${suggestion}\n`;
          });
        }
        
        return response;
      }

      // Format the response
      let response = `I found ${searchResult.products.length} product${searchResult.products.length > 1 ? 's' : ''} for "${searchResult.searchTerms}":\n\n`;

      searchResult.products.forEach((product, index) => {
        response += `**${index + 1}. ${product.name}**\n`;
        response += `   Price: $${product.price.toFixed(2)}\n`;
        response += `   Stock: ${product.quantity} available\n`;
        
        if (product.category) {
          response += `   Category: ${product.category}\n`;
        }
        
        if (product.brand) {
          response += `   Brand: ${product.brand}\n`;
        }
        
        if (product.description) {
          const shortDesc = product.description.length > 100 
            ? product.description.substring(0, 97) + '...'
            : product.description;
          response += `   ${shortDesc}\n`;
        }
        
        response += `   Relevance: ${(product.relevanceScore * 100).toFixed(0)}%\n\n`;
      });

      // Add suggestions for refinement
      if (searchResult.products.length > 5) {
        response += `\nToo many options? I can help you narrow down by:\n`;
        response += `- Specific brand or category\n`;
        response += `- Price range\n`;
        response += `- Specific features you're looking for\n`;
      }

      return response;

    } catch (error) {
      console.error('Error in product search:', error);
      return "I'm sorry, I encountered an error while searching for products. Please try again.";
    }
  }

  private async handleInventoryCheck(userMessage: string): Promise<string> {
    try {
      // This is a simplified inventory check - in a real implementation,
      // you'd extract product identifiers from the message
      const result = await inventoryCheckTool.execute({
        threshold: 5
      });

      if (!result.success) {
        return `I'm sorry, I couldn't check inventory right now. ${result.error || 'Please try again later.'}`;
      }

      if (result.lowStockProducts && result.lowStockProducts.length > 0) {
        let response = "Here are products with low stock:\n\n";
        result.lowStockProducts.forEach((product, index) => {
          response += `${index + 1}. ${product.name} (SKU: ${product.sku}) - ${product.quantity} remaining\n`;
        });
        return response;
      }

      return "All products appear to be well-stocked. Is there a specific product you'd like me to check?";

    } catch (error) {
      console.error('Error in inventory check:', error);
      return "I'm sorry, I encountered an error while checking inventory. Please try again.";
    }
  }

  private async handleGeneralChat(userMessage: string): Promise<string> {
    try {
      const response = await ollamaService.chat(
        [{ role: 'user', content: userMessage }],
        this.config.instructions
      );

      return response;

    } catch (error) {
      console.error('Error in general chat:', error);
      return "I'm here to help you find products! You can ask me about specific items, browse categories, or let me know what you're looking for.";
    }
  }

  async streamResponse(
    userMessage: string, 
    isVoiceInput: boolean = false,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    try {
      // For streaming, we'll handle simple chat responses
      // Tool-based responses are returned immediately
      if (this.requiresProductSearch(userMessage) || this.requiresInventoryCheck(userMessage)) {
        return this.processMessage(userMessage, isVoiceInput);
      }

      this.conversationHistory.push({ role: 'user', content: userMessage });

      const fullResponse = await ollamaService.streamChat(
        this.conversationHistory,
        this.config.instructions,
        onChunk
      );

      this.conversationHistory.push({ role: 'assistant', content: fullResponse });

      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-16);
      }

      return fullResponse;

    } catch (error) {
      console.error('Error in streaming response:', error);
      return "I'm sorry, I encountered an error. How can I help you find products today?";
    }
  }

  getConversationHistory(): Array<{ role: string; content: string }> {
    return [...this.conversationHistory];
  }

  clearConversationHistory(): void {
    this.conversationHistory = [];
  }

  getConfig(): EcommerceAgentConfig {
    return { ...this.config };
  }
}