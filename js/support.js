// support.html page logic: ticket list + thread view, mirroring the desktop app's Support
// window (Views/SupportWindow.xaml / ViewModels/SupportViewModel.cs).
(() => {
  const signedOutShell = document.getElementById("signed-out-shell");
  const supportShell = document.getElementById("support-shell");

  const ticketListEl = document.getElementById("ticket-list");
  const emptyEl = document.getElementById("support-empty");
  const composeForm = document.getElementById("new-ticket-form");
  const newTicketAlertEl = document.getElementById("new-ticket-alert");
  const threadEl = document.getElementById("support-thread");
  const threadSubjectEl = document.getElementById("thread-subject");
  const threadMessagesEl = document.getElementById("thread-messages");
  const resolvedNoteEl = document.getElementById("thread-resolved-note");
  const replyForm = document.getElementById("thread-reply-form");
  const replyTextEl = document.getElementById("thread-reply-text");
  const replyAlertEl = document.getElementById("thread-reply-alert");

  let session = null;
  let tickets = [];
  let selectedTicketId = null;

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function statusLabel(status) {
    if (status === "in_progress") return "In Progress";
    if (status === "resolved") return "Resolved";
    return "Open";
  }

  function showAlert(el, message) {
    el.innerHTML = message ? `<div class="alert alert-error">${escapeHtml(message)}</div>` : "";
  }

  // Exactly one of empty/compose/thread is visible at a time.
  function showPanel(panel) {
    emptyEl.classList.toggle("hidden", panel !== "empty");
    composeForm.classList.toggle("hidden", panel !== "compose");
    threadEl.classList.toggle("hidden", panel !== "thread");
  }

  function renderTicketList() {
    ticketListEl.innerHTML = tickets
      .map(
        (t) => `
        <button class="ticket-item${t.id === selectedTicketId ? " active" : ""}" data-id="${t.id}" type="button">
          <span class="ticket-item-subject">${escapeHtml(t.subject)}</span>
          <span class="ticket-item-status">${statusLabel(t.status)}</span>
        </button>`
      )
      .join("");

    ticketListEl.querySelectorAll(".ticket-item").forEach((btn) => {
      btn.addEventListener("click", () => selectTicket(btn.dataset.id));
    });
  }

  async function loadTickets() {
    tickets = await SonarApi.listMyTickets(session);
    renderTicketList();
  }

  async function selectTicket(id) {
    selectedTicketId = id;
    renderTicketList();
    showPanel("thread");
    replyAlertEl.innerHTML = "";

    const ticket = tickets.find((t) => t.id === id);
    threadSubjectEl.textContent = ticket ? ticket.subject : "";

    const resolved = !!ticket && ticket.status === "resolved";
    replyForm.classList.toggle("hidden", resolved);
    resolvedNoteEl.classList.toggle("hidden", !resolved);

    threadMessagesEl.innerHTML = "";
    const messages = await SonarApi.getTicketMessages(session, id);
    threadMessagesEl.innerHTML = messages
      .map(
        (m) => `
        <div class="chat-bubble ${m.is_admin ? "from-admin" : "from-you"}">
          <div class="chat-bubble-sender">${m.is_admin ? "Support" : "You"}</div>
          <div class="chat-bubble-body">${escapeHtml(m.body)}</div>
          <div class="chat-bubble-time">${new Date(m.created_at).toLocaleString()}</div>
        </div>`
      )
      .join("");
    threadMessagesEl.scrollTop = threadMessagesEl.scrollHeight;
  }

  document.getElementById("new-ticket-btn").addEventListener("click", () => {
    selectedTicketId = null;
    renderTicketList();
    newTicketAlertEl.innerHTML = "";
    composeForm.reset();
    showPanel("compose");
  });

  document.getElementById("thread-start-new-link").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("new-ticket-btn").click();
  });

  composeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const subject = document.getElementById("new-ticket-subject").value.trim();
    const message = document.getElementById("new-ticket-message").value.trim();
    if (!subject || !message) return;

    const submitBtn = composeForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    const result = await SonarApi.createTicket(session, subject, message);
    submitBtn.disabled = false;

    if (!result.success) {
      showAlert(newTicketAlertEl, result.message);
      return;
    }

    await loadTickets();
    await selectTicket(result.ticketId);
  });

  replyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = replyTextEl.value.trim();
    if (!message || !selectedTicketId) return;

    const submitBtn = replyForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    const result = await SonarApi.sendTicketMessage(session, selectedTicketId, message);
    submitBtn.disabled = false;

    if (!result.success) {
      showAlert(replyAlertEl, result.message);
      return;
    }

    replyTextEl.value = "";
    replyAlertEl.innerHTML = "";
    await selectTicket(selectedTicketId);
  });

  (async () => {
    session = await SonarSession.getValid();
    if (!session) {
      signedOutShell.classList.remove("hidden");
      return;
    }

    supportShell.classList.remove("hidden");
    showPanel("empty");
    await loadTickets();
  })();
})();
