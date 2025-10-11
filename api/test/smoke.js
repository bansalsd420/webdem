async function run() {
  const base = 'http://localhost:4000/api';
  try {
    const r1 = await fetch(`${base}/products?instock=1&limit=5&page=1`);
    const j1 = await r1.json();
    console.log('Test1', r1.status, 'X-Total-Count=', r1.headers.get('x-total-count'), 'items=', (j1.items||[]).length);
    if ((j1.items||[]).length) console.log('First item:', JSON.stringify(j1.items[0], null, 2));

    const r2 = await fetch(`${base}/products?limit=5&page=1`);
    const j2 = await r2.json();
    console.log('Test2', r2.status, 'X-Total-Count=', r2.headers.get('x-total-count'), 'items=', (j2.items||[]).length);
    if ((j2.items||[]).length) console.log('First item:', JSON.stringify(j2.items[0], null, 2));

    if ((j1.items||[]).length) {
      const id = j1.items[0].id;
      const r3 = await fetch(`${base}/products/${id}`);
      const j3 = await r3.json();
      console.log('Test3', r3.status, 'id', j3.id, 'name', j3.name);
      // Related
      const r4 = await fetch(`${base}/products/${id}/related`);
      const j4 = await r4.json();
      console.log('Test4 related', r4.status, 'count', (Array.isArray(j4) ? j4.length : 0));
    } else {
      console.log('Skipping Test3; no id from Test1');
    }
    const r5 = await fetch(`${base}/home`);
    const j5 = await r5.json();
    console.log('Test5 home', r5.status, Object.keys(j5));
  } catch (e) {
    console.error('Smoke failed:', e.message);
  }
}

run();
