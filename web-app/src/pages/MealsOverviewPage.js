import { API_BASE_URL } from "../config";

export default function MealsOverviewPage(container, store) {
	let selectedMeals = {};
	let totalWeeks = 1;
	let isLoading = false;
	let selectedWeek = null;
	let weekMeals = [];
	let overviewMeals = {};

	// Load saved data
	async function loadData() {
		isLoading = true;
		try {
			console.log("Loading initial data...");

			// Fetch selections
			const selectionsResponse = await fetch(`${API_BASE_URL}/selections`);
			const selectionsData = await selectionsResponse.json();
			console.log(
				"Raw selections data:",
				JSON.stringify(selectionsData, null, 2)
			);

			// Convert selections array to our format
			const selectionsMap = {};
			if (selectionsData && selectionsData.length > 0) {
				const mainDocument = selectionsData[0]; // Get the first (and only) document
				console.log("Main document:", JSON.stringify(mainDocument, null, 2));

				if (mainDocument && mainDocument.selections) {
					console.log(
						"Processing selections array with length:",
						mainDocument.selections.length
					);
					mainDocument.selections.forEach((selection, index) => {
						console.log(
							`Processing selection ${index}:`,
							JSON.stringify(selection, null, 2)
						);
						if (selection && selection.weekNumber) {
							const weekKey = `week${selection.weekNumber}`;
							console.log(`Adding selection for ${weekKey}:`, {
								meals: selection.meals || {},
								date: selection.date,
							});
							selectionsMap[weekKey] = {
								meals: selection.meals || {},
								date: selection.date,
							};
						} else {
							console.log(
								`Skipping selection ${index} - missing weekNumber:`,
								selection
							);
						}
					});
				} else {
					console.log("No selections found in main document:", mainDocument);
				}
			} else {
				console.log("No selections data found or empty selections array");
			}

			console.log(
				"Final selections map:",
				JSON.stringify(selectionsMap, null, 2)
			);
			selectedMeals = selectionsMap;
			totalWeeks = selectionsData?.[0]?.totalWeeks || 1;
			console.log("Set total weeks to:", totalWeeks);

			// Fetch all meals
			const mealsResponse = await fetch(`${API_BASE_URL}/meals`);
			const mealsData = await mealsResponse.json();
			console.log("Received meals data:", mealsData);

			if (mealsData) {
				store.setState({ meals: mealsData });
			}

			// Select the first available week with a date
			const availableWeeks = Array.from({ length: totalWeeks }, (_, i) => ({
				index: i,
				date: (() => {
					const weekKey = `week${i + 1}`;
					const weekData = selectedMeals[weekKey];
					return weekData && weekData.date ? new Date(weekData.date) : null;
				})(),
			}))
				.filter((item) => item.date !== null)
				.sort((a, b) => a.date - b.date);

			if (availableWeeks.length > 0 && selectedWeek === null) {
				selectedWeek = availableWeeks[0].index;
			}

			// Load overview meals
			loadOverviewMeals();
		} catch (error) {
			console.error("Failed to load data:", error);
		} finally {
			isLoading = false;
			render();
		}
	}

	// Load week meals when a week is selected
	async function loadWeekMeals() {
		if (selectedWeek === null) return;

		isLoading = true;
		try {
			const response = await fetch(`${API_BASE_URL}/selections`);
			const data = await response.json();
			const weekSelection = data.selections.find(
				(s) => s.weekNumber === selectedWeek + 1
			);

			if (weekSelection) {
				weekMeals = store.state.meals.map((meal) => ({
					...meal,
					quantity: weekSelection.meals[meal.id] || 0,
				}));
				console.log("Setting week meals:", weekMeals);
			} else {
				console.log("No meals found for week:", selectedWeek + 1);
				weekMeals = [];
			}
		} catch (error) {
			console.error("Failed to load week meals:", error);
			weekMeals = [];
		} finally {
			isLoading = false;
			render();
		}
	}

	// Load meal details for overview cards
	function loadOverviewMeals() {
		const mealIds = new Set();
		Object.values(selectedMeals).forEach((weekData) => {
			if (weekData.meals) {
				Object.entries(weekData.meals)
					.filter(
						([mealId, quantity]) =>
							mealId && mealId !== "undefined" && quantity > 0
					)
					.forEach(([mealId]) => mealIds.add(mealId));
			}
		});

		console.log("Loading overview meals for IDs:", Array.from(mealIds));

		overviewMeals = {};
		store.state.meals.forEach((meal) => {
			if (mealIds.has(meal.id)) {
				overviewMeals[meal.id] = meal;
			}
		});

		console.log("Setting overview meals:", overviewMeals);
	}

	// Save data whenever it changes
	async function saveData() {
		if (totalWeeks < 1 || Object.keys(selectedMeals).length === 0) {
			console.log("Skipping save - no data to save");
			return;
		}

		isLoading = true;
		try {
			console.log("Saving data...");
			console.log("Current selectedMeals:", selectedMeals);
			console.log("Current totalWeeks:", totalWeeks);

			const selections = Object.entries(selectedMeals).map(
				([weekKey, meals]) => ({
					weekNumber: parseInt(weekKey.replace("week", "")),
					meals: meals || {},
				})
			);

			console.log("Converted to selections array:", selections);

			const response = await fetch(`${API_BASE_URL}/selections`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					totalWeeks,
					selections,
				}),
			});

			const savedData = await response.json();
			console.log("Server response:", savedData);
		} catch (error) {
			console.error("Failed to save selections:", error);
		} finally {
			isLoading = false;
		}
	}

	function handleQuantityChange(mealId, weekNumber, change) {
		const weekKey = `week${weekNumber}`;
		const weekMeals = selectedMeals[weekKey] || {};
		const currentQuantity = weekMeals[mealId] || 0;
		const newQuantity = Math.max(0, currentQuantity + change);

		selectedMeals = {
			...selectedMeals,
			[weekKey]: {
				...weekMeals,
				[mealId]: newQuantity,
			},
		};

		render();
		saveData();
	}

	function handleAddWeek() {
		console.log("Adding new week...");
		console.log("Current totalWeeks:", totalWeeks);
		console.log("Current selectedMeals:", selectedMeals);

		const newTotal = totalWeeks + 1;
		console.log("Setting totalWeeks to:", newTotal);

		selectedMeals = {
			...selectedMeals,
			[`week${totalWeeks}`]: {},
		};
		totalWeeks = newTotal;

		console.log("Setting selectedMeals to:", selectedMeals);
		render();
		saveData();
	}

	function handleRemoveWeek() {
		if (totalWeeks > 1) {
			console.log("Removing week...");
			console.log("Current totalWeeks:", totalWeeks);
			console.log("Current selectedMeals:", selectedMeals);

			const newTotal = totalWeeks - 1;
			console.log("Setting totalWeeks to:", newTotal);

			const newMeals = { ...selectedMeals };
			delete newMeals[`week${totalWeeks - 1}`];
			selectedMeals = newMeals;
			totalWeeks = newTotal;

			console.log("Setting selectedMeals to:", selectedMeals);
			render();
			saveData();
		}
	}

	function getWeekLabel(weekIndex) {
		const weekKey = `week${weekIndex + 1}`;
		const weekData = selectedMeals[weekKey];
		if (weekData && weekData.date) {
			const date = new Date(weekData.date);
			return date.toLocaleDateString();
		}
		return `Week ${weekIndex + 1}`;
	}

	async function clearAllSelections() {
		try {
			console.log("Clearing all selections and meals...");

			// Clear all client selections
			const updatedClients = store.state.clients.map((client) => ({
				...client,
				selectedMeals: [],
			}));
			store.setState({ clients: updatedClients });

			// Reset selections in the backend
			await fetch(`${API_BASE_URL}/selections`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					totalWeeks: 1,
					selections: [
						{
							weekNumber: 1,
							meals: {},
						},
					],
				}),
			});

			// Clear all meals from the database
			await fetch(`${API_BASE_URL}/meals/clear`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			});

			// Reset local state
			selectedMeals = {};
			totalWeeks = 1;
			selectedWeek = null;
			store.setState({ meals: [] });

			console.log("All selections and meals cleared successfully");
			render();
		} catch (error) {
			console.error("Failed to clear selections and meals:", error);
		}
	}

	function render() {
		container.innerHTML = `
      <div class="container">
        <div class="stack">
          <div class="group">
            <h2>Meals Overview</h2>
            <div class="group">
              <select class="input" onchange="window.handleWeekSelect(event)">
                <option value="">Select a week</option>
                ${Array.from({ length: totalWeeks }, (_, i) => ({
									index: i,
									date: (() => {
										const weekKey = `week${i + 1}`;
										const weekData = selectedMeals[weekKey];
										return weekData && weekData.date
											? new Date(weekData.date)
											: null;
									})(),
								}))
									.filter((item) => item.date !== null)
									.sort((a, b) => a.date - b.date)
									.map(
										({ index, date }) => `
                <option value="${index}" ${
											selectedWeek === index ? "selected" : ""
										}>
                  ${date.toLocaleDateString()}
                </option>
              `
									)
									.join("")}
              </select>
              <button class="button button-danger" onclick="window.clearAllSelections()">
                Clear All Selections
              </button>
            </div>
          </div>

          ${
						selectedWeek !== null
							? `
            <div class="stack">
              ${(() => {
								const weekKey = `week${selectedWeek + 1}`;
								const weekData = selectedMeals[weekKey];
								const selectedMealIds = weekData
									? Object.keys(weekData.meals)
									: [];
								const selectedMealsWithDetails = selectedMealIds
									.filter((mealId) => mealId && mealId !== "undefined")
									.map((mealId) => {
										const meal = store.state.meals.find((m) => m.id === mealId);
										if (!meal) return null;

										// Calculate total quantity from all clients' selections for this meal and date
										const weekDate = weekData.date;
										const totalQuantity = (store.state.clients || []).reduce(
											(total, client) => {
												const clientMeals = client.selectedMeals || [];
												const dateSelections = clientMeals.filter(
													(m) =>
														m.mealId === mealId &&
														new Date(m.date).toISOString().split("T")[0] ===
															new Date(weekDate).toISOString().split("T")[0]
												);
												return (
													total +
													dateSelections.reduce(
														(sum, m) => sum + (m.quantity || 0),
														0
													)
												);
											},
											0
										);

										return {
											...meal,
											totalQuantity,
										};
									})
									.filter((meal) => meal && meal.totalQuantity > 0);

								return selectedMealsWithDetails.length > 0
									? selectedMealsWithDetails
											.map(
												(meal) => `
                    <div class="meal-list-item" style="display: flex; align-items: center; gap: 1rem; padding: 1rem; border: 1px solid #888; border-radius: 8px;">
                      <img src="${
												meal.imageUrl.startsWith("http")
													? meal.imageUrl
													: `https://cdn.wecookmeals.ca/uploads/${meal.imageUrl}`
											}" 
                           alt="${meal.name}" 
                           style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px;" />
                      <div style="flex: 1;">
                        <h3 style="margin: 0;">${meal.name}</h3>
                        <p style="margin: 0.5rem 0; color: #aaa;">${
													meal.category
												}</p>
                      </div>
                      <div style="margin-left: auto; font-weight: 500;">
                        Total Selected: ${meal.totalQuantity}
                      </div>
                    </div>
                  `
											)
											.join("")
									: "<p>No meals selected for this week</p>";
							})()}
            </div>
          `
							: "<p>Please select a week to view meals</p>"
					}
        </div>
      </div>
    `;

		// Attach event handlers to window for access from HTML
		window.handleWeekSelect = (event) => {
			selectedWeek = event.target.value ? parseInt(event.target.value) : null;
			render();
		};
		window.clearAllSelections = clearAllSelections;
	}

	// Initial load
	loadData();
}
