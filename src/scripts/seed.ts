import dotenv from 'dotenv';
import { DatabaseService } from '../lib/database.js';

dotenv.config();

const dbService = new DatabaseService();

const sampleProducts = [
  // Electronics
  {
    name: "Sony WH-1000XM4 Wireless Headphones",
    description: "Industry-leading noise canceling with Dual Noise Sensor technology. Up to 30-hour battery life with quick charge.",
    sku: "SONY-WH1000XM4-BLK",
    price: 349.99,
    quantity: 25,
    category: "Electronics",
    brand: "Sony",
    imageUrl: "https://example.com/sony-headphones.jpg",
    tags: ["wireless", "noise-canceling", "bluetooth", "premium"],
    searchKeywords: "headphones wireless noise canceling premium audio"
  },
  {
    name: "Apple iPhone 15 Pro",
    description: "iPhone 15 Pro with titanium design, A17 Pro chip, and advanced camera system with 5x telephoto zoom.",
    sku: "APPLE-IP15PRO-128-NT",
    price: 999.99,
    quantity: 15,
    category: "Electronics",
    brand: "Apple",
    imageUrl: "https://example.com/iphone-15-pro.jpg",
    tags: ["smartphone", "5g", "camera", "titanium"],
    searchKeywords: "iphone apple smartphone mobile phone camera"
  },
  {
    name: "Samsung 65\" QLED 4K Smart TV",
    description: "Quantum Dot technology delivers vibrant colors and crisp details. Smart TV with built-in streaming apps.",
    sku: "SAMSUNG-QN65Q80C",
    price: 1299.99,
    quantity: 8,
    category: "Electronics",
    brand: "Samsung",
    imageUrl: "https://example.com/samsung-tv.jpg",
    tags: ["tv", "4k", "smart", "qled", "65-inch"],
    searchKeywords: "television tv smart 4k uhd samsung qled"
  },
  
  // Clothing
  {
    name: "Nike Air Max 270 Running Shoes",
    description: "Comfortable running shoes with visible Air Max unit in the heel for lightweight cushioning.",
    sku: "NIKE-AM270-BLK-10",
    price: 149.99,
    quantity: 30,
    category: "Clothing",
    brand: "Nike",
    imageUrl: "https://example.com/nike-air-max.jpg",
    tags: ["shoes", "running", "athletic", "air-max"],
    searchKeywords: "running shoes nike athletic footwear sports"
  },
  {
    name: "Levi's 501 Original Fit Jeans",
    description: "Classic straight fit jeans with the iconic 501 styling. Made from 100% cotton denim.",
    sku: "LEVIS-501-BLUE-32X32",
    price: 79.99,
    quantity: 45,
    category: "Clothing",
    brand: "Levi's",
    imageUrl: "https://example.com/levis-jeans.jpg",
    tags: ["jeans", "denim", "classic", "cotton"],
    searchKeywords: "jeans denim pants levis clothing casual"
  },
  {
    name: "Patagonia Better Sweater Fleece Jacket",
    description: "Warm fleece jacket made from recycled polyester. Perfect for outdoor activities and layering.",
    sku: "PATA-FLEECE-GRY-L",
    price: 99.99,
    quantity: 20,
    category: "Clothing",
    brand: "Patagonia",
    imageUrl: "https://example.com/patagonia-fleece.jpg",
    tags: ["jacket", "fleece", "outdoor", "recycled"],
    searchKeywords: "jacket fleece outdoor patagonia warm clothing"
  },

  // Home & Garden
  {
    name: "Instant Pot Duo 7-in-1 Electric Pressure Cooker",
    description: "Multi-functional cooker: pressure cooker, slow cooker, rice cooker, steamer, sauté, yogurt maker, and warmer.",
    sku: "INSTANT-DUO-6QT",
    price: 89.99,
    quantity: 35,
    category: "Home & Garden",
    brand: "Instant Pot",
    imageUrl: "https://example.com/instant-pot.jpg",
    tags: ["kitchen", "pressure-cooker", "multi-function", "cooking"],
    searchKeywords: "pressure cooker instant pot kitchen appliance cooking"
  },
  {
    name: "Dyson V8 Animal Cordless Vacuum",
    description: "Powerful cordless vacuum with up to 40 minutes of run time. Designed for homes with pets.",
    sku: "DYSON-V8-ANIMAL",
    price: 399.99,
    quantity: 12,
    category: "Home & Garden",
    brand: "Dyson",
    imageUrl: "https://example.com/dyson-vacuum.jpg",
    tags: ["vacuum", "cordless", "pet-hair", "cleaning"],
    searchKeywords: "vacuum cleaner dyson cordless pet hair cleaning"
  },
  {
    name: "Philips Hue Smart LED Bulb Starter Kit",
    description: "Smart LED bulbs with millions of colors. Control with smartphone app or voice commands.",
    sku: "PHILIPS-HUE-START-4PK",
    price: 179.99,
    quantity: 22,
    category: "Home & Garden",
    brand: "Philips",
    imageUrl: "https://example.com/philips-hue.jpg",
    tags: ["smart-home", "led", "lighting", "color-changing"],
    searchKeywords: "smart bulbs led lighting philips hue home automation"
  },

  // Sports & Outdoors
  {
    name: "YETI Rambler 20oz Tumbler",
    description: "Double-wall vacuum insulated tumbler keeps drinks cold or hot for hours. Dishwasher safe.",
    sku: "YETI-RAMBLER-20OZ-SS",
    price: 34.99,
    quantity: 50,
    category: "Sports & Outdoors",
    brand: "YETI",
    imageUrl: "https://example.com/yeti-tumbler.jpg",
    tags: ["tumbler", "insulated", "stainless-steel", "outdoor"],
    searchKeywords: "tumbler water bottle yeti insulated outdoor drinkware"
  },
  {
    name: "REI Co-op Flash 22 Hiking Backpack",
    description: "Lightweight day pack with 22-liter capacity. Perfect for hiking, travel, and everyday use.",
    sku: "REI-FLASH22-GRN",
    price: 49.99,
    quantity: 18,
    category: "Sports & Outdoors",
    brand: "REI Co-op",
    imageUrl: "https://example.com/rei-backpack.jpg",
    tags: ["backpack", "hiking", "daypack", "lightweight"],
    searchKeywords: "backpack hiking daypack rei outdoor travel"
  },

  // Books
  {
    name: "Atomic Habits by James Clear",
    description: "Practical guide to building good habits and breaking bad ones with proven strategies.",
    sku: "BOOK-ATOMIC-HABITS",
    price: 16.99,
    quantity: 40,
    category: "Books",
    brand: "Avery",
    imageUrl: "https://example.com/atomic-habits.jpg",
    tags: ["self-help", "productivity", "habits", "bestseller"],
    searchKeywords: "book habits productivity self help james clear"
  },
  {
    name: "The Seven Husbands of Evelyn Hugo",
    description: "A captivating novel about a reclusive Hollywood icon who finally decides to tell her story.",
    sku: "BOOK-EVELYN-HUGO",
    price: 14.99,
    quantity: 25,
    category: "Books",
    brand: "Atria Books",
    imageUrl: "https://example.com/evelyn-hugo.jpg",
    tags: ["fiction", "novel", "hollywood", "bestseller"],
    searchKeywords: "book fiction novel taylor jenkins reid bestseller"
  },

  // Health & Beauty
  {
    name: "CeraVe Daily Moisturizing Lotion",
    description: "Lightweight moisturizer with hyaluronic acid and ceramides for 24-hour hydration.",
    sku: "CERAVE-LOTION-16OZ",
    price: 12.99,
    quantity: 60,
    category: "Health & Beauty",
    brand: "CeraVe",
    imageUrl: "https://example.com/cerave-lotion.jpg",
    tags: ["skincare", "moisturizer", "hyaluronic-acid", "sensitive-skin"],
    searchKeywords: "moisturizer lotion skincare cerave hydration"
  },
  {
    name: "Oral-B Pro 1000 Electric Toothbrush",
    description: "Electric toothbrush with oscillating, rotating, and pulsating movements for superior plaque removal.",
    sku: "ORALB-PRO1000-BLU",
    price: 39.99,
    quantity: 28,
    category: "Health & Beauty",
    brand: "Oral-B",
    imageUrl: "https://example.com/oral-b-toothbrush.jpg",
    tags: ["electric-toothbrush", "dental-care", "plaque-removal"],
    searchKeywords: "electric toothbrush oral b dental care teeth cleaning"
  },

  // Toys & Games
  {
    name: "LEGO Creator 3-in-1 Deep Sea Creatures",
    description: "Build a shark, squid, or angler fish with this creative 3-in-1 LEGO set. 230 pieces included.",
    sku: "LEGO-31088-CREATURES",
    price: 15.99,
    quantity: 35,
    category: "Toys & Games",
    brand: "LEGO",
    imageUrl: "https://example.com/lego-sea-creatures.jpg",
    tags: ["lego", "building", "3-in-1", "sea-creatures"],
    searchKeywords: "lego building blocks toys creative construction"
  },

  // Low stock / Out of stock items for testing
  {
    name: "Limited Edition Gaming Headset",
    description: "High-end gaming headset with surround sound and RGB lighting. Limited availability.",
    sku: "GAME-HEADSET-LTD",
    price: 199.99,
    quantity: 2, // Low stock
    category: "Electronics",
    brand: "GameTech",
    imageUrl: "https://example.com/gaming-headset.jpg",
    tags: ["gaming", "headset", "limited-edition", "rgb"],
    searchKeywords: "gaming headset limited edition rgb surround sound"
  },
  {
    name: "Vintage Style Camera",
    description: "Retro-inspired instant camera for capturing memories in vintage style.",
    sku: "VINTAGE-CAM-001",
    price: 89.99,
    quantity: 0, // Out of stock
    category: "Electronics",
    brand: "RetroTech",
    imageUrl: "https://example.com/vintage-camera.jpg",
    tags: ["camera", "vintage", "instant", "retro"],
    searchKeywords: "camera vintage instant retro photography"
  }
];

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');

    // Create products
    let created = 0;
    let skipped = 0;

    for (const productData of sampleProducts) {
      try {
        // Check if product already exists
        const existing = await dbService.getProductBySku(productData.sku);
        
        if (existing) {
          console.log(`⏭️  Skipping existing product: ${productData.name}`);
          skipped++;
          continue;
        }

        // Create new product
        const product = await dbService.createProduct(productData);
        console.log(`✅ Created product: ${product.name} (ID: ${product.id})`);
        created++;

      } catch (error) {
        console.error(`❌ Error creating product ${productData.name}:`, error);
      }
    }

    console.log('\n📊 Seeding Summary:');
    console.log(`   ✅ Created: ${created} products`);
    console.log(`   ⏭️  Skipped: ${skipped} products`);
    console.log(`   📦 Total in seed data: ${sampleProducts.length} products`);

    // Display category breakdown
    const stats = await dbService.getProductStats();
    console.log('\n📈 Database Statistics:');
    console.log(`   Total Products: ${stats.totalProducts}`);
    console.log(`   Active Products: ${stats.activeProducts}`);
    console.log(`   Low Stock Products: ${stats.lowStockProducts}`);
    console.log(`   Out of Stock Products: ${stats.outOfStockProducts}`);

    // Display categories
    const categories = await dbService.getCategories();
    console.log(`\n🏷️  Categories (${categories.length}):`);
    categories.forEach((category : any) => console.log(`   - ${category}`));

    // Display brands
    const brands = await dbService.getBrands();
    console.log(`\n🏢 Brands (${brands.length}):`);
    brands.forEach((brand : any) => console.log(`   - ${brand}`));

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Run embedding sync: npm run embed:full');
    console.log('   2. Start the server: npm run dev');
    console.log('   3. Test the chat API at http://localhost:3000/api/chat');

  } catch (error) {
    console.error('💥 Error during database seeding:', error);
    throw error;
  }
}

// Cleanup function
async function cleanup() {
  try {
    await dbService.cleanup();
    console.log('🧹 Cleanup completed');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

// Main execution
async function main() {
  try {
    await seedDatabase();
  } catch (error) {
    console.error('💥 Seeding failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

// Handle interrupts
process.on('SIGINT', async () => {
  console.log('\n🛑 Interrupted, cleaning up...');
  await cleanup();
  process.exit(0);
});

// Run the seeding
if (require.main === module) {
  main();
}