// Store implementation
const store = {
	state: {
		selectedClient: null,
		user: null,
	},
	listeners: [],

	subscribe(listener) {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	},

	setState(newState) {
		this.state = { ...this.state, ...newState };
		this.listeners.forEach((listener) => listener(this.state));
	},

	getState() {
		return this.state;
	},

	getters: {
		api: {
			get: async (url) => {
				const response = await fetch(`${API_BASE_URL}${url}`);
				if (!response.ok) {
					throw new Error(`API error: ${response.status}`);
				}
				return response.json();
			},
			post: async (url, data) => {
				const response = await fetch(`${API_BASE_URL}${url}`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(data),
				});
				if (!response.ok) {
					throw new Error(`API error: ${response.status}`);
				}
				return response.json();
			},
		},
	},
};

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
