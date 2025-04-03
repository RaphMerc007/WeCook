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
	}
	return true;
});
