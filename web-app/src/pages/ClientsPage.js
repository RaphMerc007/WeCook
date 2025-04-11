import { API_BASE_URL } from "../config";

export default function ClientsPage(container, store, router) {
	let isModalOpen = false;
	let editingClient = null;

	function validateForm(values) {
		const errors = {};
		if (!values.name) {
			errors.name = "Name is required";
		}
		if (values.mealsPerWeek < 1) {
			errors.mealsPerWeek = "Must select at least 1 meal per week";
		}
		return errors;
	}

	async function handleSubmit(event) {
		event.preventDefault();
		const formData = new FormData(event.target);
		const values = {
			name: formData.get("name"),
			mealsPerWeek: parseInt(formData.get("mealsPerWeek")),
		};

		const errors = validateForm(values);
		if (Object.keys(errors).length > 0) {
			// Show errors
			Object.entries(errors).forEach(([field, error]) => {
				const input = event.target[field];
				const errorDiv = document.createElement("div");
				errorDiv.className = "error-message";
				errorDiv.textContent = error;
				input.parentNode.appendChild(errorDiv);
			});
			return;
		}

		try {
			if (editingClient) {
				// Update existing client
				const response = await fetch(
					`${API_BASE_URL}/clients/${editingClient}`,
					{
						method: "PUT",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify(values),
					}
				);

				if (!response.ok) {
					throw new Error("Failed to update client");
				}

				store.setState({
					clients: store.state.clients.map((client) =>
						client.id === editingClient ? { ...client, ...values } : client
					),
				});
			} else {
				// Create new client
				const response = await fetch(`${API_BASE_URL}/clients`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(values),
				});

				if (!response.ok) {
					throw new Error("Failed to create client");
				}

				const newClient = await response.json();
				store.setState({
					clients: [...store.state.clients, newClient],
				});
			}
			closeModal();
		} catch (error) {
			console.error("Error saving client:", error);
			alert("Failed to save client. Please try again.");
		}
	}

	function openEditModal(clientId) {
		editingClient = clientId;
		const client = store.state.clients.find((c) => c.id === clientId);
		if (!client) {
			console.error("Client not found!");
			return;
		}
		isModalOpen = true;
		render();

		// Set form values after render
		const form = document.getElementById("client-form");
		if (form) {
			form.name.value = client.name;
			form.mealsPerWeek.value = client.mealsPerWeek;
		}
	}

	function closeModal() {
		isModalOpen = false;
		editingClient = null;
		const form = document.getElementById("client-form");
		if (form) {
			form.reset();
		}
		render();
	}

	async function removeClient(clientId) {
		try {
			const response = await fetch(`${API_BASE_URL}/clients/${clientId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to delete client");
			}

			store.setState({
				clients: store.state.clients.filter((client) => client.id !== clientId),
			});
		} catch (error) {
			console.error("Error deleting client:", error);
			alert("Failed to delete client. Please try again.");
		}
	}

	function render() {
		container.innerHTML = `
      <div class="container">
        <div class="group">
          <h2>Clients</h2>
          <button class="button" onclick="window.openAddModal()">
            Add Client
          </button>
        </div>

        <div class="stack">
          ${store.state.clients
						.map(
							(client) => `
            <div class="card">
              <div class="group">
                <div>
                  <h3>${client.name}</h3>
                  <p class="text-muted">${client.mealsPerWeek} meals per week</p>
                </div>
                <div class="group">
                  <button class="button" onclick="window.navigateToClientMeals('${client.id}')">
                    Select Meals
                  </button>
                  <button class="button" onclick="window.openEditModal('${client.id}')">
                    Edit
                  </button>
                  <button class="button button-danger" onclick="window.removeClient('${client.id}')">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          `
						)
						.join("")}
        </div>

        ${
					isModalOpen
						? `
          <div class="modal-overlay" onclick="window.closeModal()">
            <div class="modal" onclick="event.stopPropagation()">
              <h3>${editingClient ? "Edit Client" : "Add New Client"}</h3>
              <form id="client-form" onsubmit="window.handleSubmit(event)">
                <div class="stack">
                  <div>
                    <label for="name">Name</label>
                    <input type="text" id="name" name="name" class="input" required>
                  </div>
                  <div>
                    <label for="mealsPerWeek">Meals per Week</label>
                    <input type="number" id="mealsPerWeek" name="mealsPerWeek" class="input" min="1" required>
                  </div>
                  <button type="submit" class="button">
                    ${editingClient ? "Save Changes" : "Add Client"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        `
						: ""
				}
      </div>
    `;

		// Attach event handlers to window
		window.openAddModal = () => {
			isModalOpen = true;
			editingClient = null;
			render();
		};
		window.openEditModal = (client) => openEditModal(client);
		window.closeModal = closeModal;
		window.handleSubmit = handleSubmit;
		window.removeClient = removeClient;
		window.navigateToClientMeals = (clientId) => {
			store.setState({ selectedClient: clientId });
			router.navigate("/client-meals");
		};
	}

	// Initial render
	render();
}
