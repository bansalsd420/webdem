import { Router } from 'express';
import { pool } from '../db.js';
import { s, n, erpGetAny, biz } from '../lib/erp.js';
import categoryVisibility from '../lib/categoryVisibility.js';

// Admin route: visibility management + category typeahead
const router = Router();

// Basic ping
router.get('/ping', (_req, res) => res.json({ ok: true, note: 'admin endpoints active' }));

/**
 * GET /api/admin/visibility
 * Optional query: categoryId, subcategoryId, limit, offset
 */
router.get('/visibility', async (req, res) => {
	try {
		const categoryId = n(req.query.categoryId);
		const subcategoryId = n(req.query.subcategoryId);
		const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
		const offset = Math.max(0, Number(req.query.offset || 0));

	const where = [];
	const params = {};
	if (Number.isFinite(categoryId)) { where.push('v.category_id = :categoryId'); params.categoryId = categoryId; }
	if (Number.isFinite(subcategoryId)) { where.push('v.subcategory_id = :subcategoryId'); params.subcategoryId = subcategoryId; }

				const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';

				const [rows] = await pool.query(
					`SELECT v.id, v.category_id, v.subcategory_id, v.hide_from_guests, v.hide_from_users, v.created_by, v.created_at, v.updated_at,
								 c.name AS category_name
								 FROM app_category_visibility v
								 LEFT JOIN categories c ON c.id = v.category_id
								 ${whereSql}
								 ORDER BY v.id DESC
								 LIMIT :limit OFFSET :offset`,
					{ ...params, limit, offset }
				);

					const [[{ total }]] = await pool.query(
						`SELECT COUNT(*) as total FROM app_category_visibility v ${whereSql}`,
						params
					);

		return res.json({ items: rows, total: total || rows.length });
	} catch (e) {
		console.error('admin visibility list error', e?.message || e);
		return res.status(500).json({ error: 'visibility_list_failed' });
	}
});

// DEBUG: inspect assembled visibility rules for current business
router.get('/visibility/debug', async (req, res) => {
	try {
		const rules = await categoryVisibility.loadRules(biz());
		return res.json({ biz: biz(), rules: {
			guests: {
				byCategory: Array.from(rules.guests.byCategory || []),
				bySub: Array.from((rules.guests.bySub || new Map()).entries()).map(([k,v]) => [k, Array.from(v)])
			},
			users: {
				byCategory: Array.from(rules.users.byCategory || []),
				bySub: Array.from((rules.users.bySub || new Map()).entries()).map(([k,v]) => [k, Array.from(v)])
			}
		}});
	} catch (e) {
		console.error('visibility debug failed', e && e.message ? e.message : e);
		return res.status(500).json({ error: 'debug_failed' });
	}
});

// DEBUG: return raw rows from app_category_visibility (no WHERE) to inspect business_id values
router.get('/visibility/raw', async (req, res) => {
	try {
		const [rows] = await pool.query('SELECT * FROM app_category_visibility ORDER BY id DESC LIMIT 200', {});
		return res.json({ count: rows.length, rows });
	} catch (e) {
		console.error('visibility raw failed', e && e.message ? e.message : e);
		return res.status(500).json({ error: 'raw_failed' });
	}
});

// DEBUG: invalidate in-memory visibility cache for current business
router.post('/visibility/invalidate', async (req, res) => {
	try {
		categoryVisibility.invalidate(biz());
		return res.json({ ok: true });
	} catch (e) {
		console.error('visibility invalidate failed', e && e.message ? e.message : e);
		return res.status(500).json({ error: 'invalidate_failed' });
	}
});

/**
 * POST /api/admin/visibility
 * Body: { category_id?, subcategory_ids?: [], hide_from_guests, hide_from_users, created_by }
 * If subcategory_ids omitted and category_id present -> create whole-category rule (subcategory_id NULL)
 * If subcategory_ids present -> create rows per subcategory
 */
router.post('/visibility', async (req, res) => {
	try {
		const categoryId = n(req.body.category_id);
		const subcategoryIds = Array.isArray(req.body.subcategory_ids) ? req.body.subcategory_ids.map(x => n(x)).filter(Boolean) : [];
		const hideFromGuests = !!req.body.hide_from_guests;
		const hideFromUsers = !!req.body.hide_from_users;
		const createdBy = n(req.body.created_by) || null;

		if (!Number.isFinite(categoryId) && (!subcategoryIds.length)) {
			return res.status(400).json({ error: 'category_or_subcategories_required' });
		}
		if (!hideFromGuests && !hideFromUsers) {
			return res.status(400).json({ error: 'at_least_one_hide_flag_required' });
		}

		const conn = await pool.getConnection();
		try {
			await conn.beginTransaction();
			const created = [];
			if (subcategoryIds.length) {
				for (const sid of subcategoryIds) {
					const [r] = await conn.query(
						`INSERT INTO app_category_visibility (category_id, subcategory_id, hide_from_guests, hide_from_users, created_by)
						 VALUES (:categoryId, :subcategoryId, :hideFromGuests, :hideFromUsers, :createdBy)
						 ON DUPLICATE KEY UPDATE hide_from_guests = VALUES(hide_from_guests), hide_from_users = VALUES(hide_from_users), updated_at = CURRENT_TIMESTAMP`,
						{ categoryId: categoryId || 0, subcategoryId: sid, hideFromGuests: hideFromGuests ? 1 : 0, hideFromUsers: hideFromUsers ? 1 : 0, createdBy }
					);
					created.push({ id: r.insertId || null, category_id: categoryId || null, subcategory_id: sid });
				}
			} else {
				// whole-category rule
				const [r] = await conn.query(
					`INSERT INTO app_category_visibility (category_id, subcategory_id, hide_from_guests, hide_from_users, created_by)
					 VALUES (:categoryId, NULL, :hideFromGuests, :hideFromUsers, :createdBy)
					 ON DUPLICATE KEY UPDATE hide_from_guests = VALUES(hide_from_guests), hide_from_users = VALUES(hide_from_users), updated_at = CURRENT_TIMESTAMP`,
					{ categoryId, hideFromGuests: hideFromGuests ? 1 : 0, hideFromUsers: hideFromUsers ? 1 : 0, createdBy }
				);
				created.push({ id: r.insertId || null, category_id: categoryId, subcategory_id: null });
			}
			await conn.commit();
			// invalidate visibility cache for this business
			try { categoryVisibility.invalidate(biz()); } catch (e) { console.warn('invalidate visibility cache failed', e && e.message ? e.message : e); }
			return res.status(201).json({ created });
		} catch (e) {
			await conn.rollback();
			throw e;
		} finally {
			conn.release();
		}
	} catch (e) {
		console.error('admin visibility create error', e?.message || e);
		return res.status(500).json({ error: 'visibility_create_failed' });
	}
});

/**
 * PATCH /api/admin/visibility/:id
 * Body: { hide_from_guests?, hide_from_users? }
 */
router.patch('/visibility/:id', async (req, res) => {
	try {
		const id = n(req.params.id);
		if (!id) return res.status(400).json({ error: 'bad_id' });
		const hideFromGuests = req.body.hide_from_guests === undefined ? undefined : !!req.body.hide_from_guests;
		const hideFromUsers = req.body.hide_from_users === undefined ? undefined : !!req.body.hide_from_users;
		if (hideFromGuests === undefined && hideFromUsers === undefined) return res.status(400).json({ error: 'nothing_to_update' });

		const sets = [];
		const params = { id };
		if (hideFromGuests !== undefined) { sets.push('hide_from_guests = :hideFromGuests'); params.hideFromGuests = hideFromGuests ? 1 : 0; }
		if (hideFromUsers !== undefined) { sets.push('hide_from_users = :hideFromUsers'); params.hideFromUsers = hideFromUsers ? 1 : 0; }

		const sql = `UPDATE app_category_visibility SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id`;
		await pool.query(sql, params);
		const [rows] = await pool.query('SELECT * FROM app_category_visibility WHERE id = :id', { id });
		try { categoryVisibility.invalidate(biz()); } catch (e) { console.warn('invalidate visibility cache failed', e && e.message ? e.message : e); }
		return res.json(rows[0] || null);
	} catch (e) {
		console.error('admin visibility patch error', e?.message || e);
		return res.status(500).json({ error: 'visibility_update_failed' });
	}
});

/**
 * DELETE /api/admin/visibility/:id
 */
router.delete('/visibility/:id', async (req, res) => {
	try {
		const id = n(req.params.id);
		if (!id) return res.status(400).json({ error: 'bad_id' });
		await pool.query('DELETE FROM app_category_visibility WHERE id = :id', { id });
		try { categoryVisibility.invalidate(biz()); } catch (e) { console.warn('invalidate visibility cache failed', e && e.message ? e.message : e); }
		return res.json({ ok: true });
	} catch (e) {
		console.error('admin visibility delete error', e?.message || e);
		return res.status(500).json({ error: 'visibility_delete_failed' });
	}
});

/**
 * Category typeahead: GET /api/admin/categories?query=...
 * Supports searching by id or name
 */
router.get('/categories', async (req, res) => {
	try {
		const q = s(req.query.query || req.query.q || '');
		if (!q) return res.json({ items: [] });
		const isId = /^\d+$/.test(q);
		if (isId) {
			const [rows] = await pool.query('SELECT id, name FROM categories WHERE id = :id LIMIT 10', { id: Number(q) });
			return res.json({ items: rows });
		}
		const like = `%${q}%`;
		const [rows] = await pool.query('SELECT id, name FROM categories WHERE name LIKE :like LIMIT 20', { like });
		return res.json({ items: rows });
	} catch (e) {
		console.error('admin categories search error', e?.message || e);
		return res.status(500).json({ error: 'categories_search_failed' });
	}
});

/**
 * GET /api/admin/categories/:id/subcategories
 */
router.get('/categories/:id/subcategories', async (req, res) => {
	try {
		const id = n(req.params.id);
		if (!id) return res.status(400).json({ items: [] });
		// Try connector endpoints first (UltimatePOS / connector paths). We attempt several
		// common endpoints used across the codebase and map the result to {id,name}.
		try {
			// include taxonomy endpoints found in the connector Postman collection
			const paths = [
				`/taxonomy/${id}`,
				`/taxonomy`,
				`/category/${id}/subcategories`,
				`/categories/${id}/subcategories`,
				`/categoryapi/${id}/subcategories`,
				`/subcategory`,
				`/subcategories`,
			];
			const { data } = await erpGetAny(paths, { query: { business_id: biz(), category_id: id, per_page: 200 } });

			// data normalization: connector might return categories that contain `sub_categories` array
			let arr = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []));

			// if the returned item is a category object with sub_categories, extract them
			let subs = [];
			if (arr.length && Array.isArray(arr[0]?.sub_categories)) {
				subs = arr[0].sub_categories;
			} else if (Array.isArray(data?.sub_categories)) {
				subs = data.sub_categories;
			} else if (arr.length && arr.every(it => it?.parent_id && it?.category_type)) {
				// looks like an array of subcategory objects
				subs = arr;
			} else {
				subs = [];
			}

			const out = subs.map(it => ({ id: n(it?.id) ?? n(it?.subcategory_id) ?? n(it?.sub_category_id), name: s(it?.name) ?? s(it?.title) ?? s(it?.subcategory_name) ?? '' })).filter(x => x.id);
			return res.json({ items: out });
		} catch (e) {
			// Connector may not expose subcategories; fall back gracefully to an empty list.
			console.warn('admin subcategories connector fallback', e?.message || e);
			return res.json({ items: [] });
		}
	} catch (e) {
		console.error('admin subcategories error', e?.message || e);
		return res.status(500).json({ error: 'subcategories_failed' });
	}
});

export default router;
