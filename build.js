const fs = require('fs');
const path = require('path');

try {
    require('dotenv').config();
} catch (e) {
    console.log("☁️ Running on Vercel, skipping local .env file...");
}

console.log("🚀 Starting Pitch90 Automated SEO Build Process...");

(async () => {
    try {
        const cacheFile = path.join(__dirname, 'cached_schedule.json');
        let data;

        if (fs.existsSync(cacheFile)) {
            console.log("📂 Found local cached schedule! Skipping API call.");
            data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        } else {
            console.log("📡 Fetching official schedule from API-Football...");
            const response = await fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026", {
                headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }
            });
            if (!response.ok) throw new Error(`API request failed: ${response.status}`);
            data = await response.json();

            if (!data.response || data.response.length === 0) {
                console.log("⚠️ 2026 Schedule not released yet! Please run generate-schedule.js first.");
                process.exit(1);
            } else {
                fs.writeFileSync(cacheFile, JSON.stringify(data));
            }
        }

        const flagsCacheFile = path.join(__dirname, 'cached_flags.json');
        let flagMap = {};
        const teamAliases = { "czechia": "czech republic", "turkiye": "turkey" };
        
        const normalizeName = (name) => {
            let cleanName = name.toLowerCase().replace(/-/g, ' ').trim();
            return teamAliases[cleanName] || cleanName;
        };
        
        // 🚀 RESTORED: The full SVG Flag Fetching Engine
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
                
                if (flagData.errors && Object.keys(flagData.errors).length > 0) {
                    console.log("⚠️ API Error on flags (Limit reached?):", flagData.errors);
                } else if (flagData.response && Array.isArray(flagData.response)) {
                    flagData.response.forEach(country => {
                        if (country.name && country.flag) {
                            flagMap[normalizeName(country.name)] = country.flag;
                        }
                    });
                    
                    fs.writeFileSync(flagsCacheFile, JSON.stringify(flagMap));
                    console.log(`💾 Saved ${Object.keys(flagMap).length} SVG flags to cached_flags.json!`);
                }
            } catch (e) {
                console.log("⚠️ Could not load SVG flags. Falling back to PNG crests.");
            }
        }
        
        const createSlug = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const schedule = data.response.map(match => {
            const dateStr = match.fixture.date.substring(0, 10);
            const homeName = match.teams.home.name;
            const awayName = match.teams.away.name;
            const matchSlug = `${createSlug(homeName)}-vs-${createSlug(awayName)}`;

            const finalHomeLogo = flagMap[normalizeName(homeName)] || match.teams.home.logo;
            const finalAwayLogo = flagMap[normalizeName(awayName)] || match.teams.away.logo;

            return {
                date: dateStr,
                slug: matchSlug,
                utcDate: match.fixture.date,
                group: match.league.round,
                home: { fullName: homeName, logo: finalHomeLogo },
                away: { fullName: awayName, logo: finalAwayLogo }
            };
        });

        let calendarHTML = '';
        const tourneyStart = new Date('2026-06-11T00:00:00Z');
        const tourneyEnd = new Date('2026-07-19T00:00:00Z');
        
        for (let d = new Date(tourneyStart); d <= tourneyEnd; d.setDate(d.getDate() + 1)) {
            const isoDate = d.toISOString().split('T')[0];
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
            const dayNum = d.getUTCDate();
            const monthName = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
            
            calendarHTML += `
            <a href="/?date=${isoDate}" class="date-pill" data-date="${isoDate}">
                <span class="day">${dayName}</span><span class="date">${dayNum} ${monthName}</span>
            </a>`;
        }

        let matchCardsHTML = '';
        let seoLinksHTML = ''; // 🚀 SEO: The invisible links for Googlebot
        let currentGroup = '';

        schedule.forEach(match => {
            if (match.group !== currentGroup) {
                if (currentGroup !== '') matchCardsHTML += `\n</section>`; 
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

            // 🚀 SEO: Valid list item for the HTML Sitemap
            seoLinksHTML += `<li><a href="/match/${match.date}/${match.slug}">${match.home.fullName} vs ${match.away.fullName} World Cup 2026</a></li>\n`;
        });

        matchCardsHTML += `\n</section>`;

        const templatePath = path.join(__dirname, 'template.html');
        let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

        const outputDir = path.join(__dirname, 'public');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        let finalHTML = htmlTemplate.replace('[[INJECT_MATCHES_HERE]]', matchCardsHTML);
        finalHTML = finalHTML.replace('[[INJECT_CALENDAR_HERE]]', calendarHTML);
        finalHTML = finalHTML.replace('[[INJECT_SEO_LINKS_HERE]]', seoLinksHTML); // 🚀 SEO Injection!

        fs.writeFileSync(path.join(outputDir, 'index.html'), finalHTML);

        // --- 7. THE TRUE SSG FIX (INJECTING MATCH DATA) ---
        if (fs.existsSync(path.join(__dirname, 'match.html'))) {
            // 1. Read the template into memory ONCE
            const matchTemplate = fs.readFileSync(path.join(__dirname, 'match.html'), 'utf8');

            schedule.forEach(match => {
                const matchDir = path.join(outputDir, 'match', match.date, match.slug);
                fs.mkdirSync(matchDir, { recursive: true });

                // 2. Clone the template string
                let matchHTML = matchTemplate;

                // 3. Inject the specific match data globally (using regex /g to replace every instance)
                matchHTML = matchHTML.replace(/\[\[HOME_NAME\]\]/g, match.home.fullName);
                matchHTML = matchHTML.replace(/\[\[AWAY_NAME\]\]/g, match.away.fullName);
                matchHTML = matchHTML.replace(/\[\[HOME_LOGO\]\]/g, match.home.logo);
                matchHTML = matchHTML.replace(/\[\[AWAY_LOGO\]\]/g, match.away.logo);
                matchHTML = matchHTML.replace(/\[\[MATCH_GROUP\]\]/g, match.group);

                // 4. Temporarily clear the Standings placeholder until we link the cache
                matchHTML = matchHTML.replace('[[INJECT_MATCH_STANDINGS_HERE]]', '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Standings will synchronize here shortly...</td></tr>');

                // 5. Write the fully populated HTML file to the public folder
                fs.writeFileSync(path.join(matchDir, 'index.html'), matchHTML);
            });
            console.log("✅ Physically generated dynamic match directories WITH injected SEO data!");
        }

        // 🛠️ THE NEW STANDINGS & SVG INJECTION LOGIC
        if (fs.existsSync(path.join(__dirname, 'standings.html'))) { 
            const standingsDir = path.join(outputDir, 'standings');
            fs.mkdirSync(standingsDir, { recursive: true });
            
            // 🚀 NEW: Setup Local Cache for Standings
            const standingsCache = path.join(__dirname, 'cached_standings.json');
            // 🛠️ 1. LOAD THE STANDINGS CACHE FIRST
        let mappedStandings = [];
        if (fs.existsSync(path.join(__dirname, 'standings.html'))) { 
            const standingsDir = path.join(outputDir, 'standings');
            fs.mkdirSync(standingsDir, { recursive: true });
            
            const standingsCache = path.join(__dirname, 'cached_standings.json');
            
            try {
                let standData;
                if (fs.existsSync(standingsCache)) {
                    console.log("📂 Found local cached Standings! Skipping API call.");
                    standData = JSON.parse(fs.readFileSync(standingsCache, 'utf8'));
                } else {
                    console.log("📊 Fetching official standings from API-Football...");
                    const standRes = await fetch("https://v3.football.api-sports.io/standings?league=1&season=2022", {
                        headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }
                    });
                    standData = await standRes.json();
                    
                    if (standData.errors && Object.keys(standData.errors).length > 0) {
                        console.log("⚠️ API Error on Standings (Limit reached?):", standData.errors);
                    } else if (standData.response && standData.response.length > 0) {
                        fs.writeFileSync(standingsCache, JSON.stringify(standData));
                        console.log("💾 Saved standings to cached_standings.json for future builds!");
                    }
                }
                
                if (standData.response && standData.response.length > 0) {
                    const rawGroups = standData.response[0].league.standings;
                    mappedStandings = rawGroups.map(group => {
                        return {
                            name: group[0].group, 
                            teams: group.map(t => ({
                                name: t.team.name,
                                pld: t.all.played, w: t.all.win, d: t.all.draw, l: t.all.lose,
                                gf: t.all.goals.for, ga: t.all.goals.against, gd: t.goalsDiff, pts: t.points,
                                code: normalizeName(t.team.name) // 👈 Used to map the correct SVG flag
                            }))
                        };
                    });
                } else {
                    throw new Error("Empty response or API limit reached.");
                }
            } catch (e) {
                console.log("⚠️ Injecting Pitch90 Mock Standings (API Limit hit)...");
                mappedStandings = [{ name: "Group A", teams: [ 
                    { name: "Mexico", code: "mexico", pld: 1, w: 1, d: 0, l: 0, gf: 2, ga: 0, gd: 2, pts: 3 },
                    { name: "South Africa", code: "south africa", pld: 1, w: 0, d: 0, l: 1, gf: 0, ga: 2, gd: -2, pts: 0 }
                ]}];
            }

            let standingsTemplate = fs.readFileSync(path.join(__dirname, 'standings.html'), 'utf8'); 
            standingsTemplate = standingsTemplate.replace('[[INJECT_FLAG_DICTIONARY_HERE]]', JSON.stringify(flagMap || {}));
            standingsTemplate = standingsTemplate.replace('[[INJECT_STANDINGS_HERE]]', JSON.stringify(mappedStandings));
            fs.writeFileSync(path.join(standingsDir, 'index.html'), standingsTemplate);
            console.log("✅ Physically generated the /standings directory.");
        }

        // 🚀 2. NOW GENERATE MATCH.HTML WITH THE LOADED STANDINGS
        if (fs.existsSync(path.join(__dirname, 'match.html'))) {
            const matchTemplate = fs.readFileSync(path.join(__dirname, 'match.html'), 'utf8');

            schedule.forEach(match => {
                const matchDir = path.join(outputDir, 'match', match.date, match.slug);
                fs.mkdirSync(matchDir, { recursive: true });

                let matchHTML = matchTemplate;

                matchHTML = matchHTML.replace(/\[\[HOME_NAME\]\]/g, match.home.fullName);
                matchHTML = matchHTML.replace(/\[\[AWAY_NAME\]\]/g, match.away.fullName);
                matchHTML = matchHTML.replace(/\[\[HOME_LOGO\]\]/g, match.home.logo);
                matchHTML = matchHTML.replace(/\[\[AWAY_LOGO\]\]/g, match.away.logo);
                matchHTML = matchHTML.replace(/\[\[MATCH_GROUP\]\]/g, match.group);

                // Find the specific group standings for this match
                const groupData = mappedStandings.find(g => g.name === match.group);
                let groupHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Standings will synchronize here shortly...</td></tr>';

                if (groupData) {
                    groupHTML = groupData.teams.map((team, index) => {
                        const isQualified = index < 2; 
                        const rowClass = isQualified ? 'row-qualified' : '';
                        const displayGD = team.gd > 0 ? `+${team.gd}` : team.gd;
                        const flagSrc = flagMap[team.code] || team.fallbackLogo || '';
                        
                        return `
                            <tr class="${rowClass}">
                                <td class="col-pos">${index + 1}</td>
                                <td>
                                    <div class="team-cell">
                                        <img src="${flagSrc}" alt="${team.name}" decoding="async">
                                        <span>${team.name}</span>
                                    </div>
                                </td>
                                <td class="table-center" style="color: var(--text-muted); font-weight: 500;">${team.pld}</td>
                                <td class="table-center col-gd">${displayGD}</td>
                                <td class="table-center col-pts">${team.pts}</td>
                            </tr>
                        `;
                    }).join('');
                }

                // Inject the generated HTML rows into the template
                matchHTML = matchHTML.replace('[[INJECT_MATCH_STANDINGS_HERE]]', groupHTML);

                fs.writeFileSync(path.join(matchDir, 'index.html'), matchHTML);
            });
            console.log("✅ Physically generated dynamic match directories WITH injected SEO data and Live Standings!");
        }

        // 🛠️ 3. THE NEW STATS & SVG INJECTION LOGIC
        if (fs.existsSync(path.join(__dirname, 'stats.html'))) {
            const statsDir = path.join(outputDir, 'stats');
            fs.mkdirSync(statsDir, { recursive: true });
            
            const statsCache = path.join(__dirname, 'cached_stats.json');
            // 🚀 ADDED: yellowCards and redCards arrays to the payload
            let mappedStats = { topScorers: [], topAssists: [], cleanSheets: [], yellowCards: [], redCards: [] };

            try {
                if (fs.existsSync(statsCache)) {
                    console.log("📂 Found local cached Stats! Skipping API call.");
                    mappedStats = JSON.parse(fs.readFileSync(statsCache, 'utf8'));
                } else {
                    console.log("📈 Fetching official player stats from API-Football...");
                    
                    const scorersRes = await fetch("https://v3.football.api-sports.io/players/topscorers?league=1&season=2022", { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } });
                    const scorersData = await scorersRes.json();

                    const assistsRes = await fetch("https://v3.football.api-sports.io/players/topassists?league=1&season=2022", { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } });
                    const assistsData = await assistsRes.json();

                    // 🚀 NEW: Disciplinary Endpoints
                    const yellowRes = await fetch("https://v3.football.api-sports.io/players/topyellowcards?league=1&season=2022", { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } });
                    const yellowData = await yellowRes.json();

                    const redRes = await fetch("https://v3.football.api-sports.io/players/topredcards?league=1&season=2022", { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } });
                    const redData = await redRes.json();

                    if (scorersData.response && scorersData.response.length > 0) {
                        mappedStats.topScorers = scorersData.response.slice(0, 5).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name,
                            value: item.statistics[0].goals.total, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    if (assistsData.response && assistsData.response.length > 0) {
                        mappedStats.topAssists = assistsData.response.slice(0, 5).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name,
                            value: item.statistics[0].goals.assists, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    if (yellowData.response && yellowData.response.length > 0) {
                        mappedStats.yellowCards = yellowData.response.slice(0, 5).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name,
                            value: item.statistics[0].cards.yellow, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    if (redData.response && redData.response.length > 0) {
                        mappedStats.redCards = redData.response.slice(0, 5).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name,
                            value: item.statistics[0].cards.red, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    
                    // MVP Fallback for Clean Sheets (Since API-Football lacks a direct endpoint for this)
                    mappedStats.cleanSheets = [
                        { name: "E. Martínez", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" },
                        { name: "Y. Bounou", teamName: "Morocco", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/31.png" },
                        { name: "J. Pickford", teamName: "England", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/10.png" }
                    ];

                    if (mappedStats.topScorers.length > 0) {
                        fs.writeFileSync(statsCache, JSON.stringify(mappedStats));
                        console.log("💾 Saved stats to cached_stats.json for future builds!");
                    } else {
                        throw new Error("Empty stats response or API limit reached.");
                    }
                }
            } catch (e) {
                console.log("⚠️ Injecting Pitch90 Mock Stats (API Limit hit)...");
                mappedStats = {
                    topScorers: [{ name: "K. Mbappé", teamName: "France", value: 8, fallbackLogo: "https://media.api-sports.io/football/teams/773.png" }],
                    topAssists: [{ name: "L. Messi", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" }],
                    cleanSheets: [{ name: "E. Martínez", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" }],
                    yellowCards: [{ name: "M. Acuña", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" }],
                    redCards: [{ name: "D. Dumfries", teamName: "Netherlands", value: 1, fallbackLogo: "https://media.api-sports.io/football/teams/1118.png" }]
                };
            }

            let statsTemplate = fs.readFileSync(path.join(__dirname, 'stats.html'), 'utf8');
            statsTemplate = statsTemplate.replace('[[INJECT_FLAG_DICTIONARY_HERE]]', JSON.stringify(flagMap || {}));
            statsTemplate = statsTemplate.replace('[[INJECT_STATS_HERE]]', JSON.stringify(mappedStats));
            fs.writeFileSync(path.join(statsDir, 'index.html'), statsTemplate);
            console.log("✅ Physically generated the /stats directory.");
        }

        console.log("✅ Successfully generated API-driven website in the /public folder!");

    } catch (error) {
        console.error("❌ Build Failed:", error.message);
        process.exit(1); 
    }
})();
