const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, unique: true },
  ingredients: [
    {
      ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
      quantityRequired: { type: Number, required: true } // Quantity needed for 1 portion
    }
  ],
  portionSize: { type: String, default: '1 Serving' },
  instructions: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Recipe', recipeSchema);