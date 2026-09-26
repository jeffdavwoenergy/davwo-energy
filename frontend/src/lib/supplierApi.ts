import axios from "axios";

/** Separate client for the supplier portal — deliberately its own token
 * storage key and its own axios instance, so a supplier session and a
 * customer session can never bleed into each other even if both are open
 * in the same browser (mirrors the "separate portal" architecture decision
 * all the way down to the client, not just the UI). */
const supplierApi = axios.create({ baseURL: "/api" });

const TOKEN_KEY = "davwo_supplier_token";

export function getSupplierToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setSupplierToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearSupplierToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

supplierApi.interceptors.request.use((config) => {
  const token = getSupplierToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

supplierApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) clearSupplierToken();
    return Promise.reject(err);
  },
);

export default supplierApi;
