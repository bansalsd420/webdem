/* src/pages/Company/FAQ.jsx */
import { useEffect, useState } from "react";
import "../../styles/static.css";

const QA = [
  { q: "How do price groups work?", a: "When you login, your contact is mapped to a price group. Variants show group price if present; otherwise, the default sell price." },
  { q: "Do you show stock by location?", a: "Yes. The location picker drives inventory visibility and in-stock filtering across the site." },
  { q: "Can I order as a guest?", a: "You can build carts and wishlists as a guest. On login, we merge them to your account." },
  { q: "How fast do you deliver?", a: "Most orders ship within 24–48 hours from the nearest warehouse, subject to availability and cut-off times." }
];

export default function FAQ() {
  const [open, setOpen] = useState(-1);
  useEffect(() => { window.scrollTo(0,0); }, []);

  return (
    <div className="static-page">
      <div className="static-hero">
        <h1 className="static-title">FAQ</h1>
        <p className="static-sub">Answers to common questions about pricing, inventory, and orders.</p>
      </div>

      <div className="grid gap-3 mt-4">
        {QA.map((item, i) => (
          <div className="faq-item" key={i}>
            <div className="faq-q" onClick={()=> setOpen(open===i? -1 : i)}>
              <span>{item.q}</span>
              <span>{open===i ? '–' : '+'}</span>
            </div>
            {open===i && <div className="faq-a">{item.a}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
