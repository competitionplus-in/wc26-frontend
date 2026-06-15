const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log("🚀 Starting Pitch90 Automated SEO Build Process...");

// Wrap in an async IIFE to allow awaiting the API fetch in standard Node.js
(async () => {
    try {
        const cacheFile = path.join(__dirname, 'cached_schedule.json');
        let data;

        // 1. Check if we already downloaded the schedule before
        if (fs.existsSync(cacheFile)) {
            console.log("📂 Found local cached schedule! Skipping API call.");
            const rawCache = fs.readFileSync(cacheFile, 'utf8');
            data = JSON.parse(rawCache);
        } else {
            // 2. No cache found. We must hit the API.
            console.log("📡 Fetching official schedule from API-Football...");
            const response = await fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026", {
                headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }
            });

            if (!response.ok) throw new Error(`API request failed: ${response.status}`);
            data = await response.json();

            // GRACEFUL 2026 FALLBACK
            if (!data.response || data.response.length === 0) {
                console.log("⚠️ 2026 Schedule not released yet! Injecting Pitch90 MVP Mock Data...");
                
                // Injecting our custom Pitch90 matches so the build doesn't crash
                data = {
                    response: [
                        {
                            fixture: { date: "2026-06-11T15:00:00+00:00" },
                            league: { round: "Group A" },
                            teams: {
                                home: { name: "Mexico", logo: "https://media.api-sports.io/football/teams/16.png" },
                                away: { name: "South Africa", logo: "https://media.api-sports.io/football/teams/14.png" }
                            }
                        },
                        {
                            fixture: { date: "2026-06-12T15:00:00+00:00" },
                            league: { round: "Group B" },
                            teams: {
                                home: { name: "Canada", logo: "https://media.api-sports.io/football/teams/5529.png" },
                                away: { name: "Bosnia", logo: "https://media.api-sports.io/football/teams/1183.png" }
                            }
                        },
                        {
                            fixture: { date: "2026-06-12T19:00:00+00:00" },
                            league: { round: "Group D" },
                            teams: {
                                home: { name: "USA", logo: "https://media.api-sports.io/football/teams/2384.png" },
                                away: { name: "Paraguay", logo: "https://media.api-sports.io/football/teams/11.png" }
                            }
                        }
                    ]
                };
            } else {
                // Only save cache if it's the real API data!
                fs.writeFileSync(cacheFile, JSON.stringify(data));
                console.log("💾 Saved schedule to cached_schedule.json for future builds!");
            }
        }

        // --- NEW: THE SVG FLAG DICTIONARY (FULLY CACHED) ---
        const flagsCacheFile = path.join(__dirname, 'cached_flags.json');
        let flagMap = {};
        
        // Helper to match "South-Africa" (from Flags) to "South Africa" (from Fixtures)
        const normalizeName = (name) => name.toLowerCase().replace(/-/g, ' ').trim();

        if (fs.existsSync(flagsCacheFile)) {
            console.log("📂 Found local cached Flags dictionary! Skipping API call.");
            flagMap = JSON.parse(fs.readFileSync(flagsCacheFile, 'utf8'));
        } else {
            console.log("🎨 Fetching high-resolution SVG Flags dictionary from API...");
            try {
                const flagResponse = await fetch("https://v3.football.api-sports.io/teams/countries", {
                    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }
                });
                const flagData = await flagResponse.json();
                
                // Check if we hit the API limit
                if (flagData.errors && Object.keys(flagData.errors).length > 0) {
                    console.log("⚠️ API Error on flags (Limit reached?):", flagData.errors);
                } else if (flagData.response && Array.isArray(flagData.response)) {
                    // Build the dictionary
                    flagData.response.forEach(country => {
                        if (country.name && country.flag) {
                            flagMap[normalizeName(country.name)] = country.flag;
                        }
                    });
                    
                    // Save the dictionary locally so we never have to fetch it again!
                    fs.writeFileSync(flagsCacheFile, JSON.stringify(flagMap));
                    console.log(`💾 Saved ${Object.keys(flagMap).length} SVG flags to cached_flags.json!`);
                }
            } catch (e) {
                console.log("⚠️ Could not load SVG flags. Falling back to PNG crests.");
            }
        }

        const createSlug = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        // 1. Dynamically Map the API Data
        const schedule = data.response.map(match => {
            const dateStr = match.fixture.date.substring(0, 10);
            const homeName = match.teams.home.name;
            const awayName = match.teams.away.name;
            const matchSlug = `${createSlug(homeName)}-vs-${createSlug(awayName)}`;

            // The Engine: Look up the normalized name. If it exists, use SVG. Otherwise, PNG.
            const finalHomeLogo = flagMap[normalizeName(homeName)] || match.teams.home.logo;
            const finalAwayLogo = flagMap[normalizeName(awayName)] || match.teams.away.logo;

            return {
                date: dateStr,
                slug: matchSlug,
                group: match.league.round,
                home: {
                    name: homeName.substring(0, 3).toUpperCase(),
                    fullName: homeName,
                    logo: finalHomeLogo
                },
                away: {
                    name: awayName.substring(0, 3).toUpperCase(),
                    fullName: awayName,
                    logo: finalAwayLogo
                }
            };
        });

        console.log(`✅ Successfully mapped ${schedule.length} matches with Hybrid Graphics!`);

        // 2. Read the template file
        const templatePath = path.join(__dirname, 'template.html');
        let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

        // 3. Generate the Dynamic SEO Match Cards
        let matchCardsHTML = '';
        let currentGroup = '';

        schedule.forEach(match => {
            if (match.group !== currentGroup) {
                const groupId = createSlug(match.group);
                matchCardsHTML += `\n<section class="group-section" aria-labelledby="header-${groupId}">`;
                matchCardsHTML += `\n<h2 id="header-${groupId}" class="group-header">${match.group}</h2>\n`;
                currentGroup = match.group;
            }

            matchCardsHTML += `
                <a href="/match/${match.date}/${match.slug}" class="match-card" aria-label="${match.home.fullName} vs ${match.away.fullName}">
                    <div class="team-block">
                        <img src="${match.home.logo}" class="team-flag" alt="${match.home.fullName} Logo">
                        <span class="team-name">${match.home.name}</span>
                    </div>
                    
                    <div class="score-block">
                        <span class="score-time" style="font-size: 0.75rem;">VS</span>
                        <span class="score-main">v</span>
                    </div>
                    
                    <div class="team-block away">
                        <span class="team-name">${match.away.name}</span>
                        <img src="${match.away.logo}" class="team-flag" alt="${match.away.fullName} Logo">
                    </div>
                </a>
            `;
        });

        matchCardsHTML += `\n</section>`;

        // 4. Inject the generated cards into the template
        const finalHTML = htmlTemplate.replace('[[INJECT_MATCHES_HERE]]', matchCardsHTML);

        // 5. Create the "public" folder
        const outputDir = path.join(__dirname, 'public');
        if (!fs.existsSync(outputDir)){
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 6. Write the brand new index.html into the 'public' folder
        fs.writeFileSync(path.join(outputDir, 'index.html'), finalHTML);

        // --- 7. THE TRUE SSG FIX ---
        if (fs.existsSync(path.join(__dirname, 'match.html'))) {
            schedule.forEach(match => {
                const matchDir = path.join(outputDir, 'match', match.date, match.slug);
                fs.mkdirSync(matchDir, { recursive: true });
                fs.copyFileSync(path.join(__dirname, 'match.html'), path.join(matchDir, 'index.html'));
            });
            console.log("✅ Physically generated dynamic match directories!");
        }

        if (fs.existsSync(path.join(__dirname, 'standings.html'))) {
            const standingsDir = path.join(outputDir, 'standings');
            fs.mkdirSync(standingsDir, { recursive: true });
            fs.copyFileSync(path.join(__dirname, 'standings.html'), path.join(standingsDir, 'index.html'));
            console.log("✅ Physically generated the /standings directory!");
        }

        if (fs.existsSync(path.join(__dirname, 'stats.html'))) {
            const statsDir = path.join(outputDir, 'stats');
            fs.mkdirSync(statsDir, { recursive: true });
            fs.copyFileSync(path.join(__dirname, 'stats.html'), path.join(statsDir, 'index.html'));
            console.log("✅ Physically generated the /stats directory!");
        }

        console.log("✅ Successfully generated API-driven website in the /public folder!");

    } catch (error) {
        console.error("❌ Build Failed:", error.message);
        process.exit(1); 
    }
})();
