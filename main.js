document.addEventListener("DOMContentLoaded", () => {
  // --- Navigation & Mobile Menu Logic ---
  const navBtns = document.querySelectorAll('.nav-btn');
  const pages = document.querySelectorAll('.page-section');
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const navLinksMenu = document.getElementById('nav-links');
  const brandLogo = document.getElementById('brand-logo'); 

  // Toggle mobile menu
  hamburgerBtn.addEventListener('click', () => {
    navLinksMenu.classList.toggle('show');
  });

  // Make the logo act like the "Home" button
  brandLogo.addEventListener('click', () => {
    const homeBtn = document.querySelector('.nav-btn[data-target="home"]');
    if (homeBtn) homeBtn.click();
  });

  // Switch pages
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active from all
      navBtns.forEach(b => b.classList.remove('active'));
      pages.forEach(p => p.classList.remove('active'));

      // Add active to clicked
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');

      // Close mobile menu if open after clicking a link
      navLinksMenu.classList.remove('show');
    });
  });

  // --- Typewriter Logic ---
  const typedText = document.getElementById("typed-text");
  const word = "mobx";
  const TYPE_SPEED = 120;
  const ERASE_SPEED = 80;
  const TYPEWRITER_CYCLE_MS = 5000;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function runTypewriterLoop() {
    while (true) {
      typedText.textContent = "";
      for (const char of word) {
        typedText.textContent += char;
        await sleep(TYPE_SPEED);
      }
      const usedMs = word.length * TYPE_SPEED + word.length * ERASE_SPEED;
      const holdMs = Math.max(300, TYPEWRITER_CYCLE_MS - usedMs);
      await sleep(holdMs);
      while (typedText.textContent.length > 0) {
        typedText.textContent = typedText.textContent.slice(0, -1);
        await sleep(ERASE_SPEED);
      }
      await sleep(120);
    }
  }

  // --- Capybara Logic ---
  const capyImg = document.getElementById("capy-img");
  const factEl = document.getElementById("capy-fact");
  const button = document.getElementById("new-capy-btn");
  const imageWrap = document.getElementById("image-wrap");

  function setLoadingUI(isLoading, imageReady = false) {
    if (isLoading) {
      imageWrap.classList.add("is-loading");
      imageWrap.classList.remove("is-loaded");
    } else {
      imageWrap.classList.remove("is-loading");
      if (imageReady) imageWrap.classList.add("is-loaded");
    }
    imageWrap.setAttribute("aria-busy", String(isLoading));
    button.disabled = isLoading;
  }

  function preloadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function fetchRandomCapybara() {
    const res = await fetch("https://api.capy.lol/v1/capybara?json=true", { cache: "no-store" });
    if (!res.ok) throw new Error(`Image HTTP ${res.status}`);
    const json = await res.json();
    const data = json?.data;
    if (!data?.url) throw new Error("Missing image URL");
    
    const imageUrl = data.url.replace(/^http:\/\//i, "https://");
    await preloadImage(imageUrl);
    capyImg.src = imageUrl;
    capyImg.alt = data.alt || "Random capybara";
  }

  async function fetchCapyFact() {
    const res = await fetch("https://api.capy.lol/v1/fact", { cache: "no-store" });
    if (!res.ok) throw new Error(`Fact HTTP ${res.status}`);
    const json = await res.json();
    const fact = json?.data?.fact;
    if (!fact) throw new Error("Missing fact text");
    factEl.textContent = fact;
  }

  async function loadContent() {
    let imageLoaded = false;
    setLoadingUI(true);
    factEl.textContent = "Loading a capybara fact...";

    try {
      const [imageResult, factResult] = await Promise.allSettled([
        fetchRandomCapybara(),
        fetchCapyFact(),
      ]);

      if (imageResult.status === "rejected") {
        console.error(imageResult.reason);
        capyImg.alt = "Failed to load capybara image";
      } else {
        imageLoaded = true;
      }

      if (factResult.status === "rejected") {
        console.error(factResult.reason);
        factEl.textContent = "Could not load a capybara fact this time.";
      }
    } finally {
      setLoadingUI(false, imageLoaded);
    }
  }

  // Initialize active functions
  button.addEventListener("click", loadContent);
  runTypewriterLoop();
  loadContent(); 
});
