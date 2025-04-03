import mongoose from "mongoose";
import { UserSelections } from "./types";

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

export const SelectionsModel = mongoose.model<UserSelections>(
	"Selections",
	SelectionsSchema
);

export const MealModel = mongoose.model("Meal", MealSchema);
