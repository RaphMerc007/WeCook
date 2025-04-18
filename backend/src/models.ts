import mongoose from "mongoose";
import { UserSelections } from "./types.js";

const WeekSelectionSchema = new mongoose.Schema({
	weekNumber: { type: Number, required: true },
	meals: { type: Object, required: true },
	date: { type: Date, required: false },
});

const SelectionsSchema = new mongoose.Schema({
	totalWeeks: { type: Number, required: true },
	currentWeek: { type: Number, required: true },
	selections: [WeekSelectionSchema],
});

const MealSchema = new mongoose.Schema({
	id: { type: String, required: true, unique: true },
	name: { type: String, required: true },
	imageUrl: { type: String, required: true },
	category: { type: String, required: true },
	price: { type: mongoose.Schema.Types.Mixed, required: true },
	hasSideDish: { type: Boolean, required: true },
	sideDishes: { type: [String], required: true },
});

// New schema for client meal selections
const ClientMealSelectionSchema = new mongoose.Schema({
	clientId: { type: String, required: true },
	date: { type: Date, required: true },
	mealId: { type: String, required: true },
	quantity: { type: Number, required: true, default: 0 },
	// Add a created/updated timestamp
	createdAt: { type: Date, default: Date.now },
});

// Add a compound index to ensure uniqueness of clientId + date + mealId
ClientMealSelectionSchema.index(
	{ clientId: 1, date: 1, mealId: 1 },
	{ unique: true }
);

export const SelectionsModel = mongoose.model("Selections", SelectionsSchema);
export const MealModel = mongoose.model("Meal", MealSchema);
export const ClientMealSelectionModel = mongoose.model(
	"ClientMealSelection",
	ClientMealSelectionSchema
);
