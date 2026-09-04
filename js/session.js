// localStorage session persistence + shared nav auth state, used by every page.
const SonarSession = (() => {
  const STORAGE_KEY = "sonar.session";

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function save(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // Returns a session with a live access token, refreshing it first if it's near expiry.
  // Returns null if there's no session or the refresh token itself has expired.
  async function getValid() {
    let session = load();
    if (!session) return null;

    if (Date.now() >= session.expiresAtUtc - 30000) {
      const result = await SonarApi.refreshSession(session.refreshToken);
      if (!result.success) {
        clear();
        return null;
      }
      session = result.session;
      save(session);
    }
    return session;
  }

  return { load, save, clear, getValid };
})();

// Wires up the shared header nav (index.html + account.html both include #site-nav-auth).
document.addEventListener("DOMContentLoaded", async () => {
  const slot = document.getElementById("site-nav-auth");
  if (!slot) return;

  const session = await SonarSession.getValid();
  if (!session) {
    slot.innerHTML = `<a class="btn btn-ghost" href="account.html">Sign In</a>`;
    return;
  }

  const result = await SonarApi.getProfile(session);
  if (!result.success) {
    slot.innerHTML = `<a class="btn btn-ghost" href="account.html">Sign In</a>`;
    return;
  }

  slot.innerHTML = `<a class="btn btn-ghost" href="account.html">${escapeHtml(
    result.profile.displayName || result.profile.username
  )}</a>`;
});

// Mobile hamburger menu — same #nav-toggle/#nav-links pair on every page's shared nav markup.
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  if (!toggle || !links) return;

  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // Closing on link click means the dropdown doesn't stay open behind whatever page/section
  // navigating to it just brought into view.
  links.addEventListener("click", (event) => {
    if (event.target.tagName === "A") {
      links.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
});

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
