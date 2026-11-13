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
