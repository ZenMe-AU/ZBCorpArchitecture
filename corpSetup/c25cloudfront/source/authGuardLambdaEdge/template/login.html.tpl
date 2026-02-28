<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Access Denied</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background-color: #f5f7fa;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .card {
        background: #ffffff;
        padding: 32px 40px;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        text-align: center;
        max-width: 420px;
        width: 100%;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 22px;
        color: #333;
      }

      p {
        margin: 0 0 20px;
        color: #666;
        font-size: 14px;
        line-height: 1.6;
      }

      .btn {
        display: inline-block;
        padding: 12px 24px;
        background-color: #4f46e5;
        color: #fff;
        text-decoration: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
      }

      .btn:hover {
        background-color: #4338ca;
      }

      .fallback {
        margin-top: 20px;
        font-size: 12px;
        color: #999;
        word-break: break-all;
      }

      .fallback code {
        display: block;
        margin-top: 6px;
        padding: 8px;
        background: #f3f4f6;
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        color: #333;
      }
    </style>
  </head>
  <body>
    <!-- Processing login card (shown initially) -->
    <div id="processing-card">
      <p>Processing login, please wait…</p>
    </div>

    <!-- Original login card (hidden initially) -->
    <div id="login-card" class="card" style="display: none">
      <h1>Login Required</h1>
      <p>
        You are not logged in or your session has expired.<br />
        Please log in to continue.
      </p>

      <a class="btn" href="${auth_domain}"> Go to Login </a>

      <div class="fallback">
        If the button does not work, copy and open this URL:
        <code>${auth_domain}</code>
      </div>
    </div>

    <script>
      (function () {
        function showManualLoginCard(isShowCard) {
          const processing = document.getElementById("processing-card");
          const login = document.getElementById("login-card");
          if (isShowCard) {
            processing.style.display = "none";
            login.style.display = "block";
          } else {
            processing.style.display = "block";
            login.style.display = "none";
          }
        }

        function refreshViaIframe() {
          const AUTH_URL = "${auth_domain}";
          const AUTH_ORIGIN = new URL(AUTH_URL).origin;
          const TIMEOUT_MS = 10000;
          return new Promise(function (resolve, reject) {
            const iframe = document.createElement("iframe");
            iframe.src = AUTH_URL;
            iframe.style.display = "none";

            function cleanup() {
              window.removeEventListener("message", handler);
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }

            function handler(event) {
              if (event.origin !== AUTH_ORIGIN) return;

              if (event.data?.authStatus === "SUCCESS") {
                cleanup();
                resolve();
              } else if (event.data?.authStatus === "FAILED") {
                cleanup();
                reject();
              }
            }

            window.addEventListener("message", handler);
            document.body.appendChild(iframe);

            setTimeout(function () {
              cleanup();
              reject();
            }, TIMEOUT_MS);
          });
        }

        function getCookie(name) {
          const value = "; " + document.cookie;
          const parts = value.split("; " + name + "=");
          if (parts.length === 2) return parts.pop().split(";").shift();
          return null;
        }

        // ---- Silent Auth ----
        if (!getCookie("idToken")) {
          showManualLoginCard(false); // Show processing card while attempting silent auth
          refreshViaIframe()
            .then(function () {
              sessionStorage.setItem("skip_pageshow_reload", "1");
            })
            // .catch(function () {
            //   showManualLoginCard(true); // Show login card on failure
            // })
            .finally(function () {
              showManualLoginCard(true);
              if (getCookie("idToken")) window.location.reload();
            });
        }

        // ---- BFCache Handling ----
        window.addEventListener("pageshow", function (event) {
          if (event.persisted && navigator.onLine && !sessionStorage.getItem("skip_pageshow_reload")) {
            window.location.reload();
          }
          sessionStorage.removeItem("skip_pageshow_reload");
        });
      })();
    </script>
  </body>
</html>
