import express, { Request, Response } from "express";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import {
	SelectionsModel,
	MealModel,
	ClientMealSelectionModel,
	ClientModel,
} from "./models.js";
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
				...(selection.date
					? { date: new Date(selection.date).toISOString().split("T")[0] }
					: {}),
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

// Get available dates for client meals
apiRouter.get("/available-dates", async (req: Request, res: Response) => {
	try {
		console.log("Fetching available dates");
		const { clientId } = req.query;

		// Query options
		const query: any = {};
		if (clientId) {
			query.clientId = clientId;
		}

		// Get all unique dates from ClientMealSelectionModel
		const selections = await ClientMealSelectionModel.find(query);

		// Extract and format dates to YYYY-MM-DD
		const uniqueDates = new Set<string>();

		selections.forEach((selection) => {
			const dateObj = new Date(selection.date);
			const formattedDate = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD
			uniqueDates.add(formattedDate);
		});

		// If no dates found, return dates for the next 7 days
		if (uniqueDates.size === 0) {
			const today = new Date();
			for (let i = 0; i < 7; i++) {
				const date = new Date(today);
				date.setDate(today.getDate() + i);
				const formattedDate = date.toISOString().split("T")[0]; // YYYY-MM-DD
				uniqueDates.add(formattedDate);
			}
		}

		// Convert to array and sort
		const dateArray = Array.from(uniqueDates).sort();

		res.json({
			success: true,
			dates: dateArray,
		});
	} catch (error) {
		console.error("Error fetching available dates:", error);
		res.status(500).json({ error: "Failed to fetch available dates" });
	}
});

// Get client details by ID
apiRouter.get("/clients/:clientId", async (req: Request, res: Response) => {
	try {
		console.log("Fetching client details for:", req.params.clientId);
		const clientId = req.params.clientId;

		// Try to find the client
		let client = await ClientModel.findOne({ id: clientId });

		// If client doesn't exist, create a new one
		if (!client) {
			console.log("Client not found, creating new client");
			try {
				client = await ClientModel.create({
					id: clientId,
					name: `Client ${clientId}`,
					mealsPerWeek: 5,
				});
				console.log("Successfully created new client:", client);
			} catch (createError) {
				console.error("Error creating client:", createError);
				return res.status(500).json({ error: "Failed to create client" });
			}
		}

		res.json(client);
	} catch (error) {
		console.error("Error fetching client details:", error);
		res.status(500).json({ error: "Failed to fetch client details" });
	}
});

// Client meals endpoint
apiRouter.get("/client-meals", async (req: Request, res: Response) => {
	try {
		console.log("=== GET /client-meals Debug Log ===");
		console.log("Query parameters:", req.query);
		const { date } = req.query;

		if (!date) {
			return res.status(400).json({ error: "Date parameter is required" });
		}

		// Get all meals from database
		const allMeals = await MealModel.find();

		// Generate IDs for meals without IDs
		const mealsWithIds = allMeals.map((meal) => {
			if (meal.id) return meal;

			// Create ID based on name with hyphens and a random string
			const nameSlug = meal.name.toLowerCase().replace(/\s+/g, "-");
			const randomId = Math.random().toString(36).substring(7);
			return {
				...meal.toObject(),
				id: `${nameSlug}-${randomId}`,
			};
		});

		// Return the response with all meals and the requested date
		return res.json({
			success: true,
			data: {
				meals: mealsWithIds,
				selectedDate: date,
			},
		});
	} catch (error) {
		console.error("Error in GET /client-meals:", error);
		res.status(500).json({ error: "Failed to fetch client meals" });
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

// Client meal selection endpoints
apiRouter.get("/client-selections", async (req: Request, res: Response) => {
	try {
		const { clientId, date } = req.query;

		let query: any = {};

		// Filter by clientId if provided
		if (clientId) {
			query.clientId = clientId;
		}

		// Filter by date if provided (exact date match)
		if (date) {
			// Convert to Date object to ensure consistent format
			const queryDate = new Date(date as string);
			// Set time to start of day
			queryDate.setHours(0, 0, 0, 0);

			// Create date range for the entire day
			const nextDay = new Date(queryDate);
			nextDay.setDate(nextDay.getDate() + 1);

			query.date = {
				$gte: queryDate,
				$lt: nextDay,
			};
		}

		const selections = await ClientMealSelectionModel.find(query);
		res.json(selections);
	} catch (error) {
		console.error("Error fetching client selections:", error);
		res.status(500).json({ error: "Failed to fetch client selections" });
	}
});

// Get client selections for specific client
apiRouter.get(
	"/client-selections/:clientId",
	async (req: Request, res: Response) => {
		try {
			const { clientId } = req.params;
			const selections = await ClientMealSelectionModel.find({ clientId });
			res.json(selections);
		} catch (error) {
			console.error("Error fetching client selections:", error);
			res.status(500).json({ error: "Failed to fetch client selections" });
		}
	}
);

// Add or update a client selection
apiRouter.post("/client-selections", async (req: Request, res: Response) => {
	try {
		const { clientId, date, mealId, quantity, selections } = req.body;

		// Handle case where selections object is provided
		if (selections) {
			console.log("Processing selections object:", selections);

			// Use date from selections object if provided, or fallback to the date in the request
			const selectionDate = selections.date || date;

			if (!clientId || !selectionDate) {
				return res
					.status(400)
					.json({ error: "Missing required fields (clientId or date)" });
			}

			// Format date to ensure consistency
			const formattedDate = new Date(selectionDate);

			if (selections.meals && Array.isArray(selections.meals)) {
				// Create or update multiple meal selections
				const results = await Promise.all(
					selections.meals.map(
						async (meal: { id?: string; quantity?: number | string }) => {
							if (!meal.id) {
								return null; // Skip meals without ID
							}

							return await ClientMealSelectionModel.findOneAndUpdate(
								{ clientId, date: formattedDate, mealId: meal.id },
								{ quantity: Math.max(0, Number(meal.quantity) || 0) },
								{ upsert: true, new: true }
							);
						}
					)
				);

				// Filter out null results
				const validResults = results.filter((result) => result !== null);

				return res.json({
					message: "Multiple selections updated",
					count: validResults.length,
					results: validResults,
				});
			}

			return res.status(400).json({ error: "Invalid selections format" });
		}

		// Handle simple case with direct mealId and quantity
		if (!clientId || !date || !mealId) {
			return res.status(400).json({ error: "Missing required fields" });
		}

		// Validate quantity is a number and at least 0
		const validatedQuantity = Math.max(0, Number(quantity) || 0);

		// Format date to ensure consistency
		const formattedDate = new Date(date);

		// Find existing record or create a new one
		const result = await ClientMealSelectionModel.findOneAndUpdate(
			{ clientId, date: formattedDate, mealId },
			{ quantity: validatedQuantity },
			{ upsert: true, new: true }
		);

		res.json(result);
	} catch (error) {
		console.error("Error saving client selection:", error);
		res.status(500).json({ error: "Failed to save client selection" });
	}
});

// Delete a client selection
apiRouter.delete("/client-selections", async (req: Request, res: Response) => {
	try {
		const { clientId, date, mealId } = req.body;

		if (!clientId) {
			return res.status(400).json({ error: "Missing clientId" });
		}

		let query: any = { clientId };

		// Add date filter if provided
		if (date) {
			query.date = new Date(date);
		}

		// Add mealId filter if provided
		if (mealId) {
			query.mealId = mealId;
		}

		const result = await ClientMealSelectionModel.deleteMany(query);

		res.json({
			message: "Client selections deleted successfully",
			deletedCount: result.deletedCount,
		});
	} catch (error) {
		console.error("Error deleting client selections:", error);
		res.status(500).json({ error: "Failed to delete client selections" });
	}
});

// Import existing client selections from the old data structure
apiRouter.post(
	"/import-client-selections",
	async (req: Request, res: Response) => {
		try {
			// Get the current selections from the old structure
			const oldSelections = await SelectionsModel.findOne();

			if (!oldSelections) {
				return res.status(404).json({ error: "No selections found to import" });
			}

			let importCount = 0;
			const importErrors: Array<{
				clientId?: string;
				mealId?: string;
				date?: string;
				error: string;
			}> = [];

			// Get clientId from request or use 'all' to import for all clients
			const { clientId, importAllClients } = req.body;

			if (!clientId && !importAllClients) {
				return res
					.status(400)
					.json({ error: "Missing clientId or importAllClients flag" });
			}

			// Process each week selection
			for (const selection of oldSelections.selections) {
				const date = selection.date;

				// Skip if no date is available
				if (!date) continue;

				// Extract client meals from the old structure
				for (const [mealId, quantity] of Object.entries(selection.meals)) {
					// Skip meals with zero quantity
					if (!quantity) continue;

					try {
						if (importAllClients) {
							// For each client in the system
							// In a real implementation, you would query your clients collection
							// We're using the clientIds provided in the request
							const { clientIds } = req.body;

							if (!clientIds || !Array.isArray(clientIds)) {
								importErrors.push({
									error:
										"clientIds must be an array when importAllClients is true",
								});
								continue;
							}

							for (const cId of clientIds) {
								await ClientMealSelectionModel.findOneAndUpdate(
									{ clientId: cId, date, mealId },
									{ quantity },
									{ upsert: true }
								);
								importCount++;
							}
						} else {
							// Import just for the specified client
							await ClientMealSelectionModel.findOneAndUpdate(
								{ clientId, date, mealId },
								{ quantity },
								{ upsert: true }
							);
							importCount++;
						}
					} catch (err) {
						console.error("Error importing selection:", err);
						importErrors.push({
							mealId,
							date: date.toString(),
							clientId: importAllClients ? "multiple" : clientId,
							error: (err as Error).message,
						});
					}
				}
			}

			res.json({
				message: "Import completed",
				imported: importCount,
				errors: importErrors,
			});
		} catch (error) {
			console.error("Error importing client selections:", error);
			res.status(500).json({ error: "Failed to import client selections" });
		}
	}
);

// Fix malformed selections data
apiRouter.post("/fix-selections", async (req: Request, res: Response) => {
	try {
		console.log("Fixing selections data structure...");

		// Get the current selections
		const currentSelections = await SelectionsModel.findOne();

		if (!currentSelections) {
			return res.status(404).json({ error: "No selections found to fix" });
		}

		// Create new fixed selections with proper dates
		const fixedSelections = currentSelections.selections.map(
			(selection: any, index: number) => {
				// Generate dates starting from today, each 7 days apart
				const date = new Date();
				date.setDate(date.getDate() + index * 7);

				// Clean up the meals object
				const cleanedMeals: Record<string, number> = {};

				// Only keep real meal IDs (not 'meals' or 'date' keys)
				if (selection.meals) {
					Object.entries(selection.meals).forEach(
						([key, value]: [string, any]) => {
							// Skip invalid keys
							if (key === "meals" || key === "date") {
								return;
							}

							// Convert value to number
							const quantity = typeof value === "number" ? value : 0;

							// Only keep non-zero quantities
							if (quantity > 0) {
								cleanedMeals[key] = quantity;
							}
						}
					);
				}

				return {
					weekNumber: selection.weekNumber || index + 1,
					meals: cleanedMeals,
					date: date.toISOString(),
				};
			}
		);

		// Update the selections document
		const updatedSelections = await SelectionsModel.findOneAndUpdate(
			{ _id: currentSelections._id },
			{
				totalWeeks: fixedSelections.length,
				currentWeek: 0,
				selections: fixedSelections,
			},
			{ new: true }
		);

		res.json({
			message: "Selections data structure fixed successfully",
			originalData: currentSelections,
			fixedData: updatedSelections,
		});
	} catch (error) {
		console.error("Error fixing selections:", error);
		res.status(500).json({ error: "Failed to fix selections data" });
	}
});

// Extract meals from selections and create placeholders
apiRouter.post(
	"/extract-meals-from-selections",
	async (req: Request, res: Response) => {
		try {
			console.log("Extracting meals from selections...");

			// Get current selections
			const selections = await SelectionsModel.findOne();
			if (!selections) {
				return res.status(404).json({ error: "No selections found" });
			}

			// Extract all meal IDs from selections
			const mealIds = new Set<string>();

			selections.selections.forEach((selection: any) => {
				if (selection.meals) {
					Object.keys(selection.meals).forEach((mealId) => {
						// Skip invalid keys
						if (mealId !== "meals" && mealId !== "date" && mealId.length > 0) {
							mealIds.add(mealId);
						}
					});
				}
			});

			console.log(`Found ${mealIds.size} unique meal IDs in selections`);

			// Check which meals already exist
			const existingMeals = await MealModel.find({
				id: { $in: Array.from(mealIds) },
			});
			const existingMealIds = new Set(existingMeals.map((meal) => meal.id));

			console.log(`${existingMeals.length} meals already exist in database`);

			// Create placeholders for missing meals
			const missingMealIds = Array.from(mealIds).filter(
				(id) => !existingMealIds.has(id)
			);
			console.log(`Creating ${missingMealIds.length} placeholder meals`);

			const placeholderMeals = missingMealIds.map((id) => {
				// Extract a potential name from the ID by removing the timestamp and hash
				let name = id.split("-").slice(0, -2).join(" ");
				// If name is empty or just whitespace, use the ID
				if (!name.trim()) {
					name = `Meal ${id.substring(0, 8)}`;
				}

				return {
					id,
					name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize first letter
					imageUrl: "placeholder.jpg",
					category: "Regular",
					price: 0,
					hasSideDish: false,
					sideDishes: [],
				};
			});

			// Save placeholder meals
			let savedMeals: any[] = [];
			if (placeholderMeals.length > 0) {
				savedMeals = await MealModel.insertMany(placeholderMeals);
			}

			res.json({
				message: "Meals extracted and placeholders created",
				totalMealIds: mealIds.size,
				existingMeals: existingMeals.length,
				createdPlaceholders: savedMeals.length,
				mealIds: Array.from(mealIds),
			});
		} catch (error) {
			console.error("Error extracting meals:", error);
			res
				.status(500)
				.json({ error: "Failed to extract meals from selections" });
		}
	}
);

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
