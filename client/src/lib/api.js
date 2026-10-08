const apiBaseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export async function api(path, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, { ...options, credentials: "include", signal: controller.signal });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.detail || data?.error || "Something went wrong. Please try again.");
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("That request took too long. Please try again.");
    if (error instanceof TypeError) throw new Error("We couldn’t reach the service. Check your connection and try again.");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
