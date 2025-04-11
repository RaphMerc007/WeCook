export const API_BASE_URL =
	import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// Ensure the URL is absolute in production
if (import.meta.env.PROD && !API_BASE_URL.startsWith("http")) {
	console.error("API_BASE_URL must be an absolute URL in production");
}
