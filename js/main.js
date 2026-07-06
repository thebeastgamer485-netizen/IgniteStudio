/* =========================================================
   IGNITE STUDIO — Interactions
   Vanilla JS. 21st.dev-style effects, no dependencies.
   ========================================================= */
(function () {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* ---------- Footer year ---------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Page-exit transition (internal page links) ---------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a || prefersReduced) return;
    if (a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = a.getAttribute("href");
    // only animate real page-to-page hops, not on-page anchors or external links
    if (!href || href.startsWith("#") || /^(https?:|mailto:|tel:)/.test(href)) return;
    e.preventDefault();
    document.body.classList.add("page-exit");
    setTimeout(() => { window.location.href = href; }, 220);
  });
  // bfcache restore (back button): make sure the page isn't stuck faded out
  window.addEventListener("pageshow", () => document.body.classList.remove("page-exit"));

  /* ---------- Sticky header state ---------- */
  const header = $("#siteHeader");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Sticky mobile CTA (hidden while the audit form is on screen) ---------- */
  const mobileCta = $("#mobileCta");
  if (mobileCta) {
    const auditSection = $("#audit");
    let auditVisible = false;
    if (auditSection && "IntersectionObserver" in window) {
      new IntersectionObserver((ents) => {
        auditVisible = ents[0].isIntersecting;
        updateCta();
      }, { threshold: 0.1 }).observe(auditSection);
    }
    const updateCta = () => {
      const show = window.scrollY > window.innerHeight * 0.8 && !auditVisible;
      mobileCta.classList.toggle("show", show);
      mobileCta.setAttribute("aria-hidden", String(!show));
    };
    window.addEventListener("scroll", updateCta, { passive: true });
  }

  /* ---------- Mobile nav ---------- */
  const toggle = $("#navToggle");
  const links = $("#navLinks");
  const actions = $(".nav-actions");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      toggle.setAttribute("aria-label", open ? "Open menu" : "Close menu");
      links.classList.toggle("open", !open);
      if (actions) actions.classList.toggle("open", !open);
    });
    // close on link click
    $$("#navLinks a").forEach((a) =>
      a.addEventListener("click", () => {
        toggle.setAttribute("aria-expanded", "false");
        links.classList.remove("open");
        if (actions) actions.classList.remove("open");
      })
    );
  }

  /* ---------- Scroll reveal (staggered) ---------- */
  const revealEls = $$("[data-reveal]");
  revealEls.forEach((el) => {
    const d = el.getAttribute("data-delay");
    if (d) el.style.setProperty("--reveal-delay", d + "ms");
  });
  if (prefersReduced || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---------- Animated counters ---------- */
  const counters = $$("[data-count]");
  const runCounter = (el) => {
    const target = parseFloat(el.getAttribute("data-count"));
    const decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
    const prefix = el.getAttribute("data-prefix") || "";
    const suffix = el.getAttribute("data-suffix") || "";
    const duration = 1600;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const val = target * ease(p);
      el.textContent = prefix + val.toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = prefix + target.toFixed(decimals) + suffix;
    };
    requestAnimationFrame(tick);
  };
  if (prefersReduced || !("IntersectionObserver" in window)) {
    counters.forEach((el) => {
      const decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
      el.textContent =
        (el.getAttribute("data-prefix") || "") +
        parseFloat(el.getAttribute("data-count")).toFixed(decimals) +
        (el.getAttribute("data-suffix") || "");
    });
  } else {
    const cio = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            runCounter(e.target);
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((el) => cio.observe(el));
  }

  /* ---------- Card spotlight (cursor-follow glow) ---------- */
  if (!prefersReduced && window.matchMedia("(pointer: fine)").matches) {
    $$(".spotlight").forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
        card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
      });
    });

    /* ---------- Magnetic buttons ---------- */
    $$(".magnetic").forEach((btn) => {
      const strength = 0.28;
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "";
      });
    });
  }

  /* ---------- Marquee: pause while pointer/touch is on it ---------- */
  const marquee = $(".marquee-wrap");
  if (marquee) {
    const pause = () => marquee.classList.add("is-paused");
    const resume = () => marquee.classList.remove("is-paused");
    // touch devices have no :hover, so drive it explicitly
    marquee.addEventListener("touchstart", pause, { passive: true });
    marquee.addEventListener("touchend", resume, { passive: true });
    marquee.addEventListener("touchcancel", resume, { passive: true });
  }

  /* ---------- Process steps: hover to ignite (left-to-right sweep) ---------- */
  $$(".steps .step").forEach((step) => {
    step.addEventListener("mouseenter", () => {
      step.classList.remove("lit");
      void step.offsetWidth;
      step.classList.add("lit");
    });
  });

  /* ---------- FAQ: single-open accordion ---------- */
  const faqItems = $$(".faq-item");
  faqItems.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (item.open) {
        faqItems.forEach((other) => {
          if (other !== item) other.open = false;
        });
      }
    });
  });

  /* ---------- Hero quote form (asks which services) ---------- */
  const quoteForm = $("#quoteForm");
  const quoteNote = $("#quoteNote");
  if (quoteForm) {
    const successOverlay = $("#quoteSuccess");
    const successHeading = $("#successHeading");
    const successMsg = $("#successMsg");
    const againBtn = $("#quoteAgain");
    const submitBtn = quoteForm.querySelector('button[type="submit"]');
    const submitLabel = submitBtn.querySelector("span");
    const originalLabel = submitLabel.textContent;

    const listServices = (arr) => {
      if (arr.length === 1) return arr[0];
      if (arr.length === 2) return arr[0] + " and " + arr[1];
      return arr.slice(0, -1).join(", ") + ", and " + arr[arr.length - 1];
    };

    quoteForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameEl = $("#q-name");
      const emailEl = $("#q-email");
      const chosen = $$('input[name="services"]:checked', quoteForm).map((c) => c.value);

      if (!nameEl.value.trim() || !emailEl.validity.valid) {
        quoteNote.textContent = "Please add your name and a valid email so we can send your quote.";
        quoteNote.classList.remove("success");
        (!nameEl.value.trim() ? nameEl : emailEl).focus();
        return;
      }
      if (chosen.length === 0) {
        quoteNote.textContent = "Pick at least one service so we know what to quote.";
        quoteNote.classList.remove("success");
        return;
      }
      const first = nameEl.value.trim().split(" ")[0];
      const site = ($("#q-website").value || "").trim().replace(/^https?:\/\//, "");
      const auditBit = site ? ` We'll also audit ${site}.` : "";
      successHeading.textContent = `Thanks, ${first}!`;
      successMsg.textContent = `We'll prepare your custom quote for ${listServices(chosen)} and reply within one business day.${auditBit}`;
      successOverlay.classList.add("visible");
    });

    againBtn.addEventListener("click", () => {
      successOverlay.classList.remove("visible");
      quoteForm.reset();
      submitLabel.textContent = originalLabel;
      quoteNote.textContent = "No spam, ever. Free audit included with every quote.";
      quoteNote.classList.remove("success");
    });
  }

  /* ---------- Audit form ---------- */
  const form = $("#auditForm");
  const note = $("#formNote");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = $("#email");
      if (!form.checkValidity()) {
        note.textContent = "Please add your name and a valid email so we can reach you.";
        note.classList.remove("success");
        (email.validity.valid ? $("#name") : email).focus();
        return;
      }
      const name = ($("#name").value || "there").trim().split(" ")[0];
      note.textContent = `Thanks, ${name}! Your free audit request is in. We'll reply within one business day. 🔥`;
      note.classList.add("success");
      form.querySelector('button[type="submit"] span').textContent = "Request Received ✓";
      form.querySelectorAll("input").forEach((i) => (i.disabled = true));
    });
  }

  /* ---------- Ember particle canvas (hero) ---------- */
  const canvas = $("#emberCanvas");
  if (canvas && !prefersReduced) {
    const ctx = canvas.getContext("2d");
    let w, h, embers, raf;
    const COUNT = 46;

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const rand = (a, b) => a + Math.random() * (b - a);
    const makeEmber = (fromBottom) => ({
      x: rand(0, w),
      y: fromBottom ? h + rand(0, 40) : rand(0, h),
      r: rand(0.8, 2.6),
      vy: rand(0.25, 0.9),
      vx: rand(-0.25, 0.25),
      life: rand(0.3, 1),
      hue: rand(18, 40),
    });

    const init = () => {
      resize();
      embers = Array.from({ length: COUNT }, () => makeEmber(false));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      embers.forEach((p, i) => {
        p.y -= p.vy;
        p.x += p.vx + Math.sin(p.y * 0.01) * 0.15;
        p.life -= 0.0015;
        if (p.y < -10 || p.life <= 0) embers[i] = makeEmber(true);
        const alpha = Math.max(0, Math.min(1, p.life)) * 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 55%, ${alpha})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsla(${p.hue}, 100%, 55%, ${alpha})`;
        ctx.fill();
      });
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };

    init();
    draw();

    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(resize, 150);
    });

    // pause when hero not visible (perf)
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((ents) => {
        ents.forEach((en) => {
          if (en.isIntersecting) { if (!raf) draw(); }
          else { cancelAnimationFrame(raf); raf = null; }
        });
      }, { threshold: 0 }).observe(canvas.parentElement);
    }
  }

  /* ---------- Work carousel (auto-rotate every 5s) ---------- */
  const carousel = $(".work-carousel");
  if (carousel) {
    const track = $(".work-track", carousel);
    const dotsWrap = $(".work-dots", carousel);
    const cards = $$(".work-card", track);
    const total = cards.length;

    function getVisible() {
      const w = carousel.offsetWidth;
      if (w <= 520) return 1;
      if (w <= 720) return 2;
      return 3;
    }

    let current = 0;
    let interval;

    function buildDots() {
      const vis = getVisible();
      const count = Math.max(1, total - vis + 1);
      dotsWrap.innerHTML = "";
      for (let i = 0; i < count; i++) {
        const btn = document.createElement("button");
        btn.className = "work-dot" + (i === current ? " active" : "");
        btn.setAttribute("aria-label", "Show result " + (i + 1));
        btn.addEventListener("click", function () { goTo(i); resetTimer(); });
        dotsWrap.appendChild(btn);
      }
    }

    function offsetFor(idx) {
      const vis = getVisible();
      const gap = 22;
      const cardWidth = (carousel.offsetWidth - gap * (vis - 1)) / vis;
      return -(cardWidth + gap) * idx;
    }

    function goTo(idx) {
      const vis = getVisible();
      const maxIdx = Math.max(0, total - vis);
      current = Math.max(0, Math.min(idx, maxIdx));
      track.style.transform = "translateX(" + offsetFor(current) + "px)";
      $$(".work-dot", dotsWrap).forEach(function (d, i) {
        d.classList.toggle("active", i === current);
      });
    }

    function advance() {
      const vis = getVisible();
      const maxIdx = Math.max(0, total - vis);
      goTo(current >= maxIdx ? 0 : current + 1);
    }

    function resetTimer() {
      clearInterval(interval);
      if (!prefersReduced) interval = setInterval(advance, 5000);
    }

    buildDots();
    goTo(0);
    resetTimer();

    carousel.addEventListener("mouseenter", function () { clearInterval(interval); });
    carousel.addEventListener("mouseleave", resetTimer);

    /* Touch swipe (mobile): the track follows the finger, then snaps */
    let touchX = null;
    let dragDx = 0;

    carousel.addEventListener("touchstart", function (e) {
      touchX = e.touches[0].clientX;
      dragDx = 0;
      clearInterval(interval);
      track.style.transition = "none";
    }, { passive: true });

    carousel.addEventListener("touchmove", function (e) {
      if (touchX === null) return;
      dragDx = e.touches[0].clientX - touchX;
      const maxIdx = Math.max(0, total - getVisible());
      // rubber-band resistance when dragging past the first/last slide
      if ((current === 0 && dragDx > 0) || (current === maxIdx && dragDx < 0)) {
        dragDx *= 0.35;
      }
      track.style.transform = "translateX(" + (offsetFor(current) + dragDx) + "px)";
    }, { passive: true });

    carousel.addEventListener("touchend", function () {
      if (touchX === null) return;
      track.style.transition = "";
      // swipe far enough (25% of a card) to change slide; otherwise snap back
      const threshold = carousel.offsetWidth / getVisible() * 0.25;
      if (Math.abs(dragDx) > threshold) goTo(dragDx < 0 ? current + 1 : current - 1);
      else goTo(current);
      touchX = null;
      dragDx = 0;
      resetTimer();
    }, { passive: true });

    let resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { buildDots(); goTo(current); }, 150);
    });
  }
})();
