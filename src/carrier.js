//@include lib/cot_ui.js
//@include lib/carrier_net.js
//@include lib/carrier_game.js
//@include lib/carrier_notes.js
//@include lib/carrier_fs.js
//@include lib/carrier_keep.js
//@include lib/carrier_unix.js
//@include lib/carrier_vms.js
//@include lib/carrier_prime.js
//@include lib/carrier_mpe.js
//@include lib/carrier_hosts.js

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
        return P.found[n] === 'unix' && (l === 1 || String(l).split(',').indexOf('main') >= 0) &&
            (!(P.cracked || {})[n] || crackStale(P, SEASON.seed, n)) && !(P.jobs || []).some(function (j) { return j.num === n; });
    });
    if (!files.length) {
        out(at(H - 2, 1) + YEL + center('No passwd files to crack. cat /etc/passwd on a UNIX box first.', W) + BLK);
        key(3000);
        return;
    }
    var items = files.slice(0, 10).map(function (n) { return { label: fmtNum(n), id: n }; });
    out(box(6, 24, 34, items.length + 2, BLUE, 'Crack which passwd?'));
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
            var k = key();
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
