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
		if (!selectedDate) {
			weekMeals = [];
			render();
			return;
		}

		isLoading = true;
		try {
			// Get all meals from the store
			const allMeals = store.state.meals || [];
			console.log("All meals from store:", allMeals);

			// Fetch client-specific selections for this date
			const response = await fetch(
				`${API_BASE_URL}/client-selections?clientId=${clientId}&date=${selectedDate}`
			);
			if (!response.ok) {
				throw new Error(
					`Failed to fetch client selections: ${response.status}`
				);
			}

			const clientSelections = await response.json();
			console.log("Client selections for date:", clientSelections);

			// Create a map of mealId to quantity
			const mealQuantities = {};
			clientSelections.forEach((selection) => {
				mealQuantities[selection.mealId] = selection.quantity;
			});

			// Map the meals with their quantities from the selections
			weekMeals = allMeals.map((meal) => ({
				...meal,
				quantity: mealQuantities[meal.id] || 0,
			}));

			console.log("Setting date meals:", weekMeals);
		} catch (error) {
			console.error("Failed to load date meals:", error);
			weekMeals = [];
		} finally {
			isLoading = false;
			render();
		}
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

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Failed to import selections: ${response.status} - ${errorText}`
				);
			}

			const result = await response.json();
			console.log("Import result:", result);

			alert(
				`Successfully imported ${result.imported} meal selections for this client.`
			);

			// Reload the data
			loadData();
		} catch (error) {
			console.error("Error importing client selections:", error);
			alert(`Error importing selections: ${error.message}`);
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

		// Extract unique dates from client selections
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
					console.error("Error parsing date:", selection.date);
				}
			}
		});

		// If no dates were found in client selections, check for available dates in meals
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
							? "<p>No meals available for this date</p>"
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
	}

	// Initial render
	render();
	// Load data after initial render
	loadData();
}
