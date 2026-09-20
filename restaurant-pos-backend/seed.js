const mongoose = require('mongoose');
require('dotenv').config();
const Item = require('./models/Item');
const Table = require('./models/Table');

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for seeding...');

    // Clear old data
    await Item.deleteMany({});
    await Table.deleteMany({});

    // Sample Menu Items with Veg/Non-Veg, Short codes, Addons & Half Prices
    await Item.insertMany([
      // Main Course (Veg)
      {
        name: 'Paneer Butter Masala',
        code: 'PBM',
        category: 'Main Course',
        foodType: 'veg',
        price: 260,
        halfPrice: 160,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=300',
        addons: ['Less Spicy', 'Jain / No Onion Garlic', 'Extra Butter']
      },
      {
        name: 'Dal Makhani',
        code: 'DM',
        category: 'Main Course',
        foodType: 'veg',
        price: 220,
        halfPrice: 140,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=300',
        addons: ['Extra Butter', 'Less Spicy']
      },
      {
        name: 'Shahi Paneer',
        code: 'SP',
        category: 'Main Course',
        foodType: 'veg',
        price: 250,
        halfPrice: 150,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=300',
        addons: ['Mild Sweet', 'Less Spicy']
      },

      // Main Course (Non-Veg)
      {
        name: 'Butter Chicken',
        code: 'BC',
        category: 'Main Course',
        foodType: 'non-veg',
        price: 340,
        halfPrice: 210,
        floor: 'Non-Veg Floor',
        image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=300',
        addons: ['Boneless', 'Extra Gravy', 'Spicy']
      },
      {
        name: 'Kadhai Chicken',
        code: 'KC',
        category: 'Main Course',
        foodType: 'non-veg',
        price: 320,
        halfPrice: 200,
        floor: 'Non-Veg Floor',
        image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=300',
        addons: ['Extra Spicy', 'Less Oil']
      },

      // Rice & Biryani
      {
        name: 'Veg Dum Biryani',
        code: 'VDB',
        category: 'Rice & Biryani',
        foodType: 'veg',
        price: 220,
        halfPrice: 140,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300',
        addons: ['With Raita', 'Extra Salan']
      },
      {
        name: 'Chicken Dum Biryani',
        code: 'CDB',
        category: 'Rice & Biryani',
        foodType: 'non-veg',
        price: 290,
        halfPrice: 180,
        floor: 'Non-Veg Floor',
        image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300',
        addons: ['Extra Raita', 'Spicy']
      },
      {
        name: 'Egg Biryani',
        code: 'EGB',
        category: 'Rice & Biryani',
        foodType: 'egg',
        price: 240,
        halfPrice: 150,
        floor: 'Non-Veg Floor',
        image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300',
        addons: ['Extra Egg', 'Less Spicy']
      },

      // Breads & Rotis
      {
        name: 'Butter Naan',
        code: 'BN',
        category: 'Breads & Rotis',
        foodType: 'veg',
        price: 50,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=300'
      },
      {
        name: 'Garlic Naan',
        code: 'GN',
        category: 'Breads & Rotis',
        foodType: 'veg',
        price: 65,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=300'
      },
      {
        name: 'Tandoori Roti',
        code: 'TR',
        category: 'Breads & Rotis',
        foodType: 'veg',
        price: 20,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=300'
      },

      // Starters
      {
        name: 'Paneer Tikka',
        code: 'PT',
        category: 'Starters',
        foodType: 'veg',
        price: 240,
        halfPrice: 150,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=300',
        addons: ['Mint Chutney Extra', 'Less Spicy']
      },
      {
        name: 'Chicken Tikka',
        code: 'CT',
        category: 'Starters',
        foodType: 'non-veg',
        price: 290,
        halfPrice: 180,
        floor: 'Non-Veg Floor',
        image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=300',
        addons: ['Juicy', 'Extra Spicy']
      },
      {
        name: 'Veg Spring Rolls',
        code: 'VSR',
        category: 'Starters',
        foodType: 'veg',
        price: 160,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=300'
      },

      // Fast Food & Beverages
      {
        name: 'Cheese Margherita Pizza',
        code: 'PIZZA',
        category: 'Fast Food',
        foodType: 'veg',
        price: 250,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300',
        addons: ['Extra Cheese', 'Thin Crust', 'Oregano Extra']
      },
      {
        name: 'Cold Coffee with Ice Cream',
        code: 'CC',
        category: 'Beverages',
        foodType: 'veg',
        price: 130,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=300'
      },

      // Floor 3: Birthday, Anniversary & Party Zone Menu
      {
        name: 'Kids Birthday Bash Package (10 Pax)',
        code: 'BDAY-10',
        category: 'Party Packages',
        foodType: 'veg',
        price: 4999,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=300',
        description: 'Includes decor, starters, burger, fries, drinks & birthday caps'
      },
      {
        name: 'Premium Birthday Party Package (20 Pax)',
        code: 'BDAY-20',
        category: 'Party Packages',
        foodType: 'veg',
        price: 8999,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=300',
        description: 'Deluxe banquet setup, 3 starters, main buffet, cake cutting & DJ lights'
      },
      {
        name: 'Anniversary Candlelight Celebration Package',
        code: 'ANNIV-PKG',
        category: 'Party Packages',
        foodType: 'veg',
        price: 6999,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=300',
        description: 'Rose petal setup, candlelight table, sparkling mocktails & 4-course meal'
      },
      {
        name: 'Kitty & Family Get-Together Package (15 Pax)',
        code: 'KITTY-15',
        category: 'Party Packages',
        foodType: 'veg',
        price: 5999,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=300',
        description: 'Exclusive party zone seating, starters platter, main course & mocktails'
      },
      {
        name: 'Chocolate Truffle Birthday Cake (1 Kg)',
        code: 'CAKE-TRF',
        category: 'Cakes & Bakery',
        foodType: 'veg',
        price: 799,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=300'
      },
      {
        name: 'Red Velvet Heart Anniversary Cake (1 Kg)',
        code: 'CAKE-RV',
        category: 'Cakes & Bakery',
        foodType: 'veg',
        price: 899,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1586985289906-406988974504?w=300'
      },
      {
        name: 'Party Cupcake Tower (12 Pcs)',
        code: 'CUPCAKE',
        category: 'Cakes & Bakery',
        foodType: 'veg',
        price: 650,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1519869325930-281384150729?w=300'
      },
      {
        name: 'Birthday Balloon Arch & Theme Backdrop',
        code: 'DECOR-ARCH',
        category: 'Decorations',
        foodType: 'veg',
        price: 1499,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=300'
      },
      {
        name: 'Anniversary Floral & Candlelight Decor',
        code: 'DECOR-ROSE',
        category: 'Decorations',
        foodType: 'veg',
        price: 1999,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=300'
      },
      {
        name: 'Party Mocktail Pitcher (Fruit Punch 1L)',
        code: 'PITCHER',
        category: 'Drinks & Pitchers',
        foodType: 'veg',
        price: 399,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=300'
      },
      {
        name: 'Soft Drink Party Crate (6 Bottles)',
        code: 'CRATE',
        category: 'Drinks & Pitchers',
        foodType: 'veg',
        price: 299,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=300'
      },
      // Additional vegetarian menu items
      {
        name: 'Veg Hara Bhara Kebab',
        code: 'VHK',
        category: 'Starters',
        foodType: 'veg',
        price: 220,
        halfPrice: 140,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80',
        addons: ['Mint Chutney', 'Extra Crispy']
      },
      {
        name: 'Mushroom Tikka',
        code: 'MTK',
        category: 'Starters',
        foodType: 'veg',
        price: 260,
        halfPrice: 160,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&auto=format&fit=crop&q=80',
        addons: ['Extra Spicy', 'Mint Chutney']
      },
      {
        name: 'Veg Korma',
        code: 'VK',
        category: 'Main Course',
        foodType: 'veg',
        price: 240,
        halfPrice: 150,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?w=600&auto=format&fit=crop&q=80'
      },
      {
        name: 'Malai Kofta',
        code: 'MK',
        category: 'Main Course',
        foodType: 'veg',
        price: 280,
        halfPrice: 175,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop&q=80'
      },
      {
        name: 'Veg Pulao',
        code: 'VP',
        category: 'Rice & Biryani',
        foodType: 'veg',
        price: 190,
        halfPrice: 120,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80'
      },
      {
        name: 'Paneer Tawa Masala',
        code: 'PTM',
        category: 'Main Course',
        foodType: 'veg',
        price: 290,
        halfPrice: 180,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop&q=80'
      },
      {
        name: 'Cheese Garlic Bread',
        code: 'CGB',
        category: 'Fast Food',
        foodType: 'veg',
        price: 180,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=600&auto=format&fit=crop&q=80'
      },
      {
        name: 'Veg Club Sandwich',
        code: 'VCS',
        category: 'Fast Food',
        foodType: 'veg',
        price: 210,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80'
      },
      {
        name: 'Mango Lassi',
        code: 'ML',
        category: 'Beverages',
        foodType: 'veg',
        price: 120,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1571167530149-cd7d5eaa2e8b?w=600&auto=format&fit=crop&q=80'
      },
      {
        name: 'Fresh Lime Soda',
        code: 'FLS',
        category: 'Beverages',
        foodType: 'veg',
        price: 90,
        floor: 'Veg Floor',
        image: 'https://images.unsplash.com/photo-1513558161293-cdefc8f9f1c3?w=600&auto=format&fit=crop&q=80'
      },
      // Additional birthday and party-zone items
      {
        name: 'Rainbow Birthday Cake (1 Kg)',
        code: 'BDAY-RB',
        category: 'Cakes & Bakery',
        foodType: 'veg',
        price: 999,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1558636508-e0db3814bd1d?w=300'
      },
      {
        name: 'Butterscotch Celebration Cake (1 Kg)',
        code: 'CAKE-BSC',
        category: 'Cakes & Bakery',
        foodType: 'veg',
        price: 849,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=300'
      },
      {
        name: 'Mini Donut Party Box (12 Pcs)',
        code: 'DONUT-12',
        category: 'Desserts',
        foodType: 'veg',
        price: 549,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=300'
      },
      {
        name: 'Ice Cream Sundae Bar (10 Pax)',
        code: 'SUNDAE-10',
        category: 'Desserts',
        foodType: 'veg',
        price: 1299,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=300'
      },
      {
        name: 'Chocolate Fountain Setup',
        code: 'CHOC-FNT',
        category: 'Desserts',
        foodType: 'veg',
        price: 1799,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1548907040-4d42fcaa0f9a?w=300'
      },
      {
        name: 'Kids Mocktail Combo (10 Glasses)',
        code: 'KIDS-MOCK',
        category: 'Drinks & Pitchers',
        foodType: 'veg',
        price: 599,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=300'
      },
      {
        name: 'Return Gift Hamper (10 Kids)',
        code: 'GIFT-10',
        category: 'Party Add-ons',
        foodType: 'veg',
        price: 1499,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=300'
      },
      {
        name: 'Birthday Welcome Drink Counter',
        code: 'WELCOME-DRINK',
        category: 'Party Add-ons',
        foodType: 'veg',
        price: 799,
        floor: 'Birthday Party Zone',
        image: 'https://images.unsplash.com/photo-1513558161293-cdefc8f9f1c3?w=300'
      }
    ]);

    // Sample Petpooja Tables across Floors
    await Table.insertMany([
      // Veg Floor Tables
      { tableNo: 1, tableNumber: 1, capacity: 2, floor: 'Veg Floor', type: 'Cafe', status: 'available' },
      { tableNo: 2, tableNumber: 2, capacity: 4, floor: 'Veg Floor', type: 'Dining', status: 'available' },
      { tableNo: 3, tableNumber: 3, capacity: 4, floor: 'Veg Floor', type: 'Dining', status: 'available' },
      { tableNo: 4, tableNumber: 4, capacity: 6, floor: 'Veg Floor', type: 'Dining', status: 'available' },
      
      // Birthday Party Zone
      { tableNo: 101, tableNumber: 101, capacity: 12, floor: 'Birthday Party Zone', type: 'Party Hall', status: 'available' },
      { tableNo: 102, tableNumber: 102, capacity: 20, floor: 'Birthday Party Zone', type: 'Birthday Zone', status: 'available' }
    ]);

    console.log('✅ Petpooja POS Data Successfully Seeded!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding Error:', error);
    process.exit(1);
  }
};

seedData();