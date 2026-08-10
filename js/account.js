// account.html page logic: login/register/verify/forgot-password panels + signed-in dashboard.
(() => {
  const authShell = document.getElementById("auth-shell");
  const dashboardShell = document.getElementById("dashboard-shell");
  const alertBox = document.getElementById("alert-box");

  const panels = {
    tabs: document.getElementById("auth-tabs"),
    verify: document.getElementById("verify-panel"),
    forgot: document.getElementById("forgot-panel"),
    reset: document.getElementById("reset-panel"),
  };

  function showPanel(name) {
    Object.values(panels).forEach((el) => el.classList.add("hidden"));
    panels[name].classList.remove("hidden");
    clearAlert();
  }

  function showAlert(message, kind = "error") {
    alertBox.innerHTML = `<div class="alert alert-${kind}">${escapeHtml(message)}</div>`;
  }

  function clearAlert() {
    alertBox.innerHTML = "";
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function setBusy(button, busy, busyLabel) {
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = busyLabel;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalLabel || button.textContent;
      button.disabled = false;
    }
  }

  // -- Tab switching (login/register) ------------------------------------------------------

  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  function activateTab(tab) {
    const isLogin = tab === "login";
    tabLogin.classList.toggle("active", isLogin);
    tabRegister.classList.toggle("active", !isLogin);
    loginForm.classList.toggle("hidden", !isLogin);
    registerForm.classList.toggle("hidden", isLogin);
    clearAlert();
  }

  tabLogin.addEventListener("click", () => activateTab("login"));
  tabRegister.addEventListener("click", () => activateTab("register"));

  if (window.location.hash === "#register") activateTab("register");

  // -- Login ----------------------------------------------------------------------------

  let pendingVerifyEmail = null;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();
    const submitBtn = loginForm.querySelector("button[type=submit]");
    setBusy(submitBtn, true, "Signing in…");

    const identifier = document.getElementById("login-identifier").value.trim();
    const password = document.getElementById("login-password").value;

    const result = await SonarApi.login(identifier, password);
    setBusy(submitBtn, false);

    if (!result.success) {
      if (result.kind === "EmailNotVerified") {
        pendingVerifyEmail = result.email || identifier;
        beginVerify(pendingVerifyEmail);
        return;
      }
      showAlert(result.message);
      return;
    }

    SonarSession.save(result.session);
    await renderDashboard();
  });

  // -- Register ----------------------------------------------------------------------------

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();
    const submitBtn = registerForm.querySelector("button[type=submit]");
    setBusy(submitBtn, true, "Creating account…");

    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;

    const result = await SonarApi.register(username, email, password);
    setBusy(submitBtn, false);

    if (!result.success) {
      showAlert(result.message);
      return;
    }

    pendingVerifyEmail = email;
    beginVerify(email);
  });

  // -- Verify (signup code) --------------------------------------------------------------

  function beginVerify(email) {
    document.getElementById("verify-email-label").textContent = email;
    document.getElementById("verify-code").value = "";
    showPanel("verify");
  }

  document.getElementById("verify-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();
    const submitBtn = e.target.querySelector("button[type=submit]");
    setBusy(submitBtn, true, "Verifying…");

    const code = document.getElementById("verify-code").value.trim();
    const result = await SonarApi.verify(pendingVerifyEmail, code, "signup");
    setBusy(submitBtn, false);

    if (!result.success) {
      showAlert(result.message);
      return;
    }

    SonarSession.save(result.session);
    await renderDashboard();
  });

  document.getElementById("resend-code-link").addEventListener("click", async (e) => {
    e.preventDefault();
    if (!pendingVerifyEmail) return;
    const result = await SonarApi.resendVerification(pendingVerifyEmail);
    showAlert(result.success ? "A new code has been sent." : result.message, result.success ? "success" : "error");
  });

  // -- Forgot password ----------------------------------------------------------------------

  document.getElementById("forgot-password-link").addEventListener("click", (e) => {
    e.preventDefault();
    showPanel("forgot");
  });

  document.getElementById("back-to-login-link").addEventListener("click", (e) => {
    e.preventDefault();
    showPanel("tabs");
    activateTab("login");
  });

  let pendingResetEmail = null;

  document.getElementById("forgot-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();
    const submitBtn = e.target.querySelector("button[type=submit]");
    setBusy(submitBtn, true, "Sending…");

    const email = document.getElementById("forgot-email").value.trim();
    const result = await SonarApi.requestPasswordReset(email);
    setBusy(submitBtn, false);

    if (!result.success) {
      showAlert(result.message);
      return;
    }

    pendingResetEmail = email;
    document.getElementById("reset-email-label").textContent = email;
    showPanel("reset");
  });

  document.getElementById("reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();
    const submitBtn = e.target.querySelector("button[type=submit]");
    setBusy(submitBtn, true, "Setting password…");

    const code = document.getElementById("reset-code").value.trim();
    const newPassword = document.getElementById("reset-new-password").value;
    const result = await SonarApi.confirmPasswordReset(pendingResetEmail, code, newPassword);
    setBusy(submitBtn, false);

    if (!result.success) {
      showAlert(result.message);
      return;
    }

    SonarSession.save(result.session);
    await renderDashboard();
  });

  // -- Dashboard ----------------------------------------------------------------------------

  const licenseBadgeClass = {
    Free: "badge-free",
    BetaTester: "badge-betatester",
    Pro: "badge-pro",
    Developer: "badge-developer",
    Administrator: "badge-administrator",
  };

  const licenseLabel = {
    Free: "Free",
    BetaTester: "Beta Tester",
    Pro: "Pro",
    Developer: "Developer",
    Administrator: "Administrator",
  };

  async function renderDashboard() {
    const session = await SonarSession.getValid();
    if (!session) {
      authShell.classList.remove("hidden");
      dashboardShell.classList.add("hidden");
      showPanel("tabs");
      return;
    }

    const result = await SonarApi.getProfile(session);
    if (!result.success) {
      SonarSession.clear();
      authShell.classList.remove("hidden");
      dashboardShell.classList.add("hidden");
      showPanel("tabs");
      if (result.kind === "AccountSuspended") showAlert(result.message);
      return;
    }

    const profile = result.profile;
    authShell.classList.add("hidden");
    dashboardShell.classList.remove("hidden");

    const name = profile.displayName || profile.username;
    document.getElementById("avatar-initial").textContent = name.charAt(0).toUpperCase();
    document.getElementById("profile-display-name").textContent = name;
    document.getElementById("profile-username").textContent = `@${profile.username}`;
    document.getElementById("profile-email").textContent = profile.email;
    document.getElementById("profile-created").textContent = profile.createdAt
      ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      : "—";

    const badgeRow = document.getElementById("badge-row");
    const cls = licenseBadgeClass[profile.license] || "badge-free";
    const label = licenseLabel[profile.license] || profile.license;
    badgeRow.innerHTML = `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
    if (profile.isBetaTester) {
      badgeRow.innerHTML += `<span class="badge badge-betatester">Beta Tester</span>`;
    }

    const betaCta = document.getElementById("beta-cta");
    betaCta.classList.toggle("hidden", profile.isBetaTester);
  }

  document.getElementById("join-beta-btn").addEventListener("click", async () => {
    const session = await SonarSession.getValid();
    if (!session) return;

    const btn = document.getElementById("join-beta-btn");
    setBusy(btn, true, "Joining…");
    const result = await SonarApi.joinBeta(session);
    setBusy(btn, false);

    if (!result.success) {
      showAlert(result.message);
      return;
    }
    await renderDashboard();
  });

  document.getElementById("sign-out-btn").addEventListener("click", async () => {
    const session = SonarSession.load();
    if (session) await SonarApi.logout(session);
    SonarSession.clear();
    authShell.classList.remove("hidden");
    dashboardShell.classList.add("hidden");
    showPanel("tabs");
    activateTab("login");
  });

  renderDashboard();
})();
