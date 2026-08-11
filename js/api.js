// Thin wrapper around Supabase Auth (GoTrue REST) + PostgREST, mirroring
// src/Soundboard/Authentication/SupabaseAuthService.cs so the website's login/register/verify
// flow behaves identically to the desktop app (in-app 6-digit codes, username-or-email login).
const SonarApi = (() => {
  const BASE = SONAR_CONFIG.supabaseUrl;
  const ANON_KEY = SONAR_CONFIG.supabaseAnonKey;

  async function request(path, { method = "GET", body, accessToken } = {}) {
    const headers = { apikey: ANON_KEY, "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    let response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw { kind: "NoInternet", message: "Couldn't reach the server. Check your internet connection." };
    }

    const text = await response.text();
    const data = text ? safeParse(text) : null;

    if (!response.ok) {
      throw { kind: "Http", status: response.status, data, raw: text };
    }
    return data;
  }

  function safeParse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function serverMessage(err) {
    const data = err && err.data;
    if (data && typeof data === "object") {
      return data.msg || data.message || data.error_description || null;
    }
    return null;
  }

  function toSession(token) {
    if (!token || !token.access_token || !token.refresh_token || !token.user || !token.user.id) {
      return null;
    }
    return {
      userId: token.user.id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAtUtc: Date.now() + (token.expires_in > 0 ? token.expires_in : 3600) * 1000,
    };
  }

  return {
    // -- Identity (Supabase Auth / GoTrue) --------------------------------------------------

    async usernameExists(username) {
      try {
        return await request("/rest/v1/rpc/username_exists", {
          method: "POST",
          body: { lookup_username: username },
        });
      } catch {
        return false;
      }
    },

    async register(username, email, password) {
      const taken = await this.usernameExists(username);
      if (taken) {
        return { success: false, kind: "UsernameAlreadyExists", message: "That username is already taken." };
      }

      try {
        await request("/auth/v1/signup", {
          method: "POST",
          body: { email, password, data: { username } },
        });
        return { success: true };
      } catch (err) {
        const raw = (err.raw || "").toLowerCase();
        if (raw.includes("already registered") || raw.includes("already exists")) {
          return { success: false, kind: "EmailAlreadyExists", message: "An account with that email already exists." };
        }
        if (raw.includes("password")) {
          return {
            success: false,
            kind: "WeakPassword",
            message: serverMessage(err) || "Password is too weak — use at least 8 characters with a mix of letters and numbers.",
          };
        }
        return { success: false, kind: "Unknown", message: serverMessage(err) || "Couldn't create the account. Please try again." };
      }
    },

    async resolveEmailForUsername(username) {
      try {
        const result = await request("/rest/v1/rpc/get_email_for_username", {
          method: "POST",
          body: { lookup_username: username },
        });
        return typeof result === "string" ? result : null;
      } catch {
        return null;
      }
    },

    async login(emailOrUsername, password) {
      const email = emailOrUsername.includes("@")
        ? emailOrUsername
        : await this.resolveEmailForUsername(emailOrUsername);

      if (!email) {
        return { success: false, kind: "InvalidCredentials", message: "Incorrect email/username or password." };
      }

      try {
        const token = await request("/auth/v1/token?grant_type=password", {
          method: "POST",
          body: { email, password },
        });
        const session = toSession(token);
        if (!session) return { success: false, kind: "Unknown", message: "Unexpected response from the server." };
        return { success: true, session };
      } catch (err) {
        const raw = (err.raw || "").toLowerCase();
        if (raw.includes("email not confirmed") || raw.includes("email_not_confirmed")) {
          return { success: false, kind: "EmailNotVerified", message: "Please verify your email before logging in.", email };
        }
        return { success: false, kind: "InvalidCredentials", message: "Incorrect email/username or password." };
      }
    },

    async verify(email, token, type) {
      try {
        const result = await request("/auth/v1/verify", { method: "POST", body: { type, email, token } });
        const session = toSession(result);
        if (!session) return { success: false, kind: "Unknown", message: "Unexpected response from the server." };
        return { success: true, session };
      } catch (err) {
        const expired = (err.raw || "").toLowerCase().includes("expired");
        return {
          success: false,
          kind: expired ? "TokenExpired" : "Unknown",
          message: "That code is invalid or has expired. Request a new one and try again.",
        };
      }
    },

    async resendVerification(email) {
      try {
        await request("/auth/v1/resend", { method: "POST", body: { type: "signup", email } });
        return { success: true };
      } catch {
        return { success: false, message: "Couldn't resend the verification email right now." };
      }
    },

    async requestPasswordReset(email) {
      try {
        await request("/auth/v1/recover", { method: "POST", body: { email } });
        return { success: true };
      } catch {
        // Supabase intentionally returns success either way so this endpoint can't be used
        // to probe which emails have accounts; a thrown error here means the request itself
        // failed to reach the server, not that the email doesn't exist.
        return { success: false, message: "Couldn't request a password reset right now." };
      }
    },

    async confirmPasswordReset(email, token, newPassword) {
      const verifyResult = await this.verify(email, token, "recovery");
      if (!verifyResult.success) return verifyResult;

      const changeResult = await this.changePassword(verifyResult.session, newPassword);
      return changeResult.success
        ? verifyResult
        : { success: false, kind: changeResult.kind, message: changeResult.message };
    },

    async changePassword(session, newPassword) {
      try {
        await request("/auth/v1/user", {
          method: "PUT",
          body: { password: newPassword },
          accessToken: session.accessToken,
        });
        return { success: true };
      } catch (err) {
        const raw = (err.raw || "").toLowerCase();
        if (raw.includes("password")) {
          return {
            success: false,
            kind: "WeakPassword",
            message: serverMessage(err) || "Password is too weak — use at least 8 characters with a mix of letters and numbers.",
          };
        }
        return { success: false, kind: "Unknown", message: serverMessage(err) || "Couldn't change the password." };
      }
    },

    async refreshSession(refreshToken) {
      try {
        const token = await request("/auth/v1/token?grant_type=refresh_token", {
          method: "POST",
          body: { refresh_token: refreshToken },
        });
        const session = toSession(token);
        if (!session) return { success: false };
        return { success: true, session };
      } catch {
        return { success: false };
      }
    },

    async logout(session) {
      try {
        await request("/auth/v1/logout", { method: "POST", body: {}, accessToken: session.accessToken });
      } catch {
        // Best-effort — the caller always clears the local session regardless.
      }
    },

    // -- Profile (PostgREST "profiles" table) ------------------------------------------------

    async getProfile(session) {
      try {
        const rows = await request(
          `/rest/v1/profiles?id=eq.${encodeURIComponent(session.userId)}&select=*`,
          { accessToken: session.accessToken }
        );
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) return { success: false, message: "Profile not found." };

        if (row.is_suspended) {
          return { success: false, kind: "AccountSuspended", message: "This account has been suspended. Contact support for details." };
        }

        return {
          success: true,
          profile: {
            userId: row.id,
            username: row.username || "",
            displayName: row.display_name,
            email: row.email || "",
            createdAt: row.created_at,
            isBetaTester: !!row.is_beta_tester,
            license: row.license || "Free",
            cloudEnabled: !!row.cloud_enabled,
          },
        };
      } catch {
        return { success: false, message: "Couldn't load your profile." };
      }
    },

    // Calls the join_beta() RPC (supabase-schema.sql section 15) rather than PATCHing the
    // profiles row directly — a narrow security-definer function that can only ever flip the
    // caller's own is_beta_tester to true, unlike a raw PATCH which the table's broader RLS
    // update policy would technically also allow to touch other columns.
    async joinBeta(session) {
      try {
        await request("/rest/v1/rpc/join_beta", { method: "POST", body: {}, accessToken: session.accessToken });
        return { success: true };
      } catch {
        return { success: false, message: "Couldn't join the beta right now. Please try again." };
      }
    },

    // -- Support tickets (support_tickets / support_ticket_messages, schema section 17) -----
    // Mirrors src/Soundboard/Authentication/SupabaseSupportTicketService.cs so the website's
    // Support page and the desktop app's Support window talk to the same threads. Reads are
    // scoped to the caller's own tickets by RLS; writes go through security definer RPCs so
    // sender identity can't be spoofed from client-side code.

    async listMyTickets(session) {
      try {
        const rows = await request(
          `/rest/v1/support_tickets?select=id,subject,status,created_at&user_id=eq.${encodeURIComponent(
            session.userId
          )}&order=created_at.desc`,
          { accessToken: session.accessToken }
        );
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    },

    async getTicketMessages(session, ticketId) {
      try {
        const rows = await request(
          `/rest/v1/support_ticket_messages?select=id,sender_username,is_admin,body,created_at&ticket_id=eq.${encodeURIComponent(
            ticketId
          )}&order=created_at.asc`,
          { accessToken: session.accessToken }
        );
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    },

    async createTicket(session, subject, body) {
      try {
        const ticketId = await request("/rest/v1/rpc/create_support_ticket", {
          method: "POST",
          body: { subject_text: subject, body_text: body },
          accessToken: session.accessToken,
        });
        return typeof ticketId === "string" && ticketId
          ? { success: true, ticketId }
          : { success: false, message: "Couldn't submit your request." };
      } catch (err) {
        return { success: false, message: serverMessage(err) || "Couldn't submit your request." };
      }
    },

    async sendTicketMessage(session, ticketId, body) {
      try {
        await request("/rest/v1/rpc/send_ticket_message", {
          method: "POST",
          body: { target_ticket_id: ticketId, body_text: body },
          accessToken: session.accessToken,
        });
        return { success: true };
      } catch (err) {
        // Surfaces the RPC's own message (e.g. "This request is resolved...") rather than a
        // generic one — send_ticket_message() rejects with a specific reason, not just a
        // blanket auth failure.
        return { success: false, message: serverMessage(err) || "Couldn't send your message." };
      }
    },
  };
})();
