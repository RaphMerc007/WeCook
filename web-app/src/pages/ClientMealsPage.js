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

			// Fetch selections first
			console.log("Fetching selections...");
			const selectionsResponse = await fetch(`${API_BASE_URL}/selections`);
			const selectionsData = await selectionsResponse.json();
			console.log(
				"Raw selections data:",
				JSON.stringify(selectionsData, null, 2)
			);

			// Get the first document from the selections array
			const mainDocument =
				selectionsData && selectionsData.length > 0 ? selectionsData[0] : null;
			console.log("Main document:", JSON.stringify(mainDocument, null, 2));

			if (mainDocument && mainDocument.selections) {
				// Clean up selections data to remove any undefined meal IDs
				const cleanedSelections = mainDocument.selections.map((selection) => {
					if (selection.meals) {
						const cleanedMeals = {};
						Object.entries(selection.meals).forEach(([mealId, quantity]) => {
							if (mealId && mealId !== "undefined") {
								cleanedMeals[mealId] = quantity;
							}
						});
						return {
							...selection,
							meals: cleanedMeals,
						};
					}
					return selection;
				});

				// Clear old selections before storing the data
				await clearOldSelections(cleanedSelections);

				// Store selections data for date lookup
				store.setState({ selections: cleanedSelections });

				// Get the first available date and select it
				const dates = cleanedSelections
					.filter((s) => s.date)
					.map((s) => {
						try {
							const date = new Date(s.date);
							if (isNaN(date.getTime())) return null;
							date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
							return date.toISOString().split("T")[0];
						} catch (error) {
							return null;
						}
					})
					.filter((date) => date !== null)
					.filter((date, index, self) => self.indexOf(date) === index)
					.sort();

				if (dates.length > 0 && !selectedDate) {
					selectedDate = dates[0];
					loadDateMeals();
				}
			} else {
				console.log("No selections found in main document:", mainDocument);
			}
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
			// Format the date to match the API's expected format
			const formattedDate = new Date(
				selectedDate + "T00:00:00.000Z"
			).toISOString();

			// Fetch meals for the selected date
			const mealsResponse = await fetch(
				`${API_BASE_URL}/meals?date=${formattedDate}`
			);
			const mealsData = await mealsResponse.json();

			// Get client's selected meals for this date
			const client = store.state.clients.find((c) => c.id === clientId);
			const selectedMeals = client?.selectedMeals || [];
			const dateSelections = selectedMeals.filter(
				(m) => m.date === selectedDate
			);

			weekMeals = mealsData.map((meal) => {
				const selection = dateSelections.find((s) => s.mealId === meal.id);
				return {
					...meal,
					quantity: selection?.quantity || 0,
				};
			});
			console.log("Setting date meals:", weekMeals);
		} catch (error) {
			console.error("Failed to load date meals:", error);
			weekMeals = [];
		} finally {
			isLoading = false;
			render();
		}
	}

	function handleQuantityChange(mealId, date, change) {
		console.log("handleQuantityChange called with:", {
			mealId,
			date,
			change,
		});
		const client = store.state.clients.find((c) => c.id === clientId);
		console.log("Found client:", client);

		if (!client) {
			console.error("Client not found!");
			return;
		}

		const selectedMeals = client.selectedMeals || [];
		console.log("Current selectedMeals:", selectedMeals);

		// Get all selections for this date
		const dateSelections = selectedMeals.filter((m) => m.date === date);
		const currentDateTotal = dateSelections.reduce(
			(sum, m) => sum + m.quantity,
			0
		);

		const existingSelection = selectedMeals.find(
			(m) => m.mealId === mealId && m.date === date
		);
		console.log("Existing selection:", existingSelection);

		// Calculate new quantity
		const newQuantity = Math.max(
			0,
			(existingSelection?.quantity || 0) + change
		);

		// Check if this would exceed the weekly limit
		const otherMealsTotal =
			currentDateTotal - (existingSelection?.quantity || 0);
		if (newQuantity + otherMealsTotal > client.mealsPerWeek) {
			alert(`Cannot select more than ${client.mealsPerWeek} meals per week`);
			return;
		}

		console.log("New quantity:", newQuantity);

		let updatedSelectedMeals;
		if (newQuantity === 0 && existingSelection) {
			console.log("Removing selection");
			updatedSelectedMeals = selectedMeals.filter(
				(m) => !(m.mealId === mealId && m.date === date)
			);
		} else if (existingSelection) {
			console.log("Updating existing selection");
			updatedSelectedMeals = selectedMeals.map((m) =>
				m.mealId === mealId && m.date === date
					? { ...m, quantity: newQuantity }
					: m
			);
		} else if (newQuantity > 0) {
			console.log("Adding new selection");
			updatedSelectedMeals = [
				...selectedMeals,
				{ mealId, quantity: newQuantity, date },
			];
		} else {
			return; // No change needed
		}

		// Update the store
		store.setState({
			clients: store.state.clients.map((c) =>
				c.id === clientId
					? {
							...c,
							selectedMeals: updatedSelectedMeals,
					  }
					: c
			),
		});

		// Update the weekMeals array
		weekMeals = weekMeals.map((meal) =>
			meal.id === mealId ? { ...meal, quantity: newQuantity } : meal
		);

		// Force re-render to update the UI
		render();
	}

	function formatImageUrl(imageUrl) {
		if (!imageUrl) return "";
		if (imageUrl.startsWith("http")) return imageUrl;
		return `https://cdn.wecookmeals.ca/uploads/${imageUrl}`;
	}

	function handleDateSelect(event) {
		console.log("Date select event:", event.target.value);
		selectedDate = event.target.value;
		loadDateMeals();
	}

	function render() {
		console.log("Render called with state:", {
			selectedDate,
			weekMeals,
			isLoading,
			clientId,
		});

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
		const selectedMeals = client.selectedMeals || [];
		const dateSelections = selectedMeals.filter((m) => m.date === selectedDate);
		const selectedCount = dateSelections.reduce(
			(sum, m) => sum + m.quantity,
			0
		);

		// Get unique dates from selections and sort them
		const dates = (store.state.selections || [])
			.filter((s) => s.date)
			.map((s) => {
				try {
					const date = new Date(s.date);
					if (isNaN(date.getTime())) return null;
					date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
					return date.toISOString().split("T")[0];
				} catch (error) {
					return null;
				}
			})
			.filter((date) => date !== null)
			.filter((date, index, self) => self.indexOf(date) === index)
			.sort();

		console.log("Processed dates:", dates);

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
