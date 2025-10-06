
import api from "../api/axios";

export async function mergeGuestCartToServer(items = []) {
  for (const line of items) {
    const { product_id, variation_id, qty } = line || {};
    if (!product_id || !variation_id || !qty) continue;
    await api.post("/cart/add", { product_id, variation_id, qty });
  }
}
