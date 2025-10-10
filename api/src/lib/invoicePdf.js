// api/src/lib/invoicePdf.js
// PDF invoice generator using PDFKit (no external binary)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { format } from 'date-fns';
import {pool} from '../db.js';
import PDFDocument from 'pdfkit';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
const CURRENCY = '$';
const money = (n) => `${CURRENCY}${(Number(n) || 0).toFixed(2)}`;
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function readLogoDataUrl() {
  try {
    const logoPath = path.join(__dirname, 'images', 'image.jpg');
    const buf = fs.readFileSync(logoPath);
    const b64 = buf.toString('base64');
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return '';
  }
}

function fmtQty(q) {
  const n = Number(q || 0);
  const s = n.toFixed(2);
  return s.endsWith('.00') ? String(Math.trunc(n)) : s;
}

// -------------------------------------------------------------
// PDF builder using PDFKit
// -------------------------------------------------------------
async function buildPdfBuffer({ H, items, pays, totalPaid, grand }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 28 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Header: logo (if present) + business name
      const logoData = readLogoDataUrl();
      if (logoData) {
        try {
          const idx = logoData.indexOf('base64,');
          if (idx !== -1) {
            const b64 = logoData.slice(idx + 7);
            const imgBuf = Buffer.from(b64, 'base64');
            doc.image(imgBuf, 28, 28, { width: 60, height: 60 });
          }
        } catch (e) {
          // ignore image errors
        }
      }

      doc.fontSize(14).font('Helvetica-Bold').text(H.business_name || H.bl_name || 'MOJI WHOLESALE', 100, 36);
      const bizAddr = [H.bl_address1, H.bl_city, H.bl_state, H.bl_country, H.bl_zip]
        .filter(Boolean)
        .join(', ');
      if (bizAddr) doc.moveDown(0.4).fontSize(9).font('Helvetica').text(bizAddr, { align: 'left' });

      // Invoice meta (right side)
      const startY = 36;
      doc.fontSize(18).font('Helvetica-Bold').text('INVOICE', { align: 'right' });
      doc.moveDown(0.2);
      doc.fontSize(10).font('Helvetica').text(`Invoice No: ${H.invoice_no || H.id}`, { align: 'right' });
      doc.text(`Date: ${H.transaction_date ? format(new Date(H.transaction_date), 'yyyy-MM-dd HH:mm') : '—'}`, { align: 'right' });
      doc.text(`Status: ${H.status || 'final'}`, { align: 'right' });

      doc.moveDown(1);

      // Customer block
      doc.fontSize(10).font('Helvetica-Bold').text('Bill To:');
      const customer = [H.customer_name, H.customer_email, H.customer_phone].filter(Boolean).join('\n');
      doc.fontSize(10).font('Helvetica').text(customer || '—');

      doc.moveDown(0.6);

      // Items table header
      const tableTop = doc.y;
      const colX = { sku: 28, product: 100, qty: 370, unit: 430, sub: 500 };
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('SKU', colX.sku, tableTop);
      doc.text('Product', colX.product, tableTop);
      doc.text('Qty', colX.qty, tableTop, { width: 40, align: 'right' });
      doc.text('Unit', colX.unit, tableTop, { width: 60, align: 'right' });
      doc.text('Subtotal', colX.sub, tableTop, { width: 80, align: 'right' });

      doc.moveTo(28, doc.y + 12).lineTo(560, doc.y + 12).strokeOpacity = 0.1;
      // doc.stroke(); // strokeOpacity usage differs across versions; keep simple separator using moveDown
      doc.moveDown(0.8);

      doc.font('Helvetica').fontSize(9);
      items.forEach((it) => {
        const y = doc.y;
        doc.text(it.sku || '', colX.sku, y);
        doc.text(it.name || '', colX.product, y, { width: 260 });
        doc.text(fmtQty(it.qty), colX.qty, y, { width: 40, align: 'right' });
        doc.text(money(it.unit), colX.unit, y, { width: 60, align: 'right' });
        doc.text(money(it.sub), colX.sub, y, { width: 80, align: 'right' });
        doc.moveDown(0.8);
      });

      // Totals
      const subtotal = items.reduce((a, it) => a + (Number(it.sub) || 0), 0);
      const tax = Number(H.tax_amount || 0);
      const ship = Number(H.shipping_charges || 0);
      const disc = Number(H.discount_amount || 0);
      const total = Number(H.final_total || 0) || subtotal + tax + ship - disc;

      doc.moveDown(0.6);
      const rightX = 520;
      doc.fontSize(10).font('Helvetica');
      doc.text('Subtotal:', rightX - 80, doc.y, { width: 80, align: 'right' });
      doc.text(money(subtotal), rightX, doc.y, { width: 80, align: 'right' });
      if (disc) {
        doc.moveDown(0.3);
        doc.text('Discount:', rightX - 80, doc.y, { width: 80, align: 'right' });
        doc.text('-' + money(disc), rightX, doc.y, { width: 80, align: 'right' });
      }
      if (tax) {
        doc.moveDown(0.3);
        doc.text('Tax:', rightX - 80, doc.y, { width: 80, align: 'right' });
        doc.text(money(tax), rightX, doc.y, { width: 80, align: 'right' });
      }
      if (ship) {
        doc.moveDown(0.3);
        doc.text('Shipping:', rightX - 80, doc.y, { width: 80, align: 'right' });
        doc.text(money(ship), rightX, doc.y, { width: 80, align: 'right' });
      }

      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Total:', rightX - 80, doc.y, { width: 80, align: 'right' });
      doc.text(money(total), rightX, doc.y, { width: 80, align: 'right' });

      doc.moveDown(1);
      // Payments
      if (pays?.length) {
        doc.font('Helvetica-Bold').fontSize(10).text('Payments');
        pays.forEach((p) => {
          doc.font('Helvetica').fontSize(9).text(`${p.method || 'cash'} ${money(p.amount)} ${p.paid_on ? format(new Date(p.paid_on), 'yyyy-MM-dd') : ''}`);
        });
      }

      // Footer
      doc.moveDown(1);
      doc.fontSize(9).font('Helvetica').text('Notes / Terms', { underline: true });
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(8).text('Outside ALABAMA Customer is responsible for payment of all applicable Local/State/Federal Taxes for their Respective State.');
      doc.moveDown(0.2);
      doc.text('*Note: There will be a $30.00 return check fee for all NSF checks');

      doc.end();
    } catch (err) {
      return reject(err);
    }
  });
}

// Optional: run wkhtmltopdf (HTML renderer) when PIXEL_PERFECT output is required.
// Set env PDF_RENDERER='wkhtmltopdf' and optionally WKHTMLTOPDF_PATH to use this path.
async function renderWithWkhtmltopdf(html) {
  const WK = process.env.WKHTMLTOPDF_PATH || 'wkhtmltopdf';
  const baseArgs = [
    '--enable-local-file-access',
    '--page-size', 'A4',
    '--print-media-type',
    '--margin-top', '16mm',
    '--margin-bottom', '16mm',
    '--margin-left', '14mm',
    '--margin-right', '12mm',
    '-', '-'
  ];

  const run = (useXvfb = false) => new Promise((resolve, reject) => {
    const cmd = useXvfb ? 'xvfb-run' : WK;
    const args = useXvfb ? ['-a', WK, ...baseArgs] : baseArgs;

    const env = { ...process.env };
    try {
      const rt = process.env.XDG_RUNTIME_DIR || `/tmp/xdgrun_${process.pid}`;
      env.XDG_RUNTIME_DIR = rt;
      try { fs.mkdirSync(rt, { mode: 0o700, recursive: true }); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }

    let child;
    try {
      child = spawn(cmd, args, { stdio: ['pipe','pipe','pipe'], env });
    } catch (err) {
      return reject(new Error('wkhtmltopdf spawn failed: ' + err.message));
    }

    const out = [];
    const errOut = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => errOut.push(d));
    child.on('error', (e) => reject(new Error('wkhtmltopdf error: ' + (e && e.message ? e.message : String(e)))));
    child.on('close', (code) => {
      const buf = Buffer.concat(out);
      const stderr = Buffer.concat(errOut).toString('utf8');
      if (code !== 0) return reject(new Error('wkhtmltopdf exited ' + code + ': ' + stderr));
      return resolve({ buffer: buf, stderr });
    });

    child.stdin.write(html);
    child.stdin.end();
  });

  // try normal first, then xvfb-run if we detect issues
  try {
    let attempt = await run(false).catch(e => ({ err: e }));
    if (attempt && attempt.err) {
      const se = String(attempt.err && attempt.err.message ? attempt.err.message : attempt.err || '');
      if (/QPainter::begin\(\): Returned false|runtime directory|XDG_RUNTIME_DIR|Returned false|HostNotFoundError|did not produce a valid PDF/i.test(se)) {
        attempt = await run(true);
      } else {
        throw attempt.err;
      }
    }
    const { buffer, stderr } = attempt;
    if (!buffer || buffer.length < 4 || buffer.slice(0,4).toString() !== '%PDF') {
      const sample = buffer ? buffer.slice(0,512).toString('utf8').replace(/\s+/g,' ').slice(0,400) : '<no output>';
      throw new Error('wkhtmltopdf did not produce a valid PDF. stderr: ' + (stderr || '<none>') + ' sample: ' + sample);
    }
    return buffer;
  } catch (err) {
    // rethrow so caller can fallback to pdfkit
    throw err;
  }
}

// Recreate the original HTML builder for pixel-perfect wkhtmltopdf rendering
function buildHtml({ H, items, pays, totalPaid, grand }) {
  const isPaid =
    Math.round((totalPaid || 0) * 100) >= Math.round(Number(grand || 0) * 100);

  const lastPay = pays?.[pays.length - 1];
  const lastPayWhen = lastPay?.paid_on
    ? format(new Date(lastPay.paid_on), 'yyyy-MM-dd HH:mm')
    : '';
  const lastPayMethod = (lastPay?.method || 'cash').toUpperCase();

  const subtotal = items.reduce((a, it) => a + (Number(it.sub) || 0), 0);
  const tax = Number(H.tax_amount || 0);
  const ship = Number(H.shipping_charges || 0);
  const disc = Number(H.discount_amount || 0);
  const total = Number(H.final_total || 0) || subtotal + tax + ship - disc;

  const when = H.transaction_date
    ? format(new Date(H.transaction_date), 'yyyy-MM-dd HH:mm')
    : '—';
  const dueBy = '—';

  const bizLines = [
    (H.bl_name || H.business_name || 'MOJI WHOLESALE'),
    [H.bl_address1, H.bl_city, H.bl_state].filter(Boolean).join(', '),
    [H.bl_country, H.bl_zip].filter(Boolean).join(' '),
    H.bl_mobile ? `Mobile: ${H.bl_mobile}` : '',
  ]
    .filter(Boolean)
    .map(esc)
    .join('<br/>');

  const custLines = [
    H.customer_name || '—',
    H.customer_email || '',
    H.customer_phone || '',
  ]
    .filter(Boolean)
    .map(esc)
    .join('<br/>');

  const logo = readLogoDataUrl();

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Invoice ${esc(H.invoice_no || H.id)}</title>
<style>
  @page { size: A4; margin: 16mm 12mm 16mm 14mm; }
  html, body { height: 100%; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Helvetica Neue", sans-serif; color: #0f172a; font-size: 12px; line-height: 1.35; }
  .page { width: 100%; }
  .muted { color:#475569; }
  .soft { color:#64748b; }
  .bold { font-weight: 700; }
  .right { text-align: right; }
  .grid { display: grid; }
  .row { display: flex; flex-direction: row; align-items: center; }
  .mt-4 { margin-top: 4px; }
  .mt-6 { margin-top: 6px; }
  .mt-8 { margin-top: 8px; }
  .mt-10 { margin-top: 10px; }
  .mt-12 { margin-top: 12px; }
  .mt-16 { margin-top: 16px; }
  .mb-8 { margin-bottom: 8px; }
  .chip { display:inline-block; padding: 2px 8px; border-radius: 999px; border:1px solid #e5e7eb; background: #f8fafc; font-size: 10px; color:#111827; }
  .pill { display:inline-block; padding: 4px 10px; border-radius: 8px; color:#fff; font-weight:700; font-size: 10.5px; }
  .paid { background:#16a34a; }
  .due  { background:#ea580c; }
  .head { display: grid; grid-template-columns: 1fr 280px; column-gap: 18px; align-items: start; }
  .head-left { display:grid; grid-template-columns: 60px 1fr; column-gap: 10px; }
  .logo-wrap { width: 60px; height: 60px; border-radius: 6px; overflow:hidden; border:1px solid #e5e7eb; background:#fff; display:flex; align-items:center; justify-content:center; }
  .logo-wrap img { width: 100%; height: 100%; object-fit: cover; }
  .biz-name { font-size: 12.5px; font-weight: 800; letter-spacing: 0.15px; margin:0 0 2px 0; }
  .biz-addr { margin:0; font-size: 11px; color:#334155; }
  .head-right { text-align:right; }
  .inv-title { margin:0; font-size: 18px; font-weight: 800; color:#0b1220; letter-spacing: 0.2px; }
  .kv { margin-top: 8px; font-size: 11px; color:#475569; }
  .kv .row { justify-content: space-between; }
  .kv .k { padding: 2px 6px; }
  .kv .v { min-width: 110px; text-align:right; font-weight:700; color:#0f172a; }
  .customer-box { margin-top: 8px; text-align:right; }
  .customer-label { margin:0 0 4px 0; font-size: 10px; color:#64748b; font-weight:700; }
  .customer-lines { margin:0; color:#0f172a; }
  .metagrid { margin-top: 12px; display:grid; grid-template-columns: 1.2fr 0.9fr 0.9fr 0.9fr 1.1fr; column-gap: 8px; font-size: 11px; color:#0f172a; }
  .metagrid .cell { border:1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; }
  .metagrid .lab { color:#64748b; font-weight:700; margin-bottom: 2px; }
  .metagrid .val { color:#0f172a; }
  table { width:100%; border-collapse: collapse; margin-top: 12px; }
  thead { display: table-header-group; }
  th, td { font-size: 11.2px; padding: 8px 8px; }
  thead th { background:#f5f7fb; border:1px solid #e2e8f0; text-align:left; color:#0f172a; font-weight:700; }
  tbody td { border:1px solid #e2e8f0; color:#0f172a; }
  th.qty, td.qty, th.price, td.price, th.sub, td.sub { text-align: right; }
  .split { margin-top: 12px; display:grid; grid-template-columns: 1fr 240px; column-gap: 16px; }
  .payments { font-size: 11.5px; color:#0f172a; }
  .totals { border:1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; font-size: 11.2px; color:#334155; }
  .totals .row { display:grid; grid-template-columns: 1fr 110px; padding: 4px 0; }
  .totals .v { text-align:right; color:#0f172a; }
  .totals .hr { height:1px; background:#e2e8f0; margin:6px 0; }
  .totals .total .k { font-weight:800; color:#0f172a; }
  .totals .total .v { font-weight:800; color:#0f172a; }
  .footer { margin-top: 14px; color:#334155; font-size: 11.2px; display:grid; grid-template-columns: 1fr 1fr; column-gap: 24px; }
  .footer h4 { margin:0 0 6px 0; font-size: 11.2px; color:#0f172a; }
</style>
</head>
<body>
  <div class="page">

    <!-- Header -->
    <div class="head">
      <div class="head-left">
        <div class="logo-wrap">${logo ? `<img src="${logo}" alt="Logo"/>` : ''}</div>
        <div>
          <h1 class="biz-name">${esc(H.business_name || 'MOJI WHOLESALE')}</h1>
          <p class="biz-addr">${bizLines}</p>
        </div>
      </div>

      <div class="head-right">
        <p class="inv-title">INVOICE</p>
        <div class="kv">
          <div class="row"><div class="k">Invoice No.#</div><div class="v">${esc(H.invoice_no || H.id)}</div></div>
          <div class="row"><div class="k">Date</div><div class="v">${esc(when)}</div></div>
          <div class="row"><div class="k">Status</div><div class="v">${esc(H.status || 'final')} | ${isPaid ? 'paid' : 'due'}</div></div>
        </div>
        <div class="mt-6">
          <span class="pill ${isPaid ? 'paid' : 'due'}">${isPaid ? 'STATUS PAID' : 'DUE'}</span>
          ${H.client_ref ? `<span class="chip" style="margin-left:6px;">${esc(H.client_ref)}</span>` : ''}
        </div>

        <div class="customer-box">
          <p class="customer-label">Customer</p>
          <p class="customer-lines">${custLines}</p>
        </div>
      </div>
    </div>

    <!-- Meta grid to mirror backoffice row -->
    <div class="metagrid">
      <div class="cell">
        <div class="lab">Due by</div>
        <div class="val">${esc(dueBy)}</div>
      </div>
      <div class="cell">
        <div class="lab">Status</div>
        <div class="val"><span class="bold">${esc(H.status || 'final')}</span> ${isPaid ? '| paid' : '| due'}</div>
      </div>
      <div class="cell">
        <div class="lab">Invoice By</div>
        <div class="val">${esc(H.invoice_by || H.business_name || 'MOJI WHOLESALE')}</div>
      </div>
      <div class="cell">
        <div class="lab">Rep.</div>
        <div class="val">—</div>
      </div>
      <div class="cell">
        <div class="lab">Client Tax Id.</div>
        <div class="val">—</div>
      </div>
    </div>

    <!-- Items table -->
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Product</th>
          <th class="qty">Quantity</th>
          <th class="price">Unit Price</th>
          <th class="sub">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (it) => `
        <tr>
          <td>${esc(it.sku || '')}</td>
          <td>${esc(it.name || '')}</td>
          <td class="qty">${fmtQty(it.qty)}</td>
          <td class="price">${money(it.unit)}</td>
          <td class="sub">${money(it.sub)}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <!-- Payments + Totals -->
    <div class="split">
      <div class="payments">
        ${
          pays?.length
            ? `<div>${esc(lastPayMethod)} ${money(lastPay?.amount || totalPaid)}${
                lastPayWhen ? ` <span class="soft">(${esc(lastPayWhen)})</span>` : ''
              }</div>`
            : ''
        }
        <div class="bold mt-4">Total Paid ${money(totalPaid)}</div>
      </div>

      <div class="totals">
        <div class="row"><div class="k">Subtotal:</div><div class="v">${money(subtotal)}</div></div>
        ${disc ? `<div class="row"><div class="k">Discount:</div><div class="v">- ${money(disc)}</div></div>` : ''}
        ${tax ? `<div class="row"><div class="k">Tax:</div><div class="v">${money(tax)}</div></div>` : ''}
        ${ship ? `<div class="row"><div class="k">Shipping:</div><div class="v">${money(ship)}</div></div>` : ''}
        <div class="hr"></div>
        <div class="row total"><div class="k">Total:</div><div class="v">${money(total)}</div></div>
      </div>
    </div>

    <!-- Footer notes -->
    <div class="footer">
      <div>
        <h4>Notes / Terms</h4>
        <div>Outside ALABAMA Customer is responsible for payment of all applicable Local/State/Federal Taxes for their Respective State.</div>
        <div>*Note: There will be a $30.00 return check fee for all NSF checks</div>
      </div>
      <div>
        <h4>Return Policy</h4>
        <div>All sales are final. No return or exchange unless preapproved.</div>
      </div>
    </div>

  </div>
</body>
</html>`;
}

// Now modify main stream function to try wkhtmltopdf when requested
// -------------------------------------------------------------
// Main: query + render + stream
// -------------------------------------------------------------
export async function streamInvoicePdfHtml({
  res,
  sellId,
  businessId,
  disposition = 'inline',
}) {
  try {
    // 1) header/meta
    const [metaRows] = await pool.query(
      `
      SELECT
        t.id, t.invoice_no, t.transaction_date, t.status, t.payment_status,
        t.final_total, t.total_before_tax, t.tax_amount, t.discount_amount, t.shipping_charges,
        t.business_id, t.location_id,
        b.name AS business_name,
        bl.name AS bl_name, bl.landmark AS bl_address1, bl.city AS bl_city, bl.state AS bl_state,
        bl.country AS bl_country, bl.zip_code AS bl_zip, bl.mobile AS bl_mobile,
        c.id AS contact_id,
        COALESCE(NULLIF(TRIM(c.name),''), TRIM(CONCAT_WS(' ', c.prefix, c.first_name, c.last_name))) AS customer_name,
        c.email AS customer_email,
        COALESCE(c.mobile, c.alternate_number, c.landline) AS customer_phone
      FROM transactions t
      LEFT JOIN business b            ON b.id = t.business_id
      LEFT JOIN business_locations bl ON bl.id = t.location_id
      LEFT JOIN contacts c            ON c.id = t.contact_id
      WHERE t.id = ? AND t.business_id = ? AND t.type = 'sell'
      LIMIT 1
      `,
      [sellId, businessId]
    );
    const H = metaRows?.[0];
    if (!H) {
      res.status(404).type('text/plain').end('not_found');
      return;
    }

    // 2) lines
    const [lines] = await pool.query(
      `
      SELECT
        tsl.id,
        COALESCE(p.sku, v.sub_sku) AS sku,
        p.name AS product_name,
        tsl.quantity,
        COALESCE(tsl.unit_price_inc_tax, tsl.unit_price) AS unit_price,
        (COALESCE(tsl.unit_price_inc_tax, tsl.unit_price) * tsl.quantity) AS subtotal
      FROM transaction_sell_lines tsl
      LEFT JOIN variations v ON v.id = tsl.variation_id
      LEFT JOIN products   p ON p.id = v.product_id
      WHERE tsl.transaction_id = ?
      ORDER BY tsl.id ASC
      `,
      [H.id]
    );

    const items = (lines || []).map((l) => ({
      sku: l.sku || '',
      name: l.product_name || '',
      qty: Number(l.quantity || 0),
      unit: Number(l.unit_price || 0),
      sub: Number(l.subtotal || 0),
    }));

    // 3) payments
    const [pays] = await pool.query(
      `SELECT amount, method, paid_on
         FROM transaction_payments
        WHERE transaction_id = ?
     ORDER BY paid_on ASC, id ASC`,
      [H.id]
    );
    const totalPaid = (pays || []).reduce(
      (a, p) => a + Number(p.amount || 0),
      0
    );
    const grand = Number(H.final_total || 0);

    // 4) Build PDF buffer using PDFKit
    let pdf;
    if (process.env.PDF_RENDERER === 'wkhtmltopdf') {
      try {
        const html = buildHtml({ H, items, pays, totalPaid, grand });
        pdf = await renderWithWkhtmltopdf(html);
      } catch (wkErr) {
        console.error('wkhtmltopdf attempt failed, falling back to pdfkit:', wkErr && wkErr.message ? wkErr.message : wkErr);
        pdf = await buildPdfBuffer({ H, items, pays, totalPaid, grand });
      }
    } else {
      pdf = await buildPdfBuffer({ H, items, pays, totalPaid, grand });
    }

    // 5) stream
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-PDF-Renderer', 'pdfkit');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="invoice-${H.invoice_no || H.id}.pdf"`
    );
    res.end(pdf);
  } catch (err) {
    console.error('preview error', err);
    res.status(500).type('text/plain').end('server_error');
  }
}

export default streamInvoicePdfHtml;
