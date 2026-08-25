/**
 * wizforms.js — WizMart Forms
 * Captura o formulário do seu site/landing page e envia direto para o CRM.
 *
 * Uso rápido (recomendado):
 *   <script src="https://wizmart-crm.web.app/wizforms.js"></script>
 *   <form data-wizmart-key="SUA_CHAVE_AQUI">
 *     <input type="text"  name="name"    required>
 *     <input type="email" name="email">
 *     <input type="tel"   name="phone">
 *     <button type="submit">Enviar</button>
 *   </form>
 *
 * Atributos opcionais do <form>:
 *   data-wizmart-endpoint          URL do endpoint (default: produção)
 *   data-wizmart-success           Mensagem de sucesso
 *   data-wizmart-error             Mensagem de erro
 *   data-wizmart-redirect          URL para redirecionar após o sucesso
 *   data-wizmart-turnstile-sitekey Site key do Cloudflare Turnstile (se a
 *                                  fonte exigir verificação anti-robô)
 *
 * Uso avançado (integração direta, sem <form>):
 *   WizMartForms.submit({ name: 'Maria', email: 'maria@x.com' }, { key: 'SUA_CHAVE' })
 *
 * Ver documentação completa em docs/WizMart-Guia-Captacao-Leads.html
 */
(function (root, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    define([], factory);
  } else {
    root.WizMartForms = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_ENDPOINT = "https://wizmart-crm.web.app/api/leads";
  var KNOWN_FIELDS = ["name", "email", "phone", "company", "message"];
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  var DEFAULT_SUCCESS = "Recebemos seu contato! Em breve alguém da nossa equipe vai falar com você.";
  var DEFAULT_ERROR = "Não foi possível enviar agora. Tente novamente em instantes.";

  // ── Funções puras (testáveis sem DOM) ────────────────────────────────────────

  function toCamelUtmKey(key) {
    return key.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }

  function parseUtmParams(search) {
    var params = new URLSearchParams(search || "");
    var out = {};
    for (var i = 0; i < UTM_KEYS.length; i++) {
      var key = UTM_KEYS[i];
      var val = params.get(key);
      if (val) out[toCamelUtmKey(key)] = val;
    }
    return out;
  }

  function buildTracking(href, search, referrer) {
    var tracking = parseUtmParams(search);
    if (href) tracking.pageUrl = href;
    if (referrer) tracking.referrer = referrer;
    return tracking;
  }

  /** Distribui os campos do formulário entre os conhecidos pelo backend e `custom`. */
  function mapFieldsToPayload(fields) {
    var payload = { custom: {} };
    for (var key in fields) {
      if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
      if (key.charAt(0) === "_" || key === "cf-turnstile-response") continue;
      var value = fields[key];
      if (KNOWN_FIELDS.indexOf(key) !== -1) {
        payload[key] = value;
      } else if (value) {
        payload.custom[key] = value;
      }
    }
    if (Object.keys(payload.custom).length === 0) delete payload.custom;
    return payload;
  }

  function fieldsFromFormData(formData) {
    var out = {};
    formData.forEach(function (value, key) {
      if (typeof value === "string") out[key] = value;
    });
    return out;
  }

  /** Monta o payload completo (campos + controle anti-bot + tracking) a partir de um <form>. */
  function buildLeadPayload(formEl, opts) {
    opts = opts || {};
    var fields = fieldsFromFormData(new FormData(formEl));
    var payload = mapFieldsToPayload(fields);

    payload._hp = fields._hp || "";
    payload._ts = opts.renderedAt || Date.now();
    if (fields["cf-turnstile-response"]) {
      payload._turnstile = fields["cf-turnstile-response"];
    }

    var loc = opts.location || (typeof window !== "undefined" ? window.location : {});
    var ref = opts.referrer !== undefined
      ? opts.referrer
      : (typeof document !== "undefined" ? document.referrer : "");
    payload.tracking = buildTracking(loc.href, loc.search, ref);

    return payload;
  }

  /** Envia o payload ao endpoint de captação. Uso direto (sem <form>) ou interno ao bindForm. */
  function submit(payload, opts) {
    opts = opts || {};
    if (!opts.key) {
      return Promise.reject(new Error("WizMartForms.submit: 'key' é obrigatória"));
    }
    var endpoint = opts.endpoint || DEFAULT_ENDPOINT;

    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-WizMart-Key": opts.key },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res
        .json()
        .catch(function () { return {}; })
        .then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
    });
  }

  // ── DOM: honeypot, Turnstile, feedback visual, binding do form ──────────────

  function injectHoneypot(formEl) {
    if (formEl.querySelector('input[name="_hp"]')) return;
    var input = document.createElement("input");
    input.type = "text";
    input.name = "_hp";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("tabindex", "-1");
    input.setAttribute("aria-hidden", "true");
    input.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    formEl.appendChild(input);
  }

  function ensureTurnstileScript() {
    if (document.querySelector("script[data-wizmart-turnstile]")) return;
    var script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-wizmart-turnstile", "");
    document.head.appendChild(script);
  }

  function ensureTurnstileWidget(formEl, siteKey) {
    if (formEl.querySelector(".cf-turnstile")) return;
    var widget = document.createElement("div");
    widget.className = "cf-turnstile";
    widget.setAttribute("data-sitekey", siteKey);
    formEl.appendChild(widget);
  }

  function getBtnLabel(btn) {
    return btn.tagName === "INPUT" ? btn.value : btn.textContent;
  }
  function setBtnLabel(btn, label) {
    if (btn.tagName === "INPUT") btn.value = label;
    else btn.textContent = label;
  }

  function setFeedback(formEl, message, isError) {
    var el = formEl.querySelector("[data-wizmart-feedback]");
    if (!el) {
      el = document.createElement("div");
      el.setAttribute("data-wizmart-feedback", "");
      el.style.cssText = "margin-top:12px;font-size:14px;";
      formEl.appendChild(el);
    }
    el.textContent = message;
    el.style.color = isError ? "#B91C1C" : "#1A6B1A";
  }

  function bindForm(formEl) {
    if (formEl.getAttribute("data-wizmart-bound") === "1") return;
    var key = formEl.getAttribute("data-wizmart-key");
    if (!key) return;
    formEl.setAttribute("data-wizmart-bound", "1");

    injectHoneypot(formEl);
    var renderedAt = Date.now();

    var turnstileSiteKey = formEl.getAttribute("data-wizmart-turnstile-sitekey");
    if (turnstileSiteKey) {
      ensureTurnstileScript();
      ensureTurnstileWidget(formEl, turnstileSiteKey);
    }

    var endpoint = formEl.getAttribute("data-wizmart-endpoint") || DEFAULT_ENDPOINT;
    var successMsg = formEl.getAttribute("data-wizmart-success") || DEFAULT_SUCCESS;
    var errorMsg = formEl.getAttribute("data-wizmart-error") || DEFAULT_ERROR;
    var redirectUrl = formEl.getAttribute("data-wizmart-redirect");

    formEl.addEventListener("submit", function (event) {
      event.preventDefault();

      var submitBtn = formEl.querySelector('button[type="submit"], input[type="submit"]');
      var originalLabel = submitBtn ? getBtnLabel(submitBtn) : null;
      if (submitBtn) {
        submitBtn.disabled = true;
        setBtnLabel(submitBtn, "Enviando…");
      }

      var payload = buildLeadPayload(formEl, { renderedAt: renderedAt });

      submit(payload, { key: key, endpoint: endpoint })
        .then(function (result) {
          if (result.ok) {
            setFeedback(formEl, successMsg, false);
            formEl.reset();
            if (redirectUrl) {
              setTimeout(function () { window.location.href = redirectUrl; }, 1200);
            }
          } else {
            setFeedback(formEl, errorMsg, true);
          }
        })
        .catch(function () {
          setFeedback(formEl, errorMsg, true);
        })
        .then(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            if (originalLabel !== null) setBtnLabel(submitBtn, originalLabel);
          }
        });
    });
  }

  function init() {
    var forms = document.querySelectorAll("form[data-wizmart-key]");
    for (var i = 0; i < forms.length; i++) bindForm(forms[i]);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  return {
    init: init,
    submit: submit,
    parseUtmParams: parseUtmParams,
    mapFieldsToPayload: mapFieldsToPayload,
    buildLeadPayload: buildLeadPayload,
  };
});
