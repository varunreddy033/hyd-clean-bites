import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';
import path from 'path';
import ws from 'ws';

// Load environmental variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
);

// Initialize Gemini AI
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `
You are an expert data cleaning engineer for the Cyberabad Municipal food safety division.
Analyze the provided tweet regarding a food safety drive and extract structural details into JSON.

Instructions:
1. Extract the specific restaurant name.
2. Extract the neighborhood/location name.
3. Calculate percentage: (Hygiene Score X / Total Y) * 100. If missing, estimate: 
   - "Premises closed"/"Severe pest" = "Critical" (30-40%).
   - "Improvement Notice"/minor violations = "Needs Improvement" (60-70%).
4. Isolate individual bullet points under "Violations Identified" or "Non-Compliance Observed".

Return ONLY a valid minified JSON object matching this schema. Do not include markdown wraps or backticks.

Schema:
{
  "restaurant_name": "String",
  "location": "String",
  "cuisine": "String or null",
  "rating_percentage": Integer (0-100),
  "status": "String ('Good' | 'Needs Improvement' | 'Critical')",
  "violations": ["String array of specific items"]
}
`;

async function runIngestion() {
  console.log("🚀 Starting Bulk Ingestion (Using Maximedupre Engine)...");

  try {
    if (!process.env.APIFY_API_TOKEN) throw new Error("Missing APIFY_API_TOKEN");
    const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
    
    console.log("🤖 Triggering [maximedupre/twitter-scraper] - No cookies, no approvals required...");
    
    // Using the zero-friction Maximedupre actor
    const run = await client.actor("maximedupre/twitter-scraper").call({
      "searchQuery": "from:CMC_Offcl",
      "searchMode": "latest",
      "maxNbItemsToScrape": 500
    });

    console.log("✅ Scraping complete. Processing timeline...");
    const { items: liveTweets } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`📥 Retrieved ${liveTweets.length} items. Filtering...`);

    for (const tweet of liveTweets) {
      // Maximedupre returns text under 'postText'
      const tweetText = tweet.postText || tweet.text || tweet.full_text || "";
      const tweetDate = tweet.postDateTime || tweet.created_at || new Date().toISOString();
      const tweetUrl = tweet.postUrl || tweet.url || `https://x.com/CMC_Offcl/status/${tweet.postId || tweet.id}`;

      if (!tweetText) continue;

      // Local Filter to save Gemini Credits
      const lowerText = tweetText.toLowerCase();
      const isInspection = lowerText.includes("food safety") || lowerText.includes("violations") || lowerText.includes("non-compliance") || lowerText.includes("hygiene score");
      if (!isInspection) {
         console.log(`⏭️ Skipped irrelevant post.`);
         continue;
      }

      try {
        // Duplicate Check
        const { data: existing } = await supabase
          .from('inspections')
          .select('id')
          .eq('source_url', tweetUrl)
          .single();

        if (existing) {
           console.log(`⚠️ Database Guard: Already processed this URL.`);
           continue;
        }

        console.log(`🧠 AI Analyzing tweet from: ${tweetDate}...`);
        
        const model = ai.getGenerativeModel({ model: "gemini-flash-lite-latest" });
        const res = await model.generateContent(`${SYSTEM_PROMPT}\n\nTweet: ${tweetText}`);
        
        let responseText = res.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
        const cleanJson = JSON.parse(responseText);

        if (!cleanJson.restaurant_name) continue;

        // Upsert Restaurant
        let { data: restaurant } = await supabase
          .from('restaurants')
          .select('id')
          .eq('name', cleanJson.restaurant_name)
          .single();

        if (!restaurant) {
          const { data: newRest } = await supabase
            .from('restaurants')
            .insert({
              name: cleanJson.restaurant_name,
              location: cleanJson.location || 'Hyderabad',
              cuisine: cleanJson.cuisine || 'Multi-Cuisine'
            })
            .select().single();
          restaurant = newRest;
        }

        // Insert Inspection
        await supabase.from('inspections').insert({
          restaurant_id: restaurant.id,
          inspection_date: tweetDate,
          rating_percentage: cleanJson.rating_percentage,
          status: cleanJson.status,
          violations: cleanJson.violations,
          source_url: tweetUrl
        });

        console.log(`💾 Saved data for: ${cleanJson.restaurant_name}`);
      } catch (err) {
        console.error(`❌ Failed item: ${err.message}`);
      }
    }
    console.log("\n🎉 Pipeline Complete!");
  } catch (err) {
    console.error("Pipeline Error:", err.message);
  }
}

runIngestion();