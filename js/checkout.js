// Wires up every "Upgrade to Pro" button on the page — any page just needs
// <button data-checkout-btn>...</button> to opt in (used on index.html's pricing card and
// account.html's dashboard). Self-contained rather than reusing account.js's private
// showAlert/setBusy helpers, since this script runs on pages that don't have those in scope.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-checkout-btn]").forEach((btn) => {
    btn.addEventListener("click", () => startCheckout(btn));
  });
});

async function startCheckout(btn) {
  const originalLabel = btn.textContent;
  const session = await SonarSession.getValid();
  if (!session) {
    window.location.href = "account.html";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Starting checkout…";
  clearCheckoutStatus(btn);

  try {
    const res = await fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showCheckoutStatus(btn, data.message || "Couldn't start checkout — please try again.");
      btn.disabled = false;
      btn.textContent = originalLabel;
      return;
    }

    window.location.href = data.url;
  } catch {
    showCheckoutStatus(btn, "Couldn't reach the server — check your connection and try again.");
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

function showCheckoutStatus(btn, message) {
  let status = btn.nextElementSibling;
  if (!status || !status.classList.contains("checkout-status")) {
    status = document.createElement("p");
    status.className = "alert alert-error checkout-status";
    btn.insertAdjacentElement("afterend", status);
  }
  status.textContent = message;
}

function clearCheckoutStatus(btn) {
  const status = btn.nextElementSibling;
  if (status && status.classList.contains("checkout-status")) status.remove();
}
