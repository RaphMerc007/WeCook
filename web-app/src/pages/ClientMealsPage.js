import { API_BASE_URL } from "../config";

export default function ClientMealsPage(container, store, router) {
	let selectedDate = null;
	let weekMeals = [];
	let isLoading = false;

	// Get client ID from store
	const clientId = store.state.selectedClient;
	console.log("ClientMealsPage initialized with clientId:", clientId);
	console.log("Current store state:", store.state);

	// Load data on mount
	async function loadData() {
		try {
			console.log("Loading data...");
			console.log("Fetching client selections...");

			// Get client selections for this client
			const response = await fetch(
				`${API_BASE_URL}/client-selections/${clientId}`
			);
			const clientSelections = await response.json();
			console.log("Client selections for this client:", clientSelections);

			// Store in state for access in render
			store.setState({ clientSelections });

			// If a date is already selected, load meals for that date
			if (selectedDate) {
				loadDateMeals();
			} else {
				render();
			}
		} catch (error) {
			console.error("Error loading data:", error);
			render();
		}
	}

	// Function to clear old selections
	async function clearOldSelections(selections) {
		try {
			const today = new Date();
			const oneDayInMs = 24 * 60 * 60 * 1000;

			// Filter out selections that are more than 1 day old
			const updatedSelections = selections.filter((selection) => {
				const selectionDate = new Date(selection.date);
				const timeDiff = today - selectionDate;
				return timeDiff <= oneDayInMs;
			});

			// If we removed any selections, update the backend
			if (updatedSelections.length < selections.length) {
				console.log("Clearing old selections...");

				// Clear client selections for old dates
				const oldDates = selections
					.filter((selection) => {
						const selectionDate = new Date(selection.date);
						const timeDiff = today - selectionDate;
						return timeDiff > oneDayInMs;
					})
					.map((selection) => selection.date);

				// Update clients by removing old selections
				const updatedClients = store.state.clients.map((client) => ({
					...client,
					selectedMeals: (client.selectedMeals || []).filter(
						(meal) => !oldDates.includes(meal.date)
					),
				}));
				store.setState({ clients: updatedClients });

				// Update selections in the backend
				await fetch(`${API_BASE_URL}/selections`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						totalWeeks: updatedSelections.length,
						selections: updatedSelections,
					}),
				});

				console.log("Old selections cleared successfully");
			}
		} catch (error) {
			console.error("Failed to clear old selections:", error);
		}
	}

	// Load meals when a date is selected
	async function loadDateMeals() {
		console.log("Loading meals for date:", selectedDate);
		const normalizedSelectedDate = new Date(selectedDate)
			.toISOString()
			.split("T")[0]; // YYYY-MM-DD

		// Initialize with empty array
		weekMeals = [];

		// First check if we have selections for this date already in the local state
		let foundSelections = false;
		let clientSelections = [];

		// Check selections collection
		if (store.state.selections && store.state.selections.length > 0) {
			store.state.selections.forEach((selectionDoc) => {
				if (selectionDoc.selections && Array.isArray(selectionDoc.selections)) {
					selectionDoc.selections.forEach((selection) => {
						if (selection.date) {
							const selDate = new Date(selection.date)
								.toISOString()
								.split("T")[0]; // YYYY-MM-DD
							if (selDate === normalizedSelectedDate) {
								clientSelections.push(selection);
								foundSelections = true;
							}
						}
					});
				}
			});
		}

		// Also check client selections
		if (store.state.clientSelections) {
			Object.values(store.state.clientSelections).forEach((selection) => {
				if (selection.date) {
					const selDate = new Date(selection.date).toISOString().split("T")[0]; // YYYY-MM-DD
					if (selDate === normalizedSelectedDate) {
						clientSelections.push(selection);
						foundSelections = true;
					}
				}
			});
		}

		// Log what we found in local state
		console.log(
			"Found selections in local state:",
			foundSelections,
			clientSelections
		);

		// Try to fetch meals from API regardless of local state
		try {
			const response = await store.getters.api.get(
				`/client-meals?date=${normalizedSelectedDate}`
			);

			if (
				response.data &&
				response.data.meals &&
				Array.isArray(response.data.meals)
			) {
				console.log("API returned meals:", response.data.meals);

				// Process API meals and apply quantities from client selections
				weekMeals = response.data.meals.map((meal) => {
					const mealWithQuantity = { ...meal, quantity: 0 };

					// Check if this meal exists in client selections and set quantity
					if (foundSelections) {
						clientSelections.forEach((selection) => {
							if (selection.meals && Array.isArray(selection.meals)) {
								selection.meals.forEach((selectedMeal) => {
									if (
										selectedMeal.id === meal.id ||
										selectedMeal._id === meal._id
									) {
										mealWithQuantity.quantity = selectedMeal.quantity || 0;
									}
								});
							}
						});
					}

					return mealWithQuantity;
				});
			} else {
				console.log("No meals found for date:", normalizedSelectedDate);
			}
		} catch (error) {
			console.error(
				"Error fetching meals for date:",
				normalizedSelectedDate,
				error
			);
		}

		console.log("Final weekMeals:", weekMeals);
	}

	const handleQuantityChange = async (mealId, date, change) => {
		try {
			const client = store.state.clients.find((c) => c.id === clientId);
			if (!client) {
				console.error("Client not found");
				return;
			}

			// Find the current meal in our weekMeals array
			const meal = weekMeals.find((m) => m.id === mealId);
			if (!meal) {
				console.error("Meal not found:", mealId);
				return;
			}

			// Calculate the new quantity
			const currentQuantity = meal.quantity || 0;
			const newQuantity = Math.max(0, currentQuantity + change);

			// Update the meal quantity in the UI immediately for better user experience
			meal.quantity = newQuantity;
			render();

			// Save the updated selection to the server
			const response = await fetch(`${API_BASE_URL}/client-selections`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					clientId,
					date,
					mealId,
					quantity: newQuantity,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Failed to update selection: ${response.status} - ${errorText}`
				);
			}

			console.log("Selection updated successfully");

			// No need to reload all data, we've already updated the UI
		} catch (error) {
			console.error("Error updating client selection:", error);
			// If there was an error, reload data to ensure UI is in sync with server
			loadDateMeals();
		}
	};

	function formatImageUrl(imageUrl) {
		if (!imageUrl) return "";
		if (imageUrl.startsWith("http")) return imageUrl;
		return `https://cdn.wecookmeals.ca/uploads/${imageUrl}`;
	}

	function handleDateSelect(event) {
		console.log("Date select event:", event.target.value);
		const dateValue = event.target.value;

		// Validate the date format
		if (dateValue && dateValue !== "null") {
			try {
				// Ensure it's a valid date in YYYY-MM-DD format
				const date = new Date(dateValue + "T00:00:00");
				if (isNaN(date.getTime())) {
					console.error("Invalid date selected:", dateValue);
					return;
				}
				selectedDate = dateValue;
				loadDateMeals();
			} catch (error) {
				console.error("Error parsing selected date:", error);
			}
		} else {
			// Handle empty selection
			selectedDate = null;
			weekMeals = [];
			render();
		}
	}

	// Function to import existing selections for this client
	async function importClientSelections() {
		try {
			// Create a temporary loading indicator
			const importButton = document.querySelector(
				'[onclick="window.importClientSelections()"]'
			);
			if (importButton) {
				const originalText = importButton.textContent;
				importButton.textContent = "Importing...";
				importButton.disabled = true;

				// Restore button after 3 seconds in case of silent failure
				setTimeout(() => {
					importButton.textContent = originalText;
					importButton.disabled = false;
				}, 3000);
			}

			console.log("Importing selections for client:", clientId);

			const response = await fetch(`${API_BASE_URL}/import-client-selections`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					clientId,
				}),
			});

			// Reset the button regardless of outcome
			if (importButton) {
				importButton.textContent = "Import Existing Selections";
				importButton.disabled = false;
			}

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Failed to import selections: ${response.status} - ${errorText}`
				);
			}

			const result = await response.json();
			console.log("Import result:", result);

			if (result.imported > 0) {
				alert(
					`Successfully imported ${result.imported} meal selections for this client.`
				);
			} else {
				alert(
					"No selections were imported. There might not be any existing selections for this client."
				);
			}

			// Reload the data
			loadData();
		} catch (error) {
			console.error("Error importing client selections:", error);
			alert(`Error importing selections: ${error.message}`);
		}
	}

	// Function to fix the selections data
	async function fixSelectionsData() {
		try {
			// Show a confirmation dialog
			if (
				!confirm("This will fix the selections data structure. Are you sure?")
			) {
				return;
			}

			// Create a temporary loading indicator
			const fixButton = document.querySelector(
				'[onclick="window.fixSelectionsData()"]'
			);
			if (fixButton) {
				const originalText = fixButton.textContent;
				fixButton.textContent = "Fixing...";
				fixButton.disabled = true;

				// Restore button after 5 seconds in case of silent failure
				setTimeout(() => {
					fixButton.textContent = originalText;
					fixButton.disabled = false;
				}, 5000);
			}

			console.log("Fixing selections data structure...");

			const response = await fetch(`${API_BASE_URL}/fix-selections`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			});

			// Reset the button regardless of outcome
			if (fixButton) {
				fixButton.textContent = "Fix Selections Data";
				fixButton.disabled = false;
			}

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Failed to fix selections: ${response.status} - ${errorText}`
				);
			}

			const result = await response.json();
			console.log("Fix result:", result);

			alert("Selections data fixed successfully. Please reload the page.");

			// Reload the page to reflect changes
			window.location.reload();
		} catch (error) {
			console.error("Error fixing selections data:", error);
			alert(`Error fixing selections data: ${error.message}`);
		}
	}

	// Function to extract meals from selections
	async function extractMealsFromSelections() {
		try {
			// Show a confirmation dialog
			if (
				!confirm(
					"This will extract meal IDs from selections and create placeholder meals. Continue?"
				)
			) {
				return;
			}

			// Create a temporary loading indicator
			const extractButton = document.querySelector(
				'[onclick="window.extractMealsFromSelections()"]'
			);
			if (extractButton) {
				const originalText = extractButton.textContent;
				extractButton.textContent = "Extracting...";
				extractButton.disabled = true;

				// Restore button after 5 seconds in case of silent failure
				setTimeout(() => {
					extractButton.textContent = originalText;
					extractButton.disabled = false;
				}, 5000);
			}

			console.log("Extracting meals from selections...");

			const response = await fetch(
				`${API_BASE_URL}/extract-meals-from-selections`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
				}
			);

			// Reset the button regardless of outcome
			if (extractButton) {
				extractButton.textContent = "Extract Meals";
				extractButton.disabled = false;
			}

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Failed to extract meals: ${response.status} - ${errorText}`
				);
			}

			const result = await response.json();
			console.log("Extract result:", result);

			alert(`Meal extraction complete:
- Total meal IDs found: ${result.totalMealIds}
- Existing meals: ${result.existingMeals}
- Created placeholders: ${result.createdPlaceholders}`);

			// Reload the page to reflect changes
			window.location.reload();
		} catch (error) {
			console.error("Error extracting meals:", error);
			alert(`Error extracting meals: ${error.message}`);
		}
	}

	// Get the active dates from the client's selections
	function initDates() {
		if (!dates || dates.length === 0) {
			// First try to extract dates from selections
			let extractedDates = [];

			// Check for dates in the main selections collection
			if (store.state.selections && store.state.selections.length > 0) {
				console.log(
					"Processing dates from selections collection:",
					store.state.selections
				);

				// Try to extract dates from selections array
				store.state.selections.forEach((selectionDoc) => {
					if (
						selectionDoc.selections &&
						Array.isArray(selectionDoc.selections)
					) {
						selectionDoc.selections.forEach((selection) => {
							if (selection.date) {
								try {
									// Handle MongoDB date format (can be string or object)
									const dateObj = new Date(selection.date);
									if (!isNaN(dateObj.getTime())) {
										const dateStr = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD
										if (!extractedDates.includes(dateStr)) {
											extractedDates.push(dateStr);
										}
									}
								} catch (err) {
									console.warn("Error parsing date from selection:", err);
								}
							}
						});
					}
				});
			}

			console.log("Dates extracted from selections:", extractedDates);

			// Then check client selections collection for any additional dates
			if (store.state.clientSelections) {
				console.log(
					"Processing dates from client selections:",
					store.state.clientSelections
				);

				Object.values(store.state.clientSelections).forEach(
					(clientSelection) => {
						if (clientSelection.date) {
							try {
								const dateObj = new Date(clientSelection.date);
								if (!isNaN(dateObj.getTime())) {
									const dateStr = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD
									if (!extractedDates.includes(dateStr)) {
										extractedDates.push(dateStr);
									}
								}
							} catch (err) {
								console.warn("Error parsing date from client selection:", err);
							}
						}
					}
				);
			}

			// If no dates extracted, create defaults for the next 7 days
			if (extractedDates.length === 0) {
				console.log("No dates found in selections, creating default dates");

				const today = new Date();
				extractedDates = Array.from({ length: 7 }, (_, i) => {
					const date = new Date(today);
					date.setDate(today.getDate() + i);
					return date.toISOString().split("T")[0]; // YYYY-MM-DD
				});
			}

			// Sort dates chronologically
			extractedDates.sort();
			console.log("Final processed dates:", extractedDates);

			dates = extractedDates;
			selectedDate = dates[0]; // Select the first date by default
		}
	}

	// Save or update the meal selections for a date
	async function saveOrUpdateSelections() {
		if (!selectedDate || weekMeals.length === 0) {
			console.warn("Cannot save: No date selected or no meals available");
			return;
		}

		const normalizedDate = new Date(selectedDate).toISOString().split("T")[0]; // YYYY-MM-DD
		console.log("Saving selections for date:", normalizedDate);

		// Filter out meals with zero quantity
		const mealsWithQuantity = weekMeals.filter((meal) => meal.quantity > 0);
		if (mealsWithQuantity.length === 0) {
			console.warn("No meals selected (all quantities are 0)");
			return;
		}

		// Create the selection object
		const selection = {
			date: normalizedDate,
			meals: mealsWithQuantity.map((meal) => ({
				id: meal.id || meal._id,
				quantity: meal.quantity,
				name: meal.name,
			})),
		};

		// Store in local state first
		if (!store.state.clientSelections) {
			store.state.clientSelections = {};
		}
		store.state.clientSelections[normalizedDate] = selection;

		// Send to API
		try {
			await store.getters.api.post("/client-selections", {
				clientId: store.state.user.id,
				date: normalizedDate,
				selections: selection,
			});

			showNotification("Selections saved successfully!", "success");
		} catch (error) {
			console.error("Failed to save selections:", error);
			showNotification("Failed to save selections. Please try again.", "error");
		}
	}

	function render() {
		console.log("Render called with state:", {
			selectedDate,
			weekMeals,
			isLoading,
			clientId,
		});

		console.log("Store state:", store.state);

		const client = store.state.clients.find((c) => c.id === clientId);
		console.log("Found client in render:", client);

		if (!client) {
			console.error("Client not found in render!");
			container.innerHTML = `
				<div class="container">
					<p>Client not found</p>
					<button class="button" onclick="window.navigateToClients()">Back to Clients</button>
				</div>
			`;
			return;
		}

		// Calculate total selected meals for the selected date
		let selectedCount = 0;

		// Calculate directly from the weekMeals array which contains updated quantities
		if (weekMeals && weekMeals.length > 0) {
			selectedCount = weekMeals.reduce(
				(sum, meal) => sum + (meal.quantity || 0),
				0
			);
		}

		// Get unique dates from client selections and sort them
		const clientSelections = store.state.clientSelections || [];
		const dates = [];

		// First get dates from the main selections collection
		if (store.state.selections && store.state.selections.length > 0) {
			const selectionDocument = store.state.selections[0];
			if (selectionDocument && selectionDocument.selections) {
				console.log(
					"Processing dates from selections table:",
					selectionDocument.selections
				);

				selectionDocument.selections.forEach((selection) => {
					if (selection.date) {
						try {
							// Handle MongoDB date format which may be a Date object or a string
							const dateObj = new Date(selection.date);
							if (!isNaN(dateObj.getTime())) {
								const formattedDate = dateObj.toISOString().split("T")[0];
								if (!dates.includes(formattedDate)) {
									dates.push(formattedDate);
								}
							}
						} catch (err) {
							console.error(
								"Error parsing date from selections:",
								selection.date,
								err
							);
						}
					}
				});
			}
		}

		// Then add dates from client selections if any were missed
		clientSelections.forEach((selection) => {
			if (selection.date) {
				try {
					// Format date as YYYY-MM-DD
					const dateObj = new Date(selection.date);
					const formattedDate = dateObj.toISOString().split("T")[0];

					if (!dates.includes(formattedDate)) {
						dates.push(formattedDate);
					}
				} catch (err) {
					console.error(
						"Error parsing date from client selections:",
						selection.date,
						err
					);
				}
			}
		});

		// If no dates were found from either source, create some default dates
		if (
			dates.length === 0 &&
			store.state.meals &&
			store.state.meals.length > 0
		) {
			// Create dates for the next 7 days starting from today
			const today = new Date();
			for (let i = 0; i < 7; i++) {
				const date = new Date(today);
				date.setDate(today.getDate() + i);
				const formattedDate = date.toISOString().split("T")[0];
				dates.push(formattedDate);
			}
		}

		// Sort dates chronologically
		dates.sort();

		console.log("Processed dates for dropdown:", dates);

		// Separate regular and family meals
		const regularMeals = weekMeals.filter(
			(meal) => !meal.category.toLowerCase().includes("family")
		);
		const familyMeals = weekMeals.filter((meal) =>
			meal.category.toLowerCase().includes("family")
		);

		container.innerHTML = `
			<div class="container">
				<div class="stack">
					<div class="group">
						<div>
							<h2>${client.name}'s Meals</h2>
						</div>
						<div class="group">
							<select class="input" onchange="window.handleDateSelect(event)">
								<option value="">Select a date</option>
								${dates
									.map(
										(date) => `
									<option value="${date}" ${selectedDate === date ? "selected" : ""}>
										${new Date(date + "T00:00:00").toLocaleDateString()}
									</option>
								`
									)
									.join("")}
							</select>
							<button class="button button-secondary" onclick="window.importClientSelections()">
								Import Existing Selections
							</button>
							<!-- Admin buttons -->
							<div style="margin-left: auto; display: flex; gap: 8px;">
								<button class="button button-warning" onclick="window.extractMealsFromSelections()">
									Extract Meals
								</button>
								<button class="button button-danger" onclick="window.fixSelectionsData()">
									Fix Selections Data
								</button>
							</div>
						</div>
					</div>

					${isLoading ? "<p>Loading...</p>" : ""}

					${
						weekMeals.length > 0
							? `
						<div class="stack">
							${
								regularMeals.length > 0
									? `
								<h3>Regular Meals</h3>
								<div class="grid">
									${regularMeals
										.map(
											(meal) => `
												<div class="card">
													<img src="${formatImageUrl(meal.imageUrl)}" alt="${
												meal.name
											}" style="width: 100%; height: 200px; object-fit: cover;" />
													<h3>${meal.name}</h3>
													<p>${meal.category}</p>
													<p>${new Date(selectedDate + "T00:00:00").toLocaleDateString()}</p>
													<div class="quantity-control">
														<button class="quantity-button" onclick="window.handleQuantityChange('${
															meal.id
														}', '${selectedDate}', -1)">
															−
														</button>
														<span class="quantity-display">${meal.quantity}</span>
														<button class="quantity-button" onclick="window.handleQuantityChange('${
															meal.id
														}', '${selectedDate}', 1)">
															+
														</button>
													</div>
												</div>
											`
										)
										.join("")}
								</div>
							`
									: ""
							}

							${
								familyMeals.length > 0
									? `
								<h3>Family Meals</h3>
								<div class="grid">
									${familyMeals
										.map(
											(meal) => `
												<div class="card">
													<img src="${formatImageUrl(meal.imageUrl)}" alt="${
												meal.name
											}" style="width: 100%; height: 200px; object-fit: cover;" />
													<h3>${meal.name}</h3>
													<p>${meal.category}</p>
													<p>${new Date(selectedDate + "T00:00:00").toLocaleDateString()}</p>
													<div class="quantity-control">
														<button class="quantity-button" onclick="window.handleQuantityChange('${
															meal.id
														}', '${selectedDate}', -1)">
															−
														</button>
														<span class="quantity-display">${meal.quantity}</span>
														<button class="quantity-button" onclick="window.handleQuantityChange('${
															meal.id
														}', '${selectedDate}', 1)">
															+
														</button>
													</div>
												</div>
											`
										)
										.join("")}
								</div>
							`
									: ""
							}
						</div>
					`
							: selectedDate !== null
							? `<div style="padding: 20px; background-color: #fff3cd; border-left: 4px solid #ffc107; margin: 20px 0;">
                 <h3 style="margin-top: 0; color: #856404;">No Meals Available</h3>
                 <p>There are no meals available for ${new Date(
										selectedDate + "T00:00:00"
									).toLocaleDateString()}.</p>
                 <p>Please select a different date from the dropdown above or contact the administrator if you believe this is an error.</p>
               </div>`
							: ""
					}
				</div>
			</div>
			<div style="position: fixed; bottom: 20px; right: 20px; background-color: var(--primary-color); color: white; padding: 12px 24px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); font-weight: 500;">
				Selected: ${selectedCount}/${client.mealsPerWeek}
			</div>
		`;

		// Attach event handlers to window
		window.handleDateSelect = handleDateSelect;
		window.handleQuantityChange = handleQuantityChange;
		window.navigateToClients = () => router.navigate("/clients");
		window.importClientSelections = importClientSelections;
		window.fixSelectionsData = fixSelectionsData;
		window.extractMealsFromSelections = extractMealsFromSelections;
	}

	// Initial render
	render();
	// Load data after initial render
	loadData();
}
