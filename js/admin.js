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
      else if (k === "style" && typeof v === "string") n.setAttribute("style", v);
      else n[k] = v;
    }
    (Array.isArray(kids) ? kids : [kids]).forEach((k) => k != null && n.append(k));
    return n;
  };

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
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.msg || "Login failed");
    store.save(j);
    return j;
  }

  async function refresh() {
    const r = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: store.rt }),
    });
    if (!r.ok) return false;
    store.save(await r.json());
    return true;
  }

  // authorized REST call with one automatic token refresh on 401
  async function api(path, opts = {}, retry = true) {
    const res = await fetch(`${URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${store.at}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401 && retry && (await refresh())) return api(path, opts, false);
    return res;
  }

  /* ---------------- field renderer ---------------- */
  // kinds: text, textarea, number, bool, date, list (string[]), objlist, json
  function renderField(f, value, onChange) {
    const id = "f_" + Math.random().toString(36).slice(2, 8);
    const wrap = el("div", { className: "field" });
    if (f.kind !== "bool") wrap.append(el("label", { htmlFor: id, textContent: f.label }));

    let input;
    if (f.kind === "textarea" || f.kind === "json") {
      const v = f.kind === "json" ? JSON.stringify(value ?? (f.arr ? [] : {}), null, 2) : (value ?? "");
      input = el("textarea", { id, value: v, rows: f.rows || (f.kind === "json" ? 6 : 3) });
      if (f.big) input.style.minHeight = "260px";
      input.addEventListener("input", () => {
        if (f.kind === "json") {
          try { onChange(JSON.parse(input.value)); input.style.borderColor = ""; }
          catch { input.style.borderColor = "var(--err)"; }
        } else onChange(input.value);
      });
    } else if (f.kind === "bool") {
      input = el("input", { id, type: "checkbox", checked: !!value });
      input.addEventListener("change", () => onChange(input.checked));
      wrap.append(el("label", { className: "toggle", htmlFor: id }, [input, document.createTextNode(" " + f.label)]));
      if (f.hint) wrap.append(el("div", { className: "hint", textContent: f.hint }));
      return wrap;
    } else if (f.kind === "number") {
      input = el("input", { id, type: "number", value: value ?? "" });
      input.addEventListener("input", () => onChange(input.value === "" ? null : Number(input.value)));
    } else if (f.kind === "date") {
      input = el("input", { id, type: "date", value: value ?? "" });
      input.addEventListener("input", () => onChange(input.value));
    } else if (f.kind === "list") {
      // array of strings, one per line
      input = el("textarea", { id, value: (value || []).join("\n"), rows: Math.max(3, (value || []).length) });
      input.addEventListener("input", () =>
        onChange(input.value.split("\n").map((s) => s.trim()).filter(Boolean))
      );
      wrap.append(input);
      wrap.append(el("div", { className: "hint", textContent: f.hint || "One per line." }));
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
        box.append(el("button", {
          className: "btn btn-danger btn-sm rm", textContent: "Remove", type: "button",
          onclick: () => { state.splice(i, 1); onChange([...state]); paint(); },
        }));
        f.item.forEach((sub) => {
          box.append(renderField(sub, item[sub.key], (v) => { item[sub.key] = v; onChange([...state]); }));
        });
        list.append(box);
      });
    };
    paint();
    wrap.append(list);
    wrap.append(el("button", {
      className: "btn btn-ghost btn-sm", textContent: "+ Add", type: "button",
      onclick: () => { state.push({}); onChange([...state]); paint(); },
    }));
    return wrap;
  }

  /* ---------------- content schema ---------------- */
  // Singletons live in site_settings (one jsonb row each).
  // ROOT means the field binds to the whole value (arrays like stats/marquee).
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
    stats: { label: "Stats bar", root: { kind: "objlist", item: [
      { key: "prefix", label: "Prefix", kind: "text" }, { key: "value", label: "Number", kind: "text" },
      { key: "suffix", label: "Suffix", kind: "text" }, { key: "decimals", label: "Decimals", kind: "number" },
      { key: "label", label: "Label", kind: "text" },
    ]}},
    marquee: { label: "Marquee ticker", root: { kind: "list", hint: "Each phrase scrolls in the orange band." } },
    process: { label: "Process section", fields: [
      { key: "title_pre", label: "Title — plain", kind: "text" },
      { key: "title_accent", label: "Title — accent", kind: "text" },
      { key: "steps", label: "Steps", kind: "objlist", item: [
        { key: "h", label: "Step title", kind: "text" }, { key: "p", label: "Step text", kind: "textarea" },
      ]},
    ]},
    section_services: { label: "Services heading", fields: [
      { key: "title_pre", label: "Title — plain", kind: "text" }, { key: "title_accent", label: "Title — accent", kind: "text" },
      { key: "lead", label: "Lead paragraph", kind: "textarea" },
    ]},
    section_work: { label: "Work heading", fields: [
      { key: "title_pre", label: "Title — plain", kind: "text" }, { key: "title_accent", label: "Title — accent", kind: "text" },
      { key: "lead", label: "Lead", kind: "text" }, { key: "cta", label: "CTA button", kind: "text" },
    ]},
    section_pricing: { label: "Pricing heading", fields: [
      { key: "title_pre", label: "Title — plain", kind: "text" }, { key: "title_accent", label: "Title — accent", kind: "text" },
      { key: "lead", label: "Lead", kind: "textarea" }, { key: "note", label: "Footnote", kind: "textarea" },
    ]},
    section_reviews: { label: "Testimonials heading", fields: [{ key: "title", label: "Title", kind: "text" }] },
    section_faq: { label: "FAQ heading", fields: [{ key: "title", label: "Title", kind: "text" }] },
    founder_note: { label: "Founder note", fields: [
      { key: "initials", label: "Avatar initials", kind: "text" },
      { key: "quote", label: "Quote", kind: "textarea" },
      { key: "name", label: "Name", kind: "text" }, { key: "role", label: "Role", kind: "text" },
    ]},
    cta: { label: "Final CTA band", fields: [
      { key: "title_pre", label: "Title — plain", kind: "text" }, { key: "title_accent", label: "Title — accent", kind: "text" },
      { key: "title_post", label: "Title — after accent", kind: "text" }, { key: "lead", label: "Lead", kind: "textarea" },
    ]},
    nav: { label: "Navigation", fields: [
      { key: "links", label: "Menu links", kind: "objlist", item: [
        { key: "label", label: "Label", kind: "text" }, { key: "href", label: "Link", kind: "text" },
      ]},
      { key: "cta_ghost", label: "Ghost button", kind: "text" }, { key: "cta_primary", label: "Primary button", kind: "text" },
    ]},
    footer: { label: "Footer", fields: [
      { key: "tagline", label: "Tagline", kind: "textarea" }, { key: "made", label: "Made-with line", kind: "text" },
    ]},
    contact: { label: "Contact / NAP", fields: [
      { key: "email", label: "Email", kind: "text" }, { key: "phone_display", label: "Phone (shown)", kind: "text" },
      { key: "phone_href", label: "Phone (tel: link)", kind: "text" }, { key: "address", label: "Address", kind: "text" },
    ]},
  };

  const COLLECTIONS = {
    services: { label: "Services", singular: "service", order: "sort_order", fields: [
      { key: "sort_order", label: "Order", kind: "number" }, { key: "visible", label: "Visible on site", kind: "bool" },
      { key: "name", label: "Name", kind: "text" }, { key: "blurb", label: "Homepage card blurb", kind: "textarea" },
      { key: "slug", label: "URL slug", kind: "text", hint: "Page filename without .html" },
      { key: "h1", label: "Page headline", kind: "text" },
      { key: "title", label: "SEO title", kind: "text" }, { key: "meta_description", label: "SEO description", kind: "textarea" },
      { key: "intro", label: "Intro paragraphs", kind: "list" }, { key: "pricing", label: "Pricing paragraph", kind: "textarea" },
      { key: "process", label: "Process steps (advanced)", kind: "json", arr: true },
      { key: "includes", label: "What's included (advanced)", kind: "json", arr: true },
      { key: "faqs", label: "FAQs (advanced)", kind: "json", arr: true },
    ]},
    testimonials: { label: "Testimonials", singular: "testimonial", order: "sort_order", fields: [
      { key: "sort_order", label: "Order", kind: "number" }, { key: "visible", label: "Visible", kind: "bool" },
      { key: "name", label: "Name", kind: "text" }, { key: "role", label: "Role / company", kind: "text" },
      { key: "quote", label: "Quote", kind: "textarea" }, { key: "rating", label: "Stars (1-5)", kind: "number" },
    ]},
    pricing_tiers: { label: "Pricing tiers", singular: "tier", order: "sort_order", fields: [
      { key: "sort_order", label: "Order", kind: "number" }, { key: "visible", label: "Visible", kind: "bool" },
      { key: "name", label: "Plan name", kind: "text" }, { key: "price", label: "Price", kind: "text" },
      { key: "cadence", label: "Cadence", kind: "text" }, { key: "description", label: "Description", kind: "textarea" },
      { key: "features", label: "Features", kind: "list" }, { key: "featured", label: "Highlight as ‘most popular’", kind: "bool" },
      { key: "cta_label", label: "Button label", kind: "text" },
    ]},
    faqs: { label: "FAQs", singular: "FAQ", order: "sort_order", fields: [
      { key: "page", label: "Page (home / service slug)", kind: "text" }, { key: "sort_order", label: "Order", kind: "number" },
      { key: "visible", label: "Visible", kind: "bool" }, { key: "question", label: "Question", kind: "text" },
      { key: "answer", label: "Answer", kind: "textarea" },
    ]},
    portfolio: { label: "Portfolio / cases", singular: "project", order: "sort_order", fields: [
      { key: "sort_order", label: "Order", kind: "number" }, { key: "visible", label: "Visible", kind: "bool" },
      { key: "client", label: "Client name", kind: "text" }, { key: "tag", label: "Tag", kind: "text" },
      { key: "image", label: "Image path", kind: "text" }, { key: "image_alt", label: "Image alt text", kind: "text" },
      { key: "blurb", label: "Card blurb", kind: "textarea" }, { key: "metric", label: "Headline metric", kind: "text" },
      { key: "slug", label: "Case study slug", kind: "text" },
      { key: "case_h1", label: "Case headline", kind: "text" }, { key: "case_lead", label: "Case intro", kind: "textarea" },
      { key: "case_stats", label: "Case stats (advanced)", kind: "json", arr: true },
      { key: "case_sections", label: "Case sections (advanced)", kind: "json", arr: true },
      { key: "case_quote", label: "Case quote (advanced)", kind: "json" },
    ]},
    posts: { label: "Blog posts", singular: "post", order: "sort_order", fields: [
      { key: "sort_order", label: "Order", kind: "number" }, { key: "visible", label: "Published", kind: "bool" },
      { key: "title", label: "SEO title", kind: "text" }, { key: "h1", label: "Headline", kind: "text" },
      { key: "slug", label: "URL slug", kind: "text" }, { key: "meta_description", label: "SEO description", kind: "textarea" },
      { key: "tag", label: "Tag", kind: "text" }, { key: "read_time", label: "Read time", kind: "text" },
      { key: "author_name", label: "Author", kind: "text" }, { key: "author_role", label: "Author role", kind: "text" },
      { key: "published_at", label: "Published date", kind: "date" },
      { key: "lead", label: "Lead paragraph", kind: "textarea" },
      { key: "body_html", label: "Body (HTML)", kind: "textarea", big: true },
    ]},
  };

  /* ---------------- views ---------------- */
  const view = $("#view");
  let current = null;

  function toast(msg, ok = true) {
    const t = el("div", { className: "msg " + (ok ? "ok" : "err") + " show", textContent: msg });
    view.prepend(t);
    setTimeout(() => t.remove(), 3200);
  }

  async function openSingleton(key) {
    current = "s:" + key;
    const def = SINGLETONS[key];
    view.textContent = "";
    view.append(el("div", { className: "topbar" }, el("h2", { textContent: def.label })));
    view.append(el("p", { className: "sub", textContent: "Edit the " + def.label.toLowerCase() + " shown on your live site." }));

    const rows = await (await api(`site_settings?key=eq.${key}&select=value`)).json();
    let value = (rows[0] && rows[0].value) || {};
    const card = el("div", { className: "card" });

    if (def.root) {
      card.append(renderField({ ...def.root, label: def.label }, value, (v) => { value = v; }));
    } else {
      def.fields.forEach((f) => card.append(renderField(f, value[f.key], (v) => { value[f.key] = v; })));
    }
    view.append(card);

    const bar = el("div", { className: "save-bar" });
    const btn = el("button", { className: "btn btn-primary", textContent: "Save changes" });
    btn.onclick = async () => {
      btn.textContent = "Saving…"; btn.disabled = true;
      const r = await api(`site_settings?key=eq.${key}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ value }) });
      btn.textContent = "Save changes"; btn.disabled = false;
      if (r.ok) toast("Saved. Refresh your site to see it live."); else toast("Save failed (" + r.status + ")", false);
    };
    bar.append(btn, el("a", { className: "btn btn-ghost", href: "index.html", target: "_blank", rel: "noopener", textContent: "Preview site ↗" }));
    view.append(bar);
  }

  async function openCollection(table) {
    current = "c:" + table;
    const def = COLLECTIONS[table];
    view.textContent = "";
    const bar = el("div", { className: "section-actions" });
    const addBtn = el("button", { className: "btn btn-primary btn-sm", textContent: "+ New " + def.singular });
    bar.append(addBtn);
    view.append(el("div", { className: "topbar" }, [el("h2", { textContent: def.label }), bar]));
    view.append(el("p", { className: "sub", textContent: "Add, edit, reorder, hide, or delete. Lower ‘Order’ shows first." }));

    const rows = await (await api(`${table}?select=*&order=${def.order}.asc`)).json();
    addBtn.onclick = () => editRow(table, {}, true);
    if (!rows.length) { view.append(el("div", { className: "empty", textContent: "Nothing here yet. Click ‘+ New " + def.singular + "’." })); return; }
    rows.forEach((row) => {
      const head = el("div", { className: "card-head" }, [
        el("h3", { textContent: row.name || row.client || row.question || row.title || row.slug || "(untitled)" }),
        el("div", { className: "section-actions" }, [
          el("span", { className: "tag", textContent: (row.visible ? "" : "hidden · ") + "order " + row[def.order] }),
          el("button", { className: "btn btn-ghost btn-sm", textContent: "Edit", onclick: () => editRow(table, row, false) }),
        ]),
      ]);
      view.append(el("div", { className: "card" }, head));
    });
  }

  function editRow(table, row, isNew) {
    const def = COLLECTIONS[table];
    const data = { ...row };
    view.textContent = "";
    view.append(el("div", { className: "topbar" }, el("h2", { textContent: (isNew ? "New " : "Edit ") + def.singular })));
    const card = el("div", { className: "card" });
    def.fields.forEach((f) => card.append(renderField(f, data[f.key], (v) => { data[f.key] = v; })));
    view.append(card);

    const bar = el("div", { className: "save-bar" });
    const save = el("button", { className: "btn btn-primary", textContent: isNew ? "Create" : "Save changes" });
    save.onclick = async () => {
      save.textContent = "Saving…"; save.disabled = true;
      let r;
      if (isNew) r = await api(table, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(data) });
      else r = await api(`${table}?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(data) });
      if (r.ok) { toast("Saved."); openCollection(table); }
      else { save.textContent = isNew ? "Create" : "Save changes"; save.disabled = false; toast("Save failed: " + (await r.text()).slice(0, 120), false); }
    };
    bar.append(save, el("button", { className: "btn btn-ghost", textContent: "Cancel", onclick: () => openCollection(table) }));
    if (!isNew) bar.append(el("button", {
      className: "btn btn-danger", textContent: "Delete", style: "margin-left:auto",
      onclick: async () => {
        if (!confirm("Delete this " + def.singular + " permanently?")) return;
        const r = await api(`${table}?id=eq.${row.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        if (r.ok) { toast("Deleted."); openCollection(table); } else toast("Delete failed", false);
      },
    }));
    view.append(bar);
  }

  async function openLeads() {
    current = "leads";
    view.textContent = "";
    view.append(el("div", { className: "topbar" }, el("h2", { textContent: "Leads inbox" })));
    view.append(el("p", { className: "sub", textContent: "Every quote and audit request submitted on your site." }));
    const rows = await (await api("leads?select=*&order=created_at.desc&limit=200")).json();
    if (!Array.isArray(rows) || !rows.length) { view.append(el("div", { className: "empty", textContent: "No leads yet." })); return; }
    const card = el("div", { className: "card" });
    rows.forEach((L) => {
      const sel = el("select", { style: "width:auto;padding:6px 10px" });
      ["new", "contacted", "closed"].forEach((s) => sel.append(el("option", { value: s, textContent: s, selected: L.status === s })));
      sel.onchange = async () => {
        const r = await api(`leads?id=eq.${L.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: sel.value }) });
        toast(r.ok ? "Status updated." : "Update failed", r.ok);
      };
      const date = (L.created_at || "").slice(0, 10);
      card.append(el("div", { className: "lead-row" }, [
        el("span", { className: "pill", textContent: L.type }),
        el("div", {}, [
          el("div", {}, [el("strong", { textContent: L.name }), document.createTextNode("  "), el("a", { href: "mailto:" + L.email, textContent: L.email })]),
          el("div", { className: "meta", textContent: [L.website, L.services, date].filter(Boolean).join(" · ") }),
        ]),
        sel,
      ]));
    });
    view.append(card);
  }

  /* ---------------- menu ---------------- */
  function buildMenu() {
    const menu = $("#navMenu");
    menu.textContent = "";
    const group = (title, items, handler) => {
      menu.append(el("div", { className: "nav-group", textContent: title }));
      items.forEach(([key, label]) => {
        const b = el("button", { className: "nav-item", dataset: { id: key } }, el("span", { textContent: label }));
        b.onclick = () => { setActive(b); handler(key); };
        menu.append(b);
      });
    };
    group("Homepage", Object.entries(SINGLETONS).filter(([k]) => !["nav", "footer", "contact"].includes(k)).map(([k, d]) => [k, d.label]), openSingleton);
    group("Content", Object.entries(COLLECTIONS).map(([k, d]) => [k, d.label]), openCollection);
    group("Site-wide", [["nav", "Navigation"], ["footer", "Footer"], ["contact", "Contact / NAP"]], openSingleton);
    const lg = el("div"); menu.append(lg);
    lg.append(el("div", { className: "nav-group", textContent: "Inbox" }));
    const lb = el("button", { className: "nav-item" }, el("span", { textContent: "Leads" }));
    lb.onclick = () => { setActive(lb); openLeads(); };
    lg.append(lb);
  }
  function setActive(btn) {
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
    btn.classList.add("active");
  }

  /* ---------------- boot ---------------- */
  function showApp() {
    $("#login").style.display = "none";
    $("#app").style.display = "grid";
    $("#whoami").textContent = localStorage.getItem("ig_email") || "";
    buildMenu();
    const first = document.querySelector(".nav-item");
    if (first) { setActive(first); openSingleton("hero"); }
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#loginBtn"), msg = $("#loginMsg");
    btn.textContent = "Signing in…"; btn.disabled = true; msg.className = "msg";
    try {
      await login($("#email").value.trim(), $("#password").value);
      showApp();
    } catch (err) {
      msg.textContent = err.message; msg.className = "msg err show";
    } finally { btn.textContent = "Sign in"; btn.disabled = false; }
  });

  $("#logoutBtn").addEventListener("click", () => { store.clear(); location.reload(); });

  // resume an existing session
  if (store.at && store.rt) {
    api("site_settings?key=eq.hero&select=key").then((r) => {
      if (r.ok) showApp();
    }).catch(() => {});
  }
})();
