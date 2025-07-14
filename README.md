# Mastra Ecommerce Bot

**Status:** 🚧 _In Development_  
**Audience:** Especially helpful for Tier-2 communities, with plans to expand to Tier-1 towns and cities.

---

Mastra Ecommerce Bot is an AI-powered shopping assistant designed to bring advanced ecommerce and inventory management capabilities to local businesses and communities, starting with Tier-2 towns and expanding to Tier-1 as well. The project is currently under active development.

## Features

- **Conversational AI Chatbot:**  
  Natural language chat interface for customers to ask about products, inventory, and more.

- **Product Search & Recommendations:**  
  Semantic search and smart suggestions using AI embeddings.

- **Inventory Management:**  
  Automated low-stock detection, bulk updates, and actionable recommendations for store owners.

- **Health Monitoring:**  
  `/health` endpoint to check system and service status.

- **Extensible API:**  
  RESTful endpoints for chat, search, inventory, and product management.

- **Streaming Responses:**  
  Real-time chat streaming for responsive user experience.

## Project Structure

```
.env
.gitignore
package.json
tsconfig.json
prisma/
  schema.prisma
  migrations/
public/
  index.html
src/
  index.ts
  agents/
    ecommerce-agent.ts
    inventory-agent.ts
  generated/
    prisma/
      client.d.ts
      client.js
  lib/
    database.ts
    ollama-service.ts
    pinecone-service.ts
  scripts/
    embedding-sync.ts
    full-embeddings.ts
    seed.ts
  tools/
    inventory-management.ts
    product-search.ts
```

## Getting Started

1. **Install dependencies:**
   ```sh
   npm install
   ```

2. **Set up environment variables:**  
   Copy `.env.example` to `.env` and fill in the required values.

3. **Run database migrations:**
   ```sh
   npx prisma migrate deploy
   ```

4. **Seed the database:**
   ```sh
   npm run seed
   ```

5. **Sync embeddings (optional, recommended):**
   ```sh
   npm run embed:full
   ```

6. **Start the development server:**
   ```sh
   npm run dev
   ```

7. **Access the app:**  
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Endpoints

- `GET /health` — System health check
- `POST /api/chat` — Chat with the ecommerce agent
- `POST /api/chat/stream` — Streaming chat responses
- `POST /api/search` — Product search
- `POST /api/inventory/update` — Update product inventory
- `GET /api/inventory/report` — Inventory report
- `POST /api/inventory/maintenance` — Low stock maintenance
- `POST /api/embeddings/sync` — Sync product embeddings
- `GET /api/products` — List products
- `GET /api/products/stats` — Product statistics
- `GET /api/categories` — List categories
- `GET /api/brands` — List brands

## Development Notes

- This project is **in development** and not yet production-ready.
- Designed to empower Tier-2 communities with modern ecommerce tools.
- Plans to expand to Tier-1 towns and cities after initial rollout.

## Contributing

Contributions are welcome! Please open issues or pull requests as you see fit.

---

_Mastra Ecommerce Bot — Bringing AI-powered commerce to every community._