const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  console.log("Launching Stealth Browser...");
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    // The exact URL with all your filters applied
    const searchUrl = "https://toyota-select.co.il/catalog/?category=425&min_year=2023&max_year=2030&min_price=0&max_price=190000&min_maz_oz=0&max_maz_oz=100000&selectGrade%5B%5D=219&selectGrade%5B%5D=217";

    console.log("Navigating directly to filtered catalog...");
    // networkidle2 waits until the network is quiet, giving the page time to load completely
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log("Waiting 5 seconds for React/WordPress to render the cars...");
    await new Promise(r => setTimeout(r, 5000));
    
    // Check if Imperva completely blocked the GitHub IP from viewing the page at all
    const html = await page.content();
    if (html.includes("Incapsula_Resource") || html.includes("<html style=\"height:100%\">")) {
      throw new Error("Imperva hard-blocked the GitHub IP. The security check could not be bypassed.");
    }

    console.log("Page loaded! Extracting car elements...");
    const results = await page.evaluate(() => {
      // Find all the unique URL text blocks
      const copyLinks = document.querySelectorAll('.copy-this-text');
      const htmlChunks = [];

      copyLinks.forEach(el => {
         let container = el;
         // Walk up 6 levels in the DOM to capture the entire HTML card for this car
         for(let i = 0; i < 6; i++) {
            if(container.parentElement) container = container.parentElement;
         }
         htmlChunks.push({ product_html: container.innerHTML });
      });

      return htmlChunks;
    });

    console.log(`Extracted ${results.length} cars from the DOM.`);

    console.log("Sending data to Vercel...");
    const VERCEL_URL = process.env.VERCEL_URL; 
    const backendRes = await fetch(`${VERCEL_URL}/api/scan`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CRON_SECRET}`
      },
      // Package the data exactly how your Vercel API expects it
      body: JSON.stringify({ 
        ajaxData: { data: { results } } 
      })
    });
    
    const resultText = await backendRes.text();
    try {
      console.log("Vercel Result:", JSON.parse(resultText));
    } catch (e) {
      console.log("Vercel returned non-JSON:", resultText);
    }

  } catch (err) {
    console.error("Scraping failed:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
