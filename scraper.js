const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  console.log("Launching Stealth Browser...");
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set a realistic browser size
    await page.setViewport({ width: 1280, height: 800 });
    
    console.log("Navigating to Toyota site...");
    // Wait for the initial HTML to load, not the whole network
    await page.goto("https://toyota-select.co.il/catalog/", { waitUntil: 'domcontentloaded' });
    
    console.log("Waiting 8 seconds for Imperva security check to clear...");
    await new Promise(r => setTimeout(r, 8000));
    
    console.log("Running search...");
    const ajaxJson = await page.evaluate(async () => {
      const html = document.documentElement.innerHTML;
      
      // Grab the nonce
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
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest" // Crucial for WordPress
        },
        body: postBody.toString()
      });
      
      const text = await res.text();
      
      // Safely check if Toyota gave us JSON or an HTML error page
      try {
        return JSON.parse(text);
      } catch (e) {
        return { error: "Not JSON", body: text.substring(0, 300) };
      }
    });

    if (ajaxJson.error) {
      throw new Error(`Toyota returned HTML instead of data. Block reason: \n${ajaxJson.body}`);
    }

    console.log("Found cars! Sending data to Vercel...");
    const VERCEL_URL = process.env.VERCEL_URL; 
    const backendRes = await fetch(`${VERCEL_URL}/api/scan`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CRON_SECRET}`
      },
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
