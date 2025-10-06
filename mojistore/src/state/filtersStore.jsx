// mojistore/src/state/filtersStore.jsx
import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import api from '../api/axios';

const TTL = 5 * 60 * 1000;

const Ctx = createContext(null);

export function FiltersProvider({ children }) {
    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [subBy, setSubBy] = useState({}); // { [catId]: [{id,name,parent_id}] }
    const expAtRef = useRef(0);
    const inflight = useRef({ base: null, subs: new Map() });

    async function ensureBase() {
        if (Date.now() < expAtRef.current && categories.length) return;
        if (inflight.current.base) return inflight.current.base;

        inflight.current.base = api.get('/filters')
            .then(({ data }) => {
                setCategories(Array.isArray(data?.categories) ? data.categories : []);
                setBrands(Array.isArray(data?.brands) ? data.brands : []);
                expAtRef.current = Date.now() + TTL;
            })
            .finally(() => { inflight.current.base = null; });

        return inflight.current.base;
    }

    async function ensureSubs(catId) {
        if (!catId) return;
        if (Array.isArray(subBy[catId])) return;
        if (inflight.current.subs.get(catId)) return inflight.current.subs.get(catId);

        const p = api.get('/filters', { params: { categoryId: catId } })
            .then(({ data }) => {
                const arr = Array.isArray(data) ? data
                    : Array.isArray(data?.subcategories) ? data.subcategories
                        : [];
                const normalized = arr.map(s => ({
                    id: s.id ?? s.sub_category_id ?? s.subcategory_id,
                    name: s.name ?? s.title ?? s.label,
                    parent_id: s.parent_id ?? catId
                })).filter(x => x.id != null && String(x.name || '').trim().length > 0);
                setSubBy(prev => ({ ...prev, [catId]: normalized }));
            })
            .finally(() => { inflight.current.subs.delete(catId); });

        inflight.current.subs.set(catId, p);
        return p;
    }

    const subToParent = useMemo(() => {
        const map = new Map();
        Object.values(subBy).forEach(list => {
            (list || []).forEach(s => map.set(Number(s.id), Number(s.parent_id) || null));
        });
        return map;
    }, [subBy]);

    function getSubcategoriesFor(catId) {
        if (catId == null) {
            // flatten all unique subs
            const seen = new Map();
            Object.entries(subBy).forEach(([pid, list]) => {
                (list || []).forEach(s => {
                    if (!seen.has(s.id)) {
                        const pidNum = Number(pid);
                        const parentId = (s.parent_id ?? (Number.isFinite(pidNum) ? pidNum : null));
                        seen.set(s.id, { id: s.id, name: s.name, parent_id: parentId });
                    }

                });
            });
            return Array.from(seen.values());
        }
        return subBy[catId] || [];
    }

    const value = {
        categories, brands, subBy, subToParent,
        ensureBase, ensureSubs, getSubcategoriesFor,
    };

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilters() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useFilters must be used inside <FiltersProvider>');
    return ctx;
}
