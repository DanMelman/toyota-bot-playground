(async () => {
  const CRON_SECRET = process.env.CRON_SECRET;
  const VERCEL_URL = process.env.VERCEL_URL;
  const TOYOTA_COOKIE = process.env.TOYOTA_COOKIE;

  if (!TOYOTA_COOKIE) {
    console.error("Missing TOYOTA_COOKIE secret!");
    process.exit(1);
  }

  const headers = {
    "Cookie": TOYOTA_COOKIE,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  try {
    console.log("1. Fetching catalog to grab security nonce...");
    const catalogRes = await fetch("https://toyota-select.co.il/catalog/", { headers });
    const catalogHtml = await catalogRes.text();

    if (catalogHtml.includes("Incapsula_Resource") || catalogHtml.includes("<html style=\"height:100%\">")) {
      throw new Error("Imperva block detected! The cookie is expired or Imperva rejected the GitHub IP.");
    }

    const nonceMatch = catalogHtml.match(/["']nonce["']\s*[:|=]\s*["']([a-z0-9]{8,12})["']/) || 
                       catalogHtml.match(/nonce\s*:\s*["']([a-z0-9]{8,12})["']/);
    const nonce = nonceMatch ? nonceMatch[1] : "";
    console.log(`Nonce found: ${nonce || "None"}`);

    console.log("2. Searching for RAV4s...");
    const dataParams = new URLSearchParams({
      min_year: "2023", max_year: "2030", min_price: "0", max_price: "190000",
      min_maz_oz: "0", max_maz_oz: "100000", "selectGrade[]": "219",
      category: "425", min_output: "0", max_output: "300", price_range: "{}"
    });
    dataParams.append("selectGrade[]", "217");

    const postBody = new URLSearchParams({ action: "filter_product_catalog", data: dataParams.toString() });
    if (nonce) postBody.set("nonce", nonce);

    const ajaxRes = await fetch("https://toyota-select.co.il/wp-admin/admin-ajax.php", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
      body: postBody.toString()
    });

    const ajaxJson = await ajaxRes.json();
    if (!ajaxJson.success) throw new Error("Toyota rejected the search request.");

    console.log("3. Sending data to Vercel...");
    const backendRes = await fetch(`${VERCEL_URL}/api/scan`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CRON_SECRET}`
      },
      body: JSON.stringify({ ajaxData: ajaxJson })
    });
    
    console.log("Vercel Result:", await backendRes.json());

  } catch (err) {
    console.error("Scraping failed:", err.message);
    process.exit(1);
  }
})();
