import { API_BASE_URL } from "./config";

console.log("[Popup] API Base URL:", API_BASE_URL);

let extractedMeals: any[] = [];

function showStatus(message: string, type: "success" | "error") {
	const statusElement = document.getElementById("status");
	if (statusElement) {
		statusElement.textContent = message;
		statusElement.className = `status ${type}`;
	}
}

async function importMeals(meals: any[]) {
	try {
		console.log("[Popup] Importing meals:", meals);
		const url = `${API_BASE_URL}/meals`;
		console.log("[Popup] Making request to:", url);

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ meals }),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result = await response.json();
		console.log("[Popup] Import successful:", result);
		return result;
	} catch (error) {
		console.error("[Popup] Error importing meals:", error);
		throw error;
	}
}

document.addEventListener("DOMContentLoaded", () => {
	const importButton = document.getElementById("importButton");
	if (!importButton) {
		console.error("[Popup] Import button not found");
		return;
	}

	importButton.addEventListener("click", async () => {
		console.log("[Popup] Import button clicked");
		try {
			await importMeals(extractedMeals);
			showStatus("Import successful!", "success");
		} catch (error) {
			console.error("[Popup] Error importing meals:", error);
			showStatus(
				"Error: " + (error instanceof Error ? error.message : "Unknown error"),
				"error"
			);
		}
	});
});
