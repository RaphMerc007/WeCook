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
		origin: [
			"https://wecookselection.netlify.app",
			"http://localhost:5173",
			"chrome-extension://*",
		],
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

// Add caching for frequently accessed data
const cache = {
	meals: null as any,
	selections: null as any,
	lastUpdated: 0,
};

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Middleware to throttle requests
const requestThrottle = new Map<string, number>();
const THROTTLE_WINDOW = 1000; // 1 second
const MAX_REQUESTS = 10; // Max requests per window

// Throttle middleware
const throttleMiddleware = (req: Request, res: Response, next: Function) => {
	const ip = req.ip || "unknown";
	const now = Date.now();
	const windowStart = now - THROTTLE_WINDOW;

	// Clean up old entries
	for (const [key, timestamp] of requestThrottle.entries()) {
		if (timestamp < windowStart) {
			requestThrottle.delete(key);
		}
	}

	// Count requests in current window
	const requestCount = Array.from(requestThrottle.values()).filter(
		(timestamp) => timestamp > windowStart
	).length;

	if (requestCount >= MAX_REQUESTS) {
		return res.status(429).json({ error: "Too many requests" });
	}

	requestThrottle.set(ip, now);
	next();
};

// Optimized logging middleware
app.use((req, res, next) => {
	// Only log in development or for important endpoints
	if (
		process.env.NODE_ENV === "development" ||
		req.path === "/health" ||
		req.path.startsWith("/api/")
	) {
		console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
	}
	next();
});

// Optimize MongoDB connection
mongoose
	.connect(mongoUri, {
		connectTimeoutMS: 10000,
		serverSelectionTimeoutMS: 5000,
		socketTimeoutMS: 45000,
	})
	.then(() => {
		console.log("Connected to MongoDB");
		// Check if collections exist and count documents
		Promise.all([
			MealModel.countDocuments(),
			SelectionsModel.countDocuments(),
		]).then(([mealCount, selectionsCount]) => {
			console.log("Initial database state:");
			console.log("- Meals collection:", { count: mealCount });
			console.log("- Selections collection:", { count: selectionsCount });
		});
	})
	.catch((err: Error) => {
		console.error("MongoDB connection error:", err);
		process.exit(1);
	});

// Create Router for API routes
const apiRouter = express.Router();

// Health check endpoint with reduced logging
apiRouter.get("/health", throttleMiddleware, async (req, res) => {
	const dbState = {
		meals: await MealModel.countDocuments(),
		selections: await SelectionsModel.countDocuments(),
	};
	res.json({
		status: "ok",
		timestamp: new Date().toISOString(),
		database: dbState,
	});
});

// Mount all other API routes
apiRouter.get(
	"/selections",
	throttleMiddleware,
	async (req: Request, res: Response) => {
		try {
			const result = await SelectionsModel.findOne({});
			if (!result) {
				// If no selections exist, create a default one
				const defaultSelections = new SelectionsModel({
					totalWeeks: 1,
					currentWeek: 0,
					selections: [
						{
							weekNumber: 1,
							meals: {},
							clientSelections: {},
						},
					],
				});
				await defaultSelections.save();
				res.json([defaultSelections]);
			} else {
				res.json([result]);
			}
		} catch (error) {
			console.error("Error fetching selections:", error);
			res.status(500).json({ error: "Failed to fetch selections" });
		}
	}
);

interface Selection {
	weekNumber: number;
	meals: Record<string, number>;
	date?: string;
	clientSelections?: Record<
		string,
		{
			clientId: string;
			clientName: string;
			selectedMeals: Record<string, number>;
		}
	>;
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
		const processedSelections = selections.map((selection: Selection) => {
			// Clean up the meals object to remove any undefined keys
			const cleanedMeals: Record<string, number> = {};
			if (selection.meals) {
				Object.entries(selection.meals).forEach(([mealId, value]) => {
					// Generate a unique ID if the meal doesn't have one
					const finalMealId =
						mealId && mealId !== "undefined" && typeof mealId === "string"
							? mealId
							: `generated-${Date.now()}-${Math.random()
									.toString(36)
									.substr(2, 9)}`;

					// Convert boolean to number if needed, or keep the existing number
					// Ensure quantity is at least 0
					cleanedMeals[finalMealId] = Math.max(
						0,
						typeof value === "boolean" ? (value ? 1 : 0) : Number(value) || 0
					);
				});
			}

			// Process client selections
			const clientSelections: Record<string, any> = {};
			if (selection.clientSelections) {
				Object.entries(selection.clientSelections).forEach(
					([clientId, clientData]) => {
						if (clientData && typeof clientData === "object") {
							const cleanedClientMeals: Record<string, number> = {};
							if (clientData.selectedMeals) {
								Object.entries(clientData.selectedMeals).forEach(
									([mealId, value]) => {
										// Ensure quantity is at least 0
										cleanedClientMeals[mealId] = Math.max(
											0,
											typeof value === "boolean"
												? value
													? 1
													: 0
												: Number(value) || 0
										);
									}
								);
							}
							clientSelections[clientId] = {
								clientId,
								clientName: clientData.clientName || `Client ${clientId}`,
								selectedMeals: cleanedClientMeals,
							};
						}
					}
				);
			}

			return {
				weekNumber: selection.weekNumber,
				meals: cleanedMeals,
				clientSelections,
				...(selection.date ? { date: selection.date } : {}),
			};
		});

		const result = await SelectionsModel.findOneAndUpdate(
			{},
			{
				totalWeeks,
				selections: processedSelections,
			},
			{ upsert: true, new: true }
		);

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
	async (req: Request & { file?: Express.Multer.File }, res: Response) => {
		try {
			console.log("=== POST /upload Debug ===");
			console.log("Request headers:", req.headers);
			console.log("Request body:", req.body);
			console.log("Request file:", req.file);

			if (!req.file) {
				console.log("No file uploaded");
				return res.status(400).json({ error: "No file uploaded" });
			}

			console.log("File details:", {
				filename: req.file.filename,
				size: req.file.size,
				path: req.file.path,
				mimetype: req.file.mimetype,
			});

			// Verify uploads directory exists and is writable
			try {
				if (!fs.existsSync(uploadsDir)) {
					console.log("Creating uploads directory:", uploadsDir);
					fs.mkdirSync(uploadsDir, { recursive: true });
				}
				// Test write permissions
				const testFile = path.join(uploadsDir, ".test");
				fs.writeFileSync(testFile, "test");
				fs.unlinkSync(testFile);
				console.log("Uploads directory is writable:", uploadsDir);
			} catch (error) {
				const fsError = error as Error;
				console.error("File system error:", fsError);
				throw new Error(`Upload directory issue: ${fsError.message}`);
			}

			// Read and parse the JSON file
			let fileContent;
			try {
				fileContent = fs.readFileSync(req.file.path, "utf8");
				console.log(
					"File content read successfully, first 100 chars:",
					fileContent.substring(0, 100)
				);
			} catch (error) {
				const readError = error as Error;
				console.error("Error reading uploaded file:", readError);
				throw new Error(`Failed to read uploaded file: ${readError.message}`);
			}

			let meals;
			try {
				meals = JSON.parse(fileContent) as Meal[];
				console.log(`Successfully parsed JSON. Found ${meals.length} meals`);
				if (meals.length > 0) {
					console.log("First meal sample:", JSON.stringify(meals[0], null, 2));
				}
			} catch (error) {
				const parseError = error as Error;
				console.error("Error parsing JSON:", parseError);
				throw new Error(`Invalid JSON format: ${parseError.message}`);
			}

			// Save meals to database
			console.log("Starting database import...");
			let beforeCount;
			try {
				beforeCount = await MealModel.countDocuments();
				console.log("Current meals in database:", beforeCount);
			} catch (error) {
				const dbError = error as Error;
				console.error("Database count error:", dbError);
				throw new Error(`Database count failed: ${dbError.message}`);
			}

			const savedMeals = await Promise.all(
				meals.map(async (meal: Meal) => {
					try {
						const mealId = meal.id || Math.random().toString(36).substring(7);
						console.log(`Processing meal: ${meal.name} (${mealId})`);
						const savedMeal = await MealModel.findOneAndUpdate(
							{ id: mealId },
							{ ...meal, id: mealId },
							{ upsert: true, new: true }
						);
						console.log(`Saved meal ${mealId}`);
						return savedMeal;
					} catch (error) {
						const mealError = error as Error;
						console.error(`Failed to save meal ${meal.name}:`, mealError);
						throw new Error(
							`Failed to save meal ${meal.name}: ${mealError.message}`
						);
					}
				})
			);

			let afterCount;
			try {
				afterCount = await MealModel.countDocuments();
				console.log("Database import complete");
				console.log("Final meals count:", afterCount);
				console.log("New meals added:", afterCount - beforeCount);
			} catch (error) {
				const countError = error as Error;
				console.error("Final count error:", countError);
				throw new Error(`Final count failed: ${countError.message}`);
			}

			// Clean up uploaded file
			try {
				fs.unlinkSync(req.file.path);
				console.log("Cleaned up uploaded file:", req.file.path);
			} catch (error) {
				const cleanupError = error as Error;
				console.warn("Failed to cleanup uploaded file:", cleanupError);
			}

			res.json({
				message: "File uploaded and processed successfully",
				filename: req.file.filename,
				mealsCount: meals.length,
				savedCount: savedMeals.length,
				databaseStats: {
					beforeCount,
					afterCount,
					newMeals: afterCount - beforeCount,
				},
			});
		} catch (error) {
			const uploadError = error as Error;
			console.error("=== Upload Error Details ===");
			console.error("Error type:", uploadError.constructor.name);
			console.error("Error message:", uploadError.message);
			console.error("Error stack:", uploadError.stack);
			console.error("=== End Error Details ===");

			res.status(500).json({
				error: "Failed to process file",
				details: uploadError.message,
				type: uploadError.constructor.name,
			});
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
