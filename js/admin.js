/* =========================================================
   Ignite Studio — Content Manager (admin.js)
   Auth + schema-driven CRUD over Supabase REST. No external libraries
   (keeps the strict CSP intact). Writes are authorized by the admin JWT;
   RLS on the server is the real gate — this UI is just the cockpit.
   ========================================================= */
(function () {
  "use strict";
  const { URL, ANON } = window.IGNITE_CMS;
  const $ = (s, c = document) => c.querySelector(s);
  const el = (tag, props = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "dataset") Object.assign(n.dataset, v);
      else if (k === "html") n.innerHTML = v;
      else if (k === "style" && typeof v === "string") n.setAttribute("style", v);
      else n[k] = v;
    }
    (Array.isArray(kids) ? kids : [kids]).forEach((k) => k != null && n.append(k));
    return n;
  };

  /* ---------------- icons (inline, stroke=currentColor) ---------------- */
  const P = (d) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    dash: P('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
    flame: P('<path d="M12 3c1 3-2 4-2 7a2 2 0 004 0c0-1 0-2 1-3 2 2 3 4 3 7a6 6 0 01-12 0c0-4 4-6 6-11z"/>'),
    bars: P('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    ticker: P('<path d="M3 8h18M3 12h18M3 16h12"/>'),
    steps: P('<path d="M4 20v-5h4v-5h4V5h8"/><circle cx="4" cy="20" r="1"/>'),
    heading: P('<path d="M6 4v16M18 4v16M6 12h12M4 4h4M16 4h4M4 20h4M16 20h4"/>'),
    quote: P('<path d="M7 7H4v6h4v-2a4 4 0 00-1-4zM17 7h-3v6h4v-2a4 4 0 00-1-4z"/>'),
    mega: P('<path d="M3 11v2a1 1 0 001 1h2l4 4V6L6 10H4a1 1 0 00-1 1zM15 8a4 4 0 010 8"/>'),
    grid: P('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    chat: P('<path d="M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2z"/>'),
    tag: P('<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1"/>'),
    help: P('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 013.7-2.2c1.6.8 1.3 2.8 0 3.5-.8.4-1.2 1-1.2 1.9M12 17h.01"/>'),
    image: P('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-7 7"/>'),
    pen: P('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'),
    menu: P('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    layout: P('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18"/>'),
    mail: P('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    inbox: P('<path d="M3 12h5l2 3h4l2-3h5M3 12l3-7h12l3 7v6a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
  };
  const icon = (name) => ICONS[name] || ICONS.flame;

  /* ---------------- auth ---------------- */
  const store = {
    get at() { return localStorage.getItem("ig_at"); },
    get rt() { return localStorage.getItem("ig_rt"); },
    save(s) {
      localStorage.setItem("ig_at", s.access_token);
      localStorage.setItem("ig_rt", s.refresh_token);
      localStorage.setItem("ig_email", (s.user && s.user.email) || "");
    },
    clear() { ["ig_at", "ig_rt", "ig_email"].forEach((k) => localStorage.removeItem(k)); },
  };
  async function login(email, password) {
    const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.msg || "Login failed");
    store.save(j); return j;
  }
  async function refresh() {
    const r = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: store.rt }),
    });
    if (!r.ok) return false;
    store.save(await r.json()); return true;
  }
  async function api(path, opts = {}, retry = true) {
    const res = await fetch(`${URL}/rest/v1/${path}`, {
      ...opts,
      headers: { apikey: ANON, Authorization: `Bearer ${store.at}`, "Content-Type": "application/json", ...(opts.headers || {}) },
    });
    if (res.status === 401 && retry && (await refresh())) return api(path, opts, false);
    return res;
  }
  async function count(table, filter) {
    const r = await api(`${table}?select=id${filter ? "&" + filter : ""}`, { headers: { Prefer: "count=exact", Range: "0-0" } });
    const cr = r.headers.get("content-range") || "*/0";
    return parseInt(cr.split("/")[1], 10) || 0;
  }

  /* ---------------- field renderer ---------------- */
  function renderField(f, value, onChange) {
    const id = "f_" + Math.random().toString(36).slice(2, 8);
    const wrap = el("div", { className: "field" });
    if (f.kind !== "bool") wrap.append(el("label", { htmlFor: id, textContent: f.label }));
    let input;
    if (f.kind === "textarea" || f.kind === "json") {
      const v = f.kind === "json" ? JSON.stringify(value ?? (f.arr ? [] : {}), null, 2) : (value ?? "");
      input = el("textarea", { id, value: v, rows: f.rows || (f.kind === "json" ? 6 : 3) });
      if (f.big) input.style.minHeight = "280px";
      input.addEventListener("input", () => {
        if (f.kind === "json") { try { onChange(JSON.parse(input.value)); input.style.borderColor = ""; } catch { input.style.borderColor = "var(--err)"; } }
        else onChange(input.value);
      });
    } else if (f.kind === "bool") {
      input = el("input", { id, type: "checkbox", checked: !!value });
      input.addEventListener("change", () => onChange(input.checked));
      wrap.append(el("label", { className: "toggle", htmlFor: id }, [input, document.createTextNode(f.label)]));
      if (f.hint) wrap.append(el("div", { className: "hint", textContent: f.hint }));
      return wrap;
    } else if (f.kind === "number") {
      input = el("input", { id, type: "number", value: value ?? "" });
      input.addEventListener("input", () => onChange(input.value === "" ? null : Number(input.value)));
    } else if (f.kind === "date") {
      input = el("input", { id, type: "date", value: value ?? "" });
      input.addEventListener("input", () => onChange(input.value));
    } else if (f.kind === "list") {
      input = el("textarea", { id, value: (value || []).join("\n"), rows: Math.max(3, (value || []).length) });
      input.addEventListener("input", () => onChange(input.value.split("\n").map((s) => s.trim()).filter(Boolean)));
      wrap.append(input, el("div", { className: "hint", textContent: f.hint || "One per line." }));
      return wrap;
    } else if (f.kind === "objlist") {
      return renderObjList(f, value || [], onChange);
    } else {
      input = el("input", { id, type: "text", value: value ?? "" });
      input.addEventListener("input", () => onChange(input.value));
    }
    wrap.append(input);
    if (f.hint) wrap.append(el("div", { className: "hint", textContent: f.hint }));
    return wrap;
  }
  function renderObjList(f, arr, onChange) {
    const wrap = el("div", { className: "field" });
    wrap.append(el("label", { textContent: f.label }));
    const list = el("div");
    const state = arr.map((x) => ({ ...x }));
    const paint = () => {
      list.textContent = "";
      state.forEach((item, i) => {
        const box = el("div", { className: "repeat-item" });
        box.append(el("div", { className: "ri-num", textContent: (f.itemLabel || "Item") + " " + (i + 1) }));
        box.append(el("button", { className: "btn btn-danger btn-sm rm", textContent: "Remove", type: "button",
          onclick: () => { state.splice(i, 1); onChange([...state]); paint(); } }));
        f.item.forEach((sub) => box.append(renderField(sub, item[sub.key], (v) => { item[sub.key] = v; onChange([...state]); })));
        list.append(box);
      });
    };
    paint();
    wrap.append(list);
    wrap.append(el("button", { className: "btn btn-ghost btn-sm", textContent: "+ Add", type: "button",
      onclick: () => { state.push({}); onChange([...state]); paint(); } }));
    return wrap;
  }

  /* ---------------- content schema (singletons + collections) ---------------- */
  const SINGLETONS = {
    hero: { label: "Hero", fields: [
      { key: "eyebrow", label: "Eyebrow badge", kind: "text" },
      { key: "title_line1", label: "Headline line 1", kind: "text" },
      { key: "title_line2_pre", label: "Line 2 — before accent", kind: "text" },
      { key: "title_line2_accent", label: "Line 2 — accent word", kind: "text" },
      { key: "title_line2_post", label: "Line 2 — after accent", kind: "text" },
      { key: "sub", label: "Sub-headline", kind: "textarea" },
      { key: "cta_primary", label: "Primary button", kind: "text" },
      { key: "cta_secondary", label: "Secondary link", kind: "text" },
    ]},
    trust_badge: { label: "Trust badge", fields: [
      { key: "rating", label: "Rating text", kind: "text" },
      { key: "text_post", label: "After rating", kind: "text" },
      { key: "avatars", label: "Avatar initials", kind: "list" },
    ]},
    stats: { label: "Stats bar", root: { kind: "objlist", itemLabel: "Stat", item: [
      { key: "prefix", label: "Prefix", kind: "text" }, { key: "value", label: "Number", kind: "text" },
      { key: "suffix", label: "Suffix", kind: "text" }, { key: "decimals", label: "Decimals", kind: "number" },
      { key: "label", label: "Label", kind: "text" },
    ]}},
    marquee: { label: "Marquee ticker", root: { kind: "list", hint: "Each phrase scrolls in the orange band." } },
    process: { label: "Process section", fields: [
      { key: "title_pre", label: "Title — plain", kind: "text" }, { key: "title_accent", label: "Title — accent", kind: "text" },
      { key: "steps", label: "Steps", kind: "objlist", itemLabel: "Step", item: [
        { key: "h", label: "Step title", kind: "text" }, { key: "p", label: "Step text", kind: "textarea" } ]},
    ]},
    section_services: { label: "“Services” heading", fields: [
      { key: "title_pre", label: "Title — plain", kind: "text" }, { key: "title_accent", label: "Title — accent", kind: "text" },
      { key: "lead", label: "Lead paragraph", kind: "textarea" } ]},
    section_work: { label: "“Work” heading", fields: [
      { key: "title_pre", label: "Title — plain", kind: "text" }, { key: "title_accent", label: "Title — accent", kind: "text" },
      { key: "lead", label: "Lead", kind: "text" }, { key: "cta", label: "CTA button", kind: "text" } ]},
    section_pricing: { label: "“Pricing” heading", fields: [
      { key: "title_pre", label: "Title — plain", kind: "text" }, { key: "title_accent", label: "Title — accent", kind: "text" },
      { key: "lead", label: "Lead", kind: "textarea" }, { key: "note", label: "Footnote", kind: "textarea" } ]},
    section_reviews: { label: "“Testimonials” heading", fields: [{ key: "title", label: "Title", kind: "text" }] },
    section_faq: { label: "“FAQ” heading", fields: [{ key: "title", label: "Title", kind: "text" }] },
    founder_note: { label: "Founder note", fields: [
      { key: "initials", label: "Avatar initials", kind: "text" }, { key: "quote", label: "Quote", kind: "textarea" },
      { key: "name", label: "Name", kind: "text" }, { key: "role", label: "Role", kind: "text" } ]},
    cta: { label: "Call to action", fields: [
      { key: "title_pre", label: "Title — plain", kind: "text" }, { key: "title_accent", label: "Title — accent", kind: "text" },
      { key: "title_post", label: "Title — after accent", kind: "text" }, { key: "lead", label: "Lead", kind: "textarea" } ]},
    nav: { label: "Navigation", fields: [
      { key: "links", label: "Menu links", kind: "objlist", itemLabel: "Link", item: [
        { key: "label", label: "Label", kind: "text" }, { key: "href", label: "Link", kind: "text" } ]},
      { key: "cta_ghost", label: "Ghost button", kind: "text" }, { key: "cta_primary", label: "Primary button", kind: "text" } ]},
    footer: { label: "Footer", fields: [
      { key: "tagline", label: "Tagline", kind: "textarea" }, { key: "made", label: "Made-with line", kind: "text" } ]},
    contact: { label: "Contact / NAP", fields: [
      { key: "email", label: "Email", kind: "text" }, { key: "phone_display", label: "Phone (shown)", kind: "text" },
      { key: "phone_href", label: "Phone (tel: link)", kind: "text" }, { key: "address", label: "Address", kind: "text" } ]},
  };

  const COLLECTIONS = {
    services: { label: "Services", singular: "service", order: "sort_order", fields: [
      { key: "sort_order", label: "Order", kind: "number" }, { key: "visible", label: "Visible on site", kind: "bool" },
      { key: "name", label: "Name", kind: "text" }, { key: "blurb", label: "Homepage card blurb", kind: "textarea" },
      { key: "slug", label: "URL slug", kind: "text", hint: "Page filename without .html" },
      { key: "h1", label: "Page headline", kind: "text" }, { key: "title", label: "SEO title", kind: "text" },
      { key: "meta_description", label: "SEO description", kind: "textarea" },
      { key: "intro", label: "Intro paragraphs", kind: "list" }, { key: "pricing", label: "Pricing paragraph", kind: "textarea" },
      { key: "process", label: "Process steps (advanced)", kind: "json", arr: true },
      { key: "includes", label: "What's included (advanced)", kind: "json", arr: true },
      { key: "faqs", label: "FAQs (advanced)", kind: "json", arr: true } ]},
    testimonials: { label: "Testimonials", singular: "testimonial", order: "sort_order", fields: [
      { key: "sort_order", label: "Order", kind: "number" }, { key: "visible", label: "Visible", kind: "bool" },
      { key: "name", label: "Name", kind: "text" }, { key: "role", label: "Role / company", kind: "text" },
      { key: "quote", label: "Quote", kind: "textarea" }, { key: "rating", label: "Stars (1-5)", kind: "number" } ]},
    pricing_tiers: { label: "Pricing tiers", singular: "tier", order: "sort_order", fields: [
      { key: "sort_order", label: "Order", kind: "number" }, { key: "visible", label: "Visible", kind: "bool" },
      { key: "name", label: "Plan name", kind: "text" }, { key: "price", label: "Price", kind: "text" },
      { key: "cadence", label: "Cadence", kind: "text" }, { key: "description", label: "Description", kind: "textarea" },
      { key: "features", label: "Features", kind: "list" }, { key: "featured", label: "Highlight as ‘most popular’", kind: "bool" },
      { key: "cta_label", label: "Button label", kind: "text" } ]},
    faqs: { label: "FAQs", singular: "FAQ", order: "sort_order", fields: [
      { key: "page", label: "Page (home / service slug)", kind: "text" }, { key: "sort_order", label: "Order", kind: "number" },
      { key: "visible", label: "Visible", kind: "bool" }, { key: "question", label: "Question", kind: "text" },
      { key: "answer", label: "Answer", kind: "textarea" } ]},
    portfolio: { label: "Portfolio / cases", singular: "project", order: "sort_order", fields: [
      { key: "sort_order", label: "Order", kind: "number" }, { key: "visible", label: "Visible", kind: "bool" },
      { key: "client", label: "Client name", kind: "text" }, { key: "tag", label: "Tag", kind: "text" },
      { key: "image", label: "Image path", kind: "text" }, { key: "image_alt", label: "Image alt text", kind: "text" },
      { key: "blurb", label: "Card blurb", kind: "textarea" }, { key: "metric", label: "Headline metric", kind: "text" },
      { key: "slug", label: "Case study slug", kind: "text" }, { key: "case_h1", label: "Case headline", kind: "text" },
      { key: "case_lead", label: "Case intro", kind: "textarea" },
      { key: "case_stats", label: "Case stats (advanced)", kind: "json", arr: true },
      { key: "case_sections", label: "Case sections (advanced)", kind: "json", arr: true },
      { key: "case_quote", label: "Case quote (advanced)", kind: "json" } ]},
    posts: { label: "Blog posts", singular: "post", order: "sort_order", fields: [
      { key: "sort_order", label: "Order", kind: "number" }, { key: "visible", label: "Published", kind: "bool" },
      { key: "title", label: "SEO title", kind: "text" }, { key: "h1", label: "Headline", kind: "text" },
      { key: "slug", label: "URL slug", kind: "text" }, { key: "meta_description", label: "SEO description", kind: "textarea" },
      { key: "tag", label: "Tag", kind: "text" }, { key: "read_time", label: "Read time", kind: "text" },
      { key: "author_name", label: "Author", kind: "text" }, { key: "author_role", label: "Author role", kind: "text" },
      { key: "published_at", label: "Published date", kind: "date" }, { key: "lead", label: "Lead paragraph", kind: "textarea" },
      { key: "body_html", label: "Body (HTML)", kind: "textarea", big: true } ]},
  };

  /* ---------------- menu / navigation config ---------------- */
  const MENU = [
    { group: "Overview", items: [{ id: "dash", icon: "dash", label: "Dashboard", type: "dashboard", desc: "A quick pulse on your site and content." }] },
    { group: "Homepage", items: [
      { id: "hero", icon: "flame", label: "Hero", type: "single", keys: ["hero"], desc: "The first thing visitors see — headline, sub-copy, and top buttons." },
      { id: "statstrust", icon: "bars", label: "Stats & trust", type: "single", keys: ["stats", "trust_badge"], desc: "Your proof bar and the star-rating badge." },
      { id: "marquee", icon: "ticker", label: "Marquee ticker", type: "single", keys: ["marquee"], desc: "The scrolling orange band of services." },
      { id: "process", icon: "steps", label: "Process steps", type: "single", keys: ["process"], desc: "The 4-step ‘how it works’ timeline." },
      { id: "headings", icon: "heading", label: "Section titles", type: "single", keys: ["section_services", "section_work", "section_pricing", "section_reviews", "section_faq"], desc: "The headline above each homepage section." },
      { id: "founder", icon: "quote", label: "Founder note", type: "single", keys: ["founder_note"], desc: "The personal note under the testimonials." },
      { id: "cta", icon: "mega", label: "Call to action", type: "single", keys: ["cta"], desc: "The final flame-drenched call-to-action band." },
    ]},
    { group: "Content", items: [
      { id: "services", icon: "grid", label: "Services", type: "collection", table: "services", desc: "Your service cards and their full pages." },
      { id: "testimonials", icon: "chat", label: "Testimonials", type: "collection", table: "testimonials", desc: "Client quotes shown on the homepage." },
      { id: "pricing_tiers", icon: "tag", label: "Pricing tiers", type: "collection", table: "pricing_tiers", desc: "Your published pricing plans." },
      { id: "faqs", icon: "help", label: "FAQs", type: "collection", table: "faqs", desc: "Questions and answers, per page." },
      { id: "portfolio", icon: "image", label: "Portfolio", type: "collection", table: "portfolio", desc: "Work samples and full case studies." },
      { id: "posts", icon: "pen", label: "Blog posts", type: "collection", table: "posts", desc: "Articles for your blog." },
    ]},
    { group: "Site-wide", items: [
      { id: "nav", icon: "menu", label: "Navigation", type: "single", keys: ["nav"], desc: "Top menu links and header buttons." },
      { id: "footer", icon: "layout", label: "Footer", type: "single", keys: ["footer"], desc: "Footer tagline and credit line." },
      { id: "contact", icon: "mail", label: "Contact / NAP", type: "single", keys: ["contact"], desc: "Email, phone, and address used across the site." },
    ]},
    { group: "Inbox", items: [
      { id: "leads", icon: "inbox", label: "Leads", type: "leads", desc: "Every quote and audit request from your site." },
    ]},
  ];
  const ENTRY = {};
  MENU.forEach((g) => g.items.forEach((it) => (ENTRY[it.id] = it)));

  /* ---------------- view helpers ---------------- */
  const view = $("#view");
  function setHeader(entry, crumb) {
    $("#viewIcon").innerHTML = icon(entry.icon);
    $("#viewTitleText").textContent = entry.label;
    $("#crumb").textContent = crumb || "Content Manager";
  }
  function toast(msg, ok = true) {
    const t = el("div", { className: "msg " + (ok ? "ok" : "err") + " show", textContent: msg });
    view.prepend(t);
    setTimeout(() => t.remove(), 3400);
  }
  function loading() { view.innerHTML = '<div class="center"><span class="spinner"></span></div>'; }

  /* ---------------- dashboard ---------------- */
  async function openDashboard() {
    const entry = ENTRY.dash; setHeader(entry, "Overview"); loading();
    const [newLeads, totalLeads, services, posts, testimonials] = await Promise.all([
      count("leads", "status=eq.new"), count("leads"), count("services"), count("posts"), count("testimonials"),
    ]);
    view.textContent = "";
    view.append(el("p", { className: "sub", textContent: "Welcome back. Here's what's happening across your site." }));
    const metric = (ic, big, lbl, accent) =>
      el("div", { className: "metric" + (accent ? " accent" : "") }, [
        el("span", { html: icon(ic) }),
        el("div", { className: "big", textContent: String(big) }),
        el("div", { className: "lbl", textContent: lbl }),
      ]);
    view.append(el("div", { className: "metrics" }, [
      metric("inbox", newLeads, "New leads", true),
      metric("inbox", totalLeads, "Total leads"),
      metric("grid", services, "Services"),
      metric("chat", testimonials, "Testimonials"),
      metric("pen", posts, "Blog posts"),
    ]));
    view.append(el("h3", { textContent: "Jump to", style: "margin:6px 0 14px;font-size:1.1rem" }));
    const quick = el("div", { className: "quick" });
    [["hero", "Edit hero"], ["pricing_tiers", "Edit pricing"], ["testimonials", "Edit testimonials"], ["leads", "View leads"]].forEach(([id, lbl]) => {
      const a = el("a", { href: "#", onclick: (e) => { e.preventDefault(); go(id); } }, [el("span", { html: icon(ENTRY[id].icon) }), el("span", { textContent: lbl })]);
      quick.append(a);
    });
    view.append(quick);
  }

  /* ---------------- singleton / combined screens ---------------- */
  async function openSingle(entry) {
    setHeader(entry, "Homepage"); loading();
    const keys = entry.keys;
    const rows = await (await api(`site_settings?key=in.(${keys.join(",")})&select=key,value`)).json();
    const values = {};
    keys.forEach((k) => (values[k] = (rows.find((r) => r.key === k) || {}).value || {}));
    view.textContent = "";
    view.append(el("p", { className: "sub", textContent: entry.desc }));
    keys.forEach((k) => {
      const def = SINGLETONS[k];
      const card = el("div", { className: "card" });
      if (keys.length > 1) card.append(el("div", { className: "card-title", textContent: def.label }));
      if (def.root) card.append(renderField({ ...def.root, label: def.root.label || def.label }, values[k], (v) => (values[k] = v)));
      else def.fields.forEach((f) => card.append(renderField(f, values[k][f.key], (v) => (values[k][f.key] = v))));
      view.append(card);
    });
    const bar = el("div", { className: "save-bar" });
    const btn = el("button", { className: "btn btn-primary", textContent: "Save changes" });
    btn.onclick = async () => {
      btn.textContent = "Saving…"; btn.disabled = true;
      let ok = true;
      for (const k of keys) {
        const r = await api(`site_settings?key=eq.${k}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ value: values[k] }) });
        if (!r.ok) ok = false;
      }
      btn.textContent = "Save changes"; btn.disabled = false;
      toast(ok ? "Saved — refresh your site to see it live." : "Some changes failed to save.", ok);
    };
    bar.append(btn, el("span", { className: "save-note", textContent: "Changes go live on your site immediately." }));
    view.append(bar);
  }

  /* ---------------- collections ---------------- */
  async function openCollection(entry) {
    const table = entry.table, def = COLLECTIONS[table];
    setHeader(entry, "Content"); loading();
    const rows = await (await api(`${table}?select=*&order=${def.order}.asc`)).json();
    view.textContent = "";
    const head = el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:6px" }, [
      el("p", { className: "sub", style: "margin:0", textContent: entry.desc }),
      el("button", { className: "btn btn-primary btn-sm", textContent: "+ New " + def.singular, onclick: () => editRow(entry, {}, true) }),
    ]);
    view.append(head);
    view.append(el("div", { style: "height:16px" }));
    if (!Array.isArray(rows) || !rows.length) { view.append(el("div", { className: "empty", textContent: "Nothing here yet. Click “+ New " + def.singular + "”." })); return; }
    rows.forEach((row) => {
      const title = row.name || row.client || row.question || row.title || row.slug || "(untitled)";
      const metaBits = [];
      if (row.blurb || row.quote || row.description || row.lead) metaBits.push((row.blurb || row.quote || row.description || row.lead).slice(0, 70));
      const rowEl = el("div", { className: "list-row" }, [
        el("div", { className: "lr-main" }, [
          el("div", { className: "lr-title", textContent: title }),
          metaBits.length ? el("div", { className: "lr-meta", textContent: metaBits[0] }) : null,
        ]),
        el("div", { style: "display:flex;align-items:center;gap:12px;flex-shrink:0" }, [
          el("span", { className: "badge " + (row.visible === false ? "off" : "on"), textContent: row.visible === false ? "Hidden" : "Live" }),
          el("button", { className: "btn btn-ghost btn-sm", textContent: "Edit", onclick: () => editRow(entry, row, false) }),
        ]),
      ]);
      view.append(rowEl);
    });
  }

  function editRow(entry, row, isNew) {
    const table = entry.table, def = COLLECTIONS[table];
    const data = { ...row };
    setHeader(entry, "Content / " + def.label);
    view.textContent = "";
    view.append(el("p", { className: "sub", textContent: (isNew ? "Create a new " : "Editing ") + def.singular + "." }));
    const card = el("div", { className: "card" });
    def.fields.forEach((f) => card.append(renderField(f, data[f.key], (v) => (data[f.key] = v))));
    view.append(card);
    const bar = el("div", { className: "save-bar" });
    const save = el("button", { className: "btn btn-primary", textContent: isNew ? "Create" : "Save changes" });
    save.onclick = async () => {
      save.textContent = "Saving…"; save.disabled = true;
      let r;
      if (isNew) r = await api(table, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(data) });
      else r = await api(`${table}?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(data) });
      if (r.ok) { openCollection(entry); setTimeout(() => toast("Saved."), 60); }
      else { save.textContent = isNew ? "Create" : "Save changes"; save.disabled = false; toast("Save failed: " + (await r.text()).slice(0, 120), false); }
    };
    bar.append(save, el("button", { className: "btn btn-ghost", textContent: "Cancel", onclick: () => openCollection(entry) }));
    if (!isNew) bar.append(el("button", { className: "btn btn-danger", textContent: "Delete", style: "margin-left:auto",
      onclick: async () => {
        if (!confirm("Delete this " + def.singular + " permanently?")) return;
        const r = await api(`${table}?id=eq.${row.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        if (r.ok) { openCollection(entry); setTimeout(() => toast("Deleted."), 60); } else toast("Delete failed", false);
      } }));
    view.append(bar);
  }

  /* ---------------- leads ---------------- */
  async function openLeads() {
    const entry = ENTRY.leads; setHeader(entry, "Inbox"); loading();
    const rows = await (await api("leads?select=*&order=created_at.desc&limit=200")).json();
    view.textContent = "";
    view.append(el("p", { className: "sub", textContent: entry.desc }));
    if (!Array.isArray(rows) || !rows.length) { view.append(el("div", { className: "empty", textContent: "No leads yet — they'll appear here the moment someone submits a form." })); return; }
    const card = el("div", { className: "card" });
    rows.forEach((L) => {
      const sel = el("select", { style: "width:auto;padding:7px 12px" });
      ["new", "contacted", "closed"].forEach((s) => sel.append(el("option", { value: s, textContent: s, selected: L.status === s })));
      sel.onchange = async () => {
        const r = await api(`leads?id=eq.${L.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: sel.value }) });
        toast(r.ok ? "Status updated." : "Update failed", r.ok);
      };
      card.append(el("div", { className: "lead-row" }, [
        el("span", { className: "pill", textContent: L.type }),
        el("div", {}, [
          el("div", {}, [el("strong", { textContent: L.name }), document.createTextNode("  "), el("a", { href: "mailto:" + L.email, textContent: L.email })]),
          el("div", { className: "meta", textContent: [L.website, L.services, (L.created_at || "").slice(0, 10)].filter(Boolean).join(" · ") }),
        ]),
        sel,
      ]));
    });
    view.append(card);
  }

  /* ---------------- router + menu ---------------- */
  function go(id) {
    const entry = ENTRY[id];
    document.querySelectorAll("#navMenu .nav-item").forEach((n) => n.classList.toggle("active", n.dataset.id === id));
    if (entry.type === "dashboard") openDashboard();
    else if (entry.type === "single") openSingle(entry);
    else if (entry.type === "collection") openCollection(entry);
    else if (entry.type === "leads") openLeads();
  }

  async function buildMenu() {
    const menu = $("#navMenu"); menu.textContent = "";
    MENU.forEach((g) => {
      menu.append(el("div", { className: "nav-group", textContent: g.group }));
      g.items.forEach((it) => {
        const b = el("button", { className: "nav-item", dataset: { id: it.id } }, [
          el("span", { html: icon(it.icon) }), el("span", { className: "lbl", textContent: it.label }),
        ]);
        if (it.type === "collection" || it.type === "leads") b.append(el("span", { className: "count", dataset: { c: it.id }, textContent: "" }));
        b.onclick = () => go(it.id);
        menu.append(b);
      });
    });
    // fill counts asynchronously
    const setC = (id, n, hot) => { const s = menu.querySelector(`[data-c="${id}"]`); if (s) { s.textContent = n; if (hot && n > 0) s.classList.add("hot"); } };
    Promise.all([
      count("services"), count("testimonials"), count("pricing_tiers"), count("faqs"), count("portfolio"), count("posts"), count("leads", "status=eq.new"),
    ]).then(([s, t, p, f, pf, po, nl]) => {
      setC("services", s); setC("testimonials", t); setC("pricing_tiers", p); setC("faqs", f); setC("portfolio", pf); setC("posts", po); setC("leads", nl, true);
    }).catch(() => {});
  }

  /* ---------------- boot ---------------- */
  function showApp() {
    $("#login").style.display = "none";
    $("#app").style.display = "grid";
    $("#whoami").textContent = localStorage.getItem("ig_email") || "";
    buildMenu();
    go("dash");
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#loginBtn"), msg = $("#loginMsg");
    btn.textContent = "Signing in…"; btn.disabled = true; msg.className = "msg";
    try { await login($("#email").value.trim(), $("#password").value); showApp(); }
    catch (err) { msg.textContent = err.message; msg.className = "msg err show"; }
    finally { btn.textContent = "Sign in"; btn.disabled = false; }
  });
  $("#logoutBtn").addEventListener("click", () => { store.clear(); location.reload(); });
  if (store.at && store.rt) api("site_settings?key=eq.hero&select=key").then((r) => { if (r.ok) showApp(); }).catch(() => {});
})();
