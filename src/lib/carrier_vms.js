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
