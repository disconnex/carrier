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
