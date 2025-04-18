console.log("Environment:", import.meta.env);
console.log("VITE_API_URL:", import.meta.env.VITE_API_URL);

// In development, always use localhost
// In production, use the environment variable
export const API_BASE_URL = import.meta.env.DEV
	? "http://localhost:3001/api"
	: import.meta.env.VITE_API_URL
	? import.meta.env.VITE_API_URL.endsWith("/api")
		? import.meta.env.VITE_API_URL
		: `${import.meta.env.VITE_API_URL}/api`
	: "/api";

console.log("Using API_BASE_URL:", API_BASE_URL);

if (import.meta.env.PROD && !API_BASE_URL.startsWith("http")) {
	console.error("API_BASE_URL must be an absolute URL in production");
}
