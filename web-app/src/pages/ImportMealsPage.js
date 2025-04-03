import { API_BASE_URL } from "../config";

export default function ImportMealsPage(container, store) {
	let importedMeals = [];
	let error = null;
	let selectedWeek = null;
	let isLoading = false;
	let totalWeeks = 1;

	// Load total weeks on mount
	async function loadData() {
		try {
			const response = await fetch(`${API_BASE_URL}/selections`);
			const data = await response.json();
			totalWeeks = data.totalWeeks;
			render();
		} catch (error) {
			console.error("Failed to load total weeks:", error);
		}
	}

	async function handleFileUpload(event) {
		const file = event.target.files[0];
		if (!file) return;

		isLoading = true;
		render();

		try {
			const formData = new FormData();
			formData.append("file", file);

			const response = await fetch(`${API_BASE_URL}/upload`, {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				throw new Error("Failed to upload file");
			}

			const data = await response.json();
			console.log("File uploaded successfully:", data);

			// Now read the file content to show preview
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const content = e.target?.result;
					const meals = JSON.parse(content);
					importedMeals = meals;
					error = null;
				} catch {
					error =
						"Failed to parse the JSON file. Please make sure it's a valid WeCook meals file.";
					importedMeals = [];
				}
				render();
			};
			reader.readAsText(file);
		} catch (error) {
			console.error("Failed to upload file:", error);
			error = "Failed to upload file. Please try again.";
			importedMeals = [];
			render();
		} finally {
			isLoading = false;
		}
	}

	async function handleImport() {
		if (!selectedWeek) {
			error = "Please select a week to import meals for";
			render();
			return;
		}

		isLoading = true;
		render();

		try {
			const response = await fetch(`${API_BASE_URL}/selections`);
			const data = await response.json();

			// Convert selections array to our format
			const selectionsMap = {};
			data.selections.forEach((selection) => {
				selectionsMap[`week${selection.weekNumber}`] = {
					meals: selection.meals || {},
					date: selection.date,
				};
			});

			// Add imported meals to the selected week
			const weekNumber = parseInt(selectedWeek) + 1;
			const weekKey = `week${weekNumber}`;
			const weekData = selectionsMap[weekKey] || {};
			const weekMeals = weekData.meals || {};

			// Calculate the date for this week
			const today = new Date();
			const weekStart = new Date(today);
			weekStart.setDate(today.getDate() + (weekNumber - 1) * 7);
			const weekDate = weekData.date || weekStart;

			// Set quantity to 1 for all imported meals
			importedMeals.forEach((meal) => {
				weekMeals[meal.id] = 1;
			});

			// Update the selections, ensuring we update totalWeeks if needed
			const newTotalWeeks = Math.max(totalWeeks, weekNumber);

			await fetch(`${API_BASE_URL}/selections`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					totalWeeks: newTotalWeeks,
					selections: Object.entries(selectionsMap).map(([key, data]) => ({
						weekNumber: parseInt(key.replace("week", "")),
						meals: data.meals,
						date: data.date || (key === weekKey ? weekDate : undefined),
					})),
				}),
			});

			error = null;
			alert("Meals imported successfully!");

			// Update local totalWeeks if it changed
			if (newTotalWeeks > totalWeeks) {
				totalWeeks = newTotalWeeks;
				render();
			}
		} catch (error) {
			error = "Failed to import meals. Please try again.";
			console.error("Failed to import meals:", error);
		} finally {
			isLoading = false;
			render();
		}
	}

	function getWeekLabel(weekIndex) {
		const today = new Date();
		const weekStart = new Date(today);
		weekStart.setDate(today.getDate() + weekIndex * 7);
		return weekStart.toLocaleDateString();
	}

	function handleWeekSelect(event) {
		selectedWeek = event.target.value;
		render();
	}

	function render() {
		container.innerHTML = `
      <div class="container">
        <h1>Import Meals</h1>

        <div class="card">
          <div class="stack">
            <p>
              Upload a JSON file containing WeCook meals data. The file should be
              in the format exported by the WeCook Chrome extension.
            </p>

            <div>
              <label for="file-upload">Upload Meals JSON</label>
              <input
                type="file"
                id="file-upload"
                accept="application/json"
                class="input"
                onchange="window.handleFileUpload(event)"
              />
            </div>

            <div>
              <label for="week-select">Select Week</label>
              <select
                id="week-select"
                class="input"
                onchange="window.handleWeekSelect(event)"
              >
                <option value="">Choose a week</option>
                ${Array.from(
									{ length: totalWeeks },
									(_, i) => `
                  <option value="${i}" ${
										selectedWeek === i.toString() ? "selected" : ""
									}>
                    ${getWeekLabel(i)}
                  </option>
                `
								).join("")}
              </select>
            </div>

            ${
							error
								? `
              <p class="error-message">${error}</p>
            `
								: ""
						}

            ${
							importedMeals.length > 0
								? `
              <p>Found ${
								importedMeals.length
							} meals. Click Import to add them to
                the selected week.</p>
              <button class="button" onclick="window.handleImport()" ${
								isLoading ? "disabled" : ""
							}>
                ${isLoading ? "Importing..." : "Import Meals"}
              </button>
            `
								: ""
						}
          </div>
        </div>

        ${
					importedMeals.length > 0
						? `
          <div class="card">
            <h2>Preview</h2>
            <div class="stack">
              ${importedMeals
								.map(
									(meal, index) => `
                <div class="card">
                  <div class="group">
                    <h3>${meal.name}</h3>
                    <span class="badge">${meal.category}</span>
                  </div>
                  <p class="text-muted">Price: ${meal.price}</p>
                  ${
										meal.hasSideDish && meal.sideDishes.length > 0
											? `
                    <p class="text-muted">Side Dishes: ${meal.sideDishes.join(
											", "
										)}</p>
                  `
											: ""
									}
                </div>
              `
								)
								.join("")}
            </div>
          </div>
        `
						: ""
				}
      </div>
    `;

		// Attach event handlers to window
		window.handleFileUpload = handleFileUpload;
		window.handleWeekSelect = handleWeekSelect;
		window.handleImport = handleImport;
	}

	// Initial load
	loadData();
}
