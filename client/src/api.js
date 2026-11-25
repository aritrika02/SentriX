const BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? 'http://localhost:5000/api'
    : 'https://sentrix-api-auqw.onrender.com/api');

export async function api(path, { token, ...options } = {}) {
  const res = await fetch(BASE + path, {
    ...options,

    headers: {
      'Content-Type': 'application/json',

      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),

      ...options.headers
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(
      data.message || `HTTP ${res.status}`
    );

    error.status = res.status;
    error.data = data;
    error.membershipStatus = data.membershipStatus;

    throw error;
  }

  return data;
}