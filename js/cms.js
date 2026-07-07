/* =========================================================
   Ignite Studio — public content hydration.
   Reads published content from Supabase (anon, read-only) and updates
   the page in place, so edits made in the CMS appear live. The static
   HTML remains the crawlable/no-JS baseline; this only enhances it.
   ========================================================= */
(function () {
  "use strict";
  if (!window.IGNITE_CMS) return;
  const { read } = window.IGNITE_CMS;
  const esc = (s) => String(s == null ? "" : s);

  // set text on every [data-cms="key.path"] from the settings map
  function hydrateText(settings) {
    document.querySelectorAll("[data-cms]").forEach((node) => {
      const [key, ...rest] = node.getAttribute("data-cms").split(".");
      let val = settings[key];
      for (const p of rest) val = val && typeof val === "object" ? val[p] : val;
      if (typeof val === "string" && val.length) node.textContent = val;
    });
    // headings built from {title_pre, title_accent[, title_post]}
    document.querySelectorAll("[data-cms-heading]").forEach((h) => {
      const v = settings[h.getAttribute("data-cms-heading")];
      if (!v) return;
      const parts = [];
      if (v.title_pre != null) parts.push(document.createTextNode(v.title_pre));
      if (v.title_accent != null) {
        const s = document.createElement("span");
        s.className = "fire-text";
        s.textContent = v.title_accent;
        parts.push(s);
      }
      if (v.title_post != null) parts.push(document.createTextNode(v.title_post));
      if (parts.length) { h.textContent = ""; parts.forEach((p) => h.append(p)); }
    });
  }

  function renderTestimonials(rows) {
    const box = document.querySelector(".reviews");
    if (!box || !rows.length) return;
    box.innerHTML = "";
    rows.forEach((r) => {
      const fig = document.createElement("figure");
      fig.className = "review reveal in";
      const stars = "★".repeat(Math.max(1, Math.min(5, r.rating || 5)));
      fig.innerHTML =
        `<div class="stars" aria-label="${r.rating || 5} out of 5 stars">${stars}</div>` +
        `<blockquote></blockquote>` +
        `<figcaption><strong></strong><span></span></figcaption>`;
      fig.querySelector("blockquote").textContent = esc(r.quote);
      fig.querySelector("strong").textContent = esc(r.name);
      fig.querySelector("figcaption span").textContent = esc(r.role);
      box.append(fig);
    });
  }

  function renderPricing(rows) {
    const box = document.querySelector(".pricing-grid");
    if (!box || !rows.length) return;
    box.innerHTML = "";
    rows.forEach((t) => {
      const card = document.createElement("article");
      card.className = "price-card reveal in" + (t.featured ? " price-card--featured" : "");
      if (t.featured) {
        const flag = document.createElement("span");
        flag.className = "price-flag";
        flag.textContent = "Most popular";
        card.append(flag);
      }
      const h3 = document.createElement("h3"); h3.textContent = esc(t.name); card.append(h3);
      const amt = document.createElement("div"); amt.className = "price-amount";
      amt.textContent = esc(t.price);
      const small = document.createElement("small"); small.textContent = esc(t.cadence); amt.append(small);
      card.append(amt);
      const desc = document.createElement("p"); desc.className = "price-desc"; desc.textContent = esc(t.description); card.append(desc);
      const ul = document.createElement("ul"); ul.className = "price-list";
      (t.features || []).forEach((f) => { const li = document.createElement("li"); li.textContent = esc(f); ul.append(li); });
      card.append(ul);
      const a = document.createElement("a");
      a.className = "btn " + (t.featured ? "btn-primary" : "btn-outline");
      a.href = "#audit";
      if (t.featured) { const s = document.createElement("span"); s.textContent = esc(t.cta_label || "Start with a free audit"); a.append(s); }
      else a.textContent = esc(t.cta_label || "Start with a free audit");
      card.append(a);
      box.append(card);
    });
  }

  function renderFaqs(rows) {
    const box = document.querySelector("#faq .faq");
    if (!box || !rows.length) return;
    box.innerHTML = "";
    rows.forEach((f) => {
      const d = document.createElement("details");
      d.className = "faq-item reveal in";
      const sum = document.createElement("summary"); sum.textContent = esc(f.question);
      const ans = document.createElement("div"); ans.className = "faq-answer";
      const p = document.createElement("p"); p.textContent = esc(f.answer); ans.append(p);
      d.append(sum, ans);
      box.append(d);
    });
    // preserve single-open accordion behaviour on the fresh nodes
    const items = Array.from(box.querySelectorAll(".faq-item"));
    items.forEach((item) =>
      item.addEventListener("toggle", () => {
        if (item.open) items.forEach((o) => { if (o !== item) o.open = false; });
      })
    );
  }

  Promise.allSettled([
    read("site_settings?select=key,value"),
    read("testimonials?select=*&visible=eq.true&order=sort_order.asc"),
    read("pricing_tiers?select=*&visible=eq.true&order=sort_order.asc"),
    read("faqs?select=*&visible=eq.true&page=eq.home&order=sort_order.asc"),
  ]).then(([s, t, p, f]) => {
    if (s.status === "fulfilled") {
      const map = {};
      s.value.forEach((r) => (map[r.key] = r.value));
      try { hydrateText(map); } catch (e) {}
    }
    if (t.status === "fulfilled") try { renderTestimonials(t.value); } catch (e) {}
    if (p.status === "fulfilled") try { renderPricing(p.value); } catch (e) {}
    if (f.status === "fulfilled") try { renderFaqs(f.value); } catch (e) {}
  });
})();
