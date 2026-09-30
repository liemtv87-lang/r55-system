const VN_OFFSET=7*3600_000;
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&amp;/g,'and').replace(/[^a-z0-9]+/g,' ').trim();

// R55-16: strict "BÓNG CHÍNH" whitelist. A famous club is NOT enough to promote a
// lower division/youth/reserve/friendly match into the featured list.
export const MAIN_FOOTBALL_COMPETITIONS=[
 'FIFA World Cup','FIFA World Cup Qualification','UEFA European Championship','UEFA Euro Qualification','Copa America','AFC Asian Cup','AFC Asian Cup Qualification','Africa Cup of Nations','AFCON Qualification','CONCACAF Gold Cup','UEFA Nations League',
 'FIFA Club World Cup','FIFA Intercontinental Cup',
 'UEFA Champions League','UEFA Europa League','UEFA Conference League','UEFA Europa Conference League','Europa Conference League','UEFA Super Cup',
 'England Premier League','English Premier League','Premier League','Spain La Liga','Spanish La Liga','Spain Primera Division','Spanish Primera Division','LaLiga','Italy Serie A','Italian Serie A','Serie A','Germany Bundesliga','German Bundesliga','Bundesliga','France Ligue 1','French Ligue 1','Ligue 1',
 'FA Cup','EFL Cup','Carabao Cup','Copa del Rey','Coppa Italia','DFB Pokal','DFB-Pokal','Coupe de France',
 'Portugal Primeira Liga','Liga Portugal','Netherlands Eredivisie','Dutch Eredivisie','Belgium Pro League','Belgian Pro League','Turkey Super Lig','Turkish Super Lig','Scotland Premiership','Scottish Premiership','Austria Bundesliga','Austrian Bundesliga','Switzerland Super League','Swiss Super League','Greece Super League','Greek Super League','Denmark Superliga','Danish Superliga','Norway Eliteserien','Sweden Allsvenskan','Czech First League','Czech Liga','Poland Ekstraklasa','Croatia HNL','Serbia SuperLiga','Ukraine Premier League',
 'CONMEBOL Libertadores','Copa Libertadores','CONMEBOL Sudamericana','Copa Sudamericana','CONMEBOL Recopa',
 'Brazil Serie A','Brasileirao Serie A','Brasileirão Série A','Copa do Brasil','Argentina Liga Profesional','Argentina Primera Division','Argentine Primera Division','Copa Argentina','Colombia Primera A','Chile Primera Division','Uruguay Primera Division','Ecuador LigaPro Serie A','Paraguay Primera Division',
 'CONCACAF Champions Cup','Mexico Liga MX','Liga MX','USA Major League Soccer','Major League Soccer','MLS','Leagues Cup',
 'AFC Champions League Elite','AFC Champions League Two','AFC Champions League 2','Saudi Pro League','Saudi Professional League','Japan J1 League','J1 League','Korea K League 1','K League 1','Qatar Stars League','UAE Pro League','China Super League','Chinese Super League','Australia A-League','A-League Men',
 'CAF Champions League','CAF Confederation Cup'
];

const BIG_TEAMS=[
 'real madrid','barcelona','atletico madrid','athletic bilbao','sevilla','villarreal','real sociedad',
 'manchester city','manchester united','liverpool','arsenal','chelsea','tottenham','newcastle united','aston villa',
 'bayern munich','borussia dortmund','rb leipzig','bayer leverkusen','eintracht frankfurt',
 'inter milan','internazionale','ac milan','juventus','napoli','roma','lazio','atalanta',
 'paris saint germain','psg','marseille','monaco','lyon','lille',
 'benfica','porto','sporting cp','sporting lisbon','ajax','psv','feyenoord',
 'galatasaray','fenerbahce','besiktas','olympiacos','celtic','rangers',
 'river plate','boca juniors','flamengo','palmeiras','corinthians','sao paulo','fluminense','botafogo','gremio','internacional',
 'al hilal','al nassr','al ittihad','al ahli','inter miami','la galaxy',
 'argentina','brazil','brasil','france','spain','england','germany','italy','portugal','netherlands','belgium','croatia','uruguay','colombia','japan','south korea'
].map(norm);

const HARD_MINOR=/(^| )(u1[456789]|u2[013]|u23|youth|juvenil|junior|reserva|reserve|reserves|academy|amateur|women|womens|woman|ladies|femen|femin|primavera|development|regional|state league|county|college|university)( |$)/;
const LOWER_DIVISION=/(^| )(segunda federacion|primera federacion|primera division rfef|segunda division rfef|tercera federacion|tercera division|liga 2 seria|liga 3|league two|league one|national league|championship reserve|primera b metropolitana|primera b nacional|primera nacional|torneo federal a|serie b|serie c|serie d|ligue 2|2 bundesliga|3 liga|segunda liga|eerste divisie|challenger pro league|superettan|j2 league|j3 league|k league 2|thai league 2)( |$)/;
const FRIENDLY=/(^| )(friendly|friendlies|club friendly|giao huu)( |$)/;
function isMinorFixture(p){const x=norm(`${p?.league||''} ${p?.home||''} ${p?.away||''}`);return HARD_MINOR.test(x)||LOWER_DIVISION.test(x)||FRIENDLY.test(x)}
function teamTier(name){const x=norm(name);if(!x)return 0;for(const t of BIG_TEAMS)if(x===t||(x.length>=5&&t.length>=5&&(x.includes(t)||t.includes(x))))return 1;return 0}

const RULES=[
 [100,/^(uefa )?champions league$|uefa champions league|(^| )ucl( |$)/],
 [99,/fifa world cup(?!.*club)|world cup qualification|world cup qualifiers|uefa european championship|uefa euro(?!pa)|euro qualification|euro qualifiers|copa america|afc asian cup|africa cup of nations|afcon|concacaf gold cup|uefa nations league/],
 [98,/fifa club world cup|fifa intercontinental cup/],
 [96,/^(england |english )?premier league$|england premier league|english premier league|(^| )epl( |$)/],
 [94,/^(spain |spanish )?(la liga|laliga|primera division)$|spain la liga|spanish la liga/],
 [92,/^(italy |italian )?serie a$|italy serie a|italian serie a/],
 [90,/^(germany |german )?bundesliga$|germany bundesliga|german bundesliga/],
 [88,/^(france |french )?ligue 1$|france ligue 1|french ligue 1/],
 [86,/uefa europa league/],[84,/uefa (europa )?conference league|^europa conference league$/],[83,/uefa super cup/],
 [82,/conmebol libertadores|copa libertadores/],[81,/conmebol sudamericana|copa sudamericana|conmebol recopa/],
 [80,/brazil.*serie a|brasileirao serie a|brasileir[aã]o s[eé]rie a|argentina.*liga profesional|argentina.*primera division|argentine.*primera division/],
 [79,/copa do brasil|copa argentina|colombia primera a|chile primera division|uruguay primera division|ecuador ligapro serie a|paraguay primera division/],
 [78,/portugal.*primeira liga|liga portugal|netherlands.*eredivisie|dutch eredivisie|belgium.*pro league|belgian pro league|turkey.*super lig|turkish super lig|scotland.*premiership|scottish premiership|austria.*bundesliga|austrian bundesliga|switzerland.*super league|swiss super league|greece.*super league|greek super league|denmark.*superliga|danish superliga|norway.*eliteserien|sweden.*allsvenskan|czech.*first league|czech liga|poland.*ekstraklasa|croatia.*hnl|serbia.*superliga|ukraine.*premier league/],
 [77,/concacaf champions cup|mexico.*liga mx|^liga mx$|usa.*major league soccer|^major league soccer$|^mls$|leagues cup/],
 [76,/afc champions league elite|afc champions league two|afc champions league 2|saudi pro league|saudi professional league|japan.*j1 league|^j1 league$|korea.*k league 1|^k league 1$|qatar stars league|uae pro league|china super league|chinese super league|australia.*a league|a league men|caf champions league|caf confederation cup/],
 [75,/^fa cup$|efl cup|carabao cup|copa del rey|coppa italia|dfb pokal|coupe de france/]
];

export function leagueRank(name){const x=norm(name);if(!x)return 0;if(HARD_MINOR.test(x)||LOWER_DIVISION.test(x)||FRIENDLY.test(x))return 0;for(const [score,re] of RULES)if(re.test(x))return score;return 0}
export function isMainCompetition(name){return leagueRank(name)>0}
export function nextThreeAmVN(from=Date.now()){
 const v=new Date(from+VN_OFFSET);const y=v.getUTCFullYear(),m=v.getUTCMonth(),d=v.getUTCDate();return Date.UTC(y,m,d+1,3,0,0)-VN_OFFSET;
}
export function bigMatchMeta(p){const rank=leagueRank(p?.league),home=teamTier(p?.home),away=teamTier(p?.away),both=home+away>=2,one=home+away>=1,books=Math.min(Number(p?.ah?.books||0),Number(p?.ou?.books||0)),balance=(Number(p?.ah?.mainBalance||.08)+Number(p?.ou?.mainBalance||.08))/2,method=(Number(p?.ah?.methodConsensus||.5)+Number(p?.ou?.methodConsensus||.5))/2,strength=(Number(p?.ah?.strength||0)+Number(p?.ou?.strength||0))/2,quality=Math.max(0,books*3+(1-Math.min(.2,balance)*5)*8+method*5+strength*4),hot=rank>0&&(both||(rank>=94&&one)||rank>=98);return{leagueRank:rank,hot,quality:+quality.toFixed(3),bigTeams:home+away,mainCompetition:rank>0}}
export function rankBigPredictions(rows,from=Date.now(),to=nextThreeAmVN(from),limit=30){
 const seen=new Set(),eligible=[];for(const p of rows||[]){const t=Date.parse(p?.date);if(!Number.isFinite(t)||t<from||t>to)continue;const q={...p,bigMatch:bigMatchMeta(p)};
  // Gate BEFORE dedupe so a bad lower-division alias can never shadow the same main match.
  if(isMinorFixture(q)||q.bigMatch.mainCompetition!==true)continue;const k=`${norm(q.home)}|${norm(q.away)}|${Math.round(t/60000)}`;if(seen.has(k))continue;seen.add(k);eligible.push(q)}
 // Strict gate: ONLY the agreed main-football whitelist. No lower-league fill to reach 30.
 eligible.sort((a,b)=>Number(b.bigMatch.hot)-Number(a.bigMatch.hot)||b.bigMatch.leagueRank-a.bigMatch.leagueRank||b.bigMatch.bigTeams-a.bigMatch.bigTeams||b.bigMatch.quality-a.bigMatch.quality||Date.parse(a.date)-Date.parse(b.date));
 const chosen=eligible.slice(0,Math.max(1,Math.min(30,limit)));
 return chosen.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}
