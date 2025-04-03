// Function to extract meal data from the page
function extractMealData() {
	console.log("extractMealData function called");
	const meals = [];

	// Extract the selected week's date
	const selectedWeekElement = document.querySelector(
		".border-primary.bg-primary.text-white"
	);
	let selectedDate = null;
	if (selectedWeekElement) {
		const dayElement = selectedWeekElement.querySelector(
			".text-heading-md.leading-4.font-semibold"
		);
		const monthElement = selectedWeekElement.querySelector(
			".text-body-xxs:last-child"
		);
		if (dayElement && monthElement) {
			const day = dayElement.textContent.trim();
			const month = monthElement.textContent.trim();
			const year = new Date().getFullYear();
			selectedDate = new Date(`${month} ${day}, ${year}`);
		}
	}

	// Find all meal sections
	console.log("Looking for meals-listing sections...");

	// Process regular meals
	const regularMealsListings = document.querySelectorAll(
		"div[id='meals-listing']"
	);
	console.log(
		"Found regular meals-listing sections:",
		regularMealsListings.length
	);

	// Process family-size meals
	const familyMealsListings = document.querySelectorAll(
		"div[id='family-meals-listing']"
	);
	console.log(
		"Found family meals-listing sections:",
		familyMealsListings.length
	);

	// Function to process meal cards
	const processMealCards = (listing, isFamilySize) => {
		const selector = isFamilySize
			? "div.family-meal-card"
			: "div.relative.item.card.card--smaller.meal-card";
		const mealCards = listing.querySelectorAll(selector);
		console.log(
			`Found ${mealCards.length} ${
				isFamilySize ? "family" : "regular"
			} meal cards in listing`
		);

		mealCards.forEach((card, cardIndex) => {
			console.log(
				`Processing ${isFamilySize ? "family" : "regular"} card ${
					cardIndex + 1
				}`
			);

			// Check if meal has additional price (skip meals with additional cost)
			const priceElement = card.querySelector(
				".absolute.top-0.left-0 .text-body-sm.font-semibold"
			);
			let price = null;
			if (priceElement && priceElement.textContent.includes("$")) {
				price = priceElement.textContent.trim();
				// For family meals, we want to keep them even though they have a price
				if (!isFamilySize) {
					console.log("Skipping regular meal with additional price:", price);
					return; // Skip this meal
				}
			} else if (!isFamilySize) {
				price = "FREE";
			}

			// Extract side dish information
			let sideDishes = [];
			let hasSideDish = true;

			// Check if meal has no side dish
			const noSideDishElement = card.querySelector(".text-body-xs.font-bold");
			if (
				noSideDishElement &&
				noSideDishElement.textContent.includes("no side dish")
			) {
				hasSideDish = false;
			} else {
				// Check for fixed side dish text
				const sideDishText = noSideDishElement?.textContent;
				if (sideDishText && sideDishText.startsWith("Side:")) {
					sideDishes.push(sideDishText.replace("Side:", "").trim());
				} else {
					// Look for side dish selectors
					const sideDishSelectors = card.querySelectorAll(
						".v-select--side-dish-selector"
					);
					sideDishSelectors.forEach((selector) => {
						const selectedOption = selector.querySelector(".selected-tag");
						if (selectedOption) {
							sideDishes.push(selectedOption.textContent.trim());
						}
					});
				}
			}

			const meal = {
				name: card
					.querySelector("span.text-body-md.text-black.font-semibold")
					?.textContent?.trim(),
				imageUrl: card.querySelector("img")?.src,
				category: isFamilySize ? "Family Size" : "Regular",
				price: price,
				hasSideDish: hasSideDish,
				sideDishes: sideDishes,
			};

			console.log("Extracted meal data:", meal);
			if (meal.name) {
				meals.push(meal);
			}
		});
	};

	// Process both types of meals
	regularMealsListings.forEach((listing) => processMealCards(listing, false));
	familyMealsListings.forEach((listing) => processMealCards(listing, true));

	console.log("Total meals extracted:", meals.length);
	return {
		meals,
		selectedDate: selectedDate ? selectedDate.toISOString() : null,
	};
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("Content script received message:", request);
	if (request.action === "extractMeals") {
		const mealData = extractMealData();
		console.log("Sending response back to popup:", mealData);
		// Send the extracted data to the background script for storage
		chrome.runtime.sendMessage({
			action: "saveMealData",
			data: mealData,
		});
		sendResponse({ success: true, data: mealData });
	}
	return true;
});
