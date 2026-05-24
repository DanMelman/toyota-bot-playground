const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  console.log("Launching Stealth Browser...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log("Navigating to Toyota site...");
    await page.goto("https://toyota-select.co.il/catalog/", { waitUntil: 'networkidle2' });
    
    // Run the search directly inside the browser to bypass Imperva
    const ajaxJson = await page.evaluate(async () => {
      const html = document.documentElement.innerHTML;
      const nonceMatch = html.match(/["']nonce["']\s*[:|=]\s*["']([a-z0-9]{8,12})["']/) || 
                         html.match(/nonce\s*:\s*["']([a-z0-9]{8,12})["']/);
      const nonce = nonceMatch ? nonceMatch[1] : "";

      const dataParams = new URLSearchParams({
        min_year: "2023", max_year: "2030", min_price: "0", max_price: "190000",
        min_maz_oz: "0", max_maz_oz: "100000", "selectGrade[]": "219",
        category: "425", min_output: "0", max_output: "300", price_range: "{}"
      });
      dataParams.append("selectGrade[]", "217");

      const postBody = new URLSearchParams({ action: "filter_product_catalog", data: dataParams.toString() });
      if (nonce) postBody.set("nonce", nonce);

      const res = await fetch("https://toyota-select.co.il/wp-admin/admin-ajax.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: postBody.toString()
      });
      return res.json();
    });

    console.log("Found cars! Sending data to Vercel...");
    
    const VERCEL_URL = process.env.VERCEL_URL; 
    const backendRes = await fetch(`${VERCEL_URL}/api/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ajaxData: ajaxJson })
    });
    
    const result = await backendRes.json();
    console.log("Vercel Result:", result);

  } catch (err) {
    console.error("Scraping failed:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
