export const API_BASE_URL = import.meta.env.PROD
	? "https://wecook-backend.onrender.com/api" // Production URL on Render
	: "http://localhost:3001/api"; // Development URL
