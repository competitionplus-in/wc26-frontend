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
        // Maps all variations from API-Fixtures and API-Standings to the cached_flags.json keys
        const teamAliases = { 
            "czechia": "czech republic", 
            "turkiye": "turkey",
            "bosnia and herzegovina": "bosnia",
            "dr congo": "congo dr",
            "cote d'ivoire": "ivory coast"
        };
        
        const normalizeName = (name) => {
            // Lowercase, strip accents (e.g., "Côte d'Ivoire" -> "cote d'ivoire"), replace hyphens
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

        const schedule = data.response.map(match => {
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

        const outputDir = path.join(__dirname, 'public');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

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
                        <text x="600" y="550" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="#ffffff" text-anchor="middle">FIFA WORLD CUP 2026</text>
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

        // --- STANDINGS BUILD ---
        let mappedStandings = [];
        if (fs.existsSync(path.join(__dirname, 'standings.html'))) { 
            const standingsDir = path.join(outputDir, 'standings');
            fs.mkdirSync(standingsDir, { recursive: true });
            
            const standingsCache = path.join(__dirname, 'cached_standings.json');
            
            // 🛡️ 1. READ CUSTOM MASTER JSON FILE (Bypassing API completely for 2026)
            if (fs.existsSync(standingsCache)) {
                try {
                    console.log("📊 Loading Master Standings from cached_standings.json...");
                    const raw = fs.readFileSync(standingsCache, 'utf8');
                    mappedStandings = JSON.parse(raw);
                } catch(e) {
                    console.log("⚠️ Error reading cached_standings.json", e);
                }
            }

            // 🛡️ 2. EMERGENCY FALLBACK (Prevents build crash if file is missing)
            if (!mappedStandings || mappedStandings.length === 0) {
                console.log("⚠️ Standings file empty! Injecting empty fallback...");
                mappedStandings = [{ name: "Group A", teams: [] }];
            }

            // 🛡️ 3. INJECT INTO HTML
            let standingsTemplate = fs.readFileSync(path.join(__dirname, 'standings.html'), 'utf8'); 
            standingsTemplate = standingsTemplate.replace('[[INJECT_FLAG_DICTIONARY_HERE]]', JSON.stringify(flagMap || {}));
            standingsTemplate = standingsTemplate.replace('[[INJECT_STANDINGS_HERE]]', JSON.stringify(mappedStandings));
            
            // 🚀 NEW: Inject the exact build time
            standingsTemplate = standingsTemplate.replace('[[INJECT_BUILD_TIME_HERE]]', new Date().toISOString());
            
            fs.writeFileSync(path.join(standingsDir, 'index.html'), standingsTemplate);
            console.log("✅ Physically generated the /standings directory.");

        }

        // --- MATCH PAGES BUILD ---
        if (fs.existsSync(path.join(__dirname, 'match.html'))) {
            const matchTemplate = fs.readFileSync(path.join(__dirname, 'match.html'), 'utf8');

            for (const match of schedule) {
                const matchDir = path.join(outputDir, 'match', match.date, match.slug);
                fs.mkdirSync(matchDir, { recursive: true });

                // 🚀 Generate the OG Image
                await generateOGImage(match.home.logo, match.away.logo, match.slug);

                let matchHTML = matchTemplate;

                // 🚀 Inject SEO URLs
                const matchUrl = `${SITE_URL}/match/${match.date}/${match.slug}`;
                const ogImageUrl = `${SITE_URL}/og/${match.slug}.png`;
                
                matchHTML = matchHTML.replace(/\[\[MATCH_URL\]\]/g, matchUrl);
                matchHTML = matchHTML.replace(/\[\[MATCH_OG_IMAGE\]\]/g, ogImageUrl);

                matchHTML = matchHTML.replace(/\[\[HOME_NAME\]\]/g, match.home.fullName);
                matchHTML = matchHTML.replace(/\[\[AWAY_NAME\]\]/g, match.away.fullName);
                matchHTML = matchHTML.replace(/\[\[HOME_LOGO\]\]/g, match.home.logo);
                matchHTML = matchHTML.replace(/\[\[AWAY_LOGO\]\]/g, match.away.logo);
                matchHTML = matchHTML.replace(/\[\[MATCH_GROUP\]\]/g, match.group);

                // 🛑 THE TBD FIX: Prevent Google from indexing placeholder pages
                if (match.slug.includes('tbd')) {
                    matchHTML = matchHTML.replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex, follow">');
                }

                // 🚀 STATIC HYDRATION: Admin Panel dictates the state, ignoring the clock!
                let initialDataScript = `<script>window.__INITIAL_MATCH_DATA__ = null;</script>`;
                
                try {
                    const matchId = `${match.slug}-${match.date}`;
                    // Securely hit backend to bypass rate limit
                    const backendRes = await fetch(`https://wc26-backend-kd7l.onrender.com/api/live-match?id=${matchId}`, {
                        headers: { "Authorization": process.env.ADMIN_PASSWORD || "super-secret-world-cup" } 
                    });
                    if (backendRes.ok) {
                        const matchData = await backendRes.json();
                        // 👑 THE ADMIN SWITCH: Only bake if Admin specifically set it to 'post-match'
                        if (matchData.setup?.status === 'post-match') {
                            initialDataScript = `<script>window.__INITIAL_MATCH_DATA__ = ${JSON.stringify(matchData)};</script>`;
                            console.log(`🏆 Baked static data for completed match: ${matchId}`);
                        }
                    }
                } catch (err) {
                    console.log(`⚠️ Failed to statically hydrate ${match.slug}, falling back to client-side load.`);
                }

                // Inject the static data into the <head> so it loads instantly
                matchHTML = matchHTML.replace('</head>', `${initialDataScript}\n</head>`);

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
                } catch(e) {}
            }
            
            if (!statsLoaded) {
                try {
                    console.log("📈 Fetching official player stats from API-Football...");
                    const scorersRes = await fetch("https://v3.football.api-sports.io/players/topscorers?league=1&season=2022", { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } });
                    const scorersData = await scorersRes.json();

                    const assistsRes = await fetch("https://v3.football.api-sports.io/players/topassists?league=1&season=2022", { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } });
                    const assistsData = await assistsRes.json();

                    const yellowRes = await fetch("https://v3.football.api-sports.io/players/topyellowcards?league=1&season=2022", { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } });
                    const yellowData = await yellowRes.json();

                    const redRes = await fetch("https://v3.football.api-sports.io/players/topredcards?league=1&season=2022", { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY } });
                    const redData = await redRes.json();

                    if (scorersData.response && scorersData.response.length > 0) {
                        mappedStats.topScorers = scorersData.response.slice(0, 5).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name, value: item.statistics[0].goals.total, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    if (assistsData.response && assistsData.response.length > 0) {
                        mappedStats.topAssists = assistsData.response.slice(0, 5).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name, value: item.statistics[0].goals.assists, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    if (yellowData.response && yellowData.response.length > 0) {
                        mappedStats.yellowCards = yellowData.response.slice(0, 5).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name, value: item.statistics[0].cards.yellow, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    if (redData.response && redData.response.length > 0) {
                        mappedStats.redCards = redData.response.slice(0, 5).map(item => ({
                            name: item.player.name, teamName: item.statistics[0].team.name, value: item.statistics[0].cards.red, fallbackLogo: item.statistics[0].team.logo
                        }));
                    }
                    
                    mappedStats.cleanSheets = [
                        { name: "E. Martínez", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" },
                        { name: "Y. Bounou", teamName: "Morocco", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/31.png" },
                        { name: "J. Pickford", teamName: "England", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/10.png" }
                    ];

                    if (mappedStats.topScorers.length > 0) {
                        fs.writeFileSync(statsCache, JSON.stringify(mappedStats));
                    } else { throw new Error("Empty stats"); }
                } catch (e) {
                    console.log("⚠️ Injecting Pitch90 Mock Stats (API Limit hit)...");
                    mappedStats = {
                        topScorers: [{ name: "K. Mbappé", teamName: "France", value: 8, fallbackLogo: "https://media.api-sports.io/football/teams/773.png" }],
                        topAssists: [{ name: "L. Messi", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" }],
                        cleanSheets: [{ name: "E. Martínez", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" }],
                        yellowCards: [{ name: "M.. Acuña", teamName: "Argentina", value: 3, fallbackLogo: "https://media.api-sports.io/football/teams/26.png" }],
                        redCards: [{ name: "D. Dumfries", teamName: "Netherlands", value: 1, fallbackLogo: "https://media.api-sports.io/football/teams/1118.png" }]
                    };
                }
            }

            let statsTemplate = fs.readFileSync(path.join(__dirname, 'stats.html'), 'utf8');
            statsTemplate = statsTemplate.replace('[[INJECT_FLAG_DICTIONARY_HERE]]', JSON.stringify(flagMap || {}));
            statsTemplate = statsTemplate.replace('[[INJECT_STATS_HERE]]', JSON.stringify(mappedStats));
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
