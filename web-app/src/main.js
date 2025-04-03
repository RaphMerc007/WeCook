// State management
const store = {
	state: {
		meals: [],
		clients: [],
		selectedClient: null,
	},
	listeners: new Set(),

	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	},

	setState(newState) {
		this.state = { ...this.state, ...newState };
		// Persist state to localStorage
		localStorage.setItem("wecook-state", JSON.stringify(this.state));
		this.listeners.forEach((listener) => listener(this.state));
	},

	// Load state from localStorage
	loadState() {
		const savedState = localStorage.getItem("wecook-state");
		if (savedState) {
			this.state = JSON.parse(savedState);
		}
	},
};

// Load saved state on startup
store.loadState();

// Router
const router = {
	routes: {
		"/": () => import("./pages/index.js").then((m) => m.MealsOverviewPage),
		"/meals": () => import("./pages/index.js").then((m) => m.MealsOverviewPage),
		"/clients": () => import("./pages/index.js").then((m) => m.ClientsPage),
		"/import": () => import("./pages/index.js").then((m) => m.ImportMealsPage),
		"/client-meals": () =>
			import("./pages/index.js").then((m) => m.ClientMealsPage),
	},

	async navigate(path) {
		const route = this.routes[path];
		if (route) {
			const page = await route();
			const mainContent = document.getElementById("main-content");
			mainContent.innerHTML = "";
			page(mainContent, store, router);
		}
	},
};

// Handle navigation
document.addEventListener("click", (e) => {
	if (e.target.matches("a")) {
		e.preventDefault();
		const path = e.target.getAttribute("href");
		router.navigate(path);
	}
});

// Initial navigation
router.navigate(window.location.pathname);
