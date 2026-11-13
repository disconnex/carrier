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
