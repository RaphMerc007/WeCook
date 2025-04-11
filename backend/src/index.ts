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
		credentials: true,
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

// Debug middleware - log all requests
app.use((req, res, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
	console.log("Headers:", req.headers);
	next();
});

// MongoDB connection
mongoose
	.connect(mongoUri)
	.then(() => console.log("Connected to MongoDB"))
	.catch((err: Error) => console.error("MongoDB connection error:", err));

// Create Router for API routes
const apiRouter = express.Router();

// Health check endpoint
apiRouter.get("/health", (req, res) => {
	res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount all other API routes
apiRouter.get("/selections", async (req: Request, res: Response) => {
	try {
		console.log("Fetching selections...");
		const selections = await SelectionsModel.find();
		console.log("Found selections:", selections);

		if (!selections || selections.length === 0) {
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
			return res.json([newSelections]);
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

apiRouter.post("/selections", async (req: Request, res: Response) => {
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
apiRouter.post(
	"/upload",
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
apiRouter.get("/meals/:id", async (req, res) => {
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
apiRouter.get("/meals", async (req: Request, res: Response) => {
	try {
		console.log("=== GET /meals Debug Log ===");
		console.log("Query parameters:", req.query);
		const { date } = req.query;

		if (date) {
			console.log(`Fetching meals for date: ${date}`);
			const selectionsDoc = await SelectionsModel.findOne();
			console.log("Selections document:", selectionsDoc);

			if (!selectionsDoc) {
				console.log("No selections document found");
				return res.json([]);
			}

			const selection = selectionsDoc.selections.find(
				(s: any) => new Date(s.date).toISOString().split("T")[0] === date
			);
			console.log("Found selection for date:", selection);

			if (!selection) {
				console.log("No selection found for the given date");
				return res.json([]);
			}

			const allMeals = await MealModel.find();
			console.log("All meals in database:", allMeals);
			const selectedMealIds = Object.keys(selection.meals);
			console.log("Selected meal IDs:", selectedMealIds);
			const filteredMeals = allMeals.filter((meal) =>
				selectedMealIds.includes(meal.id)
			);
			console.log("Filtered meals:", filteredMeals);

			return res.json(filteredMeals);
		}

		console.log("Fetching all meals (no date filter)");
		const meals = await MealModel.find();
		console.log("All meals in database:", meals);
		res.json(meals);
	} catch (error) {
		console.error("Error in GET /meals:", error);
		res.status(500).json({ error: "Failed to fetch meals" });
	}
});

// Import meals
apiRouter.post("/meals", async (req: Request, res: Response) => {
	try {
		console.log("=== POST /meals Debug Log ===");
		console.log("Request body:", req.body);
		const { meals, date } = req.body;

		if (!Array.isArray(meals)) {
			console.log("Invalid meals data - not an array");
			return res.status(400).json({ error: "Meals must be an array" });
		}

		console.log(`Importing ${meals.length} meals`);
		const savedMeals = await Promise.all(
			meals.map(async (meal: any) => {
				try {
					const mealId = meal.id || Math.random().toString(36).substring(7);
					console.log(`Processing meal ${mealId}:`, meal.name);
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

		if (date) {
			console.log(`Updating selections for date: ${date}`);
			const selectionsDoc = await SelectionsModel.findOne();
			console.log("Current selections document:", selectionsDoc);
			const weekNumber = selectionsDoc
				? selectionsDoc.selections.length + 1
				: 1;
			console.log("New week number:", weekNumber);

			const newSelection = {
				weekNumber,
				meals: {} as Record<string, number>,
				date: new Date(date),
			};

			savedMeals.forEach((meal) => {
				newSelection.meals[meal.id] = 1;
			});
			console.log("New selection to be added:", newSelection);

			const updatedSelections = await SelectionsModel.findOneAndUpdate(
				{},
				{
					$push: { selections: newSelection },
					$set: { totalWeeks: weekNumber },
				},
				{ upsert: true, new: true }
			);
			console.log("Updated selections document:", updatedSelections);
		}

		res.json({
			message: "Meals imported successfully",
			mealsCount: savedMeals.length,
		});
	} catch (error) {
		console.error("Error in POST /meals:", error);
		res.status(500).json({ error: "Failed to import meals" });
	}
});

// Clear all meals
apiRouter.post("/meals/clear", async (req, res) => {
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

// Mount the API router
app.use("/api", apiRouter);

// Root route
app.get("/", (req, res) => {
	res.json({ message: "WeCook API is running", version: "1.0.0" });
});

// Serve uploaded files
app.use("/uploads", express.static(uploadsDir));

// 404 handler for API routes
app.use("/api/*", (req, res) => {
	console.log(`404 Not Found: ${req.method} ${req.url}`);
	res.status(404).json({ error: "API endpoint not found" });
});

// Generic 404 handler
app.use((req, res) => {
	console.log(`404 Not Found: ${req.method} ${req.url}`);
	res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: any) => {
	console.error("Unhandled error:", err);
	res
		.status(500)
		.json({ error: "Internal server error", message: err.message });
});

app.listen(port, () => {
	console.log(`Server running on port ${port}`);
	console.log(`CORS configured for:`, [
		"https://wecookselection.netlify.app",
		"http://localhost:5173",
	]);
});

export default app;
