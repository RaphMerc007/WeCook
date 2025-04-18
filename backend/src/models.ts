import mongoose from "mongoose";

// Selections Schema
const SelectionsSchema = new mongoose.Schema({
	totalWeeks: { type: Number, required: true },
	currentWeek: { type: Number, default: 0 },
	selections: [
		{
			weekNumber: Number,
			meals: { type: Object, default: {} },
			date: Date,
			clientSelections: { type: Object, default: {} },
		},
	],
});

// Meal Schema
const MealSchema = new mongoose.Schema({
	id: { type: String, required: true, unique: true },
	name: { type: String, required: true },
	imageUrl: String,
	category: String,
	price: mongoose.Schema.Types.Mixed,
	hasSideDish: Boolean,
	sideDishes: [String],
});

// Client Meal Selection Schema
const ClientMealSelectionSchema = new mongoose.Schema({
	clientId: { type: String, required: true },
	date: { type: Date, required: true },
	mealId: { type: String, required: true },
	quantity: { type: Number, default: 0 },
});

// Create a compound index for uniqueness
ClientMealSelectionSchema.index(
	{ clientId: 1, date: 1, mealId: 1 },
	{ unique: true }
);

// Client Schema
const ClientSchema = new mongoose.Schema({
	id: { type: String, required: true, unique: true },
	name: { type: String, required: true },
	mealsPerWeek: { type: Number, default: 5 },
	email: { type: String },
	phone: { type: String },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

// Create models
export const SelectionsModel = mongoose.model("Selections", SelectionsSchema);
export const MealModel = mongoose.model("Meal", MealSchema);
export const ClientMealSelectionModel = mongoose.model(
	"ClientMealSelection",
	ClientMealSelectionSchema
);
export const ClientModel = mongoose.model("Client", ClientSchema);
