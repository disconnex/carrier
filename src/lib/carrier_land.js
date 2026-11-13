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
