// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
	console.log("WeCook Meal Extractor installed");
	// Initialize storage
	chrome.storage.local.set({ meals: [] });
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "saveMealData") {
		const timestamp = new Date().toISOString();
		const dataToStore = {
			meals: request.data,
			extractedAt: timestamp,
		};

		// Save to chrome storage
		chrome.storage.local.set(dataToStore, () => {
			console.log("Meal data saved:", dataToStore);
			// Notify all open popup windows
			chrome.runtime.sendMessage({
				action: "mealDataSaved",
				data: dataToStore,
			});
		});
	} else if (request.action === "importMeals") {
		console.log("[Background] Received import request");
		const { meals, date } = request.data;

		console.log("[Background] Meals to import:", meals);
		console.log("[Background] Date:", date);

		// Use production URL by default
		const backendUrl = "https://wecook-backend.onrender.com";

		// Make the request directly to the meals endpoint
		fetch(`${backendUrl}/api/meals`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ meals, date }),
			mode: "cors",
		})
			.then((response) => {
				console.log("[Background] Response status:", response.status);
				if (!response.ok) {
					// Try to get the error message from the response
					return response.text().then((text) => {
						throw new Error(
							`HTTP error! status: ${response.status}, message: ${text}`
						);
					});
				}
				return response.json();
			})
			.then((data) => {
				console.log("[Background] Import successful:", data);
				sendResponse({ success: true, data });
			})
			.catch((error) => {
				console.error("[Background] Import error:", error);
				sendResponse({ success: false, error: error.message });
			});

		return true; // Will respond asynchronously
	}
	return true;
});
