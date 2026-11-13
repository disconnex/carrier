//
//  CARRiER's phone network: what answers at every number, generated from the
//  season's seed so every caller dials the same network and nothing but finds
//  needs storing. Design in docs/design.md.
//
//  A number is NPA (area code) + NXX (exchange) + a four-digit line. Each
//  exchange has a profile (residential, business, university, government or
//  phone company) that sets how many carriers and tones it holds and what
//  kind of systems answer.
//

var NPAS = [
    ['202', 'Washington, DC'], ['206', 'Seattle, WA'], ['212', 'New York, NY'],
    ['213', 'Los Angeles, CA'], ['214', 'Dallas, TX'], ['303', 'Denver, CO'],
    ['305', 'Miami, FL'], ['312', 'Chicago, IL'], ['313', 'Detroit, MI'],
    ['404', 'Atlanta, GA'], ['415', 'San Francisco, CA'], ['512', 'Austin, TX'],
    ['602', 'Phoenix, AZ'], ['617', 'Boston, MA'], ['713', 'Houston, TX'],
    ['801', 'Salt Lake City, UT'],
];

//  The area codes a season's boss and raids are drawn from: the first
//  sixteen, kept as they were, so adding an area code to NPAS never moves
//  a season's boss or its raid targets
var SEASON_NPAS = NPAS.slice(0, 16);
//  added with the landmarks (phase 6, step 5)
NPAS.push(['301', 'Silver Spring, MD']);

function npaCity(npa) {
    for (var i = 0; i < NPAS.length; i++) {
        if (NPAS[i][0] === npa) {
            return NPAS[i][1];
        }
    }
    return '';
}

//  FNV-1a, then a finalizer, so near-identical keys land far apart
function hash32(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

//  A float in [0, 1) for a key
function unit(s) {
    return hash32(s) / 4294967296;
}

//  mulberry32: a small seeded generator for picking a host's details
function rng(seed) {
    var a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(r, list) {
    return list[Math.floor(r() * list.length)];
}

//  [value, weight] pairs
function pickWeighted(r, pairs) {
    var total = 0;
    for (var i = 0; i < pairs.length; i++) {
        total += pairs[i][1];
    }
    var x = r() * total;
    for (var j = 0; j < pairs.length; j++) {
        x -= pairs[j][1];
        if (x < 0) {
            return pairs[j][0];
        }
    }
    return pairs[pairs.length - 1][0];
}

//  Exchange profiles. carrier and tone are the share of lines that answer
//  with one; heat is what each dial into the exchange adds.
var PROFILES = {
    res: { name: 'residential', carrier: 0.004, tone: 0.001, heat: 0.05,
        hosts: [['bbs', 55], ['fax', 15], ['unix', 10], ['vms', 6], ['hp3000', 4], ['pbx', 6], ['prime', 4]],
        tones: [['disa', 6], ['anac', 2], ['milliwatt', 2]] },
    biz: { name: 'business', carrier: 0.012, tone: 0.006, heat: 0.06,
        hosts: [['fax', 28], ['pbx', 20], ['hp3000', 15], ['unix', 12], ['vms', 10], ['prime', 6], ['bbs', 5], ['pad', 4]],
        tones: [['disa', 10], ['milliwatt', 1]] },
    edu: { name: 'university', carrier: 0.03, tone: 0.003, heat: 0.12,
        hosts: [['vms', 30], ['unix', 30], ['prime', 14], ['pad', 10], ['bbs', 6], ['fax', 5], ['hp3000', 5]],
        tones: [['disa', 4], ['milliwatt', 2]] },
    gov: { name: 'government', carrier: 0.02, tone: 0.002, heat: 0.3,
        hosts: [['vms', 30], ['unix', 18], ['prime', 16], ['hp3000', 10], ['pad', 10], ['fax', 16]],
        tones: [['disa', 5], ['milliwatt', 1]] },
    telco: { name: 'phone company', carrier: 0.015, tone: 0.02, heat: 0.3,
        hosts: [['unix', 34], ['pbx', 26], ['pad', 16], ['vms', 12], ['fax', 12]],
        tones: [['loop', 6], ['milliwatt', 4], ['anac', 4], ['disa', 2]] },
};

//  An NXX that can't be dialed: a leading 0 or 1, an N11 service code, 555
function badNXX(nxx) {
    return !/^[2-9]\d\d$/.test(nxx) || nxx.slice(1) === '11' || nxx === '555';
}

function exchangeProfile(seed, npa, nxx) {
    if (badNXX(nxx)) {
        return null;
    }
    if (SPECIAL_EXCHANGES[npa + nxx]) {
        return SPECIAL_EXCHANGES[npa + nxx].prof;
    }
    var u = unit(seed + '|x|' + npa + nxx);
    if (u < 0.62) return 'res';
    if (u < 0.84) return 'biz';
    if (u < 0.92) return 'edu';
    if (u < 0.96) return 'gov';
    return 'telco';
}

//  Result names, as the scanner logs them
var RESULTS = ['CARRIER', 'TONE', 'VOICE', 'BUSY', 'RINGOUT', 'TIMEOUT'];

//  What answers at one number: a result name, plus a kind ('vms', 'disa' ...)
//  for a carrier or a tone. An exchange that can't be dialed is all INTERCEPT.
function lineResult(seed, npa, nxx, line) {
    var prof = exchangeProfile(seed, npa, nxx);
    if (!prof) {
        return { result: 'INTERCEPT' };
    }
    if (npa + nxx + line === bossNumber(seed)) {
        return { result: 'CARRIER', kind: 'scc' };
    }
    var lm = landmarkAt(npa + nxx + line);
    if (lm) {
        return { result: 'CARRIER', kind: lm.kind };
    }
    var p = PROFILES[prof];
    var key = seed + '|' + npa + nxx + line;
    var u = unit(key);
    //  A phone company's test lines (loops, milliwatt, ANAC) sit high in the
    //  exchange, the way 99xx numbers often did
    var tone = p.tone * (prof === 'telco' && line >= '9900' ? 12 : 1);
    var r = rng(hash32(key + '|k'));
    if (u < p.carrier) {
        var special = SPECIAL_EXCHANGES[npa + nxx];
        //  phase 4: a few of the phone company's carriers are COSMOS (its own
        //  roll, so the other hosts keep their kinds)
        if (prof === 'telco' && !special && unit(key + '|cosmos') < 0.08) {
            return { result: 'CARRIER', kind: 'cosmos' };
        }
        return { result: 'CARRIER', kind: pickWeighted(r, special ? special.hosts : p.hosts) };
    }
    if (u < p.carrier + tone) {
        var tk = pickWeighted(r, p.tones);
        //  voice mail sits on the same PBXes as DISA lines (its own roll, so
        //  the other tones keep their kinds)
        if (tk === 'disa' && prof !== 'res' && unit(key + '|vmb') < 0.35) {
            tk = 'vmb';
        }
        return { result: 'TONE', kind: tk };
    }
    var v = (u - p.carrier - tone) / (1 - p.carrier - tone);
    if (v < 0.42) return { result: 'VOICE' };
    if (v < 0.75) return { result: 'RINGOUT' };
    if (v < 0.88) return { result: 'TIMEOUT' };
    return { result: 'BUSY' };
}

//  What a line answers with, for this player. Gear changes what the scanner
//  hears (phase 3): with nudge strings, a few lines that time out are quiet
//  carriers that wake up for a CR; with tone detect, a few that ring out
//  are tone lines that answer late. gear: the player's gear, or null.
function lineFor(seed, npa, nxx, line, gear) {
    var res = lineResult(seed, npa, nxx, line);
    if (!gear) {
        return res;
    }
    var prof = exchangeProfile(seed, npa, nxx);
    var key = seed + '|' + npa + nxx + line;
    if (res.result === 'TIMEOUT' && gear.nudge && unit(key + '|quiet') < 0.04 && prof && prof !== 'res') {
        return { result: 'CARRIER', kind: pickWeighted(rng(hash32(key + '|qk')), PROFILES[prof].hosts), quiet: true };
    }
    if (res.result === 'RINGOUT' && gear.tonedet && unit(key + '|late') < 0.03 && prof && prof !== 'res') {
        return { result: 'TONE', kind: unit(key + '|latevmb') < 0.4 ? 'vmb' : 'disa', quiet: true };
    }
    return res;
}

//  The switch an exchange runs on in 1993: the phone company's own and the
//  government's are electronic (ESS); about a third of the rest are still
//  crossbar, where a blue box can seize a trunk.
function switchType(seed, npa, nxx) {
    var prof = exchangeProfile(seed, npa, nxx);
    if (!prof || prof === 'telco' || prof === 'gov') {
        return 'ESS';
    }
    return unit(seed + '|sw|' + npa + nxx) < 0.35 ? 'crossbar' : 'ESS';
}

//  The Hack Shack: the fence's board in an area code. Every caller from
//  there knows the number; it's on the found list from the start.
function fenceNumber(seed, npa) {
    var r = rng(hash32(seed + '|fence|' + npa));
    var nxx;
    do {
        nxx = String(200 + Math.floor(r() * 800));
    } while (badNXX(nxx));
    return npa + nxx + ('000' + Math.floor(r() * 10000)).slice(-4);
}

//  Systems of a given kind near a host: its DECnet nodes (vms) or the
//  machine its .rhosts trusts (unix). Real numbers in its area code, so
//  they can be dialed too once known. Up to n.
function neighbours(seed, host, kind, n) {
    if (/^NUA|^TYM/.test(host.num)) {
        return [];
    }
    var r = rng(hash32(seed + '|near|' + kind + '|' + host.num));
    var npa = host.num.slice(0, 3);
    var out = [];
    for (var tries = 0; tries < 60 && out.length < n; tries++) {
        var nxx = String(200 + Math.floor(r() * 800));
        var prof = exchangeProfile(seed, npa, nxx);
        if (!prof || prof === 'res') {
            continue;
        }
        var start = Math.floor(r() * 9000);
        for (var l = start; l < start + 800; l++) {
            var line = ('000' + l).slice(-4);
            var res = lineResult(seed, npa, nxx, line);
            if (res.result === 'CARRIER' && res.kind === kind && npa + nxx + line !== host.num) {
                out.push(npa + nxx + line);
                break;
            }
        }
    }
    return out;
}

//  ---- hosts ----

var SYLLABLES = ['ZE', 'US', 'MAX', 'AR', 'GUS', 'TI', 'TAN', 'OR', 'ION', 'HEL', 'IOS', 'NO', 'VA', 'KRA',
    'KEN', 'ATL', 'AS', 'BOR', 'EAS', 'MER', 'LIN', 'PHO', 'BOS', 'CYG', 'NUS', 'DEL', 'TA'];

var ORGS = {
    res: [['Mike\'s', 'Joe\'s', 'The', 'Lonesome', 'Midnight'], [' Home Office', ' Workshop', ' Den']],
    biz: [['Consolidated', 'Allied', 'Meridian', 'Summit', 'Pioneer', 'Cascade', 'Keystone', 'Granite'],
        [' Dynamics', ' Freight Lines', ' Savings & Loan', ' Aerospace', ' Mutual Insurance', ' Petroleum', ' Data Services']],
    edu: [['Central', 'Western', 'Pacific', 'Lone Star', 'Great Lakes', 'Southern', 'Northeastern'],
        [' State University', ' Polytechnic Institute', ' College of Engineering', ' Research Laboratory']],
    gov: [['Bureau of', 'Office of', 'Defense', 'Department of', 'Federal'],
        [' Records Management', ' Naval Logistics', ' Supply Systems', ' Statistics', ' Contract Audit']],
    telco: [['Central States', 'Pacific Coast', 'Mountain Plains', 'Atlantic', 'Southern Plains'],
        [' Telephone', ' Bell', ' Telco', ' Telecom']],
};

//  The default accounts each system shipped with: [user, password,
//  privileged]. A host keeps one or two of them open. Every one is in a text
//  file in our file areas, and the notebook (carrier_notes.js) points at it,
//  so reading the archive is how you get in:
//    vms     accounts.vax (Hacking - Unix & VMS)
//    unix    sirsunix.hac, Sir Hackalot's tutorial (Hacking - Unix & VMS)
//    prime   primes.txt and the PRIMOS section of guidehak.txt (Hacking - General)
//    hp3000  hp3000.txt (Hacker Chronicles II) and guidehak.txt
//    pbx     the Sys75/85 section of guidehak.txt
var DEFAULTS = {
    vms: [['SYSTEM', 'SYSTEM', true], ['FIELD', 'SERVICE', true], ['FIELD', 'FIELD', true],
        ['MANAGER', 'MANAGER', true], ['OPERATOR', 'OPERATOR', true], ['SYSTEST', 'SYSTEST', false],
        ['GUEST', 'GUEST', false], ['DEMO', 'DEMO', false], ['USER', 'USER', false], ['DECNET', 'DECNET', false],
        ['TEST', 'TEST', false], ['BACKUP', 'BACKUP', false]],
    unix: [['root', 'root', true], ['sys', 'sys', false], ['sys', 'system', false], ['bin', 'bin', false],
        ['adm', 'adm', false], ['uucp', 'uucp', false], ['nuucp', 'anon', false], ['user', 'user', false],
        ['games', 'games', false], ['demo', 'demo', false], ['sync', 'sync', false], ['admin', 'admin', false],
        ['guest', 'guest', false], ['daemon', 'daemon', false]],
    prime: [['SYSTEM', 'PRIME', true], ['SYSTEM', 'PRIMOS', true], ['PRIME', 'PRIMOS', true],
        ['PRIMOS', 'PRIME', true], ['NETMAN', 'MANAGER', true], ['GUEST1', 'GUEST', false],
        ['PRIMENET', 'NET', false], ['DSMSR', 'DSM', false], ['JOHN', 'JOHN', false],
        ['RICHARD', 'RICHARD', false], ['CHRIS', 'CHRIS', false]],
    hp3000: [['FIELD.SUPPORT', '', true], ['FIELD.SUPPORT', 'HPWORD', true], ['MGR.TELESUP', 'HPONLY', true],
        ['MGR.SYS', 'LOTUS', true], ['MANAGER.SYS', '', true], ['OPERATOR.SYS', '', false],
        ['MAIL.HPOFFICE', '', false]],
    pbx: [['browse', 'looker', false], ['cust', 'custpw', false], ['rcust', 'rcustpw', false],
        ['craft', 'crftpw', true], ['init', 'initpw', true], ['inads', 'indspw', true], ['field', 'support', true]],
};

//  Exchanges with a character of their own, whatever the seed says.
//  primes.txt: "Try hacking on Primes found in 617 ... some good ons to try:
//  617455, 617585, 617556".
var SPECIAL_EXCHANGES = {
    '617455': { prof: 'edu', hosts: [['prime', 60], ['vms', 15], ['unix', 15], ['fax', 10]] },
    '617585': { prof: 'biz', hosts: [['prime', 55], ['hp3000', 15], ['fax', 15], ['pbx', 15]] },
    '617556': { prof: 'edu', hosts: [['prime', 60], ['unix', 20], ['pad', 10], ['fax', 10]] },
};

var BBS_NAMES = ['The Pirate\'s Cove', 'Dead Man\'s Hand', 'The Lost City', 'Electric Dreams', 'The Abyss',
    'Twilight Zone', 'The Underground', 'Neon Knights', 'The Outer Limits', 'Static Line', 'The Dark Side',
    'Shadow Realm', 'Black Ice', 'Night Owl', 'Phantom Access'];
var STING_NAMES = ['The Warez Connection', 'Code Kings', 'Free Access', 'The Free Zone', 'Elite Exchange'];
var BBS_SOFTWARE = ['WWIV v4.21', 'Telegard 2.5i', 'RemoteAccess 1.11', 'PCBoard 14.5a', 'Wildcat! 3.02',
    'Renegade 04-05', 'TriBBS 4.0', 'Searchlight 2.25'];
//  Sysops of the fake boards: made-up handles, never real people's
var HANDLES = ['Night Crawler', 'Static', 'Cold Fusion', 'The Operator', 'Ringmaster', 'Dial Tone',
    'Ghost Line', 'Iron Lung', 'Vector', 'Black Ice', 'Low Tide', 'Mr. Wizard'];

//  The system at a carrier: its kind, name, organization and open accounts.
//  The same number always gives the same host for the season.
function hostAt(seed, num, kind, prof) {
    var r = rng(hash32(seed + '|h|' + num));
    var h = { num: num, kind: kind, prof: prof };
    h.name = pick(r, SYLLABLES) + pick(r, SYLLABLES) + (r() < 0.3 ? pick(r, ['VAX', 'A', 'B', '1', '2', 'X']) : '');
    var o = ORGS[prof] || ORGS.biz;
    h.org = pick(r, o[0]) + pick(r, o[1]);
    var defs = DEFAULTS[kind];
    h.accounts = [];
    if (defs && r() >= 0.25) {
        var n = r() < 0.7 ? 1 : 2;
        var pool = defs.slice();
        for (var i = 0; i < n && pool.length; i++) {
            h.accounts.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
        }
    }
    if (kind === 'bbs') {
        h.sting = r() < 0.12;
        h.bbsName = h.sting ? pick(r, STING_NAMES) : pick(r, BBS_NAMES);
        h.software = pick(r, BBS_SOFTWARE);
        h.sysop = pick(r, HANDLES);
        h.nodes = 1 + Math.floor(r() * 3);
    }
    h.version = {
        vms: pick(r, ['V4.7', 'V5.3-1', 'V5.4-2', 'V5.5']),
        unix: pick(r, ['System V Release 3.2', 'System V Release 4.0', '4.3 BSD UNIX', 'SunOS 4.1.1']),
        prime: pick(r, ['21.0.7', '22.1.4', '23.2.0']),
        hp3000: pick(r, ['G.03.04', 'G.02.B0']),
        pbx: pick(r, ['G1.2', 'G2.1', 'V3']),
    }[kind] || '';
    h.users = Math.floor(r() * 24);
    //  Phase 4 details, from their own generator
    var p4 = rng(hash32(seed + '|p4|' + num));
    if (kind === 'pad') {
        h.net = p4() < 0.35 ? 'tymnet' : 'telenet';
    }
    if (kind === 'cosmos') {
        h.wc = cosmosWC(seed, num);
        h.accounts = [[cosmosUser(p4), p4() < 0.4 ? '' : pick(p4, SECRET_WORDS).toLowerCase(), false]];
    }
    //  Phase 6: three more flavors of UNIX, from their own roll so the other
    //  hosts keep the versions they had. An IRIX box may still have one of
    //  the accounts Silicon Graphics shipped with no password (hackfaq.txt);
    //  a NeXT, the "me" account (cert9106.txt). A Cray is rare.
    if (kind === 'unix') {
        var p6 = rng(hash32(seed + '|p6unix|' + num));
        var odds = UNIX_MORE[prof] || [0, 0, 0];
        var u6 = p6();
        if (u6 < odds[0]) {
            h.version = 'IRIX 4.0.5';
            if (p6() < 0.6) {
                h.accounts.push([pick(p6, IRIX_OPEN), '', false]);
            }
        } else if (u6 < odds[0] + odds[1]) {
            h.version = 'NeXTstep 2.1';
            if (p6() < 0.5) {
                h.accounts.push(['me', '', false]);
            }
        } else if (u6 < odds[0] + odds[1] + odds[2]) {
            h.version = 'UNICOS 6.1';
        }
    }
    //  Phase 2 details each come from their own generator, so the accounts
    //  above stay what they were for hosts found before them.
    var sr = rng(hash32(seed + '|secret|' + num));
    if (SECRET_USERS[kind]) {
        h.secret = [pick(sr, SECRET_USERS[kind]), pick(sr, SECRET_WORDS) + (sr() < 0.5 ? String(80 + Math.floor(sr() * 14)) : ''), true];
        if (kind === 'unix' || kind === 'pbx') {
            h.secret[1] = h.secret[1].toLowerCase();
        }
        h.accounts = h.accounts.concat([h.secret]);
    }
    //  phase 6: a landmark's own host, over what was generated
    return landHost(seed, h);
}

//  Phase 6: the share of an exchange's UNIX hosts that run IRIX, NeXTstep
//  and UNICOS, by profile
var UNIX_MORE = { edu: [0.14, 0.12, 0.05], gov: [0.1, 0, 0.06], biz: [0.08, 0.06, 0], res: [0, 0.08, 0] };
//  hackfaq.txt: "SGI/Irix 4DGifts (none)", lp, tour, tutor, demos; and guest
var IRIX_OPEN = ['4Dgifts', 'lp', 'tour', 'tutor', 'demos', 'guest'];

//  The privileged account a host's own files give away (mail, a batch job,
//  a job stream), and the words its admins used for passwords
var SECRET_USERS = {
    vms: ['SYSMGR', 'OPERATIONS', 'SYSTEM'], unix: ['root'], prime: ['SYSTEM', 'SYSTEM_MANAGER'],
    hp3000: ['MANAGER.SYS', 'MGR.SYS'], pbx: ['init'],
};
var SECRET_WORDS = ['TIGERS', 'ZEPPELIN', 'FALCON', 'WIZARD', 'ORACLE', 'MAINT', 'CHANGEME', 'BACKUP', 'SUMMER',
    'GATEKEEPER', 'CONDOR', 'PEGASUS', 'NEPTUNE', 'COBALT'];

//  COSMOS (phase 4). From the archive (cosmos.phk, cosmoslg.txt): ";LOGIN:",
//  "PASSWORD:", then a two-letter wire center; accounts like PA52, and some
//  with no password at all.
function cosmosUser(r) {
    return String.fromCharCode(65 + Math.floor(r() * 26)) + String.fromCharCode(65 + Math.floor(r() * 26)) + String(10 + Math.floor(r() * 90));
}

function cosmosWC(seed, num) {
    var r = rng(hash32(seed + '|wc|' + num));
    return String.fromCharCode(65 + Math.floor(r() * 26)) + String.fromCharCode(65 + Math.floor(r() * 26));
}

//  The COSMOS a phone company UNIX box's notes point at: a COSMOS in its
//  area code, or '' if there's none to find
function cosmosNear(seed, host) {
    if (/^NUA|^TYM/.test(host.num)) {
        return '';
    }
    var npa = host.num.slice(0, 3);
    var r = rng(hash32(seed + '|cosmosnear|' + npa));
    for (var tries = 0; tries < 400; tries++) {
        var nxx = String(200 + Math.floor(r() * 800));
        if (exchangeProfile(seed, npa, nxx) !== 'telco') {
            continue;
        }
        for (var l = 0; l < 3000; l += 1) {
            var line = ('000' + l).slice(-4);
            var res = lineResult(seed, npa, nxx, line);
            if (res.result === 'CARRIER' && res.kind === 'cosmos') {
                return npa + nxx + line;
            }
        }
    }
    return '';
}

//  Numbers a host's files lead to: other systems in its area code, the kind
//  worth dialing. Up to n of them.
function hostLeads(seed, host, n) {
    if (/^NUA|^TYM/.test(host.num)) {
        return [];
    }
    var r = rng(hash32(seed + '|leads|' + host.num));
    var npa = host.num.slice(0, 3);
    var out = [];
    for (var tries = 0; tries < 40 && out.length < n; tries++) {
        var nxx = String(200 + Math.floor(r() * 800));
        var prof = exchangeProfile(seed, npa, nxx);
        if (prof !== 'edu' && prof !== 'gov' && prof !== 'biz' && prof !== 'telco') {
            continue;
        }
        var start = Math.floor(r() * 9000);
        for (var l = start; l < start + 600; l++) {
            var line = ('000' + l).slice(-4);
            var res = lineResult(seed, npa, nxx, line);
            if (res.result === 'CARRIER' && /^(vms|unix|prime|hp3000|pbx)$/.test(res.kind)) {
                out.push(npa + nxx + line);
                break;
            }
        }
    }
    return out;
}

//  A PBX's remote access: the DISA line in its exchange its barrier code
//  works on, or '' if the exchange has none
function pbxDisa(seed, pbxNum) {
    var npa = pbxNum.slice(0, 3), nxx = pbxNum.slice(3, 6);
    var start = hash32(seed + '|disa|' + pbxNum) % 10000;
    for (var i = 0; i < 10000; i++) {
        var line = ('000' + ((start + i) % 10000)).slice(-4);
        var res = lineResult(seed, npa, nxx, line);
        if (res.result === 'TONE' && res.kind === 'disa') {
            return npa + nxx + line;
        }
    }
    return '';
}

//  A voice mail system: its hundred boxes, and the few nobody has taken
//  yet, each still on a default password (aspen.txt: "1111, the box number
//  itself, and 1234")
function vmbAt(seed, num) {
    var r = rng(hash32(seed + '|vmb|' + num));
    var base = (2 + Math.floor(r() * 7)) * 1000 + Math.floor(r() * 9) * 100;
    var empty = {};
    var n = 2 + Math.floor(r() * 3);
    for (var i = 0; i < n; i++) {
        var box = String(base + Math.floor(r() * 100));
        empty[box] = pick(r, ['1111', box, '1234']);
    }
    var names = ['Jim Rawlings', 'Pat Moreno', 'the front desk', 'Dr. Ellis', 'Accounts Payable', 'Sandy Kim',
        'Bob Tremaine', 'the night shift', 'Carol Weiss', 'Tom Ferrante'];
    return { base: base, empty: empty, names: names, system: pick(r, ['ASPEN', 'Octel', 'Audix']) };
}

//  A host on the packet network (Telenet), by its network address. About a
//  quarter of addresses answer.
function nuaHost(seed, nua) {
    var u = unit(seed + '|nua|' + nua);
    if (u >= 0.26) {
        return null;
    }
    var r = rng(hash32(seed + '|nuak|' + nua));
    var prof = pickWeighted(r, [['edu', 4], ['gov', 3], ['biz', 3], ['telco', 1]]);
    var kind = pickWeighted(r, [['vms', 4], ['unix', 4], ['prime', 2], ['hp3000', 2]]);
    return hostAt(seed, 'NUA' + nua, kind, prof);
}

//  ---- the season boss (phase 5) ----
//  The phone company's Switching Control Center for one city: a carrier in
//  one of its exchanges. Its login comes only from the season's last raid.

var BOSS_CACHE = {};

function bossNumber(seed) {
    if (BOSS_CACHE[seed] !== undefined) {
        return BOSS_CACHE[seed];
    }
    BOSS_CACHE[seed] = '';
    var r = rng(hash32(seed + '|boss'));
    var npa = SEASON_NPAS[Math.floor(r() * SEASON_NPAS.length)][0];
    for (var tries = 0; tries < 2000; tries++) {
        var nxx = String(200 + Math.floor(r() * 800));
        if (exchangeProfile(seed, npa, nxx) === 'telco') {
            BOSS_CACHE[seed] = npa + nxx + ('000' + Math.floor(r() * 10000)).slice(-4);
            break;
        }
    }
    return BOSS_CACHE[seed];
}

function bossLogin(seed) {
    var r = rng(hash32(seed + '|bosslogin'));
    return [pick(r, ['sccmaint', 'sccadm', 'rcmac', 'frame']), pick(r, SECRET_WORDS).toLowerCase() + String(10 + Math.floor(r() * 90))];
}

//  A host on Tymnet, by its host number (phase 4). About a third answer.
function tymnetHost(seed, hostNum) {
    var u = unit(seed + '|tym|' + hostNum);
    if (u >= 0.3) {
        return null;
    }
    var r = rng(hash32(seed + '|tymk|' + hostNum));
    var prof = pickWeighted(r, [['biz', 4], ['edu', 2], ['gov', 2], ['telco', 1]]);
    var kind = pickWeighted(r, [['vms', 3], ['unix', 3], ['hp3000', 3], ['prime', 2]]);
    return hostAt(seed, 'TYM' + hostNum, kind, prof);
}

//  How much a kind of find is worth in rep when first identified
var FIND_REP = { fax: 1, bbs: 3, disa: 2, milliwatt: 2, anac: 4, loop: 4, vmb: 5, pad: 8, pbx: 10, unix: 12,
    vms: 15, prime: 15, hp3000: 15, cosmos: 40, scc: 100 };

var KIND_NAMES = { vms: 'VAX/VMS', unix: 'UNIX', prime: 'Prime PRIMOS', hp3000: 'HP3000 MPE', pbx: 'PBX',
    pad: 'packet net PAD', bbs: 'BBS', fax: 'fax machine', disa: 'PBX dial tone', loop: 'loop-around',
    milliwatt: 'test tone', anac: 'ANAC', vmb: 'voice mail', fence: 'The Hack Shack', cosmos: 'COSMOS',
    scc: 'Switching Control Center' };

//  Format "5125550149" as 1-512-555-0149
function fmtNum(num) {
    if (/^NUA/.test(num)) {
        return 'Telenet ' + num.slice(3);
    }
    if (/^TYM/.test(num)) {
        return 'Tymnet host ' + num.slice(3);
    }
    return '1-' + num.slice(0, 3) + '-' + num.slice(3, 6) + '-' + num.slice(6);
}
