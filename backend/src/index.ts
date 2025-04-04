import express, { Request, Response } from "express";
import cors from "cors";
import mongoose from "mongoose";
import multer, { FileFilterCallback } from "multer";
import { SelectionsModel, MealModel } from "./models.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// MongoDB connection string
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
	console.error("MONGODB_URI environment variable is not set");
	console.error(
		"Please set the MONGODB_URI environment variable in your Render dashboard"
	);
	process.exit(1);
}

// Configure CORS
app.use(
	cors({
		origin: (origin, callback) => {
			const allowedOrigins = [
				"https://wecook.onrender.com",
				"http://localhost:5173",
				"chrome-extension://*",
			];

			if (
				!origin ||
				allowedOrigins.some((allowed) => {
					if (allowed.includes("*")) {
						// For wildcard patterns like chrome-extension://*
						return origin.startsWith(allowed.split("*")[0]);
					}
					return allowed === origin;
				})
			) {
				callback(null, true);
			} else {
				console.log("CORS blocked origin:", origin);
				callback(new Error("Not allowed by CORS"));
			}
		},
		credentials: true,
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
		cb(null, "uploads/");
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
app.use("/uploads", express.static("uploads"));

// Logging middleware
app.use((req, res, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
	console.log("Request headers:", req.headers);
	next();
});

// MongoDB connection with retry logic
const connectWithRetry = async () => {
	try {
		console.log("Attempting to connect to MongoDB...");
		console.log("MongoDB URI:", mongoUri);
		await mongoose.connect(mongoUri);
		console.log("Connected to MongoDB successfully");
		console.log("MongoDB connection state:", mongoose.connection.readyState);

		// Start the server only after successful MongoDB connection
		app.listen(port, () => {
			console.log(`Server running on port ${port}`);
			console.log(`Health check available at http://localhost:${port}/`);
			console.log(`API endpoints available at http://localhost:${port}/api/`);
		});
	} catch (err) {
		console.error("MongoDB connection error:", err);
		console.log("Retrying connection in 5 seconds...");
		setTimeout(connectWithRetry, 5000);
	}
};

connectWithRetry();

// Root route for health check
app.get("/", (req, res) => {
	res.json({ status: "ok", message: "WeCook backend is running" });
});

// Routes
app.get("/api/selections", async (req, res) => {
	try {
		console.log("GET /api/selections - Fetching selections...");
		console.log("MongoDB connection state:", mongoose.connection.readyState);
		const selections = await SelectionsModel.findOne();
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

app.post("/api/selections", async (req, res) => {
	try {
		console.log("Saving selections:", req.body);
		const { totalWeeks, selections } = req.body;
		console.log("Parsed data:", { totalWeeks, selections });

		// Process selections and ensure meals is a valid object
		const processedSelections = selections.map((selection: any) => ({
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
			const meals = JSON.parse(fileContent);
			console.log("Parsed meals from file:", meals);

			// Save meals to database
			console.log("Starting to save meals to database...");
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
app.get("/api/meals", async (req, res) => {
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
app.post("/api/meals", async (req, res) => {
	try {
		console.log("Import meals request received");
		console.log("Request body:", req.body);
		const { meals, date } = req.body;

		if (!Array.isArray(meals)) {
			console.log("Invalid meals data:", meals);
			return res.status(400).json({ error: "Meals must be an array" });
		}

		console.log(`Importing ${meals.length} meals`);
		if (date) {
			console.log("With date:", date);
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
			console.log("Updating selections with date:", date);
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
			console.log("Selections updated successfully");
		}

		console.log("Import completed successfully");
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

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
	app.use(express.static(path.join(__dirname, "../../web-app/dist")));
	app.get("*", (req, res) => {
		res.sendFile(path.join(__dirname, "../../web-app/dist/index.html"));
	});
}
