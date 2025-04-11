console.log("Environment:", import.meta.env);
console.log("VITE_API_URL:", import.meta.env.VITE_API_URL);

// In development, use the proxy
// In production, use the environment variable
export const API_BASE_URL = import.meta.env.PROD
	? import.meta.env.VITE_API_URL
	: "/api";

if (import.meta.env.PROD && !API_BASE_URL.startsWith("http")) {
	console.error("API_BASE_URL must be an absolute URL in production");
}
