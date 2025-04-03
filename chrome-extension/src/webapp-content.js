// Content script for the web app
console.log("[WebApp Content Script] Starting initialization");

// Global flag to track initialization
window._wecookInitialized = false;

// Initialize the content script
function initialize() {
	console.log("[WebApp Content Script] Setting up message listener");

	// Set up message listener using chrome.runtime
	chrome.runtime.onMessage.addListener(function (
		message,
		sender,
		sendResponse
	) {
		console.log("[WebApp Content Script] Received message:", message);

		// Process message synchronously
		try {
			if (message.type === "MEALS") {
				console.log("[WebApp Content Script] Processing meals message");

				// Forward the meals data to the web app via window.postMessage
				window.postMessage(
					{
						source: "wecook-content-script",
						type: "MEALS",
						meals: message.meals,
					},
					"*"
				);

				console.log("[WebApp Content Script] Posted message to window");

				// Send success response synchronously
				sendResponse({ success: true });
				console.log("[WebApp Content Script] Sent success response");
			} else {
				console.log(
					"[WebApp Content Script] Received unknown message type:",
					message.type
				);
				sendResponse({ success: false, error: "Unknown message type" });
			}
		} catch (error) {
			console.error("[WebApp Content Script] Error processing message:", error);
			sendResponse({ success: false, error: error.message });
		}

		// Explicitly return false to indicate we're handling synchronously
		return false;
	});

	console.log("[WebApp Content Script] Initialization complete");
	window._wecookInitialized = true;
}

// Initialize immediately if document is already loaded
if (
	document.readyState === "complete" ||
	document.readyState === "interactive"
) {
	initialize();
} else {
	// Wait for DOM content to be loaded
	document.addEventListener("DOMContentLoaded", initialize);
}

// Log that we're ready to receive messages
console.log(
	"[WebApp Content Script] Message listener set up, ready to receive messages"
);
