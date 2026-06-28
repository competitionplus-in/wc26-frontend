const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

try {
    require('dotenv').config();
} catch (e) {
    console.log("☁️ Running on Vercel, skipping local .env file...");
}

// Define your site URL globally so it can be used everywhere
const SITE_URL = "https://pitch90.vercel.app"; 

console.log("🚀 Starting Pitch90 Automated SEO Build Process...");

(async () => {
    try {
        const cacheFile = path.join(__dirname, 'cached_schedule.json');
        let data = null;

        // 🛡️ 1. CACHE SANITIZATION
        if (fs.existsSync(cacheFile)) {
            try {
                const rawCache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                if (rawCache.response && Array.isArray(rawCache.response) && rawCache.response.length > 0) {
                    console.log("📂 Found valid local cached schedule!");
                    data = rawCache;
                } else {
                    console.log("⚠️ Cached schedule is corrupt or empty. Ignoring bad cache.");
                }
            } catch (e) {
                console.log("⚠️ Could not read cached schedule. Ignoring.");
            }
        }

        // 🛡️ 2. FETCH OR MOCK
        if (!data) {
            console.log("📡 Fetching official schedule from API-Football...");
            try {
                const response = await fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026", {
                    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }
                });
                if (!response.ok) throw new Error(`API request failed: ${response.status}`);
                const fetchedData = await response.json();

                if (!fetchedData.response || fetchedData.response.length === 0) {
                    throw new Error("2026 Schedule not released yet!");
                } else {
                    data = fetchedData;
                    fs.writeFileSync(cacheFile, JSON.stringify(data));
                }
            } catch (err) {
                console.log("⚠️ API fetch failed! Injecting Vercel Mock Data...");
                data = {
                    response: [
                        {
                            fixture: { date: "2026-06-11T15:00:00+00:00" },
                            league: { round: "Group A" },
                            teams: { home: { name: "Mexico", logo: "https://media.api-sports.io/football/teams/16.png" }, away: { name: "South Africa", logo: "https://media.api-sports.io/football/teams/14.png" } }
                        },
                        {
                            fixture: { date: "2026-06-12T15:00:00+00:00" },
                            league: { round: "Group B" },
                            teams: { home: { name: "Canada", logo: "https://media.api-sports.io/football/teams/5529.png" }, away: { name: "Bosnia", logo: "https://media.api-sports.io/football/teams/1183.png" } }
                        },
                        {
                            fixture: { date: "2026-06-12T19:00:00+00:00" },
                            league: { round: "Group D" },
                            teams: { home: { name: "USA", logo: "https://media.api-sports.io/football/teams/2384.png" }, away: { name: "Paraguay", logo: "https://media.api-sports.io/football/teams/11.png" } }
                        }
                    ]
                };
            }
        }

        const flagsCacheFile = path.join(__dirname, 'cached_flags.json');
        let flagMap = {};
        
        // 🛡️ UNIVERSAL TEAM NAME DICTIONARY
        const teamAliases = { 
            "czechia": "czech republic", 
            "turkiye": "turkey",
            "bosnia and herzegovina": "bosnia",
            "dr congo": "congo dr",
            "cote d'ivoire": "ivory coast"
        };
        
        const normalizeName = (name) => {
            let cleanName = name.toLowerCase()
                                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                                .replace(/-/g, ' ')
                                .trim();
            return teamAliases[cleanName] || cleanName;
        };

        if (fs.existsSync(flagsCacheFile)) {
            try {
                const rawFlags = JSON.parse(fs.readFileSync(flagsCacheFile, 'utf8'));
                if (Object.keys(rawFlags).length > 0) {
                    console.log("📂 Found valid local cached Flags dictionary!");
                    flagMap = rawFlags;
                }
            } catch (e) {}
        } 
        
        if (Object.keys(flagMap).length === 0) {
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

        let schedule = data.response.map(match => {
            const dateStr = match.fixture.date.substring(0, 10);
            const homeName = match.teams.home.name;
            const awayName = match.teams.away.name;
            
            let matchSlug = `${createSlug(homeName)}-vs-${createSlug(awayName)}`;
            if (homeName.toUpperCase() === "TBD" || awayName.toUpperCase() === "TBD" || homeName === awayName) {
                matchSlug += `-${match.fixture.id || Math.floor(Math.random() * 10000)}`;
            }

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

        // --- STANDINGS PRE-FETCH ---
        let mappedStandings = [];
        let mappedBracket = [];
        let mappedThirdPlace = {}; // 🚀 NEW
        const outputDir = path.join(__dirname, 'public');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const standingsCache = path.join(__dirname, 'cached_standings.json');
        if (fs.existsSync(standingsCache)) {
            try {
                const raw = fs.readFileSync(standingsCache, 'utf8');
                const parsedData = JSON.parse(raw);
                if (Array.isArray(parsedData)) {
                    mappedStandings = parsedData;
                } else {
                    mappedStandings = parsedData.groups || [];
                    mappedBracket = parsedData.bracket || [];
                    mappedThirdPlace = parsedData.thirdPlaceRankingTable || {}; // 🚀 NEW
                }                
            } catch(e) {}
        }
        if (!mappedStandings || mappedStandings.length === 0) {
            mappedStandings = [{ name: "Group A", teams: [] }];
        }

        // 🚀 NEW: Append known Knockout Bracket matches into the primary schedule engine
        mappedBracket.forEach(round => {
            round.matches.forEach(match => {
                if (match.team1 !== "TBD" && match.team2 !== "TBD") {
                    const dateStr = match.utcDate.substring(0, 10);
                    const homeName = match.team1;
                    const awayName = match.team2;
                    const matchSlug = `${createSlug(homeName)}-vs-${createSlug(awayName)}`;
                    
                    schedule.push({
                        date: dateStr,
                        slug: matchSlug,
                        utcDate: match.utcDate,
                        group: round.round,
                        home: { fullName: homeName, logo: flagMap[normalizeName(homeName)] || '' },
                        away: { fullName: awayName, logo: flagMap[normalizeName(awayName)] || '' }
                    });
                }
            });
        });

        // Ensure schedule is strictly sorted chronologically after merging
        schedule.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));


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
        let seoLinksHTML = ''; 
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

            if (!match.slug.includes('tbd')) {
                seoLinksHTML += `<li><a href="/match/${match.date}/${match.slug}">${match.home.fullName} vs ${match.away.fullName} World Cup 2026</a></li>\n`;
            }
        });

        matchCardsHTML += `\n</section>`;

        const templatePath = path.join(__dirname, 'template.html');
        let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

        const ogDir = path.join(outputDir, 'og');
        if (!fs.existsSync(ogDir)) fs.mkdirSync(ogDir, { recursive: true });

        // 🚀 DYNAMIC OG IMAGE GENERATOR
        async function generateOGImage(homeLogoUrl, awayLogoUrl, matchSlug) {
            const ogPath = path.join(ogDir, `${matchSlug}.png`);
            if (fs.existsSync(ogPath)) return; 

            try {
                const [homeRes, awayRes] = await Promise.all([ fetch(homeLogoUrl), fetch(awayLogoUrl) ]);
                const homeBuffer = await homeRes.arrayBuffer();
                const awayBuffer = await awayRes.arrayBuffer();

                const homeImg = await sharp(Buffer.from(homeBuffer)).resize(300, 300, { fit: 'contain', background: {r:0,g:0,b:0,alpha:0} }).toBuffer();
                const awayImg = await sharp(Buffer.from(awayBuffer)).resize(300, 300, { fit: 'contain', background: {r:0,g:0,b:0,alpha:0} }).toBuffer();

                const overlaySvg = Buffer.from(`
                    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
                        <text x="600" y="100" font-family="Arial, sans-serif" font-size="35" font-weight="bold" fill="#cbd5e1" text-anchor="middle" letter-spacing="4">PITCH90 LIVE MATCH CENTER</text>
                        <text x="600" y="340" font-family="Arial, sans-serif" font-size="80" font-weight="bold" fill="#2563eb" text-anchor="middle">VS</text>
                        <text x="600" y="550" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="#ffffff" text-anchor="middle">FIFA WORLD Cup 2026</text>
                    </svg>
                `);

                await sharp({
                    create: { width: 1200, height: 630, channels: 4, background: '#0f172a' }
                })
                .composite([
                    { input: homeImg, top: 165, left: 150 },
                    { input: awayImg, top: 165, left: 750 },
                    { input: overlaySvg, top: 0, left: 0 }
                ])
                .toFile(ogPath);
                
                console.log(`📸 Generated OG Image for: ${matchSlug}`);
            } catch (e) {
                console.log(`⚠️ Failed to generate OG image for ${matchSlug}`);
            }
        }

        // --- HOMEPAGE BUILD ---
        let finalHTML = htmlTemplate.replace('[[INJECT_MATCHES_HERE]]', matchCardsHTML);
        finalHTML = finalHTML.replace('[[INJECT_CALENDAR_HERE]]', calendarHTML);
        finalHTML = finalHTML.replace('[[INJECT_SEO_LINKS_HERE]]', seoLinksHTML);
        fs.writeFileSync(path.join(outputDir, 'index.html'), finalHTML);





        

        // 🚀 NEW: Create a dictionary mapping teams to their latest match URLs
        const teamMatchUrls = {};
        schedule.forEach(match => {
            if (!match.slug.includes('tbd')) {
                const matchUrl = `/match/${match.date}/${match.slug}`;
                teamMatchUrls[normalizeName(match.home.fullName)] = matchUrl;
                teamMatchUrls[normalizeName(match.away.fullName)] = matchUrl;
            }
        });

        // --- STANDINGS BUILD ---
        if (fs.existsSync(path.join(__dirname, 'standings.html'))) { 
            const standingsDir = path.join(outputDir, 'standings');
            fs.mkdirSync(standingsDir, { recursive: true });
            
            // 🚀 NEW: Decorate the bracket matches with static URLs if both teams are declared
            const decoratedBracket = mappedBracket.map(round => ({
                ...round,
                matches: round.matches.map(match => {
                    if (match.team1 !== "TBD" && match.team2 !== "TBD" && match.team1 !== match.team2) {
                        const dateStr = match.utcDate.substring(0, 10);
                        const matchSlug = `${createSlug(match.team1)}-vs-${createSlug(match.team2)}`;
                        return {
                            ...match,
                            matchUrl: `/match/${dateStr}/${matchSlug}`
                        };
                    }
                    return match;
                })
            }));

            let standingsTemplate = fs.readFileSync(path.join(__dirname, 'standings.html'), 'utf8'); 
            standingsTemplate = standingsTemplate.replace('[[INJECT_FLAG_DICTIONARY_HERE]]', JSON.stringify(flagMap || {}));
            standingsTemplate = standingsTemplate.replace('[[INJECT_STANDINGS_HERE]]', JSON.stringify(mappedStandings));
            standingsTemplate = standingsTemplate.replace('[[INJECT_BRACKET_HERE]]', JSON.stringify(decoratedBracket)); // Use decorated array
            
            standingsTemplate = standingsTemplate.replace('[[INJECT_THIRD_PLACE_HERE]]', JSON.stringify(mappedThirdPlace));
            standingsTemplate = standingsTemplate.replace('[[INJECT_TEAM_URLS_HERE]]', JSON.stringify(teamMatchUrls)); // 🚀 NEW INJECTION
            standingsTemplate = standingsTemplate.replace('[[INJECT_BUILD_TIME_HERE]]', new Date().toISOString());



            
            
            fs.writeFileSync(path.join(standingsDir, 'index.html'), standingsTemplate);
            console.log("✅ Physically generated the /standings directory.");
        }

        // --- MATCH PAGES BUILD ---
        if (fs.existsSync(path.join(__dirname, 'match.html'))) {
            const matchTemplate = fs.readFileSync(path.join(__dirname, 'match.html'), 'utf8');

            let bulkMatchData = {};
            console.log("📡 Waking up backend to fetch bulk match states for SSG hydration...");
            const allMatchIds = schedule.map(m => `${m.slug}-${m.date}`).filter(id => !id.includes('tbd'));
            
            for(let attempts = 1; attempts <= 4; attempts++) {
                try {
                    const bulkRes = await fetch(`https://wc26-backend-kd7l.onrender.com/api/live-matches-bulk?ids=${allMatchIds.join(',')}`, {
                        headers: { "Authorization": process.env.ADMIN_PASSWORD || "super-secret-world-cup" } 
                    });
                    
                    if (bulkRes.ok) {
                        bulkMatchData = await bulkRes.json();
                        console.log(`✅ Successfully pulled ${Object.keys(bulkMatchData).length} match states from database.`);
                        break; 
                    } else {
                        console.log(`⚠️ Backend returned ${bulkRes.status}. Retrying...`);
                    }
                } catch (err) {
                    console.log(`⏳ Server waking up (Attempt ${attempts}/4). Waiting 12 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 12000));
                }
            }

            for (const match of schedule) {
                // 🛑 🚀 NEW FIX: Skip folder generation entirely for TBD matches to save Vercel build time!
                if (match.slug.includes('tbd')) continue;

                const matchDir = path.join(outputDir, 'match', match.date, match.slug);
                fs.mkdirSync(matchDir, { recursive: true });

                await generateOGImage(match.home.logo, match.away.logo, match.slug);

                let matchHTML = matchTemplate;

                const matchUrl = `${SITE_URL}/match/${match.date}/${match.slug}`;
                const ogImageUrl = `${SITE_URL}/og/${match.slug}.png`;
                
                
                
                
                
                
                matchHTML = matchHTML.replace('[[INJECT_FLAG_DICTIONARY_HERE]]', JSON.stringify(flagMap || {})); // 🚀 NEW
                matchHTML = matchHTML.replace(/\[\[MATCH_URL\]\]/g, matchUrl);
                matchHTML = matchHTML.replace(/\[\[MATCH_OG_IMAGE\]\]/g, ogImageUrl);
                matchHTML = matchHTML.replace(/\[\[HOME_NAME\]\]/g, match.home.fullName);
                matchHTML = matchHTML.replace(/\[\[AWAY_NAME\]\]/g, match.away.fullName);
                matchHTML = matchHTML.replace(/\[\[HOME_LOGO\]\]/g, match.home.logo);
                matchHTML = matchHTML.replace(/\[\[AWAY_LOGO\]\]/g, match.away.logo);
                matchHTML = matchHTML.replace(/\[\[MATCH_GROUP\]\]/g, match.group);

                // --- 🚀 NEW: DYNAMIC SEO INJECTION ---
                let matchStatus = 'pre-match';
                let homeScoreStr = "";
                let awayScoreStr = "";
                
                const matchId = `${match.slug}-${match.date}`;
                let initialDataScript = `<script>window.__INITIAL_MATCH_DATA__ = null;</script>`;
                
                if (bulkMatchData[matchId]) {
                    matchStatus = bulkMatchData[matchId].setup?.status || 'pre-match';
                    homeScoreStr = bulkMatchData[matchId].homeScore || 0;
                    awayScoreStr = bulkMatchData[matchId].awayScore || 0;
                    
                    if (matchStatus === 'post-match') {
                        initialDataScript = `<script>window.__INITIAL_MATCH_DATA__ = ${JSON.stringify(bulkMatchData[matchId])};</script>`;
                        console.log(`🏆 Baked static data for completed match: ${matchId}`);
                    }
                }

                let seoTitle, seoDesc, seoKeywords;

                if (matchStatus === 'live') {
                    seoTitle = `🔴 LIVE: ${match.home.fullName} ${homeScoreStr}-${awayScoreStr} ${match.away.fullName} Live Score & Tracker | Pitch90`;
                    seoDesc = `Live score updates! Follow ${match.home.fullName} vs ${match.away.fullName} live text commentary, match event timeline, and instant stats. Current Score: ${match.home.fullName} ${homeScoreStr}-${awayScoreStr} ${match.away.fullName}.`;
                    seoKeywords = `live score ${match.home.fullName} vs ${match.away.fullName}, world cup live tracker, current football score, ${match.home.fullName} match updates`;
                } else if (matchStatus === 'post-match') {
                    seoTitle = `${match.home.fullName} ${homeScoreStr}-${awayScoreStr} ${match.away.fullName} Final Result & Text Highlights | Pitch90`;
                    seoDesc = `Full-time report! Check out the final result, goal scorers, match stats, and definitive text highlights for ${match.home.fullName} vs ${match.away.fullName}. Final score: ${homeScoreStr}-${awayScoreStr}.`;
                    seoKeywords = `${match.home.fullName} vs ${match.away.fullName} highlights, final score ${match.home.fullName} vs ${match.away.fullName}, who won ${match.home.fullName} vs ${match.away.fullName}, goals stats`;
                } else {
                    // pre-match
                    seoTitle = `${match.home.fullName} vs ${match.away.fullName} Preview, Kick-Off Time & Predictions | Pitch90`;
                    seoDesc = `Catch the preview, predicted lineups, win probabilities, and kick-off details for ${match.home.fullName} vs ${match.away.fullName} in the FIFA World Cup 2026.`;
                    seoKeywords = `${match.home.fullName} vs ${match.away.fullName} preview, world cup 2026 ${match.group.toLowerCase()}, when does ${match.home.fullName} play ${match.away.fullName}, prediction`;
                }

                // Replace the static tags in match.html with the dynamic ones
                matchHTML = matchHTML.replace('<title>[[HOME_NAME]] vs [[AWAY_NAME]] Live Score & Stats | World Cup 2026 [[MATCH_GROUP]]</title>', `<title>${seoTitle}</title>`);
                matchHTML = matchHTML.replace('<meta name="description" content="Get real-time live scores, timeline events, and match stats for [[HOME_NAME]] vs [[AWAY_NAME]] in the 2026 World Cup [[MATCH_GROUP]].">', `<meta name="description" content="${seoDesc}">`);
                matchHTML = matchHTML.replace('<meta name="keywords" content="[[HOME_NAME]] vs [[AWAY_NAME]], world cup 2026, [[MATCH_GROUP]], live football match, live score, match center">', `<meta name="keywords" content="${seoKeywords}">`);
                
                // Add "Highlights" to the Timeline section header for better DOM indexing
                matchHTML = matchHTML.replace('<h3 class="sr-only">Match Events Timeline</h3>', '<h3 class="sr-only">Match Events Timeline and Highlights</h3>');

                matchHTML = matchHTML.replace('</head>', `${initialDataScript}\n</head>`);





                

                

                const groupData = mappedStandings.find(g => g.name === match.group);
                let groupHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Standings will synchronize here shortly...</td></tr>';

                if (groupData) {
                    groupHTML = groupData.teams.map((team, index) => {
                        const isQualified = index < 2; 
                        const rowClass = isQualified ? 'row-qualified' : '';
                        const displayGD = team.gd > 0 ? `+${team.gd}` : team.gd;
                        
                        // 🚀 FIXED: Route the team name through the alias dictionary!
                        const cleanName = normalizeName(team.name);
                        const flagSrc = flagMap[cleanName] || team.fallbackLogo || '';
                        
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

                matchHTML = matchHTML.replace('[[INJECT_MATCH_STANDINGS_HERE]]', groupHTML);
                fs.writeFileSync(path.join(matchDir, 'index.html'), matchHTML);
            }
            console.log("✅ Physically generated dynamic match directories WITH injected SEO data and Live Standings!");
        }

// --- STATS BUILD ---
        if (fs.existsSync(path.join(__dirname, 'stats.html'))) {
            const statsDir = path.join(outputDir, 'stats');
            fs.mkdirSync(statsDir, { recursive: true });
            
            const statsCache = path.join(__dirname, 'cached_stats.json');
            let mappedStats = { topScorers: [], topAssists: [], cleanSheets: [], yellowCards: [], redCards: [] };

            let statsLoaded = false;
            if (fs.existsSync(statsCache)) {
                try {
                    const rawStats = JSON.parse(fs.readFileSync(statsCache, 'utf8'));
                    if (rawStats.topScorers && rawStats.topScorers.length > 0) {
                        mappedStats = rawStats;
                        statsLoaded = true;
                    }
                } catch(e) {
                    console.log("⚠️ cached_stats.json is corrupted. Ignoring.");
                }
            }
            
            // Only try to fetch if we don't have valid cached data
            if (!statsLoaded) {
                try {
                    console.log("📈 Fetching official player stats from API-Football...");
                    
                    // Note: Ensure the API parameters are updated to 2026 when the tournament begins!
                    const fetchOpts = { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } };
                    
                    const [scorersRes, assistsRes, yellowRes, redRes] = await Promise.all([
                        fetch("https://v3.football.api-sports.io/players/topscorers?league=1&season=2022", fetchOpts),
                        fetch("https://v3.football.api-sports.io/players/topassists?league=1&season=2022", fetchOpts),
                        fetch("https://v3.football.api-sports.io/players/topyellowcards?league=1&season=2022", fetchOpts),
                        fetch("https://v3.football.api-sports.io/players/topredcards?league=1&season=2022", fetchOpts)
                    ]);

                    const [scorersData, assistsData, yellowData, redData] = await Promise.all([
                        scorersRes.json(), assistsRes.json(), yellowRes.json(), redRes.json()
                    ]);

                    // Map the results only if the API returned valid arrays
                    if (scorersData.response?.length > 0) {
                        mappedStats.topScorers = scorersData.response.slice(0, 10).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name, value: item.statistics[0].goals.total, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    if (assistsData.response?.length > 0) {
                        mappedStats.topAssists = assistsData.response.slice(0, 10).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name, value: item.statistics[0].goals.assists, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    if (yellowData.response?.length > 0) {
                        mappedStats.yellowCards = yellowData.response.slice(0, 10).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name, value: item.statistics[0].cards.yellow, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    if (redData.response?.length > 0) {
                        mappedStats.redCards = redData.response.slice(0, 10).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name, value: item.statistics[0].cards.red, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    
                    // Custom mapping for Goalkeepers since API-Football handles clean sheets poorly
                    mappedStats.cleanSheets = [
                        { name: "E. Martínez", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" },
                        { name: "Y. Bounou", teamName: "Morocco", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/31.png" },
                        { name: "J. Pickford", teamName: "England", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/10.png" }
                    ];

                    // 🛡️ CRITICAL FIX: Only save to cache if we actually got real data!
                    if (mappedStats.topScorers.length > 0) {
                        fs.writeFileSync(statsCache, JSON.stringify(mappedStats, null, 2));
                        console.log("💾 Saved fresh player stats to cached_stats.json");
                    } else { 
                        throw new Error("API returned empty data arrays."); 
                    }

                } catch (e) {
                    console.log(`⚠️ Stats API Failed (${e.message}). Injecting Pitch90 Mock Stats...`);
                    // If everything fails and we have NO cache, inject the placeholders
                    mappedStats = {
                        topScorers: [{ name: "K. Mbappé", teamName: "France", value: 8, fallbackLogo: "https://media.api-sports.io/football/teams/773.png" }],
                        topAssists: [{ name: "L. Messi", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" }],
                        cleanSheets: [{ name: "E. Martínez", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" }],
                        yellowCards: [{ name: "M.. Acuña", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" }],
                        redCards: [{ name: "D. Dumfries", teamName: "Netherlands", value: 1, fallbackLogo: "https://media.api-sports.io/football/teams/1118.png" }]
                    };
                    // Do NOT write mock data to the cache file. This ensures it retries the API on the next build!
                }
            }

            let statsTemplate = fs.readFileSync(path.join(__dirname, 'stats.html'), 'utf8');
            statsTemplate = statsTemplate.replace('[[INJECT_FLAG_DICTIONARY_HERE]]', JSON.stringify(flagMap || {}));
            statsTemplate = statsTemplate.replace('[[INJECT_STATS_HERE]]', JSON.stringify(mappedStats));
            statsTemplate = statsTemplate.replace('[[INJECT_BUILD_TIME_HERE]]', new Date().toISOString());

            fs.writeFileSync(path.join(statsDir, 'index.html'), statsTemplate);
            console.log("✅ Physically generated the /stats directory.");
        }


        

        // 🚀 4. GENERATE SEO SITEMAP & ROBOTS.TXT
        console.log("🗺️ Generating SEO Sitemap...");
        
        const today = new Date().toISOString().split('T')[0];

        let sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        sitemapXML += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

        // Add Core Pages (Home, Standings, Stats)
        const staticPages = [
            { path: '', priority: '1.0', freq: 'hourly' },
            { path: '/standings', priority: '0.9', freq: 'daily' },
            { path: '/stats', priority: '0.9', freq: 'daily' }
        ];

        staticPages.forEach(page => {
            sitemapXML += `  <url>\n`;
            sitemapXML += `    <loc>${SITE_URL}${page.path}</loc>\n`;
            sitemapXML += `    <lastmod>${today}</lastmod>\n`;
            sitemapXML += `    <changefreq>${page.freq}</changefreq>\n`;
            sitemapXML += `    <priority>${page.priority}</priority>\n`;
            sitemapXML += `  </url>\n`;
        });

        // Add All Dynamic Match Pages (Excluding TBDs)
        schedule.forEach(match => {
            if (match.slug.includes('tbd')) return; // 🛑 Skip TBD matches
            
            sitemapXML += `  <url>\n`;
            sitemapXML += `    <loc>${SITE_URL}/match/${match.date}/${match.slug}</loc>\n`;
            sitemapXML += `    <lastmod>${today}</lastmod>\n`;
            sitemapXML += `    <changefreq>always</changefreq>\n`;
            sitemapXML += `    <priority>0.8</priority>\n`;
            sitemapXML += `  </url>\n`;
        });

        sitemapXML += `</urlset>`;

        // Save sitemap.xml
        fs.writeFileSync(path.join(outputDir, 'sitemap.xml'), sitemapXML);
        
        // Save robots.txt
        const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml`;
        fs.writeFileSync(path.join(outputDir, 'robots.txt'), robotsTxt);
        
        console.log(`✅ Generated sitemap.xml and robots.txt with ${schedule.length + staticPages.length} pages!`);

        // Copy the self-hosted Lucide icons to the public folder
        const lucideSrc = path.join(__dirname, 'lucide.min.js');
        const lucideDest = path.join(outputDir, 'lucide.min.js');
        if (fs.existsSync(lucideSrc)) {
            fs.copyFileSync(lucideSrc, lucideDest);
            console.log("✅ Successfully copied lucide.min.js to public folder!");
        } else {
            console.log("⚠️ lucide.min.js not found in root. Make sure you downloaded it!");
        }
        
        console.log("✅ Successfully generated API-driven website in the /public folder!");

    } catch (error) {
        console.error("❌ Build Failed:", error.message);
        process.exit(1); 
    }
})();
