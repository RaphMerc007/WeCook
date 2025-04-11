export function createStore() {
	const store = {
		state: {
			meals: [],
			clients: [],
		},
		setState(newState) {
			this.state = { ...this.state, ...newState };
		},
		getState() {
			return this.state;
		},
	};

	return store;
}
