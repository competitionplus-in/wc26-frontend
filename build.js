const fs = require('fs');
const path = require('path');
// Load dotenv only if we are on our local machine
try {
    require('dotenv').config();
} catch (e) {
    console.log("☁️ Running on Vercel, skipping local .env file...");
}

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

        // 🛠️ ALIAS MAP: Connects short schedule names to official API dictionary names
        const teamAliases = {
            "czechia": "czech republic",
            "turkiye": "turkey"
        };
        
        // Helper to match names securely
        const normalizeName = (name) => {
            let cleanName = name.toLowerCase().replace(/-/g, ' ').trim();
            return teamAliases[cleanName] || cleanName;
        };
        
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
                utcDate: match.fixture.date,
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


// --- 🌐 NEW: GENERATE THE FULL CALENDAR RIBBON ---
        let calendarHTML = '';
        const tourneyStart = new Date('2026-06-11T00:00:00Z');
        const tourneyEnd = new Date('2026-07-19T00:00:00Z');
        
        for (let d = new Date(tourneyStart); d <= tourneyEnd; d.setDate(d.getDate() + 1)) {
            const isoDate = d.toISOString().split('T')[0]; // e.g., 2026-06-11
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
            const dayNum = d.getUTCDate();
            const monthName = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
            
            calendarHTML += `
            <a href="/?date=${isoDate}" class="date-pill" data-date="${isoDate}">
                <span class="day">${dayName}</span><span class="date">${dayNum} ${monthName}</span>
            </a>`;
        }
        

        // 2. Read the template file
        const templatePath = path.join(__dirname, 'template.html');
        let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

        // 3. Generate the Dynamic SEO Match Cards & Crawl Wall
        let matchCardsHTML = '';
        let seoLinksHTML = ''; // 🚀 NEW: The invisible links for Googlebot
        let currentGroup = '';

        schedule.forEach(match => {
            if (match.group !== currentGroup) {
                if (currentGroup !== '') {
                    matchCardsHTML += `\n</section>`; 
                }
                const groupId = createSlug(match.group);
                matchCardsHTML += `\n<section class="group-section" aria-labelledby="header-${groupId}">`;
                matchCardsHTML += `\n<h2 id="header-${groupId}" class="group-header">${match.group}</h2>\n`;
                currentGroup = match.group;
            }

            matchCardsHTML += `
                <a href="/match/${match.date}/${match.slug}" class="match-card" aria-label="${match.home.fullName} vs ${match.away.fullName}">
                    <div class="team-block home">
                        <img src="${match.home.logo}" class="team-flag" alt="${match.home.fullName} Logo" decoding="async">
                        <span class="team-name">${match.home.fullName}</span>
                    </div>
                    
                    <div class="score-block">
                        <span class="score-time">UPCOMING</span>
                        <span class="score-main">v</span>
                    </div>
                    
                    <div class="team-block away">
                        <span class="team-name">${match.away.fullName}</span>
                        <img src="${match.away.logo}" class="team-flag" alt="${match.away.fullName} Logo" decoding="async">
                    </div>

                    <div class="local-time-bar" data-kickoff="${match.utcDate}">
                        <i data-lucide="calendar-clock" aria-hidden="true"></i>
                        <span class="local-date-text">Calculating your local time...</span>
                    </div>
                </a>
            `;

            // 🚀 NEW: Add the keyword-rich text link for SEO
            seoLinksHTML += `<a href="/match/${match.date}/${match.slug}">${match.home.fullName} vs ${match.away.fullName} World Cup 2026</a>\n`;
        });

        matchCardsHTML += `\n</section>`;

        // 4. Create the "public" folder
        const outputDir = path.join(__dirname, 'public');
        if (!fs.existsSync(outputDir)){
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 5. Inject EVERYTHING into the main schedule template
        let finalHTML = htmlTemplate.replace('[[INJECT_MATCHES_HERE]]', matchCardsHTML);
        finalHTML = finalHTML.replace('[[INJECT_CALENDAR_HERE]]', calendarHTML);
        finalHTML = finalHTML.replace('[[INJECT_SEO_LINKS_HERE]]', seoLinksHTML); // 👈 ADD THIS LINE

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

        // 🛠️ THE NEW STANDINGS & SVG INJECTION LOGIC
        if (fs.existsSync(path.join(__dirname, 'standings.html'))) { // 👈 Fixed to plural!
            const standingsDir = path.join(outputDir, 'standings');
            fs.mkdirSync(standingsDir, { recursive: true });
            
            console.log("📊 Fetching official standings from API-Football...");
            let mappedStandings = [];
            
            try {
                const standRes = await fetch("https://v3.football.api-sports.io/standings?league=1&season=2022", {
                    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }
                });
                const standData = await standRes.json();
                
                // Map API-Football's data structure
                if (standData.response && standData.response.length > 0) {
                    const rawGroups = standData.response[0].league.standings;
                    mappedStandings = rawGroups.map(group => {
                        return {
                            name: group[0].group, 
                            teams: group.map(t => ({
                                name: t.team.name,
                                pld: t.all.played,
                                w: t.all.win,
                                d: t.all.draw,
                                l: t.all.lose,
                                gf: t.all.goals.for,
                                ga: t.all.goals.against,
                                gd: t.goalsDiff,
                                pts: t.points,
                                fallbackLogo: t.team.logo
                            }))
                        };
                    });
                } else {
                    throw new Error("No 2026 Standings Available Yet");
                }
            } catch (e) {
                console.log("⚠️ Standings not live yet! Injecting Pitch90 Mock Standings...");
                // MVP Fallback Data
                mappedStandings = [
                    {
                        name: "Group A",
                        teams: [
                            { name: "Mexico", pld: 1, w: 1, d: 0, l: 0, gf: 2, ga: 0, gd: 2, pts: 3, fallbackLogo: "" },
                            { name: "South Africa", pld: 1, w: 0, d: 0, l: 1, gf: 0, ga: 2, gd: -2, pts: 0, fallbackLogo: "" }
                        ]
                    }
                ];
            }

            // Read the raw HTML
            let standingsTemplate = fs.readFileSync(path.join(__dirname, 'standings.html'), 'utf8'); // 👈 Fixed to plural!
            
            // Inject BOTH the SVG Dictionary and the Standings Data
            standingsTemplate = standingsTemplate.replace('[[INJECT_FLAG_DICTIONARY_HERE]]', JSON.stringify(flagMap || {}));
            standingsTemplate = standingsTemplate.replace('[[INJECT_STANDINGS_HERE]]', JSON.stringify(mappedStandings));
            
            fs.writeFileSync(path.join(standingsDir, 'index.html'), standingsTemplate);
            console.log("✅ Physically generated the /standings directory with API Data & SVGs!");
        }

        // 🛠️ THE NEW STATS & SVG INJECTION LOGIC
        if (fs.existsSync(path.join(__dirname, 'stats.html'))) {
            const statsDir = path.join(outputDir, 'stats');
            fs.mkdirSync(statsDir, { recursive: true });

            console.log("📈 Fetching official player stats from API-Football...");
            let mappedStats = { topScorers: [], topAssists: [], cleanSheets: [] };

            try {
                // Fetch Top Scorers (Using 2022 for testing purposes)
                const scorersRes = await fetch("https://v3.football.api-sports.io/players/topscorers?league=1&season=2022", {
                    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }
                });
                const scorersData = await scorersRes.json();

                // Fetch Top Assists
                const assistsRes = await fetch("https://v3.football.api-sports.io/players/topassists?league=1&season=2022", {
                    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }
                });
                const assistsData = await assistsRes.json();

                if (scorersData.response && scorersData.response.length > 0) {
                    mappedStats.topScorers = scorersData.response.slice(0, 5).map(item => ({
                        name: item.player.name,
                        teamName: item.statistics[0].team.name,
                        value: item.statistics[0].goals.total,
                        fallbackLogo: item.statistics[0].team.logo
                    }));
                }

                if (assistsData.response && assistsData.response.length > 0) {
                    mappedStats.topAssists = assistsData.response.slice(0, 5).map(item => ({
                        name: item.player.name,
                        teamName: item.statistics[0].team.name,
                        value: item.statistics[0].goals.assists,
                        fallbackLogo: item.statistics[0].team.logo
                    }));
                }

                // API-Football doesn't have a direct "Clean Sheets" endpoint for individuals,
                // so we mock this section for the MVP.
                mappedStats.cleanSheets = [
                    { name: "E. Martínez", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" },
                    { name: "Y. Bounou", teamName: "Morocco", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/31.png" },
                    { name: "J. Pickford", teamName: "England", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/10.png" }
                ];

            } catch (e) {
                console.log("⚠️ Stats not live yet! Injecting Pitch90 Mock Stats...");
            }

            // Read the raw HTML
            let statsTemplate = fs.readFileSync(path.join(__dirname, 'stats.html'), 'utf8');
            
            // Inject BOTH the SVG Dictionary and the Stats Data
            statsTemplate = statsTemplate.replace('[[INJECT_FLAG_DICTIONARY_HERE]]', JSON.stringify(flagMap || {}));
            statsTemplate = statsTemplate.replace('[[INJECT_STATS_HERE]]', JSON.stringify(mappedStats));
            
            fs.writeFileSync(path.join(statsDir, 'index.html'), statsTemplate);
            console.log("✅ Physically generated the /stats directory with API Data & SVGs!");
        }

        console.log("✅ Successfully generated API-driven website in the /public folder!");

    } catch (error) {
        console.error("❌ Build Failed:", error.message);
        process.exit(1); 
    }
})();
