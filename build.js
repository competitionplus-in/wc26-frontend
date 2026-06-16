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
        
        if (fs.existsSync(flagsCacheFile)) {
            flagMap = JSON.parse(fs.readFileSync(flagsCacheFile, 'utf8'));
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

        if (fs.existsSync(path.join(__dirname, 'match.html'))) {
            schedule.forEach(match => {
                const matchDir = path.join(outputDir, 'match', match.date, match.slug);
                fs.mkdirSync(matchDir, { recursive: true });
                fs.copyFileSync(path.join(__dirname, 'match.html'), path.join(matchDir, 'index.html'));
            });
            console.log("✅ Physically generated dynamic match directories!");
        }

        // STANDINGS & STATS LOGIC REMAINS IDENTICAL BELOW...
        if (fs.existsSync(path.join(__dirname, 'standings.html'))) { 
            const standingsDir = path.join(outputDir, 'standings');
            fs.mkdirSync(standingsDir, { recursive: true });
            let mappedStandings = [
                { name: "Group A", teams: [
                    { name: "Mexico", pld: 1, w: 1, d: 0, l: 0, gf: 2, ga: 0, gd: 2, pts: 3, fallbackLogo: "" },
                    { name: "South Africa", pld: 1, w: 0, d: 0, l: 1, gf: 0, ga: 2, gd: -2, pts: 0, fallbackLogo: "" }
                ]}
            ];
            let standingsTemplate = fs.readFileSync(path.join(__dirname, 'standings.html'), 'utf8'); 
            standingsTemplate = standingsTemplate.replace('[[INJECT_FLAG_DICTIONARY_HERE]]', JSON.stringify(flagMap || {}));
            standingsTemplate = standingsTemplate.replace('[[INJECT_STANDINGS_HERE]]', JSON.stringify(mappedStandings));
            fs.writeFileSync(path.join(standingsDir, 'index.html'), standingsTemplate);
        }

        if (fs.existsSync(path.join(__dirname, 'stats.html'))) {
            const statsDir = path.join(outputDir, 'stats');
            fs.mkdirSync(statsDir, { recursive: true });
            let mappedStats = { topScorers: [], topAssists: [], cleanSheets: [] };
            let statsTemplate = fs.readFileSync(path.join(__dirname, 'stats.html'), 'utf8');
            statsTemplate = statsTemplate.replace('[[INJECT_FLAG_DICTIONARY_HERE]]', JSON.stringify(flagMap || {}));
            statsTemplate = statsTemplate.replace('[[INJECT_STATS_HERE]]', JSON.stringify(mappedStats));
            fs.writeFileSync(path.join(statsDir, 'index.html'), statsTemplate);
        }

        console.log("✅ Successfully generated API-driven website in the /public folder!");

    } catch (error) {
        console.error("❌ Build Failed:", error.message);
        process.exit(1); 
    }
})();
