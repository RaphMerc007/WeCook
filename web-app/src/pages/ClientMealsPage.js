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
			console.log("Fetching selections...");
			const response = await fetch(`${API_BASE_URL}/selections`);
			const data = await response.json();
			const mainDocument = data[0];
			console.log("Main document:", mainDocument);

			// Store the selections data in the store for access in render
			store.setState({ selections: data });

			// Get client's selections from the main document
			const clientSelections =
				mainDocument?.selections?.flatMap((selection) => {
					const clientSelection = selection.clients?.find(
						(c) => c.clientId === clientId
					);
					if (!clientSelection) return [];

					return Object.entries(clientSelection.meals).map(
						([mealId, quantity]) => ({
							mealId,
							quantity,
							date: selection.date,
						})
					);
				}) || [];
			console.log("Client selections:", clientSelections);

			// Process dates from client selections
			const dates = [...new Set(clientSelections.map((s) => s.date))];
			console.log("Processed dates:", dates);

			// Get all meals from store
			const allMeals = store.state.meals || [];
			console.log("All meals from store:", allMeals);

			// Get selections for the selected date
			const dateSelections = clientSelections.filter(
				(s) => s.date === selectedDate
			);
			console.log("Date selections:", dateSelections);

			// Set meals for the selected date
			weekMeals = allMeals.map((meal) => {
				const selection = dateSelections.find((s) => s.mealId === meal.id);
				return {
					...meal,
					quantity: selection ? selection.quantity : 0,
				};
			});
			console.log("Setting date meals:", weekMeals);

			render();
		} catch (error) {
			console.error("Error loading data:", error);
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

			// Get current selections data
			const response = await fetch(`${API_BASE_URL}/selections`);
			const data = await response.json();
			const mainDocument = data[0] || { selections: [] };

			// Find selection for this date
			const dateSelection = mainDocument.selections.find(
				(s) =>
					s.date === selectedDate ||
					new Date(s.date).toISOString().split("T")[0] === selectedDate
			);

			console.log("Found date selection:", dateSelection);

			// Map the meals with their quantities from the selection
			if (dateSelection && dateSelection.meals) {
				weekMeals = allMeals.map((meal) => ({
					...meal,
					quantity: dateSelection.meals[meal.id] || 0,
				}));
			} else {
				// No selection found for this date, set all quantities to 0
				weekMeals = allMeals.map((meal) => ({
					...meal,
					quantity: 0,
				}));
			}

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

			// Get current selections
			const response = await fetch(`${API_BASE_URL}/selections`);
			if (!response.ok) {
				throw new Error(
					`Failed to fetch selections: ${response.status} ${response.statusText}`
				);
			}

			const data = await response.json();
			console.log("Current selections data:", data);

			const mainDocument = data[0] || {
				totalWeeks: 1,
				currentWeek: 0,
				selections: [],
			};

			// Find or create selection for the date
			let selection = mainDocument.selections.find(
				(s) =>
					s.date === date ||
					new Date(s.date).toISOString().split("T")[0] === date
			);
			if (!selection) {
				// Ensure date is in a proper ISO format, not a string "null"
				// Format the date as an ISO string that matches the existing date format
				const formattedDate = date
					? new Date(date + "T00:00:00.000Z").toISOString()
					: null;

				if (!formattedDate) {
					console.error("Invalid date value:", date);
					throw new Error("Cannot create selection with invalid date");
				}

				// Create new selection if it doesn't exist
				selection = {
					weekNumber: mainDocument.selections.length + 1,
					meals: {},
					date: formattedDate,
				};
				mainDocument.selections.push(selection);
			}

			// Ensure the meals object exists
			if (!selection.meals) {
				selection.meals = {};
			}

			// Update meal quantity directly in the selection's meals object
			const currentQuantity = selection.meals[mealId] || 0;
			const newQuantity = Math.max(0, currentQuantity + change);

			if (newQuantity > 0) {
				selection.meals[mealId] = newQuantity;
			} else {
				delete selection.meals[mealId];
			}

			// Prepare the request payload
			const payload = {
				totalWeeks: mainDocument.totalWeeks,
				currentWeek: mainDocument.currentWeek || 0,
				selections: mainDocument.selections.filter((selection) => {
					// Filter out selections with invalid dates
					if (!selection.date || selection.date === "null") {
						return false;
					}

					// Keep all valid date selections
					return true;
				}),
			};
			console.log("Sending update payload:", JSON.stringify(payload));

			// Update the main document
			const updateResponse = await fetch(`${API_BASE_URL}/selections`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			const responseText = await updateResponse.text();
			console.log("Server response:", responseText);

			if (!updateResponse.ok) {
				throw new Error(
					`Failed to update selections: ${updateResponse.status} ${updateResponse.statusText} - ${responseText}`
				);
			}

			// Update the local state immediately without waiting for loadData
			// to provide instant feedback to the user
			const mealToUpdate = weekMeals.find((meal) => meal.id === mealId);
			if (mealToUpdate) {
				mealToUpdate.quantity = newQuantity;
				render(); // Re-render with updated quantities
			}

			// Refresh the data
			loadData();
		} catch (error) {
			console.error("Error updating client selections:", error);
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

		console.log("Store state for selections:", store.state.selections);

		// Get unique dates from selections and sort them
		const dates = [];

		// First try to get dates from the main selections data structure
		if (store.state.selections && store.state.selections.length > 0) {
			const selectionDates = store.state.selections[0]?.selections || [];
			console.log("Selection dates from main structure:", selectionDates);

			selectionDates.forEach((selection) => {
				if (selection.date && selection.date !== "null") {
					try {
						const date = new Date(selection.date);
						if (!isNaN(date.getTime())) {
							// Format as YYYY-MM-DD
							const formattedDate = date.toISOString().split("T")[0];
							if (!dates.includes(formattedDate)) {
								dates.push(formattedDate);
							}
						}
					} catch (error) {
						console.error("Error processing date:", selection.date);
					}
				}
			});
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
	}

	// Initial render
	render();
	// Load data after initial render
	loadData();
}
