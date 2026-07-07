/* =========================================================
   Ignite Studio CMS — shared Supabase config + tiny REST client.
   Public (anon) key only: read-only for content, insert-only for leads.
   All writes require an admin JWT (login), enforced by RLS on the server.
   ========================================================= */
window.IGNITE_CMS = (function () {
  "use strict";
  const URL = "https://wrzxuzomomssducxjvth.supabase.co";
  const ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indyenh1em9tb21zc2R1Y3hqdnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzOTEyNDUsImV4cCI6MjA5ODk2NzI0NX0.Y5srsT0lmO7oTf-iIYabZc962rtAJNv22OLrRLBnRY8";

  // read helper (uses anon key; RLS allows public select on content tables)
  async function read(path) {
    const r = await fetch(`${URL}/rest/v1/${path}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    if (!r.ok) throw new Error(`read ${path}: ${r.status}`);
    return r.json();
  }

  return { URL, ANON, read };
})();
