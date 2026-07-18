import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ApifyClient } from 'apify-client';

// Maximize Vercel timeout so Apify and Gemini have time to finish
export const maxDuration = 60; 

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `
You are an expert data cleaning engineer for the Cyberabad Municipal food safety division.
Analyze the provided tweet regarding a food safety drive and extract structural details into JSON.

Instructions:
1. Extract the specific restaurant name.
2. Extract the neighborhood/location name.
3. Calculate percentage: (Hygiene Score X / Total Y) * 100. If missing, estimate: 
   - "Premises closed"/"Severe pest" = "Critical" (30-40%).
   - "Improvement Notice"/minor violations = "Needs Improvement" (60-70%).
4. Isolate individual bullet points under "Violations Identified", "Non-Compliance Observed", or "Observations".

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('secret') !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log("🚀 Starting Vercel Automated Bulk Ingestion...");

  try {
    if (!process.env.APIFY_API_TOKEN) throw new Error("Missing APIFY_API_TOKEN");
    const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
    
    // 1. APIFY SCRAPES THE DATA
    console.log("🤖 Triggering Apify Scraper...");
    const run = await client.actor("maximedupre/twitter-scraper").call({
      "searchQuery": "from:CMC_Offcl",
      "searchMode": "latest",
      "maxNbItemsToScrape": 20 // Keep it small since it runs daily!
    });

    const { items: liveTweets } = await client.dataset(run.defaultDatasetId).listItems();
    let processedCount = 0;

    for (const tweet of liveTweets) {
      const tweetText = (tweet.postText || tweet.text || tweet.full_text || "") as string;
      const tweetDate = (tweet.postDateTime || tweet.created_at || new Date().toISOString()) as string;
      const tweetUrl = (tweet.postUrl || tweet.url || `https://x.com/CMC_Offcl/status/${tweet.postId || tweet.id}`) as string;

      if (!tweetText) continue;

      // 2. MANUAL PRE-FILTER (Saves Gemini Credits!)
      const lowerText = tweetText.toLowerCase();
      const isInspection = lowerText.includes("food safety") || lowerText.includes("violations") || lowerText.includes("hygiene");
      if (!isInspection) continue;

      // 3. DATABASE GUARD (Prevents duplicate API calls)
      const { data: existing } = await supabase
        .from('inspections')
        .select('id')
        .eq('source_url', tweetUrl)
        .single();

      if (existing) continue;

      console.log(`🧠 AI Analyzing new tweet from: ${tweetDate}...`);
      
      try {
        // 4. GIVE IT TO GEMINI AI
        const model = ai.getGenerativeModel({ model: "gemini-flash-lite-latest" }); // using the stable flash model
        const res = await model.generateContent(`${SYSTEM_PROMPT}\n\nTweet: ${tweetText}`);
        
        let responseText = res.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
        const cleanJson = JSON.parse(responseText);

        if (!cleanJson.restaurant_name) continue;

        // 5. INSERT INTO THE TABLE
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
              location: cleanJson.location || 'Cyberabad',
              cuisine: cleanJson.cuisine || 'Multi-Cuisine'
            })
            .select().single();
          restaurant = newRest;
        }

        if (!restaurant) continue;

        await supabase.from('inspections').insert({
          restaurant_id: restaurant.id,
          inspection_date: tweetDate,
          rating_percentage: cleanJson.rating_percentage,
          status: cleanJson.status,
          violations: cleanJson.violations,
          source_url: tweetUrl
        });

        console.log(`💾 Saved data for: ${cleanJson.restaurant_name}`);
        processedCount++;

        // Add a tiny 2-second delay between Gemini calls just to be perfectly safe with rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (aiError) {
        console.error("⚠️ Gemini API or Parsing failed for this tweet. Skipping to next.", aiError);
        // If Gemini fails, it simply logs the error and moves to the next tweet without breaking the whole script!
      }
    }

    return NextResponse.json({ success: true, new_records_ingested: processedCount });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}