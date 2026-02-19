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
    <div class="card">
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
    <!-- Auto-reload script -->
    <script>
      window.addEventListener("pageshow", function (event) {
        // This reload the page if loaded from cache and online. There is a small risk of infinite loop, to be investigated.
        if (event.persisted && navigator.onLine) {
          console.log("Page is ready to reload.");
          window.location.reload();
        }
      });
    </script>
  </body>
</html>
