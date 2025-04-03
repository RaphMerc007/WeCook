// This script is injected into the MAIN world of the page
// It helps bridge the communication between the extension's isolated world and the page

console.log("[WebApp Bridge] Bridge script loaded in MAIN world");

// Set a global flag to indicate the bridge is loaded
window._wecookBridgeLoaded = true;

// For debugging - test that events are working
setTimeout(() => {
	console.log("[WebApp Bridge] Testing event system...");
	window.dispatchEvent(new Event("wecook-bridge-loaded"));
	console.log("[WebApp Bridge] Test event dispatched");
}, 1000);

// Set up a listener for postMessage events from the content script
window.addEventListener("message", function (event) {
	console.log("[WebApp Bridge] Received message in bridge:", event);
	console.log("[WebApp Bridge] Message data:", event.data);

	// Forward messages from the content script to the page
	if (event.data && event.data.source === "wecook-content-script") {
		console.log("[WebApp Bridge] Forwarding message to page:", event.data);

		try {
			// Create a custom event to directly notify the React app
			const customEvent = new CustomEvent("wecook-meals-received", {
				detail: event.data,
			});

			// Dispatch the event on the window
			window.dispatchEvent(customEvent);
			console.log("[WebApp Bridge] Custom event dispatched");

			// Also try a direct window.postMessage as a fallback
			window.postMessage(
				{
					source: "wecook-bridge",
					originalData: event.data,
					type: "FORWARDED_MEALS",
				},
				"*"
			);
			console.log("[WebApp Bridge] Fallback postMessage sent");
		} catch (error) {
			console.error("[WebApp Bridge] Error forwarding message:", error);
		}
	}
});

// Let the world know we're ready
console.log("[WebApp Bridge] Ready to forward messages");
