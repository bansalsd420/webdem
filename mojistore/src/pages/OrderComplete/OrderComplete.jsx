// src/pages/OrderComplete/OrderComplete.jsx
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function OrderComplete() {
  const { search } = useLocation();
  const info = useMemo(() => {
    const u = new URLSearchParams(search);
    return {
      invoice: u.get('invoice') || null,
      id: u.get('id') || null
    };
  }, [search]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold mb-3">Thank you!</h1>
      <p className="text-gray-600 mb-6">Your order has been placed successfully.</p>

      <div className="rounded-xl p-4" style={{ border: '1px solid var(--color-border)' }}>
        <div className="space-y-1">
          {info.invoice && (
            <div className="flex justify-between">
              <span className="opacity-70">Invoice</span>
              <span className="font-medium">{info.invoice}</span>
            </div>
          )}
          {info.id && (
            <div className="flex justify-between">
              <span className="opacity-70">Transaction ID</span>
              <span className="font-medium">{info.id}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Link className="underline" to="/account?tab=orders">View orders</Link>
        <Link className="underline" to="/products">Continue shopping</Link>
      </div>
    </div>
  );
}
