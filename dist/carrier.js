// ---- lib/cot_ui.js ----
//
//  CoT UI for ViSiON/3 scripts: the look and key handling shared by the
//  City of Thieves mods, ported from the ENiGMA mod data/mods/cot_ui. Pulled
//  into a script with a "//@include lib/cot_ui.js" line (vision3/install.py
//  expands it), so everything here is a global.
//
//  Output is raw ANSI for v3.console.write: ViSiON/3 sends the Unicode box
//  and block characters in the caller's encoding (CP437 or UTF-8).
//

//  ANSI.SYS-style cursor and screen codes (core/ansi_term.js on ENiGMA)
var ANSI = {
    goto: function (row, col) { return '\x1b[' + row + ';' + (col || 1) + 'H'; },
    clearScreen: function () { return '\x1b[2J'; },
    hideCursor: function () { return '\x1b[?25l'; },
    showCursor: function () { return '\x1b[?25h'; },
    //  0: to the end of the line, 2: the whole line
    eraseLine: function (n) { return '\x1b[' + (n || 0) + 'K'; },
};

//  Palette: old-school "elite" fade. Bright white -> gray -> purple -> dark
//  gray, with a purple lightbar and bright magenta as the accent.
var WHITE = '\x1b[0;1;37;40m';
var GRAY = '\x1b[0;37;40m';
var PURPLE = '\x1b[0;35;40m';
var DKGRAY = '\x1b[0;1;30;40m';
var PINK = '\x1b[0;1;35;40m';

var C = {
    num: DKGRAY,
    name: WHITE,
    size: PINK,
    sizeUnit: DKGRAY,
    desc: GRAY,
    tagged: PINK,
    count: PINK,
    bar: '\x1b[0;1;37;45m',
    cmdSel: '\x1b[0;1;37;45m',
    status: WHITE,
    pageInfo: DKGRAY,
    pageNum: GRAY,
    reset: GRAY,
};

//  "Filename" -> F(white) i(gray) l(purple) ename(dark gray), per word
var FADE = [WHITE, GRAY, PURPLE];
function fade(text) {
    var out = '';
    var pos = 0; //  position within the current word
    for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (/\s/.test(ch)) {
            pos = 0;
            out += ch;
            continue;
        }
        out += (FADE[pos] || DKGRAY) + ch;
        pos += 1;
    }
    return out + C.reset;
}

//  Command labels: bright first letter (the hotkey), the rest gray. The fade
//  is for headings only.
function hotkey(label) {
    return WHITE + label.slice(0, 1) + GRAY + label.slice(1) + C.reset;
}

function repeat(s, n) {
    return n > 0 ? new Array(n + 1).join(s) : '';
}

//  A rule that fades the same way left to right, then runs dark gray. The
//  fade spans about a quarter of the line (4 white, 6 gray, 12 purple at 80).
function rule(width, ch) {
    ch = ch || '─';
    var steps = [
        [WHITE, Math.max(2, Math.round(width * 0.05))],
        [GRAY, Math.max(3, Math.round(width * 0.075))],
        [PURPLE, Math.max(6, Math.round(width * 0.15))],
    ];
    var out = '';
    var used = 0;
    for (var i = 0; i < steps.length; i++) {
        var take = Math.min(steps[i][1], width - used);
        out += steps[i][0] + repeat(ch, take);
        used += take;
    }
    return out + DKGRAY + repeat(ch, Math.max(0, width - used)) + C.reset;
}

//  v3.console.readkey() names -> the key names the ENiGMA mods were written
//  against ("up", "page down", "return" ...), so the ported key handlers
//  read the same. Characters come back as ''.
var KEY_NAMES = {
    UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right',
    PGUP: 'page up', PGDN: 'page down', HOME: 'home', END: 'end',
    INS: 'insert', DEL: 'delete', ESC: 'escape', BACKTAB: 'backtab',
    '\r': 'return', '\n': 'return', '\x08': 'backspace', '\x7f': 'backspace',
};

function keyName(k) {
    return KEY_NAMES[k] || '';
}

//  The typed character for a readkey() result, or '' for a named key
function keyChar(k) {
    return k && k.length === 1 && !KEY_NAMES[k] ? k : '';
}

function formatSize(bytes) {
    if (typeof bytes !== 'number' || bytes < 0) {
        return '';
    }
    if (bytes < 1000) {
        return String(bytes);
    }
    if (bytes < 1000 * 1024) {
        return Math.round(bytes / 1024) + 'K';
    }
    return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + 'M';
}

//  Size in two tones, right-aligned to |width|: bright digits, dim unit
function sizeCell(bytes, width) {
    var size = formatSize(bytes);
    var unit = /[KM]$/.test(size) ? size.slice(-1) : '';
    var digits = unit ? size.slice(0, -1) : size;
    return repeat(' ', Math.max(0, (width || 0) - size.length)) + C.size + digits + C.sizeUnit + unit;
}

function fit(s, w) {
    s = s || '';
    return s.length > w ? s.slice(0, w) : s + repeat(' ', w - s.length);
}

function padStart(s, w) {
    s = String(s);
    return repeat(' ', w - s.length) + s;
}

//  Word-wrap to |width|, hard-splitting words longer than a line
function wrap(text, width) {
    var out = [];
    var line = '';
    var words = String(text || '').split(/\s+/).filter(Boolean);
    for (var i = 0; i < words.length; i++) {
        var w = words[i];
        while (w.length > width) {
            if (line) {
                out.push(line);
                line = '';
            }
            out.push(w.slice(0, width));
            w = w.slice(width);
        }
        if (!line) {
            line = w;
        } else if (line.length + 1 + w.length <= width) {
            line += ' ' + w;
        } else {
            out.push(line);
            line = w;
        }
    }
    if (line) {
        out.push(line);
    }
    return out.length ? out : [''];
}

//  FILE_ID.DIZ-style descriptions: a preformatted block (up to 10 lines of
//  45 columns, often with ASCII art) that must be shown as-is, not reflowed.
function dizLines(desc) {
    if (!desc || !/\n/.test(desc)) {
        return null;
    }
    var lines = desc
        .replace(/\r\n?/g, '\n')
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') //  no stray ANSI in the list
        .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
        .split('\n')
        .map(function (l) { return l.replace(/\s+$/, ''); });
    while (lines.length && !lines[lines.length - 1]) {
        lines.pop();
    }
    while (lines.length && !lines[0]) {
        lines.shift();
    }
    return lines.length > 1 ? lines : null;
}

//  One readable line for a description: for a DIZ, the first line with real
//  words (logo rows of block characters are skipped); otherwise the text
//  with whitespace collapsed.
function descSummary(desc) {
    var lines = dizLines(desc);
    if (!lines) {
        return (desc || '').replace(/\s+/g, ' ').trim();
    }
    var wordy = lines.filter(function (l) {
        return /[A-Za-z]{3,}/.test(l) && (l.match(/[A-Za-z]/g) || []).length >= l.trim().length / 2;
    })[0];
    return (wordy || lines[0]).trim();
}

//  Printable length of a string containing SGR codes
function visibleLength(s) {
    return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length;
}

//  The CP437 byte a character stands for, as v3.file.read/readMember hand
//  text over: below 0x80 the character itself, above it the Unicode form of
//  a CP437 byte (ViSiON/3's ansi.Cp437ToUnicode, copied here). For binary
//  fields such as a SAUCE record's width and flags. 0 for anything else.
var CP437_HIGH = [
    0x00C7, 0x00FC, 0x00E9, 0x00E2, 0x00E4, 0x00E0, 0x00E5, 0x00E7,
    0x00EA, 0x00EB, 0x00E8, 0x00EF, 0x00EE, 0x00EC, 0x00C4, 0x00C5,
    0x00C9, 0x00E6, 0x00C6, 0x00F4, 0x00F6, 0x00F2, 0x00FB, 0x00F9,
    0x00FF, 0x00D6, 0x00DC, 0x00A2, 0x00A3, 0x00A5, 0x20A7, 0x0192,
    0x00E1, 0x00ED, 0x00F3, 0x00FA, 0x00F1, 0x00D1, 0x00AA, 0x00BA,
    0x00BF, 0x2310, 0x00AC, 0x00BD, 0x00BC, 0x00A1, 0x00AB, 0x00BB,
    0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556,
    0x2555, 0x2563, 0x2551, 0x2557, 0x255D, 0x255C, 0x255B, 0x2510,
    0x2514, 0x2534, 0x252C, 0x251C, 0x2500, 0x253C, 0x255E, 0x255F,
    0x255A, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256C, 0x2567,
    0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256B,
    0x256A, 0x2518, 0x250C, 0x2588, 0x2584, 0x258C, 0x2590, 0x2580,
    0x03B1, 0x00DF, 0x0393, 0x03C0, 0x03A3, 0x03C3, 0x00B5, 0x03C4,
    0x03A6, 0x0398, 0x03A9, 0x03B4, 0x221E, 0x03C6, 0x03B5, 0x2229,
    0x2261, 0x00B1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00F7, 0x2248,
    0x00B0, 0x2219, 0x00B7, 0x221A, 0x207F, 0x00B2, 0x25A0, 0x00A0,
];
var CP437_BYTE = null;
function cp437Byte(ch) {
    var code = ch.charCodeAt(0);
    if (code < 0x80) {
        return code;
    }
    if (!CP437_BYTE) {
        CP437_BYTE = {};
        for (var i = 0; i < CP437_HIGH.length; i++) {
            CP437_BYTE[CP437_HIGH[i]] = 0x80 + i;
        }
    }
    return CP437_BYTE[code] || 0;
}
// ---- end lib/cot_ui.js ----
// ---- lib/carrier_net.js ----
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
// ---- end lib/carrier_net.js ----
// ---- lib/carrier_game.js ----
//
//  CARRiER's game state, kept in the script's v3.data store (shared by every
//  node, one file). Design in docs/design.md.
//
//    season          { id, seed, started }      the network's seed
//    p.<user id>     a player (see newPlayer)
//    f.<number>      the first caller to identify it: [handle, kind, day]
//    n.<ms>.<id>     a Scene Daily item: { t, h, m }
//
//  First finds and news items are a key each, so two nodes writing at once
//  can't drop each other's change.
//

var FREE_MINUTES = 240; //  a day
var BANK_CAP = 600; //  unused minutes carry over up to this
var DEBT_FLOOR = -480; //  how far the phone bill can run
var HEAT_DECAY = 1; //  heat lost per hour
var NEWS_KEEP = 150;

var RANKS = [
    [0, 'Lamer'], [100, 'Wannabe'], [400, 'Phreak'], [1200, 'Hacker'], [3000, 'Elite'], [8000, 'Legion'],
];

//  The rep a rank starts at
function rankRep(name) {
    for (var i = 0; i < RANKS.length; i++) {
        if (RANKS[i][1] === name) {
            return RANKS[i][0];
        }
    }
    return 0;
}

//  Past Wannabe, each rank also needs a job done for someone in the scene
//  (all made-up handles). done(p) says whether the player has done it.
var RANK_TESTS = {
    Phreak: { who: 'Ghost Line', job: 'Get into any system.',
        done: function (p) { return Object.keys(p.owned || {}).length > 0; } },
    Hacker: { who: 'The Operator', job: 'Get privileged access on a VAX, a UNIX box or a Prime.',
        done: function (p) {
            return Object.keys(p.owned || {}).some(function (n) {
                return p.owned[n] === 'p' && /^(vms|unix|prime)$/.test(p.found[n]);
            });
        } },
    Elite: { who: 'Cold Fusion', job: 'Make a call through a PBX with a barrier code.',
        done: function (p) { return (p.disaCalls || 0) > 0; } },
    Legion: { who: 'Ringmaster', job: 'Take a voice mailbox and stash a code in it.',
        done: function (p) { return !!p.vmb && (p.stash || []).length > 0; } },
};

//  A rank: by rep alone for a number, or for a player by rep and the rank
//  tests passed on the way up
function rankOf(x) {
    var player = typeof x === 'object' && x;
    var rep = player ? x.rep : x;
    var name = RANKS[0][1];
    for (var i = 1; i < RANKS.length; i++) {
        var t = RANK_TESTS[RANKS[i][1]];
        if (rep < RANKS[i][0] || (player && t && !t.done(player))) {
            break;
        }
        name = RANKS[i][1];
    }
    //  a rank earned in an earlier season is kept (phase 5)
    if (player && player.rankFloor && rankRep(player.rankFloor) > rankRep(name)) {
        name = player.rankFloor;
    }
    return name;
}

//  The next rank up for a player: { name, rep, test } or null at the top
function nextRank(p) {
    var cur = rankRep(rankOf(p));
    for (var i = 0; i < RANKS.length; i++) {
        if (RANKS[i][0] > cur) {
            return { name: RANKS[i][1], rep: RANKS[i][0], test: RANK_TESTS[RANKS[i][1]] || null };
        }
    }
    return null;
}

//  A new rank since last time: told once, and in the Scene Daily
function checkPromotion(p) {
    var r = rankOf(p);
    if (rankRep(r) > rankRep(p.rank || 'Lamer')) {
        p.rank = r;
        news(p.h, 'made ' + r + '.');
        return r;
    }
    return '';
}

//  The modem you have: earned with rank, or bought sooner on the Hack Shack
//  (phase 3). Faster scans and screens.
function modemOf(p) {
    var r = rankRep(rankOf(p));
    var g = p.gear || {};
    if (r >= rankRep('Hacker') || g.v32b) return { name: g.v32b ? 'V.32bis 14.4' : 'USR Courier 14.4', baud: 14400, speed: 0.6 };
    if (r >= rankRep('Phreak') || g.hst) return { name: g.hst ? 'USR Courier HST 9600' : 'Hayes Ultra 9600', baud: 9600, speed: 0.75 };
    return { name: 'Hayes-compatible 2400', baud: 2400, speed: 1 };
}

function today() {
    return v3.util.date('2006-01-02');
}

function nowMs() {
    return Date.now();
}

//  ---- the season ----

function season() {
    var s = v3.data.get('season');
    if (!s) {
        s = { id: 1, seed: String(hash32(String(nowMs()) + '|' + v3.util.random(1000000000))), started: today() };
        v3.data.set('season', s);
        seasonTips(s);
    }
    return s;
}

//  Word on the street when a season opens: a few exchanges worth a look
function seasonTips(s) {
    var boss = bossNumber(s.seed);
    if (boss) {
        news('the scene', 'Word is ' + npaCity(boss.slice(0, 3)) + '\'s Switching Control Center dials in from ' + boss.slice(0, 3) + '-' + boss.slice(3, 6) + '.');
    }
    var said = 0;
    for (var tries = 0; tries < 4000 && said < 3; tries++) {
        var npa = NPAS[v3.util.random(NPAS.length)][0];
        var nxx = String(200 + v3.util.random(800));
        var prof = exchangeProfile(s.seed, npa, nxx);
        if (prof === 'edu' || prof === 'gov' || (prof === 'telco' && said === 2)) {
            var what = { edu: 'crawling with carriers', gov: 'full of iron, and hot', telco: 'phone company. Careful.' }[prof];
            news('the scene', 'Word is ' + npa + '-' + nxx + ' is ' + what);
            said++;
        }
    }
}

//  ---- players ----

function newPlayer(home) {
    return {
        h: v3.user.handle,
        home: home, //  area code
        phone: home + String(200 + v3.util.random(700)) + padStart(String(v3.util.random(10000)), 4).replace(/ /g, '0'),
        min: FREE_MINUTES,
        day: today(),
        heat: 0,
        heatAt: nowMs(),
        rep: 0,
        busts: [], //  ms of each bust, the last few
        grounded: 0, //  ms until which the modem is gone
        found: {}, //  number -> kind, or 'C?' / 'T?' until dialed
        owned: {}, //  number -> 'u' (user) or 'p' (privileged)
        loot: {}, //  number -> 1
        scan: {}, //  npa+nxx -> hex bitmap of the 1000 ten-number blocks scanned
        dials: 0,
        firsts: 0,
        seenNews: 0,
        season: 0,
        started: nowMs(),
        cash: 0,
        wares: [],
        gear: {},
        badges: {},
    };
}

//  Fields added since phase 1, for players from before them
function upgradePlayer(p, seed) {
    p.cash = p.cash || 0;
    p.wares = p.wares || [];
    p.gear = p.gear || {};
    p.badges = p.badges || {};
    p.started = p.started || nowMs();
    //  the Hack Shack is on everyone's found list
    var fence = fenceNumber(seed, p.home);
    if (!p.found[fence]) {
        p.found[fence] = 'fence';
    }
}

function loadPlayer() {
    var p = v3.data.get('p.' + v3.user.id);
    if (!p) {
        return null;
    }
    //  v3.data hands back Go-backed values, whose arrays don't grow with
    //  push(); a plain JavaScript copy behaves like any other object
    p = JSON.parse(JSON.stringify(p));
    p.h = v3.user.handle;
    return p;
}

function savePlayer(p) {
    v3.data.set('p.' + v3.user.id, p);
}

//  The daily refill and the heat cooling off since the last visit
function settle(p) {
    var d = today();
    if (p.day !== d) {
        if (p.min < 0) {
            p.min += FREE_MINUTES;
        } else {
            p.min = Math.min(BANK_CAP, p.min + FREE_MINUTES);
        }
        p.day = d;
    }
    var now = nowMs();
    var hours = (now - (p.heatAt || now)) / 3600000;
    p.heat = Math.max(0, p.heat - hours * HEAT_DECAY);
    p.heatAt = now;
}

function isGrounded(p) {
    return p.grounded && p.grounded > nowMs();
}

//  Spend minutes for one call. Past zero the bill runs up, and the heat
//  from each call triples (the phone bill gets noticed).
function chargeCall(p, npa) {
    var cost = npa === p.home ? 1 : 3;
    p.min = Math.max(DEBT_FLOOR, p.min - cost);
    p.dials += 1;
    return p.min < 0 ? 3 : 1;
}

function addHeat(p, n) {
    p.heat = Math.min(100, p.heat + n);
}

//  Whether this action gets you busted. risk: 'dial' (one of many, a small
//  chance each) or 'act' (a login, applying to a board: a bigger one).
function bustRoll(p, risk) {
    if (p.heat >= 100) {
        return true;
    }
    if (risk === 'dial') {
        return p.heat > 60 && Math.random() < (p.heat - 60) / 2000;
    }
    return p.heat > 50 && Math.random() < (p.heat - 50) / 100;
}

//  Busted: a time-out, longer for a repeat offender this week. Rank, rep
//  and finds are never touched; today's minutes go with the modem.
function bust(p, where) {
    var now = nowMs();
    p.busts = (p.busts || []).filter(function (t) { return now - t < 7 * 86400000; });
    var hours = Math.min(24, 4 * (1 + p.busts.length));
    p.busts.push(now);
    p.grounded = now + hours * 3600000;
    p.heat = 30;
    p.heatAt = now;
    p.min = Math.min(p.min, 0);
    p.lastBust = now;
    //  the codes in your pocket go; a voice mailbox keeps its stash, and a
    //  shell account somewhere else keeps half of them
    var kept = (p.gear || {}).shell ? (p.codes || []).slice(0, Math.floor((p.codes || []).length / 2)) : [];
    p.codes = kept;
    news(p.h, 'got busted ' + where + '. Grounded for ' + hours + ' hours.');
    return hours;
}

//  ---- finds and rep ----

//  Record that this player identified a number. Returns the rep earned:
//  0 if they had it already, triple if nobody had identified it before.
function identify(p, num, kind) {
    var known = p.found[num];
    if (known && known !== 'C?' && known !== 'T?') {
        return 0;
    }
    p.found[num] = kind;
    if (p.leadNums && p.leadNums[num]) {
        delete p.leadNums[num];
        p.leadsDialed = (p.leadsDialed || 0) + 1;
    }
    var base = FIND_REP[kind] || 1;
    var first = v3.data.get('f.' + num);
    if (!first) {
        v3.data.set('f.' + num, [p.h, kind, today()]);
        p.firsts += 1;
        base *= 3;
        if (base >= 30) {
            news(p.h, 'found a ' + KIND_NAMES[kind] + (/^NUA/.test(num) ? ' on Telenet' : ' in ' + num.slice(0, 3) + '-' + num.slice(3, 6)));
        }
    }
    p.rep += base;
    return base;
}

function firstFinder(num) {
    var f = v3.data.get('f.' + num);
    return f ? f[0] : '';
}

//  A break-in: the host's worth again, double for a privileged account, the
//  first time this player gets each level.
function breakIn(p, host, priv) {
    var had = p.owned[host.num];
    if (had === 'p' || (had === 'u' && !priv)) {
        return 0;
    }
    var worth = (FIND_REP[host.kind] || 5) * (priv ? 2 : 1);
    p.owned[host.num] = priv ? 'p' : 'u';
    p.rep += worth;
    if (priv && worth >= 30) {
        news(p.h, 'got ' + (host.kind === 'unix' ? 'root' : 'privileged access') + ' on a ' + KIND_NAMES[host.kind]);
    }
    return worth;
}

//  One piece of loot from a host, once each: id names it ('main' for the
//  first kind every host has), worth defaults to the host's find value
function takeLoot(p, host, id, worth) {
    id = id || 'main';
    var have = p.loot[host.num];
    var list = have === 1 ? ['main'] : have ? String(have).split(',') : [];
    if (list.indexOf(id) >= 0) {
        return 0;
    }
    list.push(id);
    p.loot[host.num] = list.join(',');
    worth = worth || FIND_REP[host.kind] || 5;
    p.rep += worth;
    addWare(p, host, id);
    return worth;
}

//  ---- cash, wares and the fence (phase 3) ----
//  Loot you can sell goes into your wares: { what, num, id, kind }. The fence
//  pays the price below; the first to sell a piece of loot gets it in full,
//  each seller after gets less (s.<num>.<id> counts the sales).

var WARE_PRICES = {
    'the SYSUAF account list': 60, '/etc/passwd': 40, 'the system administration directory': 50,
    'the account report': 45, 'a remote access barrier code': 30, 'a COSMOS data line list': 70,
    'a grades file': 35, 'a payroll file': 55, 'a contract index': 80, 'a switch report': 65,
};

function addWare(p, host, id) {
    var what = { main: { vms: 'the SYSUAF account list', unix: '/etc/passwd', prime: 'the system administration directory',
        hp3000: 'the account report', pbx: 'a remote access barrier code' }[host.kind] }[id] ||
        { modems: 'a modem pool list', lsys: 'a UUCP L.sys file', dialups: 'a dialup list', sites: 'a remote sites list',
            backupnode: 'a backup node number', sir: 'a COSMOS data line list',
            prize: { edu: 'a grades file', biz: 'a payroll file', gov: 'a contract index', telco: 'a switch report' }[host.prof] }[id];
    if (!what) {
        return;
    }
    p.wares = p.wares || [];
    p.wares.push({ what: what, num: host.num, id: id, kind: host.kind });
}

//  What the fence pays for a ware right now
function warePrice(w) {
    var base = WARE_PRICES[w.what] || 15;
    var sold = v3.data.get('s.' + w.num + '.' + w.id) || 0;
    return Math.max(2, Math.round(base / (1 + sold)));
}

//  Sell ware i; returns the cash it fetched
function sellWare(p, i) {
    var w = p.wares[i];
    var price = warePrice(w);
    v3.data.set('s.' + w.num + '.' + w.id, (v3.data.get('s.' + w.num + '.' + w.id) || 0) + 1);
    p.wares.splice(i, 1);
    p.cash = (p.cash || 0) + price;
    p.sold = (p.sold || 0) + 1;
    return price;
}

//  ---- gear (phase 3) ----
//  durable: owned once. count: a consumable, bought one at a time.
//  rank: the fence won't sell it to anyone below.

var GEAR = [
    { id: 'hst', name: 'USR Courier HST 9600', price: 150, rank: 'Wannabe', durable: true,
        about: 'A 9600 baud modem before your rank gets you one. Faster scans and screens.' },
    { id: 'v32b', name: 'V.32bis 14.4 modem', price: 400, rank: 'Phreak', durable: true,
        about: '14,400 baud. The fastest thing on the block.' },
    { id: 'excl', name: 'Exclusion list', price: 60, rank: 'Lamer', durable: true,
        about: 'CARRiER skips numbers already on your found list and blocks already scanned. Saves minutes.' },
    { id: 'nudge', name: 'Nudge strings', price: 80, rank: 'Wannabe', durable: true,
        about: 'Sends a CR to lines that go quiet. A few "timeouts" are carriers that only wake up for one.' },
    { id: 'tonedet', name: 'Tone detect', price: 70, rank: 'Wannabe', durable: true,
        about: 'Waits out lines that ring and ring. A few are PBX dial tones and voice mail that answer late.' },
    { id: 'bluebox', name: 'Blue box', price: 250, rank: 'Phreak', durable: true,
        about: '2600 Hz and MF tones. Free long distance into a crossbar exchange. An ESS exchange hears it.' },
    { id: 'redbox', name: 'Red box', price: 20, rank: 'Wannabe',
        about: 'Quarter tones: one call from a payphone. That call adds no heat.' },
    { id: 'beige', name: 'Beige box', price: 35, rank: 'Phreak',
        about: 'A lineman\'s set on a neighbour\'s line. Use it from Gear and tools: heat drops by 40.' },
    { id: 'crack', name: 'Crack 4.1', price: 120, rank: 'Phreak', durable: true,
        about: 'Run it on a stolen /etc/passwd. In a while: accounts on that box, and maybe a reused password next door.' },
    { id: 'shell', name: 'Public-access UNIX shell', price: 300, rank: 'Hacker', durable: true,
        about: 'Somewhere to keep things. A bust takes half the codes you carry, not all.' },
];

//  Zines: each one adds notebook pages (carrier_notes.js, zine: <id>)
var ZINES = [
    { id: 'phrack25', name: 'Phrack 25', price: 15, about: 'Unix cracking tips, hiding out under Unix, the blue box.' },
    { id: 'phrack27', name: 'Phrack 26 and 27', price: 20, about: 'COSMOS parts one and two, looking around in DECnet.' },
    { id: 'phrack32', name: 'Phrack 32', price: 10, about: 'Unix "nasties".' },
    { id: 'phrack40', name: 'Phrack 40', price: 15, about: 'BT Tymnet, all three parts.' },
    { id: 'phrack43', name: 'Phrack 43', price: 10, about: 'Playing hide and seek, Unix style.' },
    { id: 'lodtj4', name: 'LOD/H Technical Journal 4', price: 25, about: 'The Telenet directory.' },
];

function gearItem(id) {
    return GEAR.concat(ZINES).filter(function (g) { return g.id === id; })[0] || null;
}

function hasGear(p, id) {
    return !!(p.gear && p.gear[id]);
}

//  Buy an item: '' if bought, else why not
function buyGear(p, id) {
    var g = gearItem(id);
    p.gear = p.gear || {};
    if (!g) return 'Never heard of it.';
    if (g.rank && rankRep(rankOf(p)) < rankRep(g.rank)) return 'The fence won\'t sell that to a ' + rankOf(p) + '. Come back a ' + g.rank + '.';
    if ((g.durable || /^(phrack|lod)/.test(id)) && p.gear[id]) return 'You already have one.';
    if ((p.cash || 0) < g.price) return 'That\'s $' + g.price + '. You have $' + (p.cash || 0) + '.';
    p.cash -= g.price;
    p.gear[id] = g.durable || /^(phrack|lod)/.test(id) ? 1 : (p.gear[id] || 0) + 1;
    return '';
}

//  Use one of a consumable: true if there was one
function useGear(p, id) {
    if (!p.gear || !p.gear[id]) return false;
    p.gear[id] -= 1;
    if (!p.gear[id]) delete p.gear[id];
    return true;
}

//  ---- Crack (phase 3) ----
//  A run on a stolen passwd file takes CRACK_MINUTES of real time. When it
//  finishes, it gives two user accounts on that host, and the same password
//  on one of its neighbours (people reuse them). p.jobs: [{ num, done }];
//  p.cracked: { number: [[user, pw, false], ...] }.

var CRACK_MINUTES = 20;
var CRACK_WORDS = ['wizard', 'secret', 'dragon', 'snoopy', 'qwerty', 'letmein', 'trustno1', 'garfield', 'enterprise',
    'computer', 'baseball', 'mustang', 'tiger', 'falcon'];

function startCrack(p, num) {
    p.jobs = p.jobs || [];
    if (p.jobs.some(function (j) { return j.num === num; }) || (p.cracked && p.cracked[num])) {
        return false;
    }
    p.jobs.push({ num: num, done: nowMs() + CRACK_MINUTES * 60000 });
    return true;
}

//  Finished runs: their results added, and returned as [{ num, accounts, reused }]
function finishCracks(p, seed) {
    var now = nowMs();
    var done = [];
    p.jobs = (p.jobs || []).filter(function (j) {
        if (j.done > now) return true;
        var r = rng(hash32(seed + '|crack|' + j.num));
        var users = someUsersFor(j.num, 5);
        var accts = [[users[1], pick(r, CRACK_WORDS), false], [users[3], pick(r, CRACK_WORDS), false]];
        //  a password a player set (root's, SYSTEM's) or an account a
        //  player added falls to the wordlist if it's weak
        var ov = keepLoad(seed, j.num);
        Object.keys(ov.pw).forEach(function (u) {
            if (crackWeak(ov.pw[u], users)) accts.push([u, ov.pw[u], true]);
        });
        Object.keys(ov.acc).forEach(function (u) {
            if (crackWeak(ov.acc[u][0], users)) accts.push([u, ov.acc[u][0], !!ov.acc[u][1]]);
        });
        p.cracked = p.cracked || {};
        p.cracked[j.num] = accts;
        p.crackedAt = p.crackedAt || {};
        p.crackedAt[j.num] = now;
        var res = { num: j.num, accounts: accts, reused: '' };
        var host = { num: j.num, kind: 'unix' };
        var next = neighbours(seed, host, 'unix', 1)[0];
        if (next) {
            p.cracked[next] = (p.cracked[next] || []).concat([[accts[0][0], accts[0][1], false]]);
            addLead(p, next);
            res.reused = next;
        }
        p.crackRuns = (p.crackRuns || 0) + 1;
        done.push(res);
        return false;
    });
    return done;
}

//  Words Crack's dictionary has besides CRACK_WORDS
var CRACK_MORE = ['password', 'root', 'toor', 'admin', 'system', 'unix', 'hacker', 'god', 'love', 'sex', 'secret1', 'test',
    'guest', 'master', 'cracker', 'phreak', 'elite', 'eleet', 'owned', 'r00t', 'h4x0r', 'carrier', 'modem', 'wargames'];

//  Whether Crack 4.1 would get pw: a dictionary word, a user's name, or
//  six lowercase letters or fewer
function crackWeak(pw, users) {
    var lw = String(pw).toLowerCase();
    return CRACK_WORDS.indexOf(lw) >= 0 || CRACK_MORE.indexOf(lw) >= 0 || (users || []).indexOf(lw) >= 0 ||
        /^[a-z]{1,6}$/.test(pw);
}

//  Whether a password on num was set after the player last ran Crack
//  there, so another run is worth it
function crackStale(p, seed, num) {
    var by = keepLoad(seed, num).pwBy;
    var at = (p.crackedAt || {})[num] || 0;
    return Object.keys(by).some(function (u) { return by[u][2] > at; });
}

//  The made-up users of a host (as carrier_hosts.js someUsers names them)
function someUsersFor(num, n) {
    var r = rng(hash32(num + '|users'));
    var names = ['jsmith', 'kwong', 'mdavis', 'operator', 'tlee', 'rgarcia', 'bjones', 'admin', 'pmiller',
        'lchen', 'dbrown', 'sclark', 'field', 'nwilson', 'aharris'];
    var out = [];
    for (var i = 0; i < n && names.length; i++) {
        out.push(names.splice(Math.floor(r() * names.length), 1)[0]);
    }
    return out;
}

//  ---- badges (phase 3) ----
//  Kept across seasons in p.badges: { id: 'yyyy-mm-dd' }. test(p) says
//  whether it's earned; cash is paid once when it is.

var BADGES = [
    { id: 'carrier', name: 'First Carrier', about: 'Dial a carrier.', cash: 0,
        test: function (p) { return Object.keys(p.found).some(function (n) { return p.found[n] !== 'C?' && p.found[n] !== 'T?' && !/^(fax|fence)$/.test(p.found[n]); }); } },
    { id: 'in', name: 'You\'re In', about: 'Log into any system.', cash: 10,
        test: function (p) { return Object.keys(p.owned).length > 0; } },
    { id: 'root', name: 'Root', about: 'Root on a UNIX box.', cash: 25, test: function (p) { return ownedKind(p, 'unix', 'p'); } },
    { id: 'system', name: 'SYSTEM', about: 'Privileged on a VAX.', cash: 25, test: function (p) { return ownedKind(p, 'vms', 'p'); } },
    { id: 'primos', name: 'Primos Prime', about: 'Privileged on a Prime.', cash: 25, test: function (p) { return ownedKind(p, 'prime', 'p'); } },
    { id: 'mgr', name: 'MANAGER.SYS', about: 'Privileged on an HP3000.', cash: 25, test: function (p) { return ownedKind(p, 'hp3000', 'p'); } },
    { id: 'craft', name: 'Craft Login', about: 'Log into a PBX maintenance port.', cash: 15, test: function (p) { return ownedKind(p, 'pbx', ''); } },
    { id: 'barrier', name: 'Barrier Broken', about: 'Call through a PBX with a barrier code.', cash: 20, test: function (p) { return (p.disaCalls || 0) > 0; } },
    { id: 'box', name: 'Box of Your Own', about: 'Take a voice mailbox.', cash: 15, test: function (p) { return !!p.vmb; } },
    { id: 'hoard', name: 'Code Hoarder', about: 'Ten codes stashed in voice mail.', cash: 50, test: function (p) { return (p.stash || []).length >= 10; } },
    { id: 'full', name: 'Full Exchange', about: 'Scan all 10,000 numbers of one exchange.', cash: 50,
        test: function (p) { return Object.keys(p.scan || {}).some(function (ex) { return /^f{250}$/.test(p.scan[ex]); }); } },
    { id: 'catalog', name: 'Card Catalog', about: 'A hundred numbers on your found list.', cash: 30, test: function (p) { return Object.keys(p.found).length >= 100; } },
    { id: 'pioneer', name: 'Pioneer', about: 'First to find ten systems.', cash: 40, test: function (p) { return (p.firsts || 0) >= 10; } },
    { id: 'dots', name: 'Connect the Dots', about: 'Dial ten numbers a system\'s files led you to.', cash: 30, test: function (p) { return (p.leadsDialed || 0) >= 10; } },
    { id: 'packet', name: 'Packet Rat', about: 'Find a system on Telenet.', cash: 20,
        test: function (p) { return Object.keys(p.found).some(function (n) { return /^NUA/.test(n); }); } },
    { id: 'club', name: 'Welcome to the Club', about: 'Get busted. Everybody does.', cash: 10, test: function (p) { return !!p.lastBust; } },
    { id: 'ghost', name: 'Ghost', about: 'A week without a bust.', cash: 40,
        test: function (p) { return nowMs() - Math.max(p.lastBust || 0, p.started || nowMs()) >= 7 * 86400000; } },
    { id: 'owl', name: 'Night Owl', about: 'Play between 2 and 5 in the morning.', cash: 10, test: function (p) { return !!p.owl; } },
    { id: 'fence', name: 'Fence\'s Favourite', about: 'Sell fifty pieces of loot.', cash: 75, test: function (p) { return (p.sold || 0) >= 50; } },
    { id: 'wordlist', name: 'Wordlist', about: 'Crack a password file.', cash: 20, test: function (p) { return (p.crackRuns || 0) > 0; } },
    { id: 'tone', name: '2600', about: 'Make a call on a blue box.', cash: 20, test: function (p) { return (p.blueCalls || 0) > 0; } },
    { id: 'quarter', name: 'Quarter Back', about: 'Make a call on a red box.', cash: 10, test: function (p) { return (p.redCalls || 0) > 0; } },
    { id: 'tracks', name: 'Clean Hands', about: 'Cover your tracks on a system.', cash: 20, test: function (p) { return (p.cleaned || 0) > 0; } },
    { id: 'talker', name: 'Smooth Talker', about: 'Talk an admin who caught you into letting you stay.', cash: 30,
        test: function (p) { return (p.bluffs || 0) > 0; } },
    { id: 'wirecenter', name: 'Wire Center', about: 'Get into COSMOS.', cash: 60, test: function (p) { return ownedKind(p, 'cosmos', ''); } },
    { id: 'raider', name: 'Raider', about: 'Help bring down a raid.', cash: 50, test: function (p) { return (p.raids || 0) > 0; } },
    { id: 'mvp', name: 'Ringleader', about: 'Do the most on a raid.', cash: 100, test: function (p) { return (p.raidMVPs || 0) > 0; } },
    { id: 'mabell', name: 'Ma Bell', about: 'Crack the season\'s Switching Control Center first.', cash: 500, test: function (p) { return (p.bossWins || 0) > 0; } },
    { id: 'rat', name: 'Rat', about: 'Tip off the phone company about a rival.', cash: 0, test: function (p) { return (p.tips || 0) > 0; } },
    { id: 'trust', name: 'Trusted Host', about: 'Get into a system through another one\'s trust.', cash: 25, test: function (p) { return (p.hops || 0) > 0; } },
    { id: 'archivist', name: 'Archivist', about: 'Every page of the notebook.', cash: 100, test: function (p) { var n = notesFor(p); return n.stuck === 0 && n.zines === 0; } },
    { id: 'loaded', name: 'Fully Loaded', about: 'Own every piece of durable gear.', cash: 100,
        test: function (p) { return GEAR.every(function (g) { return !g.durable || hasGear(p, g.id); }); } },
    { id: 'legion', name: 'Legion', about: 'Make the top rank.', cash: 250, test: function (p) { return rankOf(p) === 'Legion'; } },
];

function ownedKind(p, kind, level) {
    return Object.keys(p.owned).some(function (n) {
        return p.found[n] === kind && (!level || p.owned[n] === level);
    });
}

//  New badges since last time: added, paid, in the Scene Daily, and returned
function checkBadges(p) {
    p.badges = p.badges || {};
    var h = new Date().getHours();
    if (h >= 2 && h < 5) {
        p.owl = 1;
    }
    var got = [];
    BADGES.forEach(function (b) {
        if (!p.badges[b.id] && b.test(p)) {
            p.badges[b.id] = today();
            p.cash = (p.cash || 0) + b.cash;
            news(p.h, 'earned the ' + b.name + ' badge.');
            got.push(b);
        }
    });
    return got;
}

//  A number from a host's files: onto the found list, still to be dialed.
//  True if it was new to this player.
function addLead(p, num) {
    if (p.found[num]) {
        return false;
    }
    p.found[num] = 'C?';
    p.rep += 2;
    p.leadNums = p.leadNums || {};
    p.leadNums[num] = 1;
    return true;
}

//  ---- codes ----
//  A barrier code: { c, disa (the DISA line it works on), uses }

var CODE_USES = 6;

function addCode(p, code, disa) {
    p.codes = p.codes || [];
    if (p.codes.concat(p.stash || []).some(function (x) { return x.c === code; })) {
        return false;
    }
    p.codes.push({ c: code, disa: disa, uses: CODE_USES });
    return true;
}

//  Use a carried code for one long-distance scan or call. Returns the code
//  and whether it burned: used up, or killed by the phone company when
//  you're hot.
function useCode(p, c) {
    var codes = p.codes || [];
    if (!codes.length) {
        return null;
    }
    codes.sort(function (a, b) { return b.uses - a.uses; });
    if (c) {
        var i = codes.map(function (x) { return x.c; }).indexOf(c);
        if (i < 0) {
            return null;
        }
        codes.unshift(codes.splice(i, 1)[0]);
    }
    var code = codes[0];
    code.uses -= 1;
    var burned = code.uses <= 0 || (p.heat > 70 && Math.random() < 0.4);
    if (burned) {
        codes.shift();
    }
    return { c: code.c, disa: code.disa, uses: code.uses, burned: burned };
}

//  ---- what's been scanned ----

function scanBits(p, ex) {
    var hex = p.scan[ex] || '';
    var bits = [];
    for (var i = 0; i < 250; i++) {
        var v = parseInt(hex.charAt(i) || '0', 16);
        bits.push(v & 8 ? 1 : 0, v & 4 ? 1 : 0, v & 2 ? 1 : 0, v & 1 ? 1 : 0);
    }
    return bits;
}

function markScanned(p, ex, block) {
    var bits = scanBits(p, ex);
    bits[block] = 1;
    var hex = '';
    for (var i = 0; i < 1000; i += 4) {
        hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
    }
    p.scan[ex] = hex.replace(/0+$/, '');
}

//  ---- the Scene Daily ----

function news(handle, text) {
    var t = nowMs();
    v3.data.set('n.' + t + '.' + (v3.user.id || 0), { t: t, h: handle, m: text });
}

//  The newest items first
function readNews(limit) {
    var all = v3.data.getAll();
    var items = [];
    var keys = Object.keys(all);
    for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('n.') === 0) {
            items.push({ key: keys[i], v: all[keys[i]] });
        }
    }
    items.sort(function (a, b) { return b.v.t - a.v.t; });
    for (var j = NEWS_KEEP; j < items.length; j++) {
        v3.data.delete(items[j].key);
    }
    return items.slice(0, limit).map(function (x) { return x.v; });
}

//  ---- the leaderboard ----

function leaders() {
    var all = v3.data.getAll();
    var out = [];
    Object.keys(all).forEach(function (k) {
        if (k.indexOf('p.') === 0) {
            var p = all[k];
            out.push({ id: k.slice(2), h: p.h, rep: p.rep, rank: rankOf(p), finds: Object.keys(p.found || {}).length, firsts: p.firsts || 0,
                owned: Object.keys(p.owned || {}).length, busts: (p.busts || []).length });
        }
    });
    out.sort(function (a, b) { return b.rep - a.rep || b.firsts - a.firsts; });
    return out;
}

//  ---- seasons and the Hall of Fame (phase 5) ----
//  A season runs SEASON_DAYS, or until someone cracks the boss. The next
//  one's seed comes from the last, so two nodes rolling it over at once
//  write the same season. hof.<id>: the season's record.

var SEASON_DAYS = 30;

function seasonOver(s) {
    var started = new Date(s.started + 'T00:00:00').getTime();
    return !!s.bossDown || nowMs() - started > SEASON_DAYS * 86400000;
}

//  The season, rolled over to a new one if this one is done
function currentSeason() {
    var s = season();
    if (!seasonOver(s)) {
        return s;
    }
    var all = leaders();
    var raids = [];
    for (var i = 0; i < RAIDS_PER_SEASON; i++) {
        var st = raidState(s, i);
        if (st.done) raids.push(raidAt(s.seed, i).name + ': ' + st.done.mvp);
    }
    v3.data.set('hof.' + s.id, { id: s.id, started: s.started, ended: today(), top: all[0] ? all[0].h + ' (' + all[0].rep + ' rep)' : '',
        boss: s.bossDown || '', raids: raids });
    var next = { id: s.id + 1, seed: String(hash32(s.seed + '|next|' + (s.id + 1))), started: today() };
    v3.data.set('season', next);
    keepForget();
    news('the scene', 'Season ' + s.id + ' is over' + (s.bossDown ? ': ' + s.bossDown + ' cracked the phone company.' : '.') + ' The network is new.');
    seasonTips(next);
    return next;
}

function hallOfFame() {
    var all = v3.data.getAll();
    return Object.keys(all).filter(function (k) { return k.indexOf('hof.') === 0; })
        .map(function (k) { return all[k]; }).sort(function (a, b) { return b.id - a.id; });
}

//  A new season for a player: this season's finds and score go, the rest
//  stays (badges, gear, cash, the rank title, lifetime totals)
function resetForSeason(p, s) {
    p.life = p.life || { rep: 0, seasons: 0, firsts: 0 };
    p.life.rep += p.rep || 0;
    p.life.firsts += p.firsts || 0;
    p.life.seasons += 1;
    p.rankFloor = rankOf(p);
    p.rep = 0;
    p.firsts = 0;
    p.found = {};
    p.owned = {};
    p.loot = {};
    p.scan = {};
    p.codes = [];
    p.stash = [];
    p.vmb = null;
    p.wares = [];
    p.cracked = {};
    p.jobs = [];
    p.leadNums = {};
    p.raidsClaimed = {};
    p.bossLogin = null;
    p.season = s.id;
    upgradePlayer(p, s.seed);
}

//  ---- raids (phase 5) ----
//  Four a season, one after another. Each needs pieces from different
//  callers: its dial-in (find the number), an account (a piece of loot of
//  the right kind) and some barrier codes. Every contribution is its own
//  key, rc.<season>.<raid>.<ms>.<user id>.<random> = { h, piece }, so two nodes
//  can't drop each other's; rd.<season>.<raid> marks one done. Rewards are
//  claimed by each contributor on their next visit.

var RAIDS_PER_SEASON = 4;
var RAID_TARGETS = [
    { name: 'The Lost City', what: 'an elite board that never answers for strangers', kind: 'bbs', ware: 'a UUCP L.sys file' },
    { name: 'Operation Night Owl', what: 'a phone company billing VAX', kind: 'vms', ware: 'the SYSUAF account list' },
    { name: 'Granite Mainframe', what: 'Granite Aerospace\'s mainframe', kind: 'hp3000', ware: 'the account report' },
    { name: 'Operation Ma Bell', what: 'the login to the phone company\'s Switching Control Center', kind: 'unix', ware: '/etc/passwd' },
];

//  Raid i of a season: its target number (a carrier in a named exchange),
//  the loot it needs and how many codes
function raidAt(seed, i) {
    var t = RAID_TARGETS[i];
    var r = rng(hash32(seed + '|raid|' + i));
    for (var tries = 0; tries < 400; tries++) {
        var npa = SEASON_NPAS[Math.floor(r() * SEASON_NPAS.length)][0];
        var nxx = String(200 + Math.floor(r() * 800));
        var prof = exchangeProfile(seed, npa, nxx);
        if (!prof || prof === 'res') continue;
        for (var l = 0; l < 3000; l++) {
            var line = ('000' + l).slice(-4);
            if (lineResult(seed, npa, nxx, line).result === 'CARRIER') {
                return { i: i, name: t.name, what: t.what, num: npa + nxx + line, npa: npa, nxx: nxx, ware: t.ware, codes: 2 + i, boss: i === RAIDS_PER_SEASON - 1 };
            }
        }
    }
    return null;
}

//  Where a raid stands: { dial, acct, codes, by: { handle: pieces }, done }
function raidState(s, i) {
    var all = v3.data.getAll();
    var pre = 'rc.' + s.id + '.' + i + '.';
    var st = { dial: '', acct: '', codes: 0, by: {}, done: all['rd.' + s.id + '.' + i] || null };
    Object.keys(all).sort().forEach(function (k) {
        if (k.indexOf(pre) !== 0) return;
        var c = all[k];
        if (c.piece === 'dial' && !st.dial) st.dial = c.h;
        else if (c.piece === 'acct' && !st.acct) st.acct = c.h;
        else if (c.piece === 'code') st.codes++;
        else return;
        st.by[c.h] = (st.by[c.h] || 0) + 1;
    });
    return st;
}

//  The raid open now: the first not yet done, or -1 when all are
function openRaid(s) {
    for (var i = 0; i < RAIDS_PER_SEASON; i++) {
        if (!raidState(s, i).done) return i;
    }
    return -1;
}

function contribute(p, s, i, piece) {
    //  the time, the caller and a random tail: two pieces never share a key
    v3.data.set('rc.' + s.id + '.' + i + '.' + nowMs() + '.' + v3.user.id + '.' + v3.util.random(1000000), { h: p.h, piece: piece });
}

//  Whether raid i has every piece; if so, marks it done (once) and says so
function raidComplete(p, s, i) {
    var raid = raidAt(s.seed, i);
    var st = raidState(s, i);
    if (st.done || !st.dial || !st.acct || st.codes < raid.codes) {
        return !!st.done;
    }
    var mvp = Object.keys(st.by).sort(function (a, b) { return st.by[b] - st.by[a]; })[0];
    v3.data.set('rd.' + s.id + '.' + i, { at: today(), mvp: mvp });
    news('the scene', raid.name + ' went down. ' + Object.keys(st.by).length + ' callers did it; ' + mvp + ' did the most.');
    return true;
}

var RAID_REP = 60, RAID_CASH = 40;

//  Rewards for raids this player helped finish: [{ raid, pieces, rep, cash }]
function claimRaids(p, s) {
    p.raidsClaimed = p.raidsClaimed || {};
    var got = [];
    for (var i = 0; i < RAIDS_PER_SEASON; i++) {
        var key = s.id + '.' + i;
        if (p.raidsClaimed[key]) continue;
        var st = raidState(s, i);
        var n = st.by[p.h] || 0;
        if (!st.done || !n) continue;
        p.raidsClaimed[key] = 1;
        var raid = raidAt(s.seed, i);
        var g = { raid: raid, pieces: n, rep: RAID_REP * n, cash: RAID_CASH * n, mvp: st.done.mvp === p.h };
        p.rep += g.rep;
        p.cash = (p.cash || 0) + g.cash;
        p.raids = (p.raids || 0) + 1;
        if (g.mvp) p.raidMVPs = (p.raidMVPs || 0) + 1;
        if (raid.boss) {
            p.bossLogin = bossLogin(s.seed);
        }
        got.push(g);
    }
    return got;
}

//  The boss falls: the first caller in wins the season. True if it was you.
function bossDown(p) {
    var s = season();
    if (s.bossDown) {
        return false;
    }
    s.bossDown = p.h;
    v3.data.set('season', s);
    p.bossWins = (p.bossWins || 0) + 1;
    news(p.h, 'cracked the phone company\'s Switching Control Center. The season is theirs.');
    return true;
}

//  ---- rivals (phase 5) ----
//  A tip to the phone company about a rival (tip.<their id>.<ms>), or a code
//  given to someone (gift.<their id>.<ms>): each lands when they next play.

var TIP_COST = 50;

function tipOff(p, rivalId, rivalHandle) {
    if ((p.cash || 0) < TIP_COST) {
        return 'A tip costs $' + TIP_COST + '. You have $' + (p.cash || 0) + '.';
    }
    p.cash -= TIP_COST;
    if (Math.random() < 0.3) {
        addHeat(p, 20);
        news('the scene', p.h + ' tried to rat out ' + rivalHandle + '. It came back on them.');
        return 'It came back on you. Heat +20.';
    }
    v3.data.set('tip.' + rivalId + '.' + nowMs(), { from: p.h });
    p.tips = (p.tips || 0) + 1;
    return 'The phone company has a new name on its list: ' + rivalHandle + '.';
}

function giveCode(p, toId, toHandle) {
    if (!(p.codes || []).length) {
        return 'You aren\'t carrying any codes.';
    }
    var code = p.codes.shift();
    v3.data.set('gift.' + toId + '.' + nowMs(), { from: p.h, code: code });
    return 'Code ' + code.c + ' is on its way to ' + toHandle + '.';
}

//  Tips and gifts waiting for this player: applied, removed, and returned
function collectMail(p) {
    var all = v3.data.getAll();
    var mine = v3.user.id;
    var notes = [];
    Object.keys(all).forEach(function (k) {
        if (k.indexOf('tip.' + mine + '.') === 0) {
            addHeat(p, 20);
            notes.push('Somebody tipped off the phone company about you. Heat +20.');
            news('the scene', 'Somebody tipped off the phone company about ' + p.h + '.');
            v3.data.delete(k);
        } else if (k.indexOf('gift.' + mine + '.') === 0) {
            var g = all[k];
            if (addCode(p, g.code.c, g.code.disa)) {
                notes.push(g.from + ' sent you code ' + g.code.c + ' for ' + fmtNum(g.code.disa) + '.');
            }
            v3.data.delete(k);
        }
    });
    return notes.concat(keepNotices(p));
}
// ---- end lib/carrier_game.js ----
// ---- lib/carrier_notes.js ----
//
//  CARRiER's notebook: scraps of paper that point at real text files in our
//  file areas. The host's way in is in the file, not in the note; the note
//  only says what to read and where. More pages turn up as you rank up.
//
//  The default accounts in carrier_net.js come from these same files.
//

var NOTES = [
    //  Lamer
    { kind: 'vms', rank: 'Lamer', file: 'accounts.vax', area: 'Hacking - Unix & VMS',
        text: 'VAX/VMS. Big list of accounts to try at Username:. Field service ones work a lot.' },
    { kind: 'unix', rank: 'Lamer', file: 'sirsunix.hac', area: 'Hacking - Unix & VMS',
        text: 'UNIX. Sir Hackalot\'s tutorial has the defaults table near the top. Lowercase!' },
    { kind: 'bbs', rank: 'Lamer', file: 'getbust.txt', area: 'Hacking - General & Ethics',
        text: 'Boards that look too good are too good. Read this before applying anywhere new.' },
    //  Wannabe
    { kind: 'pad', rank: 'Wannabe', file: 'telecomm.txt', area: 'Hacking - General & Ethics',
        text: 'Telenet. C <address> connects. Scan addresses like you scan prefixes.' },
    { kind: 'hp3000', rank: 'Wannabe', file: 'hp3000.txt', area: 'CD-ROM - The Hacker Chronicles II (1994)',
        text: 'HP3000. HELLO user.account. There\'s a "standard back-door" in here.' },
    //  Phreak
    { kind: 'pbx', rank: 'Phreak', file: 'guidehak.txt', area: 'Hacking - General & Ethics',
        text: 'AT&T System 75 / Definity. The Neophyte\'s Guide finally posted the defaults (Sys75/85 section).' },
    { kind: 'prime', rank: 'Wannabe', file: 'primes.txt', area: 'Hacking - General & Ethics',
        text: 'Prime. Hit Enter till ER!, then LOGIN <name>. Someone on a board had luck with plain first names. Says to hunt in 617, too.' },
    { kind: 'vmb', rank: 'Phreak', file: 'aspen.txt', area: 'Hacking - General & Ethics',
        text: 'Voice mail. Find a box nobody has taken yet ("temporary password") and try the defaults. Then it\'s yours: a safe place for codes.' },
    { kind: 'disa', rank: 'Phreak', file: 'sys75.hac', area: 'Hacking - General & Ethics',
        text: 'A second dial tone wants a barrier code. On a System 75, DIS REM shows them. Codes burn when you\'re hot.' },
    //  Hacker
    { kind: 'prime', rank: 'Hacker', file: 'guidehak.txt', area: 'Hacking - General & Ethics',
        text: 'Prime, the real accounts. PRIMOS section of the Neophyte\'s Guide. ONE try per call.' },
    { kind: 'hp3000', rank: 'Hacker', file: 'guidehak.txt', area: 'Hacking - General & Ethics',
        text: 'HP3000 factory passwords: HP3000 section of the Neophyte\'s Guide.' },
    { kind: 'vms', rank: 'Hacker', file: 'ccc-vms.txt', area: 'Hacking - Unix & VMS',
        text: 'Once you\'re on a VAX: what to do next. Corrupt Computing Canada\'s guide.' },
    //  phase 3: gear and tricks, by rank
    { kind: 'scan', rank: 'Lamer', file: 'tl-user.txt', area: 'Phreaking - General',
        text: 'The ToneLoc manual: exclusion lists, nudge strings, tone detect. The Hack Shack sells all three for CARRiER.' },
    { kind: 'fence', rank: 'Lamer', file: 'getbust.txt', area: 'Hacking - General & Ethics',
        text: 'The Hack Shack (on your found list) buys password files, account lists and dialup lists, and sells gear. Selling is how you eat. Don\'t get greedy.' },
    { kind: 'redbox', rank: 'Wannabe', file: 'redbox.txt', area: 'Phreaking - Boxes & Blue Boxing',
        text: 'Red box: quarter tones at a payphone. A call from one can\'t be traced to your house.' },
    { kind: 'unix', rank: 'Phreak', file: 'uhacknfo.hac', area: 'Hacking - Unix & VMS',
        text: 'UNIX trust: a .rhosts file names machines that log in with no password. rlogin from one of them. Check who\'s on first.' },
    { kind: 'bluebox', rank: 'Phreak', file: 'bluebox.txt', area: 'Phreaking - Boxes & Blue Boxing',
        text: 'Blue box: 2600 Hz seizes the trunk, then MF the number. Old crossbar offices only; ESS hears you.' },
    { kind: 'beige', rank: 'Phreak', file: 'beigebox.txt', area: 'Phreaking - Boxes & Blue Boxing',
        text: 'Beige box: a lineman\'s set clipped onto a neighbour\'s line. Their line, their phone bill, their heat.' },
    //  phase 4: the wider network
    { kind: 'pad', rank: 'Phreak', file: 'tymnet.txt', area: 'Hacking - General & Ethics',
        text: 'Tymnet: "please log in:" wants a host number. CoT-TERM scripts scans on either network: SCAN at the prompt.' },
    { kind: 'cosmos', rank: 'Hacker', file: 'cosmos.phk', area: 'Phreaking - General',
        text: 'COSMOS: ;LOGIN:, PASSWORD:, then the two-letter wire center. Some accounts have no password. ISH looks up any line. Very hot.' },
    { kind: 'cosmos', rank: 'Elite', file: 'cosmoslg.txt', area: 'Phreaking - General',
        text: 'COSMOS commands: ISH a number, SIR a range. The frame room keeps the login on a UNIX box somewhere.' },
    //  phase 6: more flavors of UNIX
    { kind: 'unix', rank: 'Wannabe', file: 'hackfaq.txt', area: 'Hacking - General & Ethics',
        text: 'IRIX (Silicon Graphics). The hack FAQ\'s defaults table: 4DGifts, tour, tutor, demos, lp shipped with NO password. Just the name.' },
    { kind: 'unix', rank: 'Phreak', file: 'cert9106.txt', area: 'CD-ROM - The Hacker Chronicles II (1994)',
        text: 'NeXT. CERT: the "me" account is in wheel, and plenty were never given a password. Passwords aren\'t in /etc/passwd on these, they\'re in NetInfo: nidump passwd .' },
    { kind: 'unix', rank: 'Hacker', file: 'ciac.b17', area: 'CD-ROM - The Hacker Chronicles II (1994)',
        text: 'A Cray running UNICOS: CIAC on the patches sites skip. Accounts are in /etc/udb, and udbsee shows them to root. Crays are watched. Hot.' },
    //  phase 3: zines from the Hack Shack (zine: the item that unlocks the page)
    { kind: 'unix', zine: 'phrack25', file: 'PHRACK25', area: 'Zines - Phrack',
        text: 'Phrack 25, "Unix Cracking Tips": what a passwd file is worth once you have it.' },
    { kind: 'unix', zine: 'phrack25', file: 'PHRACK25', area: 'Zines - Phrack',
        text: 'Phrack 25, "Hiding Out Under Unix": wtmp remembers every login. Root can empty it.' },
    { kind: 'bluebox', zine: 'phrack25', file: 'PHRACK25', area: 'Zines - Phrack',
        text: 'Phrack 25, "The Blue Box And Ma Bell": how the tones work, and why the phone company hates them.' },
    { kind: 'cosmos', zine: 'phrack27', file: 'PHRACK26', area: 'Zines - Phrack',
        text: 'Phrack 26, "COSMOS" part one: the phone company\'s database of every line and who owns it.' },
    { kind: 'cosmos', zine: 'phrack27', file: 'PHRACK27', area: 'Zines - Phrack',
        text: 'Phrack 27, "COSMOS" part two: the commands.' },
    { kind: 'vms', zine: 'phrack27', file: 'PHRACK27', area: 'Zines - Phrack',
        text: 'Phrack 27, "Looking Around In DECnet": SHOW NETWORK lists the nodes, SET HOST goes there.' },
    { kind: 'unix', zine: 'phrack32', file: 'PHRACK32', area: 'Zines - Phrack',
        text: 'Phrack 32, "Unix \'Nasties\'": what an admin sees when you\'re on, and how to stay unseen.' },
    { kind: 'pad', zine: 'phrack40', file: 'PHRACK40', area: 'Zines - Phrack',
        text: 'Phrack 40, "BT Tymnet", three parts: the other packet network.' },
    { kind: 'unix', zine: 'phrack43', file: 'PHRACK43', area: 'Zines - Phrack',
        text: 'Phrack 43, "Playing Hide and Seek, Unix Style": covering your tracks, the long version.' },
    { kind: 'pad', zine: 'lodtj4', file: 'lod-4', area: 'Zines - LOD/H Technical Journal',
        text: 'LOD/H Technical Journal 4: the Telenet directory. Addresses worth a C.' },
];

//  What the narrator mutters when a host answers
var NOTE_MUTTERS = {
    vms: 'A DEC box. Staring at that Username: prompt... I had notes on these somewhere.',
    unix: 'A UNIX login. I know I wrote down the defaults for these.',
    prime: 'PRIMENET. Prime gear. One shot at this, so check the notes first.',
    hp3000: 'An HP3000. I swear I copied something down about these.',
    pbx: 'Sounds like a PBX maintenance port. The notebook, maybe?',
    pad: 'A packet network. Somewhere in my notes...',
    bbs: 'A board. Before I apply, maybe check the notebook.',
    disa: 'A second dial tone, waiting for digits. Something in my notes about barrier codes?',
    vmb: 'Voice mail. The notebook had something on these.',
    fence: 'The Hack Shack. Bring something to sell.',
    cosmos: ';LOGIN:. COSMOS. The phone company itself. My hands are sweating.',
    scc: 'SCCS. The Switching Control Center. This is the big one.',
};

//  The notes a player holds: by rank, and a zine's pages once they own it.
//  stuck: the rank pages still to come; zines: the zine pages not owned.
function notesFor(p) {
    var at = rankRep(rankOf(p));
    var gear = p.gear || {};
    var have = NOTES.filter(function (n) { return n.zine ? gear[n.zine] : at >= rankRep(n.rank); });
    var zinePages = NOTES.filter(function (n) { return n.zine; }).length;
    var zinesHad = have.filter(function (n) { return n.zine; }).length;
    return { have: have, stuck: NOTES.length - zinePages - (have.length - zinesHad), zines: zinePages - zinesHad };
}
// ---- end lib/carrier_notes.js ----
// ---- lib/carrier_fs.js ----
//
//  CARRiER's filesystems (phase 6): a tree of directories and files for a
//  host, with owners and permissions, that the host's shell walks. A host's
//  tree is built from the season seed when a call connects (carrier_unix.js
//  builds a UNIX one); a file's text is made only when it's read. What the
//  caller changes goes into the tree, and carrier_keep.js keeps it for the
//  callers after them.
//
//  A node is a directory, a file or a symbolic link:
//    { dir: true, kids: { name: node }, own, grp, mode, mt }
//    { own, grp, mode, mt, size, text, type, onRead }
//    { link: '/var/adm' }
//  mode is the nine rwx characters ('rw-r--r--'). text is a string or a
//  function returning one. type is 'text' (the default), 'exec' or 'data'.
//  onRead(ctx, io), if set, runs once the caller has seen the file.
//  mt is a date as ls shows it.
//

//  A day in 1993, n days before today's date there, as ls prints it: the
//  time for the last six months, the year before that
function fsDate(daysAgo, r) {
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var now = new Date();
    var d = new Date(1993, now.getMonth(), now.getDate() - daysAgo, 0, 0, 0);
    var day = (d.getDate() < 10 ? ' ' : '') + d.getDate();
    if (daysAgo > 180) {
        return MON[d.getMonth()] + ' ' + day + '  ' + d.getFullYear();
    }
    var hh = r ? Math.floor(r() * 24) : 9;
    var mm = r ? Math.floor(r() * 60) : 14;
    return MON[d.getMonth()] + ' ' + day + ' ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}

function fsDir(own, grp, mode, mt) {
    return { dir: true, kids: {}, own: own, grp: grp, mode: mode || 'rwxr-xr-x', mt: mt || fsDate(30) };
}

function fsFile(own, grp, mode, text, mt, type) {
    return { own: own, grp: grp, mode: mode || 'rw-r--r--', text: text, mt: mt || fsDate(30), type: type || 'text' };
}

//  An executable: its size and the readable strings in it (strings(1))
function fsExec(own, grp, size, strs, mt) {
    var f = fsFile(own || 'bin', grp || 'bin', 'rwxr-xr-x', '', mt || fsDate(400), 'exec');
    f.size = size;
    f.strs = strs || [];
    return f;
}

//  Puts node at an absolute path, making the directories on the way
//  (owned by root) as needed. Returns the node.
function fsPut(root, path, node) {
    var parts = fsSplit(path);
    var d = root;
    for (var i = 0; i < parts.length - 1; i++) {
        if (!d.kids[parts[i]]) {
            d.kids[parts[i]] = fsDir('root', 'sys');
        }
        d = d.kids[parts[i]];
    }
    d.kids[parts[parts.length - 1]] = node;
    return node;
}

function fsSplit(path) {
    return String(path).split('/').filter(function (s) { return s !== ''; });
}

//  A path made absolute and tidied: '.', '..' and '//' resolved
function fsAbs(cwd, path, home) {
    var p = String(path);
    if (p === '~' || p.indexOf('~/') === 0) {
        p = home + p.slice(1);
    }
    var parts = (p.charAt(0) === '/' ? [] : fsSplit(cwd)).concat(fsSplit(p));
    var out = [];
    parts.forEach(function (s) {
        if (s === '..') {
            out.pop();
        } else if (s !== '.') {
            out.push(s);
        }
    });
    return '/' + out.join('/');
}

//  Whether who may do op ('r', 'w' or 'x') to node. who: { user, groups, root }
function fsCan(node, who, op) {
    if (who.root) {
        return op !== 'x' || node.dir || /x/.test(node.mode);
    }
    var at = { r: 0, w: 1, x: 2 }[op];
    var m = node.mode;
    if (node.own === who.user) {
        return m.charAt(at) !== '-';
    }
    if (who.groups.indexOf(node.grp) >= 0) {
        return m.charAt(3 + at) !== '-';
    }
    return m.charAt(6 + at) !== '-';
}

//  Looks a path up. Returns { node, path, parent, name } with node null when
//  the last part doesn't exist (parent set if its directory does), or
//  { err: 'denied' | 'notdir' | 'missing' } when the way there is barred.
//  Links are followed except for the last part when noFollow is set.
function fsLook(fs, cwd, path, who, noFollow, depth) {
    var abs = fsAbs(cwd, path, fs.home);
    var parts = fsSplit(abs);
    var d = fs.root;
    var walked = [];
    depth = depth || 0;
    for (var i = 0; i < parts.length; i++) {
        if (!d.dir) {
            return { err: 'notdir', path: abs };
        }
        if (!fsCan(d, who, 'x')) {
            return { err: 'denied', path: abs };
        }
        var n = d.kids[parts[i]];
        var last = i === parts.length - 1;
        if (n && n.link && !(last && noFollow) && depth < 8) {
            var rest = parts.slice(i + 1).join('/');
            var to = n.link.charAt(0) === '/' ? n.link : '/' + walked.join('/') + '/' + n.link;
            return fsLook(fs, '/', to + (rest ? '/' + rest : ''), who, noFollow, depth + 1);
        }
        if (!n) {
            if (last) {
                return { node: null, parent: d, name: parts[i], path: abs };
            }
            return { err: 'missing', path: abs };
        }
        walked.push(parts[i]);
        if (last) {
            return { node: n, parent: d, name: parts[i], path: abs };
        }
        d = n;
    }
    return { node: fs.root, parent: null, name: '/', path: '/' };
}

//  The path with the links on the way to its last part resolved, as
//  /etc/passwd is /private/etc/passwd on a NeXT
function fsReal(fs, abs) {
    var parts = fsSplit(abs);
    var d = fs.root;
    var out = [];
    for (var i = 0; i < parts.length - 1; i++) {
        var n = d && d.dir ? d.kids[parts[i]] : null;
        if (n && n.link) {
            var to = n.link.charAt(0) === '/' ? n.link : '/' + out.join('/') + '/' + n.link;
            return fsReal(fs, to + '/' + parts.slice(i + 1).join('/'));
        }
        out.push(parts[i]);
        d = n;
    }
    if (parts.length) out.push(parts[parts.length - 1]);
    return '/' + out.join('/');
}

//  A file's text (made the first time it's read)
function fsText(node) {
    if (typeof node.text === 'function') {
        node.text = node.text();
    }
    return node.text || '';
}

function fsSize(node) {
    if (node.dir) {
        return 512 * Math.max(1, Math.ceil(Object.keys(node.kids).length / 24));
    }
    if (node.link) {
        return node.link.length;
    }
    if (node.size !== undefined) {
        return node.size;
    }
    return fsText(node).length;
}

//  The type letter and mode, as ls -l starts a line
function fsModeString(node) {
    if (node.link) {
        return 'lrwxrwxrwx';
    }
    return (node.dir ? 'd' : '-') + node.mode;
}

//  Shell-style wildcards (* ? and [abc]) in any part of a path. Returns the
//  matching paths, sorted, or the word itself when nothing matches (as sh
//  does).
function fsGlob(fs, cwd, word, who) {
    if (!/[*?\[]/.test(word)) {
        return [word];
    }
    var abs = word.charAt(0) === '/';
    var parts = word.split('/').filter(function (s, i) { return s !== '' || i === 0; });
    var paths = [abs ? '/' : ''];
    parts.slice(abs ? 1 : 0).forEach(function (part) {
        var next = [];
        paths.forEach(function (base) {
            var join = function (n) { return base === '' ? n : base === '/' ? '/' + n : base + '/' + n; };
            if (!/[*?\[]/.test(part)) {
                next.push(join(part));
                return;
            }
            var look = fsLook(fs, cwd, base || '.', who);
            if (!look.node || !look.node.dir || !fsCan(look.node, who, 'r')) {
                return;
            }
            var re = fsPattern(part);
            Object.keys(look.node.kids).filter(function (n) {
                return re.test(n) && (n.charAt(0) !== '.' || part.charAt(0) === '.');
            }).sort().forEach(function (n) { next.push(join(n)); });
        });
        paths = next;
    });
    var hits = paths.filter(function (pth) { return !fsLook(fs, cwd, pth, who).err && fsLook(fs, cwd, pth, who).node; });
    return hits.length ? hits : [word];
}

function fsPattern(pat) {
    var s = '';
    for (var i = 0; i < pat.length; i++) {
        var c = pat.charAt(i);
        if (c === '*') {
            s += '.*';
        } else if (c === '?') {
            s += '.';
        } else if (c === '[') {
            var j = pat.indexOf(']', i);
            if (j < 0) {
                s += '\\[';
            } else {
                s += '[' + pat.slice(i + 1, j).replace(/\\/g, '\\\\') + ']';
                i = j;
            }
        } else {
            s += c.replace(/[.+^${}()|\\]/g, '\\$&');
        }
    }
    return new RegExp('^' + s + '$');
}
// ---- end lib/carrier_fs.js ----
// ---- lib/carrier_keep.js ----
//
//  Persistence (phase 6, step 3): what players change on a host lasts, for
//  everyone who calls it after them, until the season ends. The generated
//  host is built from the seed as before; the changes are laid over it.
//
//  In v3.data, per season seed:
//    k.<seed>.<num>   the host's changes: { p: { path: entry },
//                     by: { path: [uid, handle, ms] }, pw: { user: password },
//                     pwBy: { user: [uid, handle, ms] },
//                     acc: { USER: [password, privileged] } (accounts players
//                     added: AUTHORIZE, EDIT_PROFILE, NEWUSER),
//                     h: [kind, profile, name, org] (for the sweep),
//                     note: the security notice the admins put up }
//    ksw.<seed>       the day the admins last swept
//    km.<seed>.<num>  mail players sent there: [{ to, from, subj, body, at }]
//    ko.<seed>.<num>  who was on lately: [{ u, id, tty, on, off }]
//    kp.<seed>.<uid>  a player's changes, oldest first: [[num, path, ms]]
//    kw.<seed>.<num>  messages between players on the host now (write,
//                     PHONE, MESSAGE, TELL): [{ to, from, tty, m, at, id }]
//    kn.<uid>.<ms>.<rand>  a notice for a player: "your account on X is gone"
//
//  An entry is a directory { d: 1, o, g, m, t }, a file { o, g, m, t, x }
//  (x its text), a program or data file { o, g, m, t, y, z, s } (its type,
//  size and strings), a link { l } or a removal { rm: 1 }: owner, group,
//  mode, date as ls shows it.
//

var KEEP_FILES = 16;
var KEEP_BYTES = 8192;
var KEEP_PLANTED = 20;
var KEEP_MAIL = 10;
var KEEP_SEEN = 8;
//  a caller whose hangup wasn't seen counts as on for this long
var KEEP_ON_MS = 15 * 60000;

function keepKey(seed, num) {
    return 'k.' + seed + '.' + num;
}

//  A stored value, copied: v3.data hands back Go-backed values whose arrays
//  don't grow
function keepGet(key, dflt) {
    var v = v3.data.get(key);
    return v ? JSON.parse(JSON.stringify(v)) : dflt;
}

function keepLoad(seed, num) {
    var ov = keepGet(keepKey(seed, num), null) || {};
    ov.p = ov.p || {};
    ov.by = ov.by || {};
    ov.pw = ov.pw || {};
    ov.pwBy = ov.pwBy || {};
    ov.acc = ov.acc || {};
    return ov;
}

//  What the sweep needs to know about the host, kept with its changes
function keepMeta(ctx, ov) {
    var h = ctx.host;
    ov.h = [h.kind, h.prof || 'biz', h.name, h.org || ''];
}

function keepStore(seed, num, ov) {
    if (!Object.keys(ov.p).length && !Object.keys(ov.pw).length && !Object.keys(ov.acc).length && !ov.note) {
        v3.data.delete(keepKey(seed, num));
        return;
    }
    v3.data.set(keepKey(seed, num), ov);
}

function keepDepth(path) {
    return fsSplit(path).length;
}

//  The host's changes laid over its generated tree, shallowest first
function keepApply(fs, ov) {
    Object.keys(ov.p).sort(function (a, b) { return keepDepth(a) - keepDepth(b); }).forEach(function (path) {
        var e = ov.p[path];
        var parts = fsSplit(path);
        if (!parts.length) return;
        if (e.rm) {
            var look = fsLook(fs, '/', path, { root: true }, true);
            if (look.node && look.parent) delete look.parent.kids[look.name];
            return;
        }
        var node;
        if (e.l) {
            node = { link: e.l };
        } else if (e.d) {
            var have = fsLook(fs, '/', path, { root: true }, true).node;
            if (have && have.dir) {
                have.own = e.o; have.grp = e.g; have.mode = e.m; have.mt = e.t;
                return;
            }
            node = fsDir(e.o, e.g, e.m, e.t);
        } else {
            node = fsFile(e.o, e.g, e.m, e.x || '', e.t, e.y);
            if (e.y) {
                node.size = e.z;
                node.strs = e.s || [];
            }
            //  what the generated file did when read (loot, a lead) it
            //  still does
            var was = fsLook(fs, '/', path, { root: true }, true).node;
            if (was && !was.dir && !was.link) {
                node.onRead = was.onRead;
                node.repeat = was.repeat;
                node.dev = was.dev;
                //  an MPE system log stays a log; a VMS file keeps its version
                node.log = was.log;
                node.code = was.code;
                node.ver = was.ver;
            }
        }
        fsPut(fs.root, path, node);
    });
}

//  The entry that records what is at path now
function keepEntry(fs, path) {
    var look = fsLook(fs, '/', path, { root: true }, true);
    var n = look.node;
    if (!n) return { rm: 1 };
    if (n.link) return { l: n.link };
    if (n.dir) return { d: 1, o: n.own, g: n.grp, m: n.mode, t: n.mt };
    if (n.type !== 'text') {
        //  a program or data: its kind, size and strings, not its bytes
        return { o: n.own, g: n.grp, m: n.mode, t: n.mt, y: n.type, z: fsSize(n), s: n.strs || [] };
    }
    return { o: n.own, g: n.grp, m: n.mode, t: n.mt, x: fsText(n) };
}

//  Marks a path the caller changed, to be kept when the command is done
function keepMark(fs, path) {
    if (!fs.keep) return;
    fs.keep.dirty[fsReal(fs, fsAbs('/', path, fs.home))] = true;
}

function keepBytes(ov) {
    var n = 0;
    Object.keys(ov.p).forEach(function (k) { n += k.length + (ov.p[k].x || '').length; });
    return n;
}

//  Sets up a host's tree to keep what the caller changes. pristine() builds
//  the host as generated, to tell a removed generated file from a removed
//  file a player made.
function keepOpen(ctx, fs, pristine) {
    var ov = keepLoad(ctx.seed, ctx.host.num);
    keepApply(fs, ov);
    fs.keep = { ctx: ctx, dirty: {}, pristine: pristine, gen: null };
    return ov;
}

//  Whether the generated host has something at path
function keepGenerated(fs, path) {
    if (!fs.keep.gen) fs.keep.gen = fs.keep.pristine();
    return !!fsLook(fs.keep.gen, '/', path, { root: true }, true).node;
}

//  Keeps what the last command changed. Returns '' or 'full' when the host
//  has no room for it (it then lasts only the call).
function keepSave(fs) {
    var k = fs.keep;
    if (!k) return '';
    var paths = Object.keys(k.dirty);
    if (!paths.length) return '';
    k.dirty = {};
    var ctx = k.ctx;
    var ov = keepLoad(ctx.seed, ctx.host.num);
    var me = [String(v3.user.id), ctx.p.h, nowMs()];
    var lost = {};
    paths.forEach(function (path) {
        var e = keepEntry(fs, path);
        var prev = ov.by[path];
        if (prev && prev[0] !== me[0]) lost[prev[0]] = path;
        //  a removal takes what was kept under it with it
        if (e.rm) {
            Object.keys(ov.p).forEach(function (q) {
                if (q.indexOf(path + '/') === 0) { delete ov.p[q]; delete ov.by[q]; }
            });
            if (!keepGenerated(fs, path)) {
                delete ov.p[path];
                delete ov.by[path];
                return;
            }
        }
        ov.p[path] = e;
        ov.by[path] = me;
    });
    if (Object.keys(ov.p).length > KEEP_FILES || keepBytes(ov) > KEEP_BYTES) {
        return 'full';
    }
    keepMeta(ctx, ov);
    keepStore(ctx.seed, ctx.host.num, ov);
    Object.keys(lost).forEach(function (uid) {
        keepNotice(uid, 'Something you left on ' + ctx.host.name + ' (' + lost[uid] + ') has been changed.');
    });
    keepPlanted(ctx, paths.filter(function (p) { return ov.p[p]; }));
    return '';
}

//  A player's own list of changes, kept to KEEP_PLANTED: the oldest goes
//  back to what the host had
function keepPlanted(ctx, paths) {
    if (!paths.length) return;
    var key = 'kp.' + ctx.seed + '.' + v3.user.id;
    var list = keepGet(key, []).filter(function (x) {
        return !(x[0] === ctx.host.num && paths.indexOf(x[1]) >= 0);
    });
    paths.forEach(function (p) { list.push([ctx.host.num, p, nowMs()]); });
    while (list.length > KEEP_PLANTED) {
        var old = list.shift();
        var ov = keepLoad(ctx.seed, old[0]);
        if (ov.by[old[1]] && ov.by[old[1]][0] === String(v3.user.id)) {
            delete ov.p[old[1]];
            delete ov.by[old[1]];
            keepStore(ctx.seed, old[0], ov);
        }
    }
    v3.data.set(key, list);
}

//  A notice for a player's next game; heat and rep come with it
function keepNotice(uid, text, heat, rep) {
    v3.data.set('kn.' + uid + '.' + nowMs() + '.' + v3.util.random(1000000), { m: text, heat: heat || 0, rep: rep || 0 });
}

//  Notices waiting for this player: what they bring applied to p, removed,
//  and returned
function keepNotices(p) {
    var all = v3.data.getAll();
    var out = [];
    Object.keys(all).forEach(function (k) {
        if (k.indexOf('kn.' + v3.user.id + '.') === 0) {
            var n = all[k];
            if (p && n.heat) addHeat(p, n.heat);
            if (p && n.rep) p.rep += n.rep;
            out.push(n.m);
            v3.data.delete(k);
        }
    });
    return out;
}

//  ---- passwords ----

//  Sets user's password on the host, as root does with passwd
function keepSetPassword(ctx, user, pw) {
    var ov = keepLoad(ctx.seed, ctx.host.num);
    var prev = ov.pwBy[user];
    if (prev && prev[0] !== String(v3.user.id)) {
        keepNotice(prev[0], 'The ' + user + ' password you set on ' + ctx.host.name + ' doesn\'t work any more.');
    }
    ov.pw[user] = pw;
    ov.pwBy[user] = [String(v3.user.id), ctx.p.h, nowMs()];
    keepMeta(ctx, ov);
    keepStore(ctx.seed, ctx.host.num, ov);
    if (ctx.ov) ctx.ov.pw[user] = pw;
}

//  A host's accounts as they are now: passwords players set put in, and
//  the accounts players added. fold: names don't care about case (VMS,
//  PRIMOS, MPE), and are kept upper case.
function keepAccounts(ctx, list, fold) {
    var ov = ctx.ov || keepLoad(ctx.seed, ctx.host.num);
    var norm = function (n) { return fold ? String(n).toUpperCase() : String(n); };
    var out = list.map(function (a) {
        var pw = ov.pw[norm(a[0])];
        return pw !== undefined ? [a[0], pw, a[2]] : a;
    });
    Object.keys(ov.acc).forEach(function (n) {
        out = out.filter(function (a) { return norm(a[0]) !== n; });
        out.push([n, ov.acc[n][0], !!ov.acc[n][1]]);
    });
    return out;
}

//  Adds an account to the host, or changes the password of one a player
//  added
function keepAddAccount(ctx, name, pw, priv) {
    var ov = keepLoad(ctx.seed, ctx.host.num);
    var prev = ov.pwBy[name];
    if (ov.acc[name] && prev && prev[0] !== String(v3.user.id)) {
        keepNotice(prev[0], 'The ' + name + ' account you left on ' + ctx.host.name + ' has been changed.');
    }
    ov.acc[name] = [pw, !!priv];
    ov.pwBy[name] = [String(v3.user.id), ctx.p.h, nowMs()];
    keepMeta(ctx, ov);
    keepStore(ctx.seed, ctx.host.num, ov);
    if (ctx.ov) ctx.ov.acc[name] = [pw, !!priv];
}

//  Adds lines to the end of a log file the system keeps (sulog, OPERATOR.LOG),
//  keeping the last max of them, and marks it to be kept
function keepLog(fs, path, lines, max) {
    var look = fsLook(fs, '/', path, { root: true });
    if (!look.node || look.node.dir) return;
    var have = fsText(look.node).split('\n').filter(function (l) { return l; });
    look.node.text = have.concat(lines).slice(-(max || 40)).join('\n') + '\n';
    look.node.type = 'text';
    delete look.node.size;
    keepMark(fs, look.path);
}

//  ---- who was on ----

function keepSeen(seed, num) {
    return keepGet('ko.' + seed + '.' + num, []);
}

//  Records the caller on the host as user; returns their entry's index
function keepOn(ctx, user, tty) {
    var key = 'ko.' + ctx.seed + '.' + ctx.host.num;
    var list = keepSeen(ctx.seed, ctx.host.num);
    list.push({ u: user, id: String(v3.user.id), tty: tty, on: nowMs(), off: 0 });
    while (list.length > KEEP_SEEN) list.shift();
    v3.data.set(key, list);
    return list[list.length - 1].on;
}

function keepOff(ctx, on) {
    var key = 'ko.' + ctx.seed + '.' + ctx.host.num;
    var list = keepSeen(ctx.seed, ctx.host.num);
    list.forEach(function (x) {
        if (x.on === on && x.id === String(v3.user.id)) x.off = nowMs();
    });
    v3.data.set(key, list);
}

//  Other players on the host now, and everyone on it lately
function keepOthersOn(seed, num) {
    var now = nowMs();
    return keepSeen(seed, num).filter(function (x) {
        return x.id !== String(v3.user.id) && !x.off && now - x.on < KEEP_ON_MS;
    });
}

//  A real clock time as hh:mm
function keepClock(ms) {
    var d = new Date(ms);
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}

//  ---- live messages between players ----

//  Sends text to whoever is on the host now as user to. Returns false when
//  nobody is.
function keepWriteTo(ctx, to, from, tty, text) {
    var up = String(to).toUpperCase();
    if (!keepOthersOn(ctx.seed, ctx.host.num).some(function (x) { return String(x.u).toUpperCase() === up; })) return false;
    var key = 'kw.' + ctx.seed + '.' + ctx.host.num;
    var list = keepGet(key, []);
    list.push({ to: up, from: from, tty: tty, m: String(text).slice(0, 400), at: nowMs(), id: String(v3.user.id) });
    while (list.length > 20) list.shift();
    v3.data.set(key, list);
    return true;
}

//  Messages for the caller on as user since ms, taken out of the store
function keepInbox(ctx, user, since) {
    var key = 'kw.' + ctx.seed + '.' + ctx.host.num;
    var list = keepGet(key, []);
    if (!list.length) return [];
    var up = String(user).toUpperCase();
    var mine = function (x) { return x.to === up && x.id !== String(v3.user.id) && x.at >= since; };
    var got = list.filter(mine);
    if (got.length) v3.data.set(key, list.filter(function (x) { return !mine(x); }));
    return got;
}

//  While a shell runs, the terminal checks for messages as it waits for a
//  key; show turns one into what the host prints. Returns a function that
//  puts back what was there before (a call from one host to another).
function keepListen(ctx, io, user, since, show) {
    var before = io.poll;
    io.poll = function () {
        return keepInbox(ctx, user, since).map(show).join('');
    };
    return function () { io.poll = before; };
}

//  ---- mail between players ----

function keepMail(seed, num) {
    return keepGet('km.' + seed + '.' + num, []);
}

function keepSendMail(ctx, to, from, subj, body) {
    var key = 'km.' + ctx.seed + '.' + ctx.host.num;
    var list = keepMail(ctx.seed, ctx.host.num);
    list.push({ to: to, from: from, subj: subj, body: body, at: nowMs() });
    while (list.length > KEEP_MAIL) list.shift();
    v3.data.set(key, list);
}

//  ---- the admins' sweep (phase 6, step 4) ----
//  Once a day, on the first game of the day, the admins of every host where
//  players left something look around. /tmp is emptied. Anything else a
//  player left may be found, by chance: more on a watched box (government,
//  the phone company), less when it's hidden (a dot file, a ... directory,
//  a system directory), more when its owner is hot. What's found is taken
//  away and its owner hears about it, with heat. A password a player set
//  that survives pays its holder rep for the day; one that's found is put
//  back, the box gets a security notice, and the Scene Daily hears.

var SWEEP_CHANCE = { gov: 0.35, telco: 0.4, edu: 0.15, biz: 0.12, res: 0.05 };
var SWEEP_HEAT = { gov: 15, telco: 20, edu: 6, biz: 5, res: 3 };
var HOLD_REP = { gov: 30, telco: 40, edu: 15, biz: 10, res: 5 };

//  A system's own logs and histories: the trail, not something planted
function keepTrace(path) {
    return /^\/\.(sh_)?history$|\/sulog$|\/OPERATOR\.LOG$|\/EDIT_PROFILE\.LOG$|^\/SYS\/PUB\/LOG\d{4}$/.test(path);
}

//  How likely the admins are to come across what's at path, against a
//  thing in plain sight: they check the password files and trust files,
//  and rarely look in dot files or among the system's own
function keepHidden(path) {
    var name = path.split('/').pop();
    if (/^(passwd|shadow|hosts\.equiv|\.rhosts)$/.test(name)) return 1.3;
    if (fsSplit(path).some(function (s) { return s.charAt(0) === '.' || /^\.\.\.+$/.test(s); })) return 0.35;
    if (/^\/(dev|lib|usr\/lib|usr\/spool|usr\/adm|var\/adm|etc|bin|usr\/bin|SYS0|CMDNC0|SYSOVL|SYS)\//.test(path)) return 0.6;
    return 1;
}

//  A player's heat as last saved, 0 to 100
function keepHeatOf(uid) {
    var p = uid ? v3.data.get('p.' + uid) : null;
    return p && p.heat ? p.heat : 0;
}

//  The day's sweep, if it hasn't run today. Returns what it did, for tests:
//  { found: [[uid, num, what]], held: [[uid, num, user]] }
function keepSweep(seed) {
    var day = today();
    var dk = 'ksw.' + seed;
    var res = { found: [], held: [] };
    if (v3.data.get(dk) === day) return res;
    //  first, so a second node opening the game now doesn't sweep again
    v3.data.set(dk, day);
    var all = v3.data.getAll();
    var prefix = 'k.' + seed + '.';
    Object.keys(all).forEach(function (key) {
        if (key.indexOf(prefix) !== 0) return;
        var num = key.slice(prefix.length);
        var ov = keepLoad(seed, num);
        var meta = ov.h || ['', 'biz', num, ''];
        var prof = meta[1];
        var base = SWEEP_CHANCE[prof] || 0.12;
        var r = rng(hash32(seed + '|sweep|' + day + '|' + num));
        var odds = function (uid, how) { return base * how * (1 + keepHeatOf(uid) / 50); };
        var lost = {};
        var caught = [];
        Object.keys(ov.p).sort().forEach(function (path) {
            if (keepTrace(path)) return;
            var owner = ov.by[path] ? ov.by[path][0] : '';
            var tmp = /^\/(tmp|var\/tmp|usr\/tmp)\//.test(path);
            if (tmp || r() < odds(owner, keepHidden(path))) {
                delete ov.p[path];
                delete ov.by[path];
                if (owner && !tmp) (lost[owner] = lost[owner] || []).push(path);
            }
        });
        Object.keys(ov.acc).sort().forEach(function (n) {
            var owner = ov.pwBy[n] ? ov.pwBy[n][0] : '';
            if (r() < odds(owner, 1)) {
                delete ov.acc[n];
                delete ov.pwBy[n];
                if (owner) (lost[owner] = lost[owner] || []).push('the ' + n + ' account');
            }
        });
        Object.keys(ov.pw).sort().forEach(function (u) {
            var owner = ov.pwBy[u] ? ov.pwBy[u][0] : '';
            if (r() < odds(owner, 0.8)) {
                delete ov.pw[u];
                delete ov.pwBy[u];
                caught.push(u);
                if (owner) {
                    keepNotice(owner, 'The admins on ' + meta[2] + ' caught on and put the ' + u + ' password back. Heat +' + 2 * (SWEEP_HEAT[prof] || 5) + '.',
                        2 * (SWEEP_HEAT[prof] || 5), 0);
                    res.found.push([owner, num, u]);
                }
            } else if (owner) {
                var pay = HOLD_REP[prof] || 10;
                keepNotice(owner, 'You still hold ' + meta[2] + ' (' + u + '). +' + pay + ' rep.', 0, pay);
                res.held.push([owner, num, u]);
            }
        });
        Object.keys(lost).forEach(function (uid) {
            var heat = SWEEP_HEAT[prof] || 5;
            keepNotice(uid, 'The admins on ' + meta[2] + ' found what you left (' + lost[uid].join(', ') + ') and cleaned it up. Heat +' + heat + '.', heat, 0);
            lost[uid].forEach(function (w) { res.found.push([uid, num, w]); });
        });
        if (caught.length) {
            ov.note = 'SECURITY NOTICE: an intruder was found on this system and removed. Change your password. Report anything unusual to the system manager.';
            news('the scene', 'The admins at ' + (meta[3] || meta[2]) + ' caught an intruder on ' + meta[2] + ' and took the ' + caught.join(' and ') + ' password back.');
        }
        keepStore(seed, num, ov);
    });
    return res;
}

//  ---- the season's end ----

//  Everything players left anywhere, gone with the old network
function keepForget() {
    var all = v3.data.getAll();
    Object.keys(all).forEach(function (k) {
        if (/^(k|km|ko|kp|kw|ksw)\./.test(k)) v3.data.delete(k);
    });
}
// ---- end lib/carrier_keep.js ----
// ---- lib/carrier_unix.js ----
//
//  CARRiER's UNIX hosts (phase 6): a whole filesystem per machine, laid out
//  as its flavor of UNIX laid it out, and a Bourne shell that works on it.
//
//  Seven flavors, from the host's version: System V Release 3 (/usr/adm,
//  /usr/mail, HoneyDanBer UUCP's Systems), Release 4 (/var, /home, a shadow
//  password file), 4.3 BSD (L.sys, /usr/spool/mail, no uname), SunOS 4.1
//  (/home, /var, columns in ls), and from phase 6 IRIX 4 (/usr/people,
//  accounts shipped with no password), NeXTstep 2.1 (/etc in /private, the
//  passwords in NetInfo, which nidump prints for anyone) and Cray UNICOS 6
//  (the passwords in /etc/udb, which udbsee shows root; rare and watched).
//
//  Inside, the three things to find (docs/design.md) are files:
//    * the way up: root's password, in one of several places chosen per
//      host (an admin's mail, a backup script, a .netrc, a user's file of
//      passwords). The caller's own mail points the way.
//    * leads: L.sys or Systems (uucp and root only), a user's phone list,
//      the frame room's notes on a phone company box
//    * loot: the password file (the shadow file on Release 4) and the one
//      file the organization would least want taken, readable by staff
//  Every user has a home directory with their habits in it, and their
//  mail; root can read everyone's.
//

var UNIX_FIRST = ['Linda', 'Robert', 'Karen', 'Michael', 'Susan', 'David', 'Patricia', 'James', 'Nancy', 'Thomas',
    'Barbara', 'Gary', 'Donna', 'Kenneth', 'Carol', 'Steven', 'Debra', 'Mark', 'Sharon', 'Paul'];
var UNIX_LAST = ['Kowalski', 'Brennan', 'Ostrowski', 'Delgado', 'Fitzgerald', 'Nakamura', 'Lindqvist', 'Moreau',
    'Abernathy', 'Castellano', 'Whitfield', 'Huang', 'Petrakis', 'Sorensen', 'McAllister', 'Okafor'];

//  The ways up a UNIX box can give root away, one per host
var UNIX_WAYS = ['mail', 'backup', 'netrc', 'stuff'];

function unixFlavor(h) {
    var v = h.version;
    return /IRIX/.test(v) ? 'irix' : /NeXT/.test(v) ? 'next' : /UNICOS/.test(v) ? 'unicos' :
        /BSD/.test(v) ? 'bsd' : /SunOS/.test(v) ? 'sun' : /Release 4/.test(v) ? 'svr4' : 'svr3';
}

//  berk: a Berkeley system (BSD's commands, wording and ps); csh: its users
//  log in to the C shell
function unixLayout(fl) {
    var modern = fl === 'sun' || fl === 'svr4';
    var berk = fl === 'bsd' || fl === 'sun' || fl === 'next';
    return {
        fl: fl,
        berk: berk,
        csh: berk || fl === 'irix',
        home: { irix: '/usr/people', next: '/Users' }[fl] || (modern ? '/home' : '/usr'),
        adm: modern ? '/var/adm' : '/usr/adm',
        mail: { svr3: '/usr/mail', svr4: '/var/mail', sun: '/var/spool/mail', bsd: '/usr/spool/mail',
            irix: '/usr/mail', next: '/usr/spool/mail', unicos: '/usr/mail' }[fl],
        cron: { svr3: '/usr/spool/cron/crontabs', svr4: '/var/spool/cron/crontabs', sun: '/var/spool/cron/crontabs', bsd: '',
            irix: '/usr/spool/cron/crontabs', next: '', unicos: '/usr/spool/cron/crontabs' }[fl],
        sysFile: fl === 'bsd' || fl === 'next' ? 'L.sys' : 'Systems',
        kernel: fl === 'next' ? '/mach' : fl === 'bsd' || fl === 'sun' ? '/vmunix' : '/unix',
        columns: fl !== 'svr3' && fl !== 'unicos',
        groupCol: fl !== 'bsd' && fl !== 'next',
    };
}

//  The passwd entries a host has besides its staff: [user, uid, gid, gecos,
//  home, shell]. Home '~' means one in the layout's home directory.
function unixSystemUsers(lay) {
    return [['root', 0, 1, 'Super-User', '/', '/bin/sh'], ['daemon', 1, 1, '', '/', ''], ['bin', 2, 2, '', '/usr/bin', ''],
        ['sys', 3, 3, '', '/', ''], ['adm', 4, 4, 'Admin', lay.adm, ''], ['uucp', 5, 5, 'uucp Admin', '/usr/lib/uucp', ''],
        ['nuucp', 9, 9, 'uucp Admin', '/usr/spool/uucppublic', '/usr/lib/uucp/uucico'], ['sync', 1, 1, '', '/', '/bin/sync'],
        ['games', 12, 100, 'Games', '/usr/games', ''], ['user', 200, 100, 'Shared account', '~', '/bin/sh'],
        ['demo', 201, 100, 'Demo', '~', '/bin/sh'], ['guest', 202, 100, 'Guest', '~', '/bin/sh'],
        ['admin', 203, 10, 'Administration', '~', '/bin/sh']].concat(UNIX_MORE_USERS[lay.fl] || []);
}

//  Accounts a flavor ships with, there whatever the host's accounts say
//  (the seventh field). hackfaq.txt: SGI's 4DGifts, lp, tour, tutor and demos
//  came with no password; cert9106.txt: a NeXT's "me" is in wheel.
var UNIX_MORE_USERS = {
    irix: [['4Dgifts', 999, 998, '4Dgifts account', '/usr/people/4Dgifts', '/bin/csh', true],
        ['lp', 9, 9, 'Print Spooler Owner', '/usr/spool/lp', '/bin/sh', true],
        ['tour', 995, 997, 'IRIS Space Tour', '/usr/people/tour', '/bin/csh', true],
        ['tutor', 994, 997, 'Tutorial Account', '/usr/people/tutor', '/bin/csh', true],
        ['demos', 993, 997, 'Demonstration User', '/usr/demos', '/bin/csh', true]],
    next: [['me', 20, 20, 'Me', '/me', '/bin/csh', true]],
};

//  Everything about a host's people and secrets, before any files: who the
//  staff are, the admin, where root's password is, what each user is like
function unixWorld(ctx) {
    var h = ctx.host;
    var r = rng(hash32(ctx.seed + '|fs|' + h.num));
    var lay = unixLayout(unixFlavor(h));
    var staff = someUsers(h, 5);
    var boss = admin(h);
    var peers = staff.filter(function (n) { return n !== boss; });
    var w = { h: h, r: r, lay: lay, staff: staff, boss: boss, peers: peers, name: h.name.toLowerCase(), real: {}, habit: {} };
    staff.forEach(function (n) {
        w.real[n] = pick(r, UNIX_FIRST) + ' ' + pick(r, UNIX_LAST);
    });
    w.real[boss] = w.real[boss] + ' (sysadmin)';
    w.way = pick(r, UNIX_WAYS);
    //  the user who keeps passwords in a file, and the one with the phone list
    w.stuffUser = peers[0];
    w.phonesUser = peers[1];
    w.planUsers = peers.slice(2);
    w.sister = neighbours(ctx.seed, h, 'unix', 1)[0] || '';
    w.sisterName = w.sister ? hostAtNum(ctx, w.sister, 'unix').name.toLowerCase() : '';
    w.rootpw = h.secret[1];
    //  what root's password is now: a player may have changed it
    w.rootNow = ctx.ov && ctx.ov.pw.root !== undefined ? ctx.ov.pw.root : w.rootpw;
    return w;
}

function unixHome(w, user) {
    var sys = unixSystemUsers(w.lay).filter(function (u) { return u[0] === user; })[0];
    if (sys && sys[4] !== '~') return sys[4];
    return w.lay.home + '/' + user;
}

//  An account the host leaves open: its password is empty
function unixOpen(h, user) {
    return h.accounts.some(function (a) { return a[0] === user && a[1] === ''; });
}

//  Accounts players added to the host's password file with no password:
//  { user: { root } }. A line like kid::0:0::/:/bin/sh is a backdoor, root
//  if its uid is 0. On Release 4 the password can be the shadow file's.
function unixBackdoors(ov) {
    var text = function (path) {
        var e = ov && (ov.p[path] || ov.p['/private' + path]);
        return e && !e.rm ? e.x || '' : '';
    };
    var shadow = {};
    text('/etc/shadow').split('\n').forEach(function (l) {
        var f = l.split(':');
        if (f.length > 1) shadow[f[0]] = f[1];
    });
    var out = {};
    text('/etc/passwd').split('\n').forEach(function (l) {
        var f = l.split(':');
        if (f.length < 3 || !f[0]) return;
        var pw = f[1] === 'x' && shadow[f[0]] !== undefined ? shadow[f[0]] : f[1];
        if (pw === '') out[f[0]] = { root: f[2] === '0' };
    });
    return out;
}

//  Whether user logs in with no password: left open, or a backdoor
function unixNoPassword(ctx, user) {
    if (ctx.ov.pw[user] !== undefined) return ctx.ov.pw[user] === '';
    return unixOpen(ctx.host, user) || !!unixBackdoors(ctx.ov)[user];
}

//  The account user and pw log in to, or null. A password a player set
//  is the only one that works for that user now.
function unixAuth(ctx, user, pw) {
    var ov = ctx.ov;
    if (ov.pw[user] !== undefined) {
        return pw === ov.pw[user] ? [user, pw, user === 'root'] : null;
    }
    var door = unixBackdoors(ov)[user];
    if (door && pw === '') return [user, '', door.root];
    return findAccount(ctx.host, user, pw, false);
}

//  ---- the generated text ----

//  A password as crypt(3) leaves it: 13 characters of ./0-9A-Za-z
function unixCrypt(s) {
    var set = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    var r = rng(hash32('crypt|' + s));
    var out = '';
    for (var i = 0; i < 13; i++) out += set.charAt(Math.floor(r() * 64));
    return out;
}

function unixPasswd(w, shadowed) {
    var h = w.h;
    var rows = unixSystemUsers(w.lay).filter(function (u) { return w.staff.indexOf(u[0]) < 0; }).map(function (u) {
        var pw = u[0] === 'root' ? unixCrypt(h.num + '|root|' + w.rootNow) : unixOpen(h, u[0]) ? '' : u[1] >= 200 || u[6] ? unixCrypt(h.num + u[0]) : w.lay.berk ? '*' : 'NP';
        if (u[1] >= 200 && !u[6] && !h.accounts.some(function (a) { return a[0] === u[0]; })) {
            return null;
        }
        return [u[0], shadowed ? 'x' : pw, u[1], u[2], u[3], u[4] === '~' ? w.lay.home + '/' + u[0] : u[4], u[5]].join(':');
    }).filter(function (x) { return x; });
    w.staff.forEach(function (n, i) {
        rows.push([n, shadowed ? 'x' : unixCrypt(h.num + n), 101 + i, 10, w.real[n].replace(' (sysadmin)', ''),
            w.lay.home + '/' + n, w.lay.csh ? '/bin/csh' : '/bin/sh'].join(':'));
    });
    return rows.join('\n') + '\n';
}

function unixShadow(w) {
    return unixPasswd(w, false).split('\n').filter(function (l) { return l; }).map(function (l) {
        var f = l.split(':');
        return [f[0], f[1], '8401', '', '', '', '', '', ''].join(':');
    }).join('\n') + '\n';
}

function unixGroup(w) {
    return [w.lay.fl === 'next' ? 'wheel:*:0:root,me' : 'root::0:root', 'other::1:', 'bin::2:root,bin,daemon', 'sys::3:root,bin,sys,adm', 'adm::4:root,adm,daemon',
        'uucp::5:root,uucp', 'mail::6:root', 'staff::10:' + w.staff.join(','), 'guest::100:'].join('\n') + '\n';
}

var UNIX_MOTD = {
    edu: ['Disk on /usr is 96% full.  Clean out your home directories or I will.',
        'Accounts for students not enrolled this term expire Friday.',
        'The lab is closed Sunday for the network cutover.'],
    biz: ['Month end close runs tonight.  Stay off the system after 6:00 PM.',
        'New printer in accounting is lp2.  Do not print to lp0, it is broken.',
        'Report problems to the computer room, x4410.'],
    gov: ['THIS SYSTEM IS FOR OFFICIAL USE ONLY.  USE IS SUBJECT TO MONITORING.',
        'Report unattended terminals to your security officer.',
        'Passwords must be changed every 90 days.'],
    telco: ['Frame cutover Sunday 0200.  Trouble tickets to the test desk.',
        'Do NOT run reports during the busy hour.',
        'MLT is down until further notice.'],
    res: ['Welcome.  Be nice.'],
};

function unixMotd(w) {
    var lines = UNIX_MOTD[w.h.prof] || UNIX_MOTD.biz;
    return '\n' + w.h.org + '\n\n' + lines.map(function (l) { return '  ' + l; }).join('\n') + '\n\n';
}

//  A mail message, in the spool file's own format
function unixMsg(w, from, to, subj, body, daysAgo) {
    var t = era().unix;
    return 'From ' + from + ' ' + t + '\nTo: ' + to + '\nSubject: ' + subj + '\nStatus: R\n\n' + body + '\n\n';
}

var UNIX_CHAT = {
    edu: [['lab hours', 'the lab is open till midnight during finals.  sign the sheet.'],
        ['your thesis', 'i put the draft in my home dir.  tell me what you think of chapter 3.'],
        ['grades', 'the registrar wants the grade file by friday.  it\'s in the usual place.']],
    biz: [['budget', 'need your numbers for the forecast by thursday.'],
        ['the new system', 'the new system is supposed to be faster.  it is not.'],
        ['lunch', 'friday?  the place by the freeway.']],
    gov: [['routing', 'please route the attached through the contracting office before COB.'],
        ['audit', 'the auditors are here next week.  clean up your directories.'],
        ['TDY', 'out on TDY until the 14th.  call the duty officer.']],
    telco: [['trouble ticket', 'cable pair 1142 is open again.  sending a tech.'],
        ['busy hour', 'stop running the switch report at 10 am.  it kills the box.'],
        ['cutover', 'cutover moved to sunday.  bring donuts.']],
    res: [['hey', 'did you get my disk back?'], ['modem', 'the modem keeps hanging up on me.']],
};

//  The caller's mailbox: a notice from the admin, and the mail that points
//  the way up (or is it, when the way is mail)
function unixMyMail(w, user) {
    var box = '';
    var boss = user === w.boss ? 'root' : w.boss;
    var peer = w.peers[0];
    box += unixMsg(w, boss, user, 'disk space', 'please clean out your home directory.  /usr is almost full.\n-- ' + boss);
    if (w.way === 'mail') {
        box += unixMsg(w, boss, 'staff', 'root', 'changed the root password to ' + w.rootpw + ' for the move.\ndon\'t write it down this time.  -- ' + boss);
    } else if (w.way === 'backup') {
        box += unixMsg(w, peer, user, 'backups', 'backups failed again last night.  ' + boss + ' says the script in\n/usr/local/bin does it all now, root and everything, so don\'t touch it.');
    } else if (w.way === 'netrc') {
        box += unixMsg(w, peer, user, 'ftp', boss + ' set up ftp so it logs in by itself.  the file is in his\nhome directory.  lazy.');
    } else {
        box += unixMsg(w, boss, w.stuffUser + ',' + user, 'passwords', w.stuffUser + ', stop keeping passwords in a file in your home directory.\nI mean it.  -- ' + boss);
    }
    var chat = UNIX_CHAT[w.h.prof] || UNIX_CHAT.biz;
    var c = chat[hash32(w.h.num + user) % chat.length];
    box += unixMsg(w, w.peers[1] || peer, user, c[0], c[1]);
    return box;
}

//  Another user's mailbox (root can read them all)
function unixTheirMail(w, user) {
    var chat = UNIX_CHAT[w.h.prof] || UNIX_CHAT.biz;
    var box = '';
    for (var i = 0; i < 2; i++) {
        var c = chat[(hash32(w.h.num + user) + i) % chat.length];
        box += unixMsg(w, w.staff[(i + 1) % w.staff.length], user, c[0], c[1]);
    }
    if (user === w.boss) {
        box += unixMsg(w, 'root', user, 'Output from "cron" command', 'Your "cron" job\n\n/usr/local/bin/dobackup\n\nproduced the following output:\n\ntar: /dev/rmt0: I/O error');
    }
    return box;
}

//  What a plan says, by organization
var UNIX_PLANS = {
    edu: ['Finishing my thesis.  Do not ask when.', 'Office hours: Tues 2-4, or whenever I\'m in the lab.', 'Looking for a job.  Any job.'],
    biz: ['On vacation the week of the 12th.', 'Ask me about the new inventory system.', 'x4417'],
    gov: ['TDY until further notice.', 'Room 2C410.', 'Contracting office, ext 2211.'],
    telco: ['Test desk, days.', 'Frame room.  Bring a butt set.', 'On call this week.'],
    res: ['Nothing to see here.'],
};

//  The organization's prize: [path, what it's called, its text]
function unixPrize(w) {
    var r = rng(hash32(w.h.num + '|prize'));
    var name = function () { return pick(r, UNIX_FIRST) + ' ' + pick(r, UNIX_LAST); };
    var rows = [];
    var i;
    //  a Cray's prize is its time: who gets the hours, and on what
    if (w.lay && w.lay.fl === 'unicos') {
        for (i = 0; i < 10; i++) {
            var alloc = 50 + Math.floor(r() * 950);
            rows.push(fit(pick(r, ['CFD', 'CLIMATE', 'QCD', 'SEISMIC', 'FUSION', 'CRYPTO', 'ORBITS']) + (100 + Math.floor(r() * 899)), 12) +
                fit(name(), 24) + padStart(String(alloc), 6) + padStart(String(Math.floor(alloc * r())), 8));
        }
        return ['/usr/adm/acct/alloc', 'the Cray\'s CPU allocations', 'PROJECT     PRINCIPAL                HOURS    USED\n' + rows.join('\n') + '\n', 40];
    }
    switch (w.h.prof) {
    case 'edu':
        for (i = 0; i < 12; i++) rows.push(fit(name(), 24) + pick(r, ['CS 101', 'CS 241', 'MA 221', 'EE 310']) + '   ' + pick(r, ['A', 'A-', 'B+', 'B', 'C', 'F']));
        return ['/usr/registrar/grades.93', 'a grades file', 'NAME                    COURSE   GRADE\n' + rows.join('\n') + '\n'];
    case 'biz':
        for (i = 0; i < 12; i++) rows.push(fit(name(), 24) + padStart(String(18 + Math.floor(r() * 60)) + ',' + String(100 + Math.floor(r() * 900)), 8) + '   ' + pick(r, ['ACCT', 'SALES', 'MIS', 'SHIP']));
        return ['/usr/acct/payroll.dat', 'a payroll file', 'EMPLOYEE                  SALARY   DEPT\n' + rows.join('\n') + '\n'];
    case 'gov':
        for (i = 0; i < 10; i++) rows.push('N00' + (100 + Math.floor(r() * 899)) + '-9' + Math.floor(r() * 3) + '-C-' + (1000 + Math.floor(r() * 8999)) + '   ' +
            fit(pick(r, ORGS.biz[0]) + pick(r, ORGS.biz[1]), 30) + '$' + (1 + Math.floor(r() * 40)) + '.' + Math.floor(r() * 10) + 'M');
        return ['/usr/contracts/index', 'a contract index', 'CONTRACT              CONTRACTOR                    VALUE\n' + rows.join('\n') + '\n'];
    case 'telco':
        for (i = 0; i < 10; i++) rows.push(String(200 + Math.floor(r() * 800)) + '   ' + pick(r, ['1ESS', '1AESS', '5ESS', 'DMS-100', 'crossbar']) + '   ' + padStart(String(Math.floor(r() * 9000) + 1000), 6) + ' lines   ' + pick(r, ['OK', 'OK', 'OK', 'ALARM', 'MAINT']));
        return ['/usr/frame/switch.rpt', 'a switch report', 'NXX   SWITCH     IN SERVICE        STATUS\n' + rows.join('\n') + '\n'];
    default:
        return null;
    }
}

//  ---- the tree ----

function unixBins(fl) {
    var b = ['sh', 'ls', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'ed', 'grep', 'who', 'ps', 'date', 'su', 'passwd', 'mail',
        'write', 'login', 'chmod', 'echo', 'pwd', 'find', 'wc', 'head', 'more', 'strings', 'file', 'tar', 'cpio', 'sync'];
    if (fl === 'bsd' || fl === 'sun' || fl === 'next') b.push('csh', 'vi', 'finger', 'rlogin', 'rsh', 'talk', 'last', 'w', 'tail');
    else b.push('uname', 'vi', 'finger', 'rlogin', 'last', 'tail', 'w');
    if (fl === 'irix') b.push('csh');
    if (fl === 'next') b.push('nidump', 'niutil');
    return b;
}

var UNIX_STRINGS = {
    su: ['/etc/passwd', 'Sorry', 'su: already root', '/usr/adm/sulog', 'SU %s %s %s-%s', 'Password:'],
    passwd: ['Old password:', 'New password:', 'Re-enter new password:', 'They don\'t match; try again.', '/etc/ptmp'],
    login: ['Login incorrect', 'login: ', 'Password:', '/etc/motd', 'You have mail.', '/etc/utmp', '/usr/adm/wtmp'],
};

function unixTree(ctx) {
    var w = unixWorld(ctx);
    var lay = w.lay;
    var fl = lay.fl;
    var r = w.r;
    var old = function () { return fsDate(200 + Math.floor(r() * 400)); };
    var recent = function () { return fsDate(1 + Math.floor(r() * 60), r); };
    var root = fsDir('root', 'root', 'rwxr-xr-x', old());
    var put = function (path, node) { return fsPut(root, path, node); };
    //  a directory, or the one already there (homes in /usr on Release 3)
    var dir = function (path, own, grp, mode, mt) {
        var have = fsLook({ root: root, home: '/' }, '/', path, { root: true }, true).node;
        return have && have.dir ? have : put(path, fsDir(own || 'root', grp || 'sys', mode, mt || old()));
    };

    //  the skeleton
    ['/bin', '/dev', '/etc', '/lib', '/mnt', '/usr', '/usr/bin', '/usr/lib', '/usr/local', '/usr/local/bin', '/usr/games'].forEach(function (p) {
        dir(p, p === '/bin' || p === '/usr/bin' ? 'bin' : 'root', p === '/bin' || p === '/usr/bin' ? 'bin' : 'sys');
    });
    dir('/lost+found', 'root', 'root', 'rwx------');
    dir('/tmp', 'root', 'sys', 'rwxrwxrwt', recent());
    dir('/usr/spool/uucppublic', 'uucp', 'uucp', 'rwxrwxrwx');
    if (fl === 'sun' || fl === 'svr4') {
        dir('/var', 'root', 'sys');
        dir('/var/tmp', 'root', 'sys', 'rwxrwxrwt');
        put('/usr/adm', { link: '/var/adm' });
    }
    unixBins(fl).forEach(function (b) {
        var big = /sh$|vi|mail|ed$/.test(b);
        put('/bin/' + b, fsExec('bin', 'bin', (big ? 40000 : 6000) + Math.floor(r() * 30000), UNIX_STRINGS[b]));
    });
    put(lay.kernel, fsExec('root', 'sys', 400000 + Math.floor(r() * 300000), ['panic: %s', 'syncing disks... ', 'root on ', w.name]));
    ['null', 'tty', 'console', 'rmt0', 'lp0', 'tty1a', 'tty2a'].forEach(function (d) {
        var n = put('/dev/' + d, fsFile('root', 'sys', d === 'null' || d === 'tty' ? 'rw-rw-rw-' : 'rw--w----', '', old()));
        n.size = 0;
        n.dev = 'c';
    });

    //  /etc
    var shadowed = fl === 'svr4' || fl === 'unicos';
    var passwd = put('/etc/passwd', fsFile('root', 'sys', 'r--r--r--', function () {
        //  a NeXT's own file is for single-user mode; the accounts are in NetInfo
        return fl === 'next' ? unixPasswd(w, false).split('\n')[0] + '\nnobody:*:-2:-2::/:\ndaemon:*:1:1::/:\n' :
            unixPasswd(w, shadowed);
    }, recent()));
    if (fl === 'next') {
        passwd.onRead = function (c, io) {
            io.say('Three accounts. A NeXT only reads this file in single-user mode: the real accounts are in NetInfo. nidump passwd . prints them.');
        };
    } else if (fl === 'unicos') {
        var udb = put('/etc/udb', fsFile('root', 'sys', 'rw-------', '', recent(), 'data'));
        udb.size = 40000 + Math.floor(r() * 20000);
        put('/etc/udbsee', fsExec('root', 'sys', 180000, ['/etc/udb', 'udbsee: cannot open %s', 'name:%s:']));
        passwd.onRead = function (c, io) {
            io.say('An x where each password should be. UNICOS keeps them in its user database, /etc/udb. udbsee shows it, to root.');
        };
    } else if (shadowed) {
        var shadow = put('/etc/shadow', fsFile('root', 'sys', 'r--------', function () { return unixShadow(w); }, recent()));
        shadow.onRead = function (c, io) {
            gotLoot(c, io, '/etc/passwd');
            io.say('The shadow file: every account and its encrypted password. Crack can work on it.');
        };
        passwd.onRead = function (c, io) {
            io.say('An x where each password should be. On Release 4 they\'re in /etc/shadow, which only root can read.');
        };
    } else {
        passwd.onRead = function (c, io) { gotLoot(c, io, '/etc/passwd'); };
    }
    put('/etc/group', fsFile('root', 'sys', 'r--r--r--', function () { return unixGroup(w); }, old()));
    put('/etc/motd', fsFile('root', 'sys', 'rw-r--r--', function () { return unixMotd(w); }, recent()));
    put('/etc/hosts', fsFile('root', 'sys', 'rw-r--r--', function () {
        return '127.0.0.1\tlocalhost\n192.9.200.' + (1 + hash32(w.name) % 200) + '\t' + w.name + '\n' +
            (w.sisterName ? '192.9.200.' + (1 + hash32(w.sisterName) % 200) + '\t' + w.sisterName + '\n' : '');
    }, old()));
    if (fl === 'bsd' || fl === 'sun' || fl === 'next') {
        put('/etc/ttys', fsFile('root', 'sys', 'rw-r--r--', 'console\t"/usr/etc/getty std.9600"\t' + (fl === 'next' ? 'next' : 'sun') + '\ton secure\nttya\t"/usr/etc/getty std.2400"\tdialup\ton\n', old()));
        put('/etc/rc.local', fsFile('root', 'sys', 'rw-r--r--', '#\n# local daemons\n#\necho -n \'local daemons:\'\nif [ -f /usr/lib/lpd ]; then\n\t/usr/lib/lpd; echo -n \' lpd\'\nfi\necho \'.\'\n', old()));
    } else {
        put('/etc/inittab', fsFile('root', 'sys', 'rw-r--r--', 'is:2:initdefault:\nco:234:respawn:/etc/getty console console\n01:2:respawn:/usr/lib/uucp/uugetty -r -t 60 tty1a 2400\n', old()));
        put('/etc/profile', fsFile('root', 'sys', 'rw-r--r--', 'trap "" 1 2 3\numask 022\ncat /etc/motd\nif mail -e; then echo "You have mail."; fi\ntrap 1 2 3\n', old()));
    }
    if (w.sister) {
        put('/etc/hosts.equiv', fsFile('root', 'sys', 'rw-r--r--', w.sisterName + '\n', old())).onRead = function (c, io) { unixSisterSay(w, io); };
    }

    //  logs
    dir(lay.adm, 'adm', 'adm', 'rwxrwxr-x', recent());
    ['wtmp', 'utmp', 'pacct'].forEach(function (f) {
        var n = put(lay.adm + '/' + f, fsFile('adm', 'adm', 'rw-rw-r--', '', recent(), 'data'));
        n.size = 4000 + Math.floor(r() * 60000);
    });
    put(lay.adm + '/sulog', fsFile('root', 'root', 'rw-------', function () {
        var d = new Date();
        var md = (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '/' + (d.getDate() < 10 ? '0' : '') + d.getDate();
        return ['SU ' + md + ' 08:12 + tty1a ' + w.boss + '-root', 'SU ' + md + ' 13:40 - tty2a ' + w.peers[0] + '-root',
            'SU ' + md + ' 17:02 + console ' + w.boss + '-root'].join('\n') + '\n';
    }, recent()));
    put(lay.adm + '/messages', fsFile('root', 'sys', 'rw-r--r--', function () {
        return 'vmunix: ' + w.name + ' up\nvmunix: dumpdev on rmt0\nvmunix: tape rmt0: I/O error\ngetty: tty2a: line dropped\n';
    }, recent()));

    //  uucp: who this machine calls, and how. uucp and root only.
    dir('/usr/lib/uucp', 'uucp', 'uucp', 'rwxr-xr-x');
    var sys = put('/usr/lib/uucp/' + lay.sysFile, fsFile('uucp', 'uucp', 'r--------', function () { return unixSystems(ctx, w); }, recent()));
    sys.onRead = function (c, io) {
        gotLeads(c, io, leadsOf(c, 3), 'lsys');
        io.say('Numbers, with logins. Those land on your found list.');
    };
    (lay.sysFile === 'L.sys' ? ['L-devices', 'USERFILE', 'L.cmds'] : ['Devices', 'Permissions', 'Dialers']).forEach(function (f) {
        put('/usr/lib/uucp/' + f, fsFile('uucp', 'uucp', 'r--r--r--', f === 'Devices' || f === 'L-devices' ? 'ACU tty1a - 2400 hayes\nDirect tty1a - 2400 direct\n'
            : f === 'Dialers' ? 'hayes\t=,-,\t"" \\dAT\\r\\c OK\\r \\EATDT\\T\\r\\c CONNECT\n' : 'LOGNAME=nuucp\nMACHINE=OTHER READ=/usr/spool/uucppublic\n', old()));
    });
    put('/usr/lib/uucp/uucico', fsExec('uucp', 'uucp', 98000, ['Login incorrect', 'ogin:', 'ssword:', 'CONN FAILED']));

    //  mail and cron
    dir(lay.mail, 'root', 'mail', 'rwxrwxr-x', recent());
    w.staff.forEach(function (n) {
        put(lay.mail + '/' + n, fsFile(n, 'mail', 'rw-rw----', function () { return unixTheirMail(w, n); }, recent()));
    });
    var tab = '0 2 * * * /usr/local/bin/dobackup\n30 3 * * 0 /usr/lib/uucp/uudemon.cleanup\n0 4 * * * /etc/cleantmp\n';
    if (lay.cron) {
        put(lay.cron + '/root', fsFile('root', 'sys', 'r--------', tab, recent()));
        put(lay.cron + '/' + w.boss, fsFile('root', 'sys', 'r--------', '0 8 * * 1-5 /usr/bin/calendar -\n', recent()));
    } else {
        put('/usr/lib/crontab', fsFile('root', 'sys', 'rw-r--r--', tab.replace(/\* \* \* \//g, '* * * root /'), recent()));
    }

    //  the homes
    dir(lay.home, 'root', 'sys');
    w.staff.forEach(function (n) {
        var priv = n === w.boss || r() < 0.3;
        var hd = dir(lay.home + '/' + n, n, 'staff', priv ? 'rwx------' : 'rwxr-xr-x', recent());
        var shrc = lay.csh ? '.cshrc' : '.profile';
        hd.kids[shrc] = fsFile(n, 'staff', 'rw-r--r--', shrc === '.cshrc' ? 'set path=(/bin /usr/bin /usr/local/bin .)\nset prompt="' + w.name + '% "\numask 022\n'
            : 'PATH=/bin:/usr/bin:/usr/local/bin:.\nexport PATH\numask 022\n', old());
        if (w.planUsers.indexOf(n) >= 0 || n === w.boss) {
            var plans = UNIX_PLANS[w.h.prof] || UNIX_PLANS.biz;
            hd.kids['.plan'] = fsFile(n, 'staff', 'rw-r--r--', n === w.boss ? 'If the system is down, I already know.\n' : pick(r, plans) + '\n', recent());
        }
    });
    var bossHome = lay.home + '/' + w.boss;
    var stuffHome = lay.home + '/' + w.stuffUser;
    var phonesHome = lay.home + '/' + w.phonesUser;

    //  the way up
    if (w.way === 'backup') {
        put('/usr/local/bin/dobackup', fsFile('root', 'sys', 'rwxr-xr-x',
            '#!/bin/sh\n# nightly dump to tape.  runs from cron.  -- ' + w.boss + '\n# su needs the password on stdin now that the box is in the closet\necho "' + w.rootpw +
            '" | su root -c "tar cvf /dev/rmt0 /usr /etc" > /tmp/backup.log 2>&1\n', recent())).onRead = function (c, io) { unixWaySay(io); };
    } else {
        put('/usr/local/bin/dobackup', fsFile('root', 'sys', 'rwx------', '#!/bin/sh\ntar cvf /dev/rmt0 /usr /etc > /tmp/backup.log 2>&1\n', recent()));
    }
    if (w.way === 'netrc') {
        //  the admin's home is open enough to get to the file, and the file
        //  is readable: the mistake
        fsLook({ root: root, home: '/' }, '/', bossHome, { root: true }).node.mode = 'rwxr-xr-x';
        put(bossHome + '/.netrc', fsFile(w.boss, 'staff', 'rw-r--r--', 'machine ' + (w.sisterName || 'localhost') + ' login root password ' + w.rootpw + '\n', recent()))
            .onRead = function (c, io) { unixWaySay(io); };
    }
    var stuffDir = fsLook({ root: root, home: '/' }, '/', stuffHome, { root: true }).node;
    stuffDir.mode = 'rwxr-xr-x';
    stuffDir.kids.stuff = fsFile(w.stuffUser, 'staff', w.way === 'stuff' ? 'rw-r--r--' : 'rw-------', function () {
        var lines = ['bank card   ' + (1000 + hash32(w.stuffUser) % 9000), 'library     ' + w.stuffUser + '1', 'dialup      ' + pick(rng(hash32(w.stuffUser)), SECRET_WORDS).toLowerCase()];
        if (w.way === 'stuff') lines.splice(1, 0, 'root        ' + w.rootpw + '   (' + w.boss + ' changed it again)');
        return lines.join('\n') + '\n';
    }, recent());
    if (w.way === 'stuff') {
        stuffDir.kids.stuff.onRead = function (c, io) { unixWaySay(io); };
    }

    //  a lead: a phone list in a user's home
    var phonesDir = fsLook({ root: root, home: '/' }, '/', phonesHome, { root: true }).node;
    var phoneNums = leadsOf(ctx, 5).slice(3);
    if (phonesDir && phoneNums.length) {
        phonesDir.mode = 'rwxr-xr-x';
        phonesDir.kids.phones = fsFile(w.phonesUser, 'staff', 'rw-r--r--', function () {
            return phoneNums.map(function (num, i) {
                return fit(['the other site', 'vendor support', 'the plant', 'remote office'][i % 4], 18) + fmtNum(num).slice(2);
            }).join('\n') + '\n';
        }, recent());
        phonesDir.kids.phones.onRead = function (c, io) {
            gotLeads(c, io, phoneNums, 'phones');
            io.say('A phone list. If those numbers answer with a carrier, they\'re on your found list now.');
        };
    }

    //  the loot only staff can read
    var prize = unixPrize(w);
    if (prize) {
        var pd = prize[0].slice(0, prize[0].lastIndexOf('/'));
        dir(pd, 'root', 'staff', 'rwxr-x---', recent());
        put(prize[0], fsFile('root', 'staff', 'rw-r-----', prize[2], recent())).onRead = function (c, io) {
            gotLoot(c, io, prize[1], 'prize', prize[3] || 15);
        };
    }

    //  phone company boxes: the frame room's notes, with the way to COSMOS
    if (w.h.prof === 'telco') {
        var cz = cosmosNear(ctx.seed, w.h);
        put('/usr/frame/notes', fsFile('root', 'staff', 'rw-r--r--', function () {
            if (!cz) return 'MLT down again.\n';
            var ca = hostAtNum(ctx, cz, 'cosmos');
            return 'MLT down again.\nCOSMOS is on ' + fmtNum(cz).slice(2) + '. login ' + ca.accounts[0][0] +
                (ca.accounts[0][1] ? ' pw ' + ca.accounts[0][1] : ' (no pw)') + ', wc ' + ca.wc + '\n';
        }, recent())).onRead = function (c, io) {
            if (cz) {
                gotLeads(c, io, [cz], 'cosmos');
                io.say('COSMOS: the phone company\'s own database. It\'s on your found list.');
            }
        };
        fsLook({ root: root, home: '/' }, '/', '/usr/frame', { root: true }).node.mode = 'rwxr-xr-x';
    }

    unixFlavorTree(w, root, dir, put, old);
    landTree(ctx, w, root);
    return { root: root, home: '/', w: w };
}

//  What each of the phase 6 flavors adds to the tree
function unixFlavorTree(w, root, dir, put, old) {
    var fl = w.lay.fl;
    if (fl === 'irix') {
        dir('/usr/demos', 'demos', 'demos', 'rwxr-xr-x');
        put('/usr/demos/buttonfly', fsExec('demos', 'demos', 210000, ['buttonfly', '/usr/demos/.menu']));
        dir('/usr/people/4Dgifts', '4Dgifts', 'demos', 'rwxr-xr-x').kids['README'] = fsFile('4Dgifts', 'demos', 'rw-r--r--',
            'Example programs from Silicon Graphics.  Have fun.\n', old());
    } else if (fl === 'next') {
        dir('/me', 'me', 'staff', 'rwxr-xr-x');
        dir('/NextApps');
        put('/NextApps/BuildDisk', fsExec('root', 'wheel', 160000, ['BuildDisk', '/usr/etc/restore0.9']));
        dir('/NextLibrary');
        //  /etc lives in /private, with a link where UNIX expects it, and
        //  the group can write it (cert9106.txt)
        var priv = dir('/private', 'root', 'wheel');
        priv.kids.etc = root.kids.etc;
        priv.kids.etc.mode = 'rwxrwxr-x';
        priv.kids.etc.grp = 'wheel';
        root.kids.etc = { link: '/private/etc', own: 'root', grp: 'wheel', mode: 'rwxr-xr-x', mt: old() };
    }
}

function unixSystems(ctx, w) {
    return leadsOf(ctx, 3).map(function (num, i) {
        var la = leadLogin(ctx, num);
        return fit(['abvax', 'cbosgd', 'ihnp4', 'mcvax', 'decwrl'][(hash32(num) + i) % 5], 8) + ' Any ACU 2400 ' + num.slice(3) +
            ' ogin:--ogin: ' + la[0] + ' ssword: ' + (la[1] || '""');
    }).join('\n') + '\n';
}

function unixWaySay(io) {
    io.say('A password, and whose it is. su might take it.');
}

function unixSisterSay(w, io) {
    io.say(w.sisterName + ' and this machine trust each other. rlogin ' + w.sisterName + ' gets you there with no password.');
}

//  The caller's own corner: a home directory (made if their account has
//  none), their mail, and the notes the game has always left there
function unixMoveIn(fs, user, priv) {
    var w = fs.w;
    var home = unixHome(w, user);
    fs.home = home;
    var who = { root: true };
    var look = fsLook(fs, '/', home, who);
    var made = !look.node;
    if (made) {
        fsPut(fs.root, home, fsDir(user, 'guest', 'rwxr-xr-x', fsDate(90)));
    }
    var hd = fsLook(fs, '/', home, who).node;
    //  a player may have left a file where the directory was
    if (!hd.dir) hd = fsPut(fs.root, home, fsDir(user, 'guest', 'rwxr-xr-x', fsDate(90)));
    if (!priv && (made || w.staff.indexOf(user) >= 0)) {
        hd.kids.notes = fsFile(user, hd.grp, 'rw-r--r--', 'cron job for backups is broken again\ntell field svc the uucp account is still open\n' +
            'uucp keeps its list of systems in /usr/lib/uucp\n', fsDate(12));
        if (w.sister) {
            hd.kids['.rhosts'] = fsFile(user, hd.grp, 'rw-r--r--', w.sisterName + ' ' + user + '\n', fsDate(40));
            hd.kids['.rhosts'].onRead = function (c, io) { unixSisterSay(w, io); };
        }
    }
    var mailUser = priv ? 'root' : user;
    fsPut(fs.root, w.lay.mail + '/' + mailUser, fsFile(mailUser, 'mail', 'rw-rw----', function () { return unixMyMail(w, mailUser); }, fsDate(0)));
}

//  ---- the shell ----

function unixUid(w, user) {
    if (user === 'root') return [0, 1, 'root', 'other'];
    var sys = unixSystemUsers(w.lay).filter(function (u) { return u[0] === user; })[0];
    if (sys) return [sys[1], sys[2], user, sys[2] === 10 ? 'staff' : sys[2] === 100 ? 'guest' : user];
    var i = w.staff.indexOf(user);
    return [i >= 0 ? 101 + i : 300, 10, user, 'staff'];
}

function unixWho(w, user, priv) {
    var u = unixUid(w, priv ? 'root' : user);
    var groups = [u[3]];
    if (w.staff.indexOf(user) >= 0) groups.push('staff');
    if (user === 'uucp') groups.push('uucp');
    if (user === 'adm') groups.push('adm');
    if (user === 'me' && w.lay.fl === 'next') groups.push('wheel');
    return { user: priv ? 'root' : user, groups: groups, root: !!priv };
}

//  The shell's complaint, worded as the flavor worded it
function unixErr(fl, cmd, path, why) {
    var bsd = fl === 'bsd' || fl === 'sun' || fl === 'next';
    if (cmd === 'cd') {
        return why === 'denied' ? path + ': permission denied' : path + ': bad directory';
    }
    if (bsd) {
        return cmd + ': ' + path + ': ' + (why === 'denied' ? 'Permission denied' : why === 'isdir' ? 'Is a directory' : why === 'notdir' ? 'Not a directory' : 'No such file or directory');
    }
    if (cmd === 'ls') {
        return why === 'denied' ? path + ': Permission denied' : path + ' not found';
    }
    return cmd + ': cannot open ' + path;
}

function runUnix(ctx, io, preAuth) {
    var h = ctx.host;
    ctx.ov = keepLoad(ctx.seed, h.num);
    var t = era();
    var name = h.name.toLowerCase();
    var fl0 = unixFlavor(h);
    io.out('\r\n\r\n' + ({ irix: 'IRIX', next: 'NeXT Mach', unicos: 'UNICOS' }[fl0] ||
        (/BSD/.test(h.version) ? h.version : /SunOS/.test(h.version) ? 'SunOS UNIX' : 'UNIX ' + h.version)) + ' (' + name + ')\r\n\r\n');
    var acct = preAuth || null;
    for (var tries = 0; tries < MAX_TRIES && !acct; ) {
        io.out('login: ');
        var u = io.line(true);
        if (u === null) return;
        if (!u.trim()) continue;
        //  an account with no password doesn't ask for one
        var pw = '';
        if (!unixNoPassword(ctx, u.trim())) {
            io.out('Password:');
            pw = io.line(false);
            if (pw === null) return;
            io.out('\r\n');
        }
        acct = unixAuth(ctx, u.trim(), pw);
        if (!acct) {
            io.out('Login incorrect\r\n');
            failedLogin(ctx);
            tries++;
        }
    }
    if (!acct) {
        return;
    }
    var fs = unixTree(ctx);
    keepOpen(ctx, fs, function () { return unixTree(ctx); });
    var w = fs.w;
    var fl = w.lay.fl;
    io.out('Last login: ' + t.unix.slice(0, 16) + ' on tty' + (h.users % 4) + 'a\r\n');
    io.out(fl === 'irix' ? 'IRIX Release 4.0.5 IP12 ' + name + '\r\nCopyright 1987-1992 Silicon Graphics, Inc. All Rights Reserved.\r\n' :
        fl === 'unicos' ? 'Cray UNICOS 6.1 (' + name + ')\r\nCopyright (c) 1991 Cray Research, Inc.\r\n' :
        w.lay.berk ? h.version + '\r\n' : 'UNIX System V\r\nCopyright (c) 1984, 1986, 1987, 1988 AT&T\r\nAll Rights Reserved\r\n');
    var priv = loggedIn(ctx, acct, io);
    //  a supercomputer's time is money: somebody reads its accounting
    if (fl === 'unicos') {
        addHeat(ctx.p, 4);
        io.say('A Cray. Every minute on this machine is billed to someone, and someone reads the bill.');
    }
    var user = acct[0];
    landHello(ctx, io);
    unixMoveIn(fs, user, priv);
    //  a player may have removed it
    var motd = fsLook(fs, '/', '/etc/motd', { root: true }).node;
    if (motd && !motd.dir) io.out(unixLines(fsText(motd)));
    //  the admins' word after they threw someone off
    if (ctx.ov.note) io.out(unixLines('\n  ' + ctx.ov.note + '\n\n'));
    io.out('You have mail.\r\n');
    var sh = { ctx: ctx, io: io, fs: fs, w: w, fl: fl, user: user, priv: priv, cwd: fs.home };
    sh.who = unixWho(w, user, priv);
    sh.tty = 'tty' + (1 + v3.util.random(3)) + 'a';
    sh.on = keepOn(ctx, user, sh.tty);
    var deaf = keepListen(ctx, io, user, sh.on, function (x) {
        return unixLines('\n\nMessage from ' + x.from + '@' + name + ' on ' + x.tty + ' at ' + keepClock(x.at) + ' ...\n' + x.m + '\nEOF\n');
    });
    unixShell(sh);
    deaf();
    landBye(ctx, io);
    keepOff(ctx, sh.on);
}

function unixShell(sh) {
    var ctx = sh.ctx;
    var io = sh.io;
    for (;;) {
        io.out(sh.priv ? '# ' : '$ ');
        var cmd = io.line(true);
        if (cmd === null) return;
        var c = cmd.trim().replace(/\s+/g, ' ');
        if (!c) continue;
        if (c === '\x04') return;
        var verb = c.split(' ')[0];
        //  talking to the admin, or leaving, isn't more poking around
        if (!/^(write|talk|exit|logout)$/.test(verb) && watched(ctx, io, UNIX_QUIET.indexOf(verb) >= 0 ? 0.3 : 1)) return;
        if (sh.priv) unixHistory(sh, c);
        var res = unixRun(sh, c);
        landEach(ctx, io);
        if (keepSave(sh.fs) === 'full') {
            io.out(unixLines('ufs: NOTICE: alloc: /: file system full\n'));
            io.say('This box has no room for more of what players leave. What you just did lasts only this call.');
        }
        if (res === 'exit' || io.over) return;
    }
}

//  Root's shell history: what was typed as root, kept, so whoever looks
//  later can see what was done here (and the one who did it can clean up)
function unixHistory(sh, line) {
    var path = sh.w.lay.csh ? '/.history' : '/.sh_history';
    var look = fsLook(sh.fs, '/', path, { root: true });
    if (!look.node) {
        look.node = look.parent.kids[look.name] = fsFile('root', 'root', 'rw-------', '', fsDate(0, function () { return 0.5; }));
    }
    var lines = fsText(look.node).split('\n').filter(function (l) { return l; });
    lines.push(line);
    look.node.text = lines.slice(-40).join('\n') + '\n';
    look.node.type = 'text';
    keepMark(sh.fs, path);
}

//  A line in sulog: who tried su, and whether it took
function unixSulog(sh, ok) {
    var look = fsLook(sh.fs, '/', sh.w.lay.adm + '/sulog', { root: true });
    if (!look.node || look.node.dir) return;
    var d = new Date();
    var md = (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '/' + (d.getDate() < 10 ? '0' : '') + d.getDate();
    var lines = fsText(look.node).split('\n').filter(function (l) { return l; });
    lines.push('SU ' + md + ' ' + keepClock(nowMs()) + ' ' + (ok ? '+' : '-') + ' ' + sh.tty + ' ' + sh.user + '-root');
    look.node.text = lines.slice(-30).join('\n') + '\n';
    keepMark(sh.fs, look.path);
}

//  Commands an admin wouldn't notice much: looking around, not reading or
//  changing anything
var UNIX_QUIET = ['ls', 'cd', 'pwd', 'echo', 'date', 'id', 'whoami', 'man', 'hostname', 'file', 'who', 'w'];

//  Text with UNIX line ends, as the terminal wants it
function unixLines(s) {
    return String(s).replace(/\r?\n/g, '\r\n');
}

//  Splits a command line into words and a redirection: { words, out, append, inFrom }
function unixParse(c) {
    var res = { out: '', append: false };
    //  the first > that isn't inside quotes
    var q = '';
    for (var i = 0; i < c.length; i++) {
        var ch = c.charAt(i);
        if (q) {
            if (ch === q) q = '';
        } else if (ch === '"' || ch === "'") {
            q = ch;
        } else if (ch === '>') {
            var m = /^(>>?)\s*(\S+)\s*$/.exec(c.slice(i));
            if (m) {
                res.out = m[2];
                res.append = m[1] === '>>';
                c = c.slice(0, i);
            }
            break;
        }
    }
    var words = [];
    var re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    var mm;
    while ((mm = re.exec(c)) !== null) {
        words.push(mm[1] !== undefined ? mm[1] : mm[2] !== undefined ? mm[2] : mm[3]);
    }
    res.words = words;
    return res;
}

//  Runs one command line. Returns 'exit' to end the session.
function unixRun(sh, line) {
    var io = sh.io;
    var p = unixParse(line);
    var w = p.words;
    if (!w.length) {
        //  > file on its own: an empty file (and an empty wtmp)
        if (p.out) unixWrite(sh, p.out, '', false);
        return '';
    }
    var verb = w[0];
    //  wildcards in the arguments
    var args = [];
    w.slice(1).forEach(function (a) {
        args = args.concat(a.charAt(0) === '-' ? [a] : fsGlob(sh.fs, sh.cwd, a, sh.who));
    });
    var buf = [];
    var say = function (s) { buf.push(s); };
    var fn = UNIX_CMDS[verb];
    if (!fn) {
        io.out(unixLines(unixOther(sh, verb)));
        return '';
    }
    var res = fn(sh, args, say, p);
    var text = buf.join('');
    if (p.out && res !== 'raw') {
        unixWrite(sh, p.out, text, p.append);
    } else if (text) {
        io.out(unixLines(text));
    }
    if (sh.after) {
        var after = sh.after;
        sh.after = null;
        after.forEach(function (f) { f(sh.ctx, io); });
    }
    return res === 'exit' ? 'exit' : '';
}

//  A command the shell has no part for: a program run by its path, one of
//  the system's own we don't play out, or nothing at all
var UNIX_OTHER = {
    vi: 'I don\'t know what kind of terminal you are on - all I have is \'unknown\'.\n[Using open mode]\n:q\n',
    tar: 'tar: usage  tar -{txru}[cvfblmhopwBi] [tapefile] [blocksize] [replstr] file1 file2...\n',
    cpio: 'Usage: cpio -o[acvB] <name-list >collection\n',
    csh: '', login: '', sh: '',
    vmunix: '', unix: '',
};

function unixOther(sh, verb) {
    if (verb.indexOf('/') >= 0) {
        var look = fsLook(sh.fs, sh.cwd, verb, sh.who);
        if (look.err || !look.node) return 'sh: ' + verb + ': not found\n';
        if (look.node.dir || !fsCan(look.node, sh.who, 'x')) return 'sh: ' + verb + ': cannot execute\n';
        return '';
    }
    if (UNIX_OTHER[verb] !== undefined && fsLook(sh.fs, '/', '/bin/' + verb, { root: true }).node) {
        return UNIX_OTHER[verb];
    }
    return 'sh: ' + verb + ': not found\n';
}

//  Writes text to a path for the caller: a new file, or over one they may
//  write. Emptying wtmp as root covers your tracks.
function unixWrite(sh, path, text, append) {
    var look = fsLook(sh.fs, sh.cwd, path, sh.who);
    if (look.err) {
        sh.io.out(unixLines('sh: ' + path + ': cannot create\n'));
        return false;
    }
    if (look.node) {
        if (look.node.dir || !fsCan(look.node, sh.who, 'w')) {
            sh.io.out(unixLines('sh: ' + path + ': cannot create\n'));
            return false;
        }
        if (/\/adm\/wtmp$/.test(look.path) && !append && !text) {
            cleaned(sh.ctx, sh.io);
        }
        if (look.node.dev) return true;
        look.node.text = (append ? fsText(look.node) : '') + text;
        delete look.node.size;
        look.node.type = 'text';
        look.node.mt = fsDate(0, function () { return 0.5; });
        keepMark(sh.fs, look.path);
        return true;
    }
    if (!look.parent || !fsCan(look.parent, sh.who, 'w')) {
        sh.io.out(unixLines('sh: ' + path + ': cannot create\n'));
        return false;
    }
    look.parent.kids[look.name] = fsFile(sh.who.user, sh.who.groups[0], 'rw-r--r--', text, fsDate(0, function () { return 0.5; }));
    keepMark(sh.fs, look.path);
    return true;
}

//  Reads a file for a command; complains and returns null when it can't
function unixRead(sh, cmd, path, say) {
    var look = fsLook(sh.fs, sh.cwd, path, sh.who);
    if (look.err || !look.node) {
        say(unixErr(sh.fl, cmd, path, look.err === 'denied' ? 'denied' : 'missing') + '\n');
        return null;
    }
    if (look.node.dir) {
        say(unixErr(sh.fl, cmd, path, 'isdir') + '\n');
        return null;
    }
    if (!fsCan(look.node, sh.who, 'r')) {
        say(unixErr(sh.fl, cmd, path, 'denied') + '\n');
        return null;
    }
    if (look.node.onRead) {
        var f = look.node.onRead;
        sh.after = (sh.after || []).concat([f]);
        if (!look.node.repeat) look.node.onRead = null;
    }
    if (look.node.type === 'exec' || look.node.type === 'data') {
        return { node: look.node, text: null };
    }
    return { node: look.node, text: fsText(look.node) };
}

//  Binary as cat shows it: a little line noise
function unixGarbage(node) {
    var s = '';
    var r = rng(hash32(String(node.size) + node.mt));
    for (var i = 0; i < 60; i++) s += String.fromCharCode(33 + Math.floor(r() * 90));
    return s + '\n';
}

function unixLsLine(sh, name, node) {
    var links = node.dir ? 2 + Object.keys(node.kids).filter(function (k) { return node.kids[k].dir; }).length : 1;
    var mode = node.dev ? node.dev + node.mode : fsModeString(node);
    var size = node.dev ? '  0,  ' + (hash32(name) % 16) : String(fsSize(node));
    var own = node.link ? 'root' : node.own;
    var grp = node.link ? 'root' : node.grp;
    return mode + padStart(String(links), sh.fl === 'bsd' || sh.fl === 'next' ? 3 : 4) + ' ' + fit(own, 9) + (sh.w.lay.groupCol ? fit(grp, 9) : '') +
        padStart(size, 8) + ' ' + (node.mt || fsDate(30)) + ' ' + name + (node.link ? ' -> ' + node.link : '');
}

function unixColumns(names) {
    if (!names.length) return '';
    var wd = Math.max.apply(null, names.map(function (n) { return n.length; })) + 2;
    var cols = Math.max(1, Math.floor(80 / wd));
    var rows = Math.ceil(names.length / cols);
    var out = [];
    for (var r = 0; r < rows; r++) {
        var line = '';
        for (var c = 0; c < cols; c++) {
            var i = c * rows + r;
            if (i < names.length) line += c === cols - 1 || i + rows >= names.length ? names[i] : fit(names[i], wd);
        }
        out.push(line.replace(/\s+$/, ''));
    }
    return out.join('\n') + '\n';
}

function unixFlags(args) {
    var f = {};
    var rest = [];
    args.forEach(function (a) {
        if (a.charAt(0) === '-' && a.length > 1) {
            a.slice(1).split('').forEach(function (ch) { f[ch] = true; });
        } else {
            rest.push(a);
        }
    });
    return { f: f, rest: rest };
}

var UNIX_MAN = {
    ls: 'ls - list contents of directory\n\nls [ -alRdF ] [ names ]\n\n-l  long format: mode, links, owner, group, size, date\n-a  include names beginning with .\n-R  list subdirectories too\n-d  list a directory, not its contents\n-F  mark directories with / and executables with *',
    cat: 'cat - concatenate and print files\n\ncat [ file ... ]\n\nWith no file, cat reads what you type until a line with just a\nperiod or ^D, so cat > file makes a file.',
    grep: 'grep - search a file for a pattern\n\ngrep [ -inlv ] pattern [ file ... ]\n\n-i  ignore case    -n  line numbers\n-l  list names of files with matches only    -v  lines that don\'t match',
    find: 'find - find files\n\nfind path -name pattern [ -print ]',
    su: 'su - become super-user or another user\n\nsu [ name ]\n\nAsks for that user\'s password.  Each try is logged in sulog.',
    mail: 'mail - read or send mail\n\nmail             read your mail: a number reads that message,\n                 d deletes, q quits\nmail user        send mail; end with a line with just a period',
    more: 'more - file perusal filter for crt viewing\n\nmore file ...\n\nRETURN for the next page, q to quit.',
    strings: 'strings - find the printable strings in an object or binary file\n\nstrings file ...',
    rlogin: 'rlogin - remote login\n\nrlogin host [ -l username ]\n\nA host that lists yours in its /etc/hosts.equiv or your\n.rhosts lets you in with no password.',
    who: 'who - who is on the system',
    finger: 'finger - user information lookup program\n\nfinger [ name ... ]\n\nShows a user\'s real name, home directory, and .plan.',
    write: 'write - write to another user\n\nwrite user\n\nWhat you type next goes to their terminal.',
    passwd: 'passwd - change login password',
    chmod: 'chmod - change mode\n\nchmod mode file ...\n\nmode is octal, as 644 or 755.',
    crontab: 'crontab - user crontab file\n\ncrontab -l    list your crontab',
    nidump: 'nidump - extract text or tree format from NetInfo domain\n\nnidump [ -t ] { format | -r directory } domain\n\nformat is passwd, group or hosts; domain . is the local one.',
    niutil: 'niutil - NetInfo utility\n\nniutil -list domain path\n\nLists the directories under path, as niutil -list . /users',
    udbsee: 'udbsee - display the user database\n\nudbsee\n\nShows every entry in /etc/udb.  Root only.',
};

var UNIX_CMDS = {
    exit: function () { return 'exit'; },
    logout: function () { return 'exit'; },
    pwd: function (sh, a, say) { say(sh.cwd + '\n'); },
    id: function (sh, a, say) {
        var u = unixUid(sh.w, sh.who.user);
        say('uid=' + u[0] + '(' + u[2] + ') gid=' + u[1] + '(' + u[3] + ')' + (sh.who.groups.indexOf('wheel') >= 0 ? ' groups=0(wheel)' : '') + '\n');
    },
    whoami: function (sh, a, say) {
        if (sh.fl === 'svr3') { say('sh: whoami: not found\n'); return; }
        say(sh.who.user + '\n');
    },
    date: function (sh, a, say) { say(era().unix + '\n'); },
    echo: function (sh, a, say) { say(a.join(' ') + '\n'); },
    uname: function (sh, a, say) {
        if (sh.fl === 'bsd' || sh.fl === 'next') { say('sh: uname: not found\n'); return; }
        var n = sh.w.name;
        var all = a.indexOf('-a') >= 0;
        if (sh.fl === 'sun') say(all ? 'SunOS ' + n + ' 4.1.1 1 sun4c\n' : 'SunOS\n');
        else if (sh.fl === 'irix') say(all ? 'IRIX ' + n + ' 4.0.5 06151813 IP12 mips\n' : 'IRIX\n');
        else if (sh.fl === 'unicos') say(all ? 'sn1703 ' + n + ' 6.1.6 roo.2 CRAY Y-MP\n' : 'sn1703\n');
        else say(all ? n + ' ' + n + ' ' + (sh.fl === 'svr4' ? '4.0 2' : '3.2 2') + ' i386\n' : n + '\n');
    },
    hostname: function (sh, a, say) { say(sh.w.name + '\n'); },
    cd: function (sh, a, say) {
        var to = a[0] || sh.fs.home;
        var look = fsLook(sh.fs, sh.cwd, to, sh.who);
        if (look.err || !look.node || !look.node.dir) {
            say(unixErr(sh.fl, 'cd', to, look.err === 'denied' ? 'denied' : 'missing') + '\n');
            return;
        }
        if (!fsCan(look.node, sh.who, 'x')) {
            say(unixErr(sh.fl, 'cd', to, 'denied') + '\n');
            return;
        }
        sh.cwd = look.path;
    },
    ls: function (sh, a, say) {
        var o = unixFlags(a);
        var f = o.f;
        var targets = o.rest.length ? o.rest : ['.'];
        var files = [];
        var dirs = [];
        targets.forEach(function (t) {
            var look = fsLook(sh.fs, sh.cwd, t, sh.who, true);
            if (look.err || !look.node) {
                say(unixErr(sh.fl, 'ls', t, look.err === 'denied' ? 'denied' : 'missing') + '\n');
            } else if (look.node.dir && !f.d) {
                dirs.push([t, look.node, look.path]);
            } else if (look.node.link && !f.l) {
                var tgt = fsLook(sh.fs, sh.cwd, t, sh.who);
                if (tgt.node && tgt.node.dir && !f.d) dirs.push([t, tgt.node, tgt.path]);
                else files.push([t, look.node]);
            } else {
                files.push([t, look.node]);
            }
        });
        var mark = function (n, node) {
            return n + (f.F ? (node.dir ? '/' : node.link ? '@' : /x/.test(node.mode || '') && !node.dir ? '*' : '') : '');
        };
        var show = function (list) {
            if (f.l) {
                return list.map(function (x) { return unixLsLine(sh, mark(x[0], x[1]), x[1]); }).join('\n') + (list.length ? '\n' : '');
            }
            var names = list.map(function (x) { return mark(x[0], x[1]); });
            return sh.w.lay.columns ? unixColumns(names) : names.map(function (n) { return n + '\n'; }).join('');
        };
        var sections = 0;
        if (files.length) {
            say(show(files));
            sections++;
        }
        var listDir = function (d, label) {
            if (!fsCan(d[1], sh.who, 'r')) {
                say(unixErr(sh.fl, 'ls', d[0], 'denied') + '\n');
                return;
            }
            if (label) say((sections ? '\n' : '') + d[0] + ':\n');
            sections++;
            var names = Object.keys(d[1].kids).filter(function (n) { return f.a || n.charAt(0) !== '.'; }).sort();
            var list = names.map(function (n) { return [n, d[1].kids[n]]; });
            if (f.a) list = [['.', d[1]], ['..', fsLook(sh.fs, '/', d[2] + '/..', { root: true }).node || d[1]]].concat(list);
            if (f.l) {
                var blocks = list.reduce(function (s, x) { return s + Math.ceil(fsSize(x[1]) / 1024); }, 0);
                say('total ' + blocks + '\n');
            }
            say(show(list));
            if (f.R) {
                names.forEach(function (n) {
                    var k = d[1].kids[n];
                    if (k.dir) listDir([(d[0] === '/' ? '' : d[0]) + '/' + n, k, d[2] + '/' + n], 'sub');
                });
            }
        };
        dirs.forEach(function (d) { listDir(d, dirs.length + files.length > 1); });
    },
    cat: function (sh, a, say, p) {
        if (!a.length) {
            //  cat > file: lines until a lone period or ^D
            var lines = [];
            for (;;) {
                var l = sh.io.line(true);
                if (l === null) return 'exit';
                if (l === '.' || l === '\x04' || l === '^D') break;
                lines.push(l);
            }
            say(lines.join('\n') + (lines.length ? '\n' : ''));
            return;
        }
        a.forEach(function (path) {
            var got = unixRead(sh, 'cat', path, say);
            if (got) say(got.text === null ? unixGarbage(got.node) : got.text);
        });
    },
    more: function (sh, a, say) {
        a.forEach(function (path) {
            var got = unixRead(sh, 'more', path, say);
            if (!got) return;
            var lines = (got.text === null ? unixGarbage(got.node) : got.text).replace(/\n$/, '').split('\n');
            if (a.length > 1) lines.unshift('::::::::::::::', path, '::::::::::::::');
            for (var i = 0; i < lines.length; i += 20) {
                sh.io.out(unixLines(lines.slice(i, i + 20).join('\n') + '\n'));
                if (i + 20 < lines.length) {
                    sh.io.out('--More--(' + Math.floor((i + 20) * 100 / lines.length) + '%)');
                    var k = sh.io.line(false);
                    sh.io.out('\r\n');
                    if (k === null) return;
                    if (/^q/i.test(k)) break;
                }
            }
        });
    },
    head: function (sh, a, say) { unixHeadTail(sh, a, say, true); },
    tail: function (sh, a, say) { unixHeadTail(sh, a, say, false); },
    wc: function (sh, a, say) {
        a.forEach(function (path) {
            var got = unixRead(sh, 'wc', path, say);
            if (!got) return;
            var t = got.text === null ? '' : got.text;
            var size = got.text === null ? fsSize(got.node) : t.length;
            say(padStart(String((t.match(/\n/g) || []).length), 7) + padStart(String(t.split(/\s+/).filter(function (x) { return x; }).length), 8) +
                padStart(String(size), 8) + ' ' + path + '\n');
        });
    },
    file: function (sh, a, say) {
        a.forEach(function (path) {
            var look = fsLook(sh.fs, sh.cwd, path, sh.who, true);
            if (look.err || !look.node) { say(path + ':\tcannot open\n'); return; }
            var n = look.node;
            var what = n.link ? 'symbolic link to ' + n.link : n.dir ? 'directory' : n.dev ? 'character special' : n.type === 'exec' ? 'executable' :
                n.type === 'data' ? 'data' : /^#!\/bin\/sh/.test(fsCan(n, sh.who, 'r') ? fsText(n) : '') ? 'commands text' : 'ascii text';
            say(path + ':\t' + what + '\n');
        });
    },
    strings: function (sh, a, say) {
        a.forEach(function (path) {
            var got = unixRead(sh, 'strings', path, say);
            if (!got) return;
            if (got.text !== null) { say(got.text); return; }
            say((got.node.strs || []).concat(['@(#)' + path.split('/').pop() + '\t1.' + (hash32(path) % 20)]).join('\n') + '\n');
        });
    },
    grep: function (sh, a, say) {
        var o = unixFlags(a);
        var pat = o.rest.shift();
        if (pat === undefined) { say('usage: grep [-inlv] pattern [file ...]\n'); return; }
        var re;
        try {
            re = new RegExp(pat, o.f.i ? 'i' : '');
        } catch (e) {
            say('grep: RE error\n');
            return;
        }
        var many = o.rest.length > 1;
        o.rest.forEach(function (path) {
            var look = fsLook(sh.fs, sh.cwd, path, sh.who);
            if (look.node && look.node.dir) return;
            var got = unixRead(sh, 'grep', path, say);
            if (!got || got.text === null) return;
            var hits = 0;
            got.text.replace(/\n$/, '').split('\n').forEach(function (l, i) {
                if (re.test(l) !== !!o.f.v) {
                    hits++;
                    if (!o.f.l) say((many ? path + ':' : '') + (o.f.n ? (i + 1) + ':' : '') + l + '\n');
                }
            });
            if (o.f.l && hits) say(path + '\n');
        });
    },
    find: function (sh, a, say) {
        var start = a[0] && a[0].charAt(0) !== '-' ? a[0] : '.';
        var ni = a.indexOf('-name');
        var re = ni >= 0 && a[ni + 1] ? fsPattern(a[ni + 1]) : null;
        var look = fsLook(sh.fs, sh.cwd, start, sh.who);
        if (look.err || !look.node) { say('find: cannot stat ' + start + '\n'); return; }
        var count = 0;
        var walk = function (node, path) {
            if (count > 400) return;
            if (!fsCan(node, sh.who, 'r') || !fsCan(node, sh.who, 'x')) {
                say('find: cannot read dir ' + path + ': Permission denied\n');
                return;
            }
            Object.keys(node.kids).sort().forEach(function (n) {
                var k = node.kids[n];
                var kp = (path === '/' ? '' : path) + '/' + n;
                count++;
                if (!re || re.test(n)) say(kp + '\n');
                if (k.dir) walk(k, kp);
            });
        };
        if (!re || re.test(start.split('/').pop())) say(start + '\n');
        if (look.node.dir) walk(look.node, start);
    },
    mkdir: function (sh, a, say) {
        a.forEach(function (path) {
            var look = fsLook(sh.fs, sh.cwd, path, sh.who);
            if (look.node) { say('mkdir: ' + path + ': File exists\n'); return; }
            if (look.err || !look.parent || !fsCan(look.parent, sh.who, 'w')) { say('mkdir: cannot access ' + path.replace(/\/[^/]*$/, '') + '\n'); return; }
            look.parent.kids[look.name] = fsDir(sh.who.user, sh.who.groups[0], 'rwxr-xr-x', fsDate(0, function () { return 0.5; }));
            keepMark(sh.fs, look.path);
        });
    },
    touch: function (sh, a, say) {
        a.forEach(function (path) {
            var look = fsLook(sh.fs, sh.cwd, path, sh.who);
            if (look.node) { look.node.mt = fsDate(0, function () { return 0.5; }); return; }
            unixWrite(sh, path, '', false);
        });
    },
    rm: function (sh, a, say) {
        var o = unixFlags(a);
        o.rest.forEach(function (path) {
            var look = fsLook(sh.fs, sh.cwd, path, sh.who, true);
            if (look.err || !look.node) { say('rm: ' + path + ' non-existent\n'); return; }
            if (look.node.dir && !o.f.r) { say('rm: ' + path + ' directory\n'); return; }
            if (!fsCan(look.parent, sh.who, 'w')) { say('rm: ' + path + ' not removed. Permission denied\n'); return; }
            if (/\/adm\/wtmp$/.test(look.path)) cleaned(sh.ctx, sh.io);
            delete look.parent.kids[look.name];
            keepMark(sh.fs, look.path);
        });
    },
    rmdir: function (sh, a, say) {
        a.forEach(function (path) {
            var look = fsLook(sh.fs, sh.cwd, path, sh.who, true);
            if (look.err || !look.node || !look.node.dir) { say('rmdir: ' + path + ': Directory does not exist\n'); return; }
            if (Object.keys(look.node.kids).length) { say('rmdir: ' + path + ': Directory not empty\n'); return; }
            if (!fsCan(look.parent, sh.who, 'w')) { say('rmdir: ' + path + ': Permission denied\n'); return; }
            delete look.parent.kids[look.name];
            keepMark(sh.fs, look.path);
        });
    },
    cp: function (sh, a, say) { unixCopy(sh, a, say, false); },
    mv: function (sh, a, say) { unixCopy(sh, a, say, true); },
    chmod: function (sh, a, say) {
        var m = a[0];
        if (!/^[0-7]{3,4}$/.test(m || '') || a.length < 2) { say('Usage: chmod [ugoa][+-=][rwxlstugo] file ...\n'); return; }
        var bits = m.slice(-3).split('').map(function (d) {
            d = parseInt(d, 8);
            return (d & 4 ? 'r' : '-') + (d & 2 ? 'w' : '-') + (d & 1 ? 'x' : '-');
        }).join('');
        a.slice(1).forEach(function (path) {
            var look = fsLook(sh.fs, sh.cwd, path, sh.who);
            if (look.err || !look.node) { say('chmod: can\'t access ' + path + '\n'); return; }
            if (!sh.who.root && look.node.own !== sh.who.user) { say('chmod: can\'t change ' + path + ': Not owner\n'); return; }
            look.node.mode = bits;
            keepMark(sh.fs, look.path);
        });
    },
    who: function (sh, a, say) { unixWhoList(sh, say, 'who'); },
    w: function (sh, a, say) { unixWhoList(sh, say, 'w'); },
    finger: function (sh, a, say) {
        var w = sh.w;
        if (!a.length) { unixWhoList(sh, say, 'finger'); return; }
        a.forEach(function (n) {
            var known = w.staff.indexOf(n) >= 0 || n === sh.user || n === 'root';
            if (!known) { say('finger: ' + n + ': no such user.\n'); return; }
            var home = unixHome(w, n);
            var on = n === w.boss ? adminOnline(sh.ctx) : n === sh.user;
            var t = era().unix;
            say('Login name: ' + fit(n, 16) + 'In real life: ' + (w.real[n] || (n === 'root' ? 'Super-User' : '???')) + '\n' +
                'Directory: ' + fit(home, 26) + 'Shell: ' + (w.lay.csh ? '/bin/csh' : '/bin/sh') + '\n' +
                (on ? 'On since ' + t.slice(4, 16) + ' on ' + (n === w.boss ? 'console' : 'tty1a') + '\n' : 'Last login ' + t.slice(4, 10) + ' on tty2a\n'));
            var plan = fsLook(sh.fs, '/', home + '/.plan', { root: true }).node;
            say(plan ? 'Plan:\n' + fsText(plan) : 'No Plan.\n');
        });
    },
    last: function (sh, a, say) {
        var w = sh.w;
        var t = era().unix;
        say(fit(sh.user, 9) + fit(sh.tty || 'tty1a', 9) + t.slice(0, 11) + keepClock(sh.on || nowMs()) + '   still logged in\n');
        //  callers before this one, newest first
        var now = nowMs();
        keepSeen(sh.ctx.seed, w.h.num).reverse().forEach(function (x) {
            if (x.on === sh.on && x.id === String(v3.user.id)) return;
            var span = x.off ? keepClock(x.on) + ' - ' + keepClock(x.off) + '  (' + unixSpan(x.off - x.on) + ')' :
                now - x.on < KEEP_ON_MS ? keepClock(x.on) + '   still logged in' : keepClock(x.on) + ' - crash';
            say(fit(x.u, 9) + fit(x.tty, 9) + t.slice(0, 11) + span + '\n');
        });
        say(fit(w.boss, 9) + 'console  ' + t.slice(0, 10) + ' 08:02 - 17:44  (09:42)\n');
        w.peers.slice(0, 3).forEach(function (n, i) {
            say(fit(n, 9) + 'tty2a    ' + t.slice(0, 10) + ' ' + (13 - i) + ':15 - ' + (13 - i) + ':58  (00:43)\n');
        });
        say('\nwtmp begins ' + t.slice(0, 10) + '\n');
    },
    ps: function (sh, a, say) {
        var full = a.some(function (x) { return /[efax]/.test(x); });
        var bsd = sh.w.lay.berk;
        var rows = [['root', 1, '?', 'init'], ['root', 64, '?', 'cron'], ['lp', 71, '?', bsd ? 'lpd' : 'lpsched'], ['root', 88, 'tty2a', 'getty']];
        if (adminOnline(sh.ctx)) rows.push([sh.w.boss, 211, 'console', 'vi /etc/passwd']);
        rows.push([sh.who.user, 412, 'tty1a', '-sh'], [sh.who.user, 430, 'tty1a', 'ps' + (a.length ? ' ' + a.join(' ') : '')]);
        if (!full) rows = rows.filter(function (x) { return x[2] === 'tty1a'; });
        if (bsd) {
            say('  PID TT STAT  TIME COMMAND\n');
            rows.forEach(function (x) { say(padStart(String(x[1]), 5) + ' ' + fit(x[2] === '?' ? '?' : x[2].slice(3), 3) + 'S     0:01 ' + (full ? fit(x[0], 9) : '') + x[3] + '\n'); });
        } else {
            say(full ? '     UID   PID  PPID  C    STIME TTY      TIME COMD\n' : '   PID TTY      TIME COMD\n');
            rows.forEach(function (x) {
                say(full ? padStart(x[0], 8) + padStart(String(x[1]), 6) + padStart('1', 6) + '  0 08:02:11 ' + fit(x[2], 9) + '0:01 ' + x[3] + '\n'
                    : padStart(String(x[1]), 6) + ' ' + fit(x[2], 9) + '0:01 ' + x[3].split(' ')[0] + '\n');
            });
        }
    },
    crontab: function (sh, a, say) {
        if (a[0] !== '-l') { say('usage: crontab [file]  or  crontab -l\n'); return; }
        if (!sh.w.lay.cron) { say('sh: crontab: not found\n'); return; }
        var n = fsLook(sh.fs, '/', sh.w.lay.cron + '/' + sh.who.user, { root: true }).node;
        say(n ? fsText(n) : 'crontab: can\'t open your crontab file.\n');
    },
    man: function (sh, a, say) {
        if (!a[0]) { say('usage: man [ section ] title\n'); return; }
        var page = UNIX_MAN[a[a.length - 1]];
        if (!page) { say('No manual entry for ' + a[a.length - 1] + '.\n'); return; }
        var t = a[a.length - 1].toUpperCase();
        say('\n' + t + '(1)' + repeat(' ', 40) + t + '(1)\n\nNAME\n     ' + page.replace(/\n/g, '\n     ') + '\n\n');
    },
    su: function (sh, a, say) {
        var to = a[0] && a[0] !== '-' ? a[0] : 'root';
        if (to !== 'root') { say('su: Sorry\n'); return; }
        if (sh.priv) { say('su: already root\n'); return; }
        sh.io.out('Password:');
        var spw = sh.io.line(false);
        if (spw === null) return 'exit';
        sh.io.out('\r\n');
        var ok = !!unixAuth(sh.ctx, 'root', spw);
        unixSulog(sh, ok);
        if (ok) {
            sh.priv = true;
            sh.who = unixWho(sh.w, sh.user, true);
            var rep = breakIn(sh.ctx.p, sh.ctx.host, true);
            if (rep) sh.io.reward(rep, 'root');
        } else {
            say('su: Sorry\n');
            failedLogin(sh.ctx);
        }
    },
    passwd: function (sh, a, say) {
        if (sh.priv && (!a[0] || a[0] === 'root')) return unixRootPasswd(sh, say);
        sh.io.out('Changing password for ' + sh.who.user + '\r\nOld password:');
        if (sh.io.line(false) === null) return 'exit';
        sh.io.out('\r\nNew password:');
        if (sh.io.line(false) === null) return 'exit';
        sh.io.out('\r\nRe-enter new password:');
        if (sh.io.line(false) === null) return 'exit';
        sh.io.out('\r\n');
        say('passwd: password file busy - try again later.\n');
    },
    mail: function (sh, a, say) { return unixMail(sh, a, say); },
    write: function (sh, a, say) { return unixWriteTo(sh, a, say); },
    talk: function (sh, a, say) { return unixWriteTo(sh, a, say); },
    rlogin: function (sh, a, say) { return unixRlogin(sh, a, say); },
    rsh: function (sh, a, say) { return unixRlogin(sh, a, say); },
    sync: function () {},
    ed: function (sh, a) { return unixEd(sh, a.filter(function (x) { return x !== '-'; })[0]); },
    nidump: function (sh, a, say) { return unixNidump(sh, a, say); },
    niutil: function (sh, a, say) { return unixNiutil(sh, a, say); },
    udbsee: function (sh, a, say) { return unixUdbsee(sh, a, say); },
};

//  NeXT: NetInfo hands its maps to anyone who asks, passwords and all
//  passwd as root: root's password is theirs now, and whoever had it can't
//  su any more. The password file shows the new one to Crack.
function unixRootPasswd(sh, say) {
    var io = sh.io;
    io.out('New password:');
    var p1 = io.line(false);
    if (p1 === null) return 'exit';
    io.out('\r\nRe-enter new password:');
    var p2 = io.line(false);
    if (p2 === null) return 'exit';
    io.out('\r\n');
    if (p1 !== p2) { say('They don\'t match; try again.\n'); return; }
    if (!p1) { say('Password unchanged.\n'); return; }
    var w = sh.w;
    keepSetPassword(sh.ctx, 'root', p1);
    sh.ctx.ov.pw.root = p1;
    var old = unixCrypt(w.h.num + '|root|' + w.rootNow);
    w.rootNow = p1;
    //  the password file as it is now, generated or kept
    ['/etc/passwd', '/etc/shadow'].forEach(function (path) {
        var look = fsLook(sh.fs, '/', path, { root: true });
        if (!look.node || typeof look.node.text === 'function') return;
        var t = look.node.text.replace(old, unixCrypt(w.h.num + '|root|' + p1));
        if (t !== look.node.text) {
            look.node.text = t;
            keepMark(sh.fs, look.path);
        }
    });
    io.say('Root\'s password is yours now. Anyone holding the old one is locked out of su. Careful what you leave behind.');
}

function unixNidump(sh, a, say) {
    if (sh.fl !== 'next') { say('sh: nidump: not found\n'); return; }
    var map = a[0];
    if (!map || (a[1] !== '.' && a[1] !== '/')) { say('usage: nidump [-t] {format | -r directory} domain\n'); return; }
    if (map === 'passwd') {
        say(unixPasswd(sh.w, false));
        sh.after = (sh.after || []).concat([function (c, io) {
            gotLoot(c, io, '/etc/passwd');
            io.say('Every account and its encrypted password, out of NetInfo. Crack can work on it.');
        }]);
    } else if (map === 'group') {
        say(unixGroup(sh.w));
    } else if (map === 'hosts') {
        var hosts = fsLook(sh.fs, '/', '/etc/hosts', { root: true }).node;
        say(hosts && !hosts.dir ? fsText(hosts) : '');
    } else {
        say('nidump: unknown format ' + map + '\n');
    }
}

function unixNiutil(sh, a, say) {
    if (sh.fl !== 'next') { say('sh: niutil: not found\n'); return; }
    if (a[0] !== '-list' || !a[1] || !a[2]) { say('usage: niutil -list domain path\n'); return; }
    if (a[2] === '/users') {
        unixPasswd(sh.w, false).split('\n').filter(function (l) { return l; }).forEach(function (l, i) {
            say(padStart(String(i + 10), 3) + '  ' + l.split(':')[0] + '\n');
        });
    } else if (a[2] === '/') {
        ['users', 'groups', 'machines', 'networks', 'printers', 'mounts', 'aliases'].forEach(function (d, i) { say(padStart(String(i + 1), 3) + '  ' + d + '\n'); });
    } else {
        say(a[2] + ': not found\n');
    }
}

//  UNICOS: the user database, for root
function unixUdbsee(sh, a, say) {
    if (sh.fl !== 'unicos') { say('sh: udbsee: not found\n'); return; }
    if (!sh.who.root) { say('udbsee: cannot open /etc/udb: Permission denied\n'); return; }
    unixPasswd(sh.w, false).split('\n').filter(function (l) { return l; }).forEach(function (l) {
        var f = l.split(':');
        say('name:' + f[0] + ':uid:' + f[2] + ':passwd:' + f[1] + ':gids:' + f[3] + ':dir:' + f[5] + ':\n');
    });
    sh.after = (sh.after || []).concat([function (c, io) {
        gotLoot(c, io, '/etc/passwd');
        io.say('The user database: every account on the Cray, password and all.');
    }]);
}

//  A length of time as last shows it: (hh:mm)
function unixSpan(ms) {
    var m = Math.max(0, Math.round(ms / 60000));
    var h = Math.floor(m / 60);
    m %= 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function unixHeadTail(sh, a, say, head) {
    var n = 10;
    var rest = [];
    for (var i = 0; i < a.length; i++) {
        if (/^-\d+$/.test(a[i])) n = parseInt(a[i].slice(1), 10);
        else if (a[i] === '-n' && /^\d+$/.test(a[i + 1] || '')) n = parseInt(a[++i], 10);
        else rest.push(a[i]);
    }
    rest.forEach(function (path) {
        var got = unixRead(sh, head ? 'head' : 'tail', path, say);
        if (!got) return;
        var lines = (got.text === null ? unixGarbage(got.node) : got.text).replace(/\n$/, '').split('\n');
        say((head ? lines.slice(0, n) : lines.slice(-n)).join('\n') + '\n');
    });
}

function unixCopy(sh, a, say, move) {
    var cmd = move ? 'mv' : 'cp';
    if (a.length !== 2) { say('Usage: ' + cmd + ' f1 f2\n'); return; }
    if (a[0] === '/dev/null' && /\/adm\/wtmp$/.test(fsAbs(sh.cwd, a[1], sh.fs.home))) {
        unixWrite(sh, a[1], '', false);
        return;
    }
    var src = fsLook(sh.fs, sh.cwd, a[0], sh.who);
    if (src.err || !src.node) { say(cmd + ': cannot access ' + a[0] + '\n'); return; }
    if (src.node.dir) { say(cmd + ': ' + a[0] + ': is a directory\n'); return; }
    if (!fsCan(src.node, sh.who, 'r')) { say(cmd + ': cannot open ' + a[0] + '\n'); return; }
    var dst = fsLook(sh.fs, sh.cwd, a[1], sh.who);
    var to = a[1];
    if (dst.node && dst.node.dir) to = a[1].replace(/\/$/, '') + '/' + src.name;
    if (move && !fsCan(src.parent, sh.who, 'w')) { say('mv: cannot unlink ' + a[0] + '\n'); return; }
    if (src.node.onRead) sh.after = (sh.after || []).concat([src.node.onRead]);
    var text = src.node.type === 'text' ? fsText(src.node) : '';
    if (!unixWrite(sh, to, text, false)) return;
    if (move) {
        delete src.parent.kids[src.name];
        keepMark(sh.fs, src.path);
    }
}

function unixWhoList(sh, say, how) {
    var w = sh.w;
    var t = era().unix;
    var list = w.peers.slice(0, Math.min(4, w.h.users)).filter(function (n) { return n !== sh.user; });
    if (how !== 'who') say(fit('Login', 9) + fit('TTY', 9) + 'Idle   What\n');
    if (adminOnline(sh.ctx)) say(fit(w.boss, 9) + fit('console', 9) + (how === 'who' ? t.slice(4, 16) : '   0   vi /etc/passwd') + '\n');
    list.forEach(function (n, i) {
        say(fit(n, 9) + fit('tty' + i + 'a', 9) + (how === 'who' ? t.slice(4, 16) : padStart(String(i * 7), 4) + '   -sh') + '\n');
    });
    //  other callers on this machine right now, under the account they used
    keepOthersOn(sh.ctx.seed, w.h.num).forEach(function (x) {
        say(fit(x.u, 9) + fit(x.tty, 9) + (how === 'who' ? t.slice(4, 11) + keepClock(x.on) : '   0   -sh') + '\n');
    });
    say(fit(sh.user, 9) + fit(sh.tty || 'tty0a', 9) + (how === 'who' ? t.slice(4, 11) + keepClock(sh.on || nowMs()) : '   0   -sh') + '\n');
}

//  mail: the caller's mailbox, a message at a time, or a message to send
function unixMail(sh, a, say) {
    var io = sh.io;
    if (a.length) {
        io.out(unixLines('Subject: '));
        var subj = io.line(true);
        if (subj === null) return 'exit';
        var body = [];
        for (;;) {
            var l = io.line(true);
            if (l === null) return 'exit';
            if (l === '.' || l === '\x04') break;
            body.push(l);
        }
        if (a[0] === sh.w.boss) addHeat(sh.ctx.p, 2);
        if (!unixKnownUser(sh, a[0])) { say(a[0] + '... User unknown\n'); return; }
        //  it waits there for whoever logs in as them, players included
        if (a[0] !== sh.w.boss) keepSendMail(sh.ctx, a[0], sh.who.user, subj.slice(0, 60), body.join('\n').slice(0, 1000));
        return;
    }
    var box = fsLook(sh.fs, '/', sh.w.lay.mail + '/' + sh.who.user, { root: true }).node;
    //  mail to the name they logged in under, too, when that's a uid 0 backdoor
    var text = (box ? fsText(box) : '') + unixPlayerMail(sh, sh.who.user) + (sh.user !== sh.who.user ? unixPlayerMail(sh, sh.user) : '');
    var msgs = text.split(/\n(?=From )/).filter(function (m) { return /^From /.test(m); });
    if (!msgs.length) { say('No mail.\n'); return; }
    var head = function () {
        var s = '';
        msgs.forEach(function (m, i) {
            var from = /^From (\S+)/.exec(m)[1];
            var subj = (/\nSubject: (.*)/.exec(m) || ['', ''])[1];
            s += (i === 0 ? '>' : ' ') + padStart(String(i + 1), 2) + ' ' + fit(from, 12) + fit(subj, 40) + '\n';
        });
        return s;
    };
    io.out(unixLines('mail version 5.2.  Type ? for help.\n' + head()));
    var cur = 0;
    for (;;) {
        io.out('& ');
        var c = io.line(true);
        if (c === null) return 'exit';
        c = c.trim();
        if (c === 'q' || c === 'x') return;
        if (c === 'h') { io.out(unixLines(head())); continue; }
        if (c === '?') { io.out(unixLines('<n>  read message n\n<CR> next message\nh    headers\nd    delete\nq    quit\n')); continue; }
        if (c === 'd') { io.out(unixLines('deleted.\n')); continue; }
        var n = /^\d+$/.test(c) ? parseInt(c, 10) - 1 : c === '' || c === 'n' || c === 'p' ? cur : -1;
        if (n < 0 || n >= msgs.length) { io.out(unixLines(c === '' ? 'At EOF\n' : 'Unknown command: "' + c + '"\n')); continue; }
        io.out(unixLines('Message ' + (n + 1) + ':\n' + msgs[n].replace(/\nStatus: R\n/, '\n')));
        if (box && box.onRead) { box.onRead(sh.ctx, io); box.onRead = null; }
        if (sh.w.way === 'mail' && /root password/.test(msgs[n])) unixWaySay(io);
        cur = n + 1;
    }
}

//  Whether the host has an account called user: in its password file, a
//  backdoor, or one a caller used
function unixKnownUser(sh, user) {
    var w = sh.w;
    if (user === 'root' || w.staff.indexOf(user) >= 0) return true;
    if (unixSystemUsers(w.lay).some(function (u) { return u[0] === user; })) return true;
    if (unixBackdoors(sh.ctx.ov)[user]) return true;
    return keepSeen(sh.ctx.seed, w.h.num).some(function (x) { return x.u === user; });
}

//  Mail callers sent to user on this host, as the mailbox holds it
function unixPlayerMail(sh, user) {
    var t = era().unix;
    return keepMail(sh.ctx.seed, sh.w.h.num).filter(function (m) { return m.to === user; }).map(function (m) {
        return '\nFrom ' + m.from + ' ' + t.slice(0, 11) + keepClock(m.at) + ' 1993\nTo: ' + m.to + '\nSubject: ' + m.subj + '\n\n' + m.body + '\n';
    }).join('');
}

function unixWriteTo(sh, a, say) {
    if (!a[0]) { say('usage: write user [ttyname]\n'); return; }
    //  another player on as them: lines until a period or ^D, then EOF
    if (keepOthersOn(sh.ctx.seed, sh.w.h.num).some(function (x) { return x.u === a[0]; })) {
        var lines = [];
        for (;;) {
            var l = sh.io.line(true);
            if (l === null) return 'exit';
            if (l === '.' || l === '\x04') break;
            lines.push(l);
        }
        if (lines.length && !keepWriteTo(sh.ctx, a[0], sh.user, sh.tty, lines.join('\n'))) say('write: ' + a[0] + ' is not logged on.\n');
        return;
    }
    if (a[0] !== sh.w.boss) { say('write: ' + a[0] + ' has messages disabled\n'); return; }
    var msg = sh.io.line(true);
    if (msg === null) return 'exit';
    if (bluff(sh.ctx, sh.io, msg)) return 'exit';
}

function unixRlogin(sh, a, say) {
    var w = sh.w;
    var to = a[0] || '';
    var li = a.indexOf('-l');
    var as = li >= 0 && a[li + 1] ? a[li + 1] : sh.who.user;
    if (!w.sister || to !== w.sisterName) {
        //  a machine a player opened with a .rhosts of + +
        var num = to ? unixTrusting(sh, to, as) : '';
        if (!num) {
            say(to ? (unixFoundNamed(sh, to) ? 'Permission denied.\n' : to + ': unknown host\n') : 'usage: rlogin host [ -l username ]\n');
            if (to && unixFoundNamed(sh, to)) failedLogin(sh.ctx);
            return;
        }
        var th = hostAtNum(sh.ctx, num, 'unix');
        th.accounts = th.accounts.concat((sh.ctx.p.cracked || {})[num] || []);
        sh.ctx.p.hops = (sh.ctx.p.hops || 0) + 1;
        runUnix({ p: sh.ctx.p, host: th, seed: sh.ctx.seed }, sh.io, [as, '', as === 'root']);
        if (sh.io.over) return 'exit';
        say('Connection closed.\n');
        return;
    }
    if (as === 'root' && !sh.priv && !unixTrusting(sh, to, as)) {
        say('Permission denied.\n');
        failedLogin(sh.ctx);
        return;
    }
    var nh = hostAtNum(sh.ctx, w.sister, 'unix');
    var sctx = { p: sh.ctx.p, host: nh, seed: sh.ctx.seed };
    var rep2 = identify(sh.ctx.p, w.sister, 'unix');
    if (rep2) sh.io.reward(rep2, 'new find, UNIX (' + w.sisterName + ')');
    sh.ctx.p.hops = (sh.ctx.p.hops || 0) + 1;
    runUnix(sctx, sh.io, [as, '', as === 'root']);
    if (sh.io.over) return 'exit';
    say('Connection closed.\n');
}

//  The number of a UNIX host on the caller's found list called name
function unixFoundNamed(sh, name) {
    var found = sh.ctx.p.found || {};
    var nums = Object.keys(found).filter(function (n) { return found[n] === 'unix'; });
    for (var i = 0; i < nums.length; i++) {
        if (hostAtNum(sh.ctx, nums[i], 'unix').name.toLowerCase() === name) return nums[i];
    }
    return '';
}

//  The number of host name if it lets user in from anywhere with no
//  password: a .rhosts in user's home, or an /etc/hosts.equiv for anyone
//  but root, with a line of + (or + +, or + user) that a player left there
function unixTrusting(sh, name, user) {
    var num = unixFoundNamed(sh, name) || (name === sh.w.sisterName ? sh.w.sister : '');
    if (!num) return '';
    var ov = keepLoad(sh.ctx.seed, num);
    var th = hostAtNum(sh.ctx, num, 'unix');
    var tw = unixWorld({ p: sh.ctx.p, host: th, seed: sh.ctx.seed, ov: ov });
    var home = user === 'root' ? '' : unixHome(tw, user);
    var plus = function (path, who) {
        var e = ov.p[path];
        if (!e || e.rm) return false;
        return String(e.x || '').split('\n').some(function (l) {
            var f = l.trim().split(/\s+/);
            return f[0] === '+' && (!f[1] || f[1] === '+' || f[1] === who);
        });
    };
    if (plus(home + '/.rhosts', user) || (user !== 'root' && plus('/etc/hosts.equiv', user))) return num;
    return '';
}

//  ed(1), the way a password file was edited by hand: an address, then a
//  command. a, i and c take lines until a lone period. ? is every error.
function unixEd(sh, file) {
    var io = sh.io;
    var out = function (t) { io.out(unixLines(t)); };
    var buf = [];
    var name = file || '';
    if (name) {
        var look = fsLook(sh.fs, sh.cwd, name, sh.who);
        if (look.node && !look.node.dir) {
            var got = unixRead(sh, 'ed', name, function () {});
            if (got && got.text !== null) {
                buf = got.text.replace(/\n$/, '').split('\n');
                if (got.text === '') buf = [];
                out(got.text.length + '\n');
            } else {
                out('?' + name + '\n');
            }
        } else {
            out('?' + name + '\n');
        }
        //  what reading it gave (loot, a lead) comes now, not after ed
        if (sh.after) {
            var after = sh.after;
            sh.after = null;
            after.forEach(function (f) { f(sh.ctx, io); });
        }
    }
    var cur = buf.length;
    var dirty = false;
    var warned = false;
    var input = function () {
        var lines = [];
        for (;;) {
            var l = io.line(true);
            if (l === null) return null;
            if (l === '.') return lines;
            lines.push(l);
        }
    };
    //  one address: a number, . $ +n -n or /re/; null when there is none
    var addr = function (t) {
        var m;
        if ((m = /^(\d+)/.exec(t))) return { n: parseInt(m[1], 10), rest: t.slice(m[0].length) };
        if (t.charAt(0) === '.') return { n: cur, rest: t.slice(1) };
        if (t.charAt(0) === '$') return { n: buf.length, rest: t.slice(1) };
        if ((m = /^([+-])(\d*)/.exec(t)) && m[0]) return { n: cur + (m[1] === '+' ? 1 : -1) * (m[2] ? parseInt(m[2], 10) : 1), rest: t.slice(m[0].length) };
        if ((m = /^\/([^/]*)\/?/.exec(t))) {
            var re;
            try { re = new RegExp(m[1]); } catch (e) { return { err: true }; }
            for (var k = 1; k <= buf.length; k++) {
                var at = ((cur + k - 1) % buf.length) + 1;
                if (re.test(buf[at - 1])) return { n: at, rest: t.slice(m[0].length) };
            }
            return { err: true };
        }
        return null;
    };
    for (;;) {
        var c = io.line(true);
        if (c === null) return 'exit';
        var t = c.trim();
        var from = undefined;
        var to = undefined;
        var bad = function () { out('?\n'); };
        if (t.charAt(0) === ',') {
            from = 1; to = buf.length; t = t.slice(1);
        } else {
            var a1 = addr(t);
            if (a1 && a1.err) { bad(); continue; }
            if (a1) {
                from = to = a1.n; t = a1.rest;
                if (t.charAt(0) === ',') {
                    var a2 = addr(t.slice(1));
                    if (!a2 || a2.err) { bad(); continue; }
                    to = a2.n; t = a2.rest;
                }
            }
        }
        var cmd = t.charAt(0);
        var arg = t.slice(1).trim();
        var given = from !== undefined;
        if (!given) { from = to = cur; }
        if (from < 0 || to > buf.length || from > to) { bad(); continue; }
        if (cmd === '') {
            //  an address alone prints that line; Enter alone the next
            if (!given) { from = to = cur + 1; }
            if (to < 1 || to > buf.length) { bad(); continue; }
            cur = to;
            out(buf[cur - 1] + '\n');
        } else if (cmd === 'p' || cmd === 'n' || cmd === 'l') {
            if (from < 1) { bad(); continue; }
            //  n: the number, padded to the next tab stop as a terminal shows it
            for (var i = from; i <= to; i++) out((cmd === 'n' ? fit(String(i), 8) : '') + buf[i - 1] + (cmd === 'l' ? '$' : '') + '\n');
            cur = to;
        } else if (cmd === 'a' || cmd === 'i' || cmd === 'c') {
            if ((cmd !== 'a' && from < 1) || (cmd === 'c' && !buf.length)) { bad(); continue; }
            var lines = input();
            if (lines === null) return 'exit';
            var at0 = cmd === 'a' ? to : cmd === 'i' ? Math.max(0, to - 1) : from - 1;
            if (cmd === 'c') buf.splice(from - 1, to - from + 1);
            buf.splice.apply(buf, [at0, 0].concat(lines));
            cur = at0 + lines.length || at0;
            dirty = true;
        } else if (cmd === 'd') {
            if (from < 1) { bad(); continue; }
            buf.splice(from - 1, to - from + 1);
            cur = Math.min(from, buf.length);
            dirty = true;
        } else if (cmd === 's') {
            var sm = /^(.)(.*?)\1(.*?)(?:\1(g?))?$/.exec(t.slice(1));
            if (!sm || from < 1) { bad(); continue; }
            var sre;
            try { sre = new RegExp(sm[2], sm[4] ? 'g' : ''); } catch (e) { bad(); continue; }
            var hit = false;
            for (var j = from; j <= to; j++) {
                if (sre.test(buf[j - 1])) {
                    sre.lastIndex = 0;
                    buf[j - 1] = buf[j - 1].replace(sre, sm[3].replace(/&/g, '$&'));
                    cur = j;
                    hit = true;
                }
                sre.lastIndex = 0;
            }
            if (!hit) { bad(); continue; }
            dirty = true;
        } else if (cmd === '=') {
            out((given ? to : buf.length) + '\n');
        } else if (cmd === 'w') {
            //  wq: write, then quit
            var thenQuit = arg.charAt(0) === 'q';
            if (thenQuit) arg = arg.slice(1).trim();
            var wname = arg || name;
            if (!wname) { bad(); continue; }
            var text = buf.length ? buf.join('\n') + '\n' : '';
            if (!unixWrite(sh, wname, text, false)) continue;
            if (/\/adm\/wtmp$/.test(fsAbs(sh.cwd, wname, sh.fs.home)) && !text) cleaned(sh.ctx, io);
            name = name || wname;
            dirty = false;
            out(text.length + '\n');
            if (thenQuit) return;
        } else if (cmd === 'q' || cmd === 'Q') {
            if (cmd === 'q' && dirty && !warned) { warned = true; bad(); continue; }
            return;
        } else if (cmd === 'f') {
            if (arg) name = arg;
            out(name + '\n');
        } else {
            bad();
        }
    }
}
// ---- end lib/carrier_unix.js ----
// ---- lib/carrier_vms.js ----
//
//  CARRiER's VAX/VMS hosts (phase 6): a disk laid out as VMS laid it out and
//  DCL working on it.
//
//  The disk is DUA0:. The system's own directories are under the system
//  root, SYS$SYSROOT: ([SYSMGR], [SYSEXE], [SYSHLP] ...), reached by their
//  logical names (SYS$MANAGER:, SYS$SYSTEM:). Users have a directory each
//  at the top, DUA0:[JSMITH]. Files have a type and a version
//  (LOGIN.COM;1) and a protection for system, owner, group and world.
//  In the tree (carrier_fs.js) a directory [A.B] is /A/B, a file is keyed
//  by NAME.TYPE, and R, W (and D) and E are the r, w and x of its mode.
//
//  The three things to find (docs/design.md):
//    * the way up: the privileged account and its password, in one of
//      several places chosen per host (a mail message, a command file with
//      an access control string in it, a user's list of passwords). The
//      caller's mail points the way.
//    * leads: SYS$MANAGER:MODEMS.LIS (privileged), the operator's mail
//      about the backup node, a user's phone list, the DECnet nodes
//    * loot: the user authorization file, through AUTHORIZE (privileged),
//      and the file the organization would least want taken
//

var VMS_WAYS = ['mail', 'com', 'stuff'];

//  Accounts with a directory of their own under the system root, or a
//  special one; the rest get DUA0:[NAME]
var VMS_HOMES = { SYSTEM: '/SYS0/SYSMGR', SYSMGR: '/SYS0/SYSMGR', FIELD: '/SYS0/SYSMAINT', SYSTEST: '/SYSTEST',
    DECNET: '/DECNET', OPERATIONS: '/SYS0/SYSMGR' };

//  Logical names: [path, rooted]. A rooted one is a device: a directory in
//  brackets after it is from its top.
var VMS_LOGICALS = {
    'SYS$MANAGER': '/SYS0/SYSMGR', 'SYS$SYSTEM': '/SYS0/SYSEXE', 'SYS$HELP': '/SYS0/SYSHLP', 'SYS$LIBRARY': '/SYS0/SYSLIB',
    'SYS$ERRORLOG': '/SYS0/SYSERR', 'SYS$UPDATE': '/SYS0/SYSUPD', 'SYS$MAINTENANCE': '/SYS0/SYSMAINT',
};
var VMS_DEVICES = { 'SYS$SYSROOT': '/SYS0', 'SYS$SYSDEVICE': '/', 'SYS$DISK': '', 'DUA0': '/', '_DUA0': '/', 'DISK$USER': '/' };

function vmsWorld(ctx) {
    var h = ctx.host;
    var r = rng(hash32(ctx.seed + '|vms|' + h.num));
    var staff = someUsers(h, 8).filter(function (n) { return ['operator', 'field', 'admin'].indexOf(n) < 0; })
        .slice(0, 5).map(function (n) { return n.toUpperCase(); });
    var w = { h: h, r: r, kind: 'vms', staff: staff, boss: staff[0], peers: staff.slice(1), name: h.name, real: {} };
    staff.forEach(function (n) {
        w.real[n] = pick(r, UNIX_FIRST) + ' ' + pick(r, UNIX_LAST);
    });
    w.way = pick(r, VMS_WAYS);
    w.stuffUser = w.peers[0];
    w.phonesUser = w.peers[1];
    w.nodes = neighbours(ctx.seed, h, 'vms', 2).map(function (num) {
        return { num: num, name: hostAtNum(ctx, num, 'vms').name };
    });
    w.secret = h.secret;
    return w;
}

//  A date as VMS shows it: 7-NOV-1993 14:02
function vmsDate(daysAgo, r) {
    var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    var now = new Date();
    var d = new Date(1993, now.getMonth(), now.getDate() - daysAgo, 0, 0, 0);
    var hh = r ? Math.floor(r() * 24) : 9;
    var mm = r ? Math.floor(r() * 60) : 14;
    return padStart(String(d.getDate()), 2) + '-' + MON[d.getMonth()] + '-1993 ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}

function vmsFile(own, grp, mode, text, days, type) {
    var f = fsFile(own, grp, mode, text, vmsDate(days, function () { return (hash32(own + days) % 1000) / 1000; }), type);
    f.ver = 1 + hash32(String(own) + days) % 4;
    return f;
}

//  ---- the generated text ----

function vmsMsg(from, to, subj, body, days) {
    return { from: from, to: to, subj: subj, body: body, days: days || 0 };
}

//  The caller's mail: a notice, the mail that points the way up (or is it),
//  the operator's word on the backup node, and chatter
function vmsMyMail(w, user, ctx) {
    var n = w.name;
    var boss = n + '::' + w.boss;
    var peer = n + '::' + w.peers[0];
    var box = [vmsMsg(boss, user, 'Disk quota', 'You are over your disk quota on DUA0:.  PURGE your directory\nor I will do it for you.\n\n' + w.boss, 3)];
    if (w.way === 'mail') {
        box.push(vmsMsg(boss, 'STAFF', 'Audit', 'The ' + w.secret[0] + ' account is ' + w.secret[1] + ' until the auditors leave.\nDo NOT give it out.  Change FIELD while you\'re at it.', 2));
    } else if (w.way === 'com') {
        box.push(vmsMsg(peer, user, 'Backups', 'The nightly backup goes over DECnet now.  ' + w.boss + ' put the command\nfile in DUA0:[BACKUP] where everybody can read it.  Brilliant.', 2));
    } else {
        box.push(vmsMsg(boss, w.stuffUser + ',' + user, 'Passwords', w.stuffUser + ', get that list of passwords out of your directory.\nI am not asking again.\n\n' + w.boss, 4));
    }
    var leads = leadsOf(ctx, 2);
    var op = vmsMsg(n + '::OPERATOR', user, 'Backup node', leads[0] ? 'If ' + n + ' is down, the backup node dials in at\n' + fmtNum(leads[0]) + '.' : 'Backup node is down for the week.', 1);
    if (leads[0]) op.lead = leads[0];
    box.push(op);
    var chat = UNIX_CHAT[w.h.prof] || UNIX_CHAT.biz;
    var c = chat[hash32(w.h.num + user) % chat.length];
    box.push(vmsMsg(n + '::' + (w.peers[1] || w.boss), user, c[0].charAt(0).toUpperCase() + c[0].slice(1), c[1], 0));
    return box;
}

function vmsTheirMail(w, user) {
    var chat = UNIX_CHAT[w.h.prof] || UNIX_CHAT.biz;
    var box = [];
    for (var i = 0; i < 2; i++) {
        var c = chat[(hash32(w.h.num + user) + i) % chat.length];
        box.push(vmsMsg(w.name + '::' + w.staff[(w.staff.indexOf(user) + i + 1) % w.staff.length], user, c[0], c[1], 5 - i));
    }
    if (user === w.boss) {
        box.push(vmsMsg(w.name + '::SYSTEM', user, 'BATCH job NIGHTLY', 'Job NIGHTLY (queue SYS$BATCH, entry 412) terminated with error status\n%COPY-E-OPENOUT, error opening remote file as output\n-SYSTEM-F-LINKDISCON, network partner disconnected logical link', 1));
    }
    return box;
}

//  A MAIL.MAI file as TYPE shows it: the messages' text, with the indexed
//  file's own bytes between them
function vmsMailFile(msgs) {
    var junk = function (s) {
        var r = rng(hash32(s));
        var o = '';
        for (var i = 0; i < 12; i++) o += String.fromCharCode(33 + Math.floor(r() * 90));
        return o;
    };
    return msgs.map(function (m) {
        return junk(m.subj) + '\nFrom:   ' + m.from + '\nTo:     ' + m.to + '\nSubj:   ' + m.subj + '\n\n' + m.body + '\n';
    }).join('') + junk('end') + '\n';
}

//  ---- the tree ----

function vmsTree(ctx) {
    var w = vmsWorld(ctx);
    var r = w.r;
    var old = function () { return 200 + Math.floor(r() * 400); };
    var recent = function () { return 1 + Math.floor(r() * 60); };
    var root = fsDir('SYSTEM', 'SYSTEM', 'rwxr-xr-x', vmsDate(old()));
    var put = function (path, node) { return fsPut(root, path, node); };
    var dir = function (path, own, grp, mode) {
        var have = fsLook({ root: root, home: '/' }, '/', path, { root: true }, true).node;
        if (have && have.dir) return have;
        var d = put(path, fsDir(own || 'SYSTEM', grp || 'SYSTEM', mode || 'rwxr-xr-x', vmsDate(old(), r)));
        d.ver = 1;
        return d;
    };
    var exe = function (path, size, strs) {
        var f = put(path, vmsFile('SYSTEM', 'SYSTEM', 'rwxr-xr-x', '', old(), 'exec'));
        f.size = size;
        f.strs = strs || [];
        return f;
    };

    //  the system root
    ['/SYS0', '/SYS0/SYSEXE', '/SYS0/SYSLIB', '/SYS0/SYSHLP', '/SYS0/SYSERR', '/SYS0/SYSUPD'].forEach(function (p) { dir(p); });
    dir('/SYS0/SYSMGR', 'SYSTEM', 'SYSTEM', 'rwxr-x---');
    dir('/SYS0/SYSMAINT', 'SYSTEM', 'SYSTEM', 'rwxr-x---');
    var uaf = put('/SYS0/SYSEXE/SYSUAF.DAT', vmsFile('SYSTEM', 'SYSTEM', 'rw-------', '', recent(), 'data'));
    uaf.size = 60000 + Math.floor(r() * 30000);
    uaf.repeat = true;
    uaf.onRead = function (c, io) { io.say('The user authorization file. It\'s binary: AUTHORIZE is how you read it.'); };
    ['NETUAF.DAT', 'RIGHTSLIST.DAT', 'NETPROXY.DAT'].forEach(function (f) {
        put('/SYS0/SYSEXE/' + f, vmsFile('SYSTEM', 'SYSTEM', 'rw-------', '', old(), 'data')).size = 3000 + Math.floor(r() * 9000);
    });
    exe('/SYS0/SYSEXE/AUTHORIZE.EXE', 41472, ['UAF>', 'SYSUAF.DAT', '%UAF-I-ADDMSG', 'Default Privileges:']);
    exe('/SYS0/SYSEXE/LOGINOUT.EXE', 52736, ['Username: ', 'Password: ', 'User authorization failure', 'SYS$ANNOUNCE']);
    exe('/SYS0/SYSEXE/MAIL.EXE', 175104, ['MAIL> ', 'You have %UL new message%S', 'MAIL.MAI']);
    exe('/SYS0/SYSEXE/PHONE.EXE', 48128, ['%PHONE-W-NOSUCHUSER', 'Press any key to cancel the call']);
    exe('/SYS0/SYSEXE/SYS.EXE', 1100800, ['VAX/VMS', 'SYSBOOT>', w.name]);
    exe('/SYS0/SYSEXE/EDT.EXE', 199680, ['Input file does not exist', '[EOB]']);
    exe('/SYS0/SYSLIB/DCLTABLES.EXE', 214016, ['DIRECTORY', 'SET', 'SHOW']);
    put('/SYS0/SYSHLP/HELPLIB.HLB', vmsFile('SYSTEM', 'SYSTEM', 'rw-r--r--', '', old(), 'data')).size = 860000;
    put('/SYS0/SYSERR/ERRLOG.SYS', vmsFile('SYSTEM', 'SYSTEM', 'rw-------', '', 0, 'data')).size = 21000 + Math.floor(r() * 20000);

    //  the system manager's directory
    var acc = put('/SYS0/SYSMGR/ACCOUNTNG.DAT', vmsFile('SYSTEM', 'SYSTEM', 'rw-------', '', 0, 'data'));
    acc.size = 90000 + Math.floor(r() * 60000);
    var mods = put('/SYS0/SYSMGR/MODEMS.LIS', vmsFile('SYSTEM', 'SYSTEM', 'rw-------', function () {
        return '  ' + w.h.org.toUpperCase() + ' -- DIAL-UP MODEM POOL\n\n' + leadsOf(ctx, 3).map(function (num, i) {
            return '  ' + fit('TTA' + i + ':', 8) + fmtNum(num) + '   2400 8N1';
        }).join('\n') + '\n';
    }, recent()));
    mods.onRead = function (c, io) {
        gotLeads(c, io, leadsOf(c, 3), 'modems');
        io.say('The modem pool: numbers that answer with a carrier. They\'re on your found list.');
    };
    put('/SYS0/SYSMGR/SYSTARTUP_V5.COM', vmsFile('SYSTEM', 'SYSTEM', 'rw-r-----', '$ ! SYSTARTUP_V5.COM -- site startup\n$ SET NOON\n$ @SYS$MANAGER:STARTNET\n' +
        '$ SET TERMINAL TTA0:/PERMANENT/MODEM/DIALUP/HANGUP/SPEED=2400\n$ SET TERMINAL TTA1:/PERMANENT/MODEM/DIALUP/HANGUP/SPEED=2400\n' +
        '$ ! MODEMS.LIS has the numbers.  Do not hand them out.\n$ START/QUEUE/MANAGER\n$ SUBMIT/AFTER="TOMORROW+02:00" SYS$MANAGER:NIGHTLY.COM\n$ EXIT\n', recent()));
    put('/SYS0/SYSMGR/STARTNET.COM', vmsFile('SYSTEM', 'SYSTEM', 'rw-r-----', '$ RUN SYS$SYSTEM:NCP\nSET EXECUTOR STATE ON\nEXIT\n', old()));
    put('/SYS0/SYSMGR/SYSHUTDWN.COM', vmsFile('SYSTEM', 'SYSTEM', 'rw-r-----', '$ ! site shutdown\n$ EXIT\n', old()));
    put('/SYS0/SYSMGR/OPERATOR.LOG', vmsFile('SYSTEM', 'SYSTEM', 'rw-------', function () {
        var t = era().vms;
        return '%%%%%%%%%%%  OPCOM  ' + t + '  %%%%%%%%%%%\nMessage from user AUDIT$SERVER on ' + w.name + '\nSecurity alarm (SECURITY) and security audit (SECURITY) on ' + w.name + ', system id: 1124\n' +
            'Event type:      Breakin attempt detected\nTerminal name:   TTA1:\nUsername:        SYSTEM\n';
    }, 0));
    put('/SYS0/SYSMGR/LOGIN.COM', vmsFile('SYSTEM', 'SYSTEM', 'rw-r-----', '$ SET TERMINAL/INQUIRE\n$ SET PROMPT="' + w.name + '$ "\n$ SH USERS\n', old()));

    //  the users
    w.staff.forEach(function (n) {
        var priv = n === w.boss || r() < 0.3;
        var hd = dir('/' + n, n, 'STAFF', priv ? 'rwx------' : 'rwxr-x---');
        hd.kids['LOGIN.COM'] = vmsFile(n, 'STAFF', 'rw-r-----', '$ SET TERMINAL/INQUIRE\n$ DIR :== DIRECTORY/SIZE/DATE\n$ SET PROMPT="' + n.slice(0, 1) + n.slice(1).toLowerCase() + '> "\n', old());
        var mm = hd.kids['MAIL.MAI'] = vmsFile(n, 'STAFF', 'rw-------', function () { return vmsMailFile(vmsTheirMail(w, n)); }, recent(), 'text');
        mm.mail = true;
        var plans = UNIX_PLANS[w.h.prof] || UNIX_PLANS.biz;
        hd.kids['TODO.TXT'] = vmsFile(n, 'STAFF', 'rw-r-----', pick(r, plans) + '\n', recent());
    });

    //  the way up
    var boss = '/' + w.boss;
    if (w.way === 'com') {
        var node = w.nodes[0] ? w.nodes[0].name : 'BKUP';
        dir('/BACKUP', w.boss, 'STAFF', 'rwxr-xr-x');
        put('/BACKUP/NIGHTLY.COM', vmsFile(w.boss, 'STAFF', 'rw-r--r--', '$ ! NIGHTLY.COM -- copy the user disk to ' + node + ' over DECnet\n$ ! ' + w.boss + '\n$ SET NOON\n' +
            '$ COPY/LOG DUA0:[*...]*.*;0 ' + node + '"' + w.secret[0] + ' ' + w.secret[1] + '"::DUA1:[BACKUP...]\n$ MAIL/SUBJECT="Backup done" NL: ' + w.boss + '\n$ EXIT\n', recent())).onRead = function (c, io) {
            io.say('An access control string: NODE"user password"::. Whose account, and its password.');
        };
    }
    var sd = dir('/' + w.stuffUser);
    sd.mode = 'rwxr-xr-x';
    sd.kids['PASSWORDS.TXT'] = vmsFile(w.stuffUser, 'STAFF', w.way === 'stuff' ? 'rw-r--r--' : 'rw-------', function () {
        var lines = ['Bank card   ' + (1000 + hash32(w.stuffUser) % 9000), 'Library     ' + w.stuffUser + '1', 'Dialup      ' + pick(rng(hash32(w.stuffUser)), SECRET_WORDS)];
        if (w.way === 'stuff') lines.splice(1, 0, fit(w.secret[0], 12) + w.secret[1] + '   (' + w.boss + ' changed it again)');
        return lines.join('\n') + '\n';
    }, recent());
    if (w.way === 'stuff') {
        sd.kids['PASSWORDS.TXT'].onRead = function (c, io) { io.say('A password, and whose it is. Log in as that account.'); };
    }

    //  a lead: a phone list
    var phoneNums = leadsOf(ctx, 5).slice(3);
    if (w.phonesUser && phoneNums.length) {
        var pd = dir('/' + w.phonesUser);
        pd.mode = 'rwxr-xr-x';
        pd.kids['PHONES.LIS'] = vmsFile(w.phonesUser, 'STAFF', 'rw-r--r--', function () {
            return phoneNums.map(function (num, i) {
                return fit(['Other site', 'Vendor support', 'The plant', 'Remote office'][i % 4], 18) + fmtNum(num).slice(2);
            }).join('\n') + '\n';
        }, recent());
        pd.kids['PHONES.LIS'].onRead = function (c, io) {
            gotLeads(c, io, phoneNums, 'phones');
            io.say('A phone list. If those numbers answer with a carrier, they\'re on your found list now.');
        };
    }

    //  the loot only staff can read
    var prize = unixPrize({ h: w.h });
    if (prize) {
        var where = { edu: ['REGISTRAR', 'GRADES.DAT'], biz: ['PAYROLL', 'PAYROLL.DAT'], gov: ['CONTRACTS', 'INDEX.LIS'], telco: ['FRAME', 'SWITCH.RPT'] }[w.h.prof];
        dir('/' + where[0], w.boss, 'STAFF', 'rwxr-x---');
        put('/' + where[0] + '/' + where[1], vmsFile(w.boss, 'STAFF', 'rw-r-----', prize[2], recent())).onRead = function (c, io) {
            gotLoot(c, io, prize[1], 'prize', 15);
        };
    }
    if (w.h.prof === 'telco') {
        var cz = cosmosNear(ctx.seed, w.h);
        var fd = dir('/FRAME');
        fd.mode = 'rwxr-xr-x';
        fd.kids['NOTES.TXT'] = vmsFile(w.boss, 'STAFF', 'rw-r--r--', function () {
            if (!cz) return 'MLT down again.\n';
            var ca = hostAtNum(ctx, cz, 'cosmos');
            return 'MLT down again.\nCOSMOS is on ' + fmtNum(cz).slice(2) + '. login ' + ca.accounts[0][0] +
                (ca.accounts[0][1] ? ' pw ' + ca.accounts[0][1] : ' (no pw)') + ', wc ' + ca.wc + '\n';
        }, recent());
        fd.kids['NOTES.TXT'].onRead = function (c, io) {
            if (cz) {
                gotLeads(c, io, [cz], 'cosmos');
                io.say('COSMOS: the phone company\'s own database. It\'s on your found list.');
            }
        };
    }
    landTree(ctx, w, root);
    return { root: root, home: '/', w: w };
}

//  The caller's own directory: made if their account has none, with the
//  notes the game has always left there
function vmsMoveIn(fs, user, priv) {
    var home = VMS_HOMES[user] || '/' + user;
    fs.home = home;
    var look = fsLook(fs, '/', home, { root: true });
    //  none, or a player left a file where it was
    if (!look.node || !look.node.dir) {
        var d = fsPut(fs.root, home, fsDir(user, priv ? 'SYSTEM' : 'USERS', 'rwxr-x---', vmsDate(90)));
        d.kids['LOGIN.COM'] = vmsFile(user, d.grp, 'rw-r-----', '$ SET TERMINAL/INQUIRE\n$ SET PROMPT="$ "\n', 90);
    }
    var hd = fsLook(fs, '/', home, { root: true }).node;
    if (!priv) {
        hd.kids['NOTES.TXT'] = vmsFile(user, hd.grp, 'rw-r-----', 'Remember: AUTHORIZE is in SYS$SYSTEM.  MCR AUTHORIZE, then SHOW * at UAF>.\n' +
            'The modem pool list is in SYS$MANAGER.\nTYPE wants the whole name: TYPE NOTES.TXT\n', 12);
    }
    hd.kids['MAIL.MAI'] = hd.kids['MAIL.MAI'] || vmsFile(user, hd.grp, 'rw-------', '', 0, 'text');
    hd.kids['MAIL.MAI'].mail = true;
}

//  ---- file specifications ----

//  DUA0:[USERS.JSMITH] for a directory's path
function vmsDirSpec(abs) {
    var parts = fsSplit(abs);
    if (parts[0] === 'SYS0' && parts.length > 1) {
        return 'SYS$SYSROOT:[' + (parts.length > 1 ? parts.slice(1).join('.') : '000000') + ']';
    }
    return 'DUA0:[' + (parts.length ? parts.join('.') : '000000') + ']';
}

//  A file's name as a listing shows it
function vmsName(key, node) {
    return node.dir ? key + '.DIR;1' : key + ';' + (node.ver || 1);
}

//  Parses a file specification: { dir, name, type, ver, verGiven } (name
//  and type may have * and % in them), or { err, text } when it can't be
//  understood. defs: { name, type } for the parts left out.
function vmsSpec(sh, spec, defs) {
    defs = defs || {};
    var s = String(spec || '').toUpperCase();
    var res = { dir: sh.cwd, verGiven: false, ver: '' };
    if (VMS_LOGICALS[s] || VMS_DEVICES[s] !== undefined || s === 'SYS$LOGIN') {
        s += ':';
    }
    var vm = /;(\*|-?\d*)$/.exec(s);
    if (vm) {
        res.verGiven = true;
        res.ver = vm[1] || '';
        s = s.slice(0, vm.index);
    }
    var dm = /^([A-Z0-9$_]+):/.exec(s);
    var top = /^\/SYS0/.test(sh.cwd) ? '/SYS0' : '/';
    //  Strictly, [JSMITH] from the system manager's directory is under the
    //  system root, where there's no such thing; admins meant DUA0:, and
    //  so do callers
    var loose = !dm;
    if (dm) {
        s = s.slice(dm[0].length);
        if (dm[1] === 'SYS$LOGIN' || dm[1] === 'SYS$SCRATCH') {
            res.dir = sh.fs.home;
        } else if (VMS_LOGICALS[dm[1]]) {
            res.dir = VMS_LOGICALS[dm[1]];
        } else if (VMS_DEVICES[dm[1]] !== undefined) {
            var devTop = VMS_DEVICES[dm[1]] || top;
            if (devTop !== top) {
                top = devTop;
                res.dir = devTop;
            }
        } else {
            return { err: 'dev', dev: dm[1] };
        }
    }
    var bm = /^[\[<]([^\]>]*)[\]>]/.exec(s);
    if (bm) {
        s = s.slice(bm[0].length);
        var d = bm[1];
        var base;
        if (/\*|\.\.\./.test(d)) {
            //  wildcards in the directory: [*], [*...], [...], [USERS...]
            var toks = d.replace(/\.\.\./g, '.~').split('.').filter(function (x) { return x !== '' && x !== '000000'; });
            res.dirPat = toks;
            res.dir = d.charAt(0) === '.' || d.indexOf('...') === 0 ? res.dir : loose ? '/' : top;
            d = '';
            base = fsSplit(res.dir);
        } else
        if (d === '' || d === '-' || /^[.-]/.test(d)) {
            base = fsSplit(res.dir);
            while (d.charAt(0) === '-') {
                base.pop();
                d = d.slice(1).replace(/^\./, '');
            }
            d = d.replace(/^\./, '');
        } else if (d === '000000') {
            base = fsSplit(top);
            d = '';
        } else {
            base = fsSplit(top);
        }
        res.dir = '/' + base.concat(d ? d.split('.') : []).join('/');
        if (loose && top === '/SYS0' && !/^[.-]/.test(bm[1]) && bm[1] !== '' && bm[1] !== '000000' &&
            !fsLook(sh.fs, '/', res.dir, { root: true }).node) {
            res.dir = '/' + (d ? d.split('.') : []).join('/');
        }
    }
    if (/[\[\]<>:]/.test(s)) {
        return { err: 'syntax' };
    }
    var dot = s.indexOf('.');
    res.name = (dot < 0 ? s : s.slice(0, dot)) || defs.name || '';
    res.type = dot < 0 ? (defs.type !== undefined ? defs.type : '') : s.slice(dot + 1);
    if (dot >= 0 && res.type === '' && defs.type === '*' && !res.name) res.type = '*';
    return res;
}

//  The full spec of what a parsed spec names, as an error message gives it
function vmsShowSpec(sp) {
    return vmsDirSpec(sp.dir) + (sp.name || '') + '.' + (sp.type || '') + ';' + (sp.ver || '');
}

//  A spec with wildcards in its directory, as one spec per directory it
//  names (those the caller may look in)
function vmsExpand(sh, sp) {
    if (sp.err || !sp.dirPat) return [sp];
    var paths = [sp.dir];
    sp.dirPat.forEach(function (tok) {
        var next = [];
        paths.forEach(function (pth) {
            var d = fsLook(sh.fs, '/', pth, sh.who);
            if (!d.node || !d.node.dir || !fsCan(d.node, sh.who, 'x')) return;
            if (tok === '~') {
                var walk = function (p2, node, depth) {
                    next.push(p2);
                    if (depth > 6 || !fsCan(node, sh.who, 'r') || !fsCan(node, sh.who, 'x')) return;
                    Object.keys(node.kids).sort().forEach(function (k) {
                        if (node.kids[k].dir) walk((p2 === '/' ? '' : p2) + '/' + k, node.kids[k], depth + 1);
                    });
                };
                walk(pth, d.node, 0);
                return;
            }
            if (!fsCan(d.node, sh.who, 'r')) return;
            var re = vmsPattern(tok);
            Object.keys(d.node.kids).sort().forEach(function (k) {
                if (d.node.kids[k].dir && re.test(k)) next.push((pth === '/' ? '' : pth) + '/' + k);
            });
        });
        paths = next;
    });
    return paths.map(function (pth) {
        var c = {};
        for (var k in sp) c[k] = sp[k];
        c.dir = pth;
        c.dirPat = null;
        c.many = true;
        return c;
    });
}

function vmsPattern(s) {
    return fsPattern(String(s).replace(/%/g, '?'));
}

//  The files in a parsed spec's directory that it matches: [[key, node]].
//  Or { err: 'DNF' | 'PRV' }.
function vmsMatches(sh, sp) {
    var d = fsLook(sh.fs, '/', sp.dir, sh.who);
    if (d.err === 'denied') return { err: 'PRV' };
    if (!d.node || !d.node.dir) return { err: 'DNF' };
    if (!fsCan(d.node, sh.who, 'x')) return { err: 'PRV' };
    if (!fsCan(d.node, sh.who, 'r') && /[*%]/.test(sp.name + sp.type)) return { err: 'PRV' };
    var nre = vmsPattern(sp.name);
    var tre = vmsPattern(sp.type);
    var list = [];
    Object.keys(d.node.kids).sort().forEach(function (k) {
        var n = d.node.kids[k];
        var nm = n.dir ? k : k.slice(0, k.lastIndexOf('.'));
        var ty = n.dir ? 'DIR' : k.slice(k.lastIndexOf('.') + 1);
        if (nre.test(nm) && tre.test(ty)) list.push([k, n]);
    });
    list.dir = d.node;
    return list;
}

function vmsRMS(why) {
    return { PRV: '-RMS-E-PRV, insufficient privilege or file protection violation', DNF: '-RMS-E-DNF, directory not found',
        FNF: '-RMS-E-FNF, file not found', dev: '-SYSTEM-W-NOSUCHDEV, no such device available', syntax: '-RMS-F-SYN, file specification syntax error' }[why];
}

//  The protection, as (S:RWED,O:RWED,G:RE,W:) shows it
function vmsProt(node) {
    var m = node.mode || 'rwxr-xr-x';
    var one = function (o) {
        var s = '';
        if (m.charAt(o) !== '-') s += 'R';
        if (m.charAt(o + 1) !== '-') s += 'W';
        if (m.charAt(o + 2) !== '-') s += 'E';
        if (m.charAt(o + 1) !== '-') s += 'D';
        return s;
    };
    return 'RWED,' + one(0) + ',' + one(3) + ',' + one(6);
}

//  Reads a file for a command; complains (as the verb does) and returns
//  null when it can't
function vmsRead(sh, fac, key, node, sp, quiet) {
    var spec = vmsDirSpec(sp.dir) + vmsName(key, node);
    if (node.dir) {
        sh.out('%' + fac + '-W-OPENIN, error opening ' + spec + ' as input\n-RMS-E-FAC, record operation not permitted by specified file access (FAC)\n');
        return null;
    }
    if (!fsCan(node, sh.who, 'r')) {
        sh.out('%' + fac + '-W-OPENIN, error opening ' + spec + ' as input\n' + vmsRMS('PRV') + '\n');
        return null;
    }
    if (node.onRead && !quiet) {
        sh.after = (sh.after || []).concat([node.onRead]);
        if (!node.repeat) node.onRead = null;
    }
    if (node.mail) {
        return node.msgs ? vmsMailFile(node.msgs) : fsText(node);
    }
    return node.type === 'exec' || node.type === 'data' ? unixGarbage(node) : fsText(node);
}

//  Writes a file: a new one, or a new version over one. Returns the node or
//  null (having complained).
function vmsWrite(sh, fac, sp, text) {
    var d = fsLook(sh.fs, '/', sp.dir, sh.who);
    var key = sp.name + '.' + sp.type;
    var show = vmsDirSpec(sp.dir) + key + ';';
    if (d.err || !d.node || !d.node.dir) {
        sh.out('%' + fac + '-E-OPENOUT, error opening ' + show + ' as output\n' + vmsRMS(d.err === 'denied' ? 'PRV' : 'DNF') + '\n');
        return null;
    }
    if (!fsCan(d.node, sh.who, 'w')) {
        sh.out('%' + fac + '-E-OPENOUT, error opening ' + show + ' as output\n' + vmsRMS('PRV') + '\n');
        return null;
    }
    var had = d.node.kids[key];
    if (had && had.dir) {
        sh.out('%' + fac + '-E-OPENOUT, error opening ' + show + ' as output\n-RMS-E-FEX, file already exists, not superseded\n');
        return null;
    }
    var f = vmsFile(sh.who.user, sh.who.groups[0], 'rwxr-x---'.replace(/x/g, '-'), text, 0);
    f.ver = had ? (had.ver || 1) + 1 : 1;
    f.mt = vmsDate(0, function () { return 0.5; });
    d.node.kids[key] = f;
    keepMark(sh.fs, sp.dir + '/' + key);
    return f;
}

//  ---- DCL ----

//  The verbs, with the shortest abbreviation each takes
var VMS_VERBS = [['DIRECTORY', 3], ['SET', 3], ['SHOW', 2], ['TYPE', 2], ['SEARCH', 3], ['COPY', 2], ['CREATE', 2],
    ['DELETE', 3], ['RENAME', 3], ['PURGE', 2], ['EDIT', 2], ['MAIL', 2], ['PHONE', 2], ['HELP', 1], ['LOGOUT', 2],
    ['RUN', 2], ['MCR', 3], ['WRITE', 2], ['SUBMIT', 3], ['PRINT', 2], ['DUMP', 2]];

function vmsVerb(word, table) {
    word = word.toUpperCase();
    for (var i = 0; i < table.length; i++) {
        if (word.length >= table[i][1] && table[i][0].indexOf(word) === 0) {
            return table[i][0];
        }
    }
    return null;
}

//  Splits a command line into words, with the qualifiers (/SIZE, /PAGE)
//  taken out: { words, q: { SIZE: true, PROTECTION: '(W:RE)' } }
function vmsParse(line) {
    var q = {};
    var words = [];
    var re = /"([^"]*)"|(\S+)/g;
    var m;
    while ((m = re.exec(line)) !== null) {
        if (m[1] !== undefined) {
            words.push(m[1]);
            continue;
        }
        var parts = m[2].split(/(?=\/[A-Za-z])/);
        if (parts[0].charAt(0) !== '/') {
            words.push(parts.shift());
        }
        parts.forEach(function (p) {
            var kv = /^\/([A-Za-z_]+)(?:=(.*))?$/.exec(p);
            if (kv) q[kv[1].toUpperCase().slice(0, 4)] = kv[2] === undefined ? true : kv[2];
        });
    }
    return { words: words, q: q };
}

//  Whether the qualifier name (as typed, cut to four letters) is set
function vmsQ(q, name) {
    return q[name.slice(0, 4)] !== undefined ? q[name.slice(0, 4)] : (function () {
        for (var k in q) {
            if (name.indexOf(k) === 0 && k.length >= 3) return q[k];
        }
        return undefined;
    })();
}

var VMS_QUIET = ['DIRECTORY', 'HELP', 'SHOW'];

function runVMS(ctx, io) {
    var h = ctx.host;
    ctx.ov = keepLoad(ctx.seed, h.num);
    var t = era();
    io.out('\r\n\r\n\r\n                 Welcome to VAX/VMS ' + h.version + '  on node ' + h.name + '\r\n');
    io.out('        ' + h.org + '  --  UNAUTHORIZED ACCESS PROHIBITED\r\n\r\n');
    var acct = null;
    for (var tries = 0; tries < MAX_TRIES && !acct; ) {
        io.out('Username: ');
        var u = io.line(true);
        if (u === null) return;
        if (!u.trim()) continue;
        io.out('Password: ');
        var pw = io.line(false);
        if (pw === null) return;
        io.out('\r\n');
        acct = findAccount({ accounts: keepAccounts(ctx, h.accounts, true) }, u.trim(), pw, true);
        if (!acct) {
            io.out('User authorization failure\r\n\r\n');
            failedLogin(ctx);
            tries++;
        }
    }
    if (!acct) {
        return;
    }
    var fs = vmsTree(ctx);
    keepOpen(ctx, fs, function () { return vmsTree(ctx); });
    var w = fs.w;
    var user = acct[0].toUpperCase();
    var priv = loggedIn(ctx, acct, io);
    landHello(ctx, io);
    vmsMoveIn(fs, user, priv);
    var sh = { ctx: ctx, io: io, fs: fs, w: w, user: user, acct: acct, priv: priv, cwd: fs.home, prompt: '$ ' };
    sh.who = { user: user, groups: [priv ? 'SYSTEM' : w.staff.indexOf(user) >= 0 ? 'STAFF' : 'USERS'], root: !!priv };
    sh.out = function (s) { io.out(unixLines(s)); };
    var box = fsLook(fs, '/', fs.home + '/MAIL.MAI', { root: true }).node;
    box.msgs = vmsMyMail(w, user, ctx).concat(keepMail(ctx.seed, h.num).filter(function (m) { return m.to === user; }).map(function (m) {
        return vmsMsg(w.name + '::' + m.from, m.to, m.subj, m.body, 0);
    }));
    box.newMail = box.msgs.length;
    io.out('\r\n        Welcome to VAX/VMS version ' + h.version + ' on node ' + h.name + '\r\n');
    io.out('    Last interactive login on ' + t.day + ', ' + t.vms.slice(0, 11) + ' 09:14\r\n');
    if (ctx.ov.note) io.out(unixLines('\n    ' + ctx.ov.note.toUpperCase() + '\n'));
    io.out('\r\n    You have ' + box.newMail + ' new Mail messages.\r\n\r\n');
    sh.tty = 'TTA' + (1 + v3.util.random(3)) + ':';
    sh.on = keepOn(ctx, user, sh.tty);
    var deaf = keepListen(ctx, io, user, sh.on, function (x) {
        return unixLines('\n\x07%PHONE, call from ' + h.name + '::' + x.from + ' (' + x.tty + ') at ' + keepClock(x.at) + '\n  ' + x.m.replace(/\n/g, '\n  ') + '\n');
    });
    vmsShell(sh);
    deaf();
    landBye(ctx, io);
    keepOff(ctx, sh.on);
}

function vmsShell(sh) {
    var ctx = sh.ctx;
    var io = sh.io;
    for (;;) {
        io.out(sh.prompt);
        var cmd = io.line(true);
        if (cmd === null) return;
        var c = cmd.trim();
        if (!c) continue;
        var verb = c.charAt(0) === '@' ? '@' : vmsVerb(c.split(/[\s\/]/)[0], VMS_VERBS);
        if (verb !== 'PHONE' && verb !== 'LOGOUT' && watched(ctx, io, VMS_QUIET.indexOf(verb) >= 0 ? 0.3 : 1)) return;
        var res = vmsRun(sh, c, verb);
        landEach(ctx, io);
        if (keepSave(sh.fs) === 'full') {
            sh.out('%RMS-F-FUL, device full (insufficient space for allocation)\n');
            io.say('This VAX has no room for more of what players leave. What you just did lasts only this call.');
        }
        if (res === 'exit' || io.over) return;
    }
}

//  An audit entry in OPERATOR.LOG: what was done to SYSUAF, and from which
//  account. Whoever reads the log later sees it.
function vmsAudit(sh, event, lines) {
    var t = era().vms;
    keepLog(sh.fs, '/SYS0/SYSMGR/OPERATOR.LOG', ['%%%%%%%%%%%  OPCOM  ' + t + '  %%%%%%%%%%%', 'Message from user AUDIT$SERVER on ' + sh.w.name,
        'Security alarm (SECURITY) and security audit (SECURITY) on ' + sh.w.name + ', system id: 1124',
        'Auditable event:          ' + event, 'Event time:               ' + t, 'Username:                 ' + sh.user,
        'Terminal name:            ' + (sh.tty || 'TTA1:')].concat(lines), 80);
}

//  Whether name is a privileged account the host came with: changing its
//  password takes the box
function vmsPrivAccount(sh, name) {
    return name === 'SYSTEM' || sh.ctx.host.accounts.some(function (a) { return a[0].toUpperCase() === name && a[2]; });
}

//  Runs one command line. Returns 'exit' to end the session.
function vmsRun(sh, line, verb) {
    var io = sh.io;
    if (verb === '@') {
        var sp0 = vmsSpec(sh, line.slice(1).trim(), { type: 'COM' });
        var hit = sp0.err ? null : vmsMatches(sh, sp0);
        if (!hit || hit.err || !hit.length) {
            sh.out('%DCL-E-OPENIN, error opening ' + (sp0.err ? line.slice(1).trim().toUpperCase() : vmsShowSpec(sp0)) + ' as input\n' + vmsRMS(hit && hit.err ? hit.err : 'FNF') + '\n');
        } else if (!fsCan(hit[0][1], sh.who, 'r')) {
            sh.out('%DCL-E-OPENIN, error opening ' + vmsShowSpec(sp0) + ' as input\n' + vmsRMS('PRV') + '\n');
        }
        return '';
    }
    if (!verb) {
        sh.out('%DCL-W-IVVERB, unrecognized command verb - check validity and spelling\n \\' + line.split(/[\s\/]/)[0].toUpperCase() + '\\\n');
        return '';
    }
    var p = vmsParse(line);
    var args = p.words.slice(1);
    var res = VMS_CMDS[verb](sh, args, p.q, line);
    if (sh.after) {
        var after = sh.after;
        sh.after = null;
        after.forEach(function (f) { f(sh.ctx, io); });
    }
    return res;
}

//  Lines until Ctrl/Z, for CREATE, MAIL and EDT
function vmsLines(sh) {
    var lines = [];
    for (;;) {
        var l = sh.io.line(true);
        if (l === null) return null;
        if (l === '\x1a' || /^\^Z$/i.test(l.trim())) break;
        lines.push(l);
    }
    sh.out('*EXIT*\n');
    return lines;
}

var VMS_HELP = {
    DIRECTORY: 'Lists the files in a directory.\n\n  Format\n\n    DIRECTORY [file-spec[,...]]\n\n  Qualifiers\n\n    /SIZE /DATE /OWNER /PROTECTION /FULL',
    SET: 'Changes things about your process or the system.\n\n  SET DEFAULT [dir]       where you are\n  SET HOST node           log in to another DECnet node\n' +
        '  SET PROTECTION=(S:RWED,O:RWED,G:RE,W:) file\n  SET PASSWORD\n  SET PROCESS/PRIVILEGES=ALL',
    SHOW: 'Shows things.\n\n  SHOW USERS  SHOW SYSTEM  SHOW NETWORK  SHOW DEFAULT  SHOW TIME\n  SHOW PROCESS[/PRIVILEGES]  SHOW QUOTA  SHOW LOGICAL  SHOW DEVICES',
    TYPE: 'Displays a file.\n\n  Format\n\n    TYPE file-spec\n\n  The file type defaults to .LIS, so give the whole name: TYPE NOTES.TXT\n\n  Qualifiers\n\n    /PAGE',
    SEARCH: 'Finds the lines in files with a string in them.\n\n  Format\n\n    SEARCH file-spec[,...] string',
    COPY: 'Copies a file.\n\n  Format\n\n    COPY input-file output-file',
    CREATE: 'Makes a file from what you type, ended with CTRL/Z.\n\n  Format\n\n    CREATE file-spec\n    CREATE/DIRECTORY [.name]',
    DELETE: 'Deletes files.  You must give a version number or ;*\n\n  Format\n\n    DELETE file-spec;version',
    MAIL: 'The mail utility.  At MAIL>: DIR, READ [n], NEXT, SEND, EXTRACT file, EXIT.',
    PHONE: 'Talks to another user.\n\n  Format\n\n    PHONE username',
    AUTHORIZE: 'The authorize utility, for the system manager: RUN SYS$SYSTEM:AUTHORIZE, or MCR AUTHORIZE.\n  At UAF>: SHOW user, SHOW *, LIST, ADD, MODIFY, EXIT.  Needs SYSPRV.',
    EDIT: 'The EDT editor, line mode here.  At *: TYPE WHOLE, INSERT (end with CTRL/Z), EXIT, QUIT.',
    LOGOUT: 'Ends your session.',
    RENAME: 'Renames a file.\n\n  Format\n\n    RENAME old-file new-file',
    PURGE: 'Deletes all but the newest version of files.',
};

var VMS_CMDS = {
    LOGOUT: function (sh) {
        sh.out('  ' + sh.user + '      logged out at ' + era().vms + '\n');
        return 'exit';
    },
    HELP: function (sh, a) {
        var topic = (a[0] || '').toUpperCase();
        var key = topic ? Object.keys(VMS_HELP).filter(function (k) { return k.indexOf(topic) === 0; })[0] : null;
        if (topic && !key) {
            sh.out('Sorry, no documentation on ' + topic + '\n');
        } else if (key) {
            sh.out('\n' + key + '\n\n  ' + VMS_HELP[key].replace(/\n/g, '\n  ') + '\n\n');
        } else {
            sh.out('\n  Information available:\n\n  ' + unixColumns(Object.keys(VMS_HELP).sort()).replace(/\n(?=.)/g, '\n  ') + '\n');
        }
    },
    DIRECTORY: function (sh, a, q) {
        var specs = a.length ? a.join(',').split(',').filter(function (x) { return x; }) : [''];
        var long = vmsQ(q, 'SIZE') || vmsQ(q, 'DATE') || vmsQ(q, 'OWNER') || vmsQ(q, 'PROTECTION');
        var full = vmsQ(q, 'FULL');
        var dirs = 0, files = 0, blocks = 0;
        var found = 0;
        var each = [];
        specs.forEach(function (spec) {
            var sp0 = vmsSpec(sh, spec, { name: '*', type: '*' });
            if (sp0.err) {
                sh.out('%DIRECT-E-OPENIN, error opening ' + spec.toUpperCase() + ' as input\n' + vmsRMS(sp0.err) + '\n');
                return;
            }
            vmsExpand(sh, sp0).forEach(function (sp) { each.push(sp); });
        });
        each.forEach(function (sp) {
            var list = vmsMatches(sh, sp);
            if (sp.many && (list.err || !list.length)) return;
            if (list.err) {
                sh.out('%DIRECT-E-OPENIN, error opening ' + vmsShowSpec(sp) + ' as input\n' + vmsRMS(list.err) + '\n');
                return;
            }
            if (!list.length) {
                sh.out('%DIRECT-W-NOFILES, no files found\n');
                return;
            }
            found++;
            dirs++;
            var out = '\nDirectory ' + vmsDirSpec(sp.dir) + '\n\n';
            var n = 0, b = 0;
            if (full) {
                list.forEach(function (x) {
                    var bl = Math.max(1, Math.ceil(fsSize(x[1]) / 512));
                    b += bl;
                    n++;
                    out += fit(vmsName(x[0], x[1]), 30) + 'File ID:  (' + (1000 + hash32(x[0]) % 9000) + ',' + (1 + hash32(x[0]) % 9) + ',0)\n' +
                        fit('Size:        ' + bl + '/' + (bl + 2), 30) + 'Owner:    [' + x[1].grp + ',' + x[1].own + ']\n' +
                        'Created:   ' + x[1].mt + ':04.21\nRevised:   ' + x[1].mt + ':04.21 (' + (x[1].ver || 1) + ')\n' +
                        'File protection:    System:RWED, Owner:' + vmsProt(x[1]).split(',')[1] + ', Group:' + vmsProt(x[1]).split(',')[2] + ', World:' + vmsProt(x[1]).split(',')[3] + '\n\n';
                });
            } else if (long) {
                list.forEach(function (x) {
                    var bl = Math.max(1, Math.ceil(fsSize(x[1]) / 512));
                    b += bl;
                    n++;
                    var row = fit(vmsName(x[0], x[1]), 19);
                    if (vmsQ(q, 'SIZE')) row += padStart(String(bl), 7);
                    if (vmsQ(q, 'DATE')) row += '  ' + padStart(x[1].mt, 17) + ':04.21';
                    if (vmsQ(q, 'OWNER')) row += '  ' + fit('[' + x[1].grp + ',' + x[1].own + ']', 20);
                    if (vmsQ(q, 'PROTECTION')) row += '  (' + vmsProt(x[1]) + ')';
                    out += row.replace(/\s+$/, '') + '\n';
                });
            } else {
                var names = list.map(function (x) { n++; b += Math.max(1, Math.ceil(fsSize(x[1]) / 512)); return vmsName(x[0], x[1]); });
                var row = '';
                var col = 0;
                names.forEach(function (nm) {
                    var span = nm.length >= 19 ? 2 : 1;
                    if (col + span > 4) {
                        out += row.replace(/\s+$/, '') + '\n';
                        row = '';
                        col = 0;
                    }
                    row += fit(nm, 20 * span);
                    col += span;
                });
                out += row.replace(/\s+$/, '') + '\n';
            }
            out += '\nTotal of ' + n + ' file' + (n === 1 ? '' : 's') + (long || full ? ', ' + b + ' block' + (b === 1 ? '' : 's') : '') + '.\n';
            files += n;
            blocks += b;
            sh.out(out);
        });
        if (!found && each.length && each.every(function (x) { return x.many; })) {
            sh.out('%DIRECT-W-NOFILES, no files found\n');
        }
        if (dirs > 1) {
            sh.out('\nGrand total of ' + dirs + ' directories, ' + files + ' files' + (long || full ? ', ' + blocks + ' blocks' : '') + '.\n');
        }
    },
    TYPE: function (sh, a, q) {
        if (!a.length) {
            sh.out('_File: ');
            var f = sh.io.line(true);
            if (f === null) return 'exit';
            a = [f];
        }
        a.join(',').split(',').filter(function (x) { return x; }).forEach(function (spec) {
          vmsExpand(sh, vmsSpec(sh, spec, { type: 'LIS' })).forEach(function (sp) {
            var list = sp.err ? sp : vmsMatches(sh, sp);
            if (sp.many && (list.err || !list.length)) return;
            if (list.err || !list.length) {
                sh.out('%TYPE-W-SEARCHFAIL, error searching for ' + (sp.err ? spec.toUpperCase() : vmsShowSpec(sp)) + '\n' + vmsRMS(list.err || 'FNF') + '\n');
                return;
            }
            list.forEach(function (x) {
                var text = vmsRead(sh, 'TYPE', x[0], x[1], sp);
                if (text === null) return;
                if (!vmsQ(q, 'PAGE')) {
                    sh.out(text);
                    return;
                }
                var lines = text.replace(/\n$/, '').split('\n');
                for (var i = 0; i < lines.length; i += 22) {
                    sh.out(lines.slice(i, i + 22).join('\n') + '\n');
                    if (i + 22 < lines.length) {
                        sh.io.out('\r\nPress RETURN to continue ');
                        var k = sh.io.line(false);
                        sh.io.out('\r\n');
                        if (k === null) return;
                        if (k === '\x1a' || /^\^Z$/i.test(k)) break;
                    }
                }
            });
          });
        });
    },
    SEARCH: function (sh, a, q) {
        if (a.length < 2) {
            sh.out('%DCL-W-INSFPRM, missing command parameters - supply all required parameters\n');
            return;
        }
        var str = a[a.length - 1].toUpperCase();
        var specs = a.slice(0, -1).join(',').split(',').filter(function (x) { return x; });
        var hits = 0;
        var files = [];
        specs.forEach(function (spec) {
            vmsExpand(sh, vmsSpec(sh, spec, { type: 'LIS' })).forEach(function (sp) {
                var list = sp.err ? sp : vmsMatches(sh, sp);
                if (sp.many && (list.err || !list.length)) return;
                if (list.err || !list.length) {
                    sh.out('%SEARCH-W-SEARCHFAIL, error searching for ' + (sp.err ? spec.toUpperCase() : vmsShowSpec(sp)) + '\n' + vmsRMS(list.err || 'FNF') + '\n');
                    return;
                }
                list.forEach(function (x) { if (!x[1].dir) files.push([x, sp]); });
            });
        });
        files.forEach(function (f) {
            var text = vmsRead(sh, 'SEARCH', f[0][0], f[0][1], f[1], true);
            if (text === null) return;
            var lines = text.replace(/\n$/, '').split('\n').filter(function (l) { return l.toUpperCase().indexOf(str) >= 0; });
            if (!lines.length) return;
            if (f[0][1].onRead) {
                sh.after = (sh.after || []).concat([f[0][1].onRead]);
                if (!f[0][1].repeat) f[0][1].onRead = null;
            }
            hits += lines.length;
            if (files.length > 1) sh.out('\n******************************\n' + vmsDirSpec(f[1].dir) + vmsName(f[0][0], f[0][1]) + '\n\n');
            sh.out(lines.join('\n') + '\n');
        });
        if (!hits && files.length) sh.out('%SEARCH-I-NOMATCHES, no strings matched\n');
    },
    COPY: function (sh, a, q) { vmsCopy(sh, a, q, false); },
    RENAME: function (sh, a, q) { vmsCopy(sh, a, q, true); },
    CREATE: function (sh, a, q) {
        if (!a.length) {
            sh.out('%DCL-W-INSFPRM, missing command parameters - supply all required parameters\n');
            return;
        }
        var sp = vmsSpec(sh, a[0], {});
        if (sp.err) {
            sh.out('%CREATE-E-OPENOUT, error opening ' + a[0].toUpperCase() + ' as output\n' + vmsRMS(sp.err) + '\n');
            return;
        }
        if (vmsQ(q, 'DIRECTORY')) {
            var parts = fsSplit(sp.dir);
            var name = parts.pop();
            var up = fsLook(sh.fs, '/', '/' + parts.join('/'), sh.who);
            if (up.err || !up.node || !fsCan(up.node, sh.who, 'w')) {
                sh.out('%CREATE-E-DIRNOTCRE, ' + vmsDirSpec(sp.dir) + ' directory file not created\n' + vmsRMS(up.err || up.node ? 'PRV' : 'DNF') + '\n');
                return;
            }
            if (!up.node.kids[name]) {
                up.node.kids[name] = fsDir(sh.who.user, sh.who.groups[0], 'rwxr-x---', vmsDate(0, function () { return 0.5; }));
                keepMark(sh.fs, sp.dir);
                if (vmsQ(q, 'LOG')) sh.out('%CREATE-I-CREATED, ' + vmsDirSpec(sp.dir) + ' created\n');
            }
            return;
        }
        if (!sp.name) {
            sh.out('%CREATE-E-OPENOUT, error opening ' + vmsShowSpec(sp) + ' as output\n-RMS-F-FNM, error in file name\n');
            return;
        }
        var lines = vmsLines(sh);
        if (lines === null) return 'exit';
        vmsWrite(sh, 'CREATE', sp, lines.join('\n') + (lines.length ? '\n' : ''));
    },
    DELETE: function (sh, a, q) {
        if (!a.length) {
            sh.out('%DCL-W-INSFPRM, missing command parameters - supply all required parameters\n');
            return;
        }
        a.join(',').split(',').filter(function (x) { return x; }).forEach(function (spec) {
            var sp = vmsSpec(sh, spec, {});
            if (sp.err) {
                sh.out('%DELETE-W-SEARCHFAIL, error searching for ' + spec.toUpperCase() + '\n' + vmsRMS(sp.err) + '\n');
                return;
            }
            if (!sp.verGiven) {
                sh.out('%DELETE-E-DELVER, explicit version number or wild card required\n');
                return;
            }
            var list = vmsMatches(sh, sp);
            if (list.err || !list.length) {
                sh.out('%DELETE-W-SEARCHFAIL, error searching for ' + vmsShowSpec(sp) + '\n' + vmsRMS(list.err || 'FNF') + '\n');
                return;
            }
            list.forEach(function (x) {
                var show = vmsDirSpec(sp.dir) + vmsName(x[0], x[1]);
                if (sp.ver && sp.ver !== '*' && String(x[1].ver || 1) !== sp.ver && !x[1].dir) {
                    sh.out('%DELETE-W-SEARCHFAIL, error searching for ' + vmsShowSpec(sp) + '\n' + vmsRMS('FNF') + '\n');
                    return;
                }
                if (!fsCan(list.dir, sh.who, 'w') || (!x[1].dir && !fsCan(x[1], sh.who, 'w'))) {
                    sh.out('%DELETE-W-FILNOTDEL, error deleting ' + show + '\n' + vmsRMS('PRV') + '\n');
                    return;
                }
                if (x[1].dir && Object.keys(x[1].kids).length) {
                    sh.out('%DELETE-W-FILNOTDEL, error deleting ' + show + '\n-RMS-E-MKD, ACP could not mark file for deletion\n-SYSTEM-F-DIRNOTEMPTY, directory file is not empty\n');
                    return;
                }
                delete list.dir.kids[x[0]];
                keepMark(sh.fs, sp.dir + '/' + x[0]);
                if (vmsQ(q, 'LOG')) sh.out('%DELETE-I-FILDEL, ' + show + ' deleted (' + Math.max(1, Math.ceil(fsSize(x[1]) / 512)) + ' blocks)\n');
                if (sp.dir === '/SYS0/SYSMGR' && x[0] === 'ACCOUNTNG.DAT') cleaned(sh.ctx, sh.io);
            });
        });
    },
    PURGE: function (sh) {
        sh.out('%PURGE-W-NOFILPURG, no files purged\n');
    },
    EDIT: function (sh, a) { return vmsEdit(sh, a); },
    MAIL: function (sh, a) { return vmsMail(sh, a); },
    PHONE: function (sh, a) {
        var to = (a[0] || '').toUpperCase().replace(/^.*::/, '');
        if (!to) {
            sh.out('%PHONE-W-NOSUCHUSER, no such user\n');
            return;
        }
        //  another player on as them takes the call
        if (keepOthersOn(sh.ctx.seed, sh.w.h.num).some(function (x) { return x.u === to; })) {
            sh.out('Type your message: ');
            var said = sh.io.line(true);
            if (said === null) return 'exit';
            if (said) keepWriteTo(sh.ctx, to, sh.user, sh.tty, said);
            return;
        }
        if (to !== 'SYSTEM') {
            sh.out(sh.w.staff.indexOf(to) >= 0 ? '%PHONE-W-TARGETNOTAVAIL, ' + to + ' is not accepting calls\n' : '%PHONE-W-NOSUCHUSER, no such user\n');
            return;
        }
        sh.out('Type your message: ');
        var pm = sh.io.line(true);
        if (pm === null) return 'exit';
        if (bluff(sh.ctx, sh.io, pm)) return 'exit';
    },
    WRITE: function (sh, a) {
        if ((a[0] || '').toUpperCase() !== 'SYS$OUTPUT') {
            sh.out('%DCL-W-UNDFIL, file has not been opened by DCL - check logical name\n');
            return;
        }
        sh.out(a.slice(1).join(' ') + '\n');
    },
    RUN: function (sh, a) { return vmsImage(sh, a[0] || '', false); },
    MCR: function (sh, a) { return vmsImage(sh, a[0] || '', true); },
    SUBMIT: function (sh, a) {
        sh.out(sh.priv ? '  Job ' + (a[0] || 'BATCH').toUpperCase().replace(/\..*/, '') + ' (queue SYS$BATCH, entry ' + (400 + sh.w.h.users) + ') started on SYS$BATCH\n'
            : '%SUBMIT-F-CREJOB, error creating job\n-JBC-E-NOPRIV, no privilege for attempted operation\n');
    },
    PRINT: function (sh, a) {
        sh.out('  Job ' + (a[0] || 'X').toUpperCase().replace(/\..*/, '') + ' (queue SYS$PRINT, entry ' + (500 + sh.w.h.users) + ') pending\n  pending status caused by queue stopped state\n');
    },
    DUMP: function (sh) {
        sh.out('%DUMP-E-OPENIN, error opening file as input\n-RMS-E-FNF, file not found\n');
    },
    SET: function (sh, a, q, line) { return vmsSet(sh, a, q, line); },
    SHOW: function (sh, a, q) { return vmsShow(sh, a, q); },
};

function vmsCopy(sh, a, q, move) {
    var fac = move ? 'RENAME' : 'COPY';
    if (a.length < 2) {
        sh.out('%DCL-W-INSFPRM, missing command parameters - supply all required parameters\n');
        return;
    }
    var sp = vmsSpec(sh, a[0], {});
    var list = sp.err ? sp : vmsMatches(sh, sp);
    if (list.err || !list.length) {
        sh.out('%' + fac + '-W-SEARCHFAIL, error searching for ' + (sp.err ? a[0].toUpperCase() : vmsShowSpec(sp)) + '\n' + vmsRMS(list.err || 'FNF') + '\n');
        return;
    }
    var src = list[0];
    if (src[1].dir && !move) {
        sh.out('%COPY-E-OPENIN, error opening ' + vmsDirSpec(sp.dir) + vmsName(src[0], src[1]) + ' as input\n-RMS-E-FAC, record operation not permitted by specified file access (FAC)\n');
        return;
    }
    var srcName = src[0].slice(0, src[0].lastIndexOf('.'));
    var srcType = src[0].slice(src[0].lastIndexOf('.') + 1);
    var dp = vmsSpec(sh, a[1], { name: srcName, type: srcType });
    if (dp.err) {
        sh.out('%' + fac + '-E-OPENOUT, error opening ' + a[1].toUpperCase() + ' as output\n' + vmsRMS(dp.err) + '\n');
        return;
    }
    if (!dp.name || dp.name === '*') dp.name = srcName;
    if (dp.type === '*' || (dp.type === '' && a[1].indexOf('.') < 0)) dp.type = srcType;
    var text;
    if (move) {
        if (!fsCan(list.dir, sh.who, 'w')) {
            sh.out('%RENAME-E-NOTRENAMED, ' + vmsDirSpec(sp.dir) + vmsName(src[0], src[1]) + ' not renamed\n' + vmsRMS('PRV') + '\n');
            return;
        }
        var to = fsLook(sh.fs, '/', dp.dir, sh.who);
        if (to.err || !to.node || !to.node.dir || !fsCan(to.node, sh.who, 'w')) {
            sh.out('%RENAME-E-NOTRENAMED, ' + vmsDirSpec(sp.dir) + vmsName(src[0], src[1]) + ' not renamed\n' + vmsRMS(to.err || to.node ? 'PRV' : 'DNF') + '\n');
            return;
        }
        delete list.dir.kids[src[0]];
        to.node.kids[src[1].dir ? dp.name : dp.name + '.' + dp.type] = src[1];
        keepMark(sh.fs, sp.dir + '/' + src[0]);
        keepMark(sh.fs, dp.dir + '/' + (src[1].dir ? dp.name : dp.name + '.' + dp.type));
        if (vmsQ(q, 'LOG')) sh.out('%RENAME-I-RENAMED, ' + vmsDirSpec(sp.dir) + vmsName(src[0], src[1]) + ' renamed to ' + vmsDirSpec(dp.dir) + dp.name + '.' + dp.type + ';' + (src[1].ver || 1) + '\n');
        return;
    }
    text = vmsRead(sh, 'COPY', src[0], src[1], sp);
    if (text === null) return;
    var made = vmsWrite(sh, 'COPY', dp, src[1].type === 'text' ? text : '');
    if (made) {
        made.type = src[1].type;
        made.size = src[1].size;
        if (vmsQ(q, 'LOG')) {
            sh.out('%COPY-S-COPIED, ' + vmsDirSpec(sp.dir) + vmsName(src[0], src[1]) + ' copied to ' + vmsDirSpec(dp.dir) + dp.name + '.' + dp.type + ';' + made.ver +
                ' (' + Math.max(1, Math.ceil(fsSize(made) / 512)) + ' block)\n');
        }
    }
}

//  RUN and MCR: AUTHORIZE is played out, other images just run
function vmsImage(sh, what, mcr) {
    if (!what) {
        sh.out('_File: ');
        what = sh.io.line(true);
        if (what === null) return 'exit';
    }
    var sp = vmsSpec(sh, mcr && what.indexOf(':') < 0 && what.indexOf('[') < 0 ? 'SYS$SYSTEM:' + what : what, { type: 'EXE' });
    var list = sp.err ? sp : vmsMatches(sh, sp);
    if (list.err || !list.length) {
        sh.out('%DCL-W-ACTIMAGE, error activating image ' + (sp.err ? what.toUpperCase() : vmsShowSpec(sp)) + '\n-CLI-E-IMAGEFNF, image file not found ' +
            (sp.err ? what.toUpperCase() : vmsShowSpec(sp)) + '\n');
        return;
    }
    if (list[0][0] === 'AUTHORIZE.EXE' && sp.dir === '/SYS0/SYSEXE') {
        return vmsAuthorize(sh);
    }
    if (list[0][1].type !== 'exec' || !fsCan(list[0][1], sh.who, 'x')) {
        sh.out('%DCL-W-ACTIMAGE, error activating image ' + vmsShowSpec(sp) + '\n-CLI-E-IMGNAME, image file ' + vmsShowSpec(sp) + '\n-IMGACT-F-IMG_SIZ, image header descriptor length is invalid\n');
    }
}

//  The user authorization file, as AUTHORIZE shows it
function vmsUAF(sh) {
    var w = sh.w;
    var rows = [['SYSTEM', 'SYSTEM MANAGER', 'SYSTEM', '1,4', 'All', VMS_HOMES.SYSTEM], ['FIELD', 'FIELD SERVICE', 'FIELD', '1,10', 'All', VMS_HOMES.FIELD],
        ['SYSTEST', 'SYSTEST-UETP', 'SYSTEST', '1,7', 'All', VMS_HOMES.SYSTEST], ['DECNET', 'DECNET DEFAULT', 'DECNET', '376,376', 'Normal', VMS_HOMES.DECNET]];
    sh.ctx.host.accounts.forEach(function (a) {
        var n = a[0].toUpperCase();
        if (!rows.some(function (x) { return x[0] === n; })) rows.push([n, n === w.secret[0] ? 'SYSTEM MANAGER' : n, a[2] ? 'SYSTEM' : 'USERS', a[2] ? '1,' + (20 + rows.length) : '200,' + rows.length, a[2] ? 'All' : 'Normal', VMS_HOMES[n] || '/' + n]);
    });
    w.staff.forEach(function (n, i) {
        if (!rows.some(function (x) { return x[0] === n; })) rows.push([n, w.real[n].toUpperCase(), 'STAFF', '100,' + (1 + i), n === w.boss ? 'All' : 'Normal', '/' + n]);
    });
    //  accounts players added
    Object.keys(sh.ctx.ov.acc).forEach(function (n) {
        if (!rows.some(function (x) { return x[0] === n; })) {
            rows.push([n, n, 'USERS', '200,' + (50 + rows.length), sh.ctx.ov.acc[n][1] ? 'All' : 'Normal', '/' + n]);
        }
    });
    return rows;
}

function vmsAuthorize(sh) {
    var uaf = fsLook(sh.fs, '/', '/SYS0/SYSEXE/SYSUAF.DAT', { root: true }).node;
    if (!fsCan(uaf, sh.who, 'r')) {
        sh.out('%UAF-E-NAOFIL, unable to open system authorization file (SYSUAF.DAT)\n' + vmsRMS('PRV') + '\n');
        return;
    }
    var looted = function () { gotLoot(sh.ctx, sh.io, 'the SYSUAF account list'); };
    for (;;) {
        sh.io.out('UAF> ');
        var l = sh.io.line(true);
        if (l === null) return 'exit';
        var p = vmsParse(l.trim());
        var v = vmsVerb(p.words[0] || '', [['EXIT', 1], ['QUIT', 1], ['SHOW', 2], ['LIST', 1], ['ADD', 1], ['MODIFY', 1], ['HELP', 1]]);
        if (!p.words.length || v === 'EXIT' || v === 'QUIT' || l === '\x1a') return;
        var rows = vmsUAF(sh);
        if (v === 'SHOW' || v === 'LIST') {
            var who = (p.words[1] || (v === 'LIST' ? '*' : '')).toUpperCase();
            if (!who) {
                sh.out('%CLI-W-INSFPRM, missing command parameters - supply all required parameters\n');
                continue;
            }
            var re = vmsPattern(who);
            var hits = rows.filter(function (x) { return re.test(x[0]); });
            if (!hits.length) {
                sh.out('%UAF-W-BADUSR, username does not exist\n');
                continue;
            }
            var text;
            if (vmsQ(p.q, 'BRIEF') || hits.length > 1) {
                text = ' Owner                 Username     UIC        Account   Privs  Pri Default Disk\n' +
                    hits.map(function (x) {
                        return ' ' + fit(x[1], 22) + fit(x[0], 13) + fit('[' + x[3] + ']', 11) + fit(x[2], 10) + fit(x[4], 7) + '  4 ' + (/^\/SYS0/.test(x[5]) ? 'SYS$SYSROOT' : 'DUA0');
                    }).join('\n') + '\n';
            } else {
                var x = hits[0];
                text = '\nUsername: ' + fit(x[0], 32) + 'Owner:  ' + x[1] + '\nAccount:  ' + fit(x[2], 32) + 'UIC:    [' + x[3] + ']\nCLI:      DCL                             Tables: DCLTABLES\n' +
                    'Default:  ' + vmsDirSpec(x[5]) + '\nLGICMD:   LOGIN\nFlags:\nPrimary days:   Mon Tue Wed Thu Fri\nSecondary days:                     Sat Sun\n' +
                    'Expiration:            (none)    Pwdminimum:  6   Login Fails:     ' + (x[0] === sh.user ? 0 : hash32(x[0]) % 4) + '\n' +
                    'Pwdlifetime:         90 00:00    Pwdchange:   ' + vmsDate(20 + hash32(x[0]) % 200).slice(0, 11) + '\n' +
                    'Authorized Privileges:\n  ' + (x[4] === 'All' ? 'CMKRNL CMEXEC SYSNAM GRPNAM DETACH DIAGNOSE LOG_IO GROUP NOACNT PRMCEB PRMMBX\n  SETPRV TMPMBX WORLD MOUNT OPER EXQUOTA NETMBX VOLPRO PHY_IO BUGCHK SYSPRV BYPASS\n  SYSLCK SHARE GRPPRV READALL SECURITY' : 'NETMBX TMPMBX') + '\n';
            }
            if (v === 'LIST') {
                var f = vmsWrite(sh, 'UAF', { dir: sh.cwd, name: 'SYSUAF', type: 'LIS' }, text);
                if (f) sh.out('%UAF-I-LSTMSG1, writing listing file\n%UAF-I-LSTMSG2, listing file SYSUAF.LIS complete\n');
            } else {
                sh.out(text);
            }
            looted();
        } else if (v === 'ADD') {
            var nu = (p.words[1] || '').toUpperCase();
            if (!nu) {
                sh.out('%CLI-W-INSFPRM, missing command parameters - supply all required parameters\n');
            } else if (rows.some(function (x) { return x[0] === nu; })) {
                sh.out('%UAF-W-UAEERR, invalid user name, user name already exists\n');
            } else {
                //  AUTHORIZE's default password was USER
                var npw = vmsQ(p.q, 'PASSWORD');
                npw = npw && npw !== true ? String(npw) : 'USER';
                var npriv = /ALL|SETPRV|CMKRNL|SYSPRV/i.test(String(vmsQ(p.q, 'PRIVILEGES') || ''));
                keepAddAccount(sh.ctx, nu, npw, npriv);
                vmsAudit(sh, 'System UAF record addition', ['Image name:               SYS$SYSTEM:AUTHORIZE.EXE', 'User record added:        ' + nu]);
                sh.out('%UAF-I-ADDMSG, user record successfully added\n%UAF-I-RDBADDMSGU, identifier ' + nu + ' value [000200,0000' + (50 + rows.length) + '] added to rights data base\n');
            }
        } else if (v === 'MODIFY') {
            var mu = (p.words[1] || '').toUpperCase();
            var mpw = vmsQ(p.q, 'PASSWORD');
            if (!rows.some(function (x) { return x[0] === mu; })) {
                sh.out('%UAF-W-BADUSR, username does not exist\n');
            } else {
                if (mpw && mpw !== true && (vmsPrivAccount(sh, mu) || sh.ctx.ov.acc[mu])) vmsSetPassword(sh, mu, String(mpw));
                sh.out('%UAF-I-MDFYMSG, user record(s) updated\n');
            }
        } else if (v === 'HELP') {
            sh.out('\n  ADD  EXIT  HELP  LIST  MODIFY  SHOW\n\n');
        } else {
            sh.out('%UAF-W-ISSPARSE, unrecognized command verb\n \\' + (p.words[0] || '').toUpperCase() + '\\\n');
        }
    }
}

//  A new password for name, kept: the system manager's takes the box
function vmsSetPassword(sh, name, pw) {
    if (sh.ctx.ov.acc[name]) {
        keepAddAccount(sh.ctx, name, pw, sh.ctx.ov.acc[name][1]);
    } else {
        keepSetPassword(sh.ctx, name, pw);
        sh.io.say('The ' + name + ' password is yours now. Anyone holding the old one is locked out. Careful what you leave behind.');
    }
    vmsAudit(sh, 'System UAF record modification', ['Image name:               SYS$SYSTEM:AUTHORIZE.EXE', 'User record modified:     ' + name,
        'Fields modified:          PASSWORD']);
}

function vmsSet(sh, a, q, line) {
    var what = vmsVerb(a[0] || '', [['DEFAULT', 3], ['HOST', 1], ['PROTECTION', 3], ['PASSWORD', 3], ['TERMINAL', 1], ['PROMPT', 3],
        ['PROCESS', 3], ['ACCOUNTING', 2], ['FILE', 1], ['NOON', 4], ['VERIFY', 1]]);
    var rest = a.slice(1);
    if (!what && /^PROT/i.test(a[0] || '')) what = 'PROTECTION';
    if (!what && /^PROMPT=/i.test(a[0] || '')) what = 'PROMPT';
    if (vmsQ(q, 'PROTECTION') && what === 'FILE') what = 'PROTECTION';
    switch (what) {
    case 'DEFAULT':
        var sp = vmsSpec(sh, rest[0] || '[]', {});
        if (sp.err) {
            sh.out('%SET-E-INVDEF, invalid default directory\n' + vmsRMS(sp.err) + '\n');
            return;
        }
        sh.cwd = sp.dir;
        return;
    case 'HOST':
        return vmsSetHost(sh, (rest[0] || '').toUpperCase().replace(/::$/, ''));
    case 'PROTECTION':
        var m = /=\s*\(([^)]*)\)/.exec(line) || /=\s*([^\s]+)/.exec(line);
        var targets = rest;
        if (!m || !targets.length) {
            sh.out('%DCL-W-INSFPRM, missing command parameters - supply all required parameters\n');
            return;
        }
        targets.forEach(function (spec) {
            var sp2 = vmsSpec(sh, spec, {});
            var list = sp2.err ? sp2 : vmsMatches(sh, sp2);
            if (list.err || !list.length) {
                sh.out('%SET-E-SEARCHFAIL, error searching for ' + (sp2.err ? spec.toUpperCase() : vmsShowSpec(sp2)) + '\n' + vmsRMS(list.err || 'FNF') + '\n');
                return;
            }
            list.forEach(function (x) {
                if (!sh.priv && x[1].own !== sh.who.user) {
                    sh.out('%SET-E-NOTSET, error modifying ' + vmsDirSpec(sp2.dir) + vmsName(x[0], x[1]) + '\n' + vmsRMS('PRV') + '\n');
                    return;
                }
                var mode = (x[1].mode || 'rwxr-xr-x').split('');
                m[1].toUpperCase().split(',').forEach(function (part) {
                    var kv = /^\s*(S|SYSTEM|O|OWNER|G|GROUP|W|WORLD)\s*:?\s*([RWED]*)\s*$/.exec(part);
                    if (!kv) return;
                    var at = { O: 0, G: 3, W: 6 }[kv[1].charAt(0)];
                    if (at === undefined) return;
                    mode[at] = /R/.test(kv[2]) ? 'r' : '-';
                    mode[at + 1] = /[WD]/.test(kv[2]) ? 'w' : '-';
                    mode[at + 2] = /E/.test(kv[2]) ? 'x' : '-';
                });
                x[1].mode = mode.join('');
                keepMark(sh.fs, sp2.dir + '/' + x[0]);
            });
        });
        return;
    case 'PASSWORD':
        sh.io.out('Old password: ');
        var old = sh.io.line(false);
        if (old === null) return 'exit';
        sh.io.out('\r\nNew password: ');
        var nw = sh.io.line(false);
        if (nw === null) return 'exit';
        sh.io.out('\r\nVerification: ');
        var vf = sh.io.line(false);
        if (vf === null) return 'exit';
        sh.io.out('\r\n');
        if (String(old).toUpperCase() !== String(sh.acct[1]).toUpperCase()) {
            sh.out('%SET-F-INVPWD, invalid password\n');
        } else if (nw !== vf) {
            sh.out('%SET-F-PWDNOTVER, new password not verified\n');
        } else if (nw.length < 6) {
            sh.out('%SET-F-INVPWDLEN, invalid password length - password not changed\n');
        } else if (vmsPrivAccount(sh, sh.user) || sh.ctx.ov.acc[sh.user]) {
            //  the system manager's password, or one a player added: it's
            //  the caller's now
            vmsSetPassword(sh, sh.user, nw);
        }
        return;
    case 'PROMPT':
        var pm = /=\s*"([^"]*)"/.exec(line) || /=\s*(\S+)/.exec(line);
        sh.prompt = pm ? pm[1] : '$ ';
        return;
    case 'PROCESS':
        if (vmsQ(q, 'PRIVILEGES') && !sh.priv) sh.out('%SYSTEM-S-NOTALLPRIV, not all requested privileges authorized\n');
        return;
    case 'ACCOUNTING':
        if (!sh.priv) {
            sh.out('%SYSTEM-F-NOPRIV, no privilege for attempted operation\n');
            return;
        }
        if (vmsQ(q, 'DISABLE')) cleaned(sh.ctx, sh.io);
        return;
    case 'TERMINAL':
    case 'NOON':
    case 'VERIFY':
        return;
    default:
        sh.out('%DCL-W-IVKEYW, unrecognized keyword - check validity and spelling\n \\' + (a[0] || '').toUpperCase() + '\\\n');
    }
}

function vmsSetHost(sh, target) {
    var nd = sh.w.nodes.filter(function (x) { return x.name === target; })[0];
    if (target === '0' || target === sh.w.name) {
        nd = { num: sh.w.h.num, name: sh.w.name };
    }
    if (!nd) {
        sh.out('%SYSTEM-F-NOSUCHNODE, remote node is unknown\n');
        return;
    }
    if (nd.num !== sh.w.h.num) {
        var rep2 = identify(sh.ctx.p, nd.num, 'vms');
        if (rep2) sh.io.reward(rep2, 'new find, VAX/VMS (' + nd.name + ')');
        sh.ctx.p.hops = (sh.ctx.p.hops || 0) + 1;
    }
    runVMS({ p: sh.ctx.p, host: hostAtNum(sh.ctx, nd.num, 'vms'), seed: sh.ctx.seed }, sh.io);
    if (sh.io.over) return 'exit';
    sh.out('%REM-S-END, control returned to node _' + sh.w.name + '::\n');
}

function vmsShow(sh, a, q) {
    var h = sh.w.h;
    var t = era();
    var what = vmsVerb(a[0] || '', [['USERS', 1], ['SYSTEM', 2], ['NETWORK', 1], ['TIME', 1], ['PROCESS', 1], ['DEFAULT', 1],
        ['QUOTA', 1], ['LOGICAL', 1], ['DEVICES', 3], ['INTRUSION', 1]]);
    switch (what) {
    case 'USERS':
        var out = '      VAX/VMS User Processes at ' + t.vms + '\n    Total number of users = ' + (h.users + 1) + ',  number of processes = ' + (h.users + 6) + '\n\n' +
            ' Username     Interactive  Subprocess   Batch\n';
        if (adminOnline(sh.ctx)) out += ' SYSTEM              1           1\n';
        sh.w.staff.slice(1, 1 + Math.min(4, h.users)).concat(keepOthersOn(sh.ctx.seed, h.num).map(function (x) { return x.u; }), [sh.user]).forEach(function (n) {
            out += ' ' + fit(n, 12) + '        1\n';
        });
        sh.out(out);
        return;
    case 'NETWORK':
        var nodes = sh.w.nodes;
        sh.out('\nVAX/VMS Network status for local node ' + (1 + h.users) + '.' + (100 + h.users) + ' ' + h.name + ' on ' + t.vms + '\n\n');
        if (!nodes.length) {
            sh.out('%SHOW-I-NONET, this node is not a member of a DECnet network\n');
            return;
        }
        sh.out('  Node         Links  Cost  Hops   Next Hop to Node\n' + nodes.map(function (nd, i) {
            return '  1.' + (200 + i) + '  ' + fit(nd.name, 9) + '0     ' + (4 + i) + '     1     UNA-0 -> 1.' + (200 + i) + ' ' + nd.name;
        }).join('\n') + '\n\n');
        return;
    case 'TIME':
        sh.out('  ' + t.vms + '\n');
        return;
    case 'SYSTEM':
        sh.out('VAX/VMS ' + h.version + '  on node ' + h.name + '  ' + t.vms + '   Uptime  12 04:31:07\n' +
            '  Pid    Process Name    State  Pri      I/O       CPU       Page flts Ph.Mem\n' +
            '20200081 SWAPPER         HIB     16        0   0 00:00:11.42         0      0\n' +
            '20200086 ERRFMT          HIB      8     1203   0 00:00:02.15        81    122\n' +
            '2020008A JOB_CONTROL     HIB      9     5521   0 00:00:09.88       195    354\n' +
            '2020008E NETACP          HIB     10      312   0 00:00:04.61       260    410\n' +
            (adminOnline(sh.ctx) ? '20200112 SYSTEM          LEF      4     2207   0 00:00:19.03      1150    602\n' : '') +
            '20200119 _TTA' + (h.users % 4) + ':          CUR      4      140   0 00:00:01.12       412    300\n');
        return;
    case 'PROCESS':
        var out2 = '\n' + t.vms + '   User: ' + fit(sh.user, 15) + 'Process ID:   20200119\n                       Node: ' + fit(h.name, 15) +
            'Process name: "_TTA' + (h.users % 4) + ':"\n';
        if (vmsQ(q, 'PRIVILEGES')) {
            out2 += '\nProcess privileges:\n' + (sh.priv ? ' CMKRNL               may change mode to kernel\n SETPRV               may set any privilege bit\n SYSPRV               may access objects via system protection\n BYPASS               may bypass all object access controls\n'
                : ' TMPMBX               may create temporary mailbox\n NETMBX               may create network device\n');
        }
        sh.out(out2);
        return;
    case 'DEFAULT':
        sh.out('  ' + vmsDirSpec(sh.cwd) + '\n');
        return;
    case 'QUOTA':
        sh.out('  User [' + sh.who.groups[0] + ',' + sh.user + '] has ' + (200 + hash32(sh.user) % 3000) + ' blocks used, ' + (4000 + hash32(h.num) % 4000) +
            ' available,\n  of 10000 authorized and permitted overdraft of 500 blocks on DUA0\n');
        return;
    case 'LOGICAL':
        var want = (a[1] || '').toUpperCase();
        var all = [['SYS$LOGIN', vmsDirSpec(sh.fs.home)], ['SYS$DISK', 'DUA0:'], ['SYS$SYSDEVICE', 'DUA0:'], ['SYS$SYSROOT', 'DUA0:[SYS0.]']];
        Object.keys(VMS_LOGICALS).forEach(function (k) { all.push([k, vmsDirSpec(VMS_LOGICALS[k])]); });
        var hits = all.filter(function (x) { return !want || x[0] === want; });
        if (!hits.length) {
            sh.out('%SHOW-S-NOTRAN, no translation for logical name ' + want + '\n');
            return;
        }
        sh.out(want ? '   "' + hits[0][0] + '" = "' + hits[0][1] + '" (LNM$SYSTEM_TABLE)\n'
            : '\n(LNM$SYSTEM_TABLE)\n\n' + hits.map(function (x) { return '  "' + x[0] + '" = "' + x[1] + '"'; }).join('\n') + '\n');
        return;
    case 'DEVICES':
        sh.out('\nDevice                  Device           Error    Volume         Free  Trans Mnt\n Name                   Status           Count     Label        Blocks Count Cnt\n' +
            'DUA0:                   Mounted              0  VAXVMSRL5      ' + padStart(String(20000 + hash32(h.num) % 90000), 6) + '   ' + (100 + h.users) + '   1\n' +
            'MUA0:                   Online               0\n');
        return;
    case 'INTRUSION':
        if (!sh.priv) {
            sh.out('%SECSRV-E-NOPRIV, no privilege for attempted operation\n');
            return;
        }
        sh.out('Intrusion       Type       Count        Expiration    Source\n\nTERMINAL        SUSPECT       ' + (1 + hash32(h.num) % 4) + '   ' + t.vms.slice(12, 20) + '.00   TTA1:\n');
        return;
    default:
        sh.out('%DCL-W-IVKEYW, unrecognized keyword - check validity and spelling\n \\' + (a[0] || '').toUpperCase() + '\\\n');
    }
}

//  MAIL: the caller's messages, a message to send
function vmsMail(sh, a) {
    var io = sh.io;
    var box = fsLook(sh.fs, '/', sh.fs.home + '/MAIL.MAI', { root: true }).node;
    var msgs = box.msgs || [];
    var cur = -1;
    if (box.newMail) {
        sh.out('\nYou have ' + box.newMail + ' new message' + (box.newMail === 1 ? '' : 's') + '.\n');
        box.newMail = 0;
    }
    var show = function (i) {
        var m = msgs[i];
        sh.out('\n#' + (i + 1) + '          ' + vmsDate(m.days) + ':12.04                    NEWMAIL\nFrom:   ' + m.from + '\nTo:     ' + m.to +
            '\nCC:     \nSubj:   ' + m.subj + '\n\n' + m.body + '\n');
        if (m.lead) gotLeads(sh.ctx, io, [m.lead], 'backupnode');
        if (sh.w.way === 'mail' && m.subj === 'Audit') io.say('A password, and whose it is. Log in as that account.');
    };
    for (;;) {
        sh.io.out('\r\nMAIL> ');
        var l = sh.io.line(true);
        if (l === null) return 'exit';
        if (l === '\x1a') return;
        var p = vmsParse(l.trim());
        var v = p.words.length ? vmsVerb(p.words[0], [['EXIT', 1], ['QUIT', 1], ['DIRECTORY', 3], ['READ', 1], ['NEXT', 1], ['BACK', 1],
            ['SEND', 1], ['EXTRACT', 2], ['DELETE', 1], ['HELP', 1], ['REPLY', 3]]) : 'NEXT';
        if (/^\d+$/.test(p.words[0] || '')) {
            v = 'READ';
            p.words[1] = p.words[0];
        }
        if (v === 'EXIT' || v === 'QUIT') return;
        if (v === 'DIRECTORY') {
            sh.out('\n    # From                 Date         Subject\n\n' + msgs.map(function (m, i) {
                return padStart(String(i + 1), 5) + ' ' + fit(m.from, 20) + ' ' + fit(vmsDate(m.days).slice(0, 11), 12) + ' ' + m.subj;
            }).join('\n') + '\n');
        } else if (v === 'READ' || v === 'NEXT' || v === 'BACK') {
            var i = v === 'READ' && p.words[1] ? parseInt(p.words[1], 10) - 1 : v === 'BACK' ? cur - 1 : cur + 1;
            if (i < 0 || i >= msgs.length) {
                sh.out(msgs.length ? '%MAIL-E-NOMOREMSG, no more messages\n' : '%MAIL-E-NOTEXIST, folder MAIL does not exist\n');
                continue;
            }
            cur = i;
            show(i);
        } else if (v === 'SEND' || v === 'REPLY') {
            var to = v === 'REPLY' && msgs[cur] ? msgs[cur].from : null;
            if (!to) {
                sh.io.out('To:     ');
                to = sh.io.line(true);
                if (to === null) return 'exit';
            }
            sh.io.out('\r\nSubj:   ');
            var subj = sh.io.line(true);
            if (subj === null) return 'exit';
            sh.out('Enter your message below. Press CTRL/Z when complete, or CTRL/C to quit:\n');
            var body = vmsLines(sh);
            if (body === null) return 'exit';
            var name = String(to).toUpperCase().replace(/^.*::/, '');
            var known = sh.w.staff.indexOf(name) >= 0 || name === 'SYSTEM' || name === sh.user || !!sh.ctx.ov.acc[name] ||
                sh.ctx.host.accounts.some(function (x) { return x[0].toUpperCase() === name; }) ||
                keepSeen(sh.ctx.seed, sh.w.h.num).some(function (x) { return x.u === name; });
            if (!known) {
                sh.out('%MAIL-E-NOSUCHUSR, no such user ' + name + '\n');
                continue;
            }
            if (name === sh.w.boss || name === 'SYSTEM') addHeat(sh.ctx.p, 2);
            if (name === sh.user) {
                msgs.push(vmsMsg(sh.w.name + '::' + sh.user, sh.user, subj, body.join('\n'), 0));
            } else if (name !== sh.w.boss && name !== 'SYSTEM') {
                //  it waits there for whoever logs in as them, players included
                keepSendMail(sh.ctx, name, sh.user, String(subj).slice(0, 60), body.join('\n').slice(0, 1000));
            }
        } else if (v === 'EXTRACT') {
            if (cur < 0) {
                sh.out('%MAIL-E-NOTREADIN, you aren\'t reading a message\n');
                continue;
            }
            var sp = vmsSpec(sh, p.words[1] || 'MAIL.TXT', { type: 'TXT' });
            if (sp.err) {
                sh.out('%MAIL-E-OPENOUT, error opening ' + (p.words[1] || '').toUpperCase() + ' as output\n' + vmsRMS(sp.err) + '\n');
                continue;
            }
            var m = msgs[cur];
            if (vmsWrite(sh, 'MAIL', sp, 'From:   ' + m.from + '\nTo:     ' + m.to + '\nSubj:   ' + m.subj + '\n\n' + m.body + '\n')) {
                sh.out('%MAIL-I-CREATED, ' + vmsDirSpec(sp.dir) + sp.name + '.' + sp.type + ';1 created\n');
            }
        } else if (v === 'DELETE') {
            sh.out(cur < 0 ? '%MAIL-E-NOTREADIN, you aren\'t reading a message\n' : '');
        } else if (v === 'HELP') {
            sh.out('\n  BACK  DELETE  DIRECTORY  EXIT  EXTRACT  HELP  NEXT  QUIT  READ  REPLY  SEND\n\n  Press RETURN to read the next message.\n');
        } else {
            sh.out('%MAIL-E-IVVERB, unrecognized command verb\n');
        }
    }
}

//  EDT, line mode: enough to read and write a file
function vmsEdit(sh, a) {
    if (!a[0]) {
        sh.out('_File: ');
        var f = sh.io.line(true);
        if (f === null) return 'exit';
        a = [f];
    }
    var sp = vmsSpec(sh, a[0], {});
    if (sp.err || !sp.name) {
        sh.out('%EDT-F-OPENIN, error opening ' + a[0].toUpperCase() + ' as input\n' + vmsRMS(sp.err || 'syntax') + '\n');
        return;
    }
    var list = vmsMatches(sh, sp);
    var lines = [];
    if (list.err) {
        sh.out('%EDT-F-OPENIN, error opening ' + vmsShowSpec(sp) + ' as input\n' + vmsRMS(list.err) + '\n');
        return;
    }
    if (list.length) {
        var text = vmsRead(sh, 'EDT', list[0][0], list[0][1], sp);
        if (text === null) return;
        lines = text.replace(/\n$/, '').split('\n');
        sh.out('    1        ' + lines[0] + '\n');
    } else {
        sh.out('Input file does not exist\n[EOB]\n');
    }
    for (;;) {
        sh.io.out('*');
        var c = sh.io.line(true);
        if (c === null) return 'exit';
        var cmd = c.trim().toUpperCase();
        if (/^EX(I|IT)?$/.test(cmd)) {
            var made = vmsWrite(sh, 'EDT', sp, lines.join('\n') + (lines.length ? '\n' : ''));
            if (made) sh.out(vmsDirSpec(sp.dir) + sp.name + '.' + sp.type + ';' + made.ver + ' ' + lines.length + ' lines\n');
            return;
        } else if (/^QU(I|IT)?$/.test(cmd)) {
            return;
        } else if (/^T(YPE)?\s+W(HOLE)?$/.test(cmd) || cmd === 'T W') {
            sh.out(lines.map(function (l, i) { return padStart(String(i + 1), 5) + '        ' + l; }).join('\n') + (lines.length ? '\n' : '') + '[EOB]\n');
        } else if (/^I(NSERT)?$/.test(cmd)) {
            var more = vmsLines(sh);
            if (more === null) return 'exit';
            lines = lines.concat(more);
        } else if (/^H(ELP)?$/.test(cmd)) {
            sh.out('  TYPE WHOLE    show the file\n  INSERT        add lines at the end, CTRL/Z to stop\n  EXIT          save and leave\n  QUIT          leave without saving\n');
        } else if (cmd) {
            sh.out('Unrecognized command\n');
        }
    }
}
// ---- end lib/carrier_vms.js ----
// ---- lib/carrier_prime.js ----
//
//  CARRiER's Prime hosts (phase 6): a PRIMOS disk and the commands that
//  work on it.
//
//  A partition has a master file directory (the MFD) of top-level
//  directories, UFDs: the system's own (CMDNC0 for commands, SYSOVL, LIB,
//  SYSCOM, SAD for the system administrator) and one per user. A path is
//  <VOLUME>UFD>SUB>FILE; UFD>FILE starts at the MFD, *>FILE at where you're
//  attached. Access is by ACLs: ALL, LUR (list, use, read) or NONE, for the
//  owner, a group (.STAFF$) and everyone else ($REST). In the tree
//  (carrier_fs.js) those are the owner, group and world thirds of a mode.
//
//  The three things to find (docs/design.md):
//    * the way up: SYSTEM's password, in a batch job that logs itself in
//      (a CPL program in SYSOVL, a command input file in a user's UFD) or
//      a user's list of passwords. The memo in your UFD points the way.
//    * leads: SYSOVL>DIALUPS.TXT (SYSTEM only), a user's phone list,
//      PRIMENET nodes through NETLINK
//    * loot: the user profiles, through EDIT_PROFILE (SYSTEM only), and
//      the file the organization would least want taken
//

var PRIME_WAYS = ['cpl', 'comi', 'stuff'];

function primeWorld(ctx) {
    var h = ctx.host;
    var r = rng(hash32(ctx.seed + '|prime|' + h.num));
    var staff = someUsers(h, 8).filter(function (n) { return ['operator', 'field', 'admin'].indexOf(n) < 0; })
        .slice(0, 5).map(function (n) { return n.toUpperCase(); });
    var w = { h: h, r: r, kind: 'prime', staff: staff, boss: staff[0], peers: staff.slice(1), real: {} };
    w.vol = h.name.slice(0, 6).toUpperCase();
    staff.forEach(function (n) {
        w.real[n] = pick(r, UNIX_FIRST) + ' ' + pick(r, UNIX_LAST);
    });
    w.way = pick(r, PRIME_WAYS);
    w.stuffUser = w.peers[0];
    w.phonesUser = w.peers[1];
    w.comiUser = w.peers[2];
    w.nodes = neighbours(ctx.seed, h, 'prime', 2).map(function (num) {
        return { num: num, name: hostAtNum(ctx, num, 'prime').name.slice(0, 6).toUpperCase() };
    });
    w.secret = h.secret;
    return w;
}

//  A date as LD -DETAIL shows it: 93-11-07.14:02:11
function primeDate(daysAgo, r) {
    var now = new Date();
    var d = new Date(1993, now.getMonth(), now.getDate() - daysAgo, 0, 0, 0);
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var hh = r ? Math.floor(r() * 24) : 9;
    var mm = r ? Math.floor(r() * 60) : 14;
    return '93-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '.' + p2(hh) + ':' + p2(mm) + ':' + p2((hh * mm) % 60);
}

function primeFile(own, grp, mode, text, days, type) {
    return fsFile(own, grp, mode, text, primeDate(days, function () { return (hash32(own + days) % 1000) / 1000; }), type);
}

//  ---- the tree ----

function primeTree(ctx) {
    var w = primeWorld(ctx);
    var r = w.r;
    var old = function () { return 200 + Math.floor(r() * 400); };
    var recent = function () { return 1 + Math.floor(r() * 60); };
    var root = fsDir('SYSTEM', 'SYSTEM', 'rwxr-xr-x', primeDate(old(), r));
    var put = function (path, node) { return fsPut(root, path, node); };
    var ufd = function (path, own, grp, mode) {
        var have = fsLook({ root: root, home: '/' }, '/', path, { root: true }, true).node;
        if (have && have.dir) return have;
        return put(path, fsDir(own || 'SYSTEM', grp || 'SYSTEM', mode || 'rwxr-xr-x', primeDate(old(), r)));
    };
    var prog = function (path, size, strs) {
        var f = put(path, primeFile('SYSTEM', 'SYSTEM', 'rwxr-xr-x', '', old(), 'exec'));
        f.size = size;
        f.strs = strs || [];
        return f;
    };

    ['CMDNC0', 'SYSOVL', 'LIB', 'SYSCOM', 'PRIMENET*', 'HELP*', 'INFO', 'SPOOLQ', 'DOWN_LINE_LOAD*'].forEach(function (u) { ufd('/' + u); });
    ufd('/SAD', 'SYSTEM', 'SYSTEM', 'rwx------');
    ['ATTACH', 'LD', 'SLIST', 'COPY', 'DELETE', 'CREATE', 'ED', 'EDIT_PROFILE', 'CHANGE_PASSWORD', 'LIST_ACCESS', 'SET_ACCESS',
        'STATUS', 'NETLINK', 'MESSAGE', 'MAGSAV', 'MAGRST', 'SPOOL', 'FUTIL', 'BASIC', 'F77', 'COBOL', 'SEG', 'BIND'].forEach(function (c) {
        prog('/CMDNC0/' + c + '.RUN', 4000 + Math.floor(r() * 60000), [c, 'Not found.', 'Insufficient access rights.']);
    });
    put('/CMDNC0/EDIT_PROFILE.RUN', primeFile('SYSTEM', 'SYSTEM', 'rwxr-xr-x', '', old(), 'exec')).strs = ['[EDIT_PROFILE Rev.', 'SAD', 'LIST_USER', 'ADD_USER'];
    put('/SAD/UVF', primeFile('SYSTEM', 'SYSTEM', 'rw-------', '', recent(), 'data')).size = 20000 + Math.floor(r() * 9000);
    put('/SAD/MFD', primeFile('SYSTEM', 'SYSTEM', 'rw-------', '', old(), 'data')).size = 2048;
    put('/SYSCOM/KEYS.INS.FTN', primeFile('SYSTEM', 'SYSTEM', 'rw-r--r--', 'C KEYS.INS.FTN -- PRIMOS FILE SYSTEM KEYS\n      INTEGER*2 K$READ,K$WRIT,K$CLOS\n      PARAMETER (K$READ=1,K$WRIT=2,K$CLOS=4)\n', old()));
    put('/SYSCOM/ERRD.INS.FTN', primeFile('SYSTEM', 'SYSTEM', 'rw-r--r--', 'C ERRD.INS.FTN -- PRIMOS ERROR CODES\n      INTEGER*2 E$FNTF,E$NRIT\n      PARAMETER (E$FNTF=15,E$NRIT=10)\n', old()));
    put('/INFO/PRIMOS.NEWS', primeFile('SYSTEM', 'SYSTEM', 'rw-r--r--', 'PRIMOS ' + w.h.version + ' is now running on ' + w.vol + '.\n\nNew this revision: ACLs on every UFD.  LIST_ACCESS shows them.\n', recent()));
    put('/SYSOVL/PRIMENET.CONFIG', primeFile('SYSTEM', 'SYSTEM', 'rw-r--r--', function () {
        return '/* PRIMENET configuration, ' + w.vol + '\nNODE ' + w.vol + '\n' + w.nodes.map(function (nd) { return 'REMOTE ' + nd.name + '  X.25'; }).join('\n') + '\n';
    }, old()));
    put('/SYSOVL/SPOOL.CPL', primeFile('SYSTEM', 'SYSTEM', 'rw-r--r--', '/* start the spooler\nSPOOL -START\n&RETURN\n', old()));
    put('/SYSOVL/NIGHTLY.COMI', primeFile('SYSTEM', 'SYSTEM', 'rw-------', 'COMO NIGHTLY.COMO\nMAGSAV -UNIT 0 -INC\nCOMO -END\nLO\n', recent()));
    var dial = put('/SYSOVL/DIALUPS.TXT', primeFile('SYSTEM', 'SYSTEM', 'rw-------', function () {
        return 'PRIMENET remote dialups, ' + w.h.org + '\n\n' + leadsOf(ctx, 3).map(function (num) { return '  ' + fmtNum(num); }).join('\n') + '\n';
    }, recent()));
    dial.onRead = function (c, io) {
        gotLeads(c, io, leadsOf(c, 3), 'dialups');
        io.say('Dialups: numbers that answer with a carrier. They\'re on your found list.');
    };

    //  the way up
    put('/SYSOVL/BACKUP.CPL', primeFile('SYSTEM', 'SYSTEM', w.way === 'cpl' ? 'rw-r--r--' : 'rw-------', function () {
        return '/* nightly backup, ' + w.boss + '\n' + (w.way === 'cpl' ? '&DATA LOGIN ' + w.secret[0] + ' ' + w.secret[1] + '\n' : '&DATA LOGIN SYSTEM\n') +
            'MAGSAV -UNIT 0 -INC\nLO\n&END\n';
    }, recent())).onRead = w.way === 'cpl' ? function (c, io) { io.say('A batch job that logs itself in: whose account, and its password.'); } : null;

    //  the users
    w.staff.forEach(function (n) {
        var priv = n === w.boss || r() < 0.3;
        var d = ufd('/' + n, n, 'STAFF', priv ? 'rwx------' : 'rwxr-x---');
        d.kids['LOGIN.CPL'] = primeFile(n, 'STAFF', 'rw-r-----', '/* login\nTERM -ERASE ^H -KILL ^U\nABBREV -ON\n', old());
        d.kids['C_PRMO'] = primeFile(n, 'STAFF', 'rw-r-----', '', old(), 'data');
        d.kids['C_PRMO'].size = 1024;
        var plans = UNIX_PLANS[w.h.prof] || UNIX_PLANS.biz;
        d.kids['TO_DO'] = primeFile(n, 'STAFF', 'rw-r-----', pick(r, plans) + '\n', recent());
    });
    if (w.comiUser) {
        var cd = ufd('/' + w.comiUser);
        cd.mode = 'rwxr-xr-x';
        cd.kids['NIGHTLY.COMI'] = primeFile(w.comiUser, 'STAFF', w.way === 'comi' ? 'rw-r--r--' : 'rw-r-----', function () {
            return (w.way === 'comi' ? 'LOGIN ' + w.secret[0] + ' ' + w.secret[1] + '\n' : '') + 'A ' + w.comiUser + '\nFUTIL\nTRECPY REPORTS TO REPORTS.OLD\nQ\nLO\n';
        }, recent());
        if (w.way === 'comi') cd.kids['NIGHTLY.COMI'].onRead = function (c, io) { io.say('A command file that logs itself in: whose account, and its password.'); };
    }
    var sd = ufd('/' + w.stuffUser);
    sd.mode = 'rwxr-xr-x';
    sd.kids['PASSWORDS'] = primeFile(w.stuffUser, 'STAFF', w.way === 'stuff' ? 'rw-r--r--' : 'rw-------', function () {
        var lines = ['Bank card   ' + (1000 + hash32(w.stuffUser) % 9000), 'Library     ' + w.stuffUser + '1', 'Dialup      ' + pick(rng(hash32(w.stuffUser)), SECRET_WORDS)];
        if (w.way === 'stuff') lines.splice(1, 0, fit(w.secret[0], 12) + w.secret[1] + '   (' + w.boss + ' changed it again)');
        return lines.join('\n') + '\n';
    }, recent());
    if (w.way === 'stuff') sd.kids['PASSWORDS'].onRead = function (c, io) { io.say('A password, and whose it is. Log in as that account.'); };

    //  a lead: a phone list
    var phoneNums = leadsOf(ctx, 5).slice(3);
    if (w.phonesUser && phoneNums.length) {
        var pd = ufd('/' + w.phonesUser);
        pd.mode = 'rwxr-xr-x';
        pd.kids['PHONES'] = primeFile(w.phonesUser, 'STAFF', 'rw-r--r--', function () {
            return phoneNums.map(function (num, i) {
                return fit(['Other site', 'Vendor support', 'The plant', 'Remote office'][i % 4], 18) + fmtNum(num).slice(2);
            }).join('\n') + '\n';
        }, recent());
        pd.kids['PHONES'].onRead = function (c, io) {
            gotLeads(c, io, phoneNums, 'phones');
            io.say('A phone list. If those numbers answer with a carrier, they\'re on your found list now.');
        };
    }

    //  the loot only staff can read
    var prize = unixPrize({ h: w.h });
    if (prize) {
        var where = { edu: ['REGISTRAR', 'GRADES.93'], biz: ['PAYROLL', 'PAYROLL.DAT'], gov: ['CONTRACTS', 'INDEX'], telco: ['FRAME', 'SWITCH.RPT'] }[w.h.prof];
        ufd('/' + where[0], w.boss, 'STAFF', 'rwxr-x---');
        put('/' + where[0] + '/' + where[1], primeFile(w.boss, 'STAFF', 'rw-r-----', prize[2], recent())).onRead = function (c, io) {
            gotLoot(c, io, prize[1], 'prize', 15);
        };
    }
    if (w.h.prof === 'telco') {
        var cz = cosmosNear(ctx.seed, w.h);
        var fd = ufd('/FRAME');
        fd.mode = 'rwxr-xr-x';
        fd.kids['NOTES'] = primeFile(w.boss, 'STAFF', 'rw-r--r--', function () {
            if (!cz) return 'MLT down again.\n';
            var ca = hostAtNum(ctx, cz, 'cosmos');
            return 'MLT down again.\nCOSMOS is on ' + fmtNum(cz).slice(2) + '. login ' + ca.accounts[0][0] +
                (ca.accounts[0][1] ? ' pw ' + ca.accounts[0][1] : ' (no pw)') + ', wc ' + ca.wc + '\n';
        }, recent());
        fd.kids['NOTES'].onRead = function (c, io) {
            if (cz) {
                gotLeads(c, io, [cz], 'cosmos');
                io.say('COSMOS: the phone company\'s own database. It\'s on your found list.');
            }
        };
    }
    //  EDIT_PROFILE's log of changes to the user list (no random draws:
    //  it comes last, so the rest of the tree stays as it was)
    put('/SAD/EDIT_PROFILE.LOG', primeFile('SYSTEM', 'SYSTEM', 'rw-------', '', 40));
    return { root: root, home: '/', w: w };
}

//  The caller's UFD, made if their account has none, with the memo
function primeMoveIn(fs, user, priv) {
    var w = fs.w;
    var home = '/' + user;
    fs.home = home;
    var had = fsLook(fs, '/', home, { root: true }).node;
    if (!had || !had.dir) {
        var d = fsPut(fs.root, home, fsDir(user, priv ? 'SYSTEM' : 'USERS', 'rwxr-x---', primeDate(90)));
        d.kids['LOGIN.CPL'] = primeFile(user, d.grp, 'rw-r-----', '/* login\nTERM -ERASE ^H\n', 90);
    }
    var hd = fsLook(fs, '/', home, { root: true }).node;
    if (!priv) {
        var memo = ['From ' + w.boss + ', to all users:', '', 'EDIT_PROFILE is restricted to SAD members.  Do not ask.'];
        if (w.way === 'cpl') memo.push('Batch jobs run from SYSOVL>BACKUP.CPL now.  Sorry about the mess.');
        if (w.way === 'comi') memo.push(w.comiUser + '\'s NIGHTLY.COMI still logs itself in.  ' + w.comiUser + ', fix it.');
        if (w.way === 'stuff') memo.push(w.stuffUser + ', take the password list out of your UFD.  I mean it.');
        memo.push('', 'LD lists a directory, SLIST shows a file, A attaches.');
        hd.kids['MEMO.TXT'] = primeFile(user, hd.grp, 'rw-r--r--', memo.join('\n') + '\n', 6);
    }
}

//  ---- paths ----

//  The tree path for a PRIMOS pathname, or null (with why) when it names
//  another partition. top: a bare name is a top-level UFD (ATTACH).
function primePath(sh, p, top) {
    var s = String(p || '').toUpperCase();
    var m = /^<([^>]*)>(.*)$/.exec(s);
    if (m) {
        if (m[1] !== sh.w.vol && m[1] !== '*') return null;
        return '/' + m[2].split('>').filter(function (x) { return x; }).join('/');
    }
    if (s.indexOf('*>') === 0) {
        return fsAbs(sh.cwd, s.slice(2).split('>').join('/'), '/');
    }
    if (s === 'MFD' || s === '<*>') {
        return '/';
    }
    if (s.indexOf('>') >= 0 || top) {
        return '/' + s.split('>').filter(function (x) { return x; }).join('/');
    }
    return fsAbs(sh.cwd, s, '/');
}

//  <VOL>A>B as PRIMOS writes a path
function primeShow(sh, abs) {
    return '<' + sh.w.vol + '>' + fsSplit(abs).join('>');
}

//  A third of a mode as an ACL right
function primeRight(m) {
    return m === 'rwx' ? 'ALL' : m === 'r-x' ? 'LUR' : m === 'r--' ? 'LR' : m === 'rw-' ? 'DALURW' : m === '---' ? 'NONE' : 'LURW';
}

//  Looks a pathname up for a command; complains as PRIMOS did and returns
//  { node, path, look } or null
function primeFind(sh, cmd, p, top) {
    var abs = primePath(sh, p, top);
    if (abs === null) {
        sh.err('Not found. ' + p.toUpperCase() + ' (' + cmd + ')');
        return null;
    }
    var look = fsLook(sh.fs, '/', abs, sh.who);
    if (look.err === 'denied') {
        sh.err('Insufficient access rights. ' + p.toUpperCase() + ' (' + cmd + ')');
        return null;
    }
    if (look.err || !look.node) {
        sh.err('Not found. ' + p.toUpperCase() + ' (' + cmd + ')');
        return null;
    }
    return { node: look.node, path: look.path, look: look };
}

function primeWrite(sh, cmd, p, text) {
    var abs = primePath(sh, p);
    var look = abs === null ? { err: 'missing' } : fsLook(sh.fs, '/', abs, sh.who);
    if (look.err || (!look.node && !look.parent)) {
        sh.err((look.err === 'denied' ? 'Insufficient access rights. ' : 'Not found. ') + p.toUpperCase() + ' (' + cmd + ')');
        return null;
    }
    if (look.node && (look.node.dir || !fsCan(look.node, sh.who, 'w'))) {
        sh.err('Insufficient access rights. ' + p.toUpperCase() + ' (' + cmd + ')');
        return null;
    }
    if (!look.node && !fsCan(look.parent, sh.who, 'w')) {
        sh.err('Insufficient access rights. ' + p.toUpperCase() + ' (' + cmd + ')');
        return null;
    }
    var f = look.node || primeFile(sh.who.user, sh.who.groups[0], 'rw-r-----', '', 0);
    f.text = text;
    f.type = 'text';
    delete f.size;
    f.mt = primeDate(0, function () { return 0.5; });
    if (!look.node) look.parent.kids[look.name] = f;
    keepMark(sh.fs, look.path);
    return f;
}

function primeRead(sh, cmd, found) {
    var n = found.node;
    if (n.dir) {
        sh.err('Wrong file type. ' + primeShow(sh, found.path) + ' (' + cmd + ')');
        return null;
    }
    if (!fsCan(n, sh.who, 'r')) {
        sh.err('Insufficient access rights. ' + primeShow(sh, found.path) + ' (' + cmd + ')');
        return null;
    }
    if (n.onRead) {
        sh.after = (sh.after || []).concat([n.onRead]);
        if (!n.repeat) n.onRead = null;
    }
    return n.type === 'exec' || n.type === 'data' ? unixGarbage(n) : fsText(n);
}

//  ---- the commands ----

//  Command names and the abbreviations PRIMOS took
var PRIME_ALIASES = { A: 'ATTACH', LAC: 'LIST_ACCESS', SAC: 'SET_ACCESS', STAT: 'STATUS', DL: 'DELETE', CP: 'COPY', CREA: 'CREATE',
    LO: 'LOGOUT', CPW: 'CHANGE_PASSWORD', EP: 'EDIT_PROFILE', NL: 'NETLINK', M: 'MESSAGE', R: 'RESUME', LQ: 'LIST_QUOTA', HELP: 'HELP', H: 'HELP' };

var PRIME_QUIET = ['ATTACH', 'WHERE', 'LD', 'DATE', 'HELP', 'STATUS', 'LIST_ACCESS', 'LIST_QUOTA'];

function runPrime(ctx, io, preAuth) {
    var h = ctx.host;
    ctx.ov = keepLoad(ctx.seed, h.num);
    var t = era();
    io.out('\r\nPRIMENET ' + h.version + ' ' + h.name + '\r\n');
    var user = preAuth ? preAuth[0] : null;
    for (var junk = 0; junk < 6 && !user; junk++) {
        var l = io.line(true);
        if (l === null) return;
        var m = /^\s*LO(GIN)?\s+(\S+)/i.exec(l);
        if (m) {
            user = m[2];
        } else {
            io.out('ER! ');
        }
    }
    if (!user) {
        return;
    }
    io.out('Password? ');
    var pw = io.line(false);
    if (pw === null) return;
    io.out('\r\n');
    var acct = findAccount({ accounts: keepAccounts(ctx, h.accounts, true) }, user, pw, true);
    if (!acct) {
        io.out('Invalid user id or password; please try again.\r\n');
        failedLogin(ctx);
        return;
    }
    var name = acct[0].toUpperCase();
    var num = 20 + h.users;
    io.out(name + ' (user ' + num + ') logged in ' + t.prime + '.\r\n');
    io.out('Welcome to PRIMOS version ' + h.version + '.\r\nCopyright (c) Prime Computer, Inc. 1993.\r\n');
    io.out('Last login ' + t.prime.split('  ')[0] + '  08:41:02.\r\n\r\n');
    if (ctx.ov.note) io.out(unixLines('*** ' + ctx.ov.note.toUpperCase() + '\n\n'));
    var priv = loggedIn(ctx, acct, io);
    var fs = primeTree(ctx);
    keepOpen(ctx, fs, function () { return primeTree(ctx); });
    primeMoveIn(fs, name, priv);
    var sh = { ctx: ctx, io: io, fs: fs, w: fs.w, user: name, num: num, acct: acct, priv: priv, cwd: fs.home, ok: true };
    sh.who = { user: name, groups: [priv ? 'SYSTEM' : fs.w.staff.indexOf(name) >= 0 ? 'STAFF' : 'USERS'], root: !!priv };
    sh.out = function (s) { io.out(unixLines(s)); };
    sh.err = function (s) { sh.out(s + '\n'); sh.ok = false; };
    sh.tty = 'asr' + (1 + v3.util.random(3));
    sh.on = keepOn(ctx, name, sh.tty);
    var deaf = keepListen(ctx, io, name, sh.on, function (x) {
        return unixLines('\n*** ' + x.from + ' (user ' + (20 + (hash32(x.from) % 60)) + ') on ' + keepClock(x.at) + '\n' + x.m + '\n');
    });
    primeShell(sh);
    deaf();
    keepOff(ctx, sh.on);
}

function primeShell(sh) {
    var ctx = sh.ctx;
    var io = sh.io;
    for (;;) {
        io.out(sh.ok ? 'OK, ' : 'ER! ');
        sh.ok = true;
        var cmd = io.line(true);
        if (cmd === null) return;
        var c = cmd.trim().replace(/\s+/g, ' ');
        if (!c) continue;
        var w = c.split(' ');
        var verb = w[0].toUpperCase();
        verb = PRIME_ALIASES[verb] || verb;
        if (verb !== 'MESSAGE' && verb !== 'LOGOUT' && watched(ctx, io, PRIME_QUIET.indexOf(verb) >= 0 ? 0.3 : 1)) return;
        var fn = PRIME_CMDS[verb];
        if (!fn) {
            sh.err('Not found. ' + w[0].toUpperCase() + ' (std$cp)');
            continue;
        }
        var res = fn(sh, w.slice(1), c);
        if (sh.after) {
            var after = sh.after;
            sh.after = null;
            after.forEach(function (f) { f(ctx, io); });
        }
        if (keepSave(sh.fs) === 'full') {
            sh.err('Disk full. (std$cp)');
            io.say('This Prime has no room for more of what players leave. What you just did lasts only this call.');
        }
        if (res === 'exit' || io.over) return;
    }
}

//  A line in EDIT_PROFILE's log: what changed in the user list, and who
//  did it
function primeAudit(sh, what) {
    keepLog(sh.fs, '/SAD/EDIT_PROFILE.LOG', [era().prime.split('  ')[0] + '  ' + sh.user + '  ' + what], 40);
}

//  Whether name is a privileged account the host came with
function primePrivAccount(sh, name) {
    return name === 'SYSTEM' || sh.ctx.host.accounts.some(function (a) { return a[0].toUpperCase() === name && a[2]; });
}

var PRIME_HELP = {
    ATTACH: 'ATTACH pathname       (A)  attach to a directory.  A name alone is a top-level UFD;\n                            *>SUB is below where you are.  A -HOME goes home.',
    LD: 'LD [pathname] [-DETAIL]    list a directory',
    SLIST: 'SLIST pathname             show a file at your terminal',
    WHERE: 'WHERE                      the directory you\'re attached to',
    LIST_ACCESS: 'LIST_ACCESS [pathname] (LAC)  show who may do what to it',
    STATUS: 'STATUS [USERS|ME|NETWORK]  (STAT)',
    COPY: 'COPY from to               (CP)',
    DELETE: 'DELETE pathname            (DL)',
    CREATE: 'CREATE pathname            make a directory',
    ED: 'ED [pathname]              the line editor.  Lines you type go in; an empty line\n                           switches to EDIT, where P prints, FILE saves, Q quits.',
    EDIT_PROFILE: 'EDIT_PROFILE               (EP)  user profiles.  System administrators only.',
    MESSAGE: 'MESSAGE user               (M)  send a user a line',
    NETLINK: 'NETLINK                    (NL)  log in to another PRIMENET node: C node',
    LOGOUT: 'LOGOUT                     (LO)',
    TYPE: 'TYPE text                  types the text back at you',
};

var PRIME_CMDS = {
    LOGOUT: function (sh) {
        sh.out(sh.user + ' (user ' + sh.num + ') logged out ' + era().prime + '.\nTime used:  00h 04m connect, 00m 02s CPU, 00m 01s I/O.\n');
        return 'exit';
    },
    HELP: function (sh, a) {
        var k = (a[0] || '').toUpperCase();
        k = PRIME_ALIASES[k] || k;
        if (k && PRIME_HELP[k]) {
            sh.out(PRIME_HELP[k] + '\n');
        } else if (k) {
            sh.err('No help available for ' + k + '. (HELP)');
        } else {
            sh.out('HELP is available for:\n' + unixColumns(Object.keys(PRIME_HELP).sort()));
        }
    },
    DATE: function (sh) { sh.out(era().prime + '\n'); },
    TYPE: function (sh, a) { sh.out(a.join(' ') + '\n'); },
    WHERE: function (sh) { sh.out('Current directory is ' + primeShow(sh, sh.cwd) + '\n'); },
    ATTACH: function (sh, a) {
        if (!a.length || /^-HO(ME)?$/i.test(a[0])) {
            sh.cwd = sh.fs.home;
            return;
        }
        var f = primeFind(sh, 'ATTACH', a[0], true);
        if (!f) return;
        if (!f.node.dir) {
            sh.err('Not a directory. ' + a[0].toUpperCase() + ' (ATTACH)');
            return;
        }
        if (!fsCan(f.node, sh.who, 'x')) {
            sh.err('Insufficient access rights. ' + a[0].toUpperCase() + ' (ATTACH)');
            return;
        }
        sh.cwd = f.path;
    },
    LD: function (sh, a) {
        var detail = a.some(function (x) { return /^-DE/i.test(x); });
        var target = a.filter(function (x) { return x.charAt(0) !== '-'; })[0];
        var f = target ? primeFind(sh, 'LD', target) : { node: fsLook(sh.fs, '/', sh.cwd, { root: true }).node, path: sh.cwd };
        if (!f) return;
        if (!f.node.dir) {
            sh.err('Not a directory. ' + target.toUpperCase() + ' (LD)');
            return;
        }
        if (!fsCan(f.node, sh.who, 'r')) {
            sh.err('Insufficient access rights. ' + primeShow(sh, f.path) + ' (LD)');
            return;
        }
        var own = f.node.own === sh.who.user || sh.priv ? 'ALL' : primeRight(f.node.mode.slice(sh.who.groups.indexOf(f.node.grp) >= 0 ? 3 : 6, sh.who.groups.indexOf(f.node.grp) >= 0 ? 6 : 9));
        var names = Object.keys(f.node.kids).sort();
        var files = names.filter(function (n) { return !f.node.kids[n].dir; });
        var dirs = names.filter(function (n) { return f.node.kids[n].dir; });
        var recs = names.reduce(function (s, n) { return s + Math.max(1, Math.ceil(fsSize(f.node.kids[n]) / 2048)); }, 0);
        var out = '\n' + primeShow(sh, f.path) + ' (' + own + ' access)\n' + recs + ' records in this directory, ' + recs + ' total records out of quota of 0.\n';
        var block = function (list, label) {
            if (!list.length) return '';
            if (detail) {
                return '\n' + list.length + ' ' + label + (list.length === 1 ? '' : 's') + '.\n\n' + list.map(function (n) {
                    var k = f.node.kids[n];
                    return fit(n, 32) + fit(k.dir ? 'UFD' : k.type === 'data' ? 'DAM' : 'SAM', 6) + padStart(String(Math.max(1, Math.ceil(fsSize(k) / 2048))), 5) + '  ' + k.mt;
                }).join('\n') + '\n';
            }
            return '\n' + list.length + ' ' + label + (list.length === 1 ? '' : 's') + '.\n\n' + unixColumns(list.map(function (n) { return fit(n, 15); }));
        };
        out += block(files, 'File') + block(dirs, 'Directory').replace('Directorys', 'Directories');
        sh.out(out + '\n');
    },
    SLIST: function (sh, a) {
        if (!a.length) {
            sh.err('Bad syntax. (SLIST)');
            return;
        }
        var f = primeFind(sh, 'SLIST', a[0]);
        if (!f) return;
        var text = primeRead(sh, 'SLIST', f);
        if (text !== null) sh.out(text);
    },
    LIST_ACCESS: function (sh, a) {
        var f = a[0] ? primeFind(sh, 'LIST_ACCESS', a[0]) : { node: fsLook(sh.fs, '/', sh.cwd, { root: true }).node, path: sh.cwd };
        if (!f) return;
        var m = f.node.mode;
        sh.out('\nACL protecting "' + primeShow(sh, f.path) + '":\n' + fit('        ' + f.node.own + ':', 26) + primeRight(m.slice(0, 3)) + '\n' +
            fit('        .' + f.node.grp + '$:', 26) + primeRight(m.slice(3, 6)) + '\n' + fit('        $REST:', 26) + primeRight(m.slice(6, 9)) + '\n\n');
    },
    SET_ACCESS: function (sh, a) {
        var f = a[0] ? primeFind(sh, 'SET_ACCESS', a[0]) : null;
        if (!f) {
            if (!a[0]) sh.err('Bad syntax. (SET_ACCESS)');
            return;
        }
        if (!sh.priv && f.node.own !== sh.who.user) {
            sh.err('Insufficient access rights. ' + a[0].toUpperCase() + ' (SET_ACCESS)');
            return;
        }
        var mode = f.node.mode.split('');
        a.slice(1).forEach(function (pair) {
            var kv = /^(\$REST|\.\w+\$?|\w+):(\w+)$/i.exec(pair);
            if (!kv) return;
            var at = /^\$REST$/i.test(kv[1]) ? 6 : kv[1].charAt(0) === '.' ? 3 : 0;
            var rt = kv[2].toUpperCase();
            var bits = rt === 'ALL' ? 'rwx' : rt === 'NONE' ? '---' : (/R/.test(rt) ? 'r' : '-') + (/W/.test(rt) ? 'w' : '-') + (/U/.test(rt) ? 'x' : '-');
            mode.splice(at, 3, bits.charAt(0), bits.charAt(1), bits.charAt(2));
        });
        f.node.mode = mode.join('');
        keepMark(sh.fs, f.path);
    },
    STATUS: function (sh, a) {
        var what = (a[0] || 'ME').toUpperCase();
        var h = sh.w.h;
        if (/^US/.test(what)) {
            var out = '\nUser          No  Line  Devices\n';
            if (adminOnline(sh.ctx)) out += fit('SYSTEM', 14) + fit('1', 4) + fit('asr', 6) + '<' + sh.w.vol + '>\n';
            sh.w.staff.slice(1, 1 + Math.min(4, h.users)).concat(keepOthersOn(sh.ctx.seed, h.num).map(function (x) { return x.u; }), [sh.user]).forEach(function (n, i) {
                out += fit(n, 14) + fit(String(n === sh.user ? sh.num : 30 + i), 4) + fit(String(i * 3), 6) + '<' + sh.w.vol + '>\n';
            });
            sh.out(out + '\n');
        } else if (/^NET/.test(what)) {
            sh.out('\nPRIMENET node ' + sh.w.vol + '\n\n' + (sh.w.nodes.length ? 'Node    State\n' + sh.w.nodes.map(function (nd) { return fit(nd.name, 8) + 'Up'; }).join('\n') + '\n' : 'No remote nodes configured.\n') + '\n');
        } else {
            sh.out('\nUser ' + sh.user + '  No ' + sh.num + '  attached to ' + primeShow(sh, sh.cwd) + '\n\n');
        }
    },
    LIST_QUOTA: function (sh) {
        sh.out('\nQuota information for ' + primeShow(sh, sh.cwd) + ':\n  0 records used, no maximum.\n\n');
    },
    COPY: function (sh, a) {
        if (a.length < 2) {
            sh.err('Bad syntax. (COPY)');
            return;
        }
        var f = primeFind(sh, 'COPY', a[0]);
        if (!f) return;
        var text = primeRead(sh, 'COPY', f);
        if (text === null) return;
        var made = primeWrite(sh, 'COPY', a[1], f.node.type === 'text' ? text : '');
        if (made) {
            made.type = f.node.type;
            made.size = f.node.size;
        }
    },
    DELETE: function (sh, a) {
        if (!a.length) {
            sh.err('Bad syntax. (DELETE)');
            return;
        }
        var f = primeFind(sh, 'DELETE', a[0]);
        if (!f) return;
        if (!fsCan(f.look.parent, sh.who, 'w')) {
            sh.err('Insufficient access rights. ' + a[0].toUpperCase() + ' (DELETE)');
            return;
        }
        if (f.node.dir && Object.keys(f.node.kids).length) {
            sh.err('Directory not empty. ' + a[0].toUpperCase() + ' (DELETE)');
            return;
        }
        delete f.look.parent.kids[f.look.name];
        keepMark(sh.fs, f.path);
    },
    CREATE: function (sh, a) {
        if (!a.length) {
            sh.err('Bad syntax. (CREATE)');
            return;
        }
        var abs = primePath(sh, a[0]);
        var look = abs === null ? { err: 'missing' } : fsLook(sh.fs, '/', abs, sh.who);
        if (look.node) {
            sh.err('Already exists. ' + a[0].toUpperCase() + ' (CREATE)');
        } else if (look.err || !look.parent || !fsCan(look.parent, sh.who, 'w')) {
            sh.err((look.err === 'missing' ? 'Not found. ' : 'Insufficient access rights. ') + a[0].toUpperCase() + ' (CREATE)');
        } else {
            look.parent.kids[look.name] = fsDir(sh.who.user, sh.who.groups[0], 'rwxr-x---', primeDate(0, function () { return 0.5; }));
            keepMark(sh.fs, look.path);
        }
    },
    ED: function (sh, a) { return primeEd(sh, a[0]); },
    EDIT_PROFILE: function (sh) { return primeProfile(sh); },
    CHANGE_PASSWORD: function (sh) {
        sh.out('Old password? ');
        var o = sh.io.line(false);
        if (o === null) return 'exit';
        sh.out('\nNew password? ');
        var n = sh.io.line(false);
        if (n === null) return 'exit';
        sh.out('\n');
        if (String(o).toUpperCase() !== String(sh.acct[1]).toUpperCase()) {
            sh.err('Invalid password. (CHANGE_PASSWORD)');
        } else if (n && sh.ctx.ov.acc[sh.user]) {
            keepAddAccount(sh.ctx, sh.user, n, sh.ctx.ov.acc[sh.user][1]);
            primeAudit(sh, 'CHANGE_PASSWORD ' + sh.user);
        } else if (n && primePrivAccount(sh, sh.user)) {
            //  the system administrator's password: the box is the caller's
            keepSetPassword(sh.ctx, sh.user, n);
            primeAudit(sh, 'CHANGE_PASSWORD ' + sh.user);
            sh.io.say('The ' + sh.user + ' password is yours now. Anyone holding the old one is locked out. Careful what you leave behind.');
        }
    },
    MESSAGE: function (sh, a, line) {
        var to = (a[0] || '').toUpperCase();
        if (!to) {
            sh.err('Bad syntax. (MESSAGE)');
            return;
        }
        var text = a.slice(1).join(' ');
        //  another player on as them gets it
        if (keepOthersOn(sh.ctx.seed, sh.w.h.num).some(function (x) { return x.u === to; })) {
            if (!text) {
                sh.out('Message: ');
                text = sh.io.line(true);
                if (text === null) return 'exit';
            }
            if (text) keepWriteTo(sh.ctx, to, sh.user, sh.tty, text);
            return;
        }
        if (to !== 'SYSTEM') {
            if (sh.w.staff.indexOf(to) < 0) sh.err('User ' + to + ' not found. (MESSAGE)');
            else sh.out('User ' + to + ' is not receiving messages. (MESSAGE)\n');
            return;
        }
        if (!text) {
            sh.out('Message: ');
            text = sh.io.line(true);
            if (text === null) return 'exit';
        }
        if (bluff(sh.ctx, sh.io, text)) return 'exit';
    },
    NETLINK: function (sh) { return primeNetlink(sh); },
    RESUME: function (sh, a) {
        var p = a[0] || '';
        var f = primeFind(sh, 'RESUME', p.indexOf('>') < 0 && !/\.RUN$/i.test(p) ? p + '.RUN' : p);
        if (f && f.node.type !== 'exec') sh.err('Not a runfile. ' + p.toUpperCase() + ' (RESUME)');
    },
};

//  The line editor: INPUT mode until an empty line, then EDIT
function primeEd(sh, p) {
    var lines = [];
    var made = false;
    if (p) {
        var abs = primePath(sh, p);
        var look = abs === null ? { err: 'missing' } : fsLook(sh.fs, '/', abs, sh.who);
        if (look.node) {
            var text = primeRead(sh, 'ED', { node: look.node, path: look.path });
            if (text === null) return;
            lines = text.replace(/\n$/, '').split('\n');
            sh.out('EDIT\n');
        } else {
            made = true;
        }
    } else {
        made = true;
    }
    var at = 0;
    var input = made;
    if (made) sh.out('INPUT\n');
    for (;;) {
        var l = sh.io.line(true);
        if (l === null) return 'exit';
        if (input) {
            if (l === '') {
                input = false;
                sh.out('EDIT\n');
            } else {
                lines.splice(at, 0, l);
                at++;
            }
            continue;
        }
        var c = l.trim().toUpperCase();
        var m;
        if (c === '') {
            input = true;
            sh.out('INPUT\n');
        } else if (c === 'T' || c === 'TOP') {
            at = 0;
            sh.out('.NULL.\n');
        } else if (c === 'B' || c === 'BOTTOM') {
            at = lines.length;
            sh.out('BOTTOM\n');
        } else if ((m = /^P(RINT)?\s*(\d*)$/.exec(c))) {
            var n = parseInt(m[2] || '1', 10);
            var from = Math.max(0, at - (at > 0 ? 1 : 0));
            var chunk = lines.slice(from, from + n);
            sh.out(chunk.length ? chunk.join('\n') + '\n' : 'BOTTOM\n');
            at = Math.min(lines.length, from + n);
        } else if ((m = /^FILE\s*(\S*)$/.exec(c))) {
            var to = m[1] || p;
            if (!to) {
                sh.out('No file name.\n');
                continue;
            }
            if (primeWrite(sh, 'ED', to, lines.join('\n') + (lines.length ? '\n' : ''))) {
                sh.out(to.toUpperCase() + '\n');
                return;
            }
        } else if (c === 'Q' || c === 'QUIT') {
            return;
        } else {
            sh.out('?\n');
        }
    }
}

function primeProfile(sh) {
    if (!sh.priv) {
        sh.err('Insufficient access rights. SAD (EDIT_PROFILE)');
        return;
    }
    var w = sh.w;
    sh.out('\n[EDIT_PROFILE Rev. ' + w.h.version + ' Copyright (c) 1990, Prime Computer, Inc.]\n\n');
    var added = sh.ctx.ov.acc;
    var users = ['SYSTEM', 'PRIMENET', 'NETMAN'].concat(sh.ctx.host.accounts.map(function (a) { return a[0].toUpperCase(); }), w.staff, Object.keys(added))
        .filter(function (u, i, all) { return all.indexOf(u) === i; });
    for (;;) {
        sh.io.out(': ');
        var l = sh.io.line(true);
        if (l === null) return 'exit';
        var c = l.trim().toUpperCase().split(/\s+/);
        if (/^(Q|QUIT)$/.test(c[0]) || c[0] === '') return;
        if (/^(LU|LIST_USER)$/.test(c[0])) {
            sh.out('\n' + users.map(function (u) {
                var ac = sh.ctx.host.accounts.filter(function (a) { return a[0].toUpperCase() === u; })[0];
                var real = w.real[u] || (u === 'SYSTEM' || (ac && ac[2] && u !== 'NETMAN') ? 'System administrator' : u === 'PRIMENET' || u === 'NETMAN' ? 'Network' : 'Guest');
                return fit(u, 16) + fit(added[u] ? '' : real, 26) + ((ac && ac[2]) || u === 'SYSTEM' || u === w.boss || (added[u] && added[u][1]) ? 'SAD' : 'DEFAULT$');
            }).join('\n') + '\n\n');
            gotLoot(sh.ctx, sh.io, 'the system administration directory');
        } else if (/^(AU|ADD_USER)$/.test(c[0])) {
            if (!c[1]) {
                sh.out('User id? ');
                var u = sh.io.line(true);
                if (u === null) return 'exit';
                c[1] = u.trim().toUpperCase();
            }
            if (users.indexOf(c[1]) >= 0) {
                sh.out('User ' + c[1] + ' already exists.\n');
            } else if (c[1]) {
                //  ADD_USER name [-SAD]: a password, and the SAD group if asked
                sh.out('Password? ');
                var npw = sh.io.line(false);
                if (npw === null) return 'exit';
                sh.out('\n');
                var sad = c.indexOf('-SAD') >= 0;
                users.push(c[1]);
                keepAddAccount(sh.ctx, c[1], npw, sad);
                primeAudit(sh, 'ADD_USER ' + c[1] + (sad ? ' -SAD' : ''));
                sh.out('User ' + c[1] + ' added' + (sad ? ' to SAD' : '') + '.\n');
            }
        } else if (/^(HELP|H|\?)$/.test(c[0])) {
            sh.out('LIST_USER (LU)   ADD_USER (AU) user [-SAD]   QUIT (Q)\n');
        } else {
            sh.out('Unknown command ' + c[0] + '.\n');
        }
    }
}

function primeNetlink(sh) {
    sh.out('[NETLINK Rev. ' + sh.w.h.version + ' Copyright (c) 1990, Prime Computer, Inc.]\n');
    for (;;) {
        sh.io.out('@ ');
        var l = sh.io.line(true);
        if (l === null) return 'exit';
        var c = l.trim().toUpperCase().split(/\s+/);
        if (/^(Q|QUIT)$/.test(c[0])) return;
        if (c[0] === 'C' || c[0] === 'CONNECT') {
            var nd = sh.w.nodes.filter(function (x) { return x.name === c[1]; })[0];
            if (!nd) {
                sh.out('Unknown address or node name. ' + (c[1] || '') + '\n');
                continue;
            }
            var rep2 = identify(sh.ctx.p, nd.num, 'prime');
            if (rep2) sh.io.reward(rep2, 'new find, Prime PRIMOS (' + nd.name + ')');
            sh.ctx.p.hops = (sh.ctx.p.hops || 0) + 1;
            sh.out(nd.name + ' Connected\n');
            runPrime({ p: sh.ctx.p, host: hostAtNum(sh.ctx, nd.num, 'prime'), seed: sh.ctx.seed }, sh.io);
            if (sh.io.over) return 'exit';
            sh.out(nd.name + ' Cleared\n');
        } else if (c[0]) {
            sh.out('Unknown command. ' + c[0] + '\n');
        }
    }
}
// ---- end lib/carrier_prime.js ----
// ---- lib/carrier_mpe.js ----
//
//  CARRiER's HP3000 hosts (phase 6): MPE's accounts, groups and files, and
//  the command interpreter that works on them.
//
//  MPE has no directory tree: a file is FILE.GROUP.ACCOUNT, eight letters
//  each. Every machine has the SYS account (PUB.SYS holds the system's
//  programs and logs), the vendor's (SUPPORT, TELESUP), HPOFFICE, and the
//  organization's own. You log on as USER.ACCOUNT into a group (PUB unless
//  you say). In the tree (carrier_fs.js) an account is a directory of
//  groups, each a directory of files; who may read a group is its mode,
//  and members of an account share its group bits. System manager (SM)
//  capability reads everything.
//
//  The three things to find (docs/design.md):
//    * the way up: a job stream with MANAGER.SYS's password in its !JOB
//      line (BACKJOB.PUB.SYS, or a nightly job in the organization's own
//      account), or a user's password list. The welcome message points the
//      way.
//    * leads: NOTES (remote sites) in the organization's PUB group,
//      DIALUPS.NET.SYS (SM only)
//    * loot: REPORT and LISTUSER (SM only; LISTUSER shows passwords), and
//      the file the organization would least want taken
//

var MPE_WAYS = ['job', 'nightly', 'stuff'];

function mpeWorld(ctx) {
    var h = ctx.host;
    var r = rng(hash32(ctx.seed + '|mpe|' + h.num));
    var staff = someUsers(h, 8).filter(function (n) { return ['operator', 'field', 'admin'].indexOf(n) < 0; })
        .slice(0, 5).map(function (n) { return n.toUpperCase().slice(0, 8); });
    var org = (h.org.split(' ')[0] || 'COMPANY').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'COMPANY';
    if (['SYS', 'SUPPORT', 'TELESUP', 'HPOFFICE'].indexOf(org) >= 0) org = 'CORP';
    var w = { h: h, r: r, kind: 'hp3000', staff: staff, boss: staff[0], peers: staff.slice(1), org: org, real: {} };
    staff.forEach(function (n) {
        w.real[n] = pick(r, UNIX_FIRST) + ' ' + pick(r, UNIX_LAST);
    });
    w.way = pick(r, MPE_WAYS);
    w.stuffUser = w.peers[0];
    w.secret = h.secret;
    return w;
}

//  The organization's own users, [USER.ACCT, password, SM]: LISTUSER shows
//  them to a system manager, and they log on like any other
function mpeStaff(w) {
    var list = w.staff.map(function (n, i) { return [n + '.' + w.org, pick(rng(hash32(w.h.num + n)), SECRET_WORDS), i === 0]; });
    list.push(['MGR.' + w.org, pick(rng(hash32(w.h.num + 'mgr')), SECRET_WORDS), true]);
    return list;
}

//  A date as LISTF ,2 and the logon banner show it: SUN, NOV  7, 1993
function mpeDate(daysAgo) {
    var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    var now = new Date();
    var d = new Date(1993, now.getMonth(), now.getDate() - daysAgo, 0, 0, 0);
    return MON[d.getMonth()] + ' ' + padStart(String(d.getDate()), 2) + ' 1993';
}

function mpeFile(own, grp, mode, text, days, type, code) {
    var f = fsFile(own, grp, mode, text, mpeDate(days), type);
    if (code) f.code = code;
    return f;
}

//  ---- the tree ----

function mpeTree(ctx) {
    var w = mpeWorld(ctx);
    var r = w.r;
    var old = function () { return 200 + Math.floor(r() * 400); };
    var recent = function () { return 1 + Math.floor(r() * 60); };
    var root = fsDir('MANAGER.SYS', 'SYS', 'rwxr-xr-x', mpeDate(old()));
    var put = function (path, node) { return fsPut(root, path, node); };
    var dir = function (path, acct, mode) {
        var have = fsLook({ root: root, home: '/' }, '/', path, { root: true }, true).node;
        if (have && have.dir) return have;
        return put(path, fsDir('MGR.' + acct, acct, mode, mpeDate(old())));
    };
    //  accounts and groups: SYS lets anyone read PUB; the others keep to
    //  their members, except the organization's PUB, which someone opened
    dir('/SYS', 'SYS', 'rwxr-xr-x');
    dir('/SYS/PUB', 'SYS', 'rwxr-xr-x');
    dir('/SYS/NET', 'SYS', 'rwx------');
    dir('/SYS/SCHED', 'SYS', 'rwxr-x---');
    ['SUPPORT', 'TELESUP', 'HPOFFICE'].forEach(function (a) {
        dir('/' + a, a, 'rwxrwx---');
        dir('/' + a + '/PUB', a, 'rwxrwx---');
    });
    dir('/' + w.org, w.org, 'rwxrwxr-x');
    dir('/' + w.org + '/PUB', w.org, 'rwxrwxr-x');
    dir('/' + w.org + '/DATA', w.org, 'rwxrwx---');
    dir('/' + w.org + '/JOBS', w.org, 'rwxrwx---');

    ['FCOPY', 'EDITOR', 'QUERY', 'SPOOK', 'SYSDUMP', 'LISTDIR5', 'STORE', 'RESTORE', 'SORT', 'DBUTIL', 'COBOLII', 'FORTRAN'].forEach(function (p) {
        var f = put('/SYS/PUB/' + p, mpeFile('MANAGER.SYS', 'SYS', 'r-xr-xr-x', '', old(), 'exec', 'PROG'));
        f.size = 20000 + Math.floor(r() * 200000);
        f.strs = [p, 'END OF PROGRAM', 'HP32'];
    });
    put('/SYS/PUB/CATALOG', mpeFile('MANAGER.SYS', 'SYS', 'r--r--r--', '', old(), 'data')).size = 89000;
    put('/SYS/PUB/COMMAND', mpeFile('MANAGER.SYS', 'SYS', 'r--r--r--', '', old(), 'data')).size = 41000;
    var logn = 400 + Math.floor(r() * 500);
    for (var i = 0; i < 3; i++) {
        var lf = put('/SYS/PUB/LOG' + padStart(String(logn + i), 4).replace(/ /g, '0'), mpeFile('MANAGER.SYS', 'SYS', 'rw-------', '', 2 - i, 'data', 'LOG'));
        lf.size = 30000 + Math.floor(r() * 40000);
        lf.log = true;
    }
    put('/SYS/PUB/BACKJOB', mpeFile('MANAGER.SYS', 'SYS', w.way === 'job' ? 'rw-r--r--' : 'rw-------', function () {
        return '!JOB BACKUP,' + (w.way === 'job' ? w.secret[0] + '/' + w.secret[1] : 'MANAGER.SYS') + ';OUTCLASS=,1\n!COMMENT  NIGHTLY STORE TO TAPE -- ' + w.boss + '\n' +
            '!FILE T;DEV=TAPE\n!STORE @.@.@;*T;SHOW\n!TELLOP BACKUP DONE\n!EOJ\n';
    }, recent())).onRead = w.way === 'job' ? function (c, io) { io.say('A job stream logs itself on: whose account, and its password, in the !JOB line.'); } : null;
    var dl = put('/SYS/NET/DIALUPS', mpeFile('MANAGER.SYS', 'SYS', 'rw-------', function () {
        return 'DS/3000 DIAL-UP LINES, ' + w.h.org.toUpperCase() + '\n\n' + leadsOf(ctx, 3).map(function (num, i) {
            return '  LDEV ' + (40 + i) + '   ' + fmtNum(num) + '   2400';
        }).join('\n') + '\n';
    }, recent()));
    dl.onRead = function (c, io) {
        gotLeads(c, io, leadsOf(c, 3), 'dialups');
        io.say('Dial-up lines: numbers that answer with a carrier. They\'re on your found list.');
    };
    put('/SYS/NET/NMCONFIG', mpeFile('MANAGER.SYS', 'SYS', 'rw-------', '', old(), 'data')).size = 52000;
    put('/SYS/SCHED/JOBLIST', mpeFile('MANAGER.SYS', 'SYS', 'rw-r-----', 'BACKJOB.PUB.SYS        02:00  DAILY\nNIGHTLY.PUB.' + w.org + '   23:30  DAILY\n', recent()));
    put('/TELESUP/PUB/DIAGNOTE', mpeFile('MGR.TELESUP', 'TELESUP', 'rw-rw----', 'TELESUPPORT DIAL-IN: HELLO MGR.TELESUP  -- CALL THE RESPONSE CENTER FIRST.\n', old()));
    put('/SUPPORT/PUB/PATCHES', mpeFile('FIELD.SUPPORT', 'SUPPORT', 'rw-rw----', 'PATCHES APPLIED THIS SYSTEM:\n  G.03.04  ' + mpeDate(old()) + '\n', old()));
    put('/HPOFFICE/PUB/MAILDIR', mpeFile('MAIL.HPOFFICE', 'HPOFFICE', 'rw-rw----', '', recent(), 'data')).size = 120000;

    //  the organization
    var o = '/' + w.org;
    put(o + '/PUB/NOTES', mpeFile(w.boss + '.' + w.org, w.org, 'rw-rw-r--', function () {
        return 'REMOTE SITES -- CALL BEFORE 6PM\n' + leadsOf(ctx, 5).slice(3).map(function (num) { return '  ' + fmtNum(num); }).join('\n') + '\n';
    }, recent())).onRead = function (c, io) {
        var ls = leadsOf(c, 5).slice(3);
        gotLeads(c, io, ls, 'sites');
        if (ls.length) io.say('Remote sites: if those numbers answer with a carrier, they\'re on your found list now.');
    };
    put(o + '/PUB/NIGHTLY', mpeFile(w.peers[1] + '.' + w.org, w.org, w.way === 'nightly' ? 'rw-rw-r--' : 'rw-rw----', function () {
        return '!JOB NIGHTLY,' + (w.way === 'nightly' ? w.secret[0] + '/' + w.secret[1] : w.peers[1] + '.' + w.org) + ';OUTCLASS=,1\n!RUN REPORTS.PUB.' + w.org + '\n!TELLOP NIGHTLY REPORTS DONE\n!EOJ\n';
    }, recent())).onRead = w.way === 'nightly' ? function (c, io) { io.say('A job stream logs itself on: whose account, and its password, in the !JOB line.'); } : null;
    put(o + '/PUB/PWLIST', mpeFile(w.stuffUser + '.' + w.org, w.org, w.way === 'stuff' ? 'rw-rw-r--' : 'rw-------', function () {
        var lines = ['BANK CARD   ' + (1000 + hash32(w.stuffUser) % 9000), 'DIALUP      ' + pick(rng(hash32(w.stuffUser)), SECRET_WORDS)];
        if (w.way === 'stuff') lines.splice(1, 0, fit(w.secret[0], 14) + w.secret[1] + '   (' + w.boss + ' CHANGED IT AGAIN)');
        return lines.join('\n') + '\n';
    }, recent())).onRead = w.way === 'stuff' ? function (c, io) { io.say('A password, and whose it is. HELLO that account.'); } : null;
    var rp = put(o + '/PUB/REPORTS', mpeFile(w.boss + '.' + w.org, w.org, 'r-xr-xr-x', '', recent(), 'exec', 'PROG'));
    rp.size = 48000;
    rp.strs = ['MONTH END', 'REPORTS', w.org];
    put(o + '/JOBS/MONTHEND', mpeFile(w.boss + '.' + w.org, w.org, 'rw-rw----', '!JOB MONTHEND,' + w.boss + '.' + w.org + ';OUTCLASS=,1\n!RUN REPORTS\n!EOJ\n', recent()));
    var prize = unixPrize({ h: w.h });
    if (prize) {
        var name = { edu: 'GRADES', biz: 'PAYROLL', gov: 'CONTRACT', telco: 'SWITCHRP' }[w.h.prof];
        put(o + '/DATA/' + name, mpeFile(w.boss + '.' + w.org, w.org, 'rw-rw----', prize[2].toUpperCase(), recent())).onRead = function (c, io) {
            gotLoot(c, io, prize[1], 'prize', 15);
        };
    }
    if (w.h.prof === 'telco') {
        var cz = cosmosNear(ctx.seed, w.h);
        put(o + '/PUB/FRAMENTS', mpeFile(w.boss + '.' + w.org, w.org, 'rw-rw-r--', function () {
            if (!cz) return 'MLT DOWN AGAIN.\n';
            var ca = hostAtNum(ctx, cz, 'cosmos');
            return 'MLT DOWN AGAIN.\nCOSMOS IS ON ' + fmtNum(cz).slice(2) + '. LOGIN ' + ca.accounts[0][0] +
                (ca.accounts[0][1] ? ' PW ' + ca.accounts[0][1].toUpperCase() : ' (NO PW)') + ', WC ' + ca.wc + '\n';
        }, recent())).onRead = function (c, io) {
            if (cz) {
                gotLeads(c, io, [cz], 'cosmos');
                io.say('COSMOS: the phone company\'s own database. It\'s on your found list.');
            }
        };
    }
    return { root: root, home: '/', w: w };
}

//  The operator's welcome message, which says too much
function mpeWelcome(w) {
    var lines = ['** ' + w.h.org.toUpperCase() + ' **', 'REPORT PROBLEMS TO THE COMPUTER ROOM, X4410.'];
    if (w.way === 'job') lines.push('BACKUPS NOW STREAM FROM BACKJOB.PUB.SYS.  DO NOT EDIT IT.');
    if (w.way === 'nightly') lines.push('NIGHTLY REPORTS RUN FROM NIGHTLY.PUB.' + w.org + '.  ' + w.peers[1] + ': TAKE YOUR PASSWORD OUT OF IT.');
    if (w.way === 'stuff') lines.push(w.stuffUser + ': PWLIST.PUB.' + w.org + ' IS NOT A SAFE.  GET IT OFF THE SYSTEM.');
    return lines.join('\n') + '\n';
}

//  ---- file names ----

//  Parses FILE[.GROUP[.ACCOUNT]] (with @, ? and # in any part) against
//  where you are: { file, group, acct } or null when it isn't a name
function mpeName(sh, s) {
    var parts = String(s || '').toUpperCase().split('/')[0].split('.');
    if (parts.length > 3 || parts.some(function (p) { return !/^[A-Z@?#][A-Z0-9@?#]{0,7}$/.test(p); })) return null;
    return { file: parts[0], group: parts[1] || sh.group, acct: parts[2] || sh.acct };
}

function mpePattern(s) {
    return new RegExp('^' + s.replace(/@/g, '.*').replace(/\?/g, '[A-Z0-9]').replace(/#/g, '[0-9]') + '$');
}

//  The files a name matches: [{ acct, group, file, node, gnode }], or
//  { err } with MPE's message
function mpeFind(sh, s) {
    var n = mpeName(sh, s);
    if (!n) return { err: 'BAD FILE NAME.  (CIERR 9000)' };
    var out = [];
    var root = sh.fs.root;
    var acctRe = mpePattern(n.acct), grpRe = mpePattern(n.group), fileRe = mpePattern(n.file);
    var wild = /[@?#]/.test(n.acct + n.group + n.file);
    var sawGroup = false;
    var denied = false;
    Object.keys(root.kids).sort().forEach(function (a) {
        if (!acctRe.test(a)) return;
        var an = root.kids[a];
        if (!fsCan(an, sh.who, 'x')) { denied = true; return; }
        Object.keys(an.kids).sort().forEach(function (g) {
            if (!grpRe.test(g)) return;
            sawGroup = true;
            var gn = an.kids[g];
            if (!fsCan(gn, sh.who, 'x') || (wild && !fsCan(gn, sh.who, 'r'))) { denied = true; return; }
            Object.keys(gn.kids).sort().forEach(function (f) {
                if (fileRe.test(f)) out.push({ acct: a, group: g, file: f, node: gn.kids[f], gnode: gn });
            });
        });
    });
    if (!out.length) {
        if (!sawGroup) return { err: wild ? 'NO FILES FOUND IN FILE-SET (CIWARN 431)' : 'NONEXISTENT GROUP  (FSERR 52)', name: n };
        return { err: denied ? 'SECURITY VIOLATION  (FSERR 93)' : wild ? 'NO FILES FOUND IN FILE-SET (CIWARN 431)' : 'NONEXISTENT PERMANENT FILE  (FSERR 52)', name: n };
    }
    return out;
}

function mpeRead(sh, f) {
    if (!fsCan(f.node, sh.who, 'r')) {
        sh.out('SECURITY VIOLATION  (FSERR 93)\n');
        return null;
    }
    if (f.node.onRead) {
        sh.after = (sh.after || []).concat([f.node.onRead]);
        if (!f.node.repeat) f.node.onRead = null;
    }
    return f.node.type === 'exec' || f.node.type === 'data' ? unixGarbage(f.node) : fsText(f.node);
}

//  Writes a new file, or over one; returns the node or null
function mpeWrite(sh, s, text) {
    var n = mpeName(sh, s);
    if (!n || /[@?#]/.test(n.file + n.group + n.acct)) {
        sh.out('BAD FILE NAME.  (CIERR 9000)\n');
        return null;
    }
    var gl = fsLook(sh.fs, '/', '/' + n.acct + '/' + n.group, sh.who);
    if (gl.err || !gl.node) {
        sh.out(gl.err === 'denied' ? 'SECURITY VIOLATION  (FSERR 93)\n' : 'NONEXISTENT GROUP  (FSERR 52)\n');
        return null;
    }
    var had = gl.node.kids[n.file];
    if ((had && !fsCan(had, sh.who, 'w')) || (!had && !fsCan(gl.node, sh.who, 'w'))) {
        sh.out('SECURITY VIOLATION  (FSERR 93)\n');
        return null;
    }
    var f = had || mpeFile(sh.who.user, n.acct, 'rw-rw----', '', 0);
    f.text = text;
    f.type = 'text';
    delete f.size;
    f.mt = mpeDate(0);
    gl.node.kids[n.file] = f;
    keepMark(sh.fs, '/' + n.acct + '/' + n.group + '/' + n.file);
    return f;
}

//  ---- the commands ----

var MPE_QUIET = ['LISTF', 'SHOWME', 'SHOWJOB', 'SHOWTIME', 'HELP', 'CHGROUP'];

function runHP(ctx, io) {
    var h = ctx.host;
    ctx.ov = keepLoad(ctx.seed, h.num);
    var t = era();
    io.out('\r\n:');
    var acct = null;
    var group = 'PUB';
    for (var tries = 0; tries < MAX_TRIES && !acct; ) {
        var l = io.line(true);
        if (l === null) return;
        var m = /^\s*:?\s*HELLO\s+([A-Z0-9]+\.[A-Z0-9]+)(\/(\S+?))?(,([A-Z0-9]+))?\s*$/i.exec(l);
        if (!m) {
            io.out('EXPECTED HELLO, :JOB, :DATA, OR (CMD) AS LOGON.  (CIERR 1402)\r\n:');
            continue;
        }
        var ua = m[1].toUpperCase();
        group = (m[5] || 'PUB').toUpperCase();
        var all = keepAccounts(ctx, h.accounts.concat(mpeStaff(mpeWorld(ctx))), true);
        var match = all.filter(function (a) { return a[0] === ua; });
        if (!match.length) {
            var acctPart = ua.split('.')[1];
            var known = all.some(function (a) { return a[0].split('.')[1] === acctPart; });
            io.out((known ? 'INVALID USER NAME. (CIERR 1426)' : 'NON-EXISTENT ACCOUNT. (CIERR 1437)') + '\r\n:');
            failedLogin(ctx);
            tries++;
            continue;
        }
        var open = match.filter(function (a) { return a[1] === ''; })[0];
        if (open) {
            acct = open;
            break;
        }
        var pw = m[3];
        if (pw === undefined) {
            io.out('ENTER USER PASSWORD:');
            pw = io.line(false);
            if (pw === null) return;
            io.out('\r\n');
        }
        acct = findAccount({ accounts: all }, ua, pw, true);
        if (!acct) {
            io.out('INVALID PASSWORD FOR "' + ua + '" ON LOGON.  (CIERR 1441)\r\n:');
            failedLogin(ctx);
            tries++;
        }
    }
    if (!acct) {
        return;
    }
    var fs = mpeTree(ctx);
    keepOpen(ctx, fs, function () { return mpeTree(ctx); });
    var w = fs.w;
    var who = acct[0].toUpperCase();
    var acctName = who.split('.')[1];
    if (!fsLook(fs, '/', '/' + acctName + '/' + group, { root: true }).node) {
        io.out('NON-EXISTENT GROUP.  (CIERR 1429)\r\n');
        return;
    }
    io.out('HP3000 / MPE V ' + h.version + ' (BASE ' + h.version + '). ' + t.hp + '\r\n');
    io.out(unixLines(mpeWelcome(w)));
    if (ctx.ov.note) io.out(unixLines(ctx.ov.note.toUpperCase() + '\n'));
    var priv = loggedIn(ctx, acct, io);
    var sh = { ctx: ctx, io: io, fs: fs, w: w, user: who, acct: acctName, group: group, priv: priv, job: 100 + h.users, pw: acct[1] };
    sh.who = { user: who, groups: [acctName], root: !!priv };
    sh.out = function (s) { io.out(unixLines(s)); };
    sh.tty = 'LDEV ' + (20 + v3.util.random(9));
    sh.on = keepOn(ctx, who, sh.tty);
    var deaf = keepListen(ctx, io, who, sh.on, function (x) {
        return unixLines('\nFROM/S' + (40 + hash32(x.from) % 50) + ' ' + x.from + '/' + x.m.replace(/\n/g, ' ') + '\n');
    });
    mpeShell(sh);
    deaf();
    keepOff(ctx, sh.on);
}

function mpeShell(sh) {
    var ctx = sh.ctx;
    var io = sh.io;
    for (;;) {
        io.out(':');
        var cmd = io.line(true);
        if (cmd === null) return;
        var c = cmd.trim();
        if (!c) continue;
        var verb = c.split(/[\s,;]/)[0].toUpperCase();
        var args = c.slice(verb.length).trim();
        if (verb !== 'TELL' && verb !== 'TELLOP' && verb !== 'BYE' && watched(ctx, io, MPE_QUIET.indexOf(verb) >= 0 ? 0.3 : 1)) return;
        var fn = MPE_CMDS[verb];
        if (!fn) {
            sh.out('UNKNOWN COMMAND NAME.  (CIERR 975)\n');
            continue;
        }
        var res = fn(sh, args);
        if (sh.after) {
            var after = sh.after;
            sh.after = null;
            after.forEach(function (f) { f(ctx, io); });
        }
        if (keepSave(sh.fs) === 'full') {
            sh.out('OUT OF DISC SPACE  (FSERR 46)\n');
            io.say('This HP has no room for more of what players leave. What you just did lasts only this call.');
        }
        if (res === 'exit' || io.over) return;
    }
}

//  An entry in the newest system log file: who changed the directory, and
//  how. LISTLOG would show it; PURGE LOG@.PUB.SYS takes it away.
function mpeAudit(sh, what) {
    var logs = Object.keys(fsLook(sh.fs, '/', '/SYS/PUB', { root: true }).node.kids).filter(function (k) { return /^LOG\d{4}$/.test(k); }).sort();
    if (!logs.length) return;
    keepLog(sh.fs, '/SYS/PUB/' + logs[logs.length - 1], [era().hp + '  ' + sh.user + '  ' + what], 40);
}

//  Whether name is a privileged user the host came with
function mpePrivAccount(sh, name) {
    return name === 'MANAGER.SYS' || sh.ctx.host.accounts.concat(mpeStaff(sh.w)).some(function (a) { return a[0].toUpperCase() === name && a[2]; });
}

//  ;PASS=x and ;CAP=y from a NEWUSER or ALTUSER line
function mpeParms(a) {
    var out = {};
    a.split(';').slice(1).forEach(function (kv) {
        var m = /^\s*([A-Z]+)\s*=\s*(.*?)\s*$/i.exec(kv);
        if (m) out[m[1].toUpperCase()] = m[2];
    });
    return out;
}

var MPE_HELP = {
    LISTF: 'LISTF [fileset][,level]\n  LISTF @            files in your group\n  LISTF @.@          every group in your account\n  LISTF @.PUB.SYS,1  with sizes',
    PRINT: 'PRINT filename      lists a file on your terminal',
    CHGROUP: 'CHGROUP group       moves you to another group in your account',
    SHOWME: 'SHOWME              who and where you are',
    SHOWJOB: 'SHOWJOB             the jobs and sessions on the system',
    TELL: 'TELL user.acct;text  sends a user a message',
    PURGE: 'PURGE filename      deletes a file',
    BUILD: 'BUILD filename      makes an empty file',
    RENAME: 'RENAME old,new',
    RUN: 'RUN program         FCOPY.PUB.SYS and EDITOR.PUB.SYS are the useful ones',
    LISTUSER: 'LISTUSER user.acct  (AM or SM capability)',
    LISTACCT: 'LISTACCT acct       (SM capability)',
    REPORT: 'REPORT [group.acct] disc and CPU use by account (AM or SM capability)',
    BYE: 'BYE                 ends your session',
};

var MPE_CMDS = {
    BYE: function (sh) {
        sh.out('CPU=1. CONNECT=4. ' + era().hp + '\n');
        return 'exit';
    },
    HELLO: function (sh) {
        sh.out('CPU=1. CONNECT=4. ' + era().hp + '\n');
        return 'exit';
    },
    HELP: function (sh, a) {
        var k = a.split(/[\s,;]/)[0].toUpperCase();
        if (k && MPE_HELP[k]) sh.out(MPE_HELP[k] + '\n');
        else if (k) sh.out('NO HELP AVAILABLE FOR ' + k + '.  (CIWARN 9050)\n');
        else sh.out('COMMANDS:\n' + unixColumns(Object.keys(MPE_HELP).sort()));
    },
    SHOWTIME: function (sh) { sh.out(era().hp + '\n'); },
    SHOWME: function (sh) {
        var t = era().hp;
        sh.out('USER: #S' + sh.job + ',' + sh.user + ',' + sh.group + '        (NOT IN BREAK)\nMPE VERSION: HP32033' + sh.w.h.version + '.  (BASE ' + sh.w.h.version + ').\n' +
            'CURRENT: ' + t + '\nLOGON:   ' + t + '\nCPU SECONDS: 1        CONNECT MINUTES: 1\n$STDIN LDEV: 20       $STDLIST LDEV: 20\n');
    },
    SHOWJOB: function (sh) {
        var t = era().hp.slice(-8);
        var out = 'JOBNUM  STATE IPRI JIN  JLIST    INTRODUCED  JOB NAME\n\n';
        if (adminOnline(sh.ctx)) out += '#S2     EXEC        20   20       ' + t + '  MANAGER.SYS\n';
        sh.w.staff.slice(1, 1 + Math.min(4, sh.w.h.users)).forEach(function (n, i) {
            out += fit('#S' + (40 + i * 7), 8) + 'EXEC        ' + fit(String(30 + i), 5) + fit(String(30 + i), 9) + t + '  ' + n + '.' + sh.w.org + '\n';
        });
        keepOthersOn(sh.ctx.seed, sh.w.h.num).forEach(function (x, i) {
            out += fit('#S' + (sh.job - 3 - i), 8) + 'EXEC        20   20       ' + t + '  ' + x.u + '\n';
        });
        out += fit('#S' + sh.job, 8) + 'EXEC        20   20       ' + t + '  ' + sh.user + '\n';
        sh.out(out + '\n');
    },
    CHGROUP: function (sh, a) {
        var g = (a || 'PUB').toUpperCase().split(/[\s,;]/)[0];
        var gl = fsLook(sh.fs, '/', '/' + sh.acct + '/' + g, sh.who);
        if (gl.err === 'denied' || (gl.node && !fsCan(gl.node, sh.who, 'x'))) {
            sh.out('SECURITY VIOLATION  (FSERR 93)\n');
        } else if (!gl.node) {
            sh.out('NON-EXISTENT GROUP.  (CIERR 1429)\n');
        } else {
            sh.group = g;
        }
    },
    LISTF: function (sh, a) {
        var parts = a.split(',');
        var set = (parts[0] || '').trim() || '@';
        var level = parseInt((parts[1] || '0').trim(), 10) || 0;
        var found = mpeFind(sh, set);
        if (found.err) {
            sh.out(found.err + '\n');
            return;
        }
        var groups = [];
        found.forEach(function (f) {
            var key = f.acct + '.' + f.group;
            if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key: key, acct: f.acct, group: f.group, files: [] });
            groups[groups.length - 1].files.push(f);
        });
        var out = '';
        groups.forEach(function (g) {
            if (set.indexOf('.') >= 0 || level > 0) out += '\nACCOUNT=  ' + fit(g.acct, 10) + 'GROUP=  ' + g.group + '\n';
            if (level === 0) {
                out += '\nFILENAME\n\n' + unixColumns(g.files.map(function (f) { return fit(f.file, 9); })).replace(/^/gm, '') + '\n';
            } else {
                out += '\nFILENAME  CODE  ------------LOGICAL RECORD-----------  ----SPACE----\n                  SIZE  TYP        EOF      LIMIT R/B  SECTORS #X MX\n\n';
                g.files.forEach(function (f) {
                    var size = fsSize(f.node);
                    var rec = f.node.type === 'text' ? 80 : 128;
                    var eof = Math.max(1, Math.ceil(size / rec));
                    out += fit(f.file, 10) + fit(f.node.code || '', 5) + padStart(String(rec), 6) + 'B  FA' + padStart(String(eof), 11) + padStart(String(eof + 1000 - eof % 1000), 11) +
                        '   1' + padStart(String(Math.ceil(eof * rec / 256) + 16), 9) + '  1  8' + (level > 1 ? '   ' + f.node.mt : '') + '\n';
                });
            }
        });
        sh.out(out);
    },
    PRINT: function (sh, a) {
        var name = a.split(/[\s,;]/)[0];
        if (!name) {
            sh.out('MISSING FILE NAME.  (CIERR 9030)\n');
            return;
        }
        var found = mpeFind(sh, name);
        if (found.err) {
            sh.out((/CIWARN/.test(found.err) ? 'NONEXISTENT PERMANENT FILE  (FSERR 52)' : found.err) + '\n');
            return;
        }
        found.forEach(function (f) {
            var text = mpeRead(sh, f);
            if (text !== null) sh.out(text);
        });
    },
    PURGE: function (sh, a) {
        var name = a.split(/[\s,;]/)[0];
        var found = name ? mpeFind(sh, name) : { err: 'MISSING FILE NAME.  (CIERR 9030)' };
        if (found.err) {
            sh.out((/CIWARN/.test(found.err) ? 'NONEXISTENT PERMANENT FILE  (FSERR 52)' : found.err) + '\n');
            return;
        }
        var logs = 0;
        found.forEach(function (f) {
            if (!fsCan(f.node, sh.who, 'w') || !fsCan(f.gnode, sh.who, 'w')) {
                sh.out('SECURITY VIOLATION  (FSERR 93)\n');
                return;
            }
            if (f.node.log) logs++;
            delete f.gnode.kids[f.file];
            keepMark(sh.fs, '/' + f.acct + '/' + f.group + '/' + f.file);
        });
        if (logs) cleaned(sh.ctx, sh.io);
    },
    BUILD: function (sh, a) {
        var name = a.split(/[\s,;]/)[0];
        if (!name) {
            sh.out('MISSING FILE NAME.  (CIERR 9030)\n');
            return;
        }
        var n = mpeName(sh, name);
        if (n && fsLook(sh.fs, '/', '/' + n.acct + '/' + n.group + '/' + n.file, { root: true }).node) {
            sh.out('DUPLICATE PERMANENT FILE NAME  (FSERR 100)\n');
            return;
        }
        mpeWrite(sh, name, '');
    },
    RENAME: function (sh, a) {
        var p = a.split(',');
        if (p.length < 2) {
            sh.out('MISSING PARAMETER.  (CIERR 9031)\n');
            return;
        }
        var found = mpeFind(sh, p[0].trim());
        if (found.err) {
            sh.out(found.err + '\n');
            return;
        }
        var f = found[0];
        var to = mpeName(sh, p[1].trim());
        if (!to) {
            sh.out('BAD FILE NAME.  (CIERR 9000)\n');
            return;
        }
        var gl = fsLook(sh.fs, '/', '/' + to.acct + '/' + to.group, sh.who);
        if (!fsCan(f.gnode, sh.who, 'w') || !gl.node || !fsCan(gl.node, sh.who, 'w')) {
            sh.out('SECURITY VIOLATION  (FSERR 93)\n');
            return;
        }
        delete f.gnode.kids[f.file];
        gl.node.kids[to.file] = f.node;
        keepMark(sh.fs, '/' + f.acct + '/' + f.group + '/' + f.file);
        keepMark(sh.fs, '/' + to.acct + '/' + to.group + '/' + to.file);
    },
    TELL: function (sh, a) {
        var m = /^([A-Z0-9.#]+)\s*;?\s*(.*)$/i.exec(a);
        if (!m) {
            sh.out('MISSING PARAMETER.  (CIERR 9031)\n');
            return;
        }
        var to = m[1].toUpperCase();
        //  another player on as them gets it
        if (m[2] && keepWriteTo(sh.ctx, to, sh.user, sh.tty, m[2])) return;
        if (to === 'MANAGER.SYS' || to === 'MGR.SYS') {
            if (bluff(sh.ctx, sh.io, m[2])) return 'exit';
            return;
        }
        sh.out(sh.w.staff.some(function (n) { return to === n + '.' + sh.w.org; }) ? 'MESSAGE NOT ACCEPTED: QUIET MODE.  (CIWARN 3020)\n' : 'NO SUCH USER LOGGED ON.  (CIERR 3015)\n');
    },
    TELLOP: function (sh, a) {
        if (bluff(sh.ctx, sh.io, a)) return 'exit';
    },
    LISTUSER: function (sh, a) { return mpeListUser(sh, a); },
    NEWUSER: function (sh, a) { return mpeNewUser(sh, a); },
    ALTUSER: function (sh, a) { return mpeAltUser(sh, a); },
    LISTACCT: function (sh, a) {
        if (!sh.priv) {
            sh.out('LACKING SM OR AM CAPABILITY.  (CIERR 3010)\n');
            return;
        }
        sh.out(Object.keys(sh.fs.root.kids).sort().map(function (k) {
            return '********************\nACCOUNT: ' + k + '\nPASSWORD: ' + (k === 'SYS' ? 'HPONLY' : '') + '\nCAP: AM,AL,GL,ND,SF,BA,IA' + (k === 'SYS' ? ',SM,OP,PM' : '') + '\nGROUPS: ' +
                Object.keys(sh.fs.root.kids[k].kids).join(', ');
        }).join('\n') + '\n');
        gotLoot(sh.ctx, sh.io, 'the account report');
    },
    REPORT: function (sh) {
        if (!sh.priv) {
            sh.out('LACKING SM OR AM CAPABILITY.  (CIERR 3010)\n');
            return;
        }
        var out = 'ACCOUNT\n/GROUP     FILESPACE-SECTORS    CPU-SECONDS    CONNECT-MINUTES\n';
        Object.keys(sh.fs.root.kids).sort().forEach(function (a, i) {
            out += fit(a, 11) + fit(String(41200 - i * 6100), 21) + fit(String(9100 - i * 900), 15) + (3300 - i * 410) + '\n';
            Object.keys(sh.fs.root.kids[a].kids).forEach(function (g, j) {
                out += fit(' /' + g, 11) + fit(String(12000 - i * 1500 - j * 900), 21) + fit(String(3000 - i * 300 - j * 100), 15) + (900 - i * 100 - j * 40) + '\n';
            });
        });
        sh.out(out);
        gotLoot(sh.ctx, sh.io, 'the account report');
    },
    RUN: function (sh, a) {
        var name = a.split(/[\s,;]/)[0].toUpperCase();
        var n = mpeName(sh, name);
        var found = n ? mpeFind(sh, name) : { err: 'x' };
        if (found.err && n && n.group === sh.group && n.acct === sh.acct) {
            n = { file: n.file, group: 'PUB', acct: 'SYS' };
            found = mpeFind(sh, n.file + '.PUB.SYS');
        }
        if (found.err) {
            sh.out('NONEXISTENT PERMANENT FILE  (FSERR 52)\nPROGRAM FILE NOT FOUND.  (CIERR 1102)\n');
            return;
        }
        var f = found[0];
        if (f.node.type !== 'exec' || !fsCan(f.node, sh.who, 'x')) {
            sh.out(f.node.type !== 'exec' ? 'INVALID PROGRAM FILE.  (CIERR 610)\n' : 'SECURITY VIOLATION  (FSERR 93)\n');
            return;
        }
        if (f.file === 'FCOPY' && f.acct === 'SYS') return mpeFcopy(sh);
        if (f.file === 'EDITOR' && f.acct === 'SYS') return mpeEditor(sh);
        sh.out('\nEND OF PROGRAM\n');
    },
    EDITOR: function (sh) { return mpeEditor(sh); },
    FCOPY: function (sh) { return mpeFcopy(sh); },
};

function mpeListUser(sh, a) {
    if (!sh.priv) {
        sh.out('LACKING SM OR AM CAPABILITY.  (CIERR 3010)\n');
        return;
    }
    var set = (a.split(/[\s,;]/)[0] || '@.' + sh.acct).toUpperCase();
    var parts = set.split('.');
    var ure = mpePattern(parts[0] || '@');
    var are = mpePattern(parts[1] || sh.acct);
    var users = keepAccounts(sh.ctx, sh.ctx.host.accounts.concat(mpeStaff(sh.w)), true).map(function (x) { return [x[0].toUpperCase(), String(x[1]).toUpperCase(), x[2]]; });
    var seen = {};
    var rows = users.filter(function (u) {
        var p = u[0].split('.');
        if (seen[u[0]] || !ure.test(p[0]) || !are.test(p[1])) return false;
        seen[u[0]] = true;
        return true;
    });
    if (!rows.length) {
        sh.out('NONEXISTENT USER.  (CIERR 1433)\n');
        return;
    }
    sh.out(rows.map(function (u) {
        return '********************\nUSER: ' + u[0] + '\nHOME GROUP: PUB              PASSWORD: ' + u[1] + '\nMAX PRI   : 150             LOC ATTR: $00000000\n' +
            'LOGON CNT : ' + (1 + hash32(u[0]) % 9) + '               CAP: ' + (u[2] ? 'SM,AM,AL,GL,ND,SF,BA,IA,PH' : 'ND,SF,BA,IA');
    }).join('\n') + '\n');
    gotLoot(sh.ctx, sh.io, 'the account report');
}

//  NEWUSER user[.acct];PASS=pw;CAP=SM,...: a new user in an account, as an
//  account or system manager may add one
function mpeNewUser(sh, a) {
    if (!sh.priv) {
        sh.out('LACKING SM OR AM CAPABILITY.  (CIERR 3010)\n');
        return;
    }
    var name = (a.split(';')[0] || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{0,7}(\.[A-Z][A-Z0-9]{0,7})?$/.test(name)) {
        sh.out(name ? 'INVALID USER NAME.  (CIERR 1426)\n' : 'MISSING USER NAME.  (CIERR 3060)\n');
        return;
    }
    if (name.indexOf('.') < 0) name += '.' + sh.acct;
    if (!fsLook(sh.fs, '/', '/' + name.split('.')[1], { root: true }).node) {
        sh.out('NON-EXISTENT ACCOUNT. (CIERR 1437)\n');
        return;
    }
    var all = keepAccounts(sh.ctx, sh.ctx.host.accounts.concat(mpeStaff(sh.w)), true);
    if (all.some(function (x) { return x[0].toUpperCase() === name; })) {
        sh.out('DUPLICATE USER NAME.  (CIERR 3061)\n');
        return;
    }
    var p = mpeParms(a);
    keepAddAccount(sh.ctx, name, (p.PASS || '').toUpperCase(), /SM/.test((p.CAP || '').toUpperCase()));
    mpeAudit(sh, 'NEWUSER ' + name + (p.CAP ? ';CAP=' + p.CAP.toUpperCase() : ''));
}

//  ALTUSER user[.acct];PASS=pw: a new password. MANAGER.SYS's takes the box.
function mpeAltUser(sh, a) {
    if (!sh.priv) {
        sh.out('LACKING SM OR AM CAPABILITY.  (CIERR 3010)\n');
        return;
    }
    var name = (a.split(';')[0] || '').trim().toUpperCase();
    if (name && name.indexOf('.') < 0) name += '.' + sh.acct;
    var all = keepAccounts(sh.ctx, sh.ctx.host.accounts.concat(mpeStaff(sh.w)), true);
    var had = all.filter(function (x) { return x[0].toUpperCase() === name; })[0];
    if (!had && name !== 'MANAGER.SYS') {
        sh.out('NONEXISTENT USER.  (CIERR 1433)\n');
        return;
    }
    var p = mpeParms(a);
    if (p.PASS === undefined) return;
    var pw = p.PASS.toUpperCase();
    if (sh.ctx.ov.acc[name]) {
        keepAddAccount(sh.ctx, name, pw, sh.ctx.ov.acc[name][1]);
    } else if (mpePrivAccount(sh, name)) {
        keepSetPassword(sh.ctx, name, pw);
        sh.io.say('The ' + name + ' password is yours now. Anyone holding the old one is locked out. Careful what you leave behind.');
    } else {
        //  the ordinary users' passwords stay as they were: the ways in
        //  are everyone's
        sh.out('PASSWORD NOT CHANGED: USER IS LOGGED ON.  (CIWARN 3072)\n');
        return;
    }
    mpeAudit(sh, 'ALTUSER ' + name + ';PASS=');
}

function mpeFcopy(sh) {
    sh.out('\nHP31900A.05.02 FILE COPIER (C) HEWLETT-PACKARD CO. 1990\n\n');
    for (;;) {
        sh.io.out('>');
        var l = sh.io.line(true);
        if (l === null) return 'exit';
        var c = l.trim().toUpperCase();
        if (c === 'EXIT' || c === 'E' || c === '') {
            sh.out('\nEND OF PROGRAM\n');
            return;
        }
        var m = /^FROM\s*=\s*([A-Z0-9.@?#]+)\s*;\s*TO\s*=\s*\$?([A-Z0-9.]+)/.exec(c);
        if (!m) {
            sh.out('*ERROR*  UNRECOGNIZABLE COMMAND\n');
            continue;
        }
        var found = mpeFind(sh, m[1]);
        if (found.err) {
            sh.out('*ERROR*  ' + found.err + '\n');
            continue;
        }
        var text = mpeRead(sh, found[0]);
        if (text === null) continue;
        if (m[2] === 'STDLIST') {
            sh.out(text);
        } else if (mpeWrite(sh, m[2], found[0].node.type === 'text' ? text : '')) {
            sh.out('EOF FOUND IN FROMFILE AFTER RECORD ' + Math.max(0, text.split('\n').length - 2) + '\n\n' + (text.split('\n').length - 1) + ' RECORDS PROCESSED *** 0 ERRORS\n');
        }
    }
}

//  EDIT/3000: T to bring a file in, L ALL to list it, A to add lines (// to
//  stop), K to keep, E to leave
function mpeEditor(sh) {
    var lines = [];
    var name = '';
    sh.out('\nHP32201A.07.22  EDIT/3000  ' + era().hp + '\n(C) HEWLETT-PACKARD CO. 1990\n');
    for (;;) {
        sh.io.out('/');
        var l = sh.io.line(true);
        if (l === null) return 'exit';
        var c = l.trim().toUpperCase();
        var m;
        if (/^E(XIT)?$/.test(c)) {
            sh.out('\nEND OF PROGRAM\n');
            return;
        } else if ((m = /^T(EXT)?\s+(\S+)$/.exec(c))) {
            var found = mpeFind(sh, m[2]);
            if (found.err) {
                sh.out('*' + found.err.replace(/\s+\(.*$/, '') + '\n');
                continue;
            }
            var text = mpeRead(sh, found[0]);
            if (text === null) continue;
            lines = text.replace(/\n$/, '').split('\n');
            name = m[2];
            sh.out(lines.length + ' LINES\n');
        } else if (/^L(IST)?(\s+ALL)?$/.test(c)) {
            sh.out(lines.map(function (x, i) { return padStart(String(i + 1), 5) + '     ' + x; }).join('\n') + (lines.length ? '\n' : ''));
        } else if (/^A(DD)?$/.test(c)) {
            for (;;) {
                sh.io.out(padStart(String(lines.length + 1), 5) + '     ');
                var al = sh.io.line(true);
                if (al === null) return 'exit';
                if (al.trim() === '//') break;
                lines.push(al);
            }
        } else if ((m = /^K(EEP)?\s*(\S*)$/.exec(c))) {
            var to = m[2] || name;
            if (!to) {
                sh.out('*NO FILE NAME\n');
                continue;
            }
            if (mpeWrite(sh, to, lines.join('\n') + (lines.length ? '\n' : ''))) name = to;
        } else if (c) {
            sh.out('*UNRECOGNIZED COMMAND\n');
        }
    }
}
// ---- end lib/carrier_mpe.js ----
// ---- lib/carrier_hosts.js ----
//
//  CARRiER's hosts: what answers when you dial a carrier in CoT-TERM. Each
//  system has its own banner, login and shell, written from the old
//  textfiles (see carrier_notes.js for which ones).
//
//  Inside, each system has the same three things to find, in its own way:
//    * a way up: a guest account can read something that gives away the
//      privileged one (mail, a batch job, a job stream)
//    * leads: files listing other systems' numbers, which land on your
//      found list
//    * loot: the system's prize, worth rep (and on a PBX, a barrier code)
//
//  A host runs against a call object from the terminal (carrier.js):
//    io.out(text)            host output, at the line's baud rate
//    io.line(echo)           a line the caller types; null if they hung up
//    io.say(text)            the narrator, between the lines
//    io.reward(rep, why)     show rep earned
//    io.over                 true once the call has ended
//  and the game: ctx.p (the player), ctx.host, ctx.seed.
//

var MAX_TRIES = 3;

//  Today's month and day, in 1993
function era() {
    var d = new Date();
    var t = new Date(1993, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return {
        day: DAYS[t.getDay()],
        vms: pad2(t.getDate()) + '-' + MON[t.getMonth()] + '-1993 ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + ':' + pad2(t.getSeconds()),
        unix: DAYS[t.getDay()].slice(0, 3) + ' ' + MON[t.getMonth()].charAt(0) + MON[t.getMonth()].slice(1).toLowerCase() +
            ' ' + pad2(t.getDate()) + ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + ':' + pad2(t.getSeconds()) + ' EDT 1993',
        prime: DAYS[t.getDay()] + ', ' + pad2(t.getDate()) + ' ' + MON[t.getMonth()].charAt(0) + MON[t.getMonth()].slice(1).toLowerCase() +
            ' 93  ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + ':' + pad2(t.getSeconds()),
        hp: DAYS[t.getDay()].slice(0, 3).toUpperCase() + ', ' + MON[t.getMonth()] + ' ' + t.getDate() + ', 1993, ' +
            ((t.getHours() % 12) || 12) + ':' + pad2(t.getMinutes()) + ' ' + (t.getHours() < 12 ? 'AM' : 'PM'),
    };
}

//  The open account matching user and password, or null. caseFold: VMS,
//  Prime and HP3000 don't care about case; UNIX and System 75 do.
function findAccount(host, user, pass, caseFold) {
    var f = function (s) { return caseFold ? String(s).toUpperCase() : String(s); };
    for (var i = 0; i < host.accounts.length; i++) {
        var a = host.accounts[i];
        if (f(a[0]) === f(user) && f(a[1]) === f(pass)) {
            return a;
        }
    }
    return null;
}

//  A failed login: a little heat
function failedLogin(ctx) {
    addHeat(ctx.p, 1.5 * (ctx.host.prof === 'gov' || ctx.host.prof === 'telco' ? 2 : 1));
}

//  A successful login: rep, and heat on a hot system
function loggedIn(ctx, account, io) {
    var priv = account[2];
    var rep = breakIn(ctx.p, ctx.host, priv);
    if (ctx.host.prof === 'gov' || ctx.host.prof === 'telco') {
        addHeat(ctx.p, priv ? 8 : 5);
    }
    if (rep) {
        io.reward(rep, priv ? 'privileged access' : 'you\'re in');
    }
    return priv;
}

function gotLoot(ctx, io, what, id, worth) {
    var rep = takeLoot(ctx.p, ctx.host, id, worth);
    if (rep) {
        io.reward(rep, what);
    }
}

//  The host's leads, as numbers; shown by the caller, then put on the found
//  list here (once per lead file, a little rep for each new number)
function leadsOf(ctx, n) {
    return hostLeads(ctx.seed, ctx.host, n);
}

function gotLeads(ctx, io, nums, id) {
    if (!nums.length || takeLoot(ctx.p, ctx.host, id, 1) === 0) {
        return;
    }
    var fresh = nums.filter(function (num) { return addLead(ctx.p, num); });
    if (fresh.length) {
        io.reward(1 + fresh.length * 2, fresh.length + ' new number' + (fresh.length > 1 ? 's' : '') + ' for your found list');
    }
}

//  The account on a lead's system a file names (its first open one)
function leadLogin(ctx, num) {
    var res = lineResult(ctx.seed, num.slice(0, 3), num.slice(3, 6), num.slice(6));
    var lh = hostAt(ctx.seed, num, res.kind, exchangeProfile(ctx.seed, num.slice(0, 3), num.slice(3, 6)));
    return lh.accounts[0] || ['guest', 'guest'];
}

//  Made-up users for "who" and "SHOW USERS"
function someUsers(host, n) {
    var r = rng(hash32(host.num + '|users'));
    var names = ['jsmith', 'kwong', 'mdavis', 'operator', 'tlee', 'rgarcia', 'bjones', 'admin', 'pmiller',
        'lchen', 'dbrown', 'sclark', 'field', 'nwilson', 'aharris'];
    var out = [];
    for (var i = 0; i < n && names.length; i++) {
        out.push(names.splice(Math.floor(r() * names.length), 1)[0]);
    }
    return out;
}

function admin(host) {
    return someUsers(host, 3)[2];
}

//  Phase 3: whether the admin is on during this call (a third of the time,
//  more on a hot system). While he is, every command you type costs heat:
//  check who's on before you poke around.
function adminOnline(ctx) {
    if (ctx.adminOn === undefined) {
        var hot = ctx.host.prof === 'gov' || ctx.host.prof === 'telco';
        ctx.adminOn = Math.random() < (hot ? 0.45 : 0.3);
    }
    return ctx.adminOn;
}

//  How the admin talks to you on each kind of system, and you to him
function adminTalk(ctx) {
    var h = ctx.host;
    var at = era();
    var k = h.kind;
    if (k === 'vms') {
        return { boss: 'SYSTEM', how: 'PHONE SYSTEM', who: 'The system manager',
            alert: '\r\n\x07Reply received on ' + h.name + ' from user SYSTEM at _OPA0:   ' + at.vms.slice(12) + '\r\nWho is this?  Identify yourself.\r\n\r\n',
            off: 'Your process has been deleted by SYSTEM.', notOn: '%PHONE-W-NOSUCHUSER, user SYSTEM is not logged in\r\n',
            from: function (t) { return '\r\nMessage from SYSTEM: ' + t + '\r\n'; } };
    }
    if (k === 'prime') {
        return { boss: 'SYSTEM', how: 'MESSAGE SYSTEM', who: 'The operator',
            alert: '\r\n\x07*** SYSTEM (user 1) at ' + at.prime.slice(-8, -3) + '\r\nWho is this?  What are you doing on here?\r\n',
            off: 'Logged out by operator.', notOn: 'User SYSTEM not found. (MESSAGE)\r\n',
            from: function (t) { return '\r\n*** SYSTEM (user 1) at ' + at.prime.slice(-8, -3) + '\r\n' + t + '\r\n'; } };
    }
    if (k === 'hp3000') {
        return { boss: 'MANAGER.SYS', how: 'TELL MANAGER.SYS', who: 'The system manager',
            alert: '\r\n\x07FROM/S20 MANAGER.SYS/WHO IS THIS?  IDENTIFY YOURSELF.\r\n',
            off: 'ABORTED BY SYSTEM MANAGEMENT.  (CIERR 1680)', notOn: 'NO SUCH USER LOGGED ON.  (CIERR 3015)\r\n',
            from: function (t) { return '\r\nFROM/S20 MANAGER.SYS/' + t.toUpperCase() + '\r\n'; } };
    }
    var boss = admin(h);
    return { boss: boss, how: 'write ' + boss, who: 'The admin',
        alert: '\r\n\x07Message from ' + boss + '@' + h.name.toLowerCase() + ' on console at ' + at.unix.slice(11, 16) + ' ...\r\nwho is this?  what are you doing on here?\r\nEOF\r\n',
        off: 'Connection closed by foreign host.', notOn: 'write: ' + boss + ' is not logged on.\r\n',
        from: function (t) { return '\r\nMessage from ' + boss + ': ' + t + '\r\n'; } };
}

//  Phase 4: a live sysop. While the admin is on, each command costs heat;
//  after a few he notices and sends a message, and from then on he may
//  throw you off, unless you talk him round (bluff). Returns true when
//  you've been thrown off.
function watched(ctx, io, weight) {
    if (!adminOnline(ctx) || ctx.bluffed) {
        return false;
    }
    weight = weight === undefined ? 1 : weight;
    addHeat(ctx.p, 0.6 * weight);
    ctx.seen = (ctx.seen || 0) + weight;
    var talk = adminTalk(ctx);
    if (!ctx.noticed && ctx.seen >= 6) {
        ctx.noticed = true;
        io.out(talk.alert);
        io.say(talk.who + ' has seen you. ' + talk.how + ' to talk your way out, or log off.');
        return false;
    }
    if (ctx.noticed && Math.random() < 0.25 * weight) {
        return kicked(ctx, io, talk.off);
    }
    return false;
}

function kicked(ctx, io, text) {
    io.out('\r\n' + text + '\r\n');
    addHeat(ctx.p, 10);
    io.say('Thrown off. Heat up 10.');
    return true;
}

//  Your message to the admin. A story that fits (field service, a backup, a
//  vendor) works more often than not. Returns true when you're thrown off.
function bluff(ctx, io, msg) {
    var talk = adminTalk(ctx);
    if (!adminOnline(ctx)) {
        io.out(talk.notOn);
        return false;
    }
    var good = /field|service|backup|test|maint|vendor|digital|dec\b|prime|hp\b|operator|audit|night|tape|upgrade|install|patch/i.test(msg || '');
    if (!ctx.noticed) {
        io.out(talk.from('huh? who are you?'));
        ctx.noticed = true;
        addHeat(ctx.p, 3);
        return false;
    }
    if (good && Math.random() < 0.6) {
        io.out(talk.from('ok. don\'t break anything, and log off when you\'re done.'));
        ctx.bluffed = true;
        ctx.p.bluffs = (ctx.p.bluffs || 0) + 1;
        io.say('He bought it. He won\'t bother you again this call.');
        return false;
    }
    io.out(talk.from('nice try. calling security.'));
    return kicked(ctx, io, talk.off);
}

//  Covering your tracks: a big heat drop, once a call per system
function cleaned(ctx, io) {
    if (ctx.cleaned) {
        return;
    }
    ctx.cleaned = true;
    ctx.p.heat = Math.max(0, ctx.p.heat - 10);
    ctx.p.cleaned = (ctx.p.cleaned || 0) + 1;
    io.say('Your logins are gone from the record. Heat down 10.');
}

//  The host at a neighbour's number, as a sister machine or DECnet node
function hostAtNum(ctx, num, kind) {
    return hostAt(ctx.seed, num, kind, exchangeProfile(ctx.seed, num.slice(0, 3), num.slice(3, 6)));
}

//  ---- DEC VAX/VMS: carrier_vms.js ----

//  ---- UNIX: carrier_unix.js ----

//  ---- Prime PRIMOS: carrier_prime.js ----

//  ---- HP3000 MPE: carrier_mpe.js ----

//  ---- AT&T System 75 maintenance port ----

function runPBX(ctx, io) {
    var h = ctx.host;
    io.out('\r\n\r\n');
    var acct = null;
    for (var tries = 0; tries < MAX_TRIES && !acct; ) {
        io.out('Login: ');
        var u = io.line(true);
        if (u === null) return;
        if (!u.trim()) continue;
        io.out('Password: ');
        var pw = io.line(false);
        if (pw === null) return;
        io.out('\r\n');
        acct = findAccount(h, u.trim(), pw, false);
        if (!acct) {
            io.out('Login incorrect\r\n\r\n');
            failedLogin(ctx);
            tries++;
        }
    }
    if (!acct) {
        return;
    }
    io.out('\r\nSystem 75 ' + h.version + '  ' + h.org + '\r\nTerminal Type (513, 715, 4410, 4425, VT220): [513] ');
    if (io.line(true) === null) return;
    loggedIn(ctx, acct, io);
    for (;;) {
        io.out('\r\nCommand: ');
        var cmd = io.line(true);
        if (cmd === null) return;
        var c = cmd.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!c) continue;
        if (/^(logoff|logout|exit|quit)$/.test(c)) {
            io.out('\r\nProceed With Logoff? [n] ');
            var yn = io.line(true);
            if (yn === null || /^y/i.test(yn)) return;
        } else if (/^help|^\?/.test(c)) {
            io.out('\r\nadd  change  display  list  logoff  monitor  status\r\n');
        } else if (/^dis(play)? tim/.test(c)) {
            io.out('\r\n                            DATE AND TIME\r\n   DATE\r\n         Day of the Week: ' + era().day + '\r\n');
        } else if (/^list sta/.test(c)) {
            io.out('\r\n                              STATIONS\r\n\r\nExt    Port     Name                 Type  COR  COS\r\n');
            someUsers(h, 6).forEach(function (n, i) {
                io.out(fit(String(2201 + i * 7), 7) + '01A0' + (i + 1) + '0' + i + '  ' + fit(n, 21) + '7405  1    1\r\n');
            });
        } else if (/^list tru/.test(c)) {
            io.out('\r\n                            TRUNK GROUPS\r\n\r\nGrp No.  TAC   Group Type   Group Name         Size\r\n1        101   co           Central Office     12\r\n2        102   wats         Outbound WATS      6\r\n');
        } else if (/^dis(play)? rem/.test(c)) {
            var disa = pbxDisa(ctx.seed, h.num);
            if (!disa) {
                io.out('\r\n                         REMOTE ACCESS\r\n\r\n      Remote Access Extension: not administered\r\n');
                continue;
            }
            var code = String(1000000 + (hash32(h.num + '|barrier') % 9000000));
            io.out('\r\n                         REMOTE ACCESS\r\n\r\n      Remote Access Extension: ' + (2200 + h.users) + '\r\n');
            io.out('          Remote Access Dial-in: ' + fmtNum(disa) + '\r\n');
            io.out('             Barrier Code Length: 7\r\n  Authorization Code Required? n\r\n\r\n  Barrier Code   COR   TN   COS   Expiration Date\r\n');
            io.out('  1: ' + code + '        1    1     1\r\n');
            gotLoot(ctx, io, 'a remote access barrier code');
            if (addCode(ctx.p, code, disa)) {
                addLead(ctx.p, disa);
                ctx.p.found[disa] = ctx.p.found[disa] === 'C?' ? 'T?' : ctx.p.found[disa];
                io.say('Barrier code ' + code + ' is in your pocket. Dial ' + fmtNum(disa) + ', enter the code, and long distance is free.');
            }
        } else {
            io.out('\r\nCommand qualifier is invalid\r\n');
        }
    }
}

//  ---- COSMOS (phase 4) ----
//  The phone company's database of every line: what's on it, who it's for,
//  what switch it runs on. From cosmos.phk and cosmoslg.txt: ";LOGIN:",
//  "PASSWORD:" (skipped for an account with none), a two-letter wire center,
//  then a "wc%" prompt. ISH inquires about a circuit; SIR sorts an inquiry by
//  range. Every command is noticed: it's the hottest system there is.

function runCOSMOS(ctx, io) {
    var h = ctx.host;
    var acct = null;
    for (var tries = 0; tries < MAX_TRIES && !acct; tries++) {
        io.out('\r\n;LOGIN: ');
        var u = io.line(true);
        if (u === null) return;
        u = u.trim().toUpperCase();
        var a = h.accounts.filter(function (x) { return x[0] === u; })[0];
        var pw = '';
        if (!a || a[1] !== '') {
            io.out('PASSWORD: ');
            pw = io.line(false);
            if (pw === null) return;
            io.out('\r\n');
        }
        io.out('WC: ');
        var wc = io.line(true);
        if (wc === null) return;
        if (a && a[1] === pw && wc.trim().toUpperCase() === h.wc) {
            acct = a;
        } else {
            io.out('INVALID LOGIN\r\n');
            failedLogin(ctx);
            addHeat(ctx.p, 3);
        }
    }
    if (!acct) {
        return;
    }
    loggedIn(ctx, acct, io);
    addHeat(ctx.p, 6);
    var t = era();
    var prompt = h.wc.toLowerCase() + '% ';
    var npa = h.num.slice(0, 3);
    for (;;) {
        io.out(prompt);
        var cmd = io.line(true);
        if (cmd === null) return;
        var c = cmd.trim().toUpperCase().replace(/\s+/g, ' ');
        if (!c) continue;
        addHeat(ctx.p, 1.5);
        var w = c.split(' ');
        if (/^(BYE|LOGOFF|LOGOUT|QUIT)$/.test(w[0])) {
            io.out('** LOGGED OFF ' + t.vms.slice(0, 11) + ' **\r\n');
            return;
        } else if (w[0] === 'HELP' || w[0] === '?') {
            io.out('ISH TN <NUMBER>     INQUIRE ABOUT A CIRCUIT\r\nSIR LCC DATA <NXX>  SORTING INQUIRY BY RANGE\r\nWHO  WHERE  BYE\r\n');
        } else if (w[0] === 'WHO') {
            io.out(acct[0] + '   ' + h.wc + '   TTY12\r\n' + someUsers(h, 2).map(function (n) { return n.toUpperCase().slice(0, 2) + '4' + n.length + '   ' + h.wc + '   TTY0' + n.length; }).join('\r\n') + '\r\n');
        } else if (w[0] === 'WHERE') {
            io.out('WIRE CENTER ' + h.wc + '  ' + npaCity(npa).toUpperCase() + '  ' + h.org.toUpperCase() + '\r\n');
        } else if (w[0] === 'ISH') {
            var digits = c.replace(/[^0-9]/g, '');
            var num = digits.length === 7 ? npa + digits : digits;
            if (num.length !== 10) {
                io.out('ISH: ENTER TN AS NNN-NNNN OR NPA-NNN-NNNN\r\n');
                continue;
            }
            addHeat(ctx.p, 2);
            cosmosISH(ctx, io, num);
        } else if (w[0] === 'SIR') {
            var nxx = (c.match(/(\d{3})\s*$/) || [])[1];
            if (!nxx) {
                io.out('SIR: ENTER SIR LCC DATA <NXX>\r\n');
                continue;
            }
            addHeat(ctx.p, 6);
            cosmosSIR(ctx, io, npa, nxx);
        } else {
            io.out('?' + w[0] + ': COMMAND NOT FOUND\r\n');
        }
    }
}

//  What COSMOS knows about one line
function cosmosISH(ctx, io, num) {
    var npa = num.slice(0, 3), nxx = num.slice(3, 6);
    var res = lineResult(ctx.seed, npa, nxx, num.slice(6));
    var prof = exchangeProfile(ctx.seed, npa, nxx);
    var r = rng(hash32(num + '|oe'));
    var lcc = res.kind === 'scc' ? 'SCC' : res.result === 'CARRIER' ? 'DATA' : res.result === 'TONE' ? (/disa|vmb/.test(res.kind) ? 'PBX' : 'TEST') :
        prof === 'res' ? '1FR' : '1FB';
    var vacant = res.result === 'INTERCEPT' || res.result === 'TIMEOUT';
    var who = res.result === 'CARRIER' ? hostAt(ctx.seed, num, res.kind, prof).org.toUpperCase() :
        prof === 'res' ? 'RESIDENCE' : (ORGS[prof] ? pick(r, ORGS[prof][0]).toUpperCase() + pick(r, ORGS[prof][1]).toUpperCase() : 'UNKNOWN');
    io.out('H ISH\r\nTN   ' + npa + '-' + nxx + '-' + num.slice(6) + '\r\n');
    if (vacant) {
        io.out('STAT VAC\r\n** ISH COMPLETED **\r\n');
        return;
    }
    io.out('OE   0' + Math.floor(r() * 10) + '-' + (100 + Math.floor(r() * 900)) + '-' + (10 + Math.floor(r() * 90)) + '\r\n');
    io.out('LCC  ' + lcc + '\r\nSTAT WKG\r\nCUS  ' + who + '\r\nSW   ' + (switchType(ctx.seed, npa, nxx) === 'crossbar' ? 'XBAR' : '1AESS') + '\r\n');
    var d = era().vms;
    io.out('** ISH COMPLETED ' + d.slice(0, 7) + d.slice(9, 11) + ' **\r\n');
    if (res.result === 'CARRIER' && addLead(ctx.p, num)) {
        io.reward(2, 'a data line for your found list');
    }
}

//  The data lines in an exchange: up to eight, onto the found list
function cosmosSIR(ctx, io, npa, nxx) {
    var start = hash32(ctx.seed + '|sir|' + npa + nxx) % 10000;
    var found = [];
    for (var i = 0; i < 10000 && found.length < 8; i++) {
        var line = ('000' + ((start + i) % 10000)).slice(-4);
        if (lineResult(ctx.seed, npa, nxx, line).result === 'CARRIER') {
            found.push(npa + nxx + line);
        }
    }
    io.out('H SIR LCC DATA ' + nxx + '\r\n');
    if (!found.length) {
        io.out('NO RECORDS\r\n');
        return;
    }
    found.forEach(function (num) {
        io.out('TN ' + num.slice(3, 6) + '-' + num.slice(6) + '   LCC DATA   STAT WKG\r\n');
    });
    io.out('** SIR COMPLETED, ' + found.length + ' RECORDS **\r\n');
    gotLeads(ctx, io, found, 'sir' + nxx);
    takeLoot(ctx.p, ctx.host, 'sir', 25);
}

//  ---- the Switching Control Center: the season boss (phase 5) ----
//  The phone company's own master system for a city. The login comes from
//  the season's last raid. The first caller in wins the season.

function runSCC(ctx, io) {
    var h = ctx.host;
    var login = bossLogin(ctx.seed);
    var city = npaCity(h.num.slice(0, 3)).toUpperCase();
    io.out('\r\n\r\nSCCS  SWITCHING CONTROL CENTER SYSTEM\r\n' + city + '  -  1AESS / 5ESS MAINTENANCE\r\nAUTHORIZED TELCO PERSONNEL ONLY.  ALL SESSIONS ARE RECORDED.\r\n\r\n');
    addHeat(ctx.p, 10);
    var ok = false;
    for (var tries = 0; tries < 2 && !ok; tries++) {
        io.out('LOGIN: ');
        var u = io.line(true);
        if (u === null) return;
        io.out('PASSWORD: ');
        var pw = io.line(false);
        if (pw === null) return;
        io.out('\r\n');
        ok = u.trim() === login[0] && pw === login[1];
        if (!ok) {
            io.out('LOGIN INCORRECT\r\n');
            addHeat(ctx.p, 15);
        }
    }
    if (!ok) {
        io.say('Nobody guesses this one. The login comes from the season\'s last raid.');
        return;
    }
    breakIn(ctx.p, h, true);
    io.out('\r\nSCCS ' + era().vms.slice(0, 11) + '  ' + login[0].toUpperCase() + '  ON TTY07\r\n\r\n');
    io.out('<RC:LINE;CHG:\r\nTN ' + fmtNum(ctx.p.phone).slice(2) + '\r\nLCC 1FR->FREE\r\nRC ACCEPTED\r\n\r\n');
    if (bossDown(ctx.p)) {
        ctx.p.rep += 1000;
        ctx.p.cash = (ctx.p.cash || 0) + 500;
        io.reward(1000, 'the Switching Control Center. You won the season.');
        io.say('Your own line just got a class of service nobody pays for. Every board in town will know your handle by morning. The season ends: the Hall of Fame has you.');
    } else {
        ctx.p.rep += 100;
        io.reward(100, 'the Switching Control Center, after ' + season().bossDown);
        io.say('Somebody beat you here: ' + season().bossDown + '. Still, not many have seen this prompt.');
    }
    io.out('<LOGOFF\r\n');
}

//  ---- a BBS ----

function runBBS(ctx, io) {
    var h = ctx.host;
    io.out('\r\n\x1b[2J');
    io.out('\x1b[1;37m' + repeat('=', 60) + '\r\n  ' + h.bbsName.toUpperCase() + '\r\n');
    io.out('\x1b[0;36m  Running ' + h.software + '  -  ' + h.nodes + ' node' + (h.nodes > 1 ? 's' : '') + ', 2400 baud\r\n');
    io.out('  Sysop: ' + h.sysop + '\r\n');
    if (h.sting) {
        io.out('\x1b[1;33m  ** FREE ACCESS ** NO RATIOS ** CODES & 0-DAY WAREZ **\r\n  ** ALL HACKERS & PHREAKS WELCOME - INSTANT VALIDATION **\r\n');
    } else {
        io.out('\x1b[0;37m  Private board. New users: apply, then call back.\r\n');
    }
    io.out('\x1b[1;37m' + repeat('=', 60) + '\x1b[0m\r\n\r\n');
    for (var tries = 0; tries < MAX_TRIES; tries++) {
        io.out('Enter your handle, or NEW to apply: ');
        var u = io.line(true);
        if (u === null) return;
        if (/^new$/i.test(u.trim())) {
            io.out('\r\nHandle: ');
            if (io.line(true) === null) return;
            io.out('Voice phone #: ');
            if (io.line(true) === null) return;
            io.out('City, State: ');
            if (io.line(true) === null) return;
            if (h.sting) {
                io.out('\r\nWelcome aboard! Your account is VALIDATED. Codes are in the\r\nfiles section. Check back daily!\r\n\r\n');
                addHeat(ctx.p, 40);
                ctx.stung = true;
            } else {
                io.out('\r\nYour application has been sent to ' + h.sysop + '.\r\nCall back in 24 hours to see if you were validated.\r\n\r\n');
                gotLoot(ctx, io, 'applied to ' + h.bbsName);
            }
            io.out('Thanks for calling ' + h.bbsName + '!\r\n');
            return;
        }
        if (!u.trim()) continue;
        io.out('Password: ');
        if (io.line(false) === null) return;
        io.out('\r\nIncorrect.\r\n\r\n');
    }
}

//  ---- The Hack Shack (phase 3) ----
//  The fence's board: sell your wares for cash, buy gear and zines.

function runFence(ctx, io) {
    var p = ctx.p;
    io.out('\r\n\x1b[2J');
    io.out('\x1b[1;35m' + repeat('=', 60) + '\r\n  T H E   H A C K   S H A C K\r\n');
    io.out('\x1b[0;35m  Running Telegard 2.5i  -  1 node  -  Sysop: Low Tide\r\n  "no narcs. no lamers. no refunds."\r\n');
    io.out('\x1b[1;35m' + repeat('=', 60) + '\x1b[0m\r\n\r\n');
    io.out('Handle: ' + p.h + '\r\nPassword: ********\r\n\r\n');
    for (;;) {
        io.out('\x1b[0;37mYou have \x1b[1;32m$' + (p.cash || 0) + '\x1b[0;37m and ' + (p.wares || []).length + ' thing' + ((p.wares || []).length === 1 ? '' : 's') + ' to sell.\r\n');
        io.out('\x1b[1;37m[S]\x1b[0;37mell to the fence  \x1b[1;37m[B]\x1b[0;37muy gear  \x1b[1;37m[Z]\x1b[0;37mines  \x1b[1;37m[G]\x1b[0;37moodbye\r\nCommand: ');
        var c = io.line(true);
        if (c === null) return;
        c = c.trim().toUpperCase().charAt(0);
        if (c === 'G' || c === 'Q') {
            io.out('\r\nLow Tide: "Don\'t call here from home."\r\n');
            return;
        } else if (c === 'S') {
            fenceSell(p, io);
        } else if (c === 'B') {
            fenceBuy(p, io, GEAR);
        } else if (c === 'Z') {
            fenceBuy(p, io, ZINES);
        }
        if (io.over) return;
        io.out('\r\n');
    }
}

function fenceSell(p, io) {
    for (;;) {
        var w = p.wares || [];
        if (!w.length) {
            io.out('\r\nLow Tide: "You\'ve got nothing I want. Go get me a passwd file."\r\n');
            return;
        }
        io.out('\r\n  # What                                From               Pays\r\n');
        var shown = w.slice(0, 15);
        shown.forEach(function (x, i) {
            io.out('  ' + fit(String(i + 1), 3) + fit(x.what, 36) + fit(/^NUA/.test(x.num) ? 'Telenet ' + x.num.slice(3) : fmtNum(x.num).slice(2), 19) + '$' + warePrice(x) + '\r\n');
        });
        if (w.length > shown.length) {
            io.out('  ...and ' + (w.length - shown.length) + ' more\r\n');
        }
        io.out('Sell which (number, A for all of them, Enter to stop): ');
        var k = io.line(true);
        if (k === null || !k.trim()) return;
        if (/^a/i.test(k.trim())) {
            var total = 0, n = 0;
            while (p.wares.length) {
                total += sellWare(p, 0);
                n++;
            }
            io.out('\r\n\x1b[1;32m$' + total + '\x1b[0;37m for ' + n + ' piece' + (n > 1 ? 's' : '') + '. Low Tide counts it twice.\r\n');
            return;
        }
        var i = parseInt(k, 10) - 1;
        if (i >= 0 && i < shown.length) {
            var what = w[i].what;
            var got = sellWare(p, i);
            io.out('\r\nSold ' + what + ' for \x1b[1;32m$' + got + '\x1b[0;37m.\r\n');
        }
    }
}

function fenceBuy(p, io, list) {
    for (var show = true; ; show = false) {
        if (show) fenceList(p, io, list);
        io.out('Buy which (number, L lists again, Enter to stop): ');
        var k = io.line(true);
        if (k === null || !k.trim()) return;
        if (/^l/i.test(k.trim())) {
            fenceList(p, io, list);
            continue;
        }
        var g = list[parseInt(k, 10) - 1];
        if (!g) continue;
        var why = buyGear(p, g.id);
        io.out(why ? 'Low Tide: "' + why + '"\r\n' : '\x1b[1;32mYou bought ' + g.name + '.\x1b[0;37m $' + p.cash + ' left.\r\n');
        if (!why && list === ZINES) {
            io.say('New pages for the notebook: they name the real textfiles to read.');
        }
    }
}

function fenceList(p, io, list) {
        io.out('\r\n');
        list.forEach(function (g, i) {
            var have = (p.gear || {})[g.id];
            var tag = have ? (g.durable || list === ZINES ? '  (have it)' : '  (have ' + have + ')') :
                g.rank && rankRep(rankOf(p)) < rankRep(g.rank) ? '  (' + g.rank + ' and up)' : '';
            io.out('\x1b[1;37m  ' + fit(String(i + 1), 3) + fit(g.name, 28) + fit('$' + g.price, 7) + '\x1b[0;33m' + tag + '\r\n');
            wrap(g.about, 70).forEach(function (l) {
                io.out('\x1b[0;36m     ' + l + '\x1b[0;37m\r\n');
            });
        });
}

//  ---- a fax machine ----

function runFax(ctx, io) {
    var junk = '~}|{`^]\\\x7f#$%&';
    var s = '';
    for (var i = 0; i < 70; i++) {
        s += junk.charAt(v3.util.random(junk.length));
    }
    io.out('\r\n' + s.slice(0, 35) + '\r\n' + s.slice(35) + '\r\n');
}

//  ---- Telenet and Tymnet ----
//  connect(address, net) places a call to a host on the packet network.
//  Phase 4: SCAN <from>-<to> scripts a scan of addresses (CoT-TERM's
//  SCAN.SCR), and some PADs are Tymnet.

function runPAD(ctx, io, connect) {
    var h = ctx.host;
    if (h.net === 'tymnet') {
        runTymnet(ctx, io, connect);
        return;
    }
    io.out('\r\n\r\nTELENET\r\n' + h.num.slice(0, 3) + ' ' + (10 + (h.users % 80)) + 'A\r\n\r\nTERMINAL=');
    if (io.line(true) === null) return;
    for (;;) {
        io.out('\r\n@');
        var cmd = io.line(true);
        if (cmd === null) return;
        var c = cmd.trim().toUpperCase();
        if (!c) continue;
        var m = /^C(ONNECT)?\s+([0-9 ]{3,14})$/.exec(c);
        var sc = /^SCAN\s+(\d{3})\s+(\d{1,4})\s*-\s*(\d{1,4})$/.exec(c);
        if (m) {
            var nua = m[2].replace(/\s+/g, '');
            connect(nua, 'telenet');
            if (io.over) return;
        } else if (sc) {
            padScan(ctx, io, 'telenet', sc[1], parseInt(sc[2], 10), parseInt(sc[3], 10));
            if (io.over) return;
        } else if (/^SCAN/.test(c)) {
            io.say('SCAN.SCR: SCAN <area code> <from>-<to>, like SCAN 212 100-199.');
        } else if (/^(D|DISCONNECT|BYE|HANGUP)$/.test(c)) {
            io.out('\r\nDISCONNECTED\r\n');
            return;
        } else if (c === 'HELP' || c === '?') {
            io.out('\r\nC <ADDRESS>   CONNECT TO A HOST\r\nD             DISCONNECT\r\nFULL, HALF    DUPLEX\r\n');
            io.say(TERM + ' can script a scan here: SCAN <area code> <from>-<to>, like SCAN 212 100-199.');
        } else if (c === 'FULL' || c === 'HALF') {
            io.out('\r\n');
        } else {
            io.out('\r\n?');
        }
    }
}

function runTymnet(ctx, io, connect) {
    var h = ctx.host;
    io.out('\r\n\r\nplease type your terminal identifier\r\n');
    if (io.line(true) === null) return;
    io.out('-' + (2000 + h.users * 37) + '-012-\r\n');
    for (;;) {
        io.out('please log in: ');
        var l = io.line(true);
        if (l === null) return;
        var c = l.trim().toUpperCase();
        if (!c) continue;
        var m = /^(?:\w+:)?(\d{1,4});?$/.exec(c);
        var sc = /^SCAN\s+(\d{1,4})\s*-\s*(\d{1,4})$/.exec(c);
        if (m) {
            connect(m[1], 'tymnet');
            if (io.over) return;
        } else if (sc) {
            padScan(ctx, io, 'tymnet', '', parseInt(sc[1], 10), parseInt(sc[2], 10));
            if (io.over) return;
        } else if (/^(BYE|LOGOUT|QUIT)$/.test(c)) {
            io.out('\r\nplease log off\r\n');
            return;
        } else {
            io.out('error, type username\r\n');
            io.say('Tymnet wants a host number, like 2012. Or SCAN <from>-<to> to script a scan.');
        }
    }
}

//  A scripted scan of packet network addresses: up to 100 a run. Every ten
//  cost a local minute; hosts that answer land on the found list.
function padScan(ctx, io, net, area, from, to) {
    var p = ctx.p;
    if (to < from || to - from >= 100) {
        io.out('\r\nSCAN.SCR: one to a hundred addresses at a time.\r\n');
        return;
    }
    io.out('\r\nSCAN.SCR  ' + (net === 'tymnet' ? 'Tymnet hosts ' : 'Telenet ' + area + ' ') + from + '-' + to + '\r\n');
    var hits = 0;
    var dotted = false;
    for (var a = from; a <= to; a++) {
        var addr = net === 'tymnet' ? String(a) : area + ('000' + a).slice(-3);
        var key = (net === 'tymnet' ? 'TYM' : 'NUA') + addr;
        var host = net === 'tymnet' ? tymnetHost(ctx.seed, addr) : nuaHost(ctx.seed, addr);
        if ((a - from) % 10 === 9) {
            chargeCall(p, p.home);
            addHeat(p, 0.2);
        }
        if (host) {
            hits++;
            var fresh = !p.found[key];
            if (fresh) {
                p.found[key] = 'C?';
            }
            //  a hit after progress dots starts its own line
            io.out((dotted ? '\r\n' : '') + (net === 'tymnet' ? 'host ' + addr : area + ' ' + addr.slice(3)) + '  CONNECTED' + (fresh ? '  new' : '') + '\r\n');
            dotted = false;
        } else if ((a - from) % 10 === 9) {
            io.out('.');
            dotted = true;
        }
    }
    io.out((dotted ? '\r\n' : '') + hits + ' answered.\r\n');
    if (hits) {
        io.say('They\'re on your found list. ' + (net === 'tymnet' ? 'Log in to one by its host number.' : 'C <address> connects.'));
    }
}

//  ---- voice mail (ASPEN, Octel, Audix) ----
//  aspen.txt: an unused box says "Your System Administrator has assigned you
//  a temporary password", and the defaults that work are 1111, the box
//  number itself, and 1234. Take one and it's your stash: codes kept there
//  aren't lost in a bust.

function runVMB(ctx, io) {
    var p = ctx.p;
    var v = vmbAt(ctx.seed, ctx.host.num);
    io.say('"Welcome to the ' + v.system + ' voice messaging system. Mailboxes ' + v.base + ' through ' + (v.base + 99) + '."');
    for (var tries = 0; tries < MAX_TRIES; tries++) {
        io.say('"Enter your mailbox number, then press pound."');
        io.out('Box: ');
        var box = io.line(true);
        if (box === null) return;
        box = box.replace(/[^0-9]/g, '');
        var mine = p.vmb && p.vmb.num === ctx.host.num && p.vmb.box === box;
        var n = parseInt(box, 10);
        if (!mine && !v.empty[box]) {
            if (n >= v.base && n < v.base + 100) {
                io.say('"You have reached the mailbox of ' + v.names[n % v.names.length] + '. Please leave a message after the tone."');
                io.say('Beeeep. You hang up before it records you breathing.');
                return;
            }
            io.say('"' + box + ' is not a valid mailbox."');
            continue;
        }
        if (mine) {
            io.say('"Please enter your password."');
        } else {
            io.say('"Hello. This system can enable you to receive messages while you are away from your desk...');
            io.say('...Your System Administrator has assigned you a temporary password. Please enter that password now."');
        }
        io.out('Password: ');
        var pw = io.line(false);
        if (pw === null) return;
        io.out('\r\n');
        if (mine ? pw !== p.vmb.pw : pw !== v.empty[box]) {
            io.say('"That password is not valid. Goodbye."');
            addHeat(p, 1);
            return;
        }
        if (!mine) {
            io.say('"Thank you. You should now change the default password. Make it a number that will be easy for you to remember but hard for others to guess."');
            io.out('New password: ');
            var npw = io.line(false);
            if (npw === null) return;
            npw = npw.replace(/[^0-9]/g, '') || pw;
            io.out('\r\n');
            var moved = p.vmb && p.vmb.num !== ctx.host.num;
            p.vmb = { num: ctx.host.num, box: box, pw: npw };
            gotLoot(ctx, io, 'a voice mailbox of your own', 'box', 15);
            io.say('Box ' + box + ' is yours now, password ' + npw + '.' + (moved ? ' Your stash came with you.' : ''));
        }
        vmbMenu(ctx, io);
        return;
    }
}

function vmbMenu(ctx, io) {
    var p = ctx.p;
    p.stash = p.stash || [];
    p.codes = p.codes || [];
    for (var first = true; ; first = false) {
        io.say('"You have ' + p.stash.length + ' saved message' + (p.stash.length === 1 ? '' : 's') + '.' + (first
            ? ' To listen, press 1. To save the codes you carry, press 5. To take your codes back, press 6. To hang up, press pound."'
            : '"  (1 listen, 5 save codes, 6 take them back, # hang up)'));
        io.out('> ');
        var k = io.line(true);
        if (k === null) return;
        k = k.trim();
        if (k === '1') {
            if (!p.stash.length) {
                io.say('"You have no messages."');
            }
            p.stash.forEach(function (c, i) {
                io.say('Message ' + (i + 1) + ': "' + c.c.split('').join(' ') + ', for ' + fmtNum(c.disa) + '. ' + c.uses + ' uses left."');
            });
        } else if (k === '5') {
            if (!p.codes.length) {
                io.say('You aren\'t carrying any codes.');
                continue;
            }
            io.say('You read ' + p.codes.length + ' code' + (p.codes.length > 1 ? 's' : '') + ' into the box. A bust can\'t touch them here.');
            p.stash = p.stash.concat(p.codes);
            p.codes = [];
        } else if (k === '6') {
            if (!p.stash.length) {
                io.say('"You have no messages."');
                continue;
            }
            io.say('You copy ' + p.stash.length + ' code' + (p.stash.length > 1 ? 's' : '') + ' back onto paper. Now they can be lost again.');
            p.codes = p.codes.concat(p.stash);
            p.stash = [];
        } else if (k === '#' || k === '') {
            io.say('"Goodbye."');
            return;
        }
    }
}

var HOST_RUNNERS = { vms: runVMS, unix: runUnix, prime: runPrime, hp3000: runHP, pbx: runPBX, bbs: runBBS, fax: runFax, fence: runFence,
    cosmos: runCOSMOS, scc: runSCC };

//  What you hear on a tone line
var TONE_TEXT = {
    disa: ['A second dial tone. The PBX is waiting for digits.', 'A barrier code would open it up.'],
    loop: ['Silence, then a steady tone. One end of a loop-around.', 'Get a friend on the other end and you could talk for free.'],
    milliwatt: ['A steady 1004 Hz tone. A milliwatt test line.', 'The phone company tests its lines with these.'],
    anac: ['A computer voice reads back a number, digit by digit.', 'An ANAC: it tells you the number you\'re calling from.'],
};
// ---- end lib/carrier_hosts.js ----
// ---- lib/carrier_land.js ----
//
//  Landmarks (phase 6, step 5): hand-written hosts at the real exchanges of
//  real places, under stand-in names that leave no doubt who they are. The
//  rest of each exchange is generated as usual. Every exchange here was
//  checked against period sources; see docs/design.md.
//
//  A landmark is LANDMARKS[number]: its kind, profile, name and accounts,
//  and hooks the host's shell calls:
//    tree(ctx, w, put, dir)  adds its own files to the generated tree
//    hello(ctx, io)          after logging in (the first time pays rep)
//    each(ctx, io)           after every command
//    bye(ctx, io)            when the caller leaves
//

//  The exchanges around them
SPECIAL_EXCHANGES['617253'] = { prof: 'edu', hosts: [['unix', 45], ['vms', 25], ['prime', 10], ['pad', 10], ['fax', 10]] };
SPECIAL_EXCHANGES['617981'] = { prof: 'gov', hosts: [['vms', 45], ['unix', 35], ['fax', 20]] };
SPECIAL_EXCHANGES['301688'] = { prof: 'gov', hosts: [['vms', 40], ['unix', 40], ['fax', 20]] };

//  The account Crack gets first from a host's password file (as
//  finishCracks makes it): Fort Meade's staff used it twice
function landCracked(seed, num) {
    var r = rng(hash32(seed + '|crack|' + num));
    return [someUsersFor(num, 5)[1], pick(r, CRACK_WORDS)];
}

//  The first carrier of kind in an exchange: a lead's number
function landFirst(seed, npa, nxx, kinds) {
    for (var l = 0; l < 10000; l++) {
        var line = ('000' + l).slice(-4);
        var res = lineResult(seed, npa, nxx, line);
        if (res.result === 'CARRIER' && kinds.indexOf(res.kind) >= 0) return npa + nxx + line;
    }
    return '';
}

var LANDMARKS = {
    //  The Institute's AI lab: tourists welcome, passwords optional
    '6172530042': {
        id: 'institute', kind: 'unix', prof: 'edu', name: 'FISHBOWL', org: 'The Institute, AI Laboratory',
        version: '4.3 BSD UNIX', users: 11, bonus: 60,
        title: 'the Institute',
        accounts: function () { return [['guest', '', false], ['tourist', '', false]]; },
        secret: function () { return ['root', 'tinkerbell', true]; },
        hello: function (ctx, io) {
            io.say('The Institute\'s AI lab. They left the door open on purpose: tourists were always welcome here. Look around /usr/hacks.');
        },
        tree: function (ctx, w, put, dir) {
            var f = function (own, text, days) { return fsFile(own, 'staff', 'rw-r--r--', text, fsDate(days)); };
            put('/etc/motd', fsFile('root', 'sys', 'rw-r--r--',
                'Welcome to FISHBOWL, the Institute AI Lab.\n\n' +
                '  Tourists are welcome.  guest and tourist have no password; please don\'t\n' +
                '  make us give them one.  Don\'t crash the machine, don\'t read other people\'s\n' +
                '  mail, and if you do something clever, leave a note in /usr/hacks.\n\n' +
                '  The coffee machine is on the network again.  See /usr/hacks/coffee.\n', fsDate(3)));
            dir('/usr/hacks', 'root', 'staff', 'rwxrwxrwx');
            put('/usr/hacks/README', f('root',
                'This is where hacks go.  Write up what you did, sign it if you like.\n' +
                'The good ones get read aloud at the Friday tea.  The bad ones too.\n', 200));
            put('/usr/hacks/coffee', f('bwk2',
                'The coffee machine on 7 answers on its serial line again.  It says\n' +
                'EMPTY or FULL and nothing else, which is all anyone wants to know.\n' +
                'Do not teach it to say anything else.  That was last year.\n', 20));
            put('/usr/hacks/tunnels', f('mlr',
                'The tunnels: the steam tunnel under building 10 connects to almost\n' +
                'everything.  Wear old shoes.  The roof of 54 is not a good idea in\n' +
                'February, ask anyone.  Leave things the way you found them.\n', 90));
            put('/usr/hacks/whiteboard', f('kdc',
                'copied off the lab whiteboard before the cleaners got it:\n\n' +
                '  - fix the printer daemon (again)\n' +
                '  - root this week: tinkerbell  (it\'s on the whiteboard, so everyone knows)\n' +
                '  - tea is at 4, bring your own mug\n', 4)).onRead = function (c, io) {
                io.say('Root\'s password, on a whiteboard, for anyone. su might take it.');
            };
            //  the Institute's defense lab out in Lexington: a lead
            var lex = landFirst(ctx.seed, '617', '981', ['vms', 'unix']);
            put('/usr/hacks/lexington', f('mlr',
                'The Lexington lab is the Institute\'s, but it isn\'t like here.  Badges,\n' +
                'guards, and they mean it.  Somebody\'s old dialup list has a modem out\n' +
                'there' + (lex ? ' at ' + fmtNum(lex).slice(2) : '') + '.  I would not.\n', 30)).onRead = function (c, io) {
                if (lex) {
                    gotLeads(c, io, [lex], 'lexington');
                    io.say('The Lexington lab: the Institute\'s, but defense work, and watched. It\'s on your found list.');
                }
            };
            ['bwk2', 'mlr', 'kdc'].forEach(function (u, i) {
                var hd = dir(w.lay.home + '/' + u, u, 'staff', 'rwxr-xr-x');
                hd.kids['.plan'] = fsFile(u, 'staff', 'rw-r--r--', ['Thesis.  Someday.', 'Hacking the elevator music.  Do not ask.',
                    'Office hours: whenever the door is open.'][i] + '\n', fsDate(10 + i));
            });
        },
    },

    //  Fort Meade's outermost machine: easy to get into, and that's the point
    '3016887140': {
        id: 'terminus', kind: 'unix', prof: 'gov', name: 'TERMINUS', org: 'the Fort Meade facility',
        version: 'SunOS 4.1.1', users: 3, bonus: 30, honeypot: true,
        title: 'the Fort Meade facility',
        accounts: function () { return [['guest', 'guest', false], ['field', 'service', false]]; },
        secret: function (seed) { return ['root', 'wire' + (100 + hash32(seed + 'terminus') % 900), true]; },
        hello: function (ctx, io) {
            io.say('Fort Meade. That was far too easy.');
        },
        each: function (ctx, io) {
            //  everything typed here goes to a log someone reads
            addHeat(ctx.p, 1.5);
        },
        bye: function (ctx, io) {
            io.out('\r\n*** This session has been recorded in its entirety. ***\r\n');
            io.say('A honeypot. Every keystroke you typed went straight to Fort Meade. Heat +25.');
            addHeat(ctx.p, 25);
        },
        tree: function (ctx, w, put, dir) {
            var f = function (own, mode, text, days) { return fsFile(own, 'staff', mode, text, fsDate(days)); };
            put('/etc/motd', fsFile('root', 'sys', 'rw-r--r--',
                'UNCLASSIFIED\n\nThis is a U.S. Government system for authorized use only.  Use of this\n' +
                'system constitutes consent to monitoring.  All activity is logged.\n', fsDate(400)));
            var inner = '3016882600';
            //  the host table someone forgot to trim: the inner machine
            put('/etc/hosts', fsFile('root', 'sys', 'rw-r--r--',
                '127.0.0.1       localhost\n10.1.4.7        terminus loghost\n10.1.4.12       anteroom        # VAX, dialup ' + fmtNum(inner).slice(2) + ' (do not publish)\n',
                fsDate(200))).onRead = function (c, io) {
                gotLeads(c, io, [inner], 'anteroom');
                io.say('A dialup for the machine behind this one. It\'s on your found list. Its staff use their passwords twice, people say.');
            };
            dir('/home/analyst', 'analyst', 'staff', 'rwxr-xr-x');
            dir('/home/analyst/projects', 'analyst', 'staff', 'rwxr-xr-x');
            ['BLUE.HERON', 'SANDGLASS', 'NIGHT.ORCHARD'].forEach(function (p, i) {
                dir('/home/analyst/projects/' + p, 'analyst', 'staff', 'rwxr-xr-x');
                put('/home/analyst/projects/' + p + '/README', f('analyst', 'rw-r--r--',
                    p + '\n\nCompartmented.  Further material is held on the inner system only.\n', 30 + i * 7));
            });
            put('/home/analyst/projects/SANDGLASS/contacts', f('analyst', 'rw-r--r--',
                'If the Kunia relay is down again, call the duty officer, not me.\n', 12));
        },
    },

    //  The machine behind it: one way in, and it isn't the front door
    '3016882600': {
        id: 'anteroom', kind: 'vms', prof: 'gov', name: 'ANTEROOM', org: 'the Fort Meade facility',
        version: 'V5.5', users: 6, bonus: 150, heat: 15,
        title: 'inside the Fort Meade facility',
        //  the password TERMINUS's staff reused, as Crack finds it there
        accounts: function (seed) {
            var c = landCracked(seed, '3016887140');
            return [[c[0].toUpperCase(), c[1].toUpperCase(), false]];
        },
        secret: function (seed) { return ['SYSTEM', 'K' + (1000 + hash32(seed + 'anteroom') % 9000) + 'Z', true]; },
        hello: function (ctx, io) {
            addHeat(ctx.p, 15);
            io.say('Inside Fort Meade, on a password somebody used twice. Every minute here is hot. Heat +15.');
        },
        each: function (ctx, io) { addHeat(ctx.p, 1); },
    },
};

//  The landmark at num, or null
function landmarkAt(num) {
    return LANDMARKS[num] || null;
}

//  A landmark host, over the one hostAt generated at its number
function landHost(seed, h) {
    var l = landmarkAt(h.num);
    if (!l) return h;
    h.landmark = l.id;
    h.kind = l.kind;
    h.prof = l.prof;
    h.name = l.name;
    h.org = l.org;
    h.version = l.version;
    h.users = l.users;
    h.secret = l.secret(seed);
    h.accounts = l.accounts(seed).concat([h.secret]);
    return h;
}

//  After logging in to a landmark: the first time pays rep
function landHello(ctx, io) {
    var l = landmarkAt(ctx.host.num);
    if (!l) return;
    var p = ctx.p;
    p.landmarks = p.landmarks || {};
    if (!p.landmarks[l.id]) {
        p.landmarks[l.id] = today();
        p.rep += l.bonus;
        io.reward(l.bonus, 'a landmark: ' + l.title);
    }
    if (l.hello) l.hello(ctx, io);
}

function landEach(ctx, io) {
    var l = landmarkAt(ctx.host.num);
    if (l && l.each) l.each(ctx, io);
}

function landBye(ctx, io) {
    var l = landmarkAt(ctx.host.num);
    if (l && l.bye && !io.over) l.bye(ctx, io);
}

//  Its own files, over the generated tree
function landTree(ctx, w, root) {
    var l = landmarkAt(ctx.host.num);
    if (!l || !l.tree) return;
    var put = function (path, node) { return fsPut(root, path, node); };
    var dir = function (path, own, grp, mode) {
        var have = fsLook({ root: root, home: '/' }, '/', path, { root: true }, true).node;
        return have && have.dir ? have : put(path, fsDir(own || 'root', grp || 'sys', mode));
    };
    l.tree(ctx, w, put, dir);
}
// ---- end lib/carrier_land.js ----

//
//  CARRiER: a war dialer door game. You're at a DOS box in 1993: set a
//  prefix in CARRiER, watch the scan come back, and dial what you find in
//  CoT-TERM. Every host is emulated; nothing ever dials a real number.
//  Design in docs/design.md.
//
//  Door: doors.json CARRIER, v3_script, max_run_minutes -1. Settings come
//  from the door's args; see README.md.
//

const W = 80;
const VERSION = 'v1.5';

//  The sysop's settings, as name=value words in the door's args:
//    library=<area>  the file area the notebook sends players to for its
//                    textfiles ("cot": City of Thieves' own areas, per note).
//                    Unset, a note names the file and says to find it.
//    brand=<name>    the made-up company of 1993: "<name> Software" in the
//                    title and the terminal program "<name>-TERM" (default CoT)
var SETTINGS = (function () {
    var s = { library: '', brand: 'CoT' };
    (v3.args || []).forEach(function (a) {
        var m = /^\s*(\w+)\s*=\s*(.*?)\s*$/.exec(String(a));
        if (m && s.hasOwnProperty(m[1].toLowerCase())) s[m[1].toLowerCase()] = m[2];
    });
    if (!/^[\w .&'-]{1,12}$/.test(s.brand)) s.brand = 'CoT';
    return s;
})();
var TERM = SETTINGS.brand + '-TERM';
var COMPANY = SETTINGS.brand + ' Software';

//  Where a note says its textfile is
function noteWhere(note) {
    var lib = SETTINGS.library;
    return !lib ? 'any textfile archive' : lib.toLowerCase() === 'cot' ? note.area : lib;
}

//  DOS colours
const BAR = '\x1b[0;1;37;44m'; //  white on blue
const BARHI = '\x1b[0;30;46m'; //  black on cyan, the lightbar
const BLUE = '\x1b[0;37;44m';
const BLUEY = '\x1b[0;1;33;44m';
const BLUEC = '\x1b[0;1;36;44m';
const BLK = '\x1b[0;37;40m';
const BRT = '\x1b[0;1;37;40m';
const DIM = '\x1b[0;1;30;40m';
const CYN = '\x1b[0;36;40m';
const BCYN = '\x1b[0;1;36;40m';
const GRN = '\x1b[0;1;32;40m';
const YEL = '\x1b[0;1;33;40m';
const RED = '\x1b[0;1;31;40m';
const MAG = '\x1b[0;1;35;40m';
const NOTE = '\x1b[0;30;43m'; //  the notebook's yellow paper
const NOTEHI = '\x1b[0;1;31;43m';

const RESULT_COLOR = { CARRIER: GRN, TONE: YEL, VOICE: CYN, BUSY: RED, RINGOUT: DIM, TIMEOUT: DIM, INTERCEPT: MAG };
const RESULT_WAIT = { CARRIER: 520, TONE: 380, VOICE: 260, BUSY: 140, RINGOUT: 420, TIMEOUT: 360, INTERCEPT: 90 };

var H = 24;
var P = null; //  the player
var SEASON = null;

function out(s) {
    v3.console.write(s);
}

function at(r, c) {
    return ANSI.goto(r, c);
}

function cls() {
    out('\x1b[0m\x1b[2J\x1b[H');
}

//  A key, waiting up to ms (0: forever). '' on timeout.
function key(ms) {
    return v3.console.readkey(ms || 0);
}

//  Wait, but a key ends it early. Returns the key, or ''.
function pause(ms) {
    return key(ms);
}

//  A box with a single-line border, filled with colour
function box(r, c, w, h, color, title) {
    var s = color + at(r, c) + '┌' + repeat('─', w - 2) + '┐';
    for (var i = 1; i < h - 1; i++) {
        s += at(r + i, c) + '│' + repeat(' ', w - 2) + '│';
    }
    s += at(r + h - 1, c) + '└' + repeat('─', w - 2) + '┘';
    if (title) {
        s += at(r, c + 2) + ' ' + title + ' ';
    }
    return s;
}

function titleBar(text) {
    out(at(1, 1) + BAR + fit(' ' + text, W) + BLK);
}

function center(s, w) {
    var pad = Math.max(0, Math.floor((w - visibleLength(s)) / 2));
    return repeat(' ', pad) + s;
}

//  A field the caller types into at (r, c). allow: a regex for one
//  character. Returns the text, or null on Esc.
function field(r, c, w, init, allow, color) {
    var v = init || '';
    var fresh = !!v; //  typing over a filled-in value replaces it
    color = color || BARHI;
    for (;;) {
        out(at(r, c) + color + fit(v, w) + at(r, c + Math.min(v.length, w - 1)) + ANSI.showCursor());
        var k = key();
        var n = keyName(k);
        if (n === 'escape') {
            out(ANSI.hideCursor());
            return null;
        }
        if (n === 'return') {
            out(ANSI.hideCursor());
            return v;
        }
        if (n === 'backspace') {
            v = v.slice(0, -1);
            fresh = false;
            continue;
        }
        var ch = keyChar(k);
        if (ch && allow.test(ch)) {
            if (fresh) {
                v = '';
                fresh = false;
            }
            if (v.length < w) {
                v += ch;
            }
        }
    }
}

//  A lightbar over items [{label, hot, id}] at (r, c), w wide. Returns the
//  chosen id, or null on Esc.
function lightbar(items, r, c, w, sel, normal) {
    normal = normal || BLUE;
    sel = sel || 0;
    var draw = function () {
        var s = '';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var col = i === sel ? BARHI : normal;
            var hot = i === sel ? BARHI : (normal === BLUE ? BLUEY : YEL);
            s += at(r + i, c) + col + ' ' + hot + it.label.charAt(0) + col + fit(it.label.slice(1), w - 3) + ' ';
        }
        out(s + BLK);
    };
    for (;;) {
        draw();
        var k = key();
        var n = keyName(k);
        if (n === 'up') sel = (sel + items.length - 1) % items.length;
        else if (n === 'down') sel = (sel + 1) % items.length;
        else if (n === 'home') sel = 0;
        else if (n === 'end') sel = items.length - 1;
        else if (n === 'return') return items[sel].id;
        else if (n === 'escape') return null;
        else {
            var ch = keyChar(k).toLowerCase();
            for (var i = 0; i < items.length; i++) {
                if (ch && items[i].label.charAt(0).toLowerCase() === ch) {
                    sel = i;
                    draw();
                    return items[i].id;
                }
            }
        }
    }
}

function anyKey(row, text) {
    out(at(row || H, 1) + DIM + center(text || 'press a key', W) + BLK);
    key();
}

//  ---- the logo ----

var FONT = {
    C: ['▄███▄', '█    ', '█    ', '█    ', '▀███▀'],
    A: ['▄███▄', '█   █', '█████', '█   █', '█   █'],
    R: ['████▄', '█   █', '████▀', '█  ▀▄', '█   █'],
    i: [' ', '▄', '█', '█', '█'],
    E: ['█████', '█    ', '████ ', '█    ', '█████'],
};
var LOGO_SHADES = ['\x1b[0;1;37;40m', '\x1b[0;1;36;40m', '\x1b[0;36;40m', '\x1b[0;1;34;40m', '\x1b[0;34;40m'];

function logo(r) {
    var word = ['C', 'A', 'R', 'R', 'i', 'E', 'R'];
    var lines = [];
    for (var y = 0; y < 5; y++) {
        var l = '';
        for (var i = 0; i < word.length; i++) {
            l += (word[i] === 'i' ? '\x1b[0;1;35;40m' : LOGO_SHADES[y]) + FONT[word[i]][y] + ' ';
        }
        lines.push(l);
    }
    var width = visibleLength(lines[0]);
    var c = Math.floor((W - width) / 2) + 1;
    var s = '';
    for (var j = 0; j < lines.length; j++) {
        s += at(r + j, c) + lines[j];
    }
    out(s + BLK);
}

//  ---- boot ----

function typeOut(text, fast) {
    for (var i = 0; i < text.length; i++) {
        out(text.charAt(i));
        if (!fast.v && pause(45 + v3.util.random(70))) {
            fast.v = true;
        }
    }
}

function boot() {
    cls();
    out(ANSI.hideCursor());
    var fast = { v: false };
    var step = function (ms) {
        if (!fast.v && pause(ms)) {
            fast.v = true;
        }
    };
    out(BLK + '\r\nC:\\>');
    step(500);
    typeOut('cd \\carrier', fast);
    out('\r\n\r\nC:\\CARRIER>');
    step(300);
    typeOut('carrier', fast);
    out('\r\n\r\n');
    step(250);
    out(BRT + 'CARRiER ' + VERSION + BLK + '  War Dialer.  (c) 1993 ' + COMPANY + '.  Freeware: copy it!\r\n\r\n');
    step(300);
    out('Reading CARRIER.CFG ........ ');
    step(350);
    out(BRT + 'ok' + BLK + '\r\nModem on COM2 ............... ');
    step(300);
    out(BCYN + 'ATZ' + BLK + '\r\n                              ');
    step(400);
    out(BRT + 'OK' + BLK + '\r\nModem ....................... ' + (P ? modemOf(P).name : 'Hayes-compatible 2400') + '\r\n');
    step(250);
    out('FOUND.DAT ................... ' + (P ? Object.keys(P.found).length : 0) + ' entries\r\n');
    step(700);
}

//  ---- first run ----

function firstRun() {
    cls();
    titleBar('CARRiER ' + VERSION + ' :: setup');
    out(at(3, 3) + BRT + 'CARRIER.CFG not found. Where are you calling from?' + BLK);
    out(at(4, 3) + DIM + 'Calls in your own area code cost 1 minute; long distance costs 3.' + BLK);
    var items = NPAS.map(function (n) { return { label: n[0] + '  ' + n[1], id: n[0] }; });
    //  numbers aren't hotkeys here: digits pick by area code below
    out(box(6, 20, 40, items.length + 2, BLUE, 'Home area code'));
    var sel = items.length - 5;
    var home = null;
    while (!home) {
        var r = lightbarNoHot(items, 7, 21, 38, sel);
        if (r === null) {
            return null;
        }
        home = r;
    }
    var p = newPlayer(home);
    cls();
    out(at(3, 3) + BRT + 'Your line: ' + GRN + fmtNum(p.phone) + BLK);
    out(at(5, 3) + 'Every day you get ' + BRT + FREE_MINUTES + BLK + ' minutes of calls. Leftovers keep, up to ' + BANK_CAP + '.');
    out(at(6, 3) + 'Run past zero and the phone bill runs up: you can keep dialing, but');
    out(at(7, 3) + 'the heat comes three times as fast. Too much heat and you get busted.');
    out(at(9, 3) + 'Scan an exchange for carriers, then dial what you find. Your notebook');
    out(at(10, 3) + 'says where to read up on each kind of system: real textfiles' + (SETTINGS.library ? ', in' : '') + '.');
    out(at(11, 3) + (SETTINGS.library ? 'this board\'s file areas. ' : '') + 'More pages turn up as your rank goes up.');
    anyKey(14);
    return p;
}

function lightbarNoHot(items, r, c, w, sel) {
    for (;;) {
        var s = '';
        for (var i = 0; i < items.length; i++) {
            s += at(r + i, c) + (i === sel ? BARHI : BLUE) + ' ' + fit(items[i].label, w - 1);
        }
        out(s + BLK);
        var n = keyName(key());
        if (n === 'up') sel = (sel + items.length - 1) % items.length;
        else if (n === 'down') sel = (sel + 1) % items.length;
        else if (n === 'return') return items[sel].id;
        else if (n === 'escape') return null;
    }
}

//  ---- the main menu ----

function heatBar(heat, w) {
    var n = Math.round(heat / 100 * w);
    var col = heat >= 60 ? RED : heat >= 30 ? YEL : GRN;
    return col + repeat('█', n) + DIM + repeat('░', w - n) + BLK;
}

function statusLine(r) {
    var min = P.min < 0 ? RED + 'BILL ' + (-P.min) : BRT + P.min;
    out(at(r, 1) + BLK + '\x1b[K' + at(r, 2) + BRT + P.h + DIM + ' · ' + BCYN + rankOf(P) + DIM + ' · rep ' + BRT + P.rep +
        DIM + ' · ' + GRN + '$' + (P.cash || 0) + DIM + ' · min ' + min + DIM + ' · heat ' + heatBar(P.heat, 10) + BLK);
}

var MAIN_ITEMS = [
    { label: 'Scan an exchange', id: 'scan' },
    { label: 'Found list', id: 'found' },
    { label: 'Map of an exchange', id: 'map' },
    { label: 'Dial a number (' + TERM + ')', id: 'dial' },
    { label: 'Notebook', id: 'notes' },
    { label: 'Gear and tools', id: 'gear' },
    { label: 'Underground: raids, rivals', id: 'raids' },
    { label: 'The Scene Daily', id: 'news' },
    { label: 'Rankings', id: 'ranks' },
    { label: 'You', id: 'you' },
    { label: 'Quit to DOS', id: 'quit' },
];

function mainMenu() {
    var sel = 0;
    for (;;) {
        settle(P);
        var promo = checkPromotion(P);
        if (promo) {
            savePlayer(P);
            promoted(promo);
        }
        var cracked = finishCracks(P, SEASON.seed);
        if (cracked.length) {
            savePlayer(P);
            crackDone(cracked);
        }
        var raids = claimRaids(P, SEASON);
        if (raids.length) {
            savePlayer(P);
            raidRewards(raids);
        }
        var badges = checkBadges(P);
        if (badges.length) {
            savePlayer(P);
            badgeNotice(badges);
        }
        cls();
        titleBar('CARRiER ' + VERSION + '  ::  War Dialer' + padStart('(c) 1993 ' + COMPANY, 44));
        logo(3);
        out(at(8, 1) + DIM + center('scanning the public switched telephone network since 1993', W) + BLK);
        out(box(10, 24, 34, MAIN_ITEMS.length + 2, BLUE, 'Main'));
        if (isGrounded(P)) {
            out(at(H - 1, 1) + RED + center('Grounded. Your modem is gone until ' + clock(P.grounded) + '.', W) + BLK);
        }
        statusLine(H);
        var id = lightbar(MAIN_ITEMS, 11, 25, 32, sel);
        for (var i = 0; i < MAIN_ITEMS.length; i++) {
            if (MAIN_ITEMS[i].id === id) sel = i;
        }
        if (id === null || id === 'quit') {
            return;
        }
        if ((id === 'scan' || id === 'dial') && isGrounded(P)) {
            grounded();
            continue;
        }
        if (id === 'scan') scanSetup();
        else if (id === 'found') foundList();
        else if (id === 'map') mapScreen();
        else if (id === 'dial') dialPrompt();
        else if (id === 'notes') notebook(null);
        else if (id === 'gear') gearScreen();
        else if (id === 'raids') raidsScreen();
        else if (id === 'news') sceneDaily(false);
        else if (id === 'ranks') rankings();
        else if (id === 'you') you();
        savePlayer(P);
    }
}

function clock(ms) {
    var d = new Date(ms);
    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + (new Date().getDate() === d.getDate() ? '' : ' tomorrow');
}

function grounded() {
    cls();
    out(at(8, 1) + RED + center('Your parents still have the modem.', W));
    out(at(10, 1) + BLK + center('You get it back at ' + clock(P.grounded) + '. Read up in the meantime:', W));
    out(at(11, 1) + BLK + center('the notebook knows which files are worth your time.', W));
    anyKey(14);
}

//  ---- scanning ----

var LAST = { npa: '', nxx: '', mask: '01XX' };

function scanSetup() {
    cls();
    titleBar('CARRiER ' + VERSION + '  ::  Scan setup');
    out(box(4, 12, 56, 14, BLUE, 'CARRIER.CFG'));
    var npa = LAST.npa || P.home;
    out(at(6, 15) + BLUE + 'Area code    ' + at(8, 15) + 'Exchange     ' + at(10, 15) + 'Lines        ' +
        at(12, 15) + BLUEC + 'Lines: four digits, X for each one to scan.' +
        at(13, 15) + '01XX scans 0100-0199; XXXX all 10,000.' +
        at(14, 15) + 'Local calls cost 1 minute each, long distance 3.' + BLK);
    for (;;) {
        out(at(6, 41) + BLUEC + fit(npaCity(npa), 24));
        var a = field(6, 28, 3, npa, /[0-9]/);
        if (a === null) return;
        if (a.length === 3) {
            npa = a;
            out(at(6, 41) + BLUEC + fit(npaCity(npa) || '', 24));
            break;
        }
    }
    var nxx = field(8, 28, 3, LAST.nxx, /[0-9]/);
    if (nxx === null || nxx.length !== 3) return;
    var mask = field(10, 28, 4, LAST.mask, /[0-9xX]/);
    if (mask === null) return;
    mask = mask.toUpperCase();
    if (!/^\d{0,3}X{1,4}$/.test(mask) || mask.length !== 4) {
        out(at(15, 15) + BLUEY + 'Use digits, then X\'s to the end: 01XX, 5XXX...' + BLK);
        key(2500);
        return;
    }
    LAST = { npa: npa, nxx: nxx, mask: mask };
    var lines = [];
    var fixed = mask.replace(/X/g, '');
    var span = Math.pow(10, 4 - fixed.length);
    for (var i = 0; i < span; i++) {
        lines.push(fixed + padStart(String(i), 4 - fixed.length).replace(/ /g, '0'));
    }
    var cost = lines.length * (npa === P.home ? 1 : 3);
    var canCode = npa !== P.home && (P.codes || []).length > 0;
    var canBlue = npa !== P.home && hasGear(P, 'bluebox');
    out(at(15, 15) + BLUEY + lines.length + ' numbers, about ' + cost + ' minutes. You have ' + P.min + '.' + BLK);
    if (canBlue) {
        out(at(16, 15) + BLUEC + 'Switch: ' + switchType(SEASON.seed, npa, nxx) + (switchType(SEASON.seed, npa, nxx) === 'crossbar' ? ' (a blue box works here)' : ' (it\'ll hear a blue box)') + BLK);
    }
    out(at(19, 1) + BLK + center(BRT + 'Enter' + BLK + ' scans   ' + (canCode ? BRT + 'C' + BLK + ' barrier code   ' : '') +
        (canBlue ? BRT + 'B' + BLK + ' blue box   ' : '') + BRT + 'Esc' + BLK + ' backs out', W));
    var through = null;
    for (;;) {
        var k = key();
        var n = keyName(k);
        var ch = keyChar(k).toLowerCase();
        if (n === 'escape') return;
        if (n === 'return') break;
        if (canCode && ch === 'c') {
            through = useCode(P);
            break;
        }
        if (canBlue && ch === 'b') {
            through = { kind: 'blue' };
            break;
        }
    }
    if (through && through.kind === 'blue' && !blueBoxOK(npa, nxx)) {
        return;
    }
    scan(npa, nxx, lines, through);
}

//  A blue box into this exchange: a crossbar office takes the tones; an
//  ESS office hears 2600 Hz on the trunk and flags the line. False if the
//  call didn't go through.
function blueBoxOK(npa, nxx) {
    if (switchType(SEASON.seed, npa, nxx) === 'crossbar') {
        P.blueCalls = (P.blueCalls || 0) + 1;
        return true;
    }
    addHeat(P, 12);
    savePlayer(P);
    cls();
    out(at(9, 1) + YEL + center('KA-CHEEP.  The trunk goes dead.', W));
    out(at(11, 1) + BLK + center(npa + '-' + nxx + ' runs on an ESS. It heard the 2600 Hz and logged your line.', W));
    out(at(12, 1) + RED + center('Heat +12.', W));
    anyKey(15);
    return false;
}

function scan(npa, nxx, lines, through) {
    var prof = exchangeProfile(SEASON.seed, npa, nxx);
    var heatPer = (prof ? PROFILES[prof].heat : 0.02) * (through ? 0.5 : 1);
    var excl = hasGear(P, 'excl');
    var bits = excl ? scanBits(P, npa + nxx) : null;
    var speed = modemOf(P).speed;
    var log = [];
    var count = { Dialed: 0, Busy: 0, Voice: 0, Ringout: 0, Timeout: 0, Tone: 0, Carrier: 0 };
    var skipped = 0;
    var LOG_TOP = 3, LOG_ROWS = H - 5, LOG_W = 52;
    var hundred = -1;
    var cells = {};
    cls();
    titleBar('CARRiER ' + VERSION + '  ::  Scanning 1-' + npa + '-' + nxx + '-' + LAST.mask + '   ' + (npaCity(npa) || '') +
        (through ? (through.kind === 'blue' ? '   on a blue box' : '   via code ' + through.c) : ''));
    out(box(3, 56, 24, 10, BLK, 'Results'));
    out(at(H, 2) + DIM + 'Space next  P pause  Esc stop' + BLK);

    var drawLog = function () {
        var s = '';
        for (var i = 0; i < LOG_ROWS; i++) {
            var l = log[log.length - LOG_ROWS + i];
            s += at(LOG_TOP + i, 2) + (l ? l.color + fit(l.text, LOG_W) : repeat(' ', LOG_W));
        }
        out(s + BLK);
    };
    var drawStats = function () {
        var keys = Object.keys(count);
        var s = '';
        for (var i = 0; i < keys.length; i++) {
            var col = keys[i] === 'Carrier' ? GRN : keys[i] === 'Tone' ? YEL : BLK;
            s += at(4 + i, 58) + BLK + fit(keys[i], 10) + col + padStart(String(count[keys[i]]), 10);
        }
        s += at(4 + keys.length, 58) + DIM + fit('Minutes', 10) + (P.min < 0 ? RED : BRT) + padStart(String(P.min), 10);
        s += at(13, 57) + BLK + 'Heat ' + heatBar(P.heat, 17);
        out(s + BLK);
    };
    var drawMap = function (h, cur) {
        var s = at(14, 57) + DIM + 'Lines ' + padStart(String(h * 100), 4).replace(/ /g, '0') + '-' +
            padStart(String(h * 100 + 99), 4).replace(/ /g, '0');
        for (var y = 0; y < 10 && 15 + y <= H; y++) {
            s += at(15 + y, 59);
            for (var x = 0; x < 10; x++) {
                var n = y * 10 + x;
                var cl = cells[n];
                var ch = n === cur ? BRT + '▒' : !cl ? DIM + '·' : cl === 'CARRIER' ? GRN + '█' : cl === 'TONE' ? YEL + '▓' : '\x1b[0;34;40m░';
                s += ch + ' ';
            }
        }
        out(s + BLK);
    };

    drawLog();
    drawStats();
    var stopped = '';
    var sinceSave = 0;
    for (var i = 0; i < lines.length && !stopped; i++) {
        var line = lines[i];
        var lineNo = parseInt(line, 10);
        var h = Math.floor(lineNo / 100);
        if (h !== hundred) {
            hundred = h;
            cells = {};
        }
        drawMap(h, lineNo % 100);
        var num = npa + nxx + line;
        if (excl && (P.found[num] || bits[Math.floor(lineNo / 10)])) {
            //  the exclusion list: already known, so not dialed again
            skipped++;
            if (lineNo % 10 === 9) {
                markScanned(P, npa + nxx, Math.floor(lineNo / 10));
            }
            continue;
        }
        var mult = 1;
        if (through) {
            P.dials += 1;
        } else {
            mult = chargeCall(P, npa);
        }
        addHeat(P, heatPer * mult);
        var res = lineFor(SEASON.seed, npa, nxx, line, P.gear);
        var r = res.result;
        var stamp = v3.util.date('15:04:05');
        var text = stamp + '  ' + nxx + '-' + line + '  ' + (r === 'CARRIER' ? '** CARRIER **' : r === 'TONE' ? '** TONE **' : r) +
            (res.quiet ? (r === 'CARRIER' ? ' (nudged)' : ' (late)') : '');
        count.Dialed++;
        if (r === 'CARRIER') count.Carrier++;
        else if (r === 'TONE') count.Tone++;
        else if (r === 'BUSY') count.Busy++;
        else if (r === 'VOICE') count.Voice++;
        else if (r === 'RINGOUT') count.Ringout++;
        else if (r === 'TIMEOUT') count.Timeout++;
        if ((r === 'CARRIER' || r === 'TONE') && !P.found[num]) {
            P.found[num] = r === 'CARRIER' ? 'C?' : 'T?';
            text += '  new';
        }
        cells[lineNo % 100] = r;
        log.push({ color: RESULT_COLOR[r] || BLK, text: text });
        if (log.length > 200) log.shift();
        drawLog();
        drawStats();
        if (lineNo % 10 === 9) {
            markScanned(P, npa + nxx, Math.floor(lineNo / 10));
        }
        if (++sinceSave >= 25) {
            savePlayer(P);
            sinceSave = 0;
        }
        if (bustRoll(P, 'dial')) {
            stopped = 'bust';
            break;
        }
        var k = pause(Math.round((RESULT_WAIT[r] || 300) * speed));
        var n = keyName(k);
        var ch = keyChar(k).toLowerCase();
        if (n === 'escape') {
            stopped = 'esc';
        } else if (ch === 'p') {
            out(at(H, 2) + YEL + fit('Paused. Any key goes on.', 40) + BLK);
            key();
            out(at(H, 2) + DIM + fit('Space next  P pause  Esc stop', 40) + BLK);
        }
    }
    drawMap(hundred, -1);
    savePlayer(P);
    if (stopped === 'bust') {
        busted('scanning ' + npa + '-' + nxx);
        return;
    }
    if (through && through.kind !== 'blue' && through.burned) {
        out(at(H - 1, 2) + YEL + fit('Code ' + through.c + ' is dead now: used up, or the phone company caught on.', 54) + BLK);
    }
    out(at(H, 2) + BRT + fit((stopped ? 'Stopped. ' : 'Scan done. ') + count.Carrier + ' carriers, ' + count.Tone + (count.Tone === 1 ? ' tone' : ' tones') +
        (skipped ? ', ' + skipped + ' skipped' : '') + '. Any key.', 54) + BLK);
    key();
}

//  ---- busted ----

function busted(where) {
    var hours = bust(P, where);
    savePlayer(P);
    cls();
    var lines = [
        RED + 'KNOCK  KNOCK  KNOCK',
        '',
        BLK + 'Two men in suits are at the front door. One of them says "Telephone',
        BLK + 'company security". The other one is holding a printout of every',
        BLK + 'number your line called this week.',
        '',
        BLK + 'Your parents unplug the modem and take it to their room.',
        '',
        YEL + 'BUSTED.  Grounded for ' + hours + ' hours: you get it back at ' + clock(P.grounded) + '.',
        '',
        DIM + 'Your rank, rep and finds are safe. Today\'s minutes went with the modem.',
    ];
    for (var i = 0; i < lines.length; i++) {
        out(at(6 + i, 1) + center(lines[i], W));
    }
    anyKey(H - 1);
}

//  ---- the found list ----

function foundList() {
    var nums = Object.keys(P.found).sort();
    var top = 0, sel = 0;
    var ROWS = H - 6;
    for (;;) {
        cls();
        titleBar('CARRiER ' + VERSION + '  ::  FOUND.DAT   ' + nums.length + ' entries');
        if (!nums.length) {
            out(at(5, 3) + BLK + 'Nothing yet. Scan an exchange and the carriers and tones land here.');
            anyKey(8);
            return;
        }
        out(at(3, 3) + DIM + fit('Number', 18) + fit('What', 21) + fit('You', 17) + 'First found by' + BLK);
        if (sel < top) top = sel;
        if (sel >= top + ROWS) top = sel - ROWS + 1;
        for (var i = 0; i < ROWS && top + i < nums.length; i++) {
            var num = nums[top + i];
            var k = P.found[num];
            var what = k === 'C?' ? 'CARRIER (not dialed)' : k === 'T?' ? 'TONE (not dialed)' : KIND_NAMES[k] || k;
            var own = P.owned[num] === 'p' ? 'privileged' : P.owned[num] === 'u' ? 'logged in' : '';
            if (P.loot[num]) own += own ? ' +loot' : 'loot';
            var first = k.charAt(1) === '?' ? '' : firstFinder(num);
            var col = i + top === sel ? BARHI : (k.charAt(1) === '?' ? DIM : k === 'fax' || k === 'bbs' ? BLK : GRN);
            out(at(4 + i, 2) + col + ' ' + fit(fmtNum(num), 18) + fit(what, 21) + fit(own, 17) + fit(first, 21) + BLK);
        }
        out(at(H, 2) + DIM + 'Enter dial  Up/Down/PgUp/PgDn  Esc back' + BLK);
        var kk = key();
        var n = keyName(kk);
        if (n === 'escape') return;
        if (n === 'up' && sel > 0) sel--;
        else if (n === 'down' && sel < nums.length - 1) sel++;
        else if (n === 'page up') sel = Math.max(0, sel - ROWS);
        else if (n === 'page down') sel = Math.min(nums.length - 1, sel + ROWS);
        else if (n === 'home') sel = 0;
        else if (n === 'end') sel = nums.length - 1;
        else if (n === 'return') {
            if (/^NUA/.test(nums[sel])) {
                out(at(H, 2) + YEL + fit('That one lives on Telenet: dial a Telenet PAD and C ' + nums[sel].slice(3) + '.', 76) + BLK);
                key(3000);
            } else if (/^TYM/.test(nums[sel])) {
                out(at(H, 2) + YEL + fit('That one lives on Tymnet: dial a Tymnet PAD and log in to host ' + nums[sel].slice(3) + '.', 76) + BLK);
                key(3000);
            } else if (isGrounded(P)) {
                grounded();
            } else {
                var route = chooseRoute(nums[sel]);
                if (route !== null) {
                    for (var nx = cotTerm(nums[sel], route); nx; nx = cotTerm(nx.num, nx.via)) {
                        savePlayer(P);
                    }
                }
                savePlayer(P);
                nums = Object.keys(P.found).sort();
            }
        }
    }
}

//  ---- the exchange map ----

function mapScreen() {
    cls();
    titleBar('CARRiER ' + VERSION + '  ::  Exchange map');
    out(at(4, 3) + BLK + 'Area code: ' + at(5, 3) + 'Exchange:  ');
    var npa = field(4, 14, 3, LAST.npa || P.home, /[0-9]/, BRT);
    if (npa === null || npa.length !== 3) return;
    var nxx = field(5, 14, 3, LAST.nxx, /[0-9]/, BRT);
    if (nxx === null || nxx.length !== 3) return;
    var bits = scanBits(P, npa + nxx);
    cls();
    titleBar('CARRiER ' + VERSION + '  ::  Map of 1-' + npa + '-' + nxx + '-XXXX   ' + (npaCity(npa) || ''));
    var c = 0, t = 0, scanned = 0;
    var s = '';
    for (var row = 0; row < 20; row++) {
        s += at(3 + row, 2) + DIM + padStart(String(row * 500), 4).replace(/ /g, '0') + ' ';
        for (var col = 0; col < 50; col++) {
            var block = row * 50 + col;
            if (!bits[block]) {
                s += DIM + '·';
                continue;
            }
            scanned++;
            var best = '';
            for (var d = 0; d < 10; d++) {
                var ln = padStart(String(block * 10 + d), 4).replace(/ /g, '0');
                var r = lineResult(SEASON.seed, npa, nxx, ln).result;
                if (r === 'CARRIER') { best = 'C'; c++; }
                else if (r === 'TONE') { if (best !== 'C') best = 'T'; t++; }
            }
            s += best === 'C' ? GRN + '█' : best === 'T' ? YEL + '▓' : '\x1b[0;34;40m░';
        }
    }
    out(s + BLK);
    out(at(3, 60) + BRT + 'Legend' + at(5, 60) + GRN + '█' + BLK + ' carrier' + at(6, 60) + YEL + '▓' + BLK + ' tone' +
        at(7, 60) + '\x1b[0;34;40m░' + BLK + ' nothing' + at(8, 60) + DIM + '·' + BLK + ' not scanned' +
        at(10, 60) + BLK + 'Each mark is ten' + at(11, 60) + 'numbers.' +
        at(13, 60) + BLK + 'Scanned  ' + BRT + (scanned * 10) + at(14, 60) + BLK + 'Carriers ' + GRN + c + at(15, 60) + BLK + 'Tones    ' + YEL + t + BLK);
    anyKey(H);
}

//  ---- the notebook ----

function notebook(kind) {
    var n = notesFor(P);
    var list = n.have.slice().sort(function (a, b) {
        return (b.kind === kind) - (a.kind === kind) || rankRep(a.rank) - rankRep(b.rank);
    });
    var top = 2, left = 8, w = 64;
    var bodyRows = H - 6;
    //  each note is a block of lines; pages hold as many whole blocks as fit
    var blocks = [];
    if (kind && !list.some(function (x) { return x.kind === kind; })) {
        blocks.push([NOTEHI + fit(' > Nothing in here about ' + (KIND_NAMES[kind] || kind) + '. Not yet.', w), NOTE + fit('', w)]);
    }
    list.forEach(function (note) {
        var mine = note.kind === kind;
        var lines = wrap(note.text.replace(/CoT-TERM/g, TERM), w - 6);
        var b = [(mine ? NOTEHI : NOTE) + fit((mine ? ' > ' : '   ') + lines[0], w)];
        for (var j = 1; j < lines.length; j++) {
            b.push(NOTE + fit('   ' + lines[j], w));
        }
        var where = '     read: ' + note.file + '  in  ' + noteWhere(note);
        if (where.length <= w) {
            b.push(NOTE + fit(where, w));
        } else {
            b.push(NOTE + fit('     read: ' + note.file, w), NOTE + fit('       in: ' + noteWhere(note), w));
        }
        blocks.push(b);
    });
    var foot = n.stuck ? '   ' + n.stuck + ' more pages are stuck together. Rank up to free them.' : '   No pages left stuck together.';
    blocks.push([NOTE + fit('', w), NOTE + fit(foot, w),
        NOTE + fit(n.zines ? '   ' + n.zines + ' more pages are in zines. The Hack Shack sells them.' : '   You have every zine page.', w)]);
    var pages = [[]];
    blocks.forEach(function (b) {
        var cur = pages[pages.length - 1];
        if (cur.length && cur.length + b.length > bodyRows) {
            pages.push(cur = []);
        }
        Array.prototype.push.apply(cur, b);
    });
    var owner = 'property of ' + P.h + '  ';
    for (var pg = 0; pg < pages.length; ) {
        var s = NOTE + at(top, left) + '  NOTEBOOK' + repeat(' ', Math.max(1, w - 10 - owner.length)) + owner;
        s += at(top + 1, left) + '\x1b[0;31;43m' + repeat('─', w);
        for (var r = 0; r < bodyRows; r++) {
            s += at(top + 2 + r, left) + (pages[pg][r] || NOTE + fit('', w));
        }
        var foot = pages.length > 1 ? 'page ' + (pg + 1) + ' of ' + pages.length + '   ' : '';
        s += at(top + 2 + bodyRows, left) + NOTE + fit('   ' + foot + (pg < pages.length - 1 ? 'Space turns the page  ' : '') + 'Esc closes', w);
        out(s + BLK);
        var k = key();
        var kn = keyName(k);
        if (kn === 'escape') break;
        if (kn === 'page up' || kn === 'left') {
            pg = Math.max(0, pg - 1);
        } else if (pg < pages.length - 1) {
            pg++;
        } else {
            break;
        }
    }
}

//  ---- the Scene Daily ----

function sceneDaily(onlyNew) {
    var items = readNews(H - 7);
    var fresh = items.filter(function (x) { return x.t > (P.seenNews || 0) && x.h !== P.h; });
    if (onlyNew && !fresh.length) {
        return;
    }
    cls();
    out(at(2, 1) + BRT + center('T H E   S C E N E   D A I L Y', W));
    out(at(3, 1) + DIM + center('all the news that\'s fit to print, and some that isn\'t  ·  ' + v3.util.date('Jan 2') + ', 1993', W));
    out(at(4, 3) + rule(W - 4, '═'));
    if (!items.length) {
        out(at(6, 3) + BLK + 'Quiet out there. Go make some news.');
    }
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var d = new Date(it.t);
        var when = (d.getMonth() + 1) + '/' + d.getDate();
        var isNew = it.t > (P.seenNews || 0);
        out(at(6 + i, 3) + (isNew ? YEL + '* ' : '  ') + DIM + fit(when, 6) + BCYN + it.h + BLK + ' ' + fit(it.m, W - 14 - it.h.length));
    }
    if (items.length) {
        P.seenNews = Math.max(P.seenNews || 0, items[0].t);
    }
    anyKey(H);
}

//  ---- rankings ----

function rankings() {
    var all = leaders();
    cls();
    titleBar('CARRiER ' + VERSION + '  ::  Rankings, season ' + SEASON.id);
    out(at(3, 3) + DIM + fit('#', 4) + fit('Handle', 20) + fit('Rank', 10) + padStart('Rep', 7) + padStart('Finds', 8) +
        padStart('Firsts', 8) + padStart('Owned', 8) + padStart('Busts', 7) + BLK);
    var me = -1;
    for (var i = 0; i < all.length; i++) {
        if (all[i].h === P.h) me = i;
    }
    var show = Math.min(all.length, H - 7);
    for (var j = 0; j < show; j++) {
        var x = all[j];
        var col = j === me ? YEL : j === 0 ? BRT : BLK;
        out(at(4 + j, 3) + col + fit(String(j + 1), 4) + fit(x.h, 20) + fit(x.rank, 10) + padStart(String(x.rep), 7) +
            padStart(String(x.finds), 8) + padStart(String(x.firsts), 8) + padStart(String(x.owned), 8) + padStart(String(x.busts), 7) + BLK);
    }
    if (me >= show) {
        out(at(H - 2, 3) + YEL + 'You: #' + (me + 1) + ', ' + all[me].rep + ' rep' + BLK);
    }
    out(at(H, 1) + DIM + center(BRT + 'H' + DIM + ' Hall of Fame   any other key returns', W) + BLK);
    if (keyChar(key()).toLowerCase() === 'h') {
        hallScreen();
    }
}

function hallScreen() {
    cls();
    titleBar('CARRiER ' + VERSION + '  ::  Hall of Fame');
    var hof = hallOfFame();
    if (!hof.length) {
        out(at(4, 3) + BLK + 'No season has ended yet. This is season ' + SEASON.id + ', started ' + SEASON.started + '.');
        out(at(6, 3) + DIM + 'A season ends after ' + SEASON_DAYS + ' days, or the day someone cracks the phone company\'s');
        out(at(7, 3) + DIM + 'Switching Control Center. The login to it comes from the season\'s last raid.' + BLK);
        anyKey(H);
        return;
    }
    var row = 3;
    hof.forEach(function (x) {
        if (row > H - 4) return;
        out(at(row++, 3) + YEL + 'Season ' + x.id + DIM + '  ' + x.started + ' to ' + x.ended + BLK);
        out(at(row++, 5) + BLK + fit('Top of the board', 18) + BRT + (x.top || '-') + BLK);
        out(at(row++, 5) + BLK + fit('Cracked the SCC', 18) + (x.boss ? GRN + x.boss : DIM + 'nobody') + BLK);
        (x.raids || []).slice(0, 4).forEach(function (r) {
            out(at(row++, 5) + DIM + fit('Raid', 18) + BLK + r + BLK);
        });
        row++;
    });
    anyKey(H);
}

//  ---- seasons, mail and raid rewards ----

function seasonNotice() {
    cls();
    var lines = [
        YEL + 'S E A S O N   ' + SEASON.id,
        '',
        BLK + 'The phone company changed everything while you were away. Every',
        BLK + 'exchange is new. Your finds, codes and rep are history: see the Hall of Fame.',
        '',
        BLK + 'You kept your rank title, your badges, your gear and your cash.',
        DIM + 'The Scene Daily has word on where to start.',
    ];
    for (var i = 0; i < lines.length; i++) {
        out(at(7 + i, 1) + center(lines[i], W));
    }
    anyKey(H - 2);
}

function mailNotice(notes) {
    cls();
    out(at(5, 1) + YEL + center('WHILE YOU WERE AWAY', W));
    notes.slice(0, 12).forEach(function (n, i) {
        out(at(8 + i, 1) + BLK + center(n, W));
    });
    anyKey(H - 2);
}

function raidRewards(list) {
    cls();
    out(at(4, 1) + YEL + center('R A I D', W));
    var row = 7;
    list.forEach(function (g) {
        out(at(row++, 1) + BRT + center(g.raid.name + ' went down.', W));
        out(at(row++, 1) + BLK + center('You brought ' + g.pieces + ' piece' + (g.pieces > 1 ? 's' : '') + ': +' + g.rep + ' rep, +$' + g.cash + (g.mvp ? '. You did the most.' : '.'), W));
        if (g.raid.boss && P.bossLogin) {
            out(at(row++, 1) + GRN + center('The SCC login is yours: ' + P.bossLogin[0] + ' / ' + P.bossLogin[1] + '.', W));
            out(at(row++, 1) + DIM + center('Find its number (the Scene Daily says which exchange) and get there first.', W));
        }
        row++;
    });
    anyKey(H - 2);
}

//  ---- raids and rivals ----

function raidsScreen() {
    for (;;) {
        var i = openRaid(SEASON);
        cls();
        titleBar('CARRiER ' + VERSION + '  ::  Raids, season ' + SEASON.id + '   $' + (P.cash || 0));
        var row = 3;
        for (var j = 0; j < RAIDS_PER_SEASON; j++) {
            var rj = raidAt(SEASON.seed, j);
            var sj = raidState(SEASON, j);
            out(at(row++, 3) + (sj.done ? GRN + '■ ' : j === i ? YEL + '■ ' : DIM + '· ') + fit(rj.name, 22) +
                (sj.done ? DIM + 'done ' + sj.done.at.slice(5) + ', ringleader ' + sj.done.mvp : j === i ? BLK + 'open now' : DIM + 'not yet') + BLK);
        }
        row++;
        var acts = [];
        if (i < 0) {
            out(at(row++, 3) + BLK + 'Every raid this season is done.' + (SEASON.bossDown ? ' ' + SEASON.bossDown + ' cracked the SCC.' : ''));
            if (P.bossLogin && !SEASON.bossDown) {
                out(at(row++, 3) + GRN + 'Your SCC login: ' + P.bossLogin[0] + ' / ' + P.bossLogin[1] + '. The first one in wins the season.' + BLK);
            }
        } else {
            var raid = raidAt(SEASON.seed, i);
            var st = raidState(SEASON, i);
            out(at(row++, 3) + BRT + raid.name + BLK + ': ' + raid.what + '.');
            if (raid.boss) {
                out(at(row++, 3) + DIM + 'Everyone who helps gets the login. Then it\'s a race.' + BLK);
            }
            row++;
            var have = !!P.found[raid.num];
            var ware = (P.wares || []).filter(function (w) { return w.what === raid.ware; })[0];
            out(at(row++, 5) + (st.dial ? GRN + '■ ' : DIM + '· ') + BLK + fit('The dial-in', 16) + (st.dial ? GRN + 'brought by ' + st.dial :
                DIM + 'it\'s a carrier somewhere in 1-' + raid.npa + '-' + raid.nxx + '-XXXX') + BLK);
            out(at(row++, 5) + (st.acct ? GRN + '■ ' : DIM + '· ') + BLK + fit('An account', 16) + (st.acct ? GRN + 'brought by ' + st.acct :
                DIM + 'it needs ' + raid.ware + ' from any system') + BLK);
            out(at(row++, 5) + (st.codes >= raid.codes ? GRN + '■ ' : DIM + '· ') + BLK + fit('Barrier codes', 16) +
                (st.codes >= raid.codes ? GRN : YEL) + st.codes + ' of ' + raid.codes + BLK);
            row++;
            var who = Object.keys(st.by);
            out(at(row++, 3) + DIM + 'In on it: ' + BLK + (who.length ? who.map(function (h) { return h + ' (' + st.by[h] + ')'; }).join(', ') : 'nobody yet'));
            if (!st.dial && have) acts.push(BRT + 'D' + BLK + ' bring the dial-in');
            if (!st.acct && ware) acts.push(BRT + 'A' + BLK + ' bring ' + raid.ware);
            if (st.codes < raid.codes && (P.codes || []).length) acts.push(BRT + 'C' + BLK + ' give a code');
        }
        acts.push(BRT + 'R' + BLK + ' rivals', BRT + 'Esc' + BLK + ' returns');
        out(at(H, 1) + center(acts.join('   '), W));
        var rk = key();
        if (keyName(rk) === 'escape') {
            return;
        }
        var ch = keyChar(rk).toLowerCase();
        var raidNow = i >= 0 ? raidAt(SEASON.seed, i) : null;
        var stNow = i >= 0 ? raidState(SEASON, i) : null;
        if (ch === 'r') {
            rivalsScreen();
            continue;
        }
        if (!raidNow) {
            return;
        }
        if (ch === 'd' && !stNow.dial && P.found[raidNow.num]) {
            contribute(P, SEASON, i, 'dial');
        } else if (ch === 'a' && !stNow.acct) {
            var wi = -1;
            (P.wares || []).forEach(function (w, k) { if (wi < 0 && w.what === raidNow.ware) wi = k; });
            if (wi < 0) continue;
            P.wares.splice(wi, 1);
            contribute(P, SEASON, i, 'acct');
        } else if (ch === 'c' && stNow.codes < raidNow.codes && (P.codes || []).length) {
            P.codes.shift();
            contribute(P, SEASON, i, 'code');
        } else {
            continue;
        }
        if (raidComplete(P, SEASON, i)) {
            var got = claimRaids(P, SEASON);
            savePlayer(P);
            if (got.length) raidRewards(got);
        }
        savePlayer(P);
    }
}

function rivalsScreen() {
    var all = leaders().filter(function (x) { return x.h !== P.h; });
    cls();
    titleBar('CARRiER ' + VERSION + '  ::  Rivals   $' + (P.cash || 0));
    if (!all.length) {
        out(at(4, 3) + BLK + 'Nobody else is playing yet. Rivals need rivals.');
        anyKey(8);
        return;
    }
    out(at(3, 3) + DIM + 'Pick someone. A tip to the phone company costs $' + TIP_COST + ' and puts heat on them; three times in ten');
    out(at(4, 3) + DIM + 'it comes back on you. A code you give lands in their pocket next time they play.' + BLK);
    var items = all.slice(0, 12).map(function (x) {
        return { label: fit(x.h, 18) + fit(x.rank, 9) + padStart(String(x.rep), 6) + ' rep', id: x };
    });
    out(box(6, 18, 44, items.length + 2, BLUE, 'Who?'));
    var who = lightbarNoHot(items, 7, 19, 42, 0);
    if (!who) return;
    out(at(H, 1) + center(BRT + 'T' + BLK + ' tip off the phone company   ' + BRT + 'G' + BLK + ' give a code   ' + BRT + 'Esc' + BLK + ' never mind', W));
    var ch = keyChar(key()).toLowerCase();
    var msg = ch === 't' ? tipOff(P, who.id, who.h) : ch === 'g' ? giveCode(P, who.id, who.h) : '';
    if (msg) {
        savePlayer(P);
        out(at(H - 2, 1) + YEL + center(msg, W) + BLK);
        key(3000);
    }
}

function you() {
    cls();
    titleBar('CARRiER ' + VERSION + '  ::  ' + P.h);
    var next = nextRank(P);
    var modem = modemOf(P);
    var rows = [
        ['Your line', fmtNum(P.phone) + '  (' + npaCity(P.home) + ')'],
        ['Rank', rankOf(P) + (next ? '  (' + next.name + ' at ' + next.rep + ' rep)' : '  (the top)')],
        ['Rep', String(P.rep)],
        ['Minutes', P.min < 0 ? 'phone bill: ' + (-P.min) + ' over' : P.min + ' (refills ' + FREE_MINUTES + ' a day, keeps up to ' + BANK_CAP + ')'],
        ['Heat', Math.round(P.heat) + '%  (cools ' + HEAT_DECAY + '% an hour)'],
        ['Modem', modem.name],
        ['Cash', '$' + (P.cash || 0) + '  (' + (P.wares || []).length + ' thing' + ((P.wares || []).length === 1 ? '' : 's') + ' to sell at the Hack Shack)'],
        ['Codes', (P.codes || []).length + ' in your pocket, ' + (P.stash || []).length + ' stashed' +
            (P.vmb ? ' in box ' + P.vmb.box + ' at ' + fmtNum(P.vmb.num) : '')],
        ['Found', Object.keys(P.found).length + ' numbers, ' + (P.firsts || 0) + ' found first'],
        ['Logged into', Object.keys(P.owned).length + ' systems'],
        ['Busts', (P.busts || []).length + ' this week' + (isGrounded(P) ? ', grounded until ' + clock(P.grounded) : '')],
    ];
    for (var i = 0; i < rows.length; i++) {
        out(at(3 + i * 2 - (i > 5 ? i - 5 : 0), 5) + DIM + fit(rows[i][0], 14) + BRT + rows[i][1] + BLK);
    }
    out(at(3 + 4 * 2, 46) + heatBar(P.heat, 20));
    if (next && next.test) {
        var done = next.test.done(P);
        out(at(H - 4, 5) + DIM + fit('Rank test', 14) + BRT + next.test.who + (done ? GRN + '  (done)' : '') + BLK);
        out(at(H - 3, 19) + (done ? GRN : YEL) + fit(next.test.job, W - 20) + BLK);
    }
    var earned = Object.keys(P.badges || {}).length;
    out(at(H, 1) + DIM + center(BRT + 'B' + DIM + ' badges (' + earned + ' of ' + BADGES.length + ')   any other key returns', W) + BLK);
    if (keyChar(key()).toLowerCase() === 'b') {
        badgeWall();
    }
}

//  ---- badges ----

function badgeWall() {
    var half = Math.ceil(BADGES.length / 2);
    for (var pg = 0; pg < 2; pg++) {
        cls();
        titleBar('CARRiER ' + VERSION + '  ::  Badges, ' + Object.keys(P.badges || {}).length + ' of ' + BADGES.length + '   (kept from season to season)');
        BADGES.slice(pg * half, pg * half + half).forEach(function (b, i) {
            var when = (P.badges || {})[b.id];
            out(at(3 + i * 1.5 | 0, 3) + (when ? YEL + '■ ' + BRT : DIM + '■ ') + fit(b.name, 22) + (when ? BLK : DIM) + fit(b.about, 46) + ' ' +
                (when ? DIM + when.slice(5) : b.cash ? DIM + '$' + b.cash : '') + BLK);
        });
        out(at(H, 1) + DIM + center(pg === 0 ? 'any key: more badges   Esc returns' : 'any key returns', W) + BLK);
        if (keyName(key()) === 'escape') {
            return;
        }
    }
}

function badgeNotice(list) {
    var PER = 12;
    for (var i = 0; i < list.length; i += PER) {
        cls();
        out(at(4, 1) + YEL + center(list.length > 1 ? 'B A D G E S' : 'B A D G E', W));
        list.slice(i, i + PER).forEach(function (b, j) {
            out(at(7 + j, 8) + YEL + '■ ' + BRT + fit(b.name, 22) + DIM + fit(b.about, 40) + GRN + (b.cash ? '+$' + b.cash : '') + BLK);
        });
        out(at(H - 3, 1) + BLK + center('The Scene Daily has it. Your badges are on the You screen.', W));
        anyKey(H - 1, i + PER < list.length ? 'press a key for more' : 'press a key');
    }
}

//  ---- gear and tools ----

function gearScreen() {
    for (;;) {
        cls();
        titleBar('CARRiER ' + VERSION + '  ::  Gear and tools   $' + (P.cash || 0));
        var g = P.gear || {};
        var row = 3;
        out(at(row++, 3) + BRT + 'What you have' + BLK);
        var owned = GEAR.filter(function (x) { return g[x.id]; });
        if (!owned.length) {
            out(at(row++, 5) + DIM + 'Nothing yet. The Hack Shack is on your found list.' + BLK);
        }
        owned.forEach(function (x) {
            out(at(row++, 5) + GRN + fit(x.name + (x.durable ? '' : '  x' + g[x.id]), 30) + DIM + fit(x.about, 44) + BLK);
        });
        var zines = ZINES.filter(function (x) { return g[x.id]; });
        if (zines.length) {
            out(at(row++, 5) + CYN + 'Zines: ' + zines.map(function (x) { return x.name; }).join(', ') + BLK);
        }
        row++;
        var jobs = P.jobs || [];
        if (jobs.length || Object.keys(P.cracked || {}).length) {
            out(at(row++, 3) + BRT + 'Crack' + BLK);
            jobs.forEach(function (j) {
                out(at(row++, 5) + YEL + 'running on ' + fmtNum(j.num) + ', done at ' + clock(j.done) + BLK);
            });
            Object.keys(P.cracked || {}).slice(0, 5).forEach(function (n) {
                out(at(row++, 5) + BLK + fit(fmtNum(n), 20) + P.cracked[n].map(function (a) { return a[0] + '/' + a[1]; }).join('  ') + BLK);
            });
        }
        var acts = [];
        if (g.beige) acts.push(BRT + 'B' + BLK + ' clip on a beige box (heat -40)');
        if (g.crack) acts.push(BRT + 'C' + BLK + ' run Crack on a passwd file');
        acts.push(BRT + 'Esc' + BLK + ' returns');
        out(at(H, 1) + center(acts.join('   '), W));
        var k = key();
        var ch = keyChar(k).toLowerCase();
        if (keyName(k) === 'escape' || (!g.beige && !g.crack)) {
            return;
        }
        if (ch === 'b' && g.beige) {
            useGear(P, 'beige');
            P.heat = Math.max(0, P.heat - 40);
            savePlayer(P);
            out(at(H - 2, 1) + GRN + center('Alligator clips on the neighbour\'s line. Tonight it\'s their phone bill. Heat down 40.', W) + BLK);
            key(3000);
        } else if (ch === 'c' && g.crack) {
            crackPick();
        }
    }
}

//  Pick a stolen passwd file to run Crack on
function crackPick() {
    var files = Object.keys(P.loot).filter(function (n) {
        var l = P.loot[n];
        //  a passwd file, a SYSUAF listing or a PRIMOS user list
        return ['unix', 'vms', 'prime'].indexOf(P.found[n]) >= 0 && (l === 1 || String(l).split(',').indexOf('main') >= 0) &&
            (!(P.cracked || {})[n] || crackStale(P, SEASON.seed, n)) && !(P.jobs || []).some(function (j) { return j.num === n; });
    });
    if (!files.length) {
        out(at(H - 2, 1) + YEL + center('Nothing to crack. Steal a passwd file or a VAX\'s SYSUAF list first.', W) + BLK);
        key(3000);
        return;
    }
    var items = files.slice(0, 10).map(function (n) { return { label: fmtNum(n), id: n }; });
    out(box(6, 24, 34, items.length + 2, BLUE, 'Crack which list?'));
    var pickNum = lightbarNoHot(items, 7, 25, 32, 0);
    //  root's password changed since the last run: Crack goes again
    if (pickNum && crackStale(P, SEASON.seed, pickNum) && P.cracked) delete P.cracked[pickNum];
    if (pickNum && startCrack(P, pickNum)) {
        savePlayer(P);
        out(at(H - 2, 1) + GRN + center('Crack 4.1 is grinding through the wordlist. Check back in ' + CRACK_MINUTES + ' minutes.', W) + BLK);
        key(3000);
    }
}

function crackDone(list) {
    cls();
    out(at(4, 1) + YEL + center('CRACK 4.1: DONE', W));
    var row = 7;
    list.forEach(function (r) {
        out(at(row++, 6) + BRT + fmtNum(r.num) + BLK);
        r.accounts.forEach(function (a) {
            out(at(row++, 8) + GRN + fit(a[0], 12) + BLK + a[1]);
        });
        if (r.reused) {
            out(at(row++, 8) + CYN + r.accounts[0][0] + ' uses the same password on ' + fmtNum(r.reused) + '.' + BLK);
            out(at(row++, 8) + CYN + 'That number is on your found list now.' + BLK);
        }
        row++;
    });
    out(at(H - 3, 1) + DIM + center('Log in with them like any other account.', W));
    anyKey(H - 1);
}

function promoted(rank) {
    cls();
    var m = modemOf(P);
    var lines = [
        BRT + 'You made ' + YEL + rank + BRT + '.',
        '',
        BLK + 'Word gets around. The Scene Daily has your name in it.',
        BLK + 'More pages in the notebook came unstuck.',
    ];
    if (m.baud > 2400) {
        lines.push(BLK + 'Somebody owed you one: you\'re on a ' + BRT + m.name + BLK + ' now. Faster scans, faster screens.');
    }
    var nx = nextRank(P);
    if (nx && nx.test) {
        lines.push('', DIM + 'Next: ' + nx.name + ' at ' + nx.rep + ' rep, and ' + nx.test.who + ' wants you to: ' + BLK + nx.test.job);
    }
    var row = 7;
    for (var i = 0; i < lines.length; i++) {
        //  each line keeps its colour code; long ones wrap under it
        var col = lines[i].slice(0, lines[i].indexOf('m') + 1);
        var parts = wrap(lines[i].replace(/\x1b\[[0-9;]*m/g, ''), W - 8);
        for (var j = 0; j < parts.length; j++) {
            out(at(row++, 1) + col + center(parts[j], W));
        }
    }
    anyKey(H - 2);
}

//  ---- CoT-TERM ----

function dialPrompt() {
    cls();
    titleBar(TERM + ' 2.4  ::  Dialing directory');
    out(at(4, 3) + BLK + 'Number to dial, ten digits:  1-');
    var num = field(4, 34, 10, '', /[0-9]/, BRT);
    if (num === null || num.length !== 10) return;
    var route = chooseRoute(num);
    if (route === null) return;
    for (var nx = cotTerm(num, route); nx; nx = cotTerm(nx.num, nx.via)) {
        savePlayer(P);
    }
    savePlayer(P);
}

//  How to place a call, when there's a choice: on a blue box (long
//  distance, if you have one) or a red box (one of the ones you carry).
//  Returns the via for cotTerm, undefined to dial straight, or null to
//  cancel.
function chooseRoute(num) {
    var npa = num.slice(0, 3), nxx = num.slice(3, 6);
    var blue = npa !== P.home && hasGear(P, 'bluebox');
    var red = (P.gear || {}).redbox || 0;
    if (!blue && !red) {
        return undefined;
    }
    out(box(H - 7, 14, 52, 6, BLUE, 'Place the call'));
    out(at(H - 6, 16) + BLUE + fit('Enter  dial from home' + (npa === P.home ? '' : ' (long distance)'), 48));
    if (blue) {
        out(at(H - 5, 16) + BLUE + fit('B      blue box  (' + nxx + ' is ' + switchType(SEASON.seed, npa, nxx) + ')', 48));
    }
    if (red) {
        out(at(H - 4, 16) + BLUE + fit('R      red box at a payphone  (' + red + ' left, no heat)', 48));
    }
    out(at(H - 3, 16) + BLUE + fit('Esc    hang up', 48) + BLK);
    for (;;) {
        var k = key();
        var ch = keyChar(k).toLowerCase();
        if (keyName(k) === 'escape') return null;
        if (keyName(k) === 'return') return undefined;
        if (blue && ch === 'b') {
            return blueBoxOK(npa, nxx) ? { kind: 'blue' } : null;
        }
        if (red && ch === 'r') {
            useGear(P, 'redbox');
            P.redCalls = (P.redCalls || 0) + 1;
            return { kind: 'red' };
        }
    }
}

//  One call in CoT-TERM. num: ten digits; via: the barrier code it's placed
//  through, if any (free, half the heat). Returns the next call to place
//  ({ num, via }, after a DISA dial tone) or null.
function cotTerm(num, via) {
    var MODEM = modemOf(P);
    var next = null;
    var started = Date.now();
    var buf = [];
    var call = { over: false };
    var stung = false;

    var status = function (msg) {
        var secs = Math.floor((Date.now() - started) / 1000);
        var online = padStart(String(Math.floor(secs / 60)), 2).replace(/ /g, '0') + ':' + padStart(String(secs % 60), 2).replace(/ /g, '0');
        var text = msg || (' ' + TERM + ' 2.4 │ Esc menu  F1 notes │ ANSI-BBS │ ' + MODEM.baud + ' N81 │ FDX │ ' + (call.over ? 'Offline' : 'Online ' + online));
        out('\x1b[s' + at(H, 1) + BARHI + fit(text, W - 1) + BLK + '\x1b[u');
    };
    var raw = function (s) {
        buf.push(s);
        if (buf.length > 400) buf.splice(0, 100);
        out(s);
        if (s.indexOf('\x1b[2J') >= 0) {
            out(at(1, 1));
            status();
        }
    };
    var redraw = function () {
        cls();
        out('\x1b[1;' + (H - 1) + 'r');
        status();
        out(at(1, 1));
        var text = buf.join('');
        var i = text.lastIndexOf('\x1b[2J');
        if (i >= 0) text = text.slice(i + 4);
        var lines = text.split('\n');
        out(lines.slice(-(H - 2)).join('\n'));
    };
    //  the host's output, at 2400 baud
    call.out = function (s) {
        var chunk = 8 * MODEM.baud / 2400;
        for (var i = 0; i < s.length; i += chunk) {
            raw(s.slice(i, i + chunk));
            v3.util.sleep(33);
        }
    };
    call.say = function (s) {
        var lines = wrap(s, W - 6);
        for (var i = 0; i < lines.length; i++) {
            raw('\x1b[0;36m' + (i ? '  ' : '[ ') + lines[i] + (i === lines.length - 1 ? ' ]' : '') + BLK + '\r\n');
        }
    };
    call.reward = function (rep, why) {
        raw(GRN + '[ +' + rep + ' rep: ' + why + ' ]' + BLK + '\r\n');
        savePlayer(P); //  a dropped call mustn't lose it
    };
    call.line = function (echo) {
        var v = '';
        status();
        for (;;) {
            //  a shell that takes messages from other players looks for them
            //  every few seconds while it waits
            var k = key(call.poll ? 3000 : 0);
            if (k === '' && call.poll) {
                var msg = call.poll();
                if (msg) {
                    raw(msg);
                    if (echo) out(v);
                }
                continue;
            }
            var n = keyName(k);
            if (n === 'return') {
                raw('\r\n');
                return v;
            }
            if (n === 'backspace') {
                if (v.length) {
                    v = v.slice(0, -1);
                    if (echo) raw('\b \b');
                }
                continue;
            }
            if (k === 'F1' || k === '\x0e') {
                notebook(host ? host.kind : null);
                redraw();
                if (echo) out(v);
                continue;
            }
            if (n === 'escape') {
                status(' ' + TERM + ' 2.4 │ H hang up   N notebook   any other key: back to the call');
                var c = keyChar(key()).toLowerCase();
                status();
                if (c === 'h') {
                    call.over = true;
                    return null;
                }
                if (c === 'n') {
                    notebook(host ? host.kind : null);
                    redraw();
                    if (echo) out(v);
                }
                continue;
            }
            var ch = keyChar(k);
            //  Ctrl/Z and Ctrl/D end what you're typing on VMS and UNIX
            if ((k === '\x1a' || k === '\x04') && v === '') {
                raw((k === '\x1a' ? '^Z' : '^D') + '\r\n');
                return k;
            }
            if (ch && ch >= ' ' && v.length < 60) {
                v += ch;
                if (echo) raw(ch);
            }
        }
    };

    var host = null;
    var heatBefore = P.heat;
    var red = via && via.kind === 'red';
    cls();
    out('\x1b[1;' + (H - 1) + 'r' + at(1, 1));
    status();
    if (via && via.kind === 'blue') {
        raw('\x1b[0;36m[ 2600 Hz... ka-cheep. The trunk is yours. KP 1' + num.slice(0, 3) + ' ' + num.slice(3) + ' ST ]' + BLK + '\r\n');
    } else if (red) {
        raw('\x1b[0;36m[ A payphone outside the 7-Eleven. The red box chirps five quarters into it. ]' + BLK + '\r\n');
    } else if (via) {
        raw('\x1b[0;36m[ through ' + fmtNum(via.disa) + ', barrier code ' + via.c + ' ]' + BLK + '\r\n');
    }
    raw(BLK + 'ATDT1' + num + '\r\n');
    var npa = num.slice(0, 3), nxx = num.slice(3, 6), line = num.slice(6);
    var mult = 1;
    if (via && via.c) {
        P.dials += 1;
        P.disaCalls = (P.disaCalls || 0) + 1;
    } else if (via) {
        P.dials += 1; //  a blue box or a payphone: no minutes
    } else {
        mult = chargeCall(P, npa);
    }
    var prof = exchangeProfile(SEASON.seed, npa, nxx);
    addHeat(P, (prof ? PROFILES[prof].heat : 0.05) * mult * (via ? 2 : 4));
    var res = num === fenceNumber(SEASON.seed, npa) ? { result: 'CARRIER', kind: 'fence' } : lineFor(SEASON.seed, npa, nxx, line, P.gear);
    var wait = 2 + v3.util.random(3);
    for (var s = wait; s > 0; s--) {
        status(' ' + TERM + ' 2.4 │ Dialing 1-' + npa + '-' + nxx + '-' + line + '    Time: ' + s + '    Esc cancels');
        if (keyName(key(1000)) === 'escape') {
            raw('\r\nNO CARRIER\r\n');
            call.over = true;
            status();
            endCall();
            return null;
        }
    }
    var r = res.result;
    if (r === 'CARRIER') {
        host = hostAt(SEASON.seed, num, res.kind, prof);
        //  accounts Crack found here work like any other
        host.accounts = host.accounts.concat((P.cracked || {})[num] || []);
        raw('\r\nCONNECT ' + MODEM.baud + '\r\n');
        var rep = identify(P, num, res.kind);
        if (rep) {
            call.reward(rep, 'new find, ' + KIND_NAMES[res.kind] + (rep >= (FIND_REP[res.kind] || 1) * 3 ? ', first to find it!' : ''));
        }
        if (NOTE_MUTTERS[res.kind]) {
            call.say(NOTE_MUTTERS[res.kind] + '  (F1 opens the notebook)');
        }
        var ctx = { p: P, host: host, seed: SEASON.seed };
        if (res.kind === 'pad') {
            runPAD(ctx, call, function (nua, net) {
                chargeCall(P, P.home);
                var tym = net === 'tymnet';
                var nh = tym ? tymnetHost(SEASON.seed, nua) : nuaHost(SEASON.seed, nua);
                if (!nh) {
                    call.out(tym ? 'host is unavailable\r\n' : '\r\n' + nua + ' ' + ['NOT REACHABLE', 'REJECTING', 'NOT OPERATING'][hash32(nua) % 3] + '\r\n');
                    return;
                }
                call.out(tym ? 'host is online\r\n' : '\r\n' + nua + ' CONNECTED\r\n');
                var rp = identify(P, nh.num, nh.kind);
                if (rp) {
                    call.reward(rp, 'new find on ' + (tym ? 'Tymnet' : 'Telenet') + ', ' + KIND_NAMES[nh.kind]);
                }
                nh.accounts = nh.accounts.concat((P.cracked || {})[nh.num] || []);
                var saved = host;
                host = nh;
                HOST_RUNNERS[nh.kind]({ p: P, host: nh, seed: SEASON.seed }, call);
                host = saved;
                if (!call.over) {
                    call.out(tym ? '\r\n' : '\r\n' + nua + ' DISCONNECTED\r\n');
                }
            });
        } else if (HOST_RUNNERS[res.kind]) {
            HOST_RUNNERS[res.kind](ctx, call);
            stung = !!ctx.stung;
        }
        raw('\r\n' + BLK + 'NO CARRIER\r\n');
    } else if (r === 'TONE' && (res.kind === 'vmb' || res.kind === 'disa')) {
        raw('\r\n');
        host = { num: num, kind: res.kind, prof: prof };
        var tk = identify(P, num, res.kind);
        if (tk) call.reward(tk, 'new find, ' + KIND_NAMES[res.kind]);
        call.say(NOTE_MUTTERS[res.kind] + '  (F1 opens the notebook)');
        if (res.kind === 'vmb') {
            runVMB({ p: P, host: host, seed: SEASON.seed }, call);
        } else {
            next = disaLine(num, call);
        }
        savePlayer(P);
        raw('\r\nNO CARRIER\r\n');
    } else if (r === 'TONE') {
        raw('\r\n');
        var tt = TONE_TEXT[res.kind];
        call.say(tt[0]);
        if (res.kind === 'anac') {
            call.say('"' + P.phone.split('').join(' ') + '"');
        }
        call.say(tt[1]);
        var tr = identify(P, num, res.kind);
        if (tr) call.reward(tr, 'new find, ' + KIND_NAMES[res.kind]);
        raw('\r\nNO CARRIER\r\n');
    } else if (r === 'BUSY') {
        raw('\r\nBUSY\r\n');
    } else if (r === 'VOICE') {
        call.say(pick(Math.random, ['"Hello? ...Hello?"', '"Yeah?"', '"Good afternoon, ' + (prof === 'biz' ? 'how may I direct your call?' : 'who is this?') + '"',
            'An answering machine. "Leave a message at the tone."']));
        raw('\r\nNO CARRIER\r\n');
    } else if (r === 'INTERCEPT') {
        call.say('"We\'re sorry, your call cannot be completed as dialed."');
        raw('\r\nNO CARRIER\r\n');
    } else {
        raw('\r\nNO ANSWER\r\n');
    }
    call.over = true;
    if (red) {
        //  the payphone took the heat, not your house
        P.heat = Math.min(P.heat, heatBefore);
    }
    if (stung || (!red && bustRoll(P, 'act'))) {
        savePlayer(P);
        out('\x1b[r');
        busted(stung ? 'applying to a sting board' : 'on a call to ' + npa + '-' + nxx);
        return null;
    }
    if (next) {
        out('\x1b[r');
        return next;
    }
    endCall();
    return null;

    function endCall() {
        status(' ' + TERM + ' 2.4 │ Offline │ any key returns to CARRiER');
        key();
        out('\x1b[r');
    }
}

//  A DISA line: a second dial tone that wants a barrier code. A code you
//  carry for this line gets a dial tone and a free call; returns the call
//  to place next, or null.
function disaLine(num, call) {
    call.say(TONE_TEXT.disa[0]);
    call.out('Barrier code: ');
    var code = call.line(true);
    if (code === null) {
        return null;
    }
    code = code.replace(/[^0-9]/g, '');
    var mine = (P.codes || []).filter(function (c) { return c.c === code && c.disa === num; })[0];
    if (!mine) {
        var stashed = (P.stash || []).some(function (c) { return c.c === code; });
        call.say(stashed ? 'The code\'s in your voice mailbox, not on you. Get it out first.' : 'A fast busy. Wrong code.');
        addHeat(P, 2);
        return null;
    }
    var used = useCode(P, code);
    call.say('Dial tone. Who are you calling?' + (used.burned ? '' : '  (' + used.uses + ' more use' + (used.uses === 1 ? '' : 's') + ' on this code)'));
    if (used.burned) {
        call.say('You get the feeling this code won\'t work again.');
    }
    call.out('Number: 1-');
    var to = call.line(true);
    if (to === null) {
        return null;
    }
    to = to.replace(/[^0-9]/g, '');
    if (to.length !== 10) {
        call.say('The dial tone gives up on you.');
        return null;
    }
    return { num: to, via: used };
}

//  ---- start ----

function main() {
    if ((v3.console.width || 80) < 80) {
        v3.console.println('|07CARRiER needs an 80-column screen.');
        return;
    }
    H = Math.max(24, Math.min(25, v3.console.height || 24));
    SEASON = currentSeason();
    keepSweep(SEASON.seed);
    P = loadPlayer();
    boot();
    if (!P) {
        P = firstRun();
        if (!P) {
            return;
        }
    }
    upgradePlayer(P, SEASON.seed);
    savePlayer(P);
    var newSeason = P.season && P.season !== SEASON.id;
    if (newSeason) {
        resetForSeason(P, SEASON);
    }
    P.season = SEASON.id;
    settle(P);
    var mail = collectMail(P);
    savePlayer(P);
    if (newSeason) {
        seasonNotice();
    }
    if (mail.length) {
        mailNotice(mail);
    }
    sceneDaily(true);
    mainMenu();
    savePlayer(P);
    cls();
    out(ANSI.showCursor() + BLK + '\r\nC:\\CARRIER>' + '\r\n\r\n');
}

try {
    main();
} finally {
    out('\x1b[r\x1b[0m' + ANSI.showCursor());
}
