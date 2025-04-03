// Direct injection script that runs in the main world of the page
// This script will receive the meals data and directly set it on the window object

// Function to be executed in the page context
function injectMeals(meals) {
	console.log("[WebApp Direct] Injecting meals directly into window");

	// Set meals data on window object
	window._wecookMeals = meals;

	// Create and dispatch a custom event that the React app can listen for
	const event = new CustomEvent("wecook-meals-injected", {
		detail: {
			type: "MEALS",
			meals: meals,
		},
	});

	console.log("[WebApp Direct] Dispatching event with meals data");
	window.dispatchEvent(event);

	// Also try window.postMessage as a fallback
	window.postMessage(
		{
			source: "wecook-direct-injection",
			type: "MEALS",
			meals: meals,
		},
		"*"
	);

	console.log("[WebApp Direct] Meals injected successfully:", meals.length);
	return true;
}
