/* src/pages/Company/Contact.jsx */
import { useState, useEffect } from "react";
import api from "../../api/axios.js";
import "../../styles/static.css";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [status, setStatus] = useState(null);

  useEffect(() => { window.scrollTo(0,0); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setStatus("sending");
    try {
      await api.post("/cms/contact", form);
      setStatus("ok");
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch {
      setStatus("err");
    }
  };

  return (
    <div className="static-page">
      <div className="static-hero">
        <h1 className="static-title">Contact</h1>
        <p className="static-sub">We’d love to hear from you. Use the form or reach us by email/phone.</p>
      </div>

      <div className="contact-grid">
        <div className="contact-card">
          <h3 className="static-head">Sales & Support</h3>
          <p className="static-text">Email: <a href="mailto:sales@mojistore.com">sales@mojistore.com</a></p>
          <p className="static-text">Phone: <a href="tel:+919999999999">+91 99999 99999</a></p>
          <p className="static-text">Hours: Mon–Sat, 9:00–18:00 IST</p>
        </div>

        <form className="contact-form" onSubmit={submit}>
          <div className="static-head">Send a message</div>
          <input className="input" placeholder="Name *" required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/>
          <input className="input" placeholder="Email *" required type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})}/>
          <input className="input" placeholder="Phone" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})}/>
          <input className="input" placeholder="Subject" value={form.subject} onChange={(e)=>setForm({...form,subject:e.target.value})}/>
          <textarea className="textarea" placeholder="Message *" required value={form.message} onChange={(e)=>setForm({...form,message:e.target.value})}/>
          <div className="flex items-center gap-2">
            <button className="btn" type="submit" disabled={status==='sending'}>{status==='sending'?'Sending…':'Send'}</button>
            {status==='ok' && <span className="note">Thanks! We’ll get back soon.</span>}
            {status==='err' && <span className="note">Something went wrong. Try again.</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
