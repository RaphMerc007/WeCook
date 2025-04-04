document.addEventListener("DOMContentLoaded", function () {
	console.log("Popup loaded");
	const extractButton = document.getElementById("extract-button");
	// const sendToAppButton = document.getElementById("send-to-app-button");
	const statusDiv = document.getElementById("status");
	const regularMealsList = document.querySelector("#regular-meals .meal-list");
	const familyMealsList = document.querySelector("#family-meals .meal-list");
	const timestampDiv = document.getElementById("timestamp");
	const dateDisplay = document.getElementById("dateDisplay");
	const mealCount = document.getElementById("mealCount");
	const importButton = document.getElementById("importButton");

	// Load and display any previously stored meals
	loadStoredMeals();

	extractButton.addEventListener("click", async () => {
		console.log("Extract button clicked");
		try {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			console.log("Current tab:", tab);

			if (!tab.url.includes("wecookmeals.ca")) {
				console.log("Not on WeCook page");
				showStatus("Please navigate to a WeCook page", "error");
				return;
			}

			showStatus("Extracting meals...", "success");

			try {
				console.log("Trying to send message to existing content script");
				const response = await chrome.tabs.sendMessage(tab.id, {
					action: "extractMeals",
				});
				console.log("Received response from content script:", response);
				if (response && response.success) {
					const { meals, selectedDate } = response.data;
					await storeMeals(meals);
					displayMeals(meals);
					showStatus("Meals extracted successfully!", "success");

					if (selectedDate) {
						const date = new Date(selectedDate);
						const formattedDate = date.toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						});
						dateDisplay.textContent = `Selected Week: ${formattedDate}`;
						dateDisplay.style.display = "block";
					} else {
						dateDisplay.style.display = "none";
					}

					mealCount.textContent = `Found ${meals.length} meals`;
					mealCount.style.display = "block";
					importButton.style.display = "block";
					extractedMeals = meals;
					extractedDate = selectedDate;
				} else {
					showStatus("Failed to extract meals", "error");
				}
			} catch (error) {
				console.log("Content script not found, injecting it...", error);
				// If the content script isn't loaded, inject it
				await chrome.scripting.executeScript({
					target: { tabId: tab.id },
					files: ["src/content.js"],
				});

				console.log("Content script injected, trying again...");
				// Wait a bit for the script to initialize
				await new Promise((resolve) => setTimeout(resolve, 100));

				// Try sending the message again
				const response = await chrome.tabs.sendMessage(tab.id, {
					action: "extractMeals",
				});
				console.log("Received response after injection:", response);
				if (response && response.success) {
					const { meals, selectedDate } = response.data;
					await storeMeals(meals);
					displayMeals(meals);
					showStatus("Meals extracted successfully!", "success");

					if (selectedDate) {
						const date = new Date(selectedDate);
						const formattedDate = date.toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						});
						dateDisplay.textContent = `Selected Week: ${formattedDate}`;
						dateDisplay.style.display = "block";
					} else {
						dateDisplay.style.display = "none";
					}

					mealCount.textContent = `Found ${meals.length} meals`;
					mealCount.style.display = "block";
					importButton.style.display = "block";
					extractedMeals = meals;
					extractedDate = selectedDate;
				} else {
					showStatus("Failed to extract meals", "error");
				}
			}
		} catch (error) {
			console.error("Error in popup:", error);
			showStatus("An error occurred while extracting meals", "error");
		}
	});

	// sendToAppButton.addEventListener("click", async () => {
	// 	console.log("[Popup] Send to app button clicked");
	// 	try {
	// 		// Get the stored meals
	// 		const result = await chrome.storage.local.get("meals");
	// 		const meals = result.meals || [];
	// 		console.log("[Popup] Retrieved stored meals:", meals);

	// 		if (!meals || meals.length === 0) {
	// 			console.log("[Popup] No meals found in storage");
	// 			showStatus("No meals to send. Please extract meals first.", "error");
	// 			return;
	// 		}

	// 		// Format meals for the web app
	// 		const formattedMeals = meals.map((meal) => ({
	// 			id: meal.id,
	// 			name: meal.name,
	// 			imageUrl: meal.imageUrl,
	// 			category: meal.category,
	// 			price: meal.price,
	// 			hasSideDish: meal.hasSideDish,
	// 			sideDishes: meal.sideDishes || [],
	// 		}));

	// 		// Create a download link
	// 		const mealsJSON = JSON.stringify(formattedMeals, null, 2);
	// 		const blob = new Blob([mealsJSON], { type: "application/json" });
	// 		const url = URL.createObjectURL(blob);
	// 		const a = document.createElement("a");
	// 		a.href = url;
	// 		a.download = "wecook-meals.json";
	// 		document.body.appendChild(a);
	// 		a.click();
	// 		document.body.removeChild(a);
	// 		URL.revokeObjectURL(url);

	// 		// Open the web app import page
	// 		chrome.tabs.create({ url: "http://localhost:3000/import" }, (tab) => {
	// 			console.log("[Popup] Web app import page opened");
	// 		});

	// 		// Show success status
	// 		showStatus(
	// 			"Meals data downloaded! You can now upload this file in the web app.",
	// 			"success"
	// 		);
	// 	} catch (error) {
	// 		console.error("[Popup] Error preparing meals data:", error);
	// 		showStatus("Failed to prepare meals data for download", "error");
	// 	}
	// });

	importButton.addEventListener("click", async () => {
		console.log("[Popup] Import button clicked");
		try {
			const response = await fetch(
				process.env.NODE_ENV === "production"
					? "https://wecook-backend.onrender.com/api/meals"
					: "http://localhost:3001/api/meals",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						meals: extractedMeals,
						date: extractedDate,
					}),
				}
			);

			if (response.ok) {
				showStatus("Import successful!", "success");
			} else {
				showStatus("Import failed.", "error");
			}
		} catch (error) {
			console.error("[Popup] Error importing meals:", error);
			showStatus("Error: " + error.message, "error");
		}
	});

	function showStatus(message, type) {
		console.log("Status update:", message, type);
		statusDiv.textContent = message;
		statusDiv.className = type;
		statusDiv.style.display = "block";
	}

	function createMealElement(meal) {
		const mealDiv = document.createElement("div");
		mealDiv.className = `meal-item`;

		const img = document.createElement("img");
		img.src = meal.imageUrl || "";
		img.alt = meal.name;
		img.className = "meal-image";
		mealDiv.appendChild(img);

		const infoDiv = document.createElement("div");
		infoDiv.className = "meal-info";

		const nameDiv = document.createElement("div");
		nameDiv.className = "meal-name";
		nameDiv.textContent = meal.name;
		infoDiv.appendChild(nameDiv);

		const categoryDiv = document.createElement("div");
		categoryDiv.className = "meal-category";
		categoryDiv.textContent = meal.category || "";
		infoDiv.appendChild(categoryDiv);

		if (meal.price) {
			const priceDiv = document.createElement("div");
			priceDiv.className = "meal-price";
			priceDiv.textContent = meal.price;
			priceDiv.setAttribute("data-price", meal.price);
			infoDiv.appendChild(priceDiv);
		}

		const sideDishesDiv = document.createElement("div");
		sideDishesDiv.className = "side-dishes";

		if (!meal.hasSideDish) {
			const noSideDiv = document.createElement("div");
			noSideDiv.className = "no-side-dish";
			noSideDiv.textContent = "No side dish available";
			sideDishesDiv.appendChild(noSideDiv);
		} else if (meal.sideDishes && meal.sideDishes.length > 0) {
			meal.sideDishes.forEach((side) => {
				const sideDiv = document.createElement("div");
				sideDiv.className = "side-dish-item";
				sideDiv.textContent = side;
				sideDishesDiv.appendChild(sideDiv);
			});
		}

		infoDiv.appendChild(sideDishesDiv);
		mealDiv.appendChild(infoDiv);
		return mealDiv;
	}

	function displayMeals(meals) {
		console.log("Displaying meals:", meals);
		regularMealsList.innerHTML = "";
		familyMealsList.innerHTML = "";

		if (!meals || !Array.isArray(meals) || meals.length === 0) {
			regularMealsList.innerHTML = "<p>No meals extracted yet.</p>";
			familyMealsList.innerHTML = "<p>No meals extracted yet.</p>";
			return;
		}

		meals.forEach((meal) => {
			const mealElement = createMealElement(meal);
			if (meal.category === "Family Size") {
				familyMealsList.appendChild(mealElement);
			} else {
				regularMealsList.appendChild(mealElement);
			}
		});

		// Hide sections if they're empty
		document.getElementById("regular-meals").style.display = regularMealsList
			.children.length
			? "block"
			: "none";
		document.getElementById("family-meals").style.display = familyMealsList
			.children.length
			? "block"
			: "none";
	}

	async function storeMeals(meals) {
		console.log("Storing meals:", meals);
		const timestamp = new Date().toISOString();
		await chrome.storage.local.set({
			meals: meals,
			extractedAt: timestamp,
		});
		if (timestampDiv) {
			timestampDiv.textContent = `Last updated: ${new Date(
				timestamp
			).toLocaleString()}`;
		}
	}

	function loadStoredMeals() {
		console.log("Loading stored meals");
		chrome.storage.local.get(["meals", "extractedAt"], (data) => {
			console.log("Loaded stored data:", data);
			if (data.meals && Array.isArray(data.meals) && data.meals.length > 0) {
				displayMeals(data.meals);
				if (data.extractedAt && timestampDiv) {
					timestampDiv.textContent = `Last updated: ${new Date(
						data.extractedAt
					).toLocaleString()}`;
				}
			} else {
				displayMeals([]); // Display empty state
			}
		});
	}

	// Function to send meals to web app
	async function sendMealsToWebApp(meals) {
		console.log("[Popup] Starting to send meals to web app using localStorage");
		console.log("[Popup] Meals to send:", meals);
		console.log("[Popup] Meals count:", meals.length);

		try {
			// Get the web app tab
			const [tab] = await chrome.tabs.query({
				url:
					process.env.NODE_ENV === "production"
						? "https://wecook.onrender.com/*"
						: "http://localhost:3000/*",
			});
			if (!tab) {
				console.error("[Popup] Web app tab not found");
				throw new Error("Web app tab not found");
			}

			console.log("[Popup] Found web app tab:", tab.id, tab.url);

			// Convert meals to a JSON string
			const mealsJSON = JSON.stringify(meals);
			console.log("[Popup] JSON string created, length:", mealsJSON.length);
			console.log(
				"[Popup] First 100 chars of JSON:",
				mealsJSON.substring(0, 100)
			);

			// Inject a script to store the meals in localStorage
			const result = await chrome.scripting.executeScript({
				target: { tabId: tab.id },
				func: (mealsJSON) => {
					try {
						console.log("[WebApp Direct] Storing meals in localStorage");
						console.log("[WebApp Direct] JSON length:", mealsJSON.length);

						// First check if localStorage is available
						if (typeof localStorage === "undefined") {
							console.error("[WebApp Direct] localStorage is not available");
							return { success: false, error: "localStorage is not available" };
						}

						// Test storing a simple value first
						try {
							localStorage.setItem("wecookTest", "test");
							console.log("[WebApp Direct] Test value stored successfully");
						} catch (e) {
							console.error("[WebApp Direct] Error storing test value:", e);
							return {
								success: false,
								error: "Failed to store test value: " + e.toString(),
							};
						}

						// Store the actual data
						try {
							localStorage.setItem("wecookMeals", mealsJSON);
							console.log("[WebApp Direct] Meals stored successfully");
						} catch (e) {
							console.error("[WebApp Direct] Error storing meals:", e);
							return {
								success: false,
								error: "Failed to store meals: " + e.toString(),
							};
						}

						// Store the timestamp
						try {
							const timestamp = new Date().toISOString();
							localStorage.setItem("wecookMealsTimestamp", timestamp);
							console.log("[WebApp Direct] Timestamp stored:", timestamp);
						} catch (e) {
							console.error("[WebApp Direct] Error storing timestamp:", e);
							return {
								success: false,
								error: "Failed to store timestamp: " + e.toString(),
							};
						}

						// Try to notify the app with a simple event
						try {
							window.postMessage(
								{
									type: "WECOOK_STORAGE_UPDATED",
									timestamp: new Date().toISOString(),
								},
								"*"
							);
							console.log("[WebApp Direct] Notification message sent");
						} catch (e) {
							console.error("[WebApp Direct] Error sending notification:", e);
							// Don't fail just because notification failed
						}

						console.log(
							"[WebApp Direct] All data stored in localStorage successfully"
						);

						// Verify the data was stored
						const storedData = localStorage.getItem("wecookMeals");
						console.log(
							"[WebApp Direct] Verified data length:",
							storedData ? storedData.length : 0
						);

						return {
							success: true,
							dataLength: mealsJSON.length,
							storedLength: storedData ? storedData.length : 0,
						};
					} catch (error) {
						console.error(
							"[WebApp Direct] Error storing in localStorage:",
							error
						);
						return { success: false, error: error.toString() };
					}
				},
				args: [mealsJSON],
				world: "MAIN",
			});

			console.log("[Popup] localStorage injection result:", result);

			if (result && result[0] && result[0].result && result[0].result.success) {
				console.log("[Popup] Meals saved to localStorage successfully");
				console.log(
					"[Popup] Data lengths - original:",
					mealsJSON.length,
					"stored:",
					result[0].result.storedLength
				);
				showStatus(
					"Meals sent to web app successfully! Check localStorage.",
					"success"
				);
			} else {
				const error =
					result && result[0] && result[0].result
						? result[0].result.error
						: "Unknown error";
				throw new Error(`Failed to store meals in localStorage: ${error}`);
			}
		} catch (error) {
			console.error("[Popup] Error in sendMealsToWebApp:", error);
			showStatus("Error: " + error.message, "error");
		}
	}
});
