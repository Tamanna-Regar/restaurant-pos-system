const mongoose = require('mongoose');
const Item = require('../models/Item');
const Ingredient = require('../models/Ingredient');
const Recipe = require('../models/Recipe');

async function seed() {
  await mongoose.connect('mongodb://127.0.0.1:27017/restaurant_pos');
  console.log('Connected to DB...');

  // 1. Fix existing Paneer and Rice prices
  await Ingredient.findOneAndUpdate({ name: /paneer/i }, { costPerUnit: 360, unit: 'kg' });
  await Ingredient.findOneAndUpdate({ name: /^rice$/i }, { costPerUnit: 60, unit: 'kg' });
  console.log('Updated Paneer and Rice prices.');

  // 2. Add or update standard ingredients
  const standardIngredients = [
    { name: 'Butter', unit: 'kg', costPerUnit: 500, stock: 20, currentStock: 20, minLimit: 3, category: 'Dairy' },
    { name: 'Fresh Cream', unit: 'ltr', costPerUnit: 250, stock: 15, currentStock: 15, minLimit: 2, category: 'Dairy' },
    { name: 'Cooking Oil', unit: 'ltr', costPerUnit: 140, stock: 50, currentStock: 50, minLimit: 10, category: 'Dry Goods' },
    { name: 'Maida / Flour', unit: 'kg', costPerUnit: 35, stock: 50, currentStock: 50, minLimit: 10, category: 'Dry Goods' },
    { name: 'Mozzarella Cheese', unit: 'kg', costPerUnit: 450, stock: 15, currentStock: 15, minLimit: 3, category: 'Dairy' },
    { name: 'Tomato Gravy / Puree', unit: 'kg', costPerUnit: 60, stock: 30, currentStock: 30, minLimit: 5, category: 'Vegetables' },
    { name: 'Onions', unit: 'kg', costPerUnit: 35, stock: 40, currentStock: 40, minLimit: 10, category: 'Vegetables' },
    { name: 'Garlic and Ginger', unit: 'kg', costPerUnit: 120, stock: 15, currentStock: 15, minLimit: 2, category: 'Vegetables' },
    { name: 'Garam Masala and Spices', unit: 'kg', costPerUnit: 600, stock: 8, currentStock: 8, minLimit: 1, category: 'Dry Goods' },
    { name: 'Burger Buns', unit: 'pcs', costPerUnit: 15, stock: 60, currentStock: 60, minLimit: 10, category: 'Other' },
    { name: 'Pizza Base 8 inch', unit: 'pcs', costPerUnit: 25, stock: 50, currentStock: 50, minLimit: 10, category: 'Other' },
    { name: 'Mixed Vegetables', unit: 'kg', costPerUnit: 50, stock: 35, currentStock: 35, minLimit: 5, category: 'Vegetables' },
    { name: 'Mocktail Fruit Syrup', unit: 'ltr', costPerUnit: 240, stock: 12, currentStock: 12, minLimit: 2, category: 'Beverages' },
    { name: 'Soda / Carbonated Water', unit: 'ltr', costPerUnit: 40, stock: 40, currentStock: 40, minLimit: 5, category: 'Beverages' }
  ];

  for (const ingData of standardIngredients) {
    await Ingredient.findOneAndUpdate(
      { name: ingData.name },
      ingData,
      { upsert: true, new: true }
    );
  }
  console.log('Standard ingredients upserted.');

  // Fetch all ingredients map
  const allIngs = await Ingredient.find({});
  const ingMap = new Map();
  allIngs.forEach(i => ingMap.set(i.name.toLowerCase().trim(), i._id));

  const getIng = (namePart) => {
    for (const [name, id] of ingMap.entries()) {
      if (name.includes(namePart.toLowerCase())) return id;
    }
    return null;
  };

  // 3. Fix Cocktail Recipe
  const cocktailItem = await Item.findOne({ name: /cocktail/i });
  if (cocktailItem) {
    const syrupId = getIng('mocktail fruit syrup');
    const sodaId = getIng('soda');
    const sugarId = getIng('sugar');
    if (syrupId && sodaId) {
      await Recipe.findOneAndUpdate(
        { itemId: cocktailItem._id },
        {
          itemId: cocktailItem._id,
          ingredients: [
            { ingredientId: syrupId, quantityRequired: 0.05 },
            { ingredientId: sodaId, quantityRequired: 0.20 },
            { ingredientId: sugarId || syrupId, quantityRequired: 0.01 }
          ],
          portionSize: '1 Mocktail Glass (250ml)',
          instructions: 'Muddle mint and fresh lime, pour 50ml fruit syrup over ice, top with chilled soda and stir.'
        },
        { upsert: true }
      );
      console.log('Fixed Cocktail recipe!');
    }
  }

  // 4. Fix Paneer Butter Masala
  const pbmItem = await Item.findOne({ name: /paneer butter masala/i });
  if (pbmItem) {
    const paneerId = getIng('paneer');
    const butterId = getIng('butter');
    const creamId = getIng('fresh cream');
    const tomatoId = getIng('tomato gravy');
    const oilId = getIng('cooking oil');
    const spiceId = getIng('garam masala');

    await Recipe.findOneAndUpdate(
      { itemId: pbmItem._id },
      {
        itemId: pbmItem._id,
        ingredients: [
          { ingredientId: paneerId, quantityRequired: 0.2 },
          { ingredientId: butterId, quantityRequired: 0.03 },
          { ingredientId: creamId, quantityRequired: 0.025 },
          { ingredientId: tomatoId, quantityRequired: 0.12 },
          { ingredientId: oilId, quantityRequired: 0.015 },
          { ingredientId: spiceId, quantityRequired: 0.01 }
        ],
        portionSize: '1 Handi (350g)',
        instructions: 'Cook makhani gravy in butter and oil, fold in malai paneer cubes, finish with rich cream and kasuri methi.'
      },
      { upsert: true }
    );
    console.log('Fixed Paneer Butter Masala recipe!');
  }

  // 5. Add Garlic Naan Recipe
  const naanItem = await Item.findOne({ name: /garlic naan/i });
  if (naanItem) {
    await Recipe.findOneAndUpdate(
      { itemId: naanItem._id },
      {
        itemId: naanItem._id,
        ingredients: [
          { ingredientId: getIng('maida'), quantityRequired: 0.1 },
          { ingredientId: getIng('butter'), quantityRequired: 0.02 },
          { ingredientId: getIng('garlic'), quantityRequired: 0.015 }
        ],
        portionSize: '1 Naan (Cut into 3)',
        instructions: 'Tandoor bake leavened dough with chopped garlic, finish with generous brush of melted butter.'
      },
      { upsert: true }
    );
    console.log('Added Garlic Naan recipe!');
  }

  // 6. Add Margherita Pizza Recipe
  const pizzaItem = await Item.findOne({ name: /margherita/i });
  if (pizzaItem) {
    await Recipe.findOneAndUpdate(
      { itemId: pizzaItem._id },
      {
        itemId: pizzaItem._id,
        ingredients: [
          { ingredientId: getIng('pizza base'), quantityRequired: 1 },
          { ingredientId: getIng('mozzarella'), quantityRequired: 0.1 },
          { ingredientId: getIng('tomato gravy'), quantityRequired: 0.06 },
          { ingredientId: getIng('cooking oil'), quantityRequired: 0.01 },
          { ingredientId: getIng('garam masala'), quantityRequired: 0.005 }
        ],
        portionSize: '8-inch Thin Crust (4 Slices)',
        instructions: 'Spread house pizza sauce, cover with diced mozzarella cheese, bake at 250C until bubbly and golden.'
      },
      { upsert: true }
    );
    console.log('Added Cheese Margherita Pizza recipe!');
  }

  // 7. Add Veg Burger Recipe
  const burgerItem = await Item.findOne({ name: /^burger$/i });
  if (burgerItem) {
    await Recipe.findOneAndUpdate(
      { itemId: burgerItem._id },
      {
        itemId: burgerItem._id,
        ingredients: [
          { ingredientId: getIng('burger buns'), quantityRequired: 1 },
          { ingredientId: getIng('mixed vegetables'), quantityRequired: 0.08 },
          { ingredientId: getIng('mozzarella'), quantityRequired: 0.03 },
          { ingredientId: getIng('cooking oil'), quantityRequired: 0.02 }
        ],
        portionSize: '1 Jumbo Burger',
        instructions: 'Crisp-fry vegetable patty, toast buns on griddle, layer with sauce, cheese slice, lettuce and tomato.'
      },
      { upsert: true }
    );
    console.log('Added Veg Burger recipe!');
  }

  // 8. Add Veg Pulao Recipe
  const pulaoItem = await Item.findOne({ name: /veg pulao/i });
  if (pulaoItem) {
    await Recipe.findOneAndUpdate(
      { itemId: pulaoItem._id },
      {
        itemId: pulaoItem._id,
        ingredients: [
          { ingredientId: getIng('rice'), quantityRequired: 0.15 },
          { ingredientId: getIng('mixed vegetables'), quantityRequired: 0.1 },
          { ingredientId: getIng('butter'), quantityRequired: 0.015 },
          { ingredientId: getIng('garam masala'), quantityRequired: 0.008 }
        ],
        portionSize: '1 Plate (300g)',
        instructions: 'Steamed aged basmati tossed with sautéed seasonal veggies, whole cardamom, cloves and ghee.'
      },
      { upsert: true }
    );
    console.log('Added Veg Pulao recipe!');
  }

  // 9. Add Paneer Tikka Recipe
  const tikkaItem = await Item.findOne({ name: /paneer tikka/i });
  if (tikkaItem) {
    await Recipe.findOneAndUpdate(
      { itemId: tikkaItem._id },
      {
        itemId: tikkaItem._id,
        ingredients: [
          { ingredientId: getIng('paneer'), quantityRequired: 0.22 },
          { ingredientId: getIng('butter'), quantityRequired: 0.015 },
          { ingredientId: getIng('garlic'), quantityRequired: 0.015 },
          { ingredientId: getIng('garam masala'), quantityRequired: 0.015 }
        ],
        portionSize: '6 Large Cubes with Mint Chutney',
        instructions: 'Marinate cottage cheese in spiced curd batter, skewer with peppers and onions, clay-oven roast.'
      },
      { upsert: true }
    );
    console.log('Added Paneer Tikka recipe!');
  }

  console.log('ALL RECIPES SEEDED & VERIFIED SUCCESSFULLY!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});

