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

// Schema for a meal selection within a client document
const MealSelectionSchema = new mongoose.Schema({
	mealId: { type: String, required: true },
	quantity: { type: Number, required: true, default: 1 },
	date: { type: String, required: true },
});

// Updated schema for client meal selections
const ClientMealSelectionSchema = new mongoose.Schema({
	id: { type: String, required: true, unique: true },
	name: { type: String, required: true },
	mealsPerWeek: { type: Number, required: true },
	selectedMeals: [MealSelectionSchema],
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

// Replace the compound index with a single unique index on id
ClientMealSelectionSchema.index({ id: 1 }, { unique: true });

export const SelectionsModel = mongoose.model("Selections", SelectionsSchema);
export const MealModel = mongoose.model("Meal", MealSchema);
export const ClientMealSelectionModel = mongoose.model(
	"ClientMealSelection",
	ClientMealSelectionSchema
);
