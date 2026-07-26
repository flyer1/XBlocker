(() => {
  "use strict";

  const RESERVED_PATHS = new Set([
    "compose", "explore", "home", "i", "messages", "notifications",
    "search", "settings", "tos", "privacy"
  ]);
  let activeArticle = null;
  let processing = false;

  function normalizeHandle(value) {
    return String(value || "").replace(/^@/, "").trim().toLowerCase();
  }

  function handleFromArticle(article) {
    const userName = article.querySelector('[data-testid="User-Name"]');
    const links = userName ? userName.querySelectorAll('a[href^="/"]') : [];
    for (const link of links) {
      const match = (link.getAttribute("href") || "").match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      if (match && !RESERVED_PATHS.has(match[1].toLowerCase())) return match[1];
    }
    return userName?.innerText.match(/@([A-Za-z0-9_]{1,15})/)?.[1] || null;
  }

  function toast(message, tone = "normal") {
    document.querySelector(".xb-toast")?.remove();
    const node = document.createElement("div");
    node.className = `xb-toast xb-toast--${tone}`;
    node.textContent = message;
    document.body.appendChild(node);
    window.setTimeout(() => node.remove(), 2400);
  }

  function waitFor(find, timeout = 1800) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const result = find();
        if (result) return resolve(result);
        if (Date.now() - started >= timeout) return reject(new Error("Timed out waiting for X"));
        window.setTimeout(check, 60);
      };
      check();
    });
  }

  function visibleElements(selector) {
    return [...document.querySelectorAll(selector)].filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  async function blockArticle(article) {
    if (processing) return;
    const handle = handleFromArticle(article);
    if (!handle) return toast("Could not identify this account", "error");

    const action = article.querySelector(".xb-article-action");
    processing = true;
    action?.classList.add("xb-article-action--working");
    try {
      const caret = article.querySelector('[data-testid="caret"], button[aria-label*="More" i]');
      if (!caret) throw new Error(`Could not open the menu for @${handle}`);
      caret.click();

      const menuItem = await waitFor(() => visibleElements('[role="menuitem"]').find((item) => {
        const text = item.innerText.trim().toLowerCase();
        return text === "block" || text.startsWith("block @") || text.includes(`block @${normalizeHandle(handle)}`);
      }));
      menuItem.click();

      const confirm = await waitFor(() => visibleElements('[data-testid="confirmationSheetConfirm"], [role="dialog"] button').find((button) => {
        return button.innerText.trim().toLowerCase() === "block";
      }));
      confirm.click();
      toast(`Blocked @${handle}`, "success");
    } catch (error) {
      toast(error.message || "XBlocker could not complete that block", "error");
    } finally {
      processing = false;
      action?.classList.remove("xb-article-action--working");
    }
  }

  function likeArticle(article) {
    const likeButton = article.querySelector('[data-testid="like"]');
    if (likeButton) {
      likeButton.click();
      toast("Liked", "success");
      return;
    }

    const unlikeButton = article.querySelector('[data-testid="unlike"]');
    if (unlikeButton) {
      unlikeButton.click();
      toast("Unliked");
      return;
    }

    toast("Could not find the Like button", "error");
  }

  function toggleVideoMute(article) {
    const muteButton = [...article.querySelectorAll('button[aria-label]')].find((button) => {
      const label = button.getAttribute("aria-label")?.trim().toLowerCase() || "";
      return label === "mute" || label.startsWith("mute ") ||
        label === "unmute" || label.startsWith("unmute ");
    });

    if (muteButton) {
      const wasMuted = muteButton.getAttribute("aria-label").trim().toLowerCase().startsWith("unmute");
      muteButton.click();
      toast(wasMuted ? "Video unmuted" : "Video muted");
      return;
    }

    const video = article.querySelector("video");
    if (video) {
      video.muted = !video.muted;
      toast(video.muted ? "Video muted" : "Video unmuted");
      return;
    }

    toast("Could not find a video in this post", "error");
  }

  function enhanceArticle(article) {
    if (article.dataset.xblockerReady) return;
    article.dataset.xblockerReady = "true";
    const handle = handleFromArticle(article);
    if (!handle) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "xb-article-action";
    button.title = `Block @${handle} (B)`;
    button.setAttribute("aria-label", `Block @${handle}`);
    button.innerHTML = '<span aria-hidden="true">&#8856;</span><span>Block</span>';
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      blockArticle(article);
    });
    article.appendChild(button);
  }

  function enhanceArticles() {
    document.querySelectorAll("article").forEach(enhanceArticle);
  }

  function isTypingTarget(target) {
    return target instanceof HTMLElement && (
      target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
    );
  }

  document.addEventListener("pointerover", (event) => {
    const article = event.target.closest?.("article");
    if (article) activeArticle = article;
  }, true);

  document.addEventListener("pointerout", (event) => {
    if (activeArticle && !activeArticle.contains(event.relatedTarget)) activeArticle = null;
  }, true);

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (!["a", "b", "m"].includes(key) || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
    const article = activeArticle || document.activeElement?.closest?.("article");
    if (!article) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (key === "a") likeArticle(article);
    else if (key === "b") blockArticle(article);
    else toggleVideoMute(article);
  }, true);

  const observer = new MutationObserver(enhanceArticles);
  enhanceArticles();
  observer.observe(document.body, { childList: true, subtree: true });
})();
