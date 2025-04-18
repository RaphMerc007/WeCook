console.log("Environment:", import.meta.env);
console.log("VITE_API_URL:", import.meta.env.VITE_API_URL);

// Helper function to ensure URL has protocol
function ensureProtocol(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://")) {
		return url;
	}
	return `https://${url}`;
}

// In development, always use localhost
// In production, use the environment variable
export const API_BASE_URL = import.meta.env.DEV
	? "http://localhost:3001/api"
	: (() => {
			const apiUrl = import.meta.env.VITE_API_URL;
			if (!apiUrl) return "/api";

			const fullUrl = ensureProtocol(apiUrl);
			return fullUrl.endsWith("/api") ? fullUrl : `${fullUrl}/api`;
	  })();

console.log("Using API_BASE_URL:", API_BASE_URL);

if (import.meta.env.PROD && !API_BASE_URL.startsWith("http")) {
	console.error("API_BASE_URL must be an absolute URL in production");
}
