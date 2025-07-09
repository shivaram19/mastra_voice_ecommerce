import { Ollama } from 'ollama';

export class OllamaService {
  private ollama: Ollama;
  private chatModel: string;
  private embeddingModel: string;

  constructor() {
    this.ollama = new Ollama({
      host: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    });
    this.chatModel = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
  }

  async ensureModelsExist() {
    try {
      // Check if chat model exists
      const models = await this.ollama.list();
      const chatModelExists = models.models.some(model => 
        model.name.includes(this.chatModel.split(':')[0])
      );
      const embeddingModelExists = models.models.some(model => 
        model.name.includes(this.embeddingModel.split(':')[0])
      );

      if (!chatModelExists) {
        console.log(`Pulling chat model: ${this.chatModel}`);
        await this.ollama.pull({ model: this.chatModel });
      }

      if (!embeddingModelExists) {
        console.log(`Pulling embedding model: ${this.embeddingModel}`);
        await this.ollama.pull({ model: this.embeddingModel });
      }

      console.log('All Ollama models are ready');
    } catch (error) {
      console.error('Error ensuring models exist:', error);
      throw error;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Clean and prepare text for embedding
      const cleanText = this.prepareTextForEmbedding(text);
      
      const response = await this.ollama.embeddings({
        model: this.embeddingModel,
        prompt: cleanText
      });

      if (!response.embedding || response.embedding.length === 0) {
        throw new Error('No embedding returned from Ollama');
      }

      return response.embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const embeddings: number[][] = [];
      
      // Process in batches to avoid overwhelming Ollama
      const batchSize = 5;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchPromises = batch.map(text => this.generateEmbedding(text));
        const batchEmbeddings = await Promise.all(batchPromises);
        embeddings.push(...batchEmbeddings);
        
        // Small delay between batches
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return embeddings;
    } catch (error) {
      console.error('Error generating batch embeddings:', error);
      throw error;
    }
  }

  async chat(messages: Array<{ role: string; content: string }>, systemPrompt?: string) {
    try {
      const allMessages = systemPrompt 
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

      const response = await this.ollama.chat({
        model: this.chatModel,
        messages: allMessages,
        stream: false
      });

      return response.message.content;
    } catch (error) {
      console.error('Error in chat:', error);
      throw error;
    }
  }

  async streamChat(
    messages: Array<{ role: string; content: string }>, 
    systemPrompt?: string,
    onChunk?: (chunk: string) => void
  ) {
    try {
      const allMessages = systemPrompt 
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

      const response = await this.ollama.chat({
        model: this.chatModel,
        messages: allMessages,
        stream: true
      });

      let fullResponse = '';
      
      for await (const chunk of response) {
        if (chunk.message && chunk.message.content) {
          fullResponse += chunk.message.content;
          if (onChunk) {
            onChunk(chunk.message.content);
          }
        }
      }

      return fullResponse;
    } catch (error) {
      console.error('Error in stream chat:', error);
      throw error;
    }
  }

  private prepareTextForEmbedding(text: string): string {
    // Clean and prepare text for better embeddings
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s\-.,!?]/g, '') // Remove special characters except basic punctuation
      .toLowerCase();
  }

  async extractSearchIntent(userQuery: string): Promise<{
    intent: 'search' | 'filter' | 'compare' | 'info';
    category?: string;
    priceRange?: { min: number; max: number };
    brand?: string;
    features?: string[];
    searchTerms: string;
  }> {
    try {
      const systemPrompt = `You are an ecommerce search intent analyzer. 
      Analyze user queries and extract:
      1. Intent type: search, filter, compare, or info
      2. Category if mentioned
      3. Price range if mentioned
      4. Brand if mentioned
      5. Features or specifications
      6. Clean search terms for semantic search

      Respond in JSON format only.`;

      const userMessage = `Analyze this query: "${userQuery}"`;
      
      const response = await this.chat([
        { role: 'user', content: userMessage }
      ], systemPrompt);

      try {
        return JSON.parse(response);
      } catch {
        // Fallback if JSON parsing fails
        return {
          intent: 'search' as const,
          searchTerms: userQuery
        };
      }
    } catch (error) {
      console.error('Error extracting search intent:', error);
      // Safe fallback
      return {
        intent: 'search' as const,
        searchTerms: userQuery
      };
    }
  }

  async isModelAvailable(modelName: string): Promise<boolean> {
    try {
      const models = await this.ollama.list();
      return models.models.some(model => model.name.includes(modelName));
    } catch (error) {
      console.error('Error checking model availability:', error);
      return false;
    }
  }

  getModelInfo() {
    return {
      chatModel: this.chatModel,
      embeddingModel: this.embeddingModel,
      host: this.ollama.show
    };
  }
}