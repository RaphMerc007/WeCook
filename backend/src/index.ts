import express, { Request, Response } from "express";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import { SelectionsModel, MealModel } from "./models.js";
import path from "path";
import { fileURLToPath } from "url";
import { UserSelections } from "./types.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const port = process.env.PORT || 3001;
const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/wecook";

// Configure CORS
app.use(
	cors({
		origin: ["https://wecookselection.netlify.app", "http://localhost:5173"],
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization"],
	})
);

// Configure multer for file uploads
const storage = multer.diskStorage({
	destination: function (
		req: Express.Request,
		file: Express.Multer.File,
		cb: (error: Error | null, destination: string) => void
	) {
		cb(null, uploadsDir);
	},
	filename: function (
		req: Express.Request,
		file: Express.Multer.File,
		cb: (error: Error | null, filename: string) => void
	) {
		cb(null, Date.now() + "-" + file.originalname);
	},
});

const upload = multer({ storage: storage });

// Middleware
app.use(express.json());

// Serve uploaded files
app.use("/uploads", express.static(uploadsDir));

// Logging middleware
app.use((req, res, next) => {
	console.log(`${req.method} ${req.url}`);
	next();
});

// MongoDB connection
mongoose
	.connect(mongoUri)
	.then(() => console.log("Connected to MongoDB"))
	.catch((err: Error) => console.error("MongoDB connection error:", err));

// Routes
app.get("/api/selections", async (req: Request, res: Response) => {
	try {
		console.log("Fetching selections...");
		const selections = await SelectionsModel.find();
		console.log("Found selections:", selections);

		if (!selections) {
			console.log("No selections found, creating new document");
			const newSelections = new SelectionsModel({
				selections: [
					{
						weekNumber: 1,
						meals: {},
					},
				],
				totalWeeks: 1,
				currentWeek: 0,
			});
			await newSelections.save();
			console.log("Created new selections document:", newSelections);
			return res.json(newSelections);
		}

		res.json(selections);
	} catch (error) {
		console.error("Error fetching selections:", error);
		res.status(500).json({ error: "Failed to fetch selections" });
	}
});

interface Selection {
	weekNumber: number;
	meals: Record<string, boolean>;
	date?: string;
}

interface Meal {
	id: string;
	name: string;
	imageUrl: string;
	category: string;
	price: number | string;
	hasSideDish: boolean;
	sideDishes: string[];
}

app.post("/api/selections", async (req: Request, res: Response) => {
	try {
		console.log("Saving selections:", req.body);
		const { totalWeeks, selections } = req.body;
		console.log("Parsed data:", { totalWeeks, selections });

		// Process selections and ensure meals is a valid object
		const processedSelections = selections.map((selection: Selection) => ({
			weekNumber: selection.weekNumber,
			meals: selection.meals || {},
			...(selection.date ? { date: selection.date } : {}), // Only include date if it was provided
		}));
		console.log("Processed selections:", processedSelections);

		const result = await SelectionsModel.findOneAndUpdate(
			{},
			{
				totalWeeks,
				selections: processedSelections,
			},
			{ upsert: true, new: true }
		);
		console.log("Saved selections:", result);

		res.json(result);
	} catch (error) {
		console.error("Error saving selections:", error);
		res.status(500).json({ error: "Failed to save selections" });
	}
});

// File upload endpoint
app.post(
	"/api/upload",
	// @ts-ignore - Known type mismatch between multer and express
	upload.single("file"),
	async (
		req: Express.Request & { file?: Express.Multer.File },
		res: Response
	) => {
		try {
			console.log("File upload request received");
			if (!req.file) {
				console.log("No file uploaded");
				return res.status(400).json({ error: "No file uploaded" });
			}
			console.log("File uploaded successfully:", req.file);

			// Read and parse the JSON file
			const fs = require("fs");
			const fileContent = fs.readFileSync(req.file.path, "utf8");
			const meals = JSON.parse(fileContent) as Meal[];
			console.log("Parsed meals from file:", meals);

			// Save meals to database
			console.log("Starting to save meals to database...");
			const savedMeals = await Promise.all(
				meals.map(async (meal: Meal) => {
					try {
						// Generate a unique ID if not present
						const mealId = meal.id || Math.random().toString(36).substring(7);
						console.log(`Saving meal ${mealId}:`, meal.name);
						const savedMeal = await MealModel.findOneAndUpdate(
							{ id: mealId },
							{ ...meal, id: mealId },
							{ upsert: true, new: true }
						);
						console.log(`Successfully saved meal ${mealId}`);
						return savedMeal;
					} catch (error) {
						console.error(`Error saving meal ${meal.name}:`, error);
						throw error;
					}
				})
			);
			console.log("All meals saved to database:", savedMeals);

			// Verify the meals were saved
			const count = await MealModel.countDocuments();
			console.log(`Total meals in database: ${count}`);

			res.json({
				message: "File uploaded and processed successfully",
				filename: req.file.filename,
				path: req.file.path,
				mealsCount: meals.length,
				savedCount: savedMeals.length,
			});
		} catch (error) {
			console.error("Error processing file:", error);
			res.status(500).json({ error: "Failed to process file" });
		}
	}
);

// Get meal by ID
app.get("/api/meals/:id", async (req, res) => {
	try {
		console.log("Fetching meal:", req.params.id);
		const meal = await MealModel.findOne({ id: req.params.id });
		if (!meal) {
			console.log("Meal not found");
			return res.status(404).json({ error: "Meal not found" });
		}
		console.log("Found meal:", meal);
		res.json(meal);
	} catch (error) {
		console.error("Error fetching meal:", error);
		res.status(500).json({ error: "Failed to fetch meal" });
	}
});

// Get all meals
app.get("/api/meals", async (req: Request, res: Response) => {
	try {
		console.log("Fetching all meals...");
		const { date } = req.query;

		if (date) {
			// If date is provided, get meals for that specific date
			const selectionsDoc = await SelectionsModel.findOne();
			if (!selectionsDoc) {
				return res.json([]);
			}

			// Find the selection for the given date
			const selection = selectionsDoc.selections.find(
				(s: any) => new Date(s.date).toISOString().split("T")[0] === date
			);

			if (!selection) {
				return res.json([]);
			}

			// Get all meals and filter by the ones in the selection
			const allMeals = await MealModel.find();
			const selectedMealIds = Object.keys(selection.meals);
			const filteredMeals = allMeals.filter((meal) =>
				selectedMealIds.includes(meal.id)
			);

			console.log(`Found ${filteredMeals.length} meals for date ${date}`);
			return res.json(filteredMeals);
		}

		// If no date provided, return all meals
		const meals = await MealModel.find();
		console.log(`Found ${meals.length} meals`);
		res.json(meals);
	} catch (error) {
		console.error("Error fetching meals:", error);
		res.status(500).json({ error: "Failed to fetch meals" });
	}
});

// Import meals
app.post("/api/meals", async (req: Request, res: Response) => {
	try {
		console.log("Importing meals:", req.body);
		const { meals, date } = req.body;

		if (!Array.isArray(meals)) {
			return res.status(400).json({ error: "Meals must be an array" });
		}

		// Save meals to database
		const savedMeals = await Promise.all(
			meals.map(async (meal: any) => {
				try {
					// Generate a unique ID if not present
					const mealId = meal.id || Math.random().toString(36).substring(7);
					console.log(`Saving meal ${mealId}:`, meal.name);
					const savedMeal = await MealModel.findOneAndUpdate(
						{ id: mealId },
						{ ...meal, id: mealId },
						{ upsert: true, new: true }
					);
					console.log(`Successfully saved meal ${mealId}`);
					return savedMeal;
				} catch (error) {
					console.error(`Error saving meal ${meal.name}:`, error);
					throw error;
				}
			})
		);

		// If a date is provided, update the selections
		if (date) {
			const selectionsDoc = await SelectionsModel.findOne();
			const weekNumber = selectionsDoc
				? selectionsDoc.selections.length + 1
				: 1;

			// Create a new selection for this week
			const newSelection = {
				weekNumber,
				meals: {} as Record<string, number>,
				date: new Date(date),
			};

			// Set quantity to 1 for all imported meals
			savedMeals.forEach((meal) => {
				newSelection.meals[meal.id] = 1;
			});

			// Update or create the selections document
			await SelectionsModel.findOneAndUpdate(
				{},
				{
					$push: { selections: newSelection },
					$set: { totalWeeks: weekNumber },
				},
				{ upsert: true }
			);
		}

		res.json({
			message: "Meals imported successfully",
			mealsCount: savedMeals.length,
		});
	} catch (error) {
		console.error("Error importing meals:", error);
		res.status(500).json({ error: "Failed to import meals" });
	}
});

// Clear all meals
app.post("/api/meals/clear", async (req, res) => {
	try {
		console.log("Clearing all meals from database...");
		await MealModel.deleteMany({});
		console.log("All meals cleared successfully");
		res.json({ message: "All meals cleared successfully" });
	} catch (error) {
		console.error("Error clearing meals:", error);
		res.status(500).json({ error: "Failed to clear meals" });
	}
});

// Error handling middleware
app.use(
	(
		err: any,
		req: express.Request,
		res: express.Response,
		next: express.NextFunction
	) => {
		console.error("Unhandled error:", err);
		res.status(500).json({ error: "Internal server error" });
	}
);

app.listen(port, () => {
	console.log(`Server running on port ${port}`);
});

export default app;
