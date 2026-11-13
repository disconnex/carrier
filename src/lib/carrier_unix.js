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
            for (var i = from; i <= to; i++) out((cmd === 'n' ? i + '\t' : '') + buf[i - 1] + (cmd === 'l' ? '$' : '') + '\n');
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
