export const API_BASE_URL =
	process.env.NODE_ENV === "production"
		? "https://wecook-backend.onrender.com/api"
		: "http://localhost:3001/api";
